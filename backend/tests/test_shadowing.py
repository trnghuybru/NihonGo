import json
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch, MagicMock

from sqlalchemy import func, select
import test_speaking as fixtures
from extensions import db
from shadowing import init_shadowing
from shadowing.models import ShadowingJob, ShadowingRequest
from shadowing.service import video_id_from_url
from shadowing.processor import json3_captions, normalize_segments, display_captions, attach_practice_segments, ProcessingError
from shadowing.worker import claim, save_result, dispatch_pending
from video_examples import init_video_examples
from video_examples.importer import import_dataset, DEFAULT_SOURCE
from video_examples.models import CaptionSegment, ExampleVideo
from api_errors import ApiError

PATH = '/api/listening/shadowing/jobs'


class ShadowingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SpeakingTests.setUpClass.__func__(cls)
        init_video_examples(cls.app)
        init_shadowing(cls.app)
        with cls.app.app_context():
            db.create_all()

    tearDownClass = classmethod(fixtures.SpeakingTests.tearDownClass.__func__)
    setUp = fixtures.SpeakingTests.setUp
    tearDown = fixtures.SpeakingTests.tearDown
    scenario = fixtures.SpeakingTests.scenario
    get = fixtures.SpeakingTests.get

    def submit(self, identifier='abcdefghijk', user='alice'):
        with patch('shadowing.queue.enqueue', return_value=False):
            return self.client.post(PATH, json={'url': f'https://youtu.be/{identifier}'},
                headers={'Authorization': f'Bearer {user}'})

    def translation_video(self, count=2):
        video_id = 'translate01'
        db.session.add(ExampleVideo(id=video_id, title='Video test', channel='Test', duration_seconds=count * 2,
            language='ja', caption_kind='manual'))
        db.session.add(ShadowingJob(id='translation-job', video_id=video_id, status='ready', title='Test',
            created_at=100, updated_at=100))
        db.session.flush()
        for number in range(count):
            db.session.add(CaptionSegment(id=f'sentence-{number}', video_id=video_id, sequence=number + 1,
                text='こんにちは。', search_text='こんにちは。', start_seconds=number * 2, end_seconds=number * 2 + 1))
        db.session.commit()
        return f'{PATH}/translation-job/translation'

    def test_quiz_is_on_demand_returns_exact_count_and_does_not_persist(self):
        from shadowing.quiz import quiz_source
        self.translation_video(6)
        url = f'{PATH}/translation-job/questions'
        self.assertEqual(self.client.post(url, json={'count': 2}).status_code, 401)
        self.assertEqual(self.get(url).status_code, 405)
        source = quiz_source('translation-job', 2)
        items = [{'window_index': i, 'question': f'第{i + 1}部分の内容は何ですか。',
                  'choices': ['日本語', '英語', 'フランス語', '中国語'], 'correct_index': i,
                  'explanation': 'Giải thích dựa trên phụ đề.',
                  'evidence_segment_ids': [window['segments'][-1]['segment_id']]}
                 for i, window in enumerate(source['windows'])]
        response_data = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [
            {'text': json.dumps({'questions': items})}]}}]}
        before = {table.name: db.session.scalar(select(func.count()).select_from(table))
                  for table in db.metadata.sorted_tables if table.name.startswith('shadowing')}
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test'}), patch('shadowing.quiz.requests.post') as provider:
            def respond(*args, **kwargs):
                prompt = json.loads(kwargs['json']['contents'][0]['parts'][0]['text'])
                index = prompt['requested_window_index']
                item = {**items[index], 'evidence_segment_ids': [prompt['windows'][0]['segments'][-1]['segment_id']]}
                response = MagicMock(status_code=200)
                response.json.return_value = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [
                    {'text': json.dumps({'questions': [item]})}]}}]}
                return response
            provider.side_effect = respond
            first = self.client.post(url, json={'count': 2}, headers={'Authorization': 'Bearer alice'})
            second = self.client.post(url, json={'count': 2}, headers={'Authorization': 'Bearer alice'})
            self.assertEqual(provider.call_count, 4)  # Two on-demand questions per request; no cache.
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.headers['Cache-Control'], 'no-store')
            questions = first.json['questions']
            self.assertEqual(len(questions), 2)
            self.assertEqual([q['trigger_seconds'] for q in questions], [5, 11])
            self.assertEqual(questions[0]['correct_index'], 0)
            self.assertNotEqual(questions[0]['id'], second.json['questions'][0]['id'])
        after = {table.name: db.session.scalar(select(func.count()).select_from(table))
                 for table in db.metadata.sorted_tables if table.name.startswith('shadowing')}
        self.assertEqual(before, after)

    def test_quiz_rejects_bad_counts_and_unready_source_before_calling_ai(self):
        self.translation_video()
        url = f'{PATH}/translation-job/questions'
        with patch('shadowing.quiz.requests.post') as provider:
            for data in ({}, {'count': True}, {'count': 0}, {'count': 11}, {'count': '2'},
                         {'count': 1.5}, {'count': 3}, []):
                self.assertEqual(self.client.post(url, json=data,
                    headers={'Authorization': 'Bearer alice'}).status_code, 400)
            db.session.get(ShadowingJob, 'translation-job').status = 'queued'
            db.session.commit()
            self.assertEqual(self.client.post(url, json={'count': 1},
                headers={'Authorization': 'Bearer alice'}).status_code, 404)
            provider.assert_not_called()

    def test_quiz_passes_requested_jlpt_level_and_requires_japanese_questions(self):
        from shadowing.quiz import quiz_source, validate_questions, SYSTEM_PROMPT
        self.translation_video()
        url = f'{PATH}/translation-job/questions'
        with patch('shadowing.quiz.generate_questions', return_value={'questions': []}) as provider:
            for level in ('N5', 'N4', 'N3', 'N2', 'N1'):
                response = self.client.post(url, json={'count': 1, 'level': level},
                    headers={'Authorization': 'Bearer alice'})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(provider.call_args.args[0]['jlpt_level'], level)
            provider.reset_mock()
            for level in ('N6', 'n3', None, 3, ['N3']):
                self.assertEqual(self.client.post(url, json={'count': 1, 'level': level},
                    headers={'Authorization': 'Bearer alice'}).status_code, 400)
            provider.assert_not_called()
        source = quiz_source('translation-job', 1, 'N5')
        item = {'window_index': 0, 'question': 'これは何語ですか。',
                'choices': ['日本語', '英語', 'フランス語', '中国語'],
                'correct_index': 0, 'explanation': 'Người nói dùng tiếng Nhật.',
                'evidence_segment_ids': ['sentence-1']}
        self.assertEqual(len(validate_questions({'questions': [item]}, source)), 1)
        item['question'] = 'Người nói dùng ngôn ngữ nào?'
        with self.assertRaises(ApiError):
            validate_questions({'questions': [item]}, source)
        self.assertIn('all four choices in Japanese', SYSTEM_PROMPT)

    def test_quiz_windows_follow_elapsed_time_and_never_accept_future_evidence(self):
        from shadowing.quiz import quiz_source, validate_questions
        self.translation_video(6)
        for i, start in enumerate([0, 1, 2, 50, 90, 100]):
            segment = db.session.get(CaptionSegment, f'sentence-{i}')
            segment.start_seconds, segment.end_seconds = start, start + 1
        db.session.commit()
        source = quiz_source('translation-job', 2)
        self.assertEqual([s['segment_id'] for s in source['windows'][0]['segments']],
                         ['sentence-0', 'sentence-1', 'sentence-2'])
        items = [{'window_index': i, 'question': f'第{i + 1}の内容は何ですか。', 'choices': ['A', 'B', 'C', 'D'],
                  'correct_index': 0, 'explanation': 'Giải thích.',
                  'evidence_segment_ids': [w['segments'][-1]['segment_id']]}
                 for i, w in enumerate(source['windows'])]
        valid = validate_questions({'questions': items}, source)
        self.assertEqual([q['trigger_seconds'] for q in valid], [3, 101])
        items[0]['evidence_segment_ids'] = ['sentence-5']
        with self.assertRaises(ApiError):
            validate_questions({'questions': items}, source)

    def test_quiz_rejects_incomplete_ambiguous_or_invalid_ai_output(self):
        from copy import deepcopy
        from shadowing.quiz import quiz_source, validate_questions
        self.translation_video(2)
        source = quiz_source('translation-job', 1)
        base = {'window_index': 0, 'question': '内容は何ですか。', 'choices': ['A', 'B', 'C', 'D'],
                'correct_index': 1, 'explanation': 'Giải thích.', 'evidence_segment_ids': ['sentence-1']}
        for changes in ({'choices': ['A', 'A', 'C', 'D']}, {'correct_index': True},
                        {'correct_index': 4}, {'question': ''}, {'explanation': ''},
                        {'evidence_segment_ids': []}, {'evidence_segment_ids': ['unknown']},
                        {'window_index': 1}, {'choices': ['A', 'B']}):
            item = deepcopy(base)
            item.update(changes)
            with self.subTest(changes=changes), self.assertRaises(ApiError):
                validate_questions({'questions': [item]}, source)
        with self.assertRaises(ApiError):
            validate_questions({'questions': []}, source)

    def test_quiz_handles_missing_key_provider_errors_and_truncated_json(self):
        import requests
        from shadowing.quiz import quiz_source, generate_questions
        self.translation_video()
        source = quiz_source('translation-job', 1)
        with patch.dict('os.environ', {'GEMINI_API_KEY': ''}), self.assertRaises(ApiError) as failure:
            generate_questions(source)
        self.assertEqual(failure.exception.status, 503)
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test'}), patch('shadowing.quiz.requests.post') as provider:
            for code in (429, 500, 403):
                provider.return_value.status_code = code
                with self.assertRaises(ApiError):
                    generate_questions(source)
            provider.return_value.status_code = 200
            provider.return_value.json.return_value = {'candidates': [{'finishReason': 'MAX_TOKENS'}]}
            with self.assertRaises(ApiError) as failure:
                generate_questions(source)
            self.assertEqual(failure.exception.status, 502)
            provider.side_effect = requests.Timeout()
            with self.assertRaises(ApiError):
                generate_questions(source)

    def test_three_quiz_questions_use_constrained_ids_and_retry_only_invalid_window(self):
        from collections import Counter
        from shadowing.quiz import quiz_source, generate_questions
        from threading import Lock
        self.translation_video(9)
        source = quiz_source('translation-job', 3, 'N4')
        calls, lock = Counter(), Lock()
        def provider(*args, **kwargs):
            prompt = json.loads(kwargs['json']['contents'][0]['parts'][0]['text'])
            index = prompt['requested_window_index']
            with lock:
                calls[index] += 1
                attempt = calls[index]
            schema = kwargs['json']['generationConfig']['responseJsonSchema']['properties']['questions']
            self.assertEqual(schema['minItems'], 1)
            self.assertEqual(schema['items']['properties']['window_index']['enum'], [index])
            allowed = schema['items']['properties']['evidence_segment_ids']['items']['enum']
            self.assertEqual(prompt['jlpt_level'], 'N4')
            item = {'window_index': index, 'question': f'第{index + 1}部分の内容は何ですか。',
                    'choices': ['日本語', '英語', 'フランス語', '中国語'], 'correct_index': 0,
                    'explanation': 'Giải thích.',
                    'evidence_segment_ids': ['wrong-id' if index == 1 and attempt == 1 else allowed[-1]]}
            response = MagicMock(status_code=200)
            response.json.return_value = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [
                {'text': json.dumps({'questions': [item]})}]}}]}
            return response
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test'}), patch('shadowing.quiz.requests.post', side_effect=provider):
            result = generate_questions(source)
        self.assertEqual(len(result['questions']), 3)
        self.assertEqual([q['trigger_seconds'] for q in result['questions']], [5, 11, 17])
        self.assertEqual(calls, {0: 1, 1: 2, 2: 1})
        self.assertEqual(result['questions'][1]['evidence_segment_ids'], ['sentence-5'])

    def test_translation_is_shared_durable_and_does_not_call_provider_in_http_request(self):
        from shadowing.models import ShadowingTranslation
        from shadowing.translation import process_translation
        url = self.translation_video()
        self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.get(url).json['status'], 'not_requested')
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test'}), patch('shadowing.translation.enqueue', return_value=False) as enqueue, patch('shadowing.translation.translate_batch') as provider:
            first = self.client.post(url, json={}, headers={'Authorization': 'Bearer alice'})
            second = self.client.post(url, json={}, headers={'Authorization': 'Bearer bob'})
            self.assertEqual(first.status_code, 202)
            self.assertEqual(second.json['status'], 'queued')
            self.assertEqual(db.session.scalar(select(func.count()).select_from(ShadowingTranslation)), 1)
            enqueue.assert_called_once()
            provider.assert_not_called()
        row = db.session.scalar(select(ShadowingTranslation))
        with patch('shadowing.translation.translate_batch', return_value={'sentence-0': 'Xin chào.', 'sentence-1': 'Chào bạn.'}) as provider:
            process_translation(row.id)
            process_translation(row.id)  # Duplicate SQS delivery does not call Gemini again.
            provider.assert_called_once()
        shared = self.get(url, token='bob').json
        self.assertEqual(shared['status'], 'ready')
        self.assertEqual(shared['items']['sentence-0'], 'Xin chào.')
        with patch('shadowing.translation.enqueue') as enqueue:
            self.assertEqual(self.client.post(url, json={}, headers={'Authorization': 'Bearer alice'}).status_code, 200)
            enqueue.assert_not_called()

    def test_translation_preserves_completed_batches_and_invalidates_changed_source(self):
        from shadowing.models import ShadowingTranslation
        from shadowing.translation import process_translation, TranslationError
        url = self.translation_video(21)
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test'}), patch('shadowing.translation.enqueue', return_value=False):
            self.client.post(url, json={}, headers={'Authorization': 'Bearer alice'})
        row = db.session.scalar(select(ShadowingTranslation))
        batches = []
        def provider(model, title, segments, before, after):
            batches.append(segments)
            if len(batches) == 2:
                raise TranslationError('Rate limit')
            return {item['segment_id']: 'Xin chào.' for item in segments}
        with patch('shadowing.translation.translate_batch', side_effect=provider):
            process_translation(row.id)
        db.session.expire_all()
        row = db.session.get(ShadowingTranslation, row.id)
        self.assertEqual(len(row.translations), 20)
        self.assertEqual(row.status, 'queued')
        row.lease_expires_at = 0
        db.session.commit()
        with patch('shadowing.translation.translate_batch', return_value={'sentence-20': 'Xin chào.'}) as provider:
            process_translation(row.id)
            self.assertEqual([item['segment_id'] for item in provider.call_args.args[2]], ['sentence-20'])
        self.assertEqual(self.get(url).json['status'], 'ready')
        db.session.get(CaptionSegment, 'sentence-0').text = 'こんばんは。'
        db.session.commit()
        self.assertEqual(self.get(url).json['items'], {})
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test'}), patch('shadowing.translation.enqueue', return_value=False):
            changed = self.client.post(url, json={}, headers={'Authorization': 'Bearer alice'})
        self.assertEqual(changed.json['status'], 'queued')
        self.assertEqual(changed.json['completed'], 0)

    def test_translation_needs_key_and_rejects_unready_or_missing_video(self):
        url = self.translation_video()
        with patch.dict('os.environ', {'GEMINI_API_KEY': ''}):
            self.assertEqual(self.client.post(url, json={}, headers={'Authorization': 'Bearer alice'}).status_code, 503)
        self.assertEqual(self.get(f'{PATH}/missing/translation').status_code, 404)
        db.session.get(ShadowingJob, 'translation-job').status = 'failed'
        db.session.commit()
        self.assertEqual(self.get(url).status_code, 404)

    def test_word_popup_uses_all_levels_exact_reading_and_cached_morphology(self):
        from vocabulary.models import VocabularyTextbook, VocabularyLesson, VocabularyWord
        from shadowing.morphology import analyze
        from shadowing.words import cached_analysis, dictionary_entries
        for level, spelling, reading, meaning in [('N5', '住む', 'すむ', 'sống, cư trú'),
                                                   ('N2', '最近', 'さいきん', 'gần đây'),
                                                   ('N1', '街', 'がい', 'khác cách đọc')]:
            db.session.add(VocabularyTextbook(id=level, title=level, level=level, source_url='local'))
            db.session.flush()
            db.session.add(VocabularyLesson(id=level, textbook_id=level, number=1, unit_number=1,
                title='Lesson', unit_title='Unit', source_url='local', audio_urls=[]))
            db.session.flush()
            db.session.add(VocabularyWord(id=level, lesson_id=level, number=1, word=spelling,
                reading=reading, meaning_vi=meaning, details={}))
        db.session.commit()
        text = '最近、街に住んでいる。'
        segments = [{'id': 's', 'text': text}]
        captions = [{'id': 'c', 'text': text, 'segment_id': 's'}]
        analyzed = analyze(segments, captions)
        job = self.submit().json['job']
        stored = db.session.get(ShadowingJob, job['id'])
        stored.word_analysis = analyzed
        db.session.commit()
        with patch('shadowing.words.analyze', side_effect=AssertionError('Retokenized cached video')):
            reused = cached_analysis(stored, segments, captions)
        entries = dictionary_entries(reused['words'])
        recent = next(word for word in entries.values() if word['surface'] == '最近')
        verb = next(word for word in entries.values() if word['surface'] == '住んでいる')
        street = next(word for word in entries.values() if word['surface'] == '街')
        self.assertEqual(recent['entries'][0]['meaning_vi'], 'gần đây')
        self.assertEqual(verb['lemma'], '住む')
        self.assertEqual(verb['entries'][0]['level'], 'N5')
        self.assertEqual(street['entries'], [])

    def test_auth_url_validation_and_private_job_access(self):
        self.assertEqual(self.client.post(PATH, json={'url': 'https://youtu.be/abcdefghijk'}).status_code, 401)
        for url in ('file:///tmp/x', 'https://evil.test/watch?v=abcdefghijk',
                    'https://youtube.com:bad/watch?v=abcdefghijk', 'https://youtube.com/playlist?list=xx',
                    'https://user:pass@youtube.com/watch?v=abcdefghijk'):
            with self.assertRaises(ApiError):
                video_id_from_url(url)
        self.assertEqual(video_id_from_url('https://www.youtube.com/shorts/abcdefghijk?si=x'), 'abcdefghijk')
        response = self.submit()
        self.assertEqual(response.status_code, 202)
        identifier = response.json['job']['id']
        self.assertEqual(self.get(f'{PATH}/{identifier}', token='bob').status_code, 404)
        self.assertEqual(self.get(f'{PATH}/{identifier}/lesson').status_code, 409)

    def test_duplicate_submissions_share_one_job_and_busy_account_cannot_add_another(self):
        first = self.submit().json['job']
        self.assertEqual(self.submit().json['job']['id'], first['id'])
        self.assertEqual(self.submit(user='bob').json['job']['id'], first['id'])
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ShadowingJob)), 1)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ShadowingRequest)), 2)
        self.assertEqual(self.submit('mnopqrstuvw').status_code, 409)
        self.assertEqual(len(self.get(PATH).json['items']), 1)

    def test_ready_video_reuses_existing_captions_without_queue_or_duration_limit(self):
        import_dataset(json.loads(DEFAULT_SOURCE.read_text()))
        with patch('shadowing.queue.enqueue') as enqueue:
            result = self.client.post(PATH, json={'url': 'https://youtu.be/cjtmDEG-B7U'},
                headers={'Authorization': 'Bearer alice'})
        enqueue.assert_not_called()
        self.assertEqual(result.status_code, 200)
        lesson = self.get(f"{PATH}/{result.json['job']['id']}/lesson").json
        self.assertEqual(len(lesson['segments']), 327)
        self.assertEqual(lesson['caption_kind'], 'manual')

    def test_community_catalog_and_lesson_do_not_expose_private_jobs_or_subscribe_viewer(self):
        import_dataset(json.loads(DEFAULT_SOURCE.read_text()))
        ready = self.submit('cjtmDEG-B7U').json['job']
        pending = self.submit('abcdefghijk').json['job']
        bob_catalog = self.get(f'{PATH}?scope=all', token='bob').json
        self.assertEqual([row['id'] for row in bob_catalog['items']], [ready['id']])
        self.assertFalse(bob_catalog['items'][0]['is_mine'])
        self.assertEqual(self.get(f'{PATH}?scope=mine', token='bob').json['items'], [])
        self.assertEqual(self.get(f"{PATH}/{ready['id']}/lesson", token='bob').status_code, 200)
        self.assertEqual(self.get(f"{PATH}/{pending['id']}/lesson", token='bob').status_code, 404)
        self.assertEqual(self.client.post(f"{PATH}/{ready['id']}/retry", json={}, headers={'Authorization': 'Bearer bob'}).status_code, 404)
        self.assertEqual(self.get(f'{PATH}?scope=mine', token='bob').json['items'], [])
        own = self.get(f'{PATH}?scope=mine').json['items']
        self.assertEqual(len(own), 2)
        self.assertTrue(all(row['is_mine'] for row in own))
        self.assertEqual(self.get(f'{PATH}?scope=invalid').status_code, 400)
        self.assertEqual(self.client.get(f'{PATH}?scope=all').status_code, 401)

    def test_community_cursor_pages_do_not_duplicate_videos_and_are_bound_to_scope(self):
        for number in range(52):
            video_id = f'{number:011d}'
            db.session.add(ExampleVideo(id=video_id, title='Video', channel='Channel', duration_seconds=10, language='ja', caption_kind='manual'))
            db.session.add(ShadowingJob(id=f'catalog-{number:03d}', video_id=video_id, status='ready', title='Video', created_at=100, updated_at=100))
        db.session.flush()
        for number in range(52):
            video_id = f'{number:011d}'
            db.session.add(CaptionSegment(id=f'{video_id}-ja-0001', video_id=video_id, sequence=1, text='日本語', search_text='日本語', start_seconds=0, end_seconds=1))
        db.session.commit()
        first = self.get(f'{PATH}?scope=all').json
        self.assertEqual(len(first['items']), 50)
        second = self.get(f"{PATH}?scope=all&cursor={first['next_cursor']}").json
        self.assertEqual(len(second['items']), 2)
        self.assertIsNone(second['next_cursor'])
        self.assertEqual(len({row['id'] for row in first['items'] + second['items']}), 52)
        self.assertEqual(self.get(f"{PATH}?scope=mine&cursor={first['next_cursor']}").status_code, 400)
        self.assertEqual(self.get(f'{PATH}?cursor=bad').status_code, 400)

    def test_claim_fencing_expired_worker_and_atomic_search_publication(self):
        job = self.submit('cjtmDEG-B7U').json['job']
        token = claim(job['id'])
        self.assertIsNotNone(token)
        self.assertIsNone(claim(job['id']))
        stored = db.session.get(ShadowingJob, job['id'])
        stored.lease_expires_at = int(time.time()) - 1
        db.session.commit()
        replacement = claim(job['id'])
        dataset = json.loads(DEFAULT_SOURCE.read_text())
        result = {'dataset': dataset, 'raw_captions': dataset['segments']}
        self.assertFalse(save_result(job['id'], token, result))
        self.assertEqual(db.session.scalar(select(func.count()).select_from(CaptionSegment)), 0)
        self.assertTrue(save_result(job['id'], replacement, result))
        self.assertEqual(self.get(f"{PATH}/{job['id']}").json['job']['status'], 'ready')
        self.assertTrue(self.get('/api/vocabulary/video-examples?q=社会').json['items'])
        self.assertIsNone(claim(job['id']))

    def test_ready_lesson_separates_display_cues_and_rebuild_is_repeatable(self):
        from shadowing.rebuild import rebuild_saved_captions
        job = self.submit('cjtmDEG-B7U').json['job']
        token = claim(job['id'])
        dataset = json.loads(DEFAULT_SOURCE.read_text())
        raw = [{'text': '最初です。', 'start_seconds': 0, 'end_seconds': 8},
               {'text': '次です。', 'start_seconds': 2, 'end_seconds': 4}]
        save_result(job['id'], token, {'dataset': dataset, 'raw_captions': raw})
        rebuild_saved_captions()
        first = self.get(f"{PATH}/{job['id']}/lesson").json
        self.assertEqual(len(first['segments']), 2)
        self.assertEqual(first['captions'][1]['start_seconds'], 2)
        self.assertEqual(first['captions'][1]['segment_id'], first['segments'][1]['id'])
        rebuild_saved_captions()
        self.assertEqual(first, self.get(f"{PATH}/{job['id']}/lesson").json)

    def test_failed_job_retry_and_durable_outbox_recovery(self):
        job = self.submit().json['job']
        with patch('shadowing.worker.enqueue') as enqueue:
            dispatch_pending()
            self.assertEqual(enqueue.call_count, 1)
        token = claim(job['id'])
        save_result(job['id'], token, {'error_code': 'source_unavailable', 'error_message': 'Không lấy được nguồn.'})
        with patch('shadowing.queue.enqueue', return_value=False):
            retry = self.client.post(f"{PATH}/{job['id']}/retry", json={}, headers={'Authorization': 'Bearer alice'})
        self.assertEqual(retry.status_code, 202)
        self.assertEqual(retry.json['job']['status'], 'queued')
        self.assertEqual(retry.json['job']['id'], job['id'])

    def test_exhausted_interrupted_job_becomes_retryable_error(self):
        identifier = self.submit().json['job']['id']
        job = db.session.get(ShadowingJob, identifier)
        job.status, job.attempts, job.lease_expires_at = 'transcribing', 3, int(time.time()) - 1
        db.session.commit()
        dispatch_pending()
        self.assertEqual(self.get(f'{PATH}/{identifier}').json['job']['status'], 'failed')

    def test_concurrent_postgres_submissions_and_claims_have_one_winner(self):
        if db.engine.dialect.name != 'postgresql':
            self.skipTest('PostgreSQL concurrency check requires TEST_DATABASE_URL')
        def submit_as(user):
            with self.app.test_client() as client:
                return client.post(PATH, json={'url': 'https://youtu.be/abcdefghijk'},
                                   headers={'Authorization': f'Bearer {user}'})
        with patch('shadowing.queue.enqueue', return_value=False), ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(submit_as, ('alice', 'bob')))
        self.assertEqual([response.status_code for response in responses], [202, 202])
        self.assertEqual(responses[0].json['job']['id'], responses[1].json['job']['id'])
        identifier = responses[0].json['job']['id']
        def claim_once(_):
            with self.app.app_context():
                return claim(identifier)
        with ThreadPoolExecutor(max_workers=2) as pool:
            winners = list(pool.map(claim_once, range(2)))
        self.assertEqual(sum(token is not None for token in winners), 1)


