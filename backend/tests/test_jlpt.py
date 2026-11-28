import unittest
import copy
from unittest.mock import patch
from flask import Flask
from auth import init_auth
from auth.models import User, AuthSession, now
from auth.security import digest
from extensions import db
from jlpt import init_jlpt
from jlpt.service import get_exam, grade


class JlptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(TESTING=True, AUTH_CONFIGURED=True, AUTH_SECRET_KEY='jlpt-test-' * 5,
                              SQLALCHEMY_DATABASE_URI='sqlite://')
        init_auth(cls.app)
        init_jlpt(cls.app)
        with cls.app.app_context():
            db.create_all()
            db.session.add(User(id='exam-learner', name='Learner', email='exam@example.invalid', phone='+84900000000'))
            db.session.flush()
            db.session.add(AuthSession(user_id='exam-learner', access_hash=digest('exam-token'),
                                      access_expires_at=now() + 900, expires_at=now() + 900))
            db.session.commit()

    def setUp(self):
        self.client = self.app.test_client()
        self.headers = {'Authorization': 'Bearer exam-token'}

    def test_exam_requires_auth_and_catalog_keeps_session_identity(self):
        self.assertEqual(self.client.get('/api/jlpt/exams').status_code, 401)
        data = self.client.get('/api/jlpt/exams', headers=self.headers).get_json()['items'][0]
        self.assertEqual((data['id'], data['year'], data['month'], data['total']), ('n3-2017-07', 2017, 7, 102))
        self.assertIsNone(data['audio_url'])

    def test_full_exam_preserves_groups_passages_and_images_without_answers(self):
        response = self.client.get('/api/jlpt/exams/n3-2017-07', headers=self.headers)
        exam = response.get_json()
        self.assertEqual([len(s['questions']) for s in exam['sections']], [35, 39, 28])
        questions = {q['id']: q for s in exam['sections'] for q in s['questions']}
        self.assertEqual(len(questions), 102)
        self.assertNotIn('answer_index', response.get_data(as_text=True))
        self.assertEqual(questions['gr-31']['passage'], questions['gr-33']['passage'])
        self.assertIn('を集める。', questions['gr-31']['passage'])
        self.assertIn('をあげたり', questions['gr-34']['passage'])
        self.assertTrue(questions['gr-38']['images'])
        self.assertTrue(questions['l-4-1']['images'])
        self.assertEqual(len(questions['l-5-9']['options']), 3)
        self.assertEqual(questions['v-27']['options'][0], '反対')

    def test_second_session_is_complete_and_uses_its_own_answers(self):
        items = self.client.get('/api/jlpt/exams', headers=self.headers).get_json()['items']
        self.assertEqual([item['id'] for item in items], ['n3-2017-07', 'n3-2016-12'])
        response = self.client.get('/api/jlpt/exams/n3-2016-12', headers=self.headers)
        exam = response.get_json()
        self.assertEqual([len(s['questions']) for s in exam['sections']], [35, 39, 28])
        questions = {q['id']: q for s in exam['sections'] for q in s['questions']}
        self.assertIn('観客', questions['v-1']['prompt'])
        self.assertIn('実は、私も以前、携帯電話を持っていた', questions['gr-25']['passage'])
        self.assertIn('12 月1 日（木）19:30', questions['gr-27']['passage'])
        self.assertTrue(questions['gr-38']['images'])
        self.assertTrue(questions['l-1-1']['images'])
        self.assertEqual(questions['gr-33']['options'][3], '「貸し傘」の傘が返しやすくなるように、傘立てを増やすことに協力してほしい。')
        self.assertNotIn('answer_index', response.get_data(as_text=True))
        result = self.client.post('/api/jlpt/exams/n3-2016-12/grade', headers=self.headers,
                                  json={'version': 1, 'answers': {'v-1': 3}}).get_json()
        self.assertEqual(result['correct'], 1)
        self.assertEqual(grade(get_exam('n3-2017-07'), {'version': 1, 'answers': {'v-1': 3}})['correct'], 0)

    def test_original_timing_plan_and_post_submission_dictionary(self):
        exam = self.client.get('/api/jlpt/exams/n3-2017-07', headers=self.headers).get_json()
        self.assertEqual([s['duration_seconds'] for s in exam['sections']], [1800, 4200, 2400])
        path = '/api/jlpt/exams/n3-2017-07/questions/v-1/review'
        self.assertEqual(self.client.post(path, headers=self.headers, json={}).status_code, 403)
        graded = self.client.post('/api/jlpt/exams/n3-2017-07/grade', headers=self.headers,
                                  json={'version': 1, 'answers': {}}).get_json()
        result = self.client.post(path, headers=self.headers, json={'review_token': graded['review_token']})
        self.assertEqual(result.status_code, 200)
        data = result.get_json()
        self.assertEqual(''.join(t['text'] for t in data['prompt_tokens']), exam['sections'][0]['questions'][0]['prompt'])
        self.assertTrue(any(w['lemma'] == '汚い' for w in data['words'].values()))
        from jlpt.review import review_question
        with self.app.app_context():
            with self.assertRaises(Exception) as caught:
                review_question(get_exam('n3-2017-07'), 'another-learner', 'v-1', {'review_token': graded['review_token']})
            self.assertEqual(caught.exception.status, 403)
            changed = copy.deepcopy(get_exam('n3-2017-07'))
            changed['sections'][0]['questions'][0]['prompt'] += ' changed'
            with self.assertRaises(Exception) as caught:
                review_question(changed, 'exam-learner', 'v-1', {'review_token': graded['review_token']})
            self.assertEqual(caught.exception.status, 403)

    def test_momo_is_explicit_authenticated_grounded_and_cached(self):
        from jlpt.review import _cache
        _cache.clear()
        base = '/api/jlpt/exams/n3-2017-07'
        with patch('services.gemini_provider.gemini_configured', return_value=True), patch('shadowing.quiz.request_questions') as provider:
            self.assertEqual(self.client.post(base + '/questions/v-1/explanation', headers=self.headers,
                                             json={'option_index': 0}).status_code, 403)
            provider.assert_not_called()
            graded = self.client.post(base + '/grade', headers=self.headers, json={'version': 1, 'answers': {}}).get_json()
            payload = {'review_token': graded['review_token'], 'option_index': 0}
            self.assertEqual(self.client.post(base + '/questions/l-1-1/explanation', headers=self.headers, json=payload).status_code, 422)
            provider.assert_not_called()
            provider.return_value = {'explanation': 'せまい nghĩa là chật, không phải cách đọc của 汚い.', 'caution': '', 'grammar': []}
            first = self.client.post(base + '/questions/v-1/explanation', headers=self.headers, json=payload)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.get_json()['correct_index'], 2)
            second = self.client.post(base + '/questions/v-1/explanation', headers=self.headers, json=payload)
            self.assertEqual(first.get_json(), second.get_json())
            self.assertEqual(provider.call_count, 1)
            provider.return_value = {'explanation': 'Invalid source.', 'caution': '', 'grammar': [
                {'pattern': 'fake', 'meaning': 'fake', 'source_quote': 'NOT IN SOURCE', 'example': '例', 'translation': 'Ví dụ'}]}
            payload['option_index'] = 1
            self.assertEqual(self.client.post(base + '/questions/v-1/explanation', headers=self.headers, json=payload).status_code, 502)

    def test_grade_partial_blank_and_all_correct_using_verified_key(self):
        path = '/api/jlpt/exams/n3-2017-07/grade'
        result = self.client.post(path, headers=self.headers, json={'version': 1, 'answers': {'v-1': 2, 'gr-39': 3}}).get_json()
        self.assertEqual((result['correct'], result['answered'], result['total']), (1, 2, 102))
        self.assertEqual(result['results']['v-1']['status'], 'correct')
        self.assertEqual(result['results']['gr-39']['status'], 'incorrect')
        self.assertEqual(result['results']['l-1-1']['status'], 'unanswered')
        self.assertEqual(result['results']['gr-39']['correct_index'], 0)
        exam = get_exam('n3-2017-07')
        answers = {q['id']: q['answer_index'] for s in exam['sections'] for q in s['questions']}
        self.assertEqual(grade(exam, {'version': 1, 'answers': answers})['correct'], 102)

    def test_invalid_answers_versions_and_ids_are_rejected(self):
        path = '/api/jlpt/exams/n3-2017-07/grade'
        for payload in [None, {}, {'version': True, 'answers': {}}, {'version': 2, 'answers': {}}, {'version': 1, 'answers': []},
                        {'version': 1, 'answers': {'v-1': True}}, {'version': 1, 'answers': {'v-1': 4}},
                        {'version': 1, 'answers': {'l-5-1': 3}}, {'version': 1, 'answers': {'not-a-question': 0}}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post(path, headers=self.headers, json=payload).status_code, 400)
        self.assertEqual(self.client.get('/api/jlpt/exams/no-exam', headers=self.headers).status_code, 404)
