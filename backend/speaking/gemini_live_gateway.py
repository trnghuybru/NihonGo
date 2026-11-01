"""Short, server-owned Gemini Developer Live sessions for the private beta."""
import base64
import binascii
import json
import math
import os
import threading
import time
from datetime import timedelta

import jwt
from flask import Response, current_app, request
from simple_websocket import Client, ConnectionClosed, Server
from sqlalchemy import select

from api_errors import ApiError
from auth.models import User
from beta_daily.service import LIVE_SECONDS, daily_mode, finish_live, reserve_live
from beta_ai.service import _hold, settle
from extensions import db
from .ai import build_scenario_system_prompt
from .conversation import owned_session
from .models import ConversationMessage, utc_now

MODEL = "gemini-3.8-live"
MAX_SECONDS = 90
RESERVE_MICRO_USD = 250_000
MAX_INPUT_AUDIO_BYTES = 16_000 * 2 * LIVE_SECONDS
MAX_FRAME_BYTES = 128_000


class _WebSocketResponse(Response):
    """Tell Gunicorn that the WebSocket already consumed the HTTP socket."""
    def __init__(self, mode):
        super().__init__()
        self.mode = mode

    def __call__(self, *args, **kwargs):
        if self.mode == "gunicorn":
            raise StopIteration()
        return super().__call__(*args, **kwargs)


def issue_gateway_token(user_id, session_id):
    if os.getenv("BETA_LIVE_ENABLED", "false").lower() != "true":
        raise ApiError("Nói Live chưa mở trong đợt thử nghiệm này.", 503, "beta_live_disabled")
    if not os.getenv("GEMINI_LIVE_API_KEY", "").strip():
        raise ApiError("Chưa cấu hình Gemini API key riêng cho Live.", 503, "beta_live_unavailable")
    session = owned_session(user_id, session_id)
    if session.status != "active":
        raise ApiError("Phiên này chỉ có thể xem lại.", 409, "session_inactive")
    latest = db.session.scalar(select(ConversationMessage).where(
        ConversationMessage.session_id == session.id)
        .order_by(ConversationMessage.sequence_number.desc()).limit(1))
    if latest and latest.status != "completed":
        raise ApiError("Hãy xử lý lượt chưa hoàn tất trước khi kết nối Live.", 409, "turn_unresolved")
    now = utc_now()
    secret = current_app.config["AUTH_SECRET_KEY"]
    token = jwt.encode({"sub": user_id, "sid": session.id,
                        "aud": "gemini-live-gateway",
                        "exp": int((now + timedelta(seconds=60)).timestamp())},
                       secret, algorithm="HS256")
    lease = jwt.encode({"sub": user_id, "sid": session.id,
                        "aud": "gemini-live-transcript",
                        "exp": int((now + timedelta(minutes=8 if daily_mode() else 5)).timestamp())},
                       secret, algorithm="HS256")
    rows = db.session.scalars(select(ConversationMessage).where(
        ConversationMessage.session_id == session.id,
        ConversationMessage.status == "completed")
        .order_by(ConversationMessage.sequence_number.desc()).limit(20)).all()
    return {"token": token, "lease": lease,
            "model": f"models/{MODEL}",
            "gateway_url": f"/api/speaking/sessions/{session.id}/live-stream",
            "audio_storage_enabled": session.audio_storage_enabled,
            "last_sequence": latest.sequence_number if latest else 0,
            "history": [{"role": "user" if row.speaker == "user" else "model",
                         "parts": [{"text": row.content[:2000]}]} for row in reversed(rows)]}


def _cost_from_usage(usage):
    """Use the highest modality prices when the provider omits token details."""
    if not isinstance(usage, dict):
        return None
    try:
        prompt = int(usage["promptTokenCount"])
        output = int(usage.get("responseTokenCount", usage.get("candidatesTokenCount")))
        thoughts = int(usage.get("thoughtsTokenCount", 0))
        if prompt < 0 or output < 0 or thoughts < 0:
            return None
        def modality_cost(details, total, audio_rate, text_rate):
            if not isinstance(details, list) or not details:
                return total * audio_rate
            counted = 0
            cost = 0
            for item in details:
                count = int(item["tokenCount"])
                if count < 0:
                    raise ValueError()
                counted += count
                cost += count * (audio_rate if item.get("modality") == "AUDIO" else text_rate)
            if counted > total:
                raise ValueError()
            return cost + (total - counted) * audio_rate
        # USD per million tokens equals micro-USD per token.
        charge = (modality_cost(usage.get("promptTokensDetails"), prompt, 3, 0.75) +
                  modality_cost(usage.get("responseTokensDetails", usage.get("candidatesTokensDetails")),
                                output, 12, 4.5) + thoughts * 4.5)
        return max(1, math.ceil(charge))
    except (KeyError, ValueError, TypeError, OverflowError):
        return None


