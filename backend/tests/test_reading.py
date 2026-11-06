import csv
import tempfile
import unittest
import uuid
import json
from pathlib import Path
from unittest.mock import patch
from flask import Flask
from sqlalchemy import select, func
from auth import init_auth
from auth.models import User, AuthSession, RateLimit, now
from auth.security import digest
from extensions import db
from reading import init_reading
from reading.importer import COLUMNS, import_dataset
from reading.replacement import replace_dataset
from reading.models import ReadingPassage, ReadingAttempt, ReadingInsight
from api_errors import ApiError
from reading.study import normalize, source_for
from reading_study_fixtures import analysis_payload, explanation_payload


def row(**changes):
    return {**dict(zip(COLUMNS, ['N5', '短文', 'JLPT N5 – Reading Exercise 01', '1',
        '学校へ行きました。\n\n 明日も行きます。', 'どこへ？', '学校', '家', '駅', '店', '1', '学校', 'https://example.com/reading/1'])), **changes}


class ReadingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Flask(__name__)
        cls.app.config.update(TESTING=True, AUTH_CONFIGURED=True, AUTH_SECRET_KEY='reading-test-' * 4,
                              SQLALCHEMY_DATABASE_URI='sqlite://')
        init_auth(cls.app)
        init_reading(cls.app)
        with cls.app.app_context():
            db.create_all()

    def setUp(self):
        self.context = self.app.app_context()
        self.context.push()
        db.session.query(RateLimit).delete()
        db.session.query(ReadingInsight).delete()
        db.session.query(ReadingAttempt).delete()
        db.session.query(ReadingPassage).delete()
        db.session.query(AuthSession).delete()
        db.session.query(User).delete()
        db.session.add(User(id='reader', name='Reader', email='reader@example.invalid', phone='+84900000000'))
        db.session.flush()
        db.session.add(AuthSession(user_id='reader', access_hash=digest('reading-token'),
                                  access_expires_at=now() + 900, expires_at=now() + 900))
        db.session.commit()
        self.directory = tempfile.TemporaryDirectory()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        self.context.pop()
        self.directory.cleanup()

    def dataset(self, rows):
        path = Path(self.directory.name) / 'reading.csv'
        with path.open('w', encoding='utf-8-sig', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=COLUMNS)
            writer.writeheader(); writer.writerows(rows)
        return path

    def get(self, path):
        return self.client.get('/api/reading' + path, headers={'Authorization': 'Bearer reading-token'})

    def test_import_groups_idempotently_and_preserves_text(self):
        path = self.dataset([row(), row(**{'Câu hỏi': 'いつ？', 'Đáp án (nội dung)': 'khác'})])
        report = import_dataset(path, dry_run=True)
        self.assertEqual((report['passages'], report['questions']), (1, 2))
        self.assertEqual(report['answer_mismatch_lines'], [3])
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ReadingPassage)), 0)
        import_dataset(path); import_dataset(path)
        passages = db.session.scalars(select(ReadingPassage)).all()
        self.assertEqual(len(passages), 1)
        self.assertEqual(len(passages[0].questions), 2)
        self.assertEqual(passages[0].text, row()['Bài đọc'])
        with patch('reading.analysis.analyze', side_effect=AssertionError('Cache must be reused')):
            response = self.get('/passages/' + passages[0].id)
        self.assertEqual(response.status_code, 200)
        data = response.json
        self.assertNotIn('questions', data); self.assertNotIn('answer', data)
        self.assertEqual(len(data['quiz']['questions']), 1)
        self.assertEqual(set(data['quiz']['questions'][0]), {'id', 'text', 'options'})
        self.assertIsNone(data['quiz']['last_attempt'])
        self.assertEqual('\n'.join(p['text'] for p in data['paragraphs']), row()['Bài đọc'])
        self.assertTrue(any(w['reading'] == 'がっこう' for w in data['words'].values()))
        for paragraph in data['paragraphs']:
            self.assertEqual(''.join(t['text'] for t in paragraph['tokens']), paragraph['text'])

    def test_replacement_backs_up_old_data_and_keeps_accounts(self):
        import_dataset(self.dataset([row()]))
        old = db.session.scalar(select(ReadingPassage))
        db.session.add(ReadingAttempt(id='old-attempt', user_id='reader', passage_id=old.id,
            request_id='old-request', version='old', result={}, created_at=1))
        db.session.add(ReadingInsight(passage_id=old.id, kind='analysis', source_hash='old',
            status='ready', updated_at=1, payload={}))
        db.session.commit()
        path = self.dataset([row(**{'Level': 'N3', 'Nguồn': 'https://example.com/new'})])
        report = replace_dataset(path, Path(self.directory.name) / 'backups')
        self.assertEqual(report['removed'], {'reading_passages': 1, 'reading_attempts': 1, 'reading_insights': 1})
        backup = json.loads(Path(report['backup']).read_text())
        self.assertEqual(backup['tables']['reading_attempts'][0]['id'], 'old-attempt')
        self.assertEqual(Path(report['backup']).stat().st_mode & 0o777, 0o600)
        self.assertIsNotNone(db.session.get(User, 'reader'))
        current = db.session.scalar(select(ReadingPassage))
        self.assertEqual(current.level, 'N3')
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ReadingAttempt)), 0)
        db.session.add(ReadingAttempt(id='new-attempt', user_id='reader', passage_id=current.id,
            request_id='new-request', version='new', result={}, created_at=2))
        db.session.commit()
        self.assertTrue(replace_dataset(path, Path(self.directory.name) / 'backups')['unchanged'])
        self.assertIsNotNone(db.session.get(ReadingAttempt, 'new-attempt'))

    def test_replacement_rolls_back_if_analysis_fails(self):
        import_dataset(self.dataset([row()]))
        old_id = db.session.scalar(select(ReadingPassage.id))
        path = self.dataset([row(**{'Nguồn': 'https://example.com/new'})])
        with patch('reading.replacement.passage_analysis', side_effect=RuntimeError('test failure')):
            with self.assertRaises(RuntimeError):
                replace_dataset(path, Path(self.directory.name) / 'backups')
        self.assertEqual(list(db.session.scalars(select(ReadingPassage.id))), [old_id])
        self.assertEqual(len(list((Path(self.directory.name) / 'backups').glob('*.json'))), 1)

    def test_filters_pagination_order_and_literal_search(self):
        import_dataset(self.dataset([row(), row(**{'Đoạn': '2', 'Bài đọc': '100% 本'}), row(**{'Level': 'N4', 'Dạng mondai': '長文'})]))
        data = self.get('/passages?level=N5&page_size=1&page=2').json
        self.assertEqual(data['pagination']['total'], 2)
        self.assertEqual(data['items'][0]['paragraph'], 2)
        self.assertEqual(len(self.get('/passages?type=long').json['items']), 1)
        self.assertEqual(len(self.get('/passages?q=%25').json['items']), 1)
        self.assertEqual(self.get('/passages?level=N1').json['pagination']['total'], 0)
        self.assertEqual([p['level'] for p in self.get('/passages').json['items']], ['N5', 'N5', 'N4'])

    def test_validation_and_authentication(self):
        for query in ['level=N6', 'type=unknown', 'page=0', 'page=abc', 'page_size=999', 'q=' + 'x'*101]:
            self.assertEqual(self.get('/passages?' + query).status_code, 400)
        self.assertEqual(self.get('/passages/missing').status_code, 404)
        self.assertEqual(self.client.get('/api/reading/passages').status_code, 401)
        self.assertEqual(self.client.get('/api/reading/passages/missing').status_code, 401)

    def test_invalid_rows_do_not_partially_write(self):
        for rows in [[row(), row(**{'Bài đọc': '違う'})], [row(), row(**{'Level': 'N6'})], [row(**{'Nguồn': 'javascript:alert(1)'})]]:
            with self.assertRaises(ValueError): import_dataset(self.dataset(rows))
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ReadingPassage)), 0)

    def test_changed_text_invalidates_cache(self):
        import_dataset(self.dataset([row()]))
        import_dataset(self.dataset([row(**{'Bài đọc': '猫です。'})]))
        passage = db.session.scalar(select(ReadingPassage))
        data = self.get('/passages/' + passage.id).json
        self.assertEqual(data['text'], '猫です。')
        self.assertEqual(''.join(t['text'] for t in data['paragraphs'][0]['tokens']), '猫です。')


    def quiz(self, rows=None):
        import_dataset(self.dataset(rows or [row(), row(**{'Câu hỏi': 'いつ？', 'Đáp án (số)': '2', 'Đáp án (nội dung)': '家'})]))
        passage = db.session.scalar(select(ReadingPassage))
        data = self.get('/passages/' + passage.id).json
        return passage, data['quiz']

    def submit(self, passage, quiz, answers, request_id=None):
        return self.client.post('/api/reading/passages/' + passage.id + '/attempts',
            json={'version': quiz['version'], 'answers': answers, 'request_id': request_id or str(uuid.uuid4())},
            headers={'Authorization': 'Bearer reading-token'})

    def test_grades_on_server_persists_and_replays_without_duplicate(self):
        passage, quiz = self.quiz()
        request_id = str(uuid.uuid4())
        response = self.submit(passage, quiz, {'q1': 0, 'q2': 0}, request_id)
        self.assertEqual(response.status_code, 201)
        self.assertEqual((response.json['correct'], response.json['total'], response.json['score']), (1, 2, 50))
        self.assertEqual(response.json['results'][1]['correct_index'], 1)
        replay = self.submit(passage, quiz, {'q1': 0, 'q2': 0}, request_id)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json, response.json)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ReadingAttempt)), 1)
        self.assertEqual(self.submit(passage, quiz, {'q1': 0, 'q2': 1}, request_id).status_code, 409)
        self.assertEqual(self.get('/passages/' + passage.id).json['quiz']['last_attempt'], response.json)
        # A different account must never receive another reader's result.
        db.session.add(User(id='reader2', name='Reader 2', email='reader2@example.invalid', phone='+84900000001'))
        db.session.flush()
        db.session.add(AuthSession(user_id='reader2', access_hash=digest('second-token'),
                                  access_expires_at=now()+900, expires_at=now()+900))
        db.session.commit()
        other = self.client.get('/api/reading/passages/' + passage.id, headers={'Authorization': 'Bearer second-token'})
        self.assertIsNone(other.json['quiz']['last_attempt'])
        self.assertEqual(self.submit(passage, quiz, {'q1': 0, 'q2': 1}).json['score'], 100)
        self.assertEqual(self.submit(passage, quiz, {'q1': 3, 'q2': 3}).json['score'], 0)

    def test_submission_validation_and_changed_question_version(self):
        passage, quiz = self.quiz()
        for answers in [None, [], {}, {'q1': 0}, {'q1': 0, 'q2': 1, 'q3': 0},
                        {'q1': True, 'q2': 1}, {'q1': -1, 'q2': 1}, {'q1': 4, 'q2': 1}, {'q1': '0', 'q2': 1}]:
            self.assertEqual(self.submit(passage, quiz, answers).status_code, 400)
        self.assertEqual(self.submit(passage, quiz, {'q1': 0, 'q2': 1}, 'bad-id').status_code, 400)
        self.assertEqual(self.submit(passage, {'version': 'old'}, {'q1': 0, 'q2': 1}).status_code, 409)
        url = '/api/reading/passages/' + passage.id + '/attempts'
        self.assertEqual(self.client.post(url, json={}).status_code, 401)
        self.assertEqual(self.client.post(url, data='[]', content_type='application/json',
            headers={'Authorization': 'Bearer reading-token'}).status_code, 400)
        self.assertEqual(self.client.post('/api/reading/passages/missing/attempts',
            json={'request_id': str(uuid.uuid4())}, headers={'Authorization': 'Bearer reading-token'}).status_code, 404)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ReadingAttempt)), 0)
        self.submit(passage, quiz, {'q1': 0, 'q2': 1})
        passage.text = 'Nội dung mới'; db.session.commit()
        self.assertIsNone(self.get('/passages/' + passage.id).json['quiz']['last_attempt'])
        self.assertEqual(self.submit(passage, quiz, {'q1': 0, 'q2': 1}).status_code, 409)

    def test_unreliable_or_missing_answer_keys_are_not_graded(self):
        passage, quiz = self.quiz([row(**{'Đáp án (nội dung)': 'Không khớp'})])
        self.assertEqual(quiz['questions'], [])
        self.assertEqual(self.submit(passage, quiz, {}).status_code, 409)
        passage.questions = []; db.session.commit()
        self.assertEqual(self.get('/passages/' + passage.id).json['quiz']['questions'], [])


    def study_post(self, passage, suffix, payload=None, token='reading-token'):
        return self.client.post('/api/reading/passages/' + passage.id + suffix, json=payload or {},
                                headers={'Authorization': 'Bearer ' + token})

    def test_analysis_is_explicit_persisted_and_invalidated_after_source_change(self):
        passage, _ = self.quiz()
        def fake(source, kind): return normalize(analysis_payload(source), source, kind)
        with patch('reading.study.generate', side_effect=fake) as provider:
            self.assertIsNone(self.get('/passages/' + passage.id).json['study_analysis'])
            provider.assert_not_called()
            result = self.study_post(passage, '/analysis')
            self.assertEqual(result.status_code, 200)
            self.assertEqual(self.study_post(passage, '/analysis').json, result.json)
            self.assertEqual(self.get('/passages/' + passage.id).json['study_analysis'], result.json)
            self.assertEqual(provider.call_count, 1)
            passage.text = '学校へ行きます。'; db.session.commit()
            self.assertIsNone(self.get('/passages/' + passage.id).json['study_analysis'])
            self.assertEqual(self.study_post(passage, '/analysis').status_code, 200)
            self.assertEqual(provider.call_count, 2)

    def test_explanation_requires_owned_current_graded_attempt_even_for_cached_data(self):
        passage, quiz = self.quiz()
        grade = self.submit(passage, quiz, {'q1': 0, 'q2': 0}).json
        suffix = '/questions/q1/explanation'
        def fake(source, kind): return normalize(explanation_payload(source), source, kind)
        with patch('reading.study.generate', side_effect=fake) as provider:
            self.assertEqual(self.study_post(passage, suffix).status_code, 400)
            self.assertEqual(self.study_post(passage, suffix, {'attempt_id': 'someone-else'}).status_code, 403)
            result = self.study_post(passage, suffix, {'attempt_id': grade['id']})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json['correct_index'], 0)
            self.assertEqual(self.study_post(passage, suffix, {'attempt_id': grade['id']}).json, result.json)
            self.assertEqual(provider.call_count, 1)
            db.session.add(User(id='reader2', name='Reader 2', email='other@example.invalid', phone='+84900000002'))
            db.session.flush()
            db.session.add(AuthSession(user_id='reader2', access_hash=digest('other-token'),
                                      access_expires_at=now()+900, expires_at=now()+900)); db.session.commit()
            self.assertEqual(self.study_post(passage, suffix, {'attempt_id': grade['id']}, 'other-token').status_code, 403)
            passage.text = '変更'; db.session.commit()
            self.assertEqual(self.study_post(passage, suffix, {'attempt_id': grade['id']}).status_code, 403)

    def test_ai_busy_lease_failure_retry_and_auth(self):
        passage, _ = self.quiz()
        from reading.study import fingerprint
        import time
        source = source_for(passage, 'analysis')
        db.session.add(ReadingInsight(passage_id=passage.id, kind='analysis', source_hash=fingerprint(source, 'analysis'),
                                      status='running', lease='in-flight', updated_at=int(time.time())))
        db.session.commit()
        with patch('reading.study.generate') as provider:
            self.assertEqual(self.study_post(passage, '/analysis').status_code, 409)
            provider.assert_not_called()
            self.assertEqual(self.client.post('/api/reading/passages/' + passage.id + '/analysis').status_code, 401)
        artifact = db.session.get(ReadingInsight, (passage.id, 'analysis')); artifact.updated_at = 0; db.session.commit()
        with patch('reading.study.generate', side_effect=ApiError('Tạm lỗi', 503)):
            self.assertEqual(self.study_post(passage, '/analysis').status_code, 503)
        self.assertEqual(db.session.get(ReadingInsight, (passage.id, 'analysis')).status, 'failed')


    def test_source_changed_during_generation_never_publishes_stale_analysis(self):
        passage, _ = self.quiz()
        def changing(source, kind):
            result = normalize(analysis_payload(source), source, kind)
            passage.text = '新しい内容。'; db.session.commit()
            return result
        with patch('reading.study.generate', side_effect=changing):
            self.assertEqual(self.study_post(passage, '/analysis').status_code, 409)
        self.assertIsNone(self.get('/passages/' + passage.id).json['study_analysis'])
