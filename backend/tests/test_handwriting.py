import base64
import io
from pathlib import Path
import unittest
from unittest.mock import patch
from flask import Flask
import numpy as np
from PIL import Image, ImageDraw, PngImagePlugin
import torch
from auth import init_auth
from auth.models import AuthSession, User, db, now
from auth.security import digest
from handwriting import init_handwriting
from handwriting.service import HandwritingRecognizer, RecognitionInputError, decode_png, prepare_canvas, preprocess, preferred_device


def png(image, metadata=None):
    output = io.BytesIO()
    image.save(output, format='PNG', pnginfo=metadata)
    return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()


def sample():
    image = Image.new('RGB', (320, 320), 'white')
    ImageDraw.Draw(image).line((60, 160, 260, 160), fill='black', width=10)
    return image


class PreprocessingTests(unittest.TestCase):
    def test_device_priority(self):
        for cuda, mps, expected in [(True, True, 'cuda'), (False, True, 'mps'), (False, False, 'cpu')]:
            with patch('torch.cuda.is_available', return_value=cuda), patch('torch.backends.mps.is_available', return_value=mps):
                self.assertEqual(preferred_device().type, expected)

    def test_alpha_and_inverted_backgrounds_match_white_original(self):
        transparent = Image.new('RGBA', (320, 320), (0, 0, 0, 0))
        ImageDraw.Draw(transparent).line((60, 160, 260, 160), fill='black', width=10)
        expected = np.asarray(prepare_canvas(sample()))
        np.testing.assert_array_equal(np.asarray(prepare_canvas(transparent)), expected)
        np.testing.assert_array_equal(np.asarray(prepare_canvas(Image.fromarray(255 - np.asarray(sample())))), expected)

    def test_crop_resize_center_and_normalization(self):
        image = Image.new('L', (200, 100), 255)
        ImageDraw.Draw(image).rectangle((15, 30, 64, 54), fill=0)
        canvas = np.asarray(prepare_canvas(image))
        self.assertEqual(canvas.shape, (128, 128, 3))
        ys, xs = np.where(canvas[:, :, 0] < 200)
        self.assertEqual((xs.min(), xs.max(), ys.min(), ys.max()), (13, 114, 38, 88))
        tensor = preprocess(image)
        self.assertEqual(tuple(tensor.shape), (3, 128, 128))
        mean, std = torch.tensor([.485, .456, .406]), torch.tensor([.229, .224, .225])
        torch.testing.assert_close(tensor[:, 0, 0], (torch.ones(3) - mean) / std)
        torch.testing.assert_close(tensor[:, 64, 64], -mean / std)

    def test_blank_images(self):
        for image in [Image.new('RGB', (32, 32), 'white'), Image.new('RGBA', (32, 32)), Image.new('RGB', (32, 32), 'black')]:
            with self.subTest(image=image.mode), self.assertRaises(RecognitionInputError) as error:
                preprocess(image)
            self.assertEqual(error.exception.code, 'blank_image')

    def test_invalid_and_oversized_images(self):
        for value in [None, {}, '', 'data:image/jpeg;base64,AAAA', 'data:image/png;base64,!!!', 'data:image/png;base64,YWJjZA==', png(Image.new('RGB', (1025, 2)))]:
            with self.subTest(value=str(value)[:40]), self.assertRaises(RecognitionInputError):
                decode_png(value)
        data = io.BytesIO()
        sample().save(data, format='JPEG')
        with self.assertRaises(RecognitionInputError):
            decode_png('data:image/png;base64,' + base64.b64encode(data.getvalue()).decode())


class RecognitionApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)
        checkpoint = Path(__file__).resolve().parent.parent / 'models/handwriting/best.pt'
        with patch('handwriting.service.preferred_device', return_value=torch.device('cpu')), patch('handwriting.service.torch.load', wraps=torch.load) as load:
            cls.recognizer = HandwritingRecognizer(checkpoint)
        load.assert_called_once_with(checkpoint, map_location='cpu', weights_only=True)
        cls.app = Flask(__name__)
        cls.app.config.update(TESTING=True, AUTH_CONFIGURED=True, AUTH_SECRET_KEY='handwriting-test-' * 4, SQLALCHEMY_DATABASE_URI='sqlite://')
        init_auth(cls.app)
        init_handwriting(cls.app, cls.recognizer)
        with cls.app.app_context():
            db.create_all()
            db.session.add(User(id='handwriting-user', name='Test', email='handwriting@example.com', phone='+84912345678'))
            db.session.flush()
            db.session.add(AuthSession(user_id='handwriting-user', access_hash=digest('handwriting-token'), access_expires_at=now() + 900, expires_at=now() + 3600))
            db.session.commit()

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()

    def setUp(self):
        self.client = self.app.test_client()
        self.headers = {'Authorization': 'Bearer handwriting-token'}

    def post(self, image):
        return self.client.post('/api/kanji/recognize', headers=self.headers, json={'image': image})

    def test_real_checkpoint_without_reload(self):
        self.assertFalse(self.recognizer.model.training)
        with patch('handwriting.service.torch.load', side_effect=AssertionError('reload')):
            response = self.post(png(sample()))
        self.assertEqual(response.status_code, 200, response.json)
        predictions = response.json['predictions']
        self.assertEqual(len(predictions), 5)
        self.assertEqual(predictions[0]['character'], '一')
        self.assertTrue(all(0 <= item['score'] <= 1 for item in predictions))
        self.assertEqual(predictions, sorted(predictions, key=lambda item: -item['score']))
        self.assertGreater(response.json['elapsed_ms'], 0)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_softmax_and_label_order(self):
        logits = torch.zeros(1, 3036)
        logits[0, 4:9] = torch.arange(1., 6.)
        with patch.object(self.recognizer.model, 'forward', return_value=logits):
            result = self.post(png(sample())).json['predictions']
        self.assertEqual([item['character'] for item in result], [self.recognizer.labels[i] for i in [8, 7, 6, 5, 4]])
        self.assertAlmostEqual(result[0]['score'], torch.softmax(logits, 1)[0, 8].item())
        self.assertLess(sum(item['score'] for item in result), 1)

    def test_authentication(self):
        self.assertEqual(self.client.post('/api/kanji/recognize', json={'image': png(sample())}).status_code, 401)

    def test_error_responses_and_size_limits(self):
        blank = self.post(png(Image.new('RGB', (32, 32), 'white')))
        self.assertEqual((blank.status_code, blank.json['code']), (422, 'blank_image'))
        self.assertEqual(self.post('data:image/png;base64,!!!').status_code, 400)
        self.assertEqual(self.post(png(Image.new('RGB', (1025, 10)))).status_code, 413)
        self.assertEqual(self.post('data:image/png;base64,' + 'A' * 700000).status_code, 413)
        response = self.client.post('/api/kanji/recognize', headers=self.headers, json={'image': 'A' * (1024 * 1024)})
        self.assertEqual((response.status_code, response.json['code']), (413, 'request_too_large'))
        self.assertEqual(self.client.post('/api/kanji/recognize', headers=self.headers, data='{', content_type='application/json').status_code, 400)

    def test_larger_than_old_auth_limit(self):
        info = PngImagePlugin.PngInfo()
        info.add_text('comment', 'x' * 20000)
        response = self.post(png(sample(), info))
        self.assertEqual(response.status_code, 200, response.json)

    def test_inference_error_is_private(self):
        with patch.object(self.recognizer.model, 'forward', side_effect=RuntimeError('private checkpoint path')):
            with self.assertLogs(self.app.logger, level='ERROR'):
                response = self.post(png(sample()))
        self.assertEqual((response.status_code, response.json['code']), (500, 'inference_failed'))
        self.assertNotIn('private', str(response.json))
