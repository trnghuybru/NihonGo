import copy
import json
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from datetime import timedelta
from unittest.mock import patch, MagicMock

import requests
from sqlalchemy import select

import test_speaking as fixtures
from api_errors import ApiError
from extensions import db
from speaking.evaluation_ai import generate_evaluation, validate_result, parse_result, SYSTEM_PROMPT
from speaking.models import (ConversationMessage, ConversationSession, ConversationAudioAsset,
                             SessionEvaluation, EvaluationScore, utc_now)


class EvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SpeakingTests.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        fixtures.SpeakingTests.tearDownClass.__func__(cls)

    setUp = fixtures.SpeakingTests.setUp
    tearDown = fixtures.SpeakingTests.tearDown
    scenario = fixtures.SpeakingTests.scenario
    start = fixtures.SpeakingTests.start

    def post(self, identifier, suffix, token="alice", **kwargs):
        return self.client.post(f"/api/speaking/sessions/{identifier}/{suffix}",
                                json=kwargs.get("data", {}), headers={"Authorization": f"Bearer {token}"})

    def get(self, identifier, token="alice"):
        return self.client.get(f"/api/speaking/sessions/{identifier}/evaluation",
                               headers={"Authorization": f"Bearer {token}"})

    def conversation(self, turns=3):
        identifier = self.start().get_json()["session"]["id"]
        messages = []
        for index in range(turns):
            message = ConversationMessage(session_id=identifier, sequence_number=index * 2 + 2,
                speaker="user", input_mode="voice", content="日本に行きたいでした。", status="completed", occurred_at=utc_now())
            db.session.add(message)
            db.session.add(ConversationMessage(session_id=identifier, sequence_number=index * 2 + 3,
                speaker="assistant", input_mode="generated", content="いいですね。", status="completed", occurred_at=utc_now()))
            messages.append(message)
        db.session.commit()
        return identifier, messages

    def result(self, messages):
        return {"assessment_status": "scored", "summary": "Bạn diễn đạt được ý chính.",
                "criteria": {code: {"score": score, "feedback": "Nhận xét cụ thể.", "suggestion": "Luyện thêm mẫu câu."}
                             for code, score in (("grammar", 80), ("vocabulary", 75), ("naturalness", 70))},
                "strengths": ["Nói rõ mục tiêu."], "next_steps": ["Luyện dạng quá khứ của たい."],
                "items": [{"kind": "error", "criterion": "grammar", "message_id": messages[0].id,
                           "original": "行きたいでした", "improved": "行きたかったです", "explanation": "Dùng dạng quá khứ của たい."}]}

    def test_finish_is_idempotent_and_blocks_new_turns(self):
        identifier, _ = self.conversation()
        self.assertEqual(self.post(identifier, "finish").status_code, 200)
        ended = db.session.get(ConversationSession, identifier).ended_at
        self.assertEqual(self.post(identifier, "finish").status_code, 200)
        db.session.expire_all()
        self.assertEqual(db.session.get(ConversationSession, identifier).ended_at, ended)
        response = self.post(identifier, "messages", data={"request_id": str(uuid.uuid4()), "content": "こんにちは", "input_mode": "text"})
        self.assertEqual(response.status_code, 409)

    def test_owner_only_and_server_owned_scores(self):
        identifier, _ = self.conversation()
        with patch("speaking.evaluation.generate_evaluation") as provider:
            for suffix in ("finish", "evaluation"):
                self.assertEqual(self.post(identifier, suffix, "bob").status_code, 404)
            self.assertEqual(self.get(identifier, "bob").status_code, 404)
            self.assertEqual(self.post(identifier, "evaluation", data={"overall_score": 100}).status_code, 400)
            self.assertEqual(self.post(identifier, "evaluation").status_code, 409)
            provider.assert_not_called()

    def test_finish_requires_completed_messages_and_audio(self):
        identifier, messages = self.conversation()
        messages[-1].status = "pending"
        db.session.commit()
        self.assertEqual(self.post(identifier, "finish").status_code, 409)
        messages[-1].status = "completed"
        db.session.add(ConversationAudioAsset(session_id=identifier, message_id=messages[0].id,
            asset_type="utterance", storage_key="test.wav", mime_type="audio/wav", status="uploading"))
        db.session.commit()
        self.assertEqual(self.post(identifier, "finish").status_code, 409)

    def test_scores_are_weighted_saved_and_cached(self):
        identifier, messages = self.conversation()
        self.post(identifier, "finish")
        with patch("speaking.evaluation.generate_evaluation", return_value=self.result(messages)) as provider:
            response = self.post(identifier, "evaluation")
            self.assertEqual(response.status_code, 200, response.get_json())
            self.assertEqual(response.get_json()["overall_score"], 75.5)
            self.assertEqual(response.get_json()["status"], "completed")
            self.assertEqual(self.get(identifier).get_json(), response.get_json())
            self.assertEqual(self.post(identifier, "evaluation").get_json(), response.get_json())
            provider.assert_called_once()
        self.assertEqual(len(db.session.scalars(select(EvaluationScore)).all()), 3)

    def test_short_conversation_has_no_score_and_no_provider_call(self):
        for turns in (0, 2):
            identifier, _ = self.conversation(turns)
            self.post(identifier, "finish")
            with patch("speaking.evaluation.generate_evaluation") as provider:
                result = self.post(identifier, "evaluation").get_json()
                self.assertEqual(result["status"], "insufficient_data")
                self.assertIsNone(result["overall_score"])
                self.assertTrue(all(item["score"] is None for item in result["result"]["criteria"].values()))
                provider.assert_not_called()

    def test_provider_failure_can_be_retried_without_duplicate_evaluation(self):
        identifier, messages = self.conversation()
        self.post(identifier, "finish")
        with patch("speaking.evaluation.generate_evaluation", side_effect=ApiError("AI timeout", 504)):
            self.assertEqual(self.post(identifier, "evaluation").status_code, 504)
        self.assertEqual(self.get(identifier).get_json()["status"], "failed")
        with patch("speaking.evaluation.generate_evaluation", return_value=self.result(messages)):
            self.assertEqual(self.post(identifier, "evaluation").get_json()["status"], "completed")
        self.assertEqual(len(db.session.scalars(select(SessionEvaluation)).all()), 1)

    def test_model_can_defer_scoring_when_three_turns_still_lack_evidence(self):
        identifier, messages = self.conversation()
        self.post(identifier, "finish")
        result = self.result(messages)
        result["assessment_status"] = "insufficient_data"
        result["items"] = []
        for criterion in result["criteria"].values():
            criterion["score"] = None
        with patch("speaking.evaluation.generate_evaluation", return_value=result):
            response = self.post(identifier, "evaluation")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_json()["status"], "insufficient_data")
            self.assertIsNone(response.get_json()["overall_score"])
        self.assertEqual(len(db.session.scalars(select(EvaluationScore)).all()), 0)

    def test_live_claim_returns_processing_and_expired_claim_can_retry(self):
        identifier, messages = self.conversation()
        self.post(identifier, "finish")
        evaluation = SessionEvaluation(session_id=identifier, status="processing", rubric_version="text-v1",
            attempt_id=str(uuid.uuid4()), processing_started_at=utc_now())
        db.session.add(evaluation)
        db.session.commit()
        with patch("speaking.evaluation.generate_evaluation", return_value=self.result(messages)) as provider:
            self.assertEqual(self.post(identifier, "evaluation").status_code, 202)
            provider.assert_not_called()
            evaluation.processing_started_at = utc_now() - timedelta(seconds=121)
            db.session.commit()
            self.assertEqual(self.get(identifier).get_json()["status"], "failed")
            self.assertEqual(self.post(identifier, "evaluation").get_json()["status"], "completed")

    def test_stale_attempt_cannot_overwrite_a_new_claim(self):
        identifier, messages = self.conversation()
        self.post(identifier, "finish")
        def provider(*_):
            current = db.session.scalar(select(SessionEvaluation))
            current.attempt_id = str(uuid.uuid4())
            db.session.commit()
            return self.result(messages)
        with patch("speaking.evaluation.generate_evaluation", side_effect=provider):
            self.assertEqual(self.post(identifier, "evaluation").get_json()["status"], "processing")
        self.assertEqual(len(db.session.scalars(select(EvaluationScore)).all()), 0)

    def test_rejects_invalid_scores_fields_and_fabricated_evidence(self):
        _, messages = self.conversation()
        transcript = [{"message_id": item.id, "speaker": "user", "content": item.content} for item in messages]
        def check(change):
            result = self.result(messages)
            change(result)
            with self.assertRaises(ValueError):
                validate_result(result, transcript)
        for score in (-1, 101, True, float("nan"), None):
            check(lambda result: result["criteria"]["grammar"].update(score=score))
        check(lambda result: result["criteria"].update(pronunciation={"score": 80}))
        check(lambda result: result["items"][0].update(original="架空の文"))
        check(lambda result: result["items"][0].update(message_id="assistant-id"))

    def test_repeated_correction_is_deduplicated_and_distinct_suggestions_are_preserved(self):
        _, messages = self.conversation()
        transcript = [{"message_id": item.id, "speaker": "user", "content": item.content} for item in messages]
        result = self.result(messages)
        result["items"].append(copy.deepcopy(result["items"][0]))
        alternative = {**result["items"][0], "kind": "alternative", "improved": "行きたいと思っていました"}
        result["items"].append(alternative)
        validated = validate_result(result, transcript)
        self.assertEqual(len(validated["items"]), 2)
        self.assertEqual(validated["items"][1], alternative)
        result["items"][1]["message_id"] = "invented"
        with self.assertRaises(ValueError):
            validate_result(result, transcript)

    def test_concurrent_requests_share_one_provider_attempt(self):
        if db.engine.dialect.name != "postgresql":
            self.skipTest("Row-lock concurrency requires PostgreSQL")
        identifier, messages = self.conversation()
        expected = self.result(messages)
        self.post(identifier, "finish")
        started, release = Event(), Event()
        def provider(*_):
            started.set()
            if not release.wait(10):
                raise ApiError("Test provider timed out", 504)
            return expected
        def request():
            with self.app.test_client() as client:
                return client.post(f"/api/speaking/sessions/{identifier}/evaluation", json={},
                                   headers={"Authorization": "Bearer alice"})
        with patch("speaking.evaluation.generate_evaluation", side_effect=provider) as mock_provider:
            with ThreadPoolExecutor(max_workers=2) as workers:
                first = workers.submit(request)
                try:
                    self.assertTrue(started.wait(5))
                    second = workers.submit(request).result(timeout=5)
                    self.assertEqual(second.status_code, 202)
                    self.assertEqual(second.get_json()["status"], "processing")
                finally:
                    release.set()
                self.assertEqual(first.result(timeout=5).get_json()["status"], "completed")
            mock_provider.assert_called_once()

    def test_provider_payload_excludes_private_context_and_audio(self):
        _, messages = self.conversation()
        transcript = [{"message_id": item.id, "speaker": "user", "input_mode": "voice", "content": item.content} for item in messages]
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), patch("speaking.evaluation_ai.requests.post") as provider:
            response = provider.return_value.__enter__.return_value
            response.status_code = 200
            response.json.return_value = {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(self.result(messages))}]}}]}
            generate_evaluation({"title": "Test", "role": {"name": "Aoi", "ai_instructions": "PRIVATE ROLE"}, "audio": "PRIVATE AUDIO"}, transcript)
            body = provider.call_args.kwargs["json"]
            self.assertNotIn("PRIVATE", json.dumps(body))
            self.assertNotIn("test-secret", json.dumps(body))
            self.assertIn("Never assess or infer pronunciation", body["systemInstruction"]["parts"][0]["text"])
            self.assertEqual(json.loads(body["contents"][0]["parts"][0]["text"])["transcript"], transcript)
            self.assertTrue(provider.call_args.args[0].startswith('https://generativelanguage.googleapis.com/'))
            self.assertEqual(provider.call_args.kwargs['headers']['x-goog-api-key'], 'test-secret')
            self.assertNotIn('Authorization', provider.call_args.kwargs['headers'])
            self.assertEqual(body['generationConfig']['responseMimeType'], 'application/json')

    def test_gemini_key_and_model_configuration(self):
        from speaking.evaluation_ai import evaluation_model
        with patch.dict(os.environ, {'GEMINI_API_KEY': '', 'SPEAKING_EVALUATION_MODEL': ''}):
            self.assertEqual(evaluation_model(), 'gemini-3.1-flash-lite')
            with patch('speaking.evaluation_ai.requests.post') as provider, self.assertRaises(ApiError) as failure:
                generate_evaluation({}, [])
            self.assertEqual(failure.exception.code, 'evaluation_unavailable')
            provider.assert_not_called()
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key', 'SPEAKING_EVALUATION_MODEL': 'invalid/model'}):
            with patch('speaking.evaluation_ai.requests.post') as provider, self.assertRaises(ApiError):
                generate_evaluation({}, [])
            provider.assert_not_called()

    def test_gemini_safety_block_is_not_retried_and_thought_parts_are_ignored(self):
        from speaking.evaluation_ai import provider_content
        self.assertEqual(provider_content({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [
            {'thought': True, 'text': 'Private reasoning'}, {'text': '{"result":true}'}]}}]}), '{"result":true}')
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key', 'SPEAKING_EVALUATION_MODEL': ''}), \
                patch('speaking.evaluation_ai.requests.post', return_value=self.provider_response(
                    {'promptFeedback': {'blockReason': 'SAFETY'}})) as provider:
            with self.assertRaises(ApiError) as failure:
                generate_evaluation({}, [])
            self.assertEqual(failure.exception.code, 'evaluation_failed')
            self.assertEqual(provider.call_count, 1)

    def test_provider_timeout_and_malformed_json_are_safe_errors(self):
        _, messages = self.conversation()
        transcript = [{"message_id": item.id, "speaker": "user", "content": item.content} for item in messages]
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), patch("speaking.evaluation_ai.requests.post", side_effect=requests.Timeout):
            with self.assertRaises(ApiError) as failure:
                generate_evaluation({}, transcript)
            self.assertEqual(failure.exception.status, 504)
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), patch("speaking.evaluation_ai.requests.post") as provider:
            response = provider.return_value.__enter__.return_value
            response.status_code = 200
            response.json.return_value = {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "not json"}]}}]}
            with self.assertRaises(ApiError) as failure:
                generate_evaluation({}, transcript)
            self.assertEqual(failure.exception.status, 502)

    def provider_response(self, body, status=200):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status_code = status
        response.json.return_value = body
        return response

    def test_http_200_error_envelope_retries_once_then_returns_provider_error(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), patch("speaking.evaluation_ai.requests.post") as provider:
            provider.return_value = self.provider_response({"error": {"code": 502, "message": "PRIVATE PROVIDER DETAIL"}})
            with self.assertLogs("speaking.evaluation_ai", level="WARNING") as logs:
                with self.assertRaises(ApiError) as failure:
                    generate_evaluation({}, [])
            self.assertEqual(failure.exception.code, "evaluation_provider_unavailable")
            self.assertEqual(failure.exception.status, 503)
            self.assertEqual(provider.call_count, 2)
            self.assertNotIn("PRIVATE PROVIDER DETAIL", str(logs.output))
            self.assertNotIn("test-secret", str(logs.output))

    def test_recovers_after_http_200_provider_error(self):
        _, messages = self.conversation()
        transcript = [{"message_id": item.id, "speaker": "user", "content": item.content} for item in messages]
        expected = self.result(messages)
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), patch("speaking.evaluation_ai.requests.post") as provider:
            provider.side_effect = [self.provider_response({"error": {"code": 502}}),
                self.provider_response({"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(expected)}]}}]})]
            self.assertEqual(generate_evaluation({}, transcript), expected)
            self.assertEqual(provider.call_count, 2)

    def test_single_markdown_fence_does_not_discard_valid_feedback(self):
        _, messages = self.conversation()
        transcript = [{"message_id": item.id, "speaker": "user", "content": item.content} for item in messages]
        expected = self.result(messages)
        fenced = "```json\n" + json.dumps(expected) + "\n```"
        self.assertEqual(parse_result(fenced, transcript), expected)
        invalid = copy.deepcopy(expected)
        invalid["items"][0]["original"] = "架空の文"
        with self.assertRaises(ValueError):
            parse_result("```json\n" + json.dumps(invalid) + "\n```", transcript)

    def test_repairs_invalid_evidence_once_and_still_validates_the_result(self):
        _, messages = self.conversation()
        transcript = [{"message_id": item.id, "speaker": "user", "content": item.content} for item in messages]
        expected = self.result(messages)
        invalid = copy.deepcopy(expected)
        invalid["items"][0]["original"] = "架空の文"
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), patch("speaking.evaluation_ai.requests.post") as provider:
            provider.side_effect = [self.provider_response({"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(value)}]}}]})
                                   for value in (invalid, expected)]
            self.assertEqual(generate_evaluation({}, transcript), expected)
            self.assertEqual(provider.call_count, 2)
            self.assertIn("Copy message_id", provider.call_args.kwargs["json"]["contents"][-1]["parts"][0]["text"])

    def test_rate_limit_error_in_http_200_is_not_automatically_retried(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), patch("speaking.evaluation_ai.requests.post") as provider:
            provider.return_value = self.provider_response({"error": {"code": 429}})
            with self.assertRaises(ApiError) as failure:
                generate_evaluation({}, [])
            self.assertEqual(failure.exception.status, 429)
            self.assertEqual(provider.call_count, 1)


if __name__ == "__main__":
    unittest.main()
