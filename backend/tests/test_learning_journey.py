import unittest
from unittest.mock import patch
from flask import Flask
from sqlalchemy import delete
from api_errors import ApiError
from auth import init_auth
from auth.models import AuthSession, User, now
from auth.security import digest
from extensions import db
from learning import init_learning
from learning.journey import today, ai_topic
from learning.models import LearningJourney, LearningPreferences
from flashcards.models import FlashcardSchedule
from reading.models import ReadingPassage
from shadowing.models import ShadowingJob
from shadowing.quiz import request_questions  # Register provider dependencies before creating the test schema.
from writing.models import WritingSubmission


class JourneyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(TESTING=True, AUTH_CONFIGURED=True,
            AUTH_SECRET_KEY='journey-test-' * 4, SQLALCHEMY_DATABASE_URI='sqlite://')
        init_auth(cls.app)
        init_learning(cls.app)
        with cls.app.app_context():
            db.create_all()

    def setUp(self):
        self.context = self.app.app_context()
        self.context.push()
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(delete(table))
        for identifier in ('alice', 'bob'):
            db.session.add(User(id=identifier, name=identifier, email=f'{identifier}@example.com',
                phone='+84912345678', email_verified=True))
        db.session.flush()
        for identifier in ('alice', 'bob'):
            db.session.add(AuthSession(user_id=identifier, access_hash=digest(identifier),
                access_expires_at=now() + 900, expires_at=now() + 3600))
            db.session.add(LearningPreferences(user_id=identifier, level='N5', goal='travel', daily_minutes=15,
                level_confirmed_at=now(), created_at=now(), updated_at=now(), version=1))
        db.session.add(FlashcardSchedule(user_id='alice', card_id='lesson:school',
            card={'front': '学校', 'reading': 'がっこう', 'back': 'trường học'}, fsrs_card={},
            due_at=0, last_review_at=123, review_count=2, active=True))
        for identifier, text in [('school', '学校へ行きます。'), ('other', '今日は休みです。')]:
            db.session.add(ReadingPassage(id=identifier, level='N5', kind='short', title=identifier,
                exercise=1, paragraph=1, text=text, source_url=f'https://example.com/{identifier}', questions=[]))
            db.session.add(ShadowingJob(id=identifier, video_id={'school': 'abcdefghijk', 'other': 'lmnopqrstuv'}[identifier],
                status='ready', title=identifier, display_captions=[{'text': text}], created_at=123, updated_at=123))
        db.session.commit()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        self.context.pop()

    def get(self, user='alice'):
        return self.client.get('/api/learning/journey', headers={'Authorization': f'Bearer {user}'})

    def post(self, path, payload, user='alice'):
        return self.client.post('/api/learning/journey/' + path, json=payload,
            headers={'Authorization': f'Bearer {user}'})

    def test_private_evidence_and_matching_recommendations(self):
        response = self.get()
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        plan = response.json
        self.assertEqual(plan['knowledge']['reviewed_cards'], 1)
        self.assertEqual(plan['knowledge']['due_cards'], 1)
        self.assertEqual([s.get('target_id') for s in plan['steps'][1:3]], ['school', 'school'])
        self.assertIn('学校', plan['steps'][1]['reason'])
        self.assertEqual(self.get('bob').json['knowledge']['recent_words'], [])
        self.assertEqual(self.get('bob').json['steps'][0]['kind'], 'vocabulary')
        self.assertEqual(self.get('bad').status_code, 401)

    def test_stable_plan_live_knowledge(self):
        first = self.get().json
        db.session.add(WritingSubmission(user_id='alice', text='日本語', prompt_title='Test'))
        db.session.commit()
        updated = self.get().json
        self.assertEqual(updated['steps'], first['steps'])
        self.assertEqual(updated['knowledge']['writing_submissions'], 1)
        self.assertEqual(self.get('bob').json['knowledge']['writing_submissions'], 0)

    def test_writing_errors_are_private_and_ignore_suggestions(self):
        db.session.add(WritingSubmission(user_id='alice', text='日本語', prompt_title='作文', assessment={
            'corrections': [
                {'kind': 'error', 'original': 'は', 'replacement': 'が', 'explanation': 'Chọn trợ từ.'},
                {'kind': 'suggestion', 'original': 'A', 'replacement': 'B', 'explanation': 'Gợi ý.'},
            ]}))
        db.session.commit()
        corrections = self.get().json['knowledge']['writing_corrections']
        self.assertEqual(len(corrections), 1)
        self.assertEqual(corrections[0]['original'], 'は')
        self.assertEqual(self.get('bob').json['knowledge']['writing_corrections'], [])

    def test_order_idempotency_and_account_isolation(self):
        plan = self.get().json
        payload = {'date': plan['date'], 'step_id': 'reading'}
        self.assertEqual(self.post('complete', payload).status_code, 200)
        payload['step_id'] = 'review'
        for _ in range(2):
            result = self.post('complete', payload)
            self.assertEqual(result.status_code, 200, result.json)
            self.assertEqual(result.json['completed'], ['reading', 'review'])
        self.assertEqual(self.get().json['completed'], ['reading', 'review'])
        self.assertEqual(self.get('bob').json['completed'], [])
        self.assertEqual(self.post('complete', {**payload, 'date': '2000-01-01'}).status_code, 409)
        self.assertEqual(self.post('complete', {**payload, 'user_id': 'bob'}).status_code, 400)

    def test_ai_topic_cache_failure_retry_and_source(self):
        payload = {'date': self.get().json['date']}
        with patch('learning.journey.ai_topic', side_effect=ApiError('AI unavailable', 503)):
            self.assertEqual(self.post('writing-topic', payload).status_code, 503)
        self.assertIsNone(db.session.get(LearningJourney, ('alice', today())).writing_topic)
        topic = {'title': 'Trường của tôi', 'instruction': 'Viết 3 câu về trường học.', 'hint': 'Dùng 学校.'}
        with patch('learning.journey.ai_topic', return_value=topic) as generate:
            first = self.post('writing-topic', payload)
            self.assertEqual(first.status_code, 200, first.json)
            self.assertEqual(self.post('writing-topic', payload).json['writing_topic'], first.json['writing_topic'])
            generate.assert_called_once()
            self.assertEqual(generate.call_args.args[0]['words'][0]['word'], '学校')
        self.assertIsNone(self.get('bob').json['writing_topic'])

    def test_missing_catalog(self):
        db.session.execute(delete(ShadowingJob))
        db.session.execute(delete(ReadingPassage))
        db.session.commit()
        plan = self.get().json
        self.assertEqual([s['id'] for s in plan['steps']], ['review', 'writing'])
        self.assertEqual(len(plan['missing']), 2)
        self.assertEqual(sum(s['minutes'] for s in plan['steps']), 15)

    def test_ai_output_validation(self):
        with patch('services.gemini_provider.gemini_configured', return_value=True), patch(
                'shadowing.quiz.request_questions', return_value={'title': 'X', 'instruction': '', 'hint': 'Y'}):
            with self.assertRaises(ApiError) as caught:
                ai_topic({'level': 'N5', 'goal': 'travel', 'words': []})
            self.assertEqual(caught.exception.code, 'journey_ai_invalid')