def _validated_client_message(raw, first_content, history):
    if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_FRAME_BYTES:
        raise ValueError("frame_size")
    message = json.loads(raw)
    if not isinstance(message, dict) or len(message) != 1:
        raise ValueError("frame_shape")
    if "setup" in message:
        return None, first_content, 0
    if "clientContent" in message:
        content = message["clientContent"]
        if not isinstance(content, dict) or content.get("turnComplete") is not True:
            raise ValueError("content_shape")
        if first_content:
            return {"clientContent": {"turns": history, "turnComplete": True}}, False, 0
        turns = content.get("turns")
        if not isinstance(turns, list) or len(turns) != 1 or not isinstance(turns[0], dict) or turns[0].get("role") != "user":
            raise ValueError("text_shape")
        parts = turns[0].get("parts")
        if not isinstance(parts, list) or len(parts) != 1 or not isinstance(parts[0], dict):
            raise ValueError("text_parts")
        value = parts[0].get("text")
        if not isinstance(value, str) or not 1 <= len(value) <= 2200:
            raise ValueError("text_length")
        return {"clientContent": {"turns": [{"role": "user", "parts": [{"text": value}]}],
                                  "turnComplete": True}}, False, 0
    if "realtimeInput" in message:
        value = message["realtimeInput"]
        if not isinstance(value, dict) or len(value) != 1:
            raise ValueError("audio_shape")
        if "activityStart" in value or "activityEnd" in value:
            if value.get("activityStart", value.get("activityEnd")) != {}:
                raise ValueError("activity_shape")
            return message, first_content, 0
        audio = value.get("audio")
        if not isinstance(audio, dict) or audio.get("mimeType") != "audio/pcm;rate=16000":
            raise ValueError("audio_format")
        data = audio.get("data")
        if not isinstance(data, str) or len(data) > 48_000:
            raise ValueError("audio_size")
        decoded = base64.b64decode(data, validate=True)
        if not decoded or len(decoded) > 32_000 or len(decoded) % 2:
            raise ValueError("audio_size")
        return message, first_content, len(decoded)
    raise ValueError("frame_type")


