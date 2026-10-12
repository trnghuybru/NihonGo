import os
import uuid
from datetime import timedelta
from unittest import TestCase, skipUnless
from unittest.mock import patch, MagicMock
from sqlalchemy import text

import test_speaking as fixtures
from api_errors import ApiError
from extensions import db
from speaking import storage
from speaking.deletion import cleanup_deleted_sessions
from speaking.models import ConversationSession, ConversationMessage, ConversationAudioAsset, SessionEvaluation, utc_now


class DeletionTests(TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SpeakingTests.setUpClass.__func__(cls)
        # Match PostgreSQL FK behavior in the default in-memory test database.
        with cls.app.app_context():
            if db.engine.dialect.name == "sqlite":
                with db.engine.connect() as connection:
                    connection.execute(text("PRAGMA foreign_keys=ON"))
                    connection.commit()
    tearDownClass = classmethod(fixtures.SpeakingTests.tearDownClass.__func__)
    setUp = fixtures.SpeakingTests.setUp
    tearDown = fixtures.SpeakingTests.tearDown
    scenario = fixtures.SpeakingTests.scenario
    start = fixtures.SpeakingTests.start

    def remove(self, identifier, token="alice", **kwargs):
        return self.client.delete(f"/api/speaking/sessions/{identifier}",
                                  headers={"Authorization": f"Bearer {token}"}, **kwargs)

    def audio_session(self):
        result = self.start(data={"audio_storage_enabled": True}).json
        identifier, message_id = result["session"]["id"], result["opening_message"]["id"]
        db.session.add(ConversationAudioAsset(session_id=identifier, message_id=message_id,
            asset_type="utterance", storage_key=f"sessions/{identifier}/{message_id}.wav", mime_type="audio/wav",
            status="ready", size_bytes=48044, duration_ms=1000))
        db.session.add(SessionEvaluation(session_id=identifier, rubric_version="text-v1", status="failed", error_message="Test"))
        db.session.commit()
        return identifier

    def test_only_owner_can_delete_and_payload_cannot_choose_storage_keys(self):
        identifier = self.start().json["session"]["id"]
        self.assertEqual(self.remove(identifier, "bob").status_code, 404)
        self.assertEqual(self.remove(identifier, "invalid").status_code, 401)
        self.assertEqual(self.remove("bad-id").status_code, 400)
        self.assertEqual(self.remove(identifier, json={"storage_key": "other"}).status_code, 400)
        self.assertIsNotNone(db.session.get(ConversationSession, identifier))

    def test_no_audio_session_is_removed_with_transcript_and_evaluation(self):
        identifier = self.start().json["session"]["id"]
        db.session.add(SessionEvaluation(session_id=identifier, rubric_version="text-v1", status="failed"))
        db.session.commit()
        with patch("speaking.deletion.delete_session_audio") as cleanup:
            self.assertEqual(self.remove(identifier).json, {"deleted": True, "audio_cleanup_pending": False})
            cleanup.assert_not_called()
        self.assertIsNone(db.session.get(ConversationSession, identifier))
        self.assertEqual(db.session.query(ConversationMessage).filter_by(session_id=identifier).count(), 0)
        self.assertEqual(db.session.query(SessionEvaluation).filter_by(session_id=identifier).count(), 0)

    def test_audio_deletion_hides_session_immediately_and_final_sweep_cascades_metadata(self):
        identifier = self.audio_session()
        with patch("speaking.deletion.delete_session_audio") as cleanup:
            self.assertEqual(self.remove(identifier).status_code, 200)
            cleanup.assert_called_once_with(identifier)
            for suffix in ("", "/messages", "/evaluation"):
                self.assertEqual(self.client.get(f"/api/speaking/sessions/{identifier}{suffix}", headers={"Authorization": "Bearer alice"}).status_code, 404)
            self.assertEqual(self.client.get("/api/speaking/sessions", headers={"Authorization": "Bearer alice"}).json["pagination"]["total"], 0)
            self.assertEqual(cleanup_deleted_sessions(), 0)
            session = db.session.get(ConversationSession, identifier)
            session.audio_cleanup_after = utc_now() - timedelta(seconds=1)
            db.session.commit()
            self.assertEqual(cleanup_deleted_sessions(), 1)
        self.assertIsNone(db.session.get(ConversationSession, identifier))
        self.assertEqual(db.session.query(ConversationAudioAsset).filter_by(session_id=identifier).count(), 0)
        self.assertEqual(db.session.query(SessionEvaluation).filter_by(session_id=identifier).count(), 0)

    def test_storage_failure_keeps_durable_deletion_and_retry_job(self):
        identifier = self.audio_session()
        with patch("speaking.deletion.delete_session_audio", side_effect=ApiError("Storage down", 503)):
            self.assertTrue(self.remove(identifier).json["audio_cleanup_pending"])
            session = db.session.get(ConversationSession, identifier)
            self.assertIsNotNone(session.deleted_at)
            session.audio_cleanup_after = utc_now() - timedelta(seconds=1)
            db.session.commit()
            self.assertEqual(cleanup_deleted_sessions(), 0)
            self.assertIsNotNone(db.session.get(ConversationSession, identifier))
        with patch("speaking.deletion.delete_session_audio"):
            self.assertEqual(cleanup_deleted_sessions(), 1)

    def test_storage_delete_checks_partial_errors_and_limits_to_session_prefix(self):
        client = MagicMock()
        client.list_objects_v2.return_value = {"Contents": [{"Key": "sessions/target/audio.wav"}]}
        client.delete_objects.return_value = {"Errors": [{"Code": "AccessDenied"}]}
        with patch("speaking.storage.client", return_value=client), patch("speaking.storage.bucket", return_value="test"):
            with self.assertRaises(ApiError):
                storage.delete_session_audio("target")
        self.assertEqual(client.list_objects_v2.call_args.kwargs["Prefix"], "sessions/target/")

    @skipUnless(os.getenv("TEST_S3_ENDPOINT_URL"), "Requires real local S3")
    def test_real_s3_deletes_target_audio_and_late_upload_without_touching_other_prefix(self):
        identifier = self.audio_session()
        bucket = "test-delete-" + uuid.uuid4().hex
        endpoint = os.environ["TEST_S3_ENDPOINT_URL"]
        with patch.dict(os.environ, {"S3_BUCKET": bucket, "S3_ENDPOINT_URL": endpoint, "S3_ADDRESSING_STYLE": "path",
            "AWS_ACCESS_KEY_ID": os.environ["TEST_S3_ACCESS_KEY_ID"], "AWS_SECRET_ACCESS_KEY": os.environ["TEST_S3_SECRET_ACCESS_KEY"]}):
            connection = storage.client()
            connection.create_bucket(Bucket=bucket)
            key = f"sessions/{identifier}/audio.wav"
            other = "sessions/other/audio.wav"
            try:
                for name in (key, other):
                    connection.put_object(Bucket=bucket, Key=name, Body=b"audio probe")
                self.assertEqual(self.remove(identifier).status_code, 200)
                self.assertEqual(connection.list_objects_v2(Bucket=bucket, Prefix=f"sessions/{identifier}/").get("KeyCount"), 0)
                # Simulate an already-signed upload finishing after the initial sweep.
                connection.put_object(Bucket=bucket, Key=key, Body=b"late upload")
                session = db.session.get(ConversationSession, identifier)
                session.audio_cleanup_after = utc_now() - timedelta(seconds=1)
                db.session.commit()
                self.assertEqual(cleanup_deleted_sessions(), 1)
                self.assertEqual(connection.list_objects_v2(Bucket=bucket, Prefix=f"sessions/{identifier}/").get("KeyCount"), 0)
                self.assertEqual(connection.get_object(Bucket=bucket, Key=other)["Body"].read(), b"audio probe")
            finally:
                for obj in connection.list_objects_v2(Bucket=bucket).get("Contents", []):
                    connection.delete_object(Bucket=bucket, Key=obj["Key"])
                connection.delete_bucket(Bucket=bucket)