class ShadowingProcessorTests(unittest.TestCase):
    def test_json3_and_rolling_captions_keep_sentence_times(self):
        raw = json3_captions({'events': [
            {'tStartMs': 0, 'dDurationMs': 1500, 'segs': [{'utf8': 'こんにちは'}]},
            {'tStartMs': 1000, 'dDurationMs': 2000, 'segs': [{'utf8': 'こんにちは。'}]},
            {'tStartMs': 3500, 'dDurationMs': 1000, 'segs': [{'utf8': '次です。'}]}]})
        phrases = normalize_segments(raw, 5)
        self.assertEqual(phrases[0], {'text': 'こんにちは。', 'start_seconds': 0, 'end_seconds': 3})
        self.assertEqual(phrases[1]['start_seconds'], 3.5)
        with self.assertRaises(ProcessingError):
            normalize_segments([], 5)

    def test_fragments_merge_but_no_timestamp_is_invented_for_long_sentence(self):
        phrases = normalize_segments([
            {'text': '私は', 'start_seconds': 0, 'end_seconds': 2},
            {'text': '学生です。', 'start_seconds': 2.1, 'end_seconds': 4},
            {'text': '長い文章', 'start_seconds': 5, 'end_seconds': 25}], 30)
        self.assertEqual(phrases[0]['text'], '私は学生です。')
        self.assertEqual(phrases[1]['end_seconds'], 25)


