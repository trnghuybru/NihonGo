import unittest
import base64
from unittest.mock import Mock, patch
import numpy as np
from games.speech import CloudSpeechRecognizer, TurnAudio


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.raw = (np.ones(16000, dtype='<i2') * 2000).tobytes()
        self.recognizer = CloudSpeechRecognizer('unit-project-123')

    @patch('games.speech.vertex_token', return_value='test-only-token')
    @patch('games.speech.requests.post')
    def test_short_japanese_audio_without_answer_hints(self, post, token):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'results': [{'alternatives': [{'transcript': '学校', 'confidence': .95}]}]}
        self.assertEqual(self.recognizer.recognize(self.raw), ('学校', None))
        url = post.call_args.args[0]
        payload = post.call_args.kwargs['json']
        self.assertIn('/locations/global/recognizers/_:recognize', url)
        self.assertEqual(payload['config']['languageCodes'], ['ja-JP'])
        self.assertEqual(payload['config']['model'], 'short')
        self.assertEqual(payload['config']['explicitDecodingConfig']['sampleRateHertz'], 16000)
        self.assertNotIn('adaptation', payload['config'])
        self.assertNotIn('学校', str(payload))
        pcm = base64.b64decode(payload['content'])
        self.assertTrue(pcm.startswith(bytes(3200)))
        self.assertTrue(pcm.endswith(bytes(25600)))
        self.assertLessEqual(len(pcm), 320000)

    @patch('games.speech.requests.post')
    def test_silence_never_calls_provider(self, post):
        self.assertIsNotNone(self.recognizer.recognize(bytes(32000))[1])
        self.assertIsNotNone(self.recognizer.recognize(bytes(100))[1])
        post.assert_not_called()

    @patch('games.speech.vertex_token', return_value='test-only-token')
    @patch('games.speech.requests.post')
    def test_uncertain_transcript_and_provider_errors_are_unscored(self, post, token):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'results': [{'alternatives': [{'transcript': '猫', 'confidence': .3}]}]}
        self.assertEqual(self.recognizer.recognize(self.raw)[0], '')
        post.return_value.status_code = 403
        self.assertIn('cấp quyền', self.recognizer.recognize(self.raw)[1])
        post.side_effect = TimeoutError()
        self.assertIn('tạm lỗi', self.recognizer.recognize(self.raw)[1])

    def test_short_word_then_silence_ends_turn_with_bounded_audio(self):
        clip = TurnAudio()
        clip.append(self.raw[:6400], 1000)  # 200 ms of speech
        clip.append(bytes(6400), 1200)
        self.assertFalse(clip.ended(1799))
        self.assertTrue(clip.ended(1800))
        self.assertEqual(clip.last_voice_at, 1000)
        self.assertEqual(clip.voiced_ms, 200)
        clip.append(self.raw * 20, 2000)
        self.assertLessEqual(len(clip.data), 320000)
        silence = TurnAudio()
        silence.append(bytes(32000), 1000)
        self.assertFalse(silence.ended(10000))
