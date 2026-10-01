"""Learning API integration tests; PostgreSQL uses an isolated disposable schema."""
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from flask import Flask
from sqlalchemy import create_engine, delete, text
from sqlalchemy.exc import OperationalError

from auth import init_auth
from auth.models import AuthSession, User, now
from auth.security import digest
from extensions import db
from learning import init_learning
from learning.models import LearningPreferences

PATH = "/api/learning/preferences"
VALID = {"level": "N5", "goal": "communication", "daily_minutes": 15,
         "level_confirmed": True, "version": 0}


class LearningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.url = os.getenv("TEST_DATABASE_URL", "sqlite://")
        cls.admin = None
        cls.app = Flask(__name__)
        cls.app.config.update(TESTING=True, AUTH_CONFIGURED=True,
                              AUTH_SECRET_KEY="learning-test-" * 4, SQLALCHEMY_DATABASE_URI=cls.url)
        if cls.url.startswith("postgresql"):
            cls.schema = "test_learning_" + uuid.uuid4().hex
            cls.admin = create_engine(cls.url)
            with cls.admin.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
            cls.app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
                "connect_args": {"options": f"-csearch_path={cls.schema}"}}
        init_auth(cls.app)
        init_learning(cls.app)
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
            db.session.add(User(id=key, name=key, email=f"{key}@example.com", phone="+84912345678",
                                email_verified=True))
        db.session.flush()
        for key in ("alice", "bob"):
            db.session.add(AuthSession(user_id=key, access_hash=digest(key),
                                       access_expires_at=now() + 900, expires_at=now() + 3600))
        db.session.commit()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        self.context.pop()

    def get(self, token="alice"):
        return self.client.get(PATH, headers={"Authorization": f"Bearer {token}"})

    def put(self, data=None, token="alice"):
        return self.client.put(PATH, json=VALID if data is None else data,
                               headers={"Authorization": f"Bearer {token}"})

    def test_missing_profile_is_not_implicitly_created(self):
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json["profile"])
        self.assertEqual(len(response.json["options"]["levels"]), 6)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(db.session.query(LearningPreferences).count(), 0)

    def test_confirm_save_reload_update_and_user_isolation(self):
        response = self.put()
        self.assertEqual(response.status_code, 200, response.json)
        profile = response.json["profile"]
        self.assertEqual(profile["version"], 1)
        self.assertEqual(profile["level_source"], "manual")
        self.assertLessEqual(profile["level_confirmed_at"], now())
        self.assertNotIn("user_id", profile)
        self.assertEqual(self.get().json["profile"], profile)
        self.assertIsNone(self.get("bob").json["profile"])
        updated = self.put({**VALID, "version": 1, "level": "N4", "goal": "jlpt", "daily_minutes": 30})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json["profile"]["version"], 2)
        self.assertEqual(updated.json["profile"]["created_at"], profile["created_at"])
        self.assertEqual(self.get().json["profile"]["daily_minutes"], 30)

    def test_authentication_and_account_status_are_required(self):
        for token in ("", "bad"):
            self.assertEqual(self.get(token).status_code, 401)
            self.assertEqual(self.put(token=token).status_code, 401)
        user = db.session.get(User, "alice")
        user.active = False
        db.session.commit()
        self.assertEqual(self.put().status_code, 401)
        self.assertEqual(db.session.query(LearningPreferences).count(), 0)

    def test_invalid_or_unconfirmed_input_never_changes_saved_profile(self):
        self.put()
        invalid = [[], {}, {**VALID, "user_id": "bob"}]
        invalid.extend({**VALID, "version": 1, **override} for override in (
            {"level": []}, {"level": "N0"}, {"goal": None}, {"goal": "other"},
            {"daily_minutes": True}, {"daily_minutes": 15.0}, {"daily_minutes": "15"},
            {"daily_minutes": 0}, {"daily_minutes": 999}, {"level_confirmed": False},
            {"level_confirmed": 1}, {"version": -1}, {"version": True}, {"version": 2**40},
        ))
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertEqual(self.put(payload).status_code, 400)
        self.assertEqual(self.client.put(PATH, data="{broken", content_type="application/json",
                                         headers={"Authorization": "Bearer alice"}).status_code, 400)
        self.assertEqual(self.get().json["profile"]["version"], 1)

    def test_stale_update_cannot_overwrite_newer_preferences(self):
        self.put()
        response = self.put({**VALID, "level": "N1"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json["code"], "preferences_conflict")
        self.assertEqual(self.get().json["profile"]["level"], "N5")

    def test_database_failure_is_retryable_json_not_missing_profile(self):
        with patch("learning.routes.save_preferences", side_effect=OperationalError("query", {}, Exception())):
            response = self.put()
        self.assertEqual(response.status_code, 503)
        self.assertIn("error", response.json)
        self.assertNotIn("profile", response.json)

    def test_concurrent_first_save_and_updates_do_not_lose_changes(self):
        if not self.url.startswith("postgresql"):
            self.skipTest("PostgreSQL row-lock concurrency test")
        for version in (0, 1):
            def save(index):
                with self.app.test_client() as client:
                    return client.put(PATH, json={**VALID, "version": version, "goal": ("work", "travel")[index]},
                                      headers={"Authorization": "Bearer alice"}).status_code
            with ThreadPoolExecutor(max_workers=2) as executor:
                statuses = sorted(executor.map(save, range(2)))
            self.assertEqual(statuses, [200, 409])
            db.session.expire_all()
            self.assertEqual(self.get().json["profile"]["version"], version + 1)
