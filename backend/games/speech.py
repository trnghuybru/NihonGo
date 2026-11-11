"""Short Japanese answers, transcribed from server-captured PCM, never client text.

No target word/phrase hints are sent: recognition must not guess the answer from
the question. This checks the spoken word, not accent or phoneme quality.
"""
import logging

import numpy as np
from services.cloud_speech import BYTES_PER_SECOND, SAMPLE_RATE, CloudSpeechRecognizer

log = logging.getLogger('games.speech')


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
