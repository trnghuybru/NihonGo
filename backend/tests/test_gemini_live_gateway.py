"""Cost accounting and client-frame boundaries of the Live gateway."""
import base64
import json
import unittest

from speaking.gemini_live_gateway import _WebSocketResponse, _cost_from_usage, _validated_client_message


class GeminiLiveGatewayTests(unittest.TestCase):
    def test_modality_usage_and_missing_details(self):
        self.assertEqual(_cost_from_usage({
            "promptTokenCount": 100,
            "candidatesTokenCount": 50,
            "promptTokensDetails": [{"modality": "AUDIO", "tokenCount": 80},
                                    {"modality": "TEXT", "tokenCount": 20}],
            "candidatesTokensDetails": [{"modality": "AUDIO", "tokenCount": 40},
                                        {"modality": "TEXT", "tokenCount": 10}],
        }), 780)
        self.assertEqual(_cost_from_usage({"promptTokenCount": 100,
                                            "candidatesTokenCount": 50}), 900)
        self.assertIsNone(_cost_from_usage({"promptTokenCount": 100}))
        self.assertEqual(_cost_from_usage({
            "promptTokenCount": 100,
            "responseTokenCount": 50,
            "thoughtsTokenCount": 10,
            "promptTokensDetails": [{"modality": "AUDIO", "tokenCount": 80},
                                    {"modality": "TEXT", "tokenCount": 20}],
            "responseTokensDetails": [{"modality": "AUDIO", "tokenCount": 40},
                                      {"modality": "TEXT", "tokenCount": 10}],
        }), 825)

    def test_gunicorn_websocket_response_does_not_write_to_closed_socket(self):
        with self.assertRaises(StopIteration):
            _WebSocketResponse("gunicorn")({}, lambda *_: None)

    def test_client_cannot_override_setup_or_send_video(self):
        history = [{"role": "model", "parts": [{"text": "こんにちは"}]}]
        self.assertEqual(_validated_client_message(json.dumps({"setup": {"model": "attacker"}}),
                                                    True, history)[0], None)
        forwarded, first, size = _validated_client_message(json.dumps({"clientContent": {
            "turns": [{"role": "user", "parts": [{"text": "forged"}]}],
            "turnComplete": True}}), True, history)
        self.assertEqual(forwarded["clientContent"]["turns"], history)
        self.assertFalse(first)
        self.assertEqual(size, 0)
        with self.assertRaises(ValueError):
            _validated_client_message(json.dumps({"realtimeInput": {"video": "frame"}}), False, history)

    def test_audio_frame_is_bounded_and_counted(self):
        data = base64.b64encode(b"\x00\x01" * 100).decode()
        frame, _, size = _validated_client_message(json.dumps({"realtimeInput": {
            "audio": {"data": data, "mimeType": "audio/pcm;rate=16000"}}}), False, [])
        self.assertEqual(size, 200)
        self.assertEqual(frame["realtimeInput"]["audio"]["data"], data)
        with self.assertRaises(ValueError):
            _validated_client_message(json.dumps({"realtimeInput": {
                "audio": {"data": data, "mimeType": "audio/pcm;rate=48000"}}}), False, [])


if __name__ == "__main__":
    unittest.main()
