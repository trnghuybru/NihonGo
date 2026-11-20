"""Run with TEST_DATABASE_URL to exercise PostgreSQL in an isolated temporary schema."""
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from flask import Flask
from sqlalchemy import create_engine, delete, select, text

from auth import init_auth
from auth.models import AuthSession, Challenge, OAuthFlow, RateLimit, User, db, now
from auth.oauth import exchange_provider_code
from auth.security import AuthError, digest

PASSWORD = "A long secret phrase 2026!"
REGISTER = {"name": "Nguyễn Minh", "email": "minh@example.com", "phone": "0912345678",
            "password": PASSWORD}


class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.url = os.getenv("TEST_DATABASE_URL", "sqlite://")
        cls.admin = None
        cls.app = Flask(__name__)
        cls.app.config.update(TESTING=True, AUTH_SECRET_KEY="test-secret-" * 4,
                              AUTH_CONFIGURED=True, SQLALCHEMY_DATABASE_URI=cls.url,
                              SMTP_HOST="test", SMTP_FROM="test@example.com",
                              PUBLIC_BASE_URL="https://api.example.com", WEB_BASE_URL="https://web.example.com",
                              GOOGLE_CLIENT_ID="client",
                              GOOGLE_CLIENT_SECRET="secret")
        if cls.url.startswith("postgresql"):
            cls.schema = "test_auth_" + uuid.uuid4().hex
            cls.admin = create_engine(cls.url)
            with cls.admin.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
            cls.app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
                "connect_args": {"options": f"-csearch_path={cls.schema}"}}
        init_auth(cls.app)
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
        db.session.commit()
        self.sent = []
        self.app.config["AUTH_TEST_DELIVERY"] = lambda channel, destination, code: self.sent.append((channel, destination, code))
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        self.context.pop()

    def post(self, path, data, token=None):
        return self.client.post("/api/auth" + path, json=data,
                                headers={"Authorization": "Bearer " + token} if token else {})

    def register(self, **overrides):
        response = self.post("/register", {**REGISTER, **overrides})
        self.assertEqual(response.status_code, 202, response.json)
        return response.json["challenge_id"], self.sent[-1][2]

    def signup(self, **overrides):
        challenge, code = self.register(**overrides)
        response = self.post("/verify", {"challenge_id": challenge, "code": code})
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def test_register_verify_login_normalization(self):
        challenge, code = self.register(email="Minh@EXAMPLE.COM")
        self.assertEqual(db.session.scalar(select(db.func.count()).select_from(User)), 0)
        pending = db.session.get(Challenge, challenge)
        self.assertNotEqual(pending.code_hash, code)
        self.assertTrue(pending.payload["password_hash"].startswith("$argon2id$"))
        self.assertEqual(self.post("/login", {"identifier": "minh@example.com", "password": PASSWORD}).status_code, 401)
        response = self.post("/verify", {"challenge_id": challenge, "code": code})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["user"]["phone"], "+84912345678")
        self.assertTrue(response.json["user"]["email_verified"])
        self.assertFalse(response.json["user"]["phone_verified"])
        self.assertNotIn("password_hash", response.json["user"])
        self.assertEqual(self.post("/login", {"identifier": "MINH@example.com", "password": PASSWORD}).status_code, 200)
        self.assertEqual(self.post("/login", {"identifier": "0912345678", "password": PASSWORD}).status_code, 401)
        self.assertEqual(self.post("/verify", {"challenge_id": challenge, "code": code}).status_code, 400)

    def test_registration_always_verifies_email_even_with_legacy_sms_selection(self):
        tokens = self.signup(channel="sms")
        self.assertEqual(self.sent[-1][:2], ("email", REGISTER["email"]))
        self.assertTrue(tokens["user"]["email_verified"])
        self.assertFalse(tokens["user"]["phone_verified"])
        self.assertEqual(self.post("/login", {"identifier": "+84912345678", "password": PASSWORD}).status_code, 401)
        self.assertEqual(self.post("/login", {"identifier": REGISTER["email"], "password": PASSWORD}).status_code, 200)

    def test_validation_and_malformed_json(self):
        self.assertEqual(self.client.get("/api/auth/config").json["password_min_length"], 8)
        for override in ({"email": "bad"}, {"phone": "123"}, {"name": " "}, {"password": "short"},
                         {"name": []}, {"email": None}):
            self.assertEqual(self.post("/register", {**REGISTER, **override}).status_code, 400)
        self.assertEqual(self.post("/register", {**REGISTER, "password": "1234567"}).status_code, 400)
        self.assertEqual(self.post("/register", {**REGISTER, "password": "abcdefgh"}).status_code, 202)
        self.assertEqual(self.post("/login", []).status_code, 400)

    def test_duplicate_verified_contact_does_not_modify_account(self):
        self.signup()
        response = self.post("/register", {**REGISTER, "password": "attacker password long"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.post("/login", {"identifier": REGISTER["email"], "password": PASSWORD}).status_code, 200)

    def test_pending_registration_cannot_pre_hijack_an_account(self):
        old_id, old_code = self.register(password="attacker password long")
        self.signup()
        self.assertEqual(self.post("/verify", {"challenge_id": old_id, "code": old_code}).status_code, 409)
        self.assertEqual(self.post("/login", {"identifier": REGISTER["email"], "password": "attacker password long"}).status_code, 401)

    def test_otp_attempt_limit_and_expiry(self):
        challenge, code = self.register()
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            self.assertEqual(self.post("/verify", {"challenge_id": challenge, "code": wrong}).status_code, 400)
        self.assertEqual(self.post("/verify", {"challenge_id": challenge, "code": code}).status_code, 400)
        self.assertEqual(self.post("/resend", {"challenge_id": challenge}).status_code, 400)
        challenge, code = self.register()
        db.session.get(Challenge, challenge).expires_at = now() - 1
        db.session.commit()
        self.assertEqual(self.post("/verify", {"challenge_id": challenge, "code": code}).status_code, 400)

    def test_resend_cooldown_and_code_rotation(self):
        challenge, old = self.register()
        self.assertEqual(self.post("/resend", {"challenge_id": challenge}).status_code, 429)
        db.session.get(Challenge, challenge).sent_at = now() - 61
        db.session.commit()
        with patch("auth.routes.secrets.randbelow", return_value=123456 if old != "123456" else 654321):
            self.assertEqual(self.post("/resend", {"challenge_id": challenge}).status_code, 200)
        self.assertEqual(self.post("/verify", {"challenge_id": challenge, "code": old}).status_code, 400)
        self.assertEqual(self.post("/verify", {"challenge_id": challenge, "code": self.sent[-1][2]}).status_code, 201)

    def test_refresh_rotation_replay_revokes_entire_session(self):
        tokens = self.signup()
        response = self.post("/refresh", {"refresh_token": tokens["refresh_token"]})
        self.assertEqual(response.status_code, 200)
        rotated = response.json
        self.assertNotEqual(tokens["refresh_token"], rotated["refresh_token"])
        self.assertEqual(self.client.get("/api/auth/me", headers={"Authorization": "Bearer " + tokens["access_token"]}).status_code, 401)
        self.assertEqual(self.post("/refresh", {"refresh_token": tokens["refresh_token"]}).status_code, 401)
        self.assertEqual(self.post("/refresh", {"refresh_token": rotated["refresh_token"]}).status_code, 401)

    def test_logout_revokes_access_and_refresh(self):
        tokens = self.signup()
        self.assertEqual(self.post("/logout", {"refresh_token": tokens["refresh_token"]}).status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me", headers={"Authorization": "Bearer " + tokens["access_token"]}).status_code, 401)
        self.assertEqual(self.post("/refresh", {"refresh_token": tokens["refresh_token"]}).status_code, 401)

    def test_reset_password_revokes_sessions_and_codes(self):
        tokens = self.signup()
        first = self.post("/password/forgot", {"identifier": REGISTER["email"]}).json
        first_code = self.sent[-1][2]
        second = self.post("/password/forgot", {"identifier": REGISTER["email"]}).json
        new_password = "abcdefgh"
        response = self.post("/password/reset", {"challenge_id": second["challenge_id"], "code": self.sent[-1][2], "password": new_password})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.post("/refresh", {"refresh_token": tokens["refresh_token"]}).status_code, 401)
        self.assertEqual(self.post("/login", {"identifier": REGISTER["email"], "password": PASSWORD}).status_code, 401)
        self.assertEqual(self.post("/login", {"identifier": REGISTER["email"], "password": new_password}).status_code, 200)
        self.assertEqual(self.post("/password/reset", {"challenge_id": first["challenge_id"], "code": first_code, "password": PASSWORD}).status_code, 400)

    def test_unknown_reset_has_same_shape_and_no_delivery(self):
        self.signup()
        real = self.post("/password/forgot", {"identifier": REGISTER["email"]})
        count = len(self.sent)
        unknown = self.post("/password/forgot", {"identifier": "unknown@example.com"})
        self.assertEqual(real.status_code, unknown.status_code)
        self.assertEqual(set(real.json), set(unknown.json))
        self.assertEqual(len(self.sent), count)

    def test_contact_verification_enables_phone_login(self):
        tokens = self.signup()
        challenge = self.post("/contact/request", {"channel": "sms"}, tokens["access_token"]).json
        response = self.post("/contact/verify", {"challenge_id": challenge["challenge_id"], "code": self.sent[-1][2]}, tokens["access_token"])
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["user"]["phone_verified"])
        self.assertEqual(self.post("/login", {"identifier": REGISTER["phone"], "password": PASSWORD}).status_code, 200)

    def test_delivery_failure_rolls_back_registration(self):
        with patch("auth.routes.send_code", side_effect=AuthError("Delivery failed", 503)):
            self.assertEqual(self.post("/register", REGISTER).status_code, 503)
        self.assertEqual(db.session.scalar(select(db.func.count()).select_from(Challenge)), 0)

    def test_identifier_rate_limit(self):
        for _ in range(10):
            self.assertEqual(self.post("/login", {"identifier": REGISTER["email"], "password": PASSWORD}).status_code, 401)
        response = self.post("/login", {"identifier": REGISTER["email"], "password": PASSWORD})
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response.headers)

    def social_ready(self, client="native", email_verified=False):
        started = self.post("/oauth/google/start", {"client": client}).json
        state = parse_qs(urlparse(started["authorization_url"]).query)["state"][0]
        with patch("auth.oauth.exchange_provider_code", return_value={
                "subject": "google-sub-1", "name": "Minh", "email": REGISTER["email"],
                "email_verified": email_verified}):
            response = self.client.get("/api/auth/oauth/google/callback", query_string={"state": state, "code": "code"})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.location, "https://web.example.com/login?oauth=complete" if client == "web"
                         else "nihongoflow://auth/callback")
        return started, state

    def test_google_exchange_preserves_verified_email_claim(self):
        claims = {"sub": "google-sub-1", "name": "Minh", "email": REGISTER["email"],
                  "email_verified": True, "nonce": "oauth-nonce", "azp": "client"}
        with patch("auth.oauth.requests.post") as provider_post, \
                patch("auth.oauth.jwks_client") as keys, \
                patch("auth.oauth.jwt.decode", return_value=claims):
            provider_post.return_value.json.return_value = {"id_token": "signed-token"}
            keys.return_value.get_signing_key_from_jwt.return_value.key = "public-key"
            profile = exchange_provider_code("google", "authorization-code", "oauth-nonce")
        self.assertIs(profile["email_verified"], True)

    def test_web_social_callback_returns_to_web_without_credentials_in_url(self):
        started, _ = self.social_ready(client="web")
        profile = self.post("/oauth/exchange", started)
        self.assertEqual(profile.json["status"], "profile_required")

    def test_social_state_exchange_secret_and_complete_registration(self):
        started, state = self.social_ready()
        self.assertEqual(self.client.get("/api/auth/oauth/google/callback", query_string={"state": state, "code": "code"}).status_code, 400)
        self.assertEqual(self.post("/oauth/exchange", {**started, "flow_secret": "wrong"}).status_code, 401)
        profile = self.post("/oauth/exchange", started)
        self.assertEqual(profile.json["status"], "profile_required")
        tokens = self.signup(social_token=profile.json["social_token"], password="")
        self.assertTrue(tokens["user"]["email_verified"])
        self.assertIsNone(db.session.get(User, tokens["user"]["id"]).password_hash)
        self.assertEqual(self.post("/oauth/exchange", started).status_code, 400)
        started, _ = self.social_ready()
        result = self.post("/oauth/exchange", started)
        self.assertEqual(result.json["user"]["id"], tokens["user"]["id"])

    def test_social_links_existing_account_only_after_email_code(self):
        original = self.signup()
        started, _ = self.social_ready()
        linking = self.post("/oauth/exchange", started).json
        self.assertEqual(linking["status"], "link_required")
        wrong = "000000" if self.sent[-1][2] != "000000" else "111111"
        self.assertEqual(self.post("/oauth/link/verify", {"challenge_id": linking["challenge_id"],
                         "code": wrong}).status_code, 400)
        linked = self.post("/oauth/link/verify", {"challenge_id": linking["challenge_id"],
                           "code": self.sent[-1][2]})
        self.assertEqual(linked.status_code, 200, linked.json)
        self.assertEqual(linked.json["user"]["id"], original["user"]["id"])
        self.assertEqual(self.post("/oauth/link/verify", {"challenge_id": linking["challenge_id"],
                         "code": self.sent[-1][2]}).status_code, 400)
        started, _ = self.social_ready()
        self.assertEqual(self.post("/oauth/exchange", started).json["user"]["id"], original["user"]["id"])

    def test_verified_google_email_links_existing_account_without_email_code(self):
        original = self.signup()
        sent_before_google_login = len(self.sent)
        started, _ = self.social_ready(email_verified=True)
        linked = self.post("/oauth/exchange", started)
        self.assertEqual(linked.status_code, 200, linked.json)
        self.assertEqual(linked.json["user"]["id"], original["user"]["id"])
        self.assertEqual(len(self.sent), sent_before_google_login)

        started, _ = self.social_ready(email_verified=True)
        logged_in = self.post("/oauth/exchange", started)
        self.assertEqual(logged_in.status_code, 200, logged_in.json)
        self.assertEqual(logged_in.json["user"]["id"], original["user"]["id"])
        self.assertEqual(len(self.sent), sent_before_google_login)

    def test_disabled_provider_and_bad_state(self):
        self.assertEqual(self.post("/oauth/facebook/start", {}).status_code, 503)
        self.assertEqual(self.client.get("/api/auth/oauth/google/callback?state=bad&code=bad").status_code, 400)
        response = self.client.get("/api/auth/config")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(response.json["providers"], ["google"])

    def test_expired_access_and_disabled_user(self):
        tokens = self.signup()
        session = db.session.scalar(select(AuthSession).where(AuthSession.access_hash == digest(tokens["access_token"])))
        session.access_expires_at = now() - 1
        db.session.commit()
        self.assertEqual(self.client.get("/api/auth/me", headers={"Authorization": "Bearer " + tokens["access_token"]}).status_code, 401)
        db.session.get(User, tokens["user"]["id"]).active = False
        db.session.commit()
        self.assertEqual(self.post("/refresh", {"refresh_token": tokens["refresh_token"]}).status_code, 401)
        self.assertEqual(self.post("/login", {"identifier": REGISTER["email"], "password": PASSWORD}).status_code, 401)

    def test_concurrent_verification_consumes_code_once(self):
        if not self.url.startswith("postgresql"):
            self.skipTest("PostgreSQL row-lock concurrency test")
        challenge, code = self.register()
        def verify(_):
            with self.app.test_client() as client:
                return client.post("/api/auth/verify", json={"challenge_id": challenge, "code": code}).status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = sorted(executor.map(verify, range(2)))
        self.assertEqual(statuses, [201, 400])

    def add_beta_accounts(self, count):
        db.session.add_all(User(id=f"beta-{index}", name="Existing beta",
                                email=f"outside-{index}@example.com", phone="",
                                email_verified=True, active=False)
                           for index in range(count))
        db.session.commit()

    @patch.dict(os.environ, {"BETA_MODE": "true", "BETA_REGISTRATION_MODE": "open",
                             "BETA_ACCOUNT_LIMIT": "200", "BETA_INVITE_EMAILS": ""})
    def test_public_beta_final_seat_checks_again_at_verification(self):
        self.add_beta_accounts(199)
        first, first_code = self.register()
        second, second_code = self.register(email="next@example.com", phone="0987654321")
        self.assertEqual(db.session.query(User).count(), 199)  # OTP reserves no seat.
        self.assertEqual(self.post("/verify", {"challenge_id": first, "code": first_code}).status_code, 201)
        rejected = self.post("/verify", {"challenge_id": second, "code": second_code})
        self.assertEqual(rejected.json["code"], "beta_full")
        self.assertEqual(rejected.status_code, 403)
        sent = len(self.sent)
        rejected = self.post("/register", {**REGISTER, "email": "third@example.com"})
        self.assertEqual(rejected.json["code"], "beta_full")
        self.assertEqual(len(self.sent), sent)
        self.assertEqual(db.session.query(User).count(), 200)

    @patch.dict(os.environ, {"BETA_MODE": "true", "BETA_REGISTRATION_MODE": "open",
                             "BETA_ACCOUNT_LIMIT": "200", "BETA_INVITE_EMAILS": ""})
    def test_full_public_beta_keeps_login_refresh_and_api_access(self):
        self.signup()
        self.add_beta_accounts(199)
        login = self.post("/login", {"identifier": REGISTER["email"], "password": PASSWORD})
        self.assertEqual(login.status_code, 200, login.json)
        self.assertEqual(self.client.get("/api/auth/me", headers={
            "Authorization": "Bearer " + login.json["access_token"]}).status_code, 200)
        refreshed = self.post("/refresh", {"refresh_token": login.json["refresh_token"]})
        self.assertEqual(refreshed.status_code, 200, refreshed.json)
        self.assertEqual(db.session.query(User).count(), 200)

    @patch.dict(os.environ, {"BETA_MODE": "true", "BETA_REGISTRATION_MODE": "open",
                             "BETA_ACCOUNT_LIMIT": "200", "BETA_INVITE_EMAILS": ""})
    def test_concurrent_public_beta_verifications_cannot_exceed_200(self):
        if not self.url.startswith("postgresql"):
            self.skipTest("PostgreSQL final-seat concurrency test")
        self.add_beta_accounts(199)
        first = self.register()
        second = self.register(email="next@example.com", phone="0987654321")
        def verify(challenge):
            with self.app.test_client() as client:
                response = client.post("/api/auth/verify", json={
                    "challenge_id": challenge[0], "code": challenge[1]})
                return response.status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = sorted(executor.map(verify, [first, second]))
        self.assertEqual(statuses, [201, 403])
        self.assertEqual(db.session.query(User).count(), 200)


if __name__ == "__main__":
    unittest.main()
