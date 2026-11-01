"""The beta's private disk transport must preserve the speaking audio contract."""
import os
import struct
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch
from urllib.parse import urlsplit

import test_speaking as fixtures
from extensions import db
from speaking.models import ConversationAudioAsset


class LocalAudioStorageTests(TestCase):
    setUpClass = classmethod(fixtures.SpeakingTests.setUpClass.__func__)
    tearDownClass = classmethod(fixtures.SpeakingTests.tearDownClass.__func__)
    setUp = fixtures.SpeakingTests.setUp
    tearDown = fixtures.SpeakingTests.tearDown
    scenario = fixtures.SpeakingTests.scenario
    start = fixtures.SpeakingTests.start

    @staticmethod
    def path(url):
        value = urlsplit(url)
        return value.path + ("?" + value.query if value.query else "")

    def test_signed_upload_replay_and_session_deletion(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"AUDIO_LOCAL_ROOT": directory}):
            self.app.config["PUBLIC_BASE_URL"] = "https://momonihongo.app"
            result = self.start(data={"audio_storage_enabled": True})
            self.assertEqual(result.status_code, 201)
            session = result.json["session"]["id"]
            message = result.json["opening_message"]["id"]
            pcm = b"\0" * 48000
            wave = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", 48036, b"WAVE",
                b"fmt ", 16, 1, 1, 24000, 48000, 2, 16, b"data", 48000) + pcm
            base = f"/api/speaking/sessions/{session}"
            headers = {"Authorization": "Bearer alice"}
            prepared = self.client.post(f"{base}/messages/{message}/audio-upload",
                json={"size_bytes": len(wave), "duration_ms": 1000, "sample_rate": 24000}, headers=headers)
            self.assertEqual(prepared.status_code, 200, prepared.json)
            asset = prepared.json["asset"]["id"]
            upload = self.path(prepared.json["upload_url"])
            self.assertEqual(self.client.put(upload, data=wave, content_type="audio/wav").status_code, 204)
            self.assertEqual(self.client.put(upload.split("?", 1)[0] + "?token=invalid",
                data=wave, content_type="audio/wav").status_code, 403)
            completed = self.client.post(f"{base}/audio/{asset}/complete", json={}, headers=headers)
            self.assertEqual(completed.status_code, 200, completed.json)
            self.assertEqual(db.session.get(ConversationAudioAsset, asset).status, "ready")
            playback = self.client.get(f"{base}/audio/{asset}/playback", headers=headers)
            self.assertEqual(playback.status_code, 200, playback.json)
            response = self.client.get(self.path(playback.json["url"]))
            self.assertEqual(response.data, wave)
            response.close()
            self.assertEqual(self.client.put(upload, data=wave, content_type="audio/wav").status_code, 400)
            self.assertEqual(self.client.delete(base, headers=headers).status_code, 200)
            self.assertFalse((Path(directory) / "sessions" / session).exists())