def serve_live_stream(session_id):
    if os.getenv("BETA_LIVE_ENABLED", "false").lower() != "true":
        raise ApiError("Nói Live chưa mở.", 503, "beta_live_disabled")
    origins = {item.strip() for item in os.getenv("APP_CORS_ORIGINS", "").split(",") if item.strip()}
    origins.add(os.getenv("PUBLIC_BASE_URL", "").rstrip("/"))
    if os.getenv("APP_ENV") == "production" and request.headers.get("Origin") not in origins:
        raise ApiError("Nguồn kết nối Live không hợp lệ.", 403, "live_origin_invalid")
    try:
        claims = jwt.decode(request.args.get("access_token", ""), current_app.config["AUTH_SECRET_KEY"],
                            algorithms=["HS256"], audience="gemini-live-gateway")
        user_id = claims["sub"]
        if claims.get("sid") != session_id or not db.session.get(User, user_id):
            raise jwt.InvalidTokenError()
    except (jwt.InvalidTokenError, KeyError, TypeError):
        raise ApiError("Phiên Live không hợp lệ hoặc đã hết hạn.", 403, "invalid_live_token") from None
    session = owned_session(user_id, session_id)
    if session.status != "active":
        raise ApiError("Phiên này chỉ có thể xem lại.", 409, "session_inactive")
    key = os.getenv("GEMINI_LIVE_API_KEY", "").strip()
    if not key:
        raise ApiError("Chưa cấu hình Gemini API key riêng cho Live.", 503, "beta_live_unavailable")
    daily = daily_mode()
    attempt_id = reserve_live(user_id) if daily else _hold(user_id, MODEL, "live", RESERVE_MICRO_USD, live=True)
    browser = upstream = None
    audio_bytes = 0
    usage = None
    stop = threading.Event()
    state = {"reason": "time_limit", "reply_sent": False,
             "setup_delivered": False, "output_audio_bytes": 0}
    try:
        browser = Server.accept(request.environ, max_message_size=MAX_FRAME_BYTES, ping_interval=25)
        uri = ("wss://generativelanguage.googleapis.com/ws/"
               "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent")
        upstream = Client.connect(uri, headers={"x-goog-api-key": key},
                                  max_message_size=2_000_000, ping_interval=25)
        upstream.send(json.dumps({"setup": {
            "model": f"models/{MODEL}",
            "generationConfig": {"responseModalities": ["AUDIO"], "maxOutputTokens": 1024,
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Kore"}},
                                                  "languageCode": "ja-JP"}},
            "systemInstruction": {"parts": [{"text": build_scenario_system_prompt(session.scenario_snapshot)}]},
            "inputAudioTranscription": {}, "outputAudioTranscription": {},
            "realtimeInputConfig": {"automaticActivityDetection": {"disabled": True}},
        }}, ensure_ascii=False))
        rows = db.session.scalars(select(ConversationMessage).where(
            ConversationMessage.session_id == session.id,
            ConversationMessage.status == "completed")
            .order_by(ConversationMessage.sequence_number.desc()).limit(20)).all()
        history = [{"role": "user" if row.speaker == "user" else "model",
                    "parts": [{"text": row.content[:2000]}]} for row in reversed(rows)]
        usage_holder = {"last": None}
        def provider_to_browser():
            while not stop.is_set():
                try:
                    raw = upstream.receive(timeout=0.5)
                    if raw is None:
                        continue
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict) and isinstance(parsed.get("usageMetadata"), dict):
                        usage_holder["last"] = parsed["usageMetadata"]
                        observed = _cost_from_usage(usage_holder["last"])
                        if not daily and observed is not None and observed >= 200_000:
                            stop.set()
                    browser.send(raw)
                    if isinstance(parsed, dict) and "setupComplete" in parsed:
                        state["setup_delivered"] = True
                    content = parsed.get("serverContent", {}) if isinstance(parsed, dict) else {}
                    parts = content.get("modelTurn", {}).get("parts", []) if isinstance(content, dict) else []
                    if isinstance(parts, list):
                        for part in parts:
                            if not isinstance(part, dict):
                                continue
                            data = part.get("inlineData", {}).get("data") if isinstance(part.get("inlineData"), dict) else None
                            if isinstance(data, str):
                                state["output_audio_bytes"] += len(data) * 3 // 4
                                state["reply_sent"] = True
                            elif isinstance(part.get("text"), str) and part["text"]:
                                state["reply_sent"] = True
                except (ConnectionClosed, ValueError, TypeError) as error:
                    state["reason"] = "provider_or_browser_" + type(error).__name__
                    stop.set()
                except Exception as error:
                    state["reason"] = "relay_" + type(error).__name__
                    stop.set()
        reader = threading.Thread(target=provider_to_browser, daemon=True)
        reader.start()
        deadline = time.monotonic() + (LIVE_SECONDS if daily else MAX_SECONDS)
        first_content = True
        while not stop.is_set() and time.monotonic() < deadline:
            try:
                raw = browser.receive(timeout=0.25)
                if raw is None:
                    continue
                message, first_content, size = _validated_client_message(raw, first_content, history)
                if audio_bytes + size > MAX_INPUT_AUDIO_BYTES:
                    state["reason"] = "audio_limit"
                    break
                audio_bytes += size
                if message is not None:
                    upstream.send(json.dumps(message, ensure_ascii=False))
            except (ConnectionClosed, ValueError, TypeError, binascii.Error) as error:
                state["reason"] = "client_" + type(error).__name__
                break
        usage = usage_holder["last"]
    except Exception as error:
        state["reason"] = "gateway_" + type(error).__name__
        current_app.logger.error("Gemini Live gateway failed (%s)", type(error).__name__)
    finally:
        stop.set()
        if upstream:
            try:
                upstream.close()
            except Exception:
                pass
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        if daily:
            finish_live(attempt_id, started=state["setup_delivered"])
            current_app.logger.info("Gemini Live session ended reason=%s started=%s",
                                    state["reason"], state["setup_delivered"])
        else:
            charge = _cost_from_usage(usage)
            if charge is None:
                charge = (min(RESERVE_MICRO_USD, math.ceil(
                    5_000 + audio_bytes / 32_000 / 60 * 5_000 +
                    state["output_audio_bytes"] / 48_000 / 60 * 18_000))
                    if state["reply_sent"] else 0)
            settle(attempt_id, min(RESERVE_MICRO_USD, charge))
    return _WebSocketResponse(browser.mode if browser else None)
