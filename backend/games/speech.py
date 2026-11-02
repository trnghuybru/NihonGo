"""Short Japanese answers, transcribed from server-captured PCM, never client text.

No target word/phrase hints are sent: recognition must not guess the answer from
the question. This checks the spoken word, not accent or phoneme quality.
"""
import base64
import logging
import os

import numpy as np
import requests
from services.gemini_provider import PROJECT_ID, vertex_token

log = logging.getLogger('games.speech')
SAMPLE_RATE = 16000
BYTES_PER_SECOND = SAMPLE_RATE * 2


class CloudSpeechRecognizer:
    def __init__(self, project=None):
        self.project = (project or os.getenv('GAME_SPEECH_PROJECT_ID') or
                        os.getenv('VERTEX_PROJECT_ID') or os.getenv('GOOGLE_CLOUD_PROJECT', '')).strip()
        if not PROJECT_ID.fullmatch(self.project):
            raise RuntimeError('Set GAME_SPEECH_PROJECT_ID or VERTEX_PROJECT_ID for Cloud Speech-to-Text')

    def recognize(self, raw):
        if len(raw) < BYTES_PER_SECOND * .12:
            return '', 'Không nhận được âm thanh. Câu này không tính điểm.'
        samples = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768.0
        if float(np.sqrt(np.mean(samples * samples))) < .003:
            return '', 'Âm thanh quá nhỏ. Câu này không tính điểm.'
        # Very short isolated words can be dropped when the recording ends at
        # the last phoneme. Supply utterance boundaries even for "Đọc xong".
        # Keep the complete request under ten seconds, including the padding.
        pcm = bytes(3200) + raw[:BYTES_PER_SECOND * 9] + bytes(25600)
        # Use a fixed endpoint/model. Never send the target word as adaptation.
        url = f'https://speech.googleapis.com/v2/projects/{self.project}/locations/global/recognizers/_:recognize'
        try:
            response = requests.post(url, headers={'Authorization': f'Bearer {vertex_token()}'},
                json={'config': {
                    'explicitDecodingConfig': {'encoding': 'LINEAR16', 'sampleRateHertz': SAMPLE_RATE, 'audioChannelCount': 1},
                    'languageCodes': ['ja-JP'], 'model': 'short',
                    'features': {'maxAlternatives': 1, 'enableWordConfidence': True},
                }, 'content': base64.b64encode(pcm).decode('ascii')},
                timeout=(3, 8))
            if response.status_code in (401, 403):
                log.error('Cloud Speech authorization failed: HTTP %s; check API and roles/speech.client', response.status_code)
                return '', 'Dịch vụ chấm giọng chưa được cấp quyền. Câu này không tính điểm.'
            response.raise_for_status()
            results = response.json().get('results', [])
            choices = [item['alternatives'][0] for item in results if item.get('alternatives')]
            text = ''.join(item.get('transcript', '').strip() for item in choices)
            confidence = [float(item['confidence']) for item in choices if item.get('confidence', 0) > 0]
            if not text or (confidence and min(confidence) < .55):
                return '', 'Chưa nghe rõ cách đọc. Hãy nói gần micro hơn. Câu này không tính điểm.'
            return text[:200], None
        except Exception as error:
            # No recordings, tokens, or provider response bodies in application logs.
            log.warning('Cloud Speech request failed (%s)', type(error).__name__)
            return '', 'Dịch vụ chấm giọng tạm lỗi. Câu này không tính điểm.'


class TurnAudio:
    """Bounded PCM and speech timing; short silence ends an answer automatically."""
    def __init__(self):
        self.data = bytearray()
        self.voiced_ms = 0
        self.last_voice_at = None

    def append(self, raw, at):
        remaining = BYTES_PER_SECOND * 10 - len(self.data)
        chunk = raw[:max(0, remaining)]
        self.data.extend(chunk)
        if not chunk:
            return
        samples = np.frombuffer(chunk, dtype='<i2').astype(np.float32) / 32768.0
        if float(np.sqrt(np.mean(samples * samples))) >= .006:
            self.voiced_ms += len(chunk) * 1000 / BYTES_PER_SECOND
            self.last_voice_at = at

    def ended(self, at):
        return self.voiced_ms >= 120 and self.last_voice_at is not None and at - self.last_voice_at >= 800
