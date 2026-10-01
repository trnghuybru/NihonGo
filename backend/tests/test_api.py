import unittest
import json
from unittest.mock import patch
from app import app

class TestFlaskEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_index_health_check(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "Voice AI Backend")

    def test_voice_stream_no_messages(self):
        response = self.client.post("/api/chat/voice-stream", json={})
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertIn("error", data)

    @patch("services.llm_service.requests.post")
    def test_voice_stream_mock_openrouter(self, mock_post):
        # Mocking OpenRouter SSE chunks
        mock_response = unittest.mock.MagicMock()
        mock_response.status_code = 200
        mock_response.iter_lines.return_value = [
            b'data: {"choices": [{"delta": {"content": "Xin c"}}]}',
            b'data: {"choices": [{"delta": {"content": "h\xc3\xa0o b\xe1\xba\xa1n!"}}]}',
            b'data: [DONE]',
        ]
        mock_post.return_value = mock_response

        payload = {
            "messages": [
                {"role": "user", "content": "Xin chào"}
            ],
            "api_key": "dummy_test_key"
        }

        response = self.client.post(
            "/api/chat/voice-stream",
            json=payload,
            headers={"Content-Type": "application/json"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "text/event-stream")
        
        # Read the streamed lines
        stream_data = response.get_data(as_text=True)
        self.assertIn('data: {"content": "Xin c"}', stream_data)
        self.assertIn('data: [DONE]', stream_data)

if __name__ == "__main__":
    unittest.main()

