"""Google Cloud Speech-to-Text recognition for short Japanese PCM recordings."""
import base64
import logging
import os

import numpy as np
import requests

from .gemini_provider import PROJECT_ID, vertex_token

log = logging.getLogger(__name__)
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
        pcm = bytes(3200) + raw[:BYTES_PER_SECOND * 9] + bytes(25600)
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
            log.warning('Cloud Speech request failed (%s)', type(error).__name__)
            return '', 'Dịch vụ chấm giọng tạm lỗi. Câu này không tính điểm.'
