import json
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

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
