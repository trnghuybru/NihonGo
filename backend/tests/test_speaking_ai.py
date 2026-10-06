"""Provider boundary tests do not send real AI requests."""
import os
import unittest
from unittest.mock import MagicMock, patch

import requests

from api_errors import ApiError
from speaking.ai import build_scenario_system_prompt, generate_reply

SNAPSHOT = {"title": "Interview", "context": "Office", "language_code": "ja-JP",
            "difficulty_level": "N3", "learning_objectives": "Experience",
            "role": {"name": "Interviewer", "ai_instructions": "PRIVATE ROLE"}}


class SpeakingAITests(unittest.TestCase):
    def test_provider_rate_limit_is_returned_with_a_safe_retry_delay(self):
        for header, expected in (("12", 12), ("", 30), ("invalid", 30), ("900", 300)):
            response = MagicMock(status_code=429, headers={"Retry-After": header})
            response.__enter__.return_value = response
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "server-key"}), \
                    patch("speaking.ai.requests.post", return_value=response):
                with self.assertRaises(ApiError) as error:
                    generate_reply(SNAPSHOT, [])
            self.assertEqual(error.exception.status, 429)
            self.assertEqual(error.exception.code, "ai_rate_limited")
            self.assertEqual(error.exception.details["retry_after"], expected)
            self.assertIn(str(expected), error.exception.message)
            response.json.assert_not_called()

    def test_provider_uses_saved_role_and_server_configuration(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.json.return_value = {"choices": [{"message": {"content": "こんにちは！"}}]}
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "server-key", "OPENROUTER_MODEL": "configured-model"}), \
                patch("speaking.ai.requests.post", return_value=response) as post:
            self.assertEqual(generate_reply(SNAPSHOT, [{"role": "user", "content": "こんにちは"}]), "こんにちは！")
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["model"], "configured-model")
        self.assertIn("PRIVATE ROLE", payload["messages"][0]["content"])
        self.assertEqual(payload["messages"][0]["role"], "system")
        for value in ("Interview", "Office", "Experience", "Interviewer", "ja-JP", "N3"):
            self.assertIn(value, payload["messages"][0]["content"])
        self.assertEqual(payload["messages"][-1]["content"], "こんにちは")
        self.assertFalse(payload["stream"])
        self.assertEqual(payload["reasoning"], {"enabled": False, "exclude": True})
        self.assertEqual(payload["max_tokens"], 256)

    def test_default_model_returns_only_dialogue_not_reasoning(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.json.return_value = {"choices": [{"message": {
            "content": "ご注文は？", "reasoning": "PRIVATE THINKING"}}]}
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "server-key", "OPENROUTER_MODEL": ""}), \
                patch("speaking.ai.requests.post", return_value=response) as post:
            self.assertEqual(generate_reply(SNAPSHOT, []), "ご注文は？")
        self.assertEqual(post.call_args.kwargs["json"]["model"], "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free")

    def test_prompt_changes_with_scenario_role_and_level(self):
        restaurant = {**SNAPSHOT, "title": "Restaurant", "context": "Taking an order",
                      "difficulty_level": "beginner", "role": {
                          "name": "Waiter", "ai_instructions": "Ask about drinks"}}
        prompt = build_scenario_system_prompt(restaurant)
        for value in ("Restaurant", "Taking an order", "Waiter", "Ask about drinks", "JLPT N5"):
            self.assertIn(value, prompt)
        self.assertNotIn("Interviewer", prompt)
        self.assertNotIn("PRIVATE ROLE", prompt)
        self.assertIn("JLPT N2/N1", build_scenario_system_prompt({**SNAPSHOT, "difficulty_level": "N1"}))
        self.assertNotIn("JLPT", build_scenario_system_prompt({**SNAPSHOT, "language_code": "vi-VN"}))

    def test_missing_credentials_never_generate_mock_content(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": ""}), patch("speaking.ai.requests.post") as post:
            with self.assertRaises(ApiError) as error:
                generate_reply(SNAPSHOT, [])
        self.assertEqual(error.exception.code, "ai_unavailable")
        post.assert_not_called()

    def test_timeout_and_provider_errors_are_safe(self):
        for failure, status in ((requests.Timeout("private-key"), 504), (requests.HTTPError("private-key"), 502)):
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "server-key"}), \
                    patch("speaking.ai.requests.post", side_effect=failure):
                with self.assertRaises(ApiError) as error:
                    generate_reply(SNAPSHOT, [])
                self.assertEqual(error.exception.status, status)
                self.assertNotIn("private-key", str(error.exception))

    def test_empty_or_malformed_completion_is_rejected(self):
        for data in ({"choices": []}, {"choices": [{"message": {"content": ""}}]}, {"error": "provider failed"}):
            response = MagicMock()
            response.__enter__.return_value = response
            response.json.return_value = data
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "server-key"}), \
                    patch("speaking.ai.requests.post", return_value=response):
                with self.assertRaises(ApiError) as error:
                    generate_reply(SNAPSHOT, [])
                self.assertEqual(error.exception.status, 502)


if __name__ == "__main__":
    unittest.main()
