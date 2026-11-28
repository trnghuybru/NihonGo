import base64
import io
import unittest
from unittest.mock import patch
import numpy as np
import soundfile as sf
from api_errors import ApiError
from pronunciation.service import analyze_recording, feedback_units
from pronunciation.ctc import collapse, align


class PronunciationTests(unittest.TestCase):
    def test_kana_feedback_keeps_repeated_sounds_separate_and_marks_uncertainty(self):
        rows = [dict(index=i, phone=p, evidence_frames=2,
                     mean_reference_posterior=.9, gop_like_margin=1)
                for i, p in enumerate(['g', 'a', 'cl', 'k', 'o', 'o'])]
        rows[3]['gop_like_margin'] = -1
        rows[5]['mean_reference_posterior'] = .2
        units = feedback_units(rows)
        self.assertEqual([u['label'] for u in units], ['ガ', 'ッ', 'コ', 'オ'])
        self.assertEqual([u['status'] for u in units], ['matched', 'matched', 'retry', 'unclear'])
        self.assertEqual(units[2]['phones'], ['k', 'o'])
        self.assertEqual(units[2]['position'], 4)
        self.assertTrue(all(u['status'] == 'unclear' for u in feedback_units(rows, uncertain=True)))

    def wav(self, seconds=1, silent=False):
        signal = np.zeros(int(16000 * seconds)) if silent else .1 * np.sin(2 * np.pi * 220 * np.arange(int(16000 * seconds)) / 16000)
        output = io.BytesIO()
        sf.write(output, signal, 16000, format='WAV')
        return base64.b64encode(output.getvalue()).decode()

    def test_invalid_recording_and_text_rejected_before_loading_model(self):
        with patch('pronunciation.service.runtime') as load:
            for payload in [None, {}, {'text': 'hello', 'audio': ''}, {'text': '日本語', 'audio': '?invalid'},
                            {'text': '日本語', 'audio': self.wav(silent=True)},
                            {'text': '日本語', 'audio': self.wav(seconds=.1)}]:
                with self.subTest(payload=str(payload)[:40]), self.assertRaises(ApiError):
                    analyze_recording(payload)
            load.assert_not_called()

    def test_repeat_phones_require_blank_and_decode_correctly(self):
        self.assertEqual(collapse([0, 2, 2, 0, 2]), [2, 2])
        with self.assertRaises(ValueError):
            align([[0., -1., -2.]] * 2, [2, 2])

    def test_busy_model_has_retryable_error(self):
        from pronunciation.service import _lock
        _lock.acquire()
        try:
            with self.assertRaises(ApiError) as caught:
                analyze_recording({'text': '日本語', 'audio': self.wav()})
            self.assertEqual(caught.exception.status, 429)
        finally:
            _lock.release()
