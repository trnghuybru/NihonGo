"""Scenario API integration tests, with an isolated schema on PostgreSQL."""
import os
import unittest
import uuid
from unittest.mock import MagicMock, patch

from flask import Flask
from sqlalchemy import create_engine, delete, select, text
from sqlalchemy.exc import OperationalError

from api_errors import ApiError
from auth import init_auth
from auth.models import AuthSession, User, now
from auth.security import digest
from extensions import db
from speaking import init_speaking
from speaking.models import ConversationMessage, ConversationSession, Scenario, ScenarioCategory, ScenarioRole
from speaking.seed import seed_id

PATH = "/api/speaking/scenarios"


class SpeakingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = None
        cls.app = Flask(__name__)
        url = os.getenv("TEST_DATABASE_URL", "sqlite://")
        cls.app.config.update(TESTING=True, AUTH_CONFIGURED=True, AUTH_SECRET_KEY="speaking-test-" * 4,
                              SQLALCHEMY_DATABASE_URI=url)
        if url.startswith("postgresql"):
            cls.schema = "test_speaking_api_" + uuid.uuid4().hex
            cls.admin = create_engine(url)
            with cls.admin.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
            cls.app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
                "connect_args": {"options": f"-csearch_path={cls.schema}"}}
        init_auth(cls.app)
        init_speaking(cls.app)
        with cls.app.app_context():
            db.create_all()

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            db.session.remove()
            db.engine.dispose()
        if cls.admin:
            with cls.admin.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{cls.schema}" CASCADE'))
            cls.admin.dispose()

    def setUp(self):
        self.context = self.app.app_context()
        self.context.push()
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(delete(table))
        for key in ("alice", "bob"):
            db.session.add(User(id=key, name=key, email=f"{key}@example.com", phone="+84912345678"))
        db.session.flush()
        for key in ("alice", "bob"):
            db.session.add(AuthSession(user_id=key, access_hash=digest(key),
                                       access_expires_at=now() + 900, expires_at=now() + 3600))
        self.daily = ScenarioCategory(name="Đời sống", sort_order=1)
        self.work = ScenarioCategory(name="Công việc", sort_order=2)
        db.session.add_all([self.daily, self.work])
        db.session.flush()
        self.first, self.first_role = self.scenario("Làm quen", self.daily, "N5")
        self.second, self.second_role = self.scenario("Phỏng vấn", self.work, "N3")
        self.draft, _ = self.scenario("Bản nháp", self.work, "N4", status="draft")
        self.archived, _ = self.scenario("Lưu trữ", self.daily, "N5", status="archived")
        self.orphan, _ = self.scenario("Thiếu vai", self.work, "N4", with_role=False)
        db.session.commit()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        self.context.pop()

    def scenario(self, title, category, level, status="published", with_role=True):
        scenario = Scenario(category_id=category.id, title=title, description="Luyện hội thoại",
                            context="Bối cảnh", learning_objectives="Mục tiêu", language_code="ja-JP",
                            difficulty_level=level, estimated_duration_minutes=5, status=status)
        db.session.add(scenario)
        db.session.flush()
        role = None
        if with_role:
            role = ScenarioRole(scenario_id=scenario.id, name="Bạn cùng lớp", description="Bạn mới",
                                ai_instructions="PRIVATE PROMPT", opening_message="こんにちは！")
            db.session.add(role)
            db.session.flush()
        return scenario, role

    def get(self, path=PATH, token="alice", **kwargs):
        return self.client.get(path, headers={"Authorization": f"Bearer {token}"}, **kwargs)

    def start(self, scenario=None, data=None, token="alice"):
        return self.client.post(f"{PATH}/{scenario or self.first.id}/sessions",
                                json={} if data is None else data,
                                headers={"Authorization": f"Bearer {token}"})

    def live_credentials(self, identifier):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "server-secret", "GEMINI_LIVE_MODEL": "test-live"}), patch("speaking.live.requests.post") as provider:
            provider.return_value.status_code = 200
            provider.return_value.json.return_value = {"name": "auth_tokens/short-lived"}
            response = self.client.post(f"/api/speaking/sessions/{identifier}/live-token", json={}, headers={"Authorization": "Bearer alice"})
            return response, provider.call_args

    def test_live_token_locks_role_and_model_without_exposing_credentials(self):
        identifier = self.start().json["session"]["id"]
        response, call = self.live_credentials(identifier)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["token"], "auth_tokens/short-lived")
        self.assertNotIn("server-secret", response.get_data(as_text=True))
        self.assertNotIn("PRIVATE PROMPT", response.get_data(as_text=True))
        self.assertEqual(call.kwargs["headers"]["x-goog-api-key"], "server-secret")
        setup = call.kwargs["json"]["bidiGenerateContentSetup"]
        self.assertEqual(setup["model"], "models/test-live")
        self.assertIn("PRIVATE PROMPT", setup["systemInstruction"]["parts"][0]["text"])
        self.assertTrue(setup["realtimeInputConfig"]["automaticActivityDetection"]["disabled"])
        self.assertEqual(response.json["last_sequence"], 1)
        self.assertEqual(response.json["history"][0]["role"], "model")

    def test_live_transcript_is_idempotent_and_updates_history(self):
        identifier = self.start().json["session"]["id"]
        credentials, _ = self.live_credentials(identifier)
        payload = {"lease": credentials.json["lease"], "request_id": str(uuid.uuid4()), "after_sequence": 1,
                   "input_mode": "voice", "user_text": "こんにちは", "assistant_text": "よろしくお願いします"}
        path = f"/api/speaking/sessions/{identifier}/live-turns"
        headers = {"Authorization": "Bearer alice"}
        first = self.client.post(path, json=payload, headers=headers)
        self.assertEqual(first.status_code, 200, first.json)
        second = self.client.post(path, json=payload, headers=headers)
        self.assertEqual(first.json, second.json)
        self.assertEqual(len(self.get(f"/api/speaking/sessions/{identifier}/messages").json["items"]), 3)
        self.assertEqual(self.get("/api/speaking/sessions").json["items"][0]["last_message"], payload["assistant_text"])
        payload["assistant_text"] = "Changed"
        self.assertEqual(self.client.post(path, json=payload, headers=headers).status_code, 409)

    def test_live_credentials_and_transcripts_require_owned_active_session(self):
        identifier = self.start().json["session"]["id"]
        path = f"/api/speaking/sessions/{identifier}/live-token"
        self.assertEqual(self.client.post(path, json={}, headers={"Authorization": "Bearer bob"}).status_code, 404)
        self.assertEqual(self.client.post(path, json={}).status_code, 401)
        credentials, _ = self.live_credentials(identifier)
        other = self.start(self.second.id).json["session"]["id"]
        payload = {"lease": credentials.json["lease"], "request_id": str(uuid.uuid4()), "after_sequence": 1,
                   "input_mode": "voice", "user_text": "Hi", "assistant_text": "Hello"}
        response = self.client.post(f"/api/speaking/sessions/{other}/live-turns", json=payload, headers={"Authorization": "Bearer alice"})
        self.assertEqual(response.status_code, 403)
        db.session.get(ConversationSession, identifier).status = "completed"
        db.session.commit()
        self.assertEqual(self.client.post(path, json={}, headers={"Authorization": "Bearer alice"}).status_code, 409)

    def test_live_rejects_stale_sequence_invalid_payload_and_provider_errors(self):
        identifier = self.start().json["session"]["id"]
        credentials, _ = self.live_credentials(identifier)
        path = f"/api/speaking/sessions/{identifier}/live-turns"
        payload = {"lease": credentials.json["lease"], "request_id": str(uuid.uuid4()), "after_sequence": 0,
                   "input_mode": "voice", "user_text": "Hi", "assistant_text": "Hello"}
        headers = {"Authorization": "Bearer alice"}
        self.assertEqual(self.client.post(path, json=payload, headers=headers).status_code, 409)
        for bad in ({**payload, "input_mode": []}, {**payload, "user_text": ""}, {**payload, "assistant_text": "a" * 2001}, {**payload, "lease": "forged"}, {**payload, "after_sequence": True}):
            self.assertIn(self.client.post(path, json=bad, headers=headers).status_code, (400, 403))
        with patch.dict(os.environ, {"GEMINI_API_KEY": "secret"}), patch("speaking.live.requests.post") as provider:
            provider.return_value.status_code = 429
            provider.return_value.headers = {"Retry-After": "10"}
            response = self.client.post(f"/api/speaking/sessions/{identifier}/live-token", json={}, headers=headers)
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["Retry-After"], "10")
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            self.assertEqual(self.client.post(f"/api/speaking/sessions/{identifier}/live-token", json={}, headers=headers).status_code, 503)

    def test_history_is_owned_paginated_and_orders_by_latest_message(self):
        from datetime import timedelta
        first = self.start().json["session"]["id"]
        second = self.start(self.second.id).json["session"]["id"]
        self.start(token="bob")
        message = db.session.scalar(select(ConversationMessage).where(ConversationMessage.session_id == first))
        message.occurred_at += timedelta(days=1)
        message.content = "Tin nhắn cuối" * 30
        db.session.commit()
        response = self.get("/api/speaking/sessions", query_string={"page_size": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["pagination"]["total"], 2)
        self.assertEqual(response.json["items"][0]["id"], first)
        self.assertEqual(len(response.json["items"][0]["last_message"]), 160)
        self.assertEqual(self.get("/api/speaking/sessions", query_string={"page_size": 1, "page": 2}).json["items"][0]["id"], second)
        self.assertEqual(self.get("/api/speaking/sessions", query_string={"page": 100}).json["items"], [])
        self.assertNotIn("PRIVATE PROMPT", response.get_data(as_text=True))

    def test_saved_session_uses_original_snapshot_and_checks_ownership(self):
        identifier = self.start().json["session"]["id"]
        self.first.title = "Changed title"
        self.first.status = "archived"
        self.first_role.description = "Changed role"
        db.session.get(ConversationSession, identifier).status = "completed"
        db.session.commit()
        path = f"/api/speaking/sessions/{identifier}"
        response = self.get(path)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["scenario"]["title"], "Làm quen")
        self.assertEqual(response.json["scenario"]["role"]["description"], "Bạn mới")
        self.assertEqual(response.json["session"]["status"], "completed")
        self.assertNotIn("PRIVATE PROMPT", response.get_data(as_text=True))
        self.assertNotIn("ai_instructions", response.get_data(as_text=True))
        self.assertEqual(self.get(path, token="bob").status_code, 404)
        self.assertEqual(self.get("/api/speaking/sessions/bad").status_code, 404)
        self.assertEqual(self.get(path, token="invalid").status_code, 401)

    def test_history_empty_and_session_without_opening(self):
        self.assertEqual(self.get("/api/speaking/sessions").json["items"], [])
        self.first_role.opening_message = None
        db.session.commit()
        identifier = self.start().json["session"]["id"]
        item = self.get("/api/speaking/sessions").json["items"][0]
        self.assertEqual(item["id"], identifier)
        self.assertIsNone(item["last_message"])
        self.assertIsNone(self.get(f"/api/speaking/sessions/{identifier}").json["opening_message"])

    def test_history_rejects_invalid_and_duplicate_pagination(self):
        for query in ({"page": "0"}, {"page_size": "101"}, {"page": "abc"},
                      {"page": "1000001"}, {"page": "-1"}, {"user_id": "bob"},
                      [("page", "1"), ("page", "2")]):
            with self.subTest(query=query):
                self.assertEqual(self.get("/api/speaking/sessions", query_string=query).status_code, 400)
        self.assertEqual(self.get("/api/speaking/sessions", token="invalid").status_code, 401)

    def test_only_available_scenarios_are_listed_and_paginated(self):
        result = self.get().json
        self.assertEqual(result["pagination"]["total"], 2)
        self.assertEqual({item["id"] for item in result["items"]}, {self.first.id, self.second.id})
        page1 = self.get(query_string={"page_size": 1}).json
        page2 = self.get(query_string={"page_size": 1, "page": 2}).json
        self.assertNotEqual(page1["items"][0]["id"], page2["items"][0]["id"])
        self.assertEqual(page1["pagination"]["total_pages"], 2)
        self.assertEqual(self.get(query_string={"page": 100}).json["items"], [])

    def test_filters_combine_and_categories_are_discoverable(self):
        result = self.get(query_string={"category_id": self.daily.id, "level": "N5",
                                       "language_code": "ja-JP", "q": "Làm"})
        self.assertEqual([item["id"] for item in result.json["items"]], [self.first.id])
        self.assertEqual(self.get(query_string={"language_code": "en-US"}).json["items"], [])
        self.assertEqual(self.get(query_string={"q": "%"}).json["items"], [])
        self.assertEqual(self.get(query_string={"q": "_"}).json["items"], [])
        categories = self.get("/api/speaking/scenario-categories").json["items"]
        self.assertEqual([item["id"] for item in categories], [self.daily.id, self.work.id])

    def test_bad_filters_return_400(self):
        for query in ({"page": "0"}, {"page_size": "101"}, {"page": "abc"}, {"level": "N6"},
                      {"category_id": "bad"}, {"language_code": ""}, {"q": "x" * 201},
                      {"status": "draft"}, [("level", "N4"), ("level", "N5")]):
            with self.subTest(query=query):
                self.assertEqual(self.get(query_string=query).status_code, 400)

    def test_detail_hides_private_instructions_and_unavailable_scenarios(self):
        response = self.get(f"{PATH}/{self.first.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["scenario"]["context"], "Bối cảnh")
        self.assertEqual(response.json["scenario"]["roles"][0]["id"], self.first_role.id)
        self.assertNotIn("PRIVATE PROMPT", response.get_data(as_text=True))
        for identifier in (self.draft.id, self.archived.id, self.orphan.id, str(uuid.uuid4()), "bad"):
            self.assertEqual(self.get(f"{PATH}/{identifier}").status_code, 404)
            self.assertEqual(self.start(identifier).status_code, 404)

    def test_start_creates_owned_session_snapshot_and_opening(self):
        response = self.start(data={"input_mode": "voice", "audio_storage_enabled": True})
        self.assertEqual(response.status_code, 201, response.json)
        session = db.session.get(ConversationSession, response.json["session"]["id"])
        self.assertEqual(session.user_id, "alice")
        self.assertEqual(session.status, "active")
        self.assertEqual(session.current_input_mode, "voice")
        self.assertTrue(session.audio_storage_enabled)
        self.assertIsNotNone(session.last_resumed_at)
        self.assertEqual(session.scenario_snapshot["role"]["ai_instructions"], "PRIVATE PROMPT")
        self.assertNotIn("PRIVATE PROMPT", response.get_data(as_text=True))
        self.first.title = "Đã sửa"
        self.first_role.ai_instructions = "NEW PROMPT"
        db.session.commit()
        db.session.expire_all()
        self.assertEqual(session.scenario_snapshot["title"], "Làm quen")
        self.assertEqual(session.scenario_snapshot["role"]["ai_instructions"], "PRIVATE PROMPT")
        messages = db.session.scalars(select(ConversationMessage).where(ConversationMessage.session_id == session.id)).all()
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0].content, "こんにちは！")
        self.assertEqual(messages[0].status, "completed")
        self.assertEqual(messages[0].sequence_number, 1)

    def test_start_defaults_and_scenario_without_opening(self):
        self.first_role.opening_message = None
        db.session.commit()
        response = self.start(token="bob")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["session"]["current_input_mode"], "text")
        self.assertFalse(response.json["session"]["audio_storage_enabled"])
        self.assertIsNone(response.json["opening_message"])
        self.assertEqual(db.session.get(ConversationSession, response.json["session"]["id"]).user_id, "bob")

    def test_multiple_roles_require_selection_and_reject_other_scenario_role(self):
        extra = ScenarioRole(scenario_id=self.first.id, name="Giáo viên", description="Giáo viên",
                             ai_instructions="PRIVATE", opening_message=None)
        db.session.add(extra)
        db.session.commit()
        self.assertEqual(self.start().json["code"], "role_required")
        response = self.start(data={"role_id": self.second_role.id})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json["code"], "invalid_role")
        response = self.start(data={"role_id": extra.id})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["session"]["scenario_role_id"], extra.id)

    def test_invalid_start_payload_never_creates_session(self):
        for data in ({"user_id": "bob"}, {"input_mode": "video"}, {"audio_storage_enabled": "true"},
                     {"audio_storage_enabled": 1}, {"role_id": None}, {"role_id": "bad"},
                     {"input_mode": []}, [], "text"):
            with self.subTest(data=data):
                self.assertEqual(self.start(data=data).status_code, 400)
        response = self.client.post(f"{PATH}/{self.first.id}/sessions", data="{bad",
                                    content_type="application/json", headers={"Authorization": "Bearer alice"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(db.session.query(ConversationSession).count(), 0)

    def test_authentication_account_status_and_cache_headers(self):
        for path in (PATH, f"{PATH}/{self.first.id}", "/api/speaking/scenario-categories"):
            self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.start(token="wrong").status_code, 401)
        response = self.get()
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        db.session.get(User, "alice").active = False
        db.session.commit()
        self.assertEqual(self.get().status_code, 401)
        self.assertEqual(self.start().status_code, 401)

    def test_database_error_is_503_and_start_is_atomic(self):
        with patch("speaking.service.db.session.commit", side_effect=OperationalError("commit", {}, Exception())):
            response = self.start()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json["code"], "speaking_unavailable")
        self.assertEqual(db.session.query(ConversationSession).count(), 0)
        self.assertEqual(db.session.query(ConversationMessage).count(), 0)
        with patch("speaking.routes.list_scenarios", side_effect=OperationalError("query", {}, Exception())):
            self.assertEqual(self.get().status_code, 503)

    def test_body_limit_and_unconfigured_service(self):
        response = self.client.post(f"{PATH}/{self.first.id}/sessions", json={"large": "x" * 17000},
                                    headers={"Authorization": "Bearer alice"})
        self.assertEqual(response.status_code, 413)
        with patch.dict(self.app.config, {"AUTH_CONFIGURED": False}):
            self.assertEqual(self.get().status_code, 503)

    def test_seed_is_repeatable_and_preserves_edits(self):
        runner = self.app.test_cli_runner()
        first = runner.invoke(args=["speaking-seed"])
        self.assertEqual(first.exit_code, 0, first.output)
        self.assertIn("8", first.output)
        seeded = db.session.get(Scenario, seed_id("scenario", "introduce-yourself"))
        seeded.title = "Custom title"
        db.session.commit()
        second = runner.invoke(args=["speaking-seed"])
        self.assertEqual(second.exit_code, 0, second.output)
        self.assertIn("0", second.output)
        db.session.expire_all()
        self.assertEqual(seeded.title, "Custom title")
        self.assertEqual(self.get().json["pagination"]["total"], 10)

    def turn(self, session_id, data, token="alice"):
        return self.client.post(f"/api/speaking/sessions/{session_id}/messages", json=data,
                                headers={"Authorization": f"Bearer {token}"})

    def test_text_and_voice_transcripts_use_saved_role_and_idempotent_requests(self):
        session_id = self.start().json["session"]["id"]
        self.first_role.ai_instructions = "EDITED PROMPT"
        db.session.commit()
        with patch("speaking.conversation.generate_reply", return_value="よろしくお願いします。") as provider:
            data = {"request_id": str(uuid.uuid4()), "content": "こんにちは", "input_mode": "text"}
            response = self.turn(session_id, data)
            self.assertEqual(response.status_code, 200, response.json)
            self.assertEqual(response.json["user_message"]["sequence_number"], 2)
            self.assertEqual(response.json["assistant_message"]["sequence_number"], 3)
            self.assertEqual(response.json["assistant_message"]["status"], "completed")
            self.assertEqual(provider.call_args.args[0]["role"]["ai_instructions"], "PRIVATE PROMPT")
            self.assertEqual(provider.call_args.args[1][-1], {"role": "user", "content": "こんにちは"})
            replay = self.turn(session_id, data)
            self.assertEqual(replay.json, response.json)
            self.assertEqual(provider.call_count, 1)
            self.assertEqual(self.turn(session_id, {**data, "content": "Changed"}).status_code, 409)
            voice = self.turn(session_id, {"request_id": str(uuid.uuid4()), "content": "私はミンです", "input_mode": "voice"})
            self.assertEqual(voice.json["user_message"]["input_mode"], "voice")
            self.assertEqual(voice.json["assistant_message"]["sequence_number"], 5)
        rows = self.get(f"/api/speaking/sessions/{session_id}/messages").json["items"]
        self.assertEqual([row["sequence_number"] for row in rows], [1, 2, 3, 4, 5])
        self.assertNotIn("PRIVATE PROMPT", str(rows))
        self.assertEqual(db.session.get(ConversationSession, session_id).current_input_mode, "voice")

    def test_turn_api_sends_saved_system_prompt_and_bounded_context_to_provider(self):
        session_id = self.start().json["session"]["id"]
        self.first.context = "CHANGED CONTEXT"
        self.first_role.ai_instructions = "CHANGED ROLE"
        db.session.commit()
        response = MagicMock()
        response.__enter__.return_value = response
        response.json.return_value = {"choices": [{"message": {"content": "はい、どうぞ。"}}]}
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "server-key", "OPENROUTER_MODEL": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"}), \
                patch("speaking.ai.requests.post", return_value=response) as post:
            for index in range(4):
                reply = self.turn(session_id, {"request_id": str(uuid.uuid4()),
                                 "content": f"質問{index}", "input_mode": "text"})
                self.assertEqual(reply.status_code, 200, reply.json)
        payload = post.call_args.kwargs["json"]
        prompt = payload["messages"][0]
        self.assertEqual(prompt["role"], "system")
        for value in ("Làm quen", "Bối cảnh", "Mục tiêu", "Bạn cùng lớp", "PRIVATE PROMPT", "N5", "ja-JP"):
            self.assertIn(value, prompt["content"])
        self.assertNotIn("CHANGED CONTEXT", prompt["content"])
        self.assertNotIn("CHANGED ROLE", prompt["content"])
        self.assertEqual(payload["reasoning"]["enabled"], False)
        self.assertEqual(len(payload["messages"]), 7)  # System + six recent messages.
        self.assertEqual(payload["messages"][-1], {"role": "user", "content": "質問3"})
        # The context bound must not truncate the persisted transcript.
        self.assertEqual(len(self.get(f"/api/speaking/sessions/{session_id}/messages").json["items"]), 9)

    def test_transcript_ownership_and_turn_validation(self):
        session_id = self.start().json["session"]["id"]
        data = {"request_id": str(uuid.uuid4()), "content": "こんにちは", "input_mode": "text"}
        self.assertEqual(self.get(f"/api/speaking/sessions/{session_id}/messages", token="bob").status_code, 404)
        self.assertEqual(self.turn(session_id, data, "bob").status_code, 404)
        self.assertEqual(self.turn("bad", data).status_code, 404)
        for invalid in ({**data, "content": " "}, {**data, "content": "a" * 2001},
                        {**data, "request_id": "bad"}, {**data, "input_mode": []},
                        {**data, "user_id": "bob"}, {**data, "model": "client-model"}):
            self.assertEqual(self.turn(session_id, invalid).status_code, 400)
        db.session.get(ConversationSession, session_id).status = "paused"
        db.session.commit()
        self.assertEqual(self.turn(session_id, data).json["code"], "session_inactive")

    def test_provider_failure_is_saved_and_retry_does_not_duplicate_user_message(self):
        session_id = self.start().json["session"]["id"]
        data = {"request_id": str(uuid.uuid4()), "content": "こんにちは", "input_mode": "voice"}
        with patch("speaking.conversation.generate_reply", side_effect=ApiError("AI lỗi", 502, "ai_failed")):
            response = self.turn(session_id, data)
        self.assertEqual(response.status_code, 502)
        rows = self.get(f"/api/speaking/sessions/{session_id}/messages").json["items"]
        self.assertEqual(rows[-1]["status"], "failed")
        self.assertEqual(rows[-1]["content"], "")
        other = {**data, "request_id": str(uuid.uuid4())}
        self.assertEqual(self.turn(session_id, other).json["code"], "turn_unresolved")
        with patch("speaking.conversation.generate_reply", return_value="こんにちは！"):
            self.assertEqual(self.turn(session_id, data).status_code, 200)
        self.assertEqual(db.session.query(ConversationMessage).count(), 3)

    def test_provider_rate_limit_keeps_retry_metadata_and_same_saved_turn(self):
        session_id = self.start().json["session"]["id"]
        data = {"request_id": str(uuid.uuid4()), "content": "こんにちは", "input_mode": "text"}
        response = MagicMock(status_code=429, headers={"Retry-After": "18"})
        response.__enter__.return_value = response
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "server-key"}), \
                patch("speaking.ai.requests.post", return_value=response):
            failure = self.turn(session_id, data)
        self.assertEqual(failure.status_code, 429)
        self.assertEqual(failure.json["code"], "ai_rate_limited")
        self.assertEqual(failure.json["retry_after"], 18)
        self.assertEqual(failure.headers["Retry-After"], "18")
        rows = self.get(f"/api/speaking/sessions/{session_id}/messages").json["items"]
        self.assertEqual(rows[-1]["status"], "failed")
        with patch("speaking.conversation.generate_reply", return_value="こんにちは！"):
            success = self.turn(session_id, data)
        self.assertEqual(success.status_code, 200)
        self.assertEqual(success.json["assistant_message"]["id"], rows[-1]["id"])
        self.assertEqual(db.session.query(ConversationMessage).count(), 3)

    def test_transcript_cursor_and_pending_retry(self):
        session_id = self.start().json["session"]["id"]
        data = {"request_id": str(uuid.uuid4()), "content": "こんにちは", "input_mode": "text"}
        with patch("speaking.conversation.generate_reply", return_value="こんにちは！"):
            self.turn(session_id, data)
        page = self.get(f"/api/speaking/sessions/{session_id}/messages", query_string={"limit": 2}).json
        self.assertTrue(page["has_more"])
        self.assertEqual(page["next_sequence"], 2)
        next_page = self.get(f"/api/speaking/sessions/{session_id}/messages", query_string={"after_sequence": 2}).json
        self.assertEqual(next_page["items"][0]["sequence_number"], 3)
        for query in ({"limit": 101}, {"limit": 0}, {"after_sequence": -1}, {"bad": "1"}):
            self.assertEqual(self.get(f"/api/speaking/sessions/{session_id}/messages", query_string=query).status_code, 400)
        assistant = db.session.scalar(select(ConversationMessage).where(ConversationMessage.session_id == session_id,
                                                                        ConversationMessage.sequence_number == 3))
        assistant.status = "pending"
        db.session.commit()
        self.assertEqual(self.turn(session_id, data).json["code"], "turn_pending")

    @unittest.skipUnless(os.getenv("TEST_DATABASE_URL", "").startswith("postgresql"), "PostgreSQL row-lock concurrency test")
    def test_concurrent_turn_is_reserved_before_provider_call(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Event
        session_id = self.start().json["session"]["id"]
        entered, release = Event(), Event()
        data = {"request_id": str(uuid.uuid4()), "content": "こんにちは", "input_mode": "text"}
        def generate(snapshot, history):
            entered.set()
            if not release.wait(5):
                raise RuntimeError("Test provider timeout")
            return "こんにちは！"
        def send_first():
            with self.app.test_client() as client:
                return client.post(f"/api/speaking/sessions/{session_id}/messages", json=data,
                                   headers={"Authorization": "Bearer alice"})
        with patch("speaking.conversation.generate_reply", side_effect=generate) as provider:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(send_first)
                try:
                    self.assertTrue(entered.wait(5))
                    self.assertEqual(self.turn(session_id, data).json["code"], "turn_pending")
                    self.assertEqual(self.turn(session_id, {**data, "request_id": str(uuid.uuid4())}).json["code"], "turn_unresolved")
                finally:
                    release.set()
                self.assertEqual(future.result(timeout=5).status_code, 200)
            self.assertEqual(provider.call_count, 1)


if __name__ == "__main__":
    unittest.main()
