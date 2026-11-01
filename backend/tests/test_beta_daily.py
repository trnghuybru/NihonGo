"""Daily video and Live limits are independent of the old USD wallet."""
import os
import unittest
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import test_speaking as fixtures
from api_errors import ApiError
from beta_daily.service import finish_live, reserve_live, reserve_video, status
from extensions import db
from shadowing import init_shadowing
from shadowing.models import ShadowingJob
from video_examples.models import CaptionSegment, ExampleVideo


class DailyQuotaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SpeakingTests.setUpClass.__func__(cls)
        init_shadowing(cls.app)
        with cls.app.app_context():
            db.create_all()

    tearDownClass = classmethod(fixtures.SpeakingTests.tearDownClass.__func__)
    setUp = fixtures.SpeakingTests.setUp
    tearDown = fixtures.SpeakingTests.tearDown
    scenario = fixtures.SpeakingTests.scenario

    def test_one_new_video_per_vietnamese_day(self):
        zone = ZoneInfo("Asia/Ho_Chi_Minh")
        with patch("beta_daily.service.clock", return_value=datetime(2026, 10, 31, 23, 59, tzinfo=zone)):
            reserve_video("alice", "abcdefghijk")
            db.session.commit()
            reserve_video("alice", "abcdefghijk")
            db.session.commit()
            self.assertEqual(status("alice")["video_remaining"], 0)
            with self.assertRaises(ApiError) as error:
                reserve_video("alice", "different01")
            self.assertEqual(error.exception.code, "daily_video_limit")
            db.session.rollback()
            self.assertEqual(status("bob")["video_remaining"], 1)
        with patch("beta_daily.service.clock", return_value=datetime(2026, 11, 1, 0, 1, tzinfo=zone)):
            self.assertEqual(status("alice")["video_remaining"], 1)

    def test_two_live_sessions_and_failed_handshake_does_not_count(self):
        first = reserve_live("alice")
        self.assertEqual(status("alice")["live_remaining"], 1)
        finish_live(first, started=False)
        self.assertEqual(status("alice")["live_remaining"], 2)
        first = reserve_live("alice")
        finish_live(first, started=True)
        second = reserve_live("alice")
        finish_live(second, started=True)
        self.assertEqual(status("alice")["live_remaining"], 0)
        with self.assertRaises(ApiError) as error:
            reserve_live("alice")
        self.assertEqual(error.exception.code, "daily_live_limit")
        db.session.rollback()

    def test_new_shadowing_video_uses_daily_quota(self):
        environment = {"BETA_MODE": "true", "BETA_QUOTA_MODE": "daily",
                       "BETA_INVITE_EMAILS": "alice@example.com,bob@example.com"}
        with patch.dict(os.environ, environment), patch("shadowing.queue.enqueue", return_value=False):
            one = self.client.post("/api/listening/shadowing/jobs",
                json={"url": "https://youtu.be/abcdefghijk"},
                headers={"Authorization": "Bearer alice"})
            self.assertEqual(one.status_code, 202, one.json)
            again = self.client.post("/api/listening/shadowing/jobs",
                json={"url": "https://youtu.be/abcdefghijk"},
                headers={"Authorization": "Bearer alice"})
            self.assertEqual(again.status_code, 202, again.json)
            other = self.client.post("/api/listening/shadowing/jobs",
                json={"url": "https://youtu.be/another0001"},
                headers={"Authorization": "Bearer alice"})
            self.assertEqual(other.status_code, 429, other.json)
            self.assertEqual(other.json["code"], "daily_video_limit")

    def test_subtitle_translation_shares_the_same_video_allowance(self):
        for index, video_id in enumerate(("translate01", "translate02")):
            db.session.add(ExampleVideo(id=video_id, title="Video test", channel="Test",
                duration_seconds=2, language="ja", caption_kind="manual"))
            db.session.add(ShadowingJob(id=f"translation-job-{index}", video_id=video_id,
                status="ready", title="Test", created_at=100, updated_at=100))
            db.session.add(CaptionSegment(id=f"sentence-{index}", video_id=video_id,
                sequence=1, text="こんにちは。", search_text="こんにちは。",
                start_seconds=0, end_seconds=1))
        db.session.commit()
        environment = {"BETA_MODE": "true", "BETA_QUOTA_MODE": "daily",
                       "BETA_INVITE_EMAILS": "alice@example.com,bob@example.com",
                       "GEMINI_PROVIDER": "developer", "GEMINI_API_KEY": "test-key"}
        with patch.dict(os.environ, environment), patch("shadowing.translation.enqueue", return_value=False):
            reserve_video("alice", "translate01")
            db.session.commit()
            first = self.client.post("/api/listening/shadowing/jobs/translation-job-0/translation",
                json={}, headers={"Authorization": "Bearer alice"})
            self.assertEqual(first.status_code, 202, first.json)
            repeat = self.client.post("/api/listening/shadowing/jobs/translation-job-0/translation",
                json={}, headers={"Authorization": "Bearer alice"})
            self.assertEqual(repeat.status_code, 202, repeat.json)
            second = self.client.post("/api/listening/shadowing/jobs/translation-job-1/translation",
                json={}, headers={"Authorization": "Bearer alice"})
            self.assertEqual(second.status_code, 429, second.json)
            self.assertEqual(second.json["code"], "daily_video_limit")
