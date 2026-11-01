"""One disposable end-to-end Live handshake on the beta VPS.

Run from /opt/momonihongo with:
docker compose --env-file backend/.env -f compose.beta.yaml exec -T backend python - < deploy/beta/smoke_live.py
"""
import json
import time
import uuid

from simple_websocket import Client
from sqlalchemy import select

from app import app
from auth.models import User
from extensions import db
from speaking.gemini_live_gateway import issue_gateway_token
from speaking.models import ConversationSession


with app.app_context():
    template = db.session.scalar(select(ConversationSession).limit(1))
    if template is None:
        raise SystemExit("smoke=no_scenario_session")
    user = User(name="Live smoke test", email=f"live-smoke-{uuid.uuid4().hex}@invalid.example",
                phone="", active=True, email_verified=True)
    db.session.add(user)
    db.session.flush()
    session = ConversationSession(user_id=user.id, scenario_id=template.scenario_id,
                                  scenario_role_id=template.scenario_role_id,
                                  scenario_snapshot=template.scenario_snapshot,
                                  status="active")
    db.session.add(session)
    db.session.commit()
    user_id, session_id = user.id, session.id
    try:
        credentials = issue_gateway_token(user_id, session_id)
        url = ("wss://momonihongo.app" + credentials["gateway_url"] +
               "?access_token=" + credentials["token"])
        browser = Client.connect(url, headers={"Origin": "https://momonihongo.app"},
                                 max_message_size=2_000_000)
        try:
            browser.send(json.dumps({"setup": {"model": credentials["model"]}}))
            event = browser.receive(timeout=25)
            result = json.loads(event) if event else {}
            if "setupComplete" not in result:
                raise RuntimeError("missing_setup_complete:" + ",".join(result.keys()))
            print("smoke=setup_complete")
            browser.send(json.dumps({"clientContent": {"turns": [], "turnComplete": True}}))
            browser.send(json.dumps({"clientContent": {"turns": [{"role": "user", "parts": [
                {"text": "こんにちは。短く返事をしてください。"}]}], "turnComplete": True}}))
            deadline = time.monotonic() + 40
            replied = False
            while time.monotonic() < deadline:
                event = browser.receive(timeout=2)
                if not event:
                    continue
                result = json.loads(event)
                content = result.get("serverContent") or {}
                if content.get("modelTurn", {}).get("parts"):
                    replied = True
                    break
                if result.get("error"):
                    raise RuntimeError("provider_error")
            if not replied:
                raise RuntimeError("missing_model_reply")
            print("smoke=model_replied")
        finally:
            browser.close()
        time.sleep(2)
    finally:
        db.session.remove()
        test_user = db.session.get(User, user_id)
        if test_user:
            db.session.delete(test_user)
            db.session.commit()
        print("smoke=cleaned")
