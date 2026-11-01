"""Upload and replay one disposable WAV through the production audio backend."""
import struct
import uuid
from urllib.parse import urlsplit

from sqlalchemy import select

from app import app
from auth.models import User
from extensions import db
from speaking.audio import complete_upload, playback, prepare_upload
from speaking.local_storage import delete_session_audio
from speaking.models import ConversationMessage, ConversationSession, utc_now


def local_path(url):
    parsed = urlsplit(url)
    return parsed.path + "?" + parsed.query


with app.app_context():
    template = db.session.scalar(select(ConversationSession).limit(1))
    if template is None:
        raise SystemExit("audio_smoke=no_scenario_session")
    user = User(name="Audio smoke test", email=f"audio-smoke-{uuid.uuid4().hex}@invalid.example",
                phone="", active=True, email_verified=True)
    db.session.add(user)
    db.session.flush()
    session = ConversationSession(user_id=user.id, scenario_id=template.scenario_id,
                                  scenario_role_id=template.scenario_role_id,
                                  scenario_snapshot=template.scenario_snapshot,
                                  status="active", audio_storage_enabled=True)
    db.session.add(session)
    db.session.flush()
    message = ConversationMessage(session_id=session.id, sequence_number=1, speaker="assistant",
                                  input_mode="generated", content="テスト", status="completed",
                                  occurred_at=utc_now())
    db.session.add(message)
    db.session.commit()
    user_id, session_id, message_id = user.id, session.id, message.id
    try:
        pcm = b"\0" * 48000
        wav = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", len(pcm) + 36, b"WAVE",
                          b"fmt ", 16, 1, 1, 24000, 48000, 2, 16, b"data", len(pcm)) + pcm
        prepared = prepare_upload(user_id, session_id, message_id,
                                  {"size_bytes": len(wav), "duration_ms": 1000, "sample_rate": 24000})
        client = app.test_client()
        response = client.put(local_path(prepared["upload_url"]), data=wav, content_type="audio/wav")
        if response.status_code != 204:
            raise RuntimeError(f"upload_failed:{response.status_code}")
        asset_id = prepared["asset"]["id"]
        complete_upload(user_id, session_id, asset_id)
        response = client.get(local_path(playback(user_id, session_id, asset_id)["url"]))
        if response.status_code != 200 or response.data != wav:
            raise RuntimeError(f"replay_failed:{response.status_code}")
        response.close()
        print("audio_smoke=upload_and_replay_ok")
    finally:
        delete_session_audio(session_id)
        db.session.remove()
        db.session.delete(db.session.get(User, user_id))
        db.session.commit()
        print("audio_smoke=cleaned")
