import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy import select, func
import test_speaking as fixtures
from extensions import db
from shadowing import init_shadowing
from shadowing.models import ShadowingJob
from video_examples import init_video_examples
from video_examples.models import ExampleVideo, CaptionSegment
from video_examples.playlist import select_track, caption_dataset, persist_dataset, import_playlist


class PlaylistImportTests(unittest.TestCase):
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

    def dataset(self):
        entry = {'id': 'abcdefghijk', 'title': '日本語の動画', 'duration': 10, 'channel': 'Test'}
        return caption_dataset(entry, [SimpleNamespace(text='日本語を勉強します。', start=0, duration=3),
                                      SimpleNamespace(text='日本の文化です。', start=4, duration=3)],
                               'manual', 'https://www.youtube.com/playlist?list=PLabcdefghijk')

    def test_prefers_manual_native_japanese_and_never_translates_other_languages(self):
        auto = SimpleNamespace(language_code='ja', is_generated=True, _url='https://example.com?lang=ja')
        manual = SimpleNamespace(language_code='ja', is_generated=False, _url='https://example.com?lang=ja')
        translated = SimpleNamespace(language_code='ja', is_generated=False, _url='https://example.com?tlang=ja')
        english = SimpleNamespace(language_code='en', is_generated=False, _url='https://example.com?lang=en')
        self.assertIs(select_track([auto, translated, english, manual]), manual)
        self.assertIs(select_track([auto]), auto)
        self.assertIsNone(select_track([auto], manual_only=True))
        self.assertIsNone(select_track([english, translated]))

    def test_import_is_searchable_ready_and_repeat_does_not_duplicate(self):
        dataset = self.dataset()
        persist_dataset(dataset)
        persist_dataset(dataset)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ExampleVideo)), 1)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ShadowingJob)), 1)
        job = db.session.scalar(select(ShadowingJob))
        self.assertEqual(job.status, 'ready')
        self.assertEqual(job.raw_captions[0]['start_seconds'], 0)
        self.assertTrue(db.session.scalar(select(CaptionSegment).where(CaptionSegment.search_text.contains('日本'))))
        self.assertEqual(dataset['caption_track']['source'], 'youtube_manual')

    def test_active_job_is_not_overwritten(self):
        db.session.add(ShadowingJob(id='busy', video_id='abcdefghijk', status='extracting', created_at=1, updated_at=1))
        db.session.commit()
        with self.assertRaises(ValueError):
            persist_dataset(self.dataset())
        db.session.rollback()
        self.assertIsNone(db.session.get(ExampleVideo, 'abcdefghijk'))
        self.assertEqual(db.session.get(ShadowingJob, 'busy').status, 'extracting')

    def test_no_japanese_captions_are_skipped_without_audio_or_ai_fallback(self):
        class Blocked(Exception):
            pass
        transcript_api = MagicMock()
        transcript_api.return_value.list.return_value = []
        downloader = MagicMock()
        modules = {'yt_dlp': SimpleNamespace(YoutubeDL=downloader),
                   'youtube_transcript_api': SimpleNamespace(YouTubeTranscriptApi=transcript_api),
                   'youtube_transcript_api._errors': SimpleNamespace(RequestBlocked=Blocked, IpBlocked=Blocked)}
        with TemporaryDirectory() as directory, patch.dict('sys.modules', modules), patch('shadowing.processor.transcribe_file') as ai:
            root = Path(directory)
            manifest = root / 'input.json'
            manifest.write_text(json.dumps({'id': 'PLabcdefghijk', 'title': 'Test', 'entries': [
                {'id': 'abcdefghijk', 'title': 'Video', 'duration': 10}]}))
            report = import_playlist('https://www.youtube.com/playlist?list=PLabcdefghijk', root / 'output', manifest, delay=0)
            self.assertEqual(report['results']['abcdefghijk']['reason'], 'no_native_japanese_captions')
            downloader.assert_not_called()
            ai.assert_not_called()
            self.assertEqual(db.session.scalar(select(func.count()).select_from(ExampleVideo)), 0)

    def test_manual_only_target_counts_imports_instead_of_skipped_videos(self):
        class Blocked(Exception):
            pass
        downloader = MagicMock()
        api = MagicMock()
        automatic = SimpleNamespace(language_code='ja', is_generated=True, _url='https://example.com?lang=ja')
        manual = SimpleNamespace(language_code='ja', is_generated=False, _url='https://example.com?lang=ja',
            fetch=lambda: [SimpleNamespace(text='日本の文化です。', start=1, duration=3)])
        api.return_value.list.side_effect = [[automatic], [manual], [manual], [manual]]
        modules = {'yt_dlp': SimpleNamespace(YoutubeDL=downloader),
                   'youtube_transcript_api': SimpleNamespace(YouTubeTranscriptApi=api),
                   'youtube_transcript_api._errors': SimpleNamespace(RequestBlocked=Blocked, IpBlocked=Blocked)}
        with TemporaryDirectory() as directory, patch.dict('sys.modules', modules):
            root = Path(directory)
            manifest = root / 'input.json'
            manifest.write_text(json.dumps({'id': 'PLabcdefghijk', 'title': 'Test', 'entries': [
                {'id': f'test{i:07d}', 'title': 'Video', 'duration': 10} for i in range(4)]}))
            report = import_playlist('https://www.youtube.com/playlist?list=PLabcdefghijk', root / 'output',
                manifest, manual_only=True, delay=0, max_imports=2)
            self.assertEqual(report['counts'], {'skipped': 1, 'imported': 2})
            self.assertEqual(api.return_value.list.call_count, 3)
            self.assertEqual(db.session.scalar(select(func.count()).select_from(ExampleVideo)
                                              .where(ExampleVideo.caption_kind == 'manual')), 2)
            self.assertEqual(db.session.scalar(select(func.count()).select_from(ExampleVideo)
                                              .where(ExampleVideo.caption_kind == 'asr')), 0)

    def run_operator(self, folder, process, recheck=False):
        import importlib.util
        script = Path(__file__).resolve().parents[2] / 'deploy/beta/import_youtube_playlist.py'
        spec = importlib.util.spec_from_file_location('operator_playlist', script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        args = ['import_youtube_playlist.py', '--manifest', str(folder / 'playlist.json'),
                '--output', str(folder), '--max-imports', '1', '--delay', '0']
        if recheck:
            args.append('--retry-skipped-captions')
        with patch('sys.argv', args), patch.dict('sys.modules', {'app': SimpleNamespace(app=self.app)}), \
                patch.dict('os.environ'), patch('shadowing.processor.process_video', process):
            return module.main()

    def test_operator_pauses_on_caption_rate_limit_without_marking_video_missing(self):
        from shadowing.processor import ProcessingError
        with TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'playlist.json').write_text(json.dumps({'id': 'PLabcdefghijk', 'entries': [
                {'id': 'newvideo001', 'duration': 10}, {'id': 'newvideo002', 'duration': 10}]}))
            process = MagicMock(side_effect=ProcessingError('source_rate_limited', 'Rate limit'))
            self.assertEqual(self.run_operator(folder, process), 75)
            report = json.loads((folder / 'report.json').read_text())
            self.assertEqual(report['status'], 'paused')
            self.assertEqual(report['stop_reason'], 'source_rate_limited')
            self.assertNotIn('newvideo001', report['results'])
            process.assert_called_once()

    def test_operator_can_recheck_old_caption_skips_without_retrying_long_videos(self):
        with TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'playlist.json').write_text(json.dumps({'id': 'PLabcdefghijk', 'entries': [
                {'id': 'longvideo01', 'duration': 1800}, {'id': 'abcdefghijk', 'duration': 10}]}))
            old = {'playlist_id': 'PLabcdefghijk', 'max_seconds_exclusive': 1800, 'results': {
                'longvideo01': {'status': 'skipped', 'reason': 'duration_not_under_limit'},
                'abcdefghijk': {'status': 'skipped', 'reason': 'captions_required'}}}
            (folder / 'report.json').write_text(json.dumps(old))
            data = self.dataset()
            process = MagicMock(return_value={'dataset': data, 'raw_captions': data['raw_captions'],
                'display_captions': data['display_captions']})
            self.assertEqual(self.run_operator(folder, process, recheck=True), 0)
            report = json.loads((folder / 'report.json').read_text())
            self.assertEqual(report['counts'], {'skipped': 1, 'imported': 1})
            self.assertEqual(report['status'], 'complete')
            self.assertEqual(report['results']['longvideo01']['reason'], 'duration_not_under_limit')
            self.assertTrue(list(folder.glob('report-before-recheck-*.json')))
            process.assert_called_once()
