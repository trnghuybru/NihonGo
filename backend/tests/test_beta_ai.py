"""Financial and admission gates for the private beta."""
import os
import unittest
from unittest.mock import Mock, patch

from flask import Flask, g
from sqlalchemy import delete

from auth import init_auth
from auth.beta import check_invite
from auth.models import AuthSession, User, now
from auth.security import AuthError, digest
from beta_ai.models import AiAttempt
from beta_ai.service import _hold, balance, finish_live, hold_live, post, settle
from api_errors import ApiError
from extensions import db
from speaking.service import StartSessionInput
from writing import init_writing


class BetaAiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(TESTING=True, AUTH_CONFIGURED=True,
                              AUTH_SECRET_KEY="test-secret-" * 4,
                              SQLALCHEMY_DATABASE_URI="sqlite://")
        init_auth(cls.app)
        init_writing(cls.app)
        with cls.app.app_context():
            db.create_all()

    def setUp(self):
        self.environment = patch.dict(os.environ, {
            "BETA_MODE": "true",
            "BETA_INVITE_EMAILS": ",".join(f"user{i}@example.com" for i in range(11)),
            "BETA_GEMINI_PRICES_JSON": '{"test-model":{"input_usd_per_million":1000,"output_usd_per_million":1000}}',
            "BETA_LIVE_RESERVE_USD": "0.25",
            "BETA_LIVE_ENABLED": "true",
        })
        self.environment.start()
        self.context = self.app.app_context()
        self.context.push()
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(delete(table))
        db.session.add(User(id="user0", name="User", email="user0@example.com",
                            phone="+84912345678", email_verified=True))
        db.session.add(AuthSession(user_id="user0", access_hash=digest("beta-token"),
                                   access_expires_at=now() + 900, expires_at=now() + 3600))
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        self.context.pop()
        self.environment.stop()

    def test_invite_and_tenth_seat(self):
        with self.assertRaises(AuthError):
            check_invite("stranger@example.com")
        check_invite("user1@example.com", creating=True)
        for index in range(1, 10):
            db.session.add(User(id=f"user{index}", name="User",
                                email=f"user{index}@example.com", phone=f"+84912345{index:03d}",
                                email_verified=True))
        db.session.commit()
        with self.assertRaises(AuthError) as failure:
            check_invite("user10@example.com", creating=True)
        self.assertEqual(failure.exception.code, "beta_full")

    def test_wallet_reservation_and_settlement(self):
        first = _hold("user0", "test-model", "writing", 1_500_000)
        self.assertEqual(balance("user0")["available_usd"], 0.5)
        with self.assertRaises(Exception) as failure:
            _hold("user0", "test-model", "reading", 600_000)
        self.assertEqual(getattr(failure.exception, "code", None), "beta_ai_budget_exhausted")
        db.session.rollback()
        settle(first, 1_000_000)
        self.assertEqual(balance("user0")["available_usd"], 1.0)

    def test_provider_usage_is_charged(self):
        provider = Mock(status_code=200)
        provider.json.return_value = {"usageMetadata": {"promptTokenCount": 100, "totalTokenCount": 150}}
        with self.app.test_request_context("/api/writing/submissions"):
            g.user = db.session.get(User, "user0")
            with patch("beta_ai.service.requests.post", return_value=provider):
                response = post("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
                                json={"contents": [{"parts": [{"text": "test"}]}],
                                      "generationConfig": {"maxOutputTokens": 10}})
        self.assertIs(response, provider)
        self.assertEqual(balance("user0")["spent_usd"], 0.15)
        self.assertEqual(db.session.query(AiAttempt).count(), 1)

    def test_provider_payment_required_does_not_charge_user(self):
        provider = Mock(status_code=402)
        with self.app.test_request_context("/api/speaking/sessions/test/messages"):
            g.user = db.session.get(User, "user0")
            with patch("beta_ai.service.requests.post", return_value=provider):
                response = post("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
                                json={"contents": [{"parts": [{"text": "test"}]}],
                                      "generationConfig": {"maxOutputTokens": 10}})
        self.assertIs(response, provider)
        self.assertEqual(balance("user0")["spent_usd"], 0)
        self.assertEqual(balance("user0")["held_usd"], 0)
        self.assertEqual(db.session.query(AiAttempt).one().charged_micro_usd, 0)

    def test_vertex_routes_through_cloud_project_and_keeps_wallet(self):
        provider = Mock(status_code=200)
        provider.json.return_value = {"usageMetadata": {"promptTokenCount": 100, "totalTokenCount": 150}}
        with patch.dict(os.environ, {"GEMINI_PROVIDER": "vertex", "VERTEX_PROJECT_ID": "nihongo-beta-123"}), \
                patch("services.gemini_provider.vertex_token", return_value="short-lived-token"), \
                patch("beta_ai.service.requests.post", return_value=provider) as transport, \
                self.app.test_request_context("/api/speaking/sessions/test/messages"):
            g.user = db.session.get(User, "user0")
            post("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
                 headers={"x-goog-api-key": "unused-developer-key"},
                 json={"contents": [{"parts": [{"text": "test"}]}],
                       "generationConfig": {"maxOutputTokens": 10}})
        self.assertEqual(transport.call_args.args[0],
                         "https://aiplatform.googleapis.com/v1/projects/nihongo-beta-123/locations/global/publishers/google/models/test-model:generateContent")
        headers = transport.call_args.kwargs["headers"]
        self.assertEqual(headers["Authorization"], "Bearer short-lived-token")
        self.assertNotIn("x-goog-api-key", headers)
        self.assertEqual(balance("user0")["spent_usd"], 0.15)

    def test_vertex_auth_failure_does_not_reserve_wallet(self):
        with patch.dict(os.environ, {"GEMINI_PROVIDER": "vertex", "VERTEX_PROJECT_ID": "nihongo-beta-123"}), \
                patch("services.gemini_provider.vertex_token",
                      side_effect=ApiError("Vertex auth unavailable", 503, "vertex_auth_unavailable")), \
                patch("beta_ai.service.requests.post") as transport, \
                self.app.test_request_context("/api/speaking/sessions/test/messages"):
            g.user = db.session.get(User, "user0")
            with self.assertRaises(ApiError):
                post("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
                     json={"contents": [{"parts": [{"text": "test"}]}],
                           "generationConfig": {"maxOutputTokens": 10}})
        transport.assert_not_called()
        self.assertEqual(db.session.query(AiAttempt).count(), 0)
        self.assertEqual(balance("user0")["spent_usd"], 0)

    def test_live_session_cannot_overlap(self):
        with self.app.test_request_context("/api/speaking/live-token"):
            g.user = db.session.get(User, "user0")
            first = hold_live("test-live")
            finish_live(first, success=True)
            with self.assertRaises(Exception) as failure:
                hold_live("test-live")
            self.assertEqual(getattr(failure.exception, "code", None), "beta_live_active")

    def test_live_is_disabled_by_default(self):
        with patch.dict(os.environ, {"BETA_LIVE_ENABLED": "false"}):
            with self.assertRaises(ApiError) as failure:
                hold_live("test-live")
        self.assertEqual(failure.exception.code, "beta_live_disabled")

    def test_text_provider_slots_release_after_settlement(self):
        attempts = [_hold("user0", "test-model", "writing", 1000) for _ in range(3)]
        with self.assertRaises(Exception) as failure:
            _hold("user0", "test-model", "reading", 1000)
        self.assertEqual(getattr(failure.exception, "code", None), "beta_ai_busy")
        db.session.rollback()
        settle(attempts[0], 500)
        self.assertIsInstance(_hold("user0", "test-model", "reading", 1000), str)

    def test_audio_storage_is_disabled_without_beta_bucket(self):
        with self.assertRaises(ApiError) as failure:
            StartSessionInput.parse({"input_mode": "voice", "audio_storage_enabled": True})
        self.assertEqual(failure.exception.code, "beta_audio_disabled")

    def test_writing_route_and_balance_endpoint(self):
        provider = Mock(status_code=200)
        provider.json.return_value = {
            "candidates": [{"finishReason": "STOP", "content": {"parts": [{"text":
                '{"score":80,"corrected_text":"日本語を勉強します。","feedback":"Bài viết rõ ý."}'
            }]}}],
            "usageMetadata": {"promptTokenCount": 100, "totalTokenCount": 150},
        }
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "GEMINI_WRITING_MODEL": "test-model",
                                  "BETA_GEMINI_PRICES_JSON": '{"test-model":{"input_usd_per_million":100,"output_usd_per_million":100}}'}), \
                patch("beta_ai.service.requests.post", return_value=provider):
            result = self.app.test_client().post("/api/writing/submissions",
                json={"text": "日本語を勉強します。"},
                headers={"Authorization": "Bearer beta-token"})
        self.assertEqual(result.status_code, 201, result.json)
        budget = self.app.test_client().get("/api/auth/ai-budget",
            headers={"Authorization": "Bearer beta-token"})
        self.assertEqual(budget.status_code, 200, budget.json)
        self.assertEqual(budget.json["spent_usd"], 0.015)
