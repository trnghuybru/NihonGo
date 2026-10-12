"""Authorize per-message WAV uploads and expose only verified, owned recordings."""
import struct
import uuid

from sqlalchemy import select

from api_errors import ApiError
from extensions import db
from . import storage
from .conversation import owned_session
from .models import ConversationAudioAsset, ConversationMessage
from .service import parse_id

MAX_DURATION_MS = 180_000
MAX_SIZE_BYTES = 44 + 48000 * 2 * MAX_DURATION_MS // 1000


def allowed_rates(message):
    return (16000, 44100, 48000) if message.speaker == "user" else (24000,)


def public_asset(asset):
    return {"id": asset.id, "mime_type": asset.mime_type, "size_bytes": asset.size_bytes,
            "duration_ms": asset.duration_ms}


def prepare_upload(user_id, session_id, message_id, data):
    session = owned_session(user_id, session_id, lock=True)
    if not session.audio_storage_enabled:
        raise ApiError("Phiên này chưa bật lưu âm thanh.", 403, "audio_storage_disabled")
    if session.status != "active":
        raise ApiError("Phiên này chỉ có thể xem lại.", 409, "session_inactive")
    message = db.session.scalar(select(ConversationMessage).where(
        ConversationMessage.session_id == session.id, ConversationMessage.id == parse_id(message_id)))
    if message is None or message.status != "completed":
        raise ApiError("Không tìm thấy tin nhắn đã lưu.", 404, "message_not_found")
    if message.speaker == "user" and message.input_mode != "voice":
        raise ApiError("Tin nhắn văn bản không có bản thu âm.")
    if (not isinstance(data, dict) or not {"size_bytes", "duration_ms"} <= set(data)
            or set(data) - {"size_bytes", "duration_ms", "sample_rate"}):
        raise ApiError("Thông tin âm thanh không hợp lệ.")
    size, duration = data["size_bytes"], data["duration_ms"]
    rate = data.get("sample_rate", 16000 if message.speaker == "user" else 24000)
    if (type(size) is not int or type(duration) is not int or not 0 < duration <= MAX_DURATION_MS
            or type(rate) is not int or rate not in allowed_rates(message)
            or not 44 < size <= MAX_SIZE_BYTES or (size - 44) % 2
            or abs((size - 44) * 1000 / (rate * 2) - duration) > 1):
        raise ApiError("Âm thanh phải là WAV PCM16 mono, tối đa 3 phút mỗi lượt.")
    identifier = str(uuid.uuid5(uuid.NAMESPACE_URL, f"nihongo-audio:{session.id}:{message.id}"))
    asset = db.session.get(ConversationAudioAsset, identifier)
    if asset:
        if asset.size_bytes != size or asset.duration_ms != duration:
            raise ApiError("Tin nhắn đã có một bản thu khác.", 409, "audio_conflict")
    else:
        asset = ConversationAudioAsset(id=identifier, session_id=session.id, message_id=message.id,
            asset_type="utterance", storage_key=f"sessions/{session.id}/{message.id}.wav",
            mime_type="audio/wav", size_bytes=size, duration_ms=duration, status="uploading")
        db.session.add(asset)
    url = None if asset.status == "ready" else storage.upload_url(asset.storage_key, size)
    db.session.commit()
    return {"asset": public_asset(asset), "upload_url": url, "headers": {"Content-Type": "audio/wav"}}


def owned_asset(user_id, session_id, asset_id, lock=False):
    owned_session(user_id, session_id, lock=lock)
    asset = db.session.scalar(select(ConversationAudioAsset).where(
        ConversationAudioAsset.session_id == parse_id(session_id),
        ConversationAudioAsset.id == parse_id(asset_id)))
    if asset is None:
        raise ApiError("Không tìm thấy bản thu âm.", 404, "audio_not_found")
    return asset


def complete_upload(user_id, session_id, asset_id):
    asset = owned_asset(user_id, session_id, asset_id, lock=True)
    if asset.status == "ready":
        return {"asset": public_asset(asset)}
    metadata, header = storage.inspect_object(asset.storage_key)
    message = db.session.get(ConversationMessage, asset.message_id)
    rate = struct.unpack_from("<I", header, 24)[0] if len(header) == 44 else 0
    expected = (b"RIFF", asset.size_bytes - 8, b"WAVE", b"fmt ", 16, 1, 1,
                rate, rate * 2, 2, 16, b"data", asset.size_bytes - 44)
    if (metadata.get("ContentLength") != asset.size_bytes or metadata.get("ContentType") != "audio/wav"
            or rate not in allowed_rates(message)
            or abs((asset.size_bytes - 44) * 1000 / (max(1, rate) * 2) - asset.duration_ms) > 1
            or len(header) != 44 or struct.unpack("<4sI4s4sIHHIIHH4sI", header) != expected):
        raise ApiError("File âm thanh chưa đầy đủ hoặc sai định dạng.", 400, "audio_invalid")
    asset.status = "ready"
    db.session.commit()
    return {"asset": public_asset(asset)}


def playback(user_id, session_id, asset_id):
    asset = owned_asset(user_id, session_id, asset_id)
    if asset.status != "ready":
        raise ApiError("Bản thu chưa sẵn sàng.", 409, "audio_not_ready")
    return {"url": storage.download_url(asset.storage_key), "expires_in": 300}
