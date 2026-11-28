import copy
import json
import unittest
from unittest.mock import patch, Mock

from flask import Flask
from extensions import db
from jlpt.models import JlptExamRecord, JlptImage, JlptImport
from jlpt.database import import_payload, source_catalog, source_exam, public_images
from jlpt.service import get_exam, public_exam, grade


class JlptDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
        db.init_app(self.app)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.exam = copy.deepcopy(get_exam('n3-2017-07'))
        self.asset_id = 'a' * 64
        def strip(value):
            if isinstance(value, list): return [strip(v) for v in value]
            if not isinstance(value, dict): return value
            result = {k: strip(v) for k, v in value.items() if k != 'image_data_url'}
            if 'image_data_url' in value: result['image_id'] = self.asset_id
            return result
        self.exam = strip(self.exam)
        self.payload = dict(source_sha256='b' * 64, level='N3', supplements=[],
            sessions=[dict(id=f'{year}-07', year=year, month=7, status='available', files=[
                dict(kind='exam', filename='exam.pdf', pages=[dict(page=1, text='本文。', image_id=self.asset_id)], question_images=[])])
                for year in [2017, 2024]],
            assets=[dict(id=self.asset_id, bucket='test-private-r2', storage_key=f'jlpt/images/{self.asset_id}.webp', mime_type='image/webp', size_bytes=42)],
            normalized=[self.exam])

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_import_is_idempotent_and_keeps_unparsed_source_without_fabricated_answers(self):
        import_payload(self.payload)
        import_payload(self.payload)
        self.assertEqual(db.session.query(JlptExamRecord).count(), 2)
        self.assertEqual(db.session.query(JlptImage).count(), 1)
        self.assertEqual(db.session.query(JlptImport).count(), 1)
        self.assertEqual(source_catalog()[0]['id'], 'n3-2024-07')
        self.assertTrue(source_catalog()[0]['source_only'])
        raw = db.session.get(JlptExamRecord, 'n3-2024-07')
        self.assertIsNone(raw.normalized)
        self.assertEqual(raw.source_data['files'][0]['pages'][0]['text'], '本文。')
        self.assertNotIn('data:image/', json.dumps(raw.source_data))
        # Grading reads the DB version rather than the original sample JSON.
        stored = db.session.get(JlptExamRecord, self.exam['id'])
        changed = copy.deepcopy(stored.normalized)
        changed['sections'][0]['questions'][0]['answer_index'] = 0
        stored.normalized = changed
        db.session.commit()
        self.assertEqual(grade(get_exam(self.exam['id']), {'version': 1, 'answers': {'v-1': 0}})['correct'], 1)

    @patch('vocabulary.audio._tts_client')
    def test_images_are_signed_from_private_r2_and_answer_keys_stay_private(self, client):
        import_payload(self.payload)
        client.return_value.generate_presigned_url.return_value = 'https://test.r2.example/signed-image'
        result = public_exam(get_exam(self.exam['id']))
        self.assertNotIn('answer_index', json.dumps(result))
        images = [im for section in result['sections'] for q in section['questions'] for im in q['images']]
        self.assertTrue(images)
        self.assertEqual(images[0]['image_data_url'], 'https://test.r2.example/signed-image')
        self.assertEqual(source_exam('n3-2024-07')['documents'][0]['pages'][0]['image_data_url'], 'https://test.r2.example/signed-image')
        self.assertEqual(client.return_value.generate_presigned_url.call_args.kwargs['Params']['Bucket'], 'test-private-r2')

    def test_embedded_images_are_rejected_before_database_writes(self):
        self.payload['sessions'][0]['files'][0]['pages'][0]['image_data_url'] = 'data:image/webp;base64,not-real'
        with self.assertRaises(ValueError): import_payload(self.payload)
        self.assertEqual(db.session.query(JlptExamRecord).count(), 0)

    def test_cleanup_removes_only_pending_source_sessions_and_preserves_images(self):
        import importlib
        from alembic.migration import MigrationContext
        from alembic.operations import Operations
        self.payload['source_sha256'] = '4ec4fddc850fdc39278a5b1cfe1aecc19685a3a3471f001b90dd5ea6fad21410'
        import_payload(self.payload)
        # An unrelated archive must not be removed by this one-time cleanup.
        db.session.add(JlptExamRecord(id='n2-2024-07', level='N2', year=2024, month=7,
            has_exam=True, source_sha256='c' * 64, source_data={}, normalized=None))
        db.session.commit()
        migration = importlib.import_module('migrations.versions.d3e4f5a6b7c8_remove_pending_jlpt_exams')
        with db.engine.begin() as connection:
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
        db.session.expire_all()
        self.assertIsNone(db.session.get(JlptExamRecord, 'n3-2024-07'))
        self.assertIsNotNone(db.session.get(JlptExamRecord, 'n3-2017-07'))
        self.assertIsNotNone(db.session.get(JlptExamRecord, 'n2-2024-07'))
        self.assertEqual(db.session.query(JlptImage).count(), 1)
