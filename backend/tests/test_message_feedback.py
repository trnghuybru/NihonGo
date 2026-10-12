import json
import uuid
from datetime import timedelta
from unittest import TestCase
from unittest.mock import MagicMock, patch

from api_errors import ApiError
from extensions import db
from speaking.models import ConversationMessage, ConversationSession, SessionEvaluation, utc_now
from speaking.message_feedback import parse_feedback, PROMPT, SCHEMA
from speaking.evaluation_ai import generate_evaluation
import test_speaking_evaluation as evaluation_fixtures


class MessageFeedbackTests(TestCase):
    setUpClass = classmethod(evaluation_fixtures.EvaluationTests.setUpClass.__func__)
    tearDownClass = classmethod(evaluation_fixtures.EvaluationTests.tearDownClass.__func__)
    setUp = evaluation_fixtures.EvaluationTests.setUp
    tearDown = evaluation_fixtures.EvaluationTests.tearDown
    scenario = evaluation_fixtures.EvaluationTests.scenario
    start = evaluation_fixtures.EvaluationTests.start
    conversation = evaluation_fixtures.EvaluationTests.conversation
    result = evaluation_fixtures.EvaluationTests.result

    def feedback(self, session_id, message_id, token="alice", data=None):
        return self.client.post(f"/api/speaking/sessions/{session_id}/messages/{message_id}/feedback",
                                json={} if data is None else data,
                                headers={"Authorization": f"Bearer {token}"})

    def response(self, messages):
        return {"summary": "Cần chỉnh dạng quá khứ.", "items": self.result(messages)["items"]}

    def test_single_turn_feedback_is_cached_without_finishing_or_scoring(self):
        identifier, messages = self.conversation(turns=1)
        with patch("speaking.message_feedback.generate_evaluation", return_value=self.response(messages)) as provider:
            first = self.feedback(identifier, messages[0].id)
            self.assertEqual(first.status_code, 200, first.json)
            self.assertEqual(first.json["result"]["items"][0]["message_id"], messages[0].id)
            self.assertEqual(self.feedback(identifier, messages[0].id).json, first.json)
            provider.assert_called_once()
        self.assertEqual(db.session.get(ConversationSession, identifier).status, "active")
        self.assertEqual(db.session.query(SessionEvaluation).count(), 0)

    def test_ownership_and_completed_learner_sentence_are_required(self):
        identifier, messages = self.conversation(turns=1)
        assistant = db.session.query(ConversationMessage).filter_by(session_id=identifier, speaker="assistant").first()
        with patch("speaking.message_feedback.generate_evaluation") as provider:
            self.assertEqual(self.feedback(identifier, messages[0].id, token="bob").status_code, 404)
            self.assertEqual(self.feedback(identifier, messages[0].id, token="invalid").status_code, 401)
            self.assertEqual(self.feedback(identifier, assistant.id).status_code, 409)
            self.assertEqual(self.feedback(identifier, str(uuid.uuid4())).status_code, 404)
            self.assertEqual(self.feedback(identifier, messages[0].id, data={"content": "fake"}).status_code, 400)
            messages[0].status = "pending"
            db.session.commit()
            self.assertEqual(self.feedback(identifier, messages[0].id).status_code, 409)
            provider.assert_not_called()

    def test_processing_lease_prevents_duplicate_calls_and_expired_attempt_can_retry(self):
        identifier, messages = self.conversation(turns=1)
        target = messages[0]
        target.feedback_started_at = utc_now()
        target.feedback_attempt_id = str(uuid.uuid4())
        db.session.commit()
        with patch("speaking.message_feedback.generate_evaluation", return_value=self.response(messages)) as provider:
            self.assertEqual(self.feedback(identifier, target.id).status_code, 202)
            provider.assert_not_called()
            target.feedback_started_at = utc_now() - timedelta(seconds=121)
            db.session.commit()
            self.assertEqual(self.feedback(identifier, target.id).status_code, 200)
            provider.assert_called_once()

    def test_failure_is_retryable_and_no_issues_is_a_valid_cached_result(self):
        identifier, messages = self.conversation(turns=1)
        with patch("speaking.message_feedback.generate_evaluation", side_effect=ApiError("Model bận.", 503)):
            self.assertEqual(self.feedback(identifier, messages[0].id).status_code, 503)
        value = {"summary": "Câu phù hợp với ngữ cảnh.", "items": []}
        with patch("speaking.message_feedback.generate_evaluation", return_value=value) as provider:
            self.assertEqual(self.feedback(identifier, messages[0].id).json["result"], value)
            self.assertEqual(self.feedback(identifier, messages[0].id).status_code, 200)
            provider.assert_called_once()

    def test_feedback_rejects_other_targets_and_invented_quotations(self):
        identifier, messages = self.conversation(turns=2)
        for value in (self.response(messages), {"summary": "Nhận xét.", "items": [{
                **self.response(messages[1:])["items"][0], "original": "invented"}]}):
            with patch("speaking.message_feedback.generate_evaluation", return_value=value):
                self.assertEqual(self.feedback(identifier, messages[1].id).status_code, 502)

    def test_provider_receives_only_target_and_public_context_with_sentence_prompt(self):
        target = {"message_id": str(uuid.uuid4()), "speaker": "user", "input_mode": "voice", "content": "日本に行きたいでした。"}
        value = {"summary": "Cần chỉnh dạng quá khứ.", "items": []}
        response = MagicMock(status_code=200)
        response.__enter__.return_value = response
        response.json.return_value = {"choices": [{"message": {"content": json.dumps(value)}}]}
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key", "SPEAKING_EVALUATION_FORMAT": "json_schema"}), patch("speaking.evaluation_ai.requests.post", return_value=response) as provider:
            result = generate_evaluation({"title": "Interview", "role": {"name": "Aoi", "ai_instructions": "PRIVATE"}},
                [target], prompt=PROMPT, schema=SCHEMA, parser=parse_feedback, target_message_id=target["message_id"])
        self.assertEqual(result, value)
        body = provider.call_args.kwargs["json"]
        self.assertIn(PROMPT, body["messages"][0]["content"])
        self.assertEqual(body["response_format"]["json_schema"]["schema"], SCHEMA)
        payload = json.loads(body["messages"][1]["content"])
        self.assertEqual(payload["target_message_id"], target["message_id"])
        self.assertNotIn("PRIVATE", json.dumps(payload))
