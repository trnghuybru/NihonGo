"""Private, signed audio objects stored on the beta VPS volume."""
import os
import re
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import jwt
from flask import Blueprint, current_app, request, send_file
from sqlalchemy import select

from api_errors import ApiError
from extensions import db
from .models import ConversationAudioAsset


bp = Blueprint("speaking_audio_objects", __name__, url_prefix="/api/speaking-audio")
OBJECT_KEY = re.compile(r"sessions/([0-9a-f-]{36})/([0-9a-f-]{36})\.wav\Z")
MAX_OBJECT_BYTES = 44 + 48000 * 2 * 240


def root():
    value = os.getenv("AUDIO_LOCAL_ROOT", "").strip()
    if not value:
        raise ApiError("Chưa cấu hình kho âm thanh.", 503, "audio_unavailable")
    folder = Path(value)
    folder.mkdir(parents=True, mode=0o700, exist_ok=True)
    if folder.is_symlink() or not folder.is_dir():
        raise ApiError("Kho âm thanh không khả dụng.", 503, "audio_unavailable")
    return folder


def object_path(key):
    if not isinstance(key, str) or not OBJECT_KEY.fullmatch(key):
        raise ApiError("Đường dẫn âm thanh không hợp lệ.", 404, "audio_not_found")
    return root() / key


def signed_url(key, method, seconds, size=None):
    object_path(key)
    claims = {"aud": "speaking-audio-object", "key": key, "method": method,
              "exp": datetime.now(timezone.utc) + timedelta(seconds=seconds)}
    if size is not None:
        claims["size"] = size
    token = jwt.encode(claims, current_app.config["AUTH_SECRET_KEY"], algorithm="HS256")
    base = current_app.config["PUBLIC_BASE_URL"].rstrip("/")
    return f"{base}/api/speaking-audio/{key}?token={quote(token, safe='')}"


def inspect_object(key):
    path = object_path(key)
    try:
        with path.open("rb") as source:
            header = source.read(44)
        return {"ContentLength": path.stat().st_size, "ContentType": "audio/wav"}, header
    except OSError:
        raise ApiError("Chưa tải được bản thu âm.", 503, "audio_unavailable") from None


def delete_session_audio(session_id):
    if not re.fullmatch(r"[0-9a-f-]{36}", str(session_id)):
        raise ApiError("Phiên âm thanh không hợp lệ.", 400, "invalid_request")
    folder = root() / "sessions" / str(session_id)
    try:
        if folder.exists():
            shutil.rmtree(folder)
    except OSError:
        raise ApiError("Chưa xóa được bản thu âm.", 503, "audio_unavailable") from None


@bp.route("/<path:key>", methods=["PUT", "GET"])
def audio_object(key):
    path = object_path(key)
    try:
        claims = jwt.decode(request.args.get("token", ""), current_app.config["AUTH_SECRET_KEY"],
                            algorithms=["HS256"], audience="speaking-audio-object")
        if claims.get("key") != key or claims.get("method") != request.method:
            raise jwt.InvalidTokenError()
    except (jwt.InvalidTokenError, KeyError, TypeError):
        raise ApiError("Liên kết âm thanh không hợp lệ hoặc đã hết hạn.", 403, "audio_token_invalid") from None
    asset = db.session.scalar(select(ConversationAudioAsset).where(ConversationAudioAsset.storage_key == key)
                              .with_for_update() if request.method == "PUT" else
                              select(ConversationAudioAsset).where(ConversationAudioAsset.storage_key == key))
    if asset is None:
        raise ApiError("Không tìm thấy bản thu âm.", 404, "audio_not_found")
    if request.method == "GET":
        if asset.status != "ready" or not path.is_file():
            raise ApiError("Bản thu chưa sẵn sàng.", 409, "audio_not_ready")
        response = send_file(path, mimetype="audio/wav", conditional=True)
    else:
        size = claims.get("size")
        if (asset.status != "uploading" or type(size) is not int or size != asset.size_bytes
                or not 44 < size <= MAX_OBJECT_BYTES or request.content_length != size
                or request.mimetype != "audio/wav"):
            raise ApiError("Bản thu âm không hợp lệ.", 400, "audio_invalid")
        request.max_content_length = MAX_OBJECT_BYTES
        data = request.get_data(cache=False)
        if len(data) != size:
            raise ApiError("Bản thu âm chưa đầy đủ.", 400, "audio_invalid")
        path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".audio-", dir=path.parent)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "wb") as target:
                target.write(data)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        db.session.commit()
        response = current_app.response_class(status=204)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response
