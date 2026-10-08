"""Gemini Live provisioning and client-reported transcripts (no audio retention)."""
import os
from datetime import timedelta

import jwt
import requests
from flask import current_app
from sqlalchemy import select

from api_errors import ApiError
from extensions import db
from .ai import build_scenario_system_prompt, provider_retry_after
from .conversation import owned_session, message_public
from .models import ConversationMessage, utc_now
from .service import parse_id

TOKEN_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens"
DEFAULT_LIVE_MODEL = "gemini-3.8-live"


def latest_message(session_id):
    return db.session.scalar(select(ConversationMessage).where(
        ConversationMessage.session_id == session_id)
        .order_by(ConversationMessage.sequence_number.desc()).limit(1))


def live_token(user_id, session_id):
    session = owned_session(user_id, session_id)
    if session.status != "active":
        raise ApiError("Phiên này chỉ có thể xem lại.", 409, "session_inactive")
    latest = latest_message(session.id)
    if latest and latest.status != "completed":
        raise ApiError("Hãy xử lý lượt hội thoại chưa hoàn tất trước khi kết nối Live.", 409, "turn_unresolved")
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise ApiError("Chưa cấu hình GEMINI_API_KEY trên máy chủ.", 503, "live_unavailable")
    model = os.getenv("GEMINI_LIVE_MODEL", DEFAULT_LIVE_MODEL).removeprefix("models/")
    model = "models/" + model
    now = utc_now()
    setup = {
        "model": model,
        "generationConfig": {"responseModalities": ["AUDIO"],
                             "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {
                                 "voiceName": os.getenv("GEMINI_LIVE_VOICE", "Kore")}}}},
        "systemInstruction": {"parts": [{"text": build_scenario_system_prompt(session.scenario_snapshot)}]},
        "inputAudioTranscription": {}, "outputAudioTranscription": {},
        "realtimeInputConfig": {"automaticActivityDetection": {"disabled": True}},
        "contextWindowCompression": {"slidingWindow": {}},
        "historyConfig": {"initialHistoryInClientContent": True},
    }
    try:
        response = requests.post(TOKEN_URL, headers={"x-goog-api-key": key}, json={
            "uses": 1, "expireTime": (now + timedelta(minutes=30)).isoformat(),
            "newSessionExpireTime": (now + timedelta(minutes=1)).isoformat(),
            # Lock the entire setup. Client only needs the model, never the private prompt.
            "bidiGenerateContentSetup": setup,
        }, timeout=(5, 20))
        if response.status_code == 429:
            raise ApiError("Gemini đang giới hạn lượt gọi. Vui lòng thử lại sau.",
                           429, "live_rate_limited", retry_after=provider_retry_after(response))
        response.raise_for_status()
        token = response.json()["name"]
        if not isinstance(token, str) or not token:
            raise ValueError()
    except requests.Timeout:
        raise ApiError("Kết nối Gemini quá lâu. Vui lòng thử lại.", 504, "live_timeout") from None
    except (requests.RequestException, ValueError, KeyError, TypeError):
        raise ApiError("Không thể kết nối Gemini Live. Kiểm tra API key và model trên máy chủ.",
                       502, "live_failed") from None
    rows = db.session.scalars(select(ConversationMessage).where(
        ConversationMessage.session_id == session.id, ConversationMessage.status == "completed")
        .order_by(ConversationMessage.sequence_number.desc()).limit(20)).all()
    lease = jwt.encode({"sub": user_id, "sid": session.id, "aud": "gemini-live-transcript",
                        "exp": int((now + timedelta(hours=1)).timestamp())},
                       current_app.config["AUTH_SECRET_KEY"], algorithm="HS256")
    return {"token": token, "model": model, "lease": lease,
            "last_sequence": latest.sequence_number if latest else 0,
            "history": [{"role": "user" if row.speaker == "user" else "model",
                         "parts": [{"text": row.content[:2000]}]} for row in reversed(rows)]}


def save_live_turn(user_id, session_id, data):
    if not isinstance(data, dict) or set(data) != {"lease", "request_id", "after_sequence", "input_mode", "user_text", "assistant_text"}:
        raise ApiError("Nội dung lượt Live không hợp lệ.")
    if not isinstance(data["lease"], str):
        raise ApiError("Phiên Live không hợp lệ.", 403, "invalid_live_lease")
    session = owned_session(user_id, session_id, lock=True)
    try:
        claims = jwt.decode(data["lease"], current_app.config["AUTH_SECRET_KEY"],
                            algorithms=["HS256"], audience="gemini-live-transcript")
        if claims.get("sub") != user_id or claims.get("sid") != session.id:
            raise jwt.InvalidTokenError()
    except jwt.InvalidTokenError:
        raise ApiError("Phiên Live đã hết hạn. Vui lòng kết nối lại.", 403, "invalid_live_lease") from None
    request_id = parse_id(data["request_id"], "request_id")
    if not isinstance(data["input_mode"], str) or data["input_mode"] not in {"text", "voice"} or type(data["after_sequence"]) is not int or data["after_sequence"] < 0:
        raise ApiError("Thông tin lượt Live không hợp lệ.")
    for field in ("user_text", "assistant_text"):
        if not isinstance(data[field], str) or not data[field].strip() or len(data[field]) > 2000:
            raise ApiError("Transcript phải có nội dung và không vượt quá 2000 ký tự.")
    user_text, assistant_text = data["user_text"].strip(), data["assistant_text"].strip()
    existing = db.session.get(ConversationMessage, request_id)
    if existing:
        assistant = db.session.scalar(select(ConversationMessage).where(
            ConversationMessage.session_id == session.id,
            ConversationMessage.sequence_number == existing.sequence_number + 1))
        if (existing.session_id != session.id or existing.speaker != "user" or existing.content != user_text
                or existing.input_mode != data["input_mode"] or existing.status != "completed"
                or existing.sequence_number != data["after_sequence"] + 1 or not assistant
                or assistant.speaker != "assistant" or assistant.status != "completed"
                or assistant.content != assistant_text):
            raise ApiError("Mã lượt hội thoại đã được sử dụng.", 409, "request_conflict")
        return {"user_message": message_public(existing), "assistant_message": message_public(assistant)}
    if session.status != "active":
        raise ApiError("Phiên này chỉ có thể xem lại.", 409, "session_inactive")
    latest = latest_message(session.id)
    if (latest.sequence_number if latest else 0) != data["after_sequence"] or (latest and latest.status != "completed"):
        raise ApiError("Phiên đã thay đổi. Hãy kết nối lại để cập nhật hội thoại.", 409, "session_changed")
    timestamp = utc_now()
    user = ConversationMessage(id=request_id, session_id=session.id,
        sequence_number=data["after_sequence"] + 1, speaker="user", input_mode=data["input_mode"],
        content=user_text, status="completed", occurred_at=timestamp)
    assistant = ConversationMessage(session_id=session.id,
        sequence_number=data["after_sequence"] + 2, speaker="assistant", input_mode="generated",
        content=assistant_text, status="completed", occurred_at=timestamp)
    db.session.add_all([user, assistant])
    session.current_input_mode = data["input_mode"]
    db.session.flush()
    result = {"user_message": message_public(user), "assistant_message": message_public(assistant)}
    db.session.commit()
    return result