class DisplayCaptionTests(unittest.TestCase):
    def test_overlaps_preserve_new_onset_instead_of_delaying_it(self):
        raw = [{'text': '最初です。', 'start_seconds': 0, 'end_seconds': 8},
               {'text': '次です。', 'start_seconds': 2, 'end_seconds': 4}]
        practice = normalize_segments(raw, 10)
        display = display_captions(raw, 10)
        self.assertEqual(practice[0]['end_seconds'], 2)
        self.assertEqual(practice[1]['start_seconds'], 2)
        self.assertEqual(display[1]['start_seconds'], 2)
        self.assertEqual(display[0]['end_seconds'], 2)

    def test_word_offsets_create_short_cues_without_inventing_timestamps(self):
        parts = [{'utf8': text, 'tOffsetMs': position * 1000}
                 for position, text in enumerate(['あ' * 14, 'い' * 14, 'う' * 14, 'え' * 14])]
        raw = json3_captions({'events': [{'tStartMs': 1000, 'dDurationMs': 4000, 'segs': parts}]})
        cues = display_captions(raw, 6)
        self.assertEqual([cue['start_seconds'] for cue in cues], [1, 3])
        self.assertEqual([cue['end_seconds'] for cue in cues], [3, 5])
        self.assertEqual(''.join(cue['text'] for cue in cues), raw[0]['text'])
        self.assertTrue(all(len(cue['text']) <= 28 for cue in cues))
        practice = [{'id': 'practice', 'start_seconds': 1, 'end_seconds': 5}]
        mapped = attach_practice_segments(cues, practice, 'abcdefghijk')
        self.assertEqual([cue['segment_id'] for cue in mapped], ['practice', 'practice'])

    def test_untimed_long_text_stays_complete_and_cumulative_updates_do_not_appear_early(self):
        long_text = '長い文章' * 40
        raw = [{'text': long_text, 'start_seconds': 0, 'end_seconds': 10}]
        self.assertEqual(display_captions(raw, 12)[0]['text'], long_text)
        cues = display_captions([{'text': 'こんにちは', 'start_seconds': 0, 'end_seconds': 2},
            {'text': 'こんにちは。次です。', 'start_seconds': 1, 'end_seconds': 3}], 4)
        self.assertEqual(cues[0]['text'], 'こんにちは')
        self.assertEqual(cues[0]['end_seconds'], 1)
        self.assertEqual(cues[1]['start_seconds'], 1)

    def test_partial_or_invalid_word_timing_falls_back_without_losing_text(self):
        raw = [{'text': '完全な文章', 'start_seconds': 1, 'end_seconds': 5,
                'words': [{'text': '完全', 'start_seconds': 1, 'end_seconds': 2}]}]
        self.assertEqual(display_captions(raw, 6)[0]['text'], '完全な文章')


