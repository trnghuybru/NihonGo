import os
import unittest
import uuid
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch
from flask import Flask
from sqlalchemy import create_engine, delete, text
from auth import init_auth
from auth.models import AuthSession, User, now
from auth.security import digest
from dictionary import init_dictionary
from dictionary.models import DictionaryEntry
from extensions import db
from flashcards import init_flashcards
from flashcards.models import FlashcardDailyQuiz, FlashcardReviewLog, FlashcardSchedule, FlashcardSession
from flashcards.srs import millis
from vocabulary import init_vocabulary
from vocabulary.models import VocabularyTextbook, VocabularyLesson, VocabularyWord


class FlashcardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        url = os.getenv('TEST_DATABASE_URL', 'sqlite://')
        cls.admin = None
        cls.app.config.update(TESTING=True, AUTH_CONFIGURED=True, AUTH_SECRET_KEY='flashcard-test-' * 4, SQLALCHEMY_DATABASE_URI=url)
        if url.startswith('postgresql'):
            cls.schema = 'test_flashcards_' + uuid.uuid4().hex
            cls.admin = create_engine(url)
            with cls.admin.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
            cls.app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'connect_args': {'options': f'-csearch_path={cls.schema}'}}
        init_auth(cls.app)
        init_vocabulary(cls.app)
        init_dictionary(cls.app)
        init_flashcards(cls.app)
        with cls.app.app_context():
            db.create_all()

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            db.session.remove()
            db.engine.dispose()
        if cls.admin:
            with cls.admin.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{cls.schema}" CASCADE'))
            cls.admin.dispose()

    def setUp(self):
        self.context = self.app.app_context()
        self.context.push()
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(delete(table))
        for uid in ('one', 'two'):
            db.session.add(User(id=uid, name=uid, email=uid+'@test.invalid', phone='+8491234567'+('1' if uid == 'one' else '2')))
            db.session.flush()
            db.session.add(AuthSession(user_id=uid, access_hash=digest(uid), access_expires_at=now()+900, expires_at=now()+3600))
        db.session.add(VocabularyTextbook(id='book', title='N5', level='N5', source_url=''))
        db.session.flush()
        db.session.add(VocabularyLesson(id='lesson', textbook_id='book', unit_number=1, unit_title='Unit 1', number=1, title='Bài 1', source_url='', audio_urls=[]))
        db.session.flush()
        for index, word in enumerate(('学校', '人生'), 1):
            db.session.add(VocabularyWord(id=f'word{index}', lesson_id='lesson', number=index, word=word, reading='がっこう', meaning_vi='trường học', details={}))
        db.session.add(DictionaryEntry(id='jmdict:1', word='学校', reading='がっこう', common=True,
            content={'senses': [{'glosses': [{'language': 'eng', 'text': 'school'}, {'language': 'vi', 'text': 'trường học'}]}]}))
        db.session.commit()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        self.context.pop()

    def request(self, method, path, data=None, user='one'):
        return getattr(self.client, method)('/api/flashcards'+path, headers={'Authorization': 'Bearer '+user}, json=data)

    def create(self):
        response = self.request('post', '/decks', {'title': 'Tự tạo', 'cards': [
            {'front': '学校', 'reading': 'がっこう', 'back': 'trường học'},
            {'front': '人生', 'reading': 'じんせい', 'back': 'cuộc đời'}]})
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def test_custom_deck_isolation_and_session_snapshot(self):
        deck = self.create()
        self.assertEqual(self.request('get', '/decks?kind=custom').json['items'][0]['id'], deck['id'])
        self.assertEqual(self.request('get', '/decks/'+deck['id'], user='two').status_code, 404)
        self.assertEqual(self.request('post', '/sessions', {'kind': 'custom', 'deck_id': deck['id']}, user='two').status_code, 404)
        session = self.request('post', '/sessions', {'kind': 'custom', 'deck_id': deck['id']}).json
        edited = {'title': 'Đổi tên', 'cards': [{'front': '新', 'back': 'mới'}]}
        self.assertEqual(self.request('put', '/decks/'+deck['id'], edited, user='two').status_code, 404)
        self.assertEqual(self.request('put', '/decks/'+deck['id'], edited).status_code, 200)
        self.assertEqual(self.request('get', '/sessions/'+session['id']).json['cards'], session['cards'])
        for data in ({'title': '', 'cards': []}, {'title': 'x', 'cards': [{'front': 'x', 'back': ''}]}, {'title': 'x', 'cards': [{}]*101}):
            self.assertEqual(self.request('post', '/decks', data).status_code, 400)

    def test_rating_sequence_idempotency_and_summary(self):
        session = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
        self.assertEqual(self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json['id'], session['id'])
        first, second = [card['id'] for card in session['cards']]
        path = '/sessions/'+session['id']
        self.assertEqual(self.request('post', path+'/rate', {'card_id': first, 'grade': True}).status_code, 400)
        self.assertEqual(self.request('post', path+'/rate', {'card_id': second, 'grade': 3}).status_code, 409)
        self.assertEqual(self.request('get', path, user='two').status_code, 404)
        self.assertEqual(self.request('post', path+'/rate', {'card_id': first, 'grade': 1}, user='two').status_code, 404)
        result = self.request('post', path+'/rate', {'card_id': first, 'grade': 1}).json
        self.assertEqual(result['summary']['studied'], 1)
        self.assertEqual(self.request('post', path+'/rate', {'card_id': first, 'grade': 1}).json['summary']['studied'], 1)
        self.assertEqual(self.request('post', path+'/rate', {'card_id': first, 'grade': 2}).status_code, 409)
        result = self.request('post', path+'/rate', {'card_id': second, 'grade': 3}).json
        self.assertIsNotNone(result['finished_at'])
        self.assertEqual(result['summary'], {'total': 2, 'studied': 2, 'counts': [0, 1, 0, 1], 'remembered': 1, 'remembered_percent': 50})
        self.assertEqual(self.request('post', path+'/rate', {'card_id': second, 'grade': 3}).json, result)
        self.assertEqual(self.request('post', path+'/finish', {}).json, result)
        self.assertNotEqual(self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json['id'], session['id'])

    def test_favorites_sources_and_empty_deck(self):
        self.assertEqual(self.request('post', '/sessions', {'kind': 'favorites', 'deck_id': 'favorites'}).status_code, 400)
        for source, target in [('dictionary', 'jmdict:1'), ('lesson', 'word2')]:
            path = f'/favorites/{source}/{target}'
            self.assertFalse(self.request('get', path).json['saved'])
            self.assertTrue(self.request('put', path).json['saved'])
            self.assertTrue(self.request('put', path).json['saved'])
            self.assertTrue(self.request('get', path).json['saved'])
        self.assertEqual(self.request('get', '/decks?kind=favorites').json['items'][0]['card_count'], 2)
        self.assertEqual(self.request('get', '/decks?kind=favorites', user='two').json['items'][0]['card_count'], 0)
        session = self.request('post', '/sessions', {'kind': 'favorites', 'deck_id': 'favorites'}).json
        self.assertEqual(len(session['cards']), 2)
        self.assertTrue(all('school' not in card['back'] for card in session['cards']))
        self.assertFalse(self.request('delete', '/favorites/dictionary/jmdict:1').json['saved'])
        self.assertEqual(len(self.request('get', '/sessions/'+session['id']).json['cards']), 2)
        self.assertEqual(self.request('put', '/favorites/dictionary/local:missing').status_code, 404)

    def test_catalog_resume_finish_early_and_auth(self):
        result = self.request('get', '/decks?kind=lesson&level=N5').json
        self.assertEqual(result['items'][0]['card_count'], 2)
        self.assertEqual(self.request('get', '/decks?kind=lesson&level=N1').json['items'], [])
        self.assertEqual(self.request('get', '/decks?page=x').status_code, 400)
        session = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
        self.assertEqual(self.request('get', '/decks').json['active_session']['id'], session['id'])
        result = self.request('post', '/sessions/'+session['id']+'/finish', {}).json
        self.assertEqual(result['summary']['studied'], 0)
        self.assertEqual(result['summary']['remembered_percent'], 0)
        self.assertIsNone(self.request('get', '/decks').json['active_session'])
        self.assertEqual(self.request('post', '/sessions/'+session['id']+'/rate', {'card_id': session['cards'][0]['id'], 'grade': 2}).status_code, 409)
        self.assertEqual(self.client.get('/api/flashcards/decks').status_code, 401)

    def learned_deck(self):
        cards = [{'front': word, 'reading': reading, 'back': meaning} for word, reading, meaning in [
            ('学校', 'がっこう', 'trường học'), ('人生', 'じんせい', 'cuộc đời'),
            ('約束', 'やくそく', 'lời hứa'), ('経験', 'けいけん', 'kinh nghiệm'),
            ('旅行', 'りょこう', 'du lịch'), ('図書館', 'としょかん', 'thư viện')]]
        deck = self.request('post', '/decks', {'title': 'Ôn hằng ngày', 'cards': cards}).json
        session = self.request('post', '/sessions', {'kind': 'custom', 'deck_id': deck['id']}).json
        for card, grade in zip(session['cards'], [0, 1, 2, 3, 2, 3]):
            result = self.request('post', '/sessions/'+session['id']+'/rate', {'card_id': card['id'], 'grade': grade})
            self.assertEqual(result.status_code, 200, result.json)
        return session

    def test_home_review_uses_latest_self_rating_and_is_resumable(self):
        original = self.learned_deck()
        home = self.request('get', '/home').json
        self.assertEqual(home['weak_count'], 2)
        self.assertEqual(home['quiz_available'], 5)
        review = self.request('post', '/review', {}).json
        self.assertEqual({card['front'] for card in review['cards']}, {'学校', '人生'})
        self.assertEqual(self.request('post', '/review', {}).json['id'], review['id'])
        self.assertEqual(self.request('get', '/home').json['active_session']['remaining'], 2)
        for card in review['cards']:
            self.request('post', '/sessions/'+review['id']+'/rate', {'card_id': card['id'], 'grade': 3})
        self.assertEqual(self.request('get', '/home').json['weak_count'], 0)
        self.assertEqual(self.request('get', '/home', user='two').json['learned_count'], 0)
        self.assertEqual(self.request('get', '/sessions/'+original['id']).json['summary']['counts'], [1, 1, 2, 2])
        self.assertEqual(self.request('post', '/review', {}).status_code, 409)
        repeated = self.request('post', '/review', {'mode': 'repeat', 'session_id': review['id']}).json
        self.assertNotEqual(repeated['id'], review['id'])
        self.assertEqual([card['front'] for card in repeated['cards']], [card['front'] for card in review['cards']])
        self.assertEqual(self.request('post', '/review', {'mode': 'repeat', 'session_id': review['id']}, user='two').status_code, 404)

    def test_daily_quiz_answers_are_private_ordered_idempotent_and_separate(self):
        session = self.learned_deck()
        quiz = self.request('post', '/daily-quiz', {}).json
        self.assertEqual(quiz['total'], 5)
        self.assertEqual(self.request('post', '/daily-quiz', {}).json['id'], quiz['id'])
        self.assertTrue(all('answer' not in question and 'correct_id' not in question for question in quiz['questions']))
        self.assertTrue({q['front'] for q in quiz['questions'][:2]} == {'学校', '人生'})
        private = db.session.get(FlashcardDailyQuiz, quiz['id'])
        stored = private.questions
        path = '/daily-quiz/'+quiz['id']+'/answer'
        second = stored[1]
        self.assertEqual(self.request('post', path, {'question_id': second['id'], 'option_id': second['correct_id']}).status_code, 409)
        self.assertEqual(self.request('post', path, {'question_id': stored[0]['id'], 'option_id': stored[0]['correct_id']}, user='two').status_code, 404)
        for index, question in enumerate(stored):
            chosen = question['correct_id'] if index else next(option['id'] for option in question['options'] if option['id'] != question['correct_id'])
            payload = {'question_id': question['id'], 'option_id': chosen}
            result = self.request('post', path, payload)
            self.assertEqual(result.status_code, 200, result.json)
            self.assertEqual(result.json['answered'], index + 1)
            self.assertEqual(self.request('post', path, payload).json, result.json)
            if index == 0:
                self.assertEqual(self.request('post', path, {'question_id': question['id'], 'option_id': question['correct_id']}).status_code, 409)
        self.assertEqual(result.json['correct'], 4)
        self.assertIsNotNone(result.json['finished_at'])
        self.assertEqual(self.request('get', '/sessions/'+session['id']).json['summary']['counts'], [1, 1, 2, 2])
        wrong = self.request('post', '/review', {'mode': 'quiz', 'quiz_id': quiz['id']}).json
        self.assertEqual([card['front'] for card in wrong['cards']], [stored[0]['card']['front']])
        self.assertTrue(self.request('get', '/home').json['quiz']['finished'])

    def test_quiz_empty_ambiguity_and_new_day(self):
        self.assertEqual(self.request('get', '/home').json['quiz_available'], 0)
        self.assertEqual(self.request('post', '/daily-quiz', {}).status_code, 409)
        self.assertEqual(self.client.get('/api/flashcards/home').status_code, 401)
        self.learned_deck()
        with patch('flashcards.daily.today', return_value=date(2026, 10, 19)):
            first = self.request('post', '/daily-quiz', {}).json
        with patch('flashcards.daily.today', return_value=date(2026, 10, 20)):
            self.assertIsNone(self.request('get', '/home').json['quiz'])
            second = self.request('post', '/daily-quiz', {}).json
        self.assertNotEqual(first['id'], second['id'])
        # Equal meanings and overlapping synonyms must not become alternative answers.
        row = db.session.scalar(db.select(FlashcardSession).order_by(FlashcardSession.started_at.desc()))
        row.cards = [{**card, 'back': 'trường học; nhà trường'} for card in row.cards]
        db.session.commit()
        with patch('flashcards.daily.today', return_value=date(2026, 10, 21)):
            self.assertEqual(self.request('get', '/home').json['quiz_available'], 0)

    def test_fsrs_ratings_are_atomic_shared_and_idempotent(self):
        instant = datetime(2026, 10, 20, 3, tzinfo=timezone.utc)
        session = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
        path = '/sessions/' + session['id'] + '/rate'
        card = session['cards'][0]
        with patch('flashcards.routes.timestamp', return_value=millis(instant)):
            result = self.request('post', path, {'card_id': card['id'], 'grade': 0})
            self.assertEqual(result.status_code, 200, result.json)
            state = db.session.get(FlashcardSchedule, ('one', card['id']))
            self.assertEqual(state.due_at, millis(instant + timedelta(minutes=1)))
            self.assertEqual(state.review_count, 1)
            self.assertIsNotNone(state.fsrs_card['stability'])
            due = state.due_at
            self.request('post', path, {'card_id': card['id'], 'grade': 0})
            self.assertEqual(state.due_at, due)
            self.assertEqual(db.session.query(FlashcardReviewLog).count(), 1)
        # Opening the same lesson word through favorites updates the same state.
        self.request('put', '/favorites/lesson/word1')
        favorite = self.request('post', '/sessions', {'kind': 'favorites', 'deck_id': 'favorites'}).json
        with patch('flashcards.routes.timestamp', return_value=millis(instant + timedelta(minutes=2))):
            self.assertEqual(self.request('post', '/sessions/' + favorite['id'] + '/rate',
                {'card_id': card['id'], 'grade': 3}).status_code, 200)
        self.assertEqual(db.session.query(FlashcardSchedule).count(), 1)
        self.assertEqual(state.review_count, 2)
        self.assertGreater(state.due_at, due)
        self.assertEqual(self.request('get', '/schedule', user='two').json['scheduled_count'], 0)

    def test_due_review_waits_for_exact_due_time_and_prunes_other_sessions(self):
        instant = datetime(2026, 10, 20, 3, tzinfo=timezone.utc)
        original = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
        card = original['cards'][0]
        with patch('flashcards.routes.timestamp', return_value=millis(instant)):
            self.request('post', '/sessions/' + original['id'] + '/rate', {'card_id': card['id'], 'grade': 0})
        with patch('flashcards.srs.utc_now', return_value=instant):
            summary = self.request('get', '/schedule').json
            self.assertEqual(summary['due_count'], 0)
            self.assertEqual(summary['today_count'], 1)
            self.assertEqual(self.request('get', '/home').json['today_count'], 1)
            self.assertEqual(self.request('get', '/home').json['due_count'], 0)
            self.assertEqual(self.request('post', '/due-review', {}).status_code, 409)
        later = instant + timedelta(minutes=1)
        with patch('flashcards.srs.utc_now', return_value=later):
            self.assertEqual(self.request('get', '/home').json['due_count'], 1)
            review = self.request('post', '/due-review', {}).json
            self.assertEqual([item['id'] for item in review['cards']], [card['id']])
            self.assertEqual(self.request('post', '/due-review', {}).json['id'], review['id'])
            self.assertEqual(self.request('post', '/due-review', {}, user='two').status_code, 409)
            self.request('put', '/favorites/lesson/word1')
            favorite = self.request('post', '/sessions', {'kind': 'favorites', 'deck_id': 'favorites'}).json
            with patch('flashcards.routes.timestamp', return_value=millis(later)):
                self.request('post', '/sessions/' + favorite['id'] + '/rate', {'card_id': card['id'], 'grade': 3})
            # Stale due snapshot cannot schedule the same review again.
            self.assertEqual(self.request('post', '/sessions/' + review['id'] + '/rate',
                {'card_id': card['id'], 'grade': 2}).status_code, 409)
            cleaned = self.request('get', '/sessions/' + review['id']).json
            self.assertEqual(cleaned['cards'], [])
            self.assertIsNotNone(cleaned['finished_at'])

    def test_calendar_uses_vietnam_midnight_and_reminders_only_when_due(self):
        instant = datetime(2026, 10, 20, 16, 30, tzinfo=timezone.utc)  # 23:30 Vietnam
        session = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
        for card in session['cards']:
            self.request('post', '/sessions/' + session['id'] + '/rate', {'card_id': card['id'], 'grade': 2})
        states = list(db.session.scalars(db.select(FlashcardSchedule).order_by(FlashcardSchedule.card_id)))
        states[0].due_at = millis(instant - timedelta(days=2))
        states[1].due_at = millis(datetime(2026, 10, 20, 17, tzinfo=timezone.utc))  # tomorrow 00:00
        db.session.commit()
        self.assertEqual(self.request('put', '/reminder', {'enabled': True, 'hour': 19, 'minute': 0}).status_code, 200)
        with patch('flashcards.srs.utc_now', return_value=instant):
            summary = self.request('get', '/schedule?days=7').json
        self.assertEqual(summary['today'], '2026-10-20')
        self.assertEqual(summary['due_count'], 1)
        self.assertEqual(summary['overdue_count'], 1)
        self.assertEqual([item['count'] for item in summary['days']], [1, 1, 0, 0, 0, 0, 0])
        self.assertEqual(len(summary['reminders']), 6)
        self.assertEqual(summary['reminders'][0]['at'], millis(datetime(2026, 10, 21, 12, tzinfo=timezone.utc)))
        self.assertEqual(summary['reminders'][0]['count'], 2)
        self.request('put', '/reminder', {'enabled': False, 'hour': 19, 'minute': 0})
        self.assertEqual(self.request('get', '/schedule').json['reminders'], [])
        for days in ('x', '0', '91', '-1'):
            self.assertEqual(self.request('get', '/schedule?days=' + days).status_code, 400)
        for payload in ({'enabled': 1, 'hour': 19, 'minute': 0}, {'enabled': True, 'hour': 24, 'minute': 0},
                {'enabled': True, 'hour': 19, 'minute': -1}):
            self.assertEqual(self.request('put', '/reminder', payload).status_code, 400)
        self.assertEqual(self.client.get('/api/flashcards/schedule').status_code, 401)

    def test_custom_edit_preserves_unchanged_card_schedule_and_retires_removed_cards(self):
        deck = self.create()
        session = self.request('post', '/sessions', {'kind': 'custom', 'deck_id': deck['id']}).json
        for card in session['cards']:
            self.request('post', '/sessions/' + session['id'] + '/rate', {'card_id': card['id'], 'grade': 2})
        result = self.request('put', '/decks/' + deck['id'], {'title': 'Đổi tên', 'cards': deck['cards']}).json
        self.assertEqual([c['id'] for c in result['cards']], [c['id'] for c in deck['cards']])
        self.request('put', '/decks/' + deck['id'], {'title': 'Đổi tên', 'cards': deck['cards'][:1]})
        self.assertTrue(db.session.get(FlashcardSchedule, ('one', deck['cards'][0]['id'])).active)
        self.assertFalse(db.session.get(FlashcardSchedule, ('one', deck['cards'][1]['id'])).active)
        self.assertEqual(self.request('get', '/schedule').json['scheduled_count'], 1)

    def test_weak_review_keeps_original_identity_and_backfill_is_repeatable(self):
        original = self.learned_deck()
        review = self.request('post', '/review', {}).json
        card = review['cards'][0]
        self.assertIn(card['srs_id'], {item['id'] for item in original['cards']})
        self.request('post', '/sessions/' + review['id'] + '/rate', {'card_id': card['id'], 'grade': 2})
        self.assertEqual(db.session.query(FlashcardSchedule).count(), 6)
        self.assertEqual(db.session.get(FlashcardSchedule, ('one', card['srs_id'])).review_count, 2)
        db.session.execute(delete(FlashcardReviewLog))
        db.session.execute(delete(FlashcardSchedule))
        db.session.commit()
        runner = self.app.test_cli_runner()
        first = runner.invoke(args=['backfill-flashcard-srs'])
        self.assertEqual(first.exit_code, 0, str(first.exception))
        self.assertIn('7', first.output)
        self.assertEqual(db.session.query(FlashcardSchedule).count(), 6)
        self.assertEqual(db.session.query(FlashcardReviewLog).count(), 7)
        second = runner.invoke(args=['backfill-flashcard-srs'])
        self.assertEqual(second.exit_code, 0, str(second.exception))
        self.assertIn('0', second.output)

    def test_concurrent_postgres_ratings_schedule_once(self):
        if db.engine.dialect.name != 'postgresql':
            self.skipTest('Row-level concurrency requires PostgreSQL')
        from concurrent.futures import ThreadPoolExecutor
        session = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
        card = session['cards'][0]
        def rate_once(_):
            with self.app.test_client() as client:
                response = client.post('/api/flashcards/sessions/' + session['id'] + '/rate',
                    headers={'Authorization': 'Bearer one'}, json={'card_id': card['id'], 'grade': 2})
                return response.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(rate_once, range(2))), [200, 200])
        db.session.expire_all()
        self.assertEqual(db.session.get(FlashcardSchedule, ('one', card['id'])).review_count, 1)
        self.assertEqual(db.session.query(FlashcardReviewLog).count(), 1)

    def test_preview_matches_saved_fsrs_due_and_does_not_write_reviews(self):
        instant = datetime(2026, 10, 20, 3, tzinfo=timezone.utc)
        with patch('flashcards.routes.timestamp', return_value=millis(instant)):
            session = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
            options = session['rating_options']
            self.assertEqual([item['grade'] for item in options], [0, 1, 2, 3])
            self.assertEqual(options[0]['due_at'], millis(instant + timedelta(minutes=1)))
            self.assertEqual(options[2]['due_at'], millis(instant + timedelta(minutes=10)))
            self.assertEqual(db.session.query(FlashcardSchedule).count(), 0)
            self.assertEqual(db.session.query(FlashcardReviewLog).count(), 0)
            card = session['cards'][0]
            self.request('post', '/sessions/' + session['id'] + '/rate', {'card_id': card['id'], 'grade': 3})
            state = db.session.get(FlashcardSchedule, ('one', card['id']))
            self.assertEqual(state.due_at, options[3]['due_at'])
            self.request('get', '/sessions/' + session['id'])
            self.assertEqual(state.review_count, 1)
            self.assertEqual(db.session.query(FlashcardReviewLog).count(), 1)

    def test_reviewed_today_counts_unique_cards_and_resets_at_vietnam_midnight(self):
        instant = datetime(2026, 10, 20, 16, 55, tzinfo=timezone.utc)
        session = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
        card = session['cards'][0]
        with patch('flashcards.routes.timestamp', return_value=millis(instant)):
            self.request('post', '/sessions/' + session['id'] + '/rate', {'card_id': card['id'], 'grade': 0})
        self.request('put', '/favorites/lesson/word1')
        favorite = self.request('post', '/sessions', {'kind': 'favorites', 'deck_id': 'favorites'}).json
        with patch('flashcards.routes.timestamp', return_value=millis(instant + timedelta(minutes=1))):
            self.request('post', '/sessions/' + favorite['id'] + '/rate', {'card_id': card['id'], 'grade': 3})
        with patch('flashcards.srs.utc_now', return_value=instant + timedelta(minutes=2)):
            self.assertEqual(self.request('get', '/schedule').json['reviewed_today_count'], 1)
            self.assertEqual(self.request('get', '/schedule', user='two').json['reviewed_today_count'], 0)
        with patch('flashcards.srs.utc_now', return_value=instant + timedelta(minutes=5)):
            self.assertEqual(self.request('get', '/schedule').json['reviewed_today_count'], 0)

    def test_same_day_relearning_stays_in_today_count_until_scheduled_to_another_day(self):
        instant = datetime(2026, 10, 20, 3, tzinfo=timezone.utc)
        session = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
        card = session['cards'][0]
        with patch('flashcards.routes.timestamp', return_value=millis(instant)):
            self.request('post', '/sessions/' + session['id'] + '/rate', {'card_id': card['id'], 'grade': 2})
        with patch('flashcards.srs.utc_now', return_value=instant):
            schedule = self.request('get', '/schedule').json
            self.assertEqual(schedule['today_count'], 1)
            self.assertEqual(schedule['reviewed_today_count'], 1)
            self.assertEqual(schedule['due_count'], 0)
            self.assertEqual(self.request('post', '/due-review', {}).status_code, 409)
        later = instant + timedelta(minutes=10)
        with patch('flashcards.srs.utc_now', return_value=later):
            review = self.request('post', '/due-review', {}).json
            with patch('flashcards.routes.timestamp', return_value=millis(later)):
                self.request('post', '/sessions/' + review['id'] + '/rate', {'card_id': card['id'], 'grade': 3})
            summary = self.request('get', '/schedule').json
            self.assertEqual(summary['today_count'], 0)
            self.assertEqual(summary['reviewed_today_count'], 1)

    def test_session_favorites_share_lesson_identity_and_check_ownership(self):
        session = self.request('post', '/sessions', {'kind': 'lesson', 'deck_id': 'lesson'}).json
        card = session['cards'][0]
        path = '/sessions/' + session['id'] + '/favorite/' + card['id']
        self.assertFalse(self.request('get', path).json['saved'])
        self.assertEqual(self.request('put', path, user='two').status_code, 404)
        self.assertEqual(self.request('get', path, user='two').status_code, 404)
        self.assertEqual(self.request('put', '/sessions/' + session['id'] + '/favorite/missing').status_code, 404)
        self.assertTrue(self.request('put', path).json['saved'])
        self.assertTrue(self.request('put', path).json['saved'])
        self.assertTrue(self.request('get', '/favorites/lesson/word1').json['saved'])
        self.assertEqual(self.request('get', '/decks?kind=favorites').json['items'][0]['card_count'], 1)
        self.assertEqual(self.request('get', '/sessions/' + session['id']).json['ratings'], {})
        self.assertFalse(self.request('delete', path).json['saved'])
        self.assertFalse(self.request('get', '/favorites/lesson/word1').json['saved'])

    def test_custom_session_favorite_keeps_snapshot_and_fsrs_after_deck_edit(self):
        deck = self.create()
        session = self.request('post', '/sessions', {'kind': 'custom', 'deck_id': deck['id']}).json
        card = session['cards'][0]
        path = '/sessions/' + session['id'] + '/favorite/' + card['id']
        self.request('post', '/sessions/' + session['id'] + '/rate', {'card_id': card['id'], 'grade': 2})
        state = db.session.get(FlashcardSchedule, ('one', card['id']))
        due = state.due_at
        self.assertTrue(self.request('put', path).json['saved'])
        self.assertEqual(state.due_at, due)
        self.request('put', '/decks/' + deck['id'], {'title': 'Bộ mới', 'cards': deck['cards'][1:]})
        self.assertTrue(state.active)
        saved = self.request('post', '/sessions', {'kind': 'favorites', 'deck_id': 'favorites'}).json
        self.assertEqual(saved['cards'], [card])
        self.assertFalse(self.request('delete', path).json['saved'])
        self.assertFalse(state.active)
        # Removing a favorite does not change an already-open study snapshot.
        self.assertEqual(self.request('get', '/sessions/' + saved['id']).json['cards'], [card])
