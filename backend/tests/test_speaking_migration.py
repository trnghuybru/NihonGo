"""Exercise real PostgreSQL migrations inside a disposable schema.

Run with TEST_DATABASE_URL set to a PostgreSQL psycopg URL.
"""
import os
from pathlib import Path
import unittest
import uuid
from datetime import timedelta

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from flask import Flask
from flask_migrate import downgrade, upgrade
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from auth import init_auth
from auth.models import User
from learning.models import LearningPreferences  # Register existing metadata.
from extensions import db
from speaking.models import (
    ConversationAudioAsset, ConversationMessage, ConversationSession,
    EvaluationCriterion, EvaluationScore, MatchmakingRequest, Room,
    RoomMember, Scenario, ScenarioCategory, ScenarioRole, SessionEvaluation,
    utc_now,
)

MIGRATIONS = str(Path(__file__).resolve().parents[1] / "migrations")


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL", "").startswith("postgresql"),
                     "TEST_DATABASE_URL must point to PostgreSQL")
class SpeakingMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = "test_speaking_" + uuid.uuid4().hex
        url = os.environ["TEST_DATABASE_URL"].replace("postgresql://", "postgresql+psycopg://", 1)
        cls.admin = sa.create_engine(url)
        with cls.admin.begin() as connection:
            connection.execute(sa.text(f'CREATE SCHEMA "{cls.schema}"'))
        cls.app = Flask(__name__)
        cls.app.config.update(
            TESTING=True, SQLALCHEMY_DATABASE_URI=url,
            SQLALCHEMY_ENGINE_OPTIONS={"connect_args": {"options": f"-csearch_path={cls.schema}"}},
        )
        try:
            init_auth(cls.app)
            with cls.app.app_context():
                upgrade(directory=MIGRATIONS)
        except Exception:
            cls.cleanup_schema()
            raise

    @classmethod
    def cleanup_schema(cls):
        with cls.admin.begin() as connection:
            connection.execute(sa.text(f'DROP SCHEMA "{cls.schema}" CASCADE'))
        cls.admin.dispose()

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            db.session.remove()
            db.engine.dispose()
        cls.cleanup_schema()

    def setUp(self):
        self.context = self.app.app_context()
        self.context.push()
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(sa.delete(table))
        db.session.add(User(id="test-user", name="Test", email="test@example.com",
                            phone="+84912345678"))
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        self.context.pop()

    def insert(self, model, **values):
        result = db.session.execute(sa.insert(model.__table__).values(**values))
        return result.inserted_primary_key[0]

    def scenario(self):
        category = self.insert(ScenarioCategory, name=uuid.uuid4().hex)
        scenario = self.insert(Scenario, category_id=category, title="Interview",
                               description="Practice", context="Job interview",
                               learning_objectives="Answer questions", language_code="ja-JP",
                               difficulty_level="N4", estimated_duration_minutes=10)
        role = self.insert(ScenarioRole, scenario_id=scenario, name="Interviewer",
                           description="Employer", ai_instructions="Ask interview questions")
        return scenario, role

    def session(self, scenario, role, **values):
        return self.insert(ConversationSession, user_id="test-user", scenario_id=scenario,
                           scenario_role_id=role, scenario_snapshot={"title": "Interview"}, **values)

    def room(self):
        return self.insert(Room, created_by="test-user", title="Practice",
                           language_code="ja-JP", difficulty_level="N4")

    def reject(self, model, **values):
        with self.assertRaises(IntegrityError):
            with db.session.begin_nested():
                self.insert(model, **values)

    def test_schema_matches_models(self):
        with db.engine.connect() as connection:
            context = MigrationContext.configure(connection, opts={"compare_server_default": True})
            self.assertEqual(compare_metadata(context, db.metadata), [])

    def test_downgrade_preserves_existing_data_and_can_upgrade_again(self):
        db.session.commit()
        downgrade(directory=MIGRATIONS, revision="ab7248e36f10")
        tables = sa.inspect(db.engine).get_table_names()
        self.assertIn("users", tables)
        self.assertIn("learning_preferences", tables)
        self.assertNotIn("conversation_sessions", tables)
        self.assertIsNotNone(db.session.get(User, "test-user"))
        db.session.remove()
        upgrade(directory=MIGRATIONS)
        self.test_schema_matches_models()

    def test_role_and_audio_cannot_reference_another_scenario_or_session(self):
        scenario, role = self.scenario()
        other_scenario, other_role = self.scenario()
        self.reject(ConversationSession, user_id="test-user", scenario_id=scenario,
                    scenario_role_id=other_role, scenario_snapshot={})
        first = self.session(scenario, role)
        second = self.session(other_scenario, other_role)
        message = self.insert(ConversationMessage, session_id=first, sequence_number=1,
                              speaker="user", input_mode="voice", occurred_at=utc_now())
        self.reject(ConversationAudioAsset, session_id=second, message_id=message,
                    asset_type="utterance", storage_key="wrong-parent", mime_type="audio/webm")

    def test_only_one_search_per_user_and_one_active_host_per_room(self):
        values = dict(user_id="test-user", language_code="ja-JP", own_level="N4",
                      expires_at=utc_now() + timedelta(minutes=5))
        request = self.insert(MatchmakingRequest, **values)
        self.reject(MatchmakingRequest, **values)
        db.session.execute(sa.update(MatchmakingRequest).where(MatchmakingRequest.id == request)
                           .values(status="cancelled", cancelled_at=utc_now()))
        self.insert(MatchmakingRequest, **values)
        db.session.add(User(id="second-user", name="Second", email="second@example.com",
                            phone="+84912345679"))
        db.session.flush()
        room = self.room()
        member = self.insert(RoomMember, room_id=room, user_id="test-user", role="host")
        self.reject(RoomMember, room_id=room, user_id="second-user", role="host")
        db.session.execute(sa.update(RoomMember).where(RoomMember.id == member).values(status="left"))
        self.insert(RoomMember, room_id=room, user_id="second-user", role="host")

    def test_session_delete_cascades_and_retains_retry(self):
        scenario, role = self.scenario()
        session = self.session(scenario, role)
        retry = self.session(scenario, role, retry_of_session_id=session)
        message = self.insert(ConversationMessage, session_id=session, sequence_number=1,
                              speaker="user", input_mode="voice", occurred_at=utc_now())
        self.insert(ConversationAudioAsset, session_id=session, message_id=message,
                    asset_type="utterance", storage_key="recording.webm", mime_type="audio/webm")
        evaluation = self.insert(SessionEvaluation, session_id=session, rubric_version="v1")
        criterion = self.insert(EvaluationCriterion, code="fluency", name="Fluency", description="Flow")
        self.insert(EvaluationScore, evaluation_id=evaluation, criterion_id=criterion,
                    criterion_name_snapshot="Fluency", weight=1, score=80, feedback="Good")
        db.session.execute(sa.delete(ConversationSession).where(ConversationSession.id == session))
        for model in (ConversationMessage, ConversationAudioAsset, SessionEvaluation, EvaluationScore):
            self.assertEqual(db.session.scalar(sa.select(sa.func.count()).select_from(model)), 0)
        self.assertIsNone(db.session.get(ConversationSession, retry).retry_of_session_id)

    def test_invalid_score_and_incomplete_match_are_rejected(self):
        scenario, role = self.scenario()
        session = self.session(scenario, role)
        self.reject(SessionEvaluation, session_id=session, rubric_version="v1", overall_score=101)
        self.reject(SessionEvaluation, session_id=session, rubric_version="v1", status="completed")
        self.reject(MatchmakingRequest, user_id="test-user", language_code="ja-JP", own_level="N4",
                    expires_at=utc_now() + timedelta(minutes=5), status="matched")


if __name__ == "__main__":
    unittest.main()