class MorphologyTests(unittest.TestCase):
    def test_tokens_preserve_original_unicode_spaces_and_inflection(self):
        from shadowing.morphology import analyze
        text = '😀 最近、街に住んでいる。'
        analyzed = analyze([{'id': 's', 'text': text}], [{'id': 'c', 'text': text, 'segment_id': 's'}])
        self.assertEqual(''.join(token['text'] for token in analyzed['segments']['s']), text)
        self.assertEqual(''.join(token['text'] for token in analyzed['captions']['c']), text)
        verb = next(word for word in analyzed['words'].values() if word['surface'] == '住んでいる')
        self.assertEqual((verb['lemma'], verb['reading']), ('住む', 'すんでいる'))
        self.assertFalse(analyzed['segments']['s'][0].get('key'))

    def test_readable_groups_keep_inflections_honorifics_and_compound_particles(self):
        from shadowing.morphology import analyze
        text = 'でも、そのおばさんはキッチンに立ったままで「食べ食べ！」とか言って、'
        result = analyze([{'id': 's', 'text': text}], [])
        tokens = result['segments']['s']
        self.assertEqual(''.join(token['text'] for token in tokens), text)
        surfaces = [token['text'] for token in tokens]
        for surface in ('でも', 'その', 'おばさん', 'は', 'キッチン', 'に', '立った', 'まま', 'で', 'とか', '言って'):
            self.assertIn(surface, surfaces)
        words = {word['surface']: word for word in result['words'].values()}
        self.assertEqual((words['立った']['lemma'], words['立った']['reading']), ('立つ', 'たった'))
        self.assertEqual((words['言って']['lemma'], words['言って']['reading']), ('言う', 'いって'))

    def test_display_fragment_maps_to_the_complete_word(self):
        from shadowing.morphology import analyze
        analyzed = analyze([{'id': 's', 'text': '日本語です。'}],
                           [{'id': 'c', 'text': '語です。', 'segment_id': 's'}])
        token = analyzed['captions']['c'][0]
        self.assertEqual(token['text'], '語')
        self.assertEqual(analyzed['words'][token['key']]['surface'], '日本語')


