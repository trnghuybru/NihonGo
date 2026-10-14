import json
import os
import unittest
from unittest.mock import Mock, patch

from flask import Flask
from sqlalchemy import delete

from auth import init_auth
from auth.models import AuthSession, User, now
from auth.security import digest
from extensions import db
from writing.evaluation import evaluate_writing
from writing import init_writing


class WritingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(
            TESTING=True,
            AUTH_CONFIGURED=True,
            AUTH_SECRET_KEY='writing-test-' * 4,
            SQLALCHEMY_DATABASE_URI=os.getenv('TEST_DATABASE_URL', 'sqlite://'),
        )
        init_auth(cls.app)
        init_writing(cls.app)
        with cls.app.app_context():
            db.create_all()

    def setUp(self):
        self.context = self.app.app_context()
        self.context.push()
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(delete(table))
        self.client = self.app.test_client()
        db.session.add(User(id='alice', name='Alice', email='alice@example.com', phone='+84912345678', email_verified=True))
        db.session.add(AuthSession(user_id='alice', access_hash=digest('alice'), access_expires_at=now() + 900, expires_at=now() + 3600))
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        self.context.pop()

    def test_prompts_and_draft_round_trip(self):
        response = self.client.get('/api/writing/prompts', headers={'Authorization': 'Bearer alice'})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertGreaterEqual(len(response.json['items']), 1)

        payload = {'prompt_id': response.json['items'][0]['id'], 'text': '私は毎日日本語を勉強します。'}
        create = self.client.post('/api/writing/drafts', json=payload, headers={'Authorization': 'Bearer alice'})
        self.assertEqual(create.status_code, 201, create.json)
        self.assertEqual(create.json['draft']['text'], payload['text'])

        list_response = self.client.get('/api/writing/drafts', headers={'Authorization': 'Bearer alice'})
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json['items']), 1)
        self.assertEqual(list_response.json['items'][0]['prompt_id'], payload['prompt_id'])

    def test_delete_draft(self):
        prompt_id = self.client.get('/api/writing/prompts', headers={'Authorization': 'Bearer alice'}).json['items'][0]['id']
        create = self.client.post('/api/writing/drafts', json={'prompt_id': prompt_id, 'text': 'これはテストです。'}, headers={'Authorization': 'Bearer alice'})
        draft_id = create.json['draft']['id']

        delete_response = self.client.delete(f'/api/writing/drafts/{draft_id}', headers={'Authorization': 'Bearer alice'})
        self.assertEqual(delete_response.status_code, 200, delete_response.json)
        self.assertEqual(self.client.get('/api/writing/drafts', headers={'Authorization': 'Bearer alice'}).json['items'], [])

    def test_requires_auth(self):
        self.assertEqual(self.client.get('/api/writing/prompts').status_code, 401)
        self.assertEqual(self.client.get('/api/writing/drafts').status_code, 401)

    def test_default_prompts_include_required_examples_by_level(self):
        response = self.client.get('/api/writing/prompts', headers={'Authorization': 'Bearer alice'})
        self.assertEqual(response.status_code, 200, response.json)
        titles = {item['title'] for item in response.json['items']}
        required = {
            'Giới thiệu bản thân',
            'Thói quen hằng ngày',
            'Gia đình',
            'Nơi yêu thích',
            'Chuyến đi đáng nhớ',
            'Sở thích',
            'Công nghệ trong cuộc sống',
            'Học ngoại ngữ',
            'Mục tiêu tương lai',
        }
        self.assertTrue(required.issubset(titles), titles)

    def test_allows_custom_draft_without_prompt(self):
        response = self.client.post(
            '/api/writing/drafts',
            json={'text': 'Tôi muốn viết bài theo ý của mình mà không cần chọn đề.'},
            headers={'Authorization': 'Bearer alice'},
        )
        self.assertEqual(response.status_code, 201, response.json)
        self.assertIn('draft', response.json)
        self.assertEqual(response.json['draft']['text'], 'Tôi muốn viết bài theo ý của mình mà không cần chọn đề.')

    def test_submit_and_list_submissions(self):
        prompt_id = self.client.get('/api/writing/prompts', headers={'Authorization': 'Bearer alice'}).json['items'][0]['id']
        assessment = {
            'score': 78,
            'corrected_text': '私は毎日日本語を練習しています。',
            'feedback': 'Điểm làm tốt: Có nêu mục tiêu luyện tập cụ thể.\nCần cải thiện: Hãy viết bằng tiếng Nhật.',
        }
        with patch('writing.routes.evaluate_writing', return_value=assessment) as evaluate:
            response = self.client.post(
                '/api/writing/submissions',
                json={
                    'prompt_id': prompt_id,
                    'prompt_title': 'Giới thiệu bản thân',
                    'text': 'Tôi dùng tiếng Nhật mỗi ngày để luyện nói và viết.',
                    'corrected_text': 'Client-side correction must be ignored.',
                    'score': 92,
                    'feedback': 'Client-side template must be ignored.',
                },
                headers={'Authorization': 'Bearer alice'},
            )
        evaluate.assert_called_once()
        self.assertEqual(response.status_code, 201, response.json)
        self.assertIn('submission', response.json)
        self.assertEqual(response.json['submission']['text'], 'Tôi dùng tiếng Nhật mỗi ngày để luyện nói và viết.')
        self.assertEqual(response.json['submission']['score'], assessment['score'])
        self.assertEqual(response.json['submission']['feedback'], assessment['feedback'])
        self.assertEqual(response.json['submission']['corrected_text'], assessment['corrected_text'])

        items = self.client.get('/api/writing/submissions', headers={'Authorization': 'Bearer alice'})
        self.assertEqual(items.status_code, 200, items.json)
        self.assertEqual(len(items.json['items']), 1)

    def test_gemini_writing_evaluation_uses_submission_context(self):
        assessment = {
            'score': 81,
            'corrected_text': '私は毎日日本語を練習しています。',
            'feedback': 'Điểm làm tốt: Có mục tiêu rõ.\nCần cải thiện: Thêm chi tiết cụ thể.',
        }
        response = Mock()
        response.status_code = 200
        response.json.return_value = {
            'candidates': [{
                'finishReason': 'STOP',
                'content': {'parts': [{'text': json.dumps(assessment, ensure_ascii=False)}]},
            }],
        }

        with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key', 'GEMINI_WRITING_MODEL': 'gemini-3.1-flash-lite'}):
            with patch('writing.evaluation.requests.post', return_value=response) as request:
                result = evaluate_writing('日本語で毎日練習します。', '自己紹介', 'N5', '自己紹介を書いてください。')

        self.assertEqual(result, assessment)
        request_payload = request.call_args.kwargs['json']
        self.assertIn('自己紹介', request_payload['contents'][0]['parts'][0]['text'])
        self.assertIn('日本語で毎日練習します。', request_payload['contents'][0]['parts'][0]['text'])

    def test_reevaluate_submission_updates_only_owned_submission(self):
        prompt_id = self.client.get('/api/writing/prompts', headers={'Authorization': 'Bearer alice'}).json['items'][0]['id']
        initial = {'score': 50, 'corrected_text': '初めの文。', 'feedback': 'Nhận xét cũ'}
        with patch('writing.routes.evaluate_writing', return_value=initial):
            created = self.client.post(
                '/api/writing/submissions',
                json={'prompt_id': prompt_id, 'text': '日本語を勉強します。'},
                headers={'Authorization': 'Bearer alice'},
            )
        submission_id = created.json['submission']['id']
        revised = {'score': 82, 'corrected_text': '毎日、日本語を勉強しています。', 'feedback': 'Câu có chủ ngữ rõ ràng; thử thêm lý do học.'}

        with patch('writing.routes.evaluate_writing', return_value=revised) as evaluate:
            response = self.client.post(
                f'/api/writing/submissions/{submission_id}/evaluate',
                headers={'Authorization': 'Bearer alice'},
            )

        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['submission']['feedback'], revised['feedback'])
        self.assertEqual(response.json['submission']['corrected_text'], revised['corrected_text'])
        self.assertEqual(response.json['submission']['score'], revised['score'])
        evaluate.assert_called_once_with('日本語を勉強します。', 'Giới thiệu bản thân', 'N5', unittest.mock.ANY)

    def test_rejects_invalid_prompt_payload(self):
        response = self.client.post('/api/writing/drafts', json={'prompt_id': 'missing', 'text': ''}, headers={'Authorization': 'Bearer alice'})
        self.assertEqual(response.status_code, 400)

