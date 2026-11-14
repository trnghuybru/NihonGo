import unittest
import hashlib
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError

from sqlalchemy import func, select

import test_speaking as fixtures
from extensions import db
from vocabulary import init_vocabulary
from vocabulary.importer import import_dataset
from vocabulary.models import VocabularyLesson, VocabularyTextbook, VocabularyWord
from vocabulary.audio import import_audio


class VocabularyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SpeakingTests.setUpClass.__func__(cls)
        init_vocabulary(cls.app)
        with cls.app.app_context():
            db.create_all()

    tearDownClass = classmethod(fixtures.SpeakingTests.tearDownClass.__func__)
    setUp = fixtures.SpeakingTests.setUp
    tearDown = fixtures.SpeakingTests.tearDown
    scenario = fixtures.SpeakingTests.scenario
    get = fixtures.SpeakingTests.get

    def dataset(self):
        return {
            'schema_version': 1,
            'coverage': {'complete': True},
            'textbook': {'id': 'mimikara-n2', 'title': 'N2', 'jlpt_level': 'N2', 'source_url': 'test'},
            'counts': {'lessons': 1, 'words': 2},
            'units': [{'lessons': [{
                'id': 'mimikara-n2-u01-l01', 'unit_number': 1, 'lesson_number': 1,
                'unit_title': 'Unit', 'title': 'Bài 1', 'source_url': 'test',
                'audio_urls': ['https://example.test/lesson.mp3'],
                'words': [
                    {'id': 'n2-1', 'number': 1, 'word': '人生', 'reading': 'じんせい',
                     'meaning_vi': 'cuộc đời', 'han_viet': None, 'segments': [],
                     'examples': [], 'related': [{'meaning_vi': 'cuộc đời'}]},
                    {'id': 'n2-2', 'number': 2, 'word': '人間', 'reading': 'にんげん',
                     'meaning_vi': 'con người', 'han_viet': None, 'segments': [],
                     'examples': [], 'related': []},
                ],
            }]}],
        }

    def audio_dataset(self, package):
        dataset = self.dataset()
        checksum = hashlib.sha256(package.read_bytes()).hexdigest()
        for word in dataset['units'][0]['lessons'][0]['words']:
            word['source'] = {'sha256': checksum, 'audio': [{'file_name': 'voice.mp3',
                'archive_member': '0', 'present_in_package': True}]}
        return dataset

    def test_vocabulary_audio_deduplicates_and_survives_dataset_reimport(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory) / 'audio.apkg'
            with zipfile.ZipFile(package, 'w') as archive:
                archive.writestr('0', b'ID3' + b'example-mp3')
            dataset = self.audio_dataset(package)
            import_dataset(dataset)
            connection = MagicMock()
            missing = ClientError({'Error': {'Code': '404'}}, 'HeadObject')
            connection.head_object.side_effect = missing
            with patch('vocabulary.audio.client', return_value=connection):
                result = import_audio(package, 'mimikara-n2')
            self.assertEqual((result['words'], result['objects'], result['uploaded']), (2, 1, 1))
            self.assertEqual(connection.put_object.call_count, 1)
            object_args = connection.put_object.call_args.kwargs
            connection.head_object.side_effect = None
            connection.head_object.return_value = {'ContentLength': len(object_args['Body']),
                'ContentType': 'audio/mpeg', 'Metadata': object_args['Metadata']}
            with patch('vocabulary.audio.client', return_value=connection):
                self.assertEqual(import_audio(package, 'mimikara-n2')['uploaded'], 0)
            import_dataset(dataset)
            word = self.get('/api/vocabulary/lessons/' + dataset['units'][0]['lessons'][0]['id']).json['words'][0]
            self.assertTrue(word['has_audio'])
            self.assertNotIn('audio', word)
            path = f"/api/vocabulary/words/{word['id']}/audio/playback"
            self.assertEqual(self.client.get(path).status_code, 401)
            connection.generate_presigned_url.return_value = 'https://s3.test/signed.mp3'
            with patch('vocabulary.audio.client', return_value=connection):
                response = self.get(path)
            self.assertEqual(response.json, {'url': 'https://s3.test/signed.mp3', 'expires_in': 300})
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual(connection.generate_presigned_url.call_args.kwargs['Params']['Bucket'], 'vocabulary-audio')
            for item in dataset['units'][0]['lessons'][0]['words']:
                item['source']['sha256'] = 'changed-package'
            import_dataset(dataset)
            self.assertFalse(self.get('/api/vocabulary/lessons/' + dataset['units'][0]['lessons'][0]['id']).json['words'][0]['has_audio'])

    def test_vocabulary_audio_upload_failure_keeps_links_unpublished(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory) / 'audio.apkg'
            with zipfile.ZipFile(package, 'w') as archive:
                archive.writestr('0', b'ID3' + b'example-mp3')
            dataset = self.audio_dataset(package)
            import_dataset(dataset)
            connection = MagicMock()
            connection.head_object.side_effect = ClientError({'Error': {'Code': '404'}}, 'HeadObject')
            connection.put_object.side_effect = ClientError({'Error': {'Code': 'AccessDenied'}}, 'PutObject')
            with patch('vocabulary.audio.client', return_value=connection):
                with self.assertRaises(ClientError):
                    import_audio(package, 'mimikara-n2')
            self.assertFalse(any(word['has_audio'] for word in self.get('/api/vocabulary/lessons/' + dataset['units'][0]['lessons'][0]['id']).json['words']))

    def test_vocabulary_audio_missing_files_and_source_mismatch(self):
        dataset = self.dataset()
        import_dataset(dataset)
        word = dataset['units'][0]['lessons'][0]['words'][0]
        self.assertEqual(self.get(f"/api/vocabulary/words/{word['id']}/audio/playback").status_code, 404)
        self.assertEqual(self.get('/api/vocabulary/words/missing/audio/playback').status_code, 404)
        stored = db.session.get(VocabularyWord, word['id'])
        stored.details = {**stored.details, 'audio': {'storage_key': 'n2/missing.mp3'}}
        db.session.commit()
        connection = MagicMock()
        connection.head_object.side_effect = ClientError({'Error': {'Code': '404'}}, 'HeadObject')
        with patch('vocabulary.audio.client', return_value=connection):
            self.assertEqual(self.get(f"/api/vocabulary/words/{word['id']}/audio/playback").json['code'], 'vocabulary_audio_not_found')
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory) / 'other.apkg'
            with zipfile.ZipFile(package, 'w'):
                pass
            with patch('vocabulary.audio.client') as storage_client:
                with self.assertRaises(ValueError):
                    import_audio(package, 'mimikara-n2')
                storage_client.assert_not_called()

    def test_requires_auth_and_shows_data_only_at_n2(self):
        import_dataset(self.dataset())
        self.assertEqual(self.client.get('/api/vocabulary/textbooks?level=N2').status_code, 401)
        for level in ("N5", "N4", "N3", "N1"):
            self.assertEqual(self.get(f"/api/vocabulary/textbooks?level={level}").json["items"], [])
        result = self.get('/api/vocabulary/textbooks?level=N2').json["items"]
        self.assertEqual((result[0]["word_count"], result[0]["lesson_count"]), (2, 1))
        self.assertNotIn("words", result[0])
        self.assertEqual(self.get('/api/vocabulary/textbooks?level=beginner').status_code, 400)

    def test_units_and_lesson_keep_source_order_and_nullable_related_translation(self):
        dataset = self.dataset()
        dataset["units"][0]["lessons"][0]["words"][0]["related"][0]["meaning_vi"] = None
        import_dataset(dataset)
        book = self.get('/api/vocabulary/textbooks/mimikara-n2').json
        self.assertEqual(book["units"][0]["word_count"], 2)
        lesson_id = book["units"][0]["lessons"][0]["id"]
        result = self.get(f'/api/vocabulary/lessons/{lesson_id}').json
        self.assertEqual([word["number"] for word in result["words"]], [1, 2])
        self.assertIsNone(result["words"][0]["related"][0]["meaning_vi"])
        self.assertTrue(result["lesson"]["audio_urls"])
        self.assertEqual(self.get('/api/vocabulary/lessons/missing').status_code, 404)
        self.assertEqual(self.get('/api/vocabulary/textbooks/missing').status_code, 404)

    def test_search_matches_spelling_reading_meaning_and_paginates(self):
        import_dataset(self.dataset())
        for query in ("人生", "じんせい", "cuộc đời"):
            result = self.get('/api/vocabulary/words', query_string={"level": "N2", "q": query}).json
            self.assertEqual(result["pagination"]["total"], 1)
            self.assertEqual(result["items"][0]["number"], 1)
        result = self.get('/api/vocabulary/words?q=人&page_size=1&page=2').json
        self.assertEqual((result["pagination"]["total"], result["items"][0]["number"]), (2, 2))
        self.assertEqual(self.get('/api/vocabulary/words?q=%25').json["items"], [])
        self.assertEqual(self.get('/api/vocabulary/words?level=N5&q=人').json["items"], [])
        for query in ('q=', 'q=人&page=0', 'q=人&page_size=41', 'q=人&page=x'):
            self.assertEqual(self.get(f'/api/vocabulary/words?{query}').status_code, 400)

    def test_import_is_repeatable_and_updates_without_duplicate_ids(self):
        dataset = self.dataset()
        import_dataset(dataset)
        dataset["units"][0]["lessons"][0]["words"][0]["meaning_vi"] = "Updated meaning"
        import_dataset(dataset)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(VocabularyWord)), 2)
        self.assertEqual(db.session.scalar(select(VocabularyWord).where(VocabularyWord.number == 1)).meaning_vi, "Updated meaning")
        self.assertEqual(db.session.scalar(select(func.count()).select_from(VocabularyLesson)), 1)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(VocabularyTextbook)), 1)

    def test_partial_and_invalid_count_imports_leave_database_unchanged(self):
        import_dataset(self.dataset())
        dataset = self.dataset()
        dataset["coverage"]["complete"] = False
        with self.assertRaises(ValueError):
            import_dataset(dataset)
        dataset = self.dataset()
        dataset["counts"]["words"] = 99
        with self.assertRaises(ValueError):
            import_dataset(dataset)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(VocabularyWord)), 2)