class TranslationProviderTests(unittest.TestCase):
    def test_provider_checks_finish_reason_and_exact_segment_ids(self):
        from unittest.mock import MagicMock
        from shadowing.translation import translate_batch, TranslationError, DEFAULT_MODEL, SYSTEM_PROMPT
        segments = [{'segment_id': 'one', 'text': 'こんにちは。'}]
        response = MagicMock(status_code=200)
        def output(items, reason='STOP'):
            response.json.return_value = {'candidates': [{'finishReason': reason, 'content': {'parts': [
                {'text': json.dumps({'items': items})}]}}]}
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test'}), patch('shadowing.translation.requests.post', return_value=response) as post:
            output([{'segment_id': 'one', 'translation': 'Xin chào.'}])
            self.assertEqual(translate_batch(DEFAULT_MODEL, '', segments), {'one': 'Xin chào.'})
            self.assertEqual(post.call_args.kwargs['json']['systemInstruction']['parts'][0]['text'], SYSTEM_PROMPT)
            for items, reason in [([], 'STOP'), ([{'segment_id': 'other', 'translation': 'Xin chào.'}], 'STOP'),
                                  ([{'segment_id': 'one', 'translation': ''}], 'STOP'),
                                  ([{'segment_id': 'one', 'translation': 'Xin chào.'}], 'MAX_TOKENS')]:
                output(items, reason)
                with self.assertRaises(TranslationError):
                    translate_batch(DEFAULT_MODEL, '', segments)
            response.status_code = 429
            with self.assertRaises(TranslationError) as error:
                translate_batch(DEFAULT_MODEL, '', segments)
            self.assertTrue(error.exception.retryable)
            response.status_code = 403
            with self.assertRaises(TranslationError) as error:
                translate_batch(DEFAULT_MODEL, '', segments)
            self.assertFalse(error.exception.retryable)
