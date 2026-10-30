import unittest
from unittest.mock import Mock
import torch
from flask import Flask
from auth import init_auth
from auth.models import User, AuthSession, now
from auth.security import digest
from dictionary import init_dictionary
from translation import init_translation
from translation.service import SentenceTranslator
from api_errors import ApiError
from extensions import db


class TranslationTests(unittest.TestCase):
    def translator(self):
        service = SentenceTranslator('/missing')
        service.device = torch.device('cpu')
        service.tokenizer = Mock(eos_token_id=2)
        service.tokenizer.return_value = {'input_ids': torch.tensor([[1, 4, 2]])}
        service.tokenizer.get_lang_id.return_value = 9
        service.tokenizer.decode.return_value = 'Tôi đi học.'
        service.model = Mock()
        service.model.generate.return_value = torch.tensor([[2, 9, 4, 2]])
        return service

    def test_local_generation_direction_without_result_cache(self):
        service = self.translator()
        first = service.translate('u1', '学校へ行きます。', 'ja', 'vi')
        self.assertEqual(first['translation'], 'Tôi đi học.')
        self.assertFalse(first['cached'])
        self.assertEqual(service.tokenizer.src_lang, 'ja')
        service.tokenizer.get_lang_id.assert_called_with('vi')
        self.assertFalse(service.translate('u1', '学校へ行きます。', 'ja', 'vi')['cached'])
        self.assertEqual(service.model.generate.call_count, 2)
        service.translate('u2', '学校へ行きます。', 'ja', 'vi')
        self.assertEqual(service.model.generate.call_count, 3)
        service.translate('u1', 'Tôi đi học.', 'vi', 'ja')
        service.tokenizer.get_lang_id.assert_called_with('ja')

    def test_validation_does_not_load_a_model(self):
        service = SentenceTranslator('/missing')
        for text, source, target in [('', 'ja', 'vi'), (None, 'ja', 'vi'), ('a'*501, 'ja', 'vi'), ('a', 'en', 'vi'), ('a', 'ja', 'ja')]:
            with self.assertRaises(ApiError): service.translate('u', text, source, target)
        with self.assertRaises(ApiError) as error: service.translate('u', '学校', 'ja', 'vi')
        self.assertEqual(error.exception.status, 503)

    def test_rejects_token_overflow_without_truncating_and_releases_lock(self):
        service = self.translator()
        service.tokenizer.return_value = {'input_ids': torch.ones((1, 513), dtype=torch.long)}
        with self.assertRaises(ApiError) as error: service.translate('u', '学', 'ja', 'vi')
        self.assertEqual(error.exception.code, 'translation_too_long')
        service.model.generate.assert_not_called()
        self.assertFalse(service.lock.locked())
        service.tokenizer.assert_called_with('学', return_tensors='pt', truncation=False)

    def test_busy_and_incomplete_outputs(self):
        service = self.translator()
        service.lock.acquire()
        with self.assertRaises(ApiError) as error: service.translate('u', '学', 'ja', 'vi')
        self.assertEqual(error.exception.status, 429)
        service.lock.release()
        service.model.generate.return_value = torch.tensor([[2, 9, 4]])
        with self.assertRaises(ApiError): service.translate('u', '学', 'ja', 'vi')
        self.assertFalse(service.lock.locked())


class TranslationApiTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, AUTH_CONFIGURED=True, AUTH_SECRET_KEY='translation-test-'*3, SQLALCHEMY_DATABASE_URI='sqlite://')
        init_auth(self.app); init_dictionary(self.app)
        self.service = Mock()
        self.service.translate.return_value = {'text': '学校へ行きます。', 'translation': 'Tôi đi học.', 'source': 'ja', 'target': 'vi'}
        init_translation(self.app, self.service)
        self.context = self.app.app_context(); self.context.push()
        db.create_all()
        db.session.add(User(id='u1', name='Reader', email='translate@example.invalid', phone='+84900000000')); db.session.flush()
        db.session.add(AuthSession(user_id='u1', access_hash=digest('translate-token'), access_expires_at=now()+600, expires_at=now()+600)); db.session.commit()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove(); db.drop_all(); self.context.pop()

    def test_auth_json_and_safe_service_errors(self):
        url = '/api/dictionary/translate'
        self.assertEqual(self.client.post(url, json={'text': '学校'}).status_code, 401)
        headers = {'Authorization': 'Bearer translate-token'}
        self.assertEqual(self.client.post(url, json=[], headers=headers).status_code, 400)
        data = self.client.post(url, json={'text': '学校'}, headers=headers).json
        self.assertEqual(data['translation'], 'Tôi đi học.')
        self.assertEqual(data['japanese'], '学校へ行きます。')
        self.assertEqual(''.join(t['text'] for p in data['paragraphs'] for t in p['tokens']), data['japanese'])
        self.assertTrue(any(w['reading'] == 'がっこう' for w in data['words'].values()))
        self.service.translate.assert_called_with('u1', '学校', 'ja', 'vi')
        self.service.translate.side_effect = ApiError('Máy chủ đang bận.', 429, 'translation_busy')
        self.assertEqual(self.client.post(url, json={'text': '学校'}, headers=headers).status_code, 429)
