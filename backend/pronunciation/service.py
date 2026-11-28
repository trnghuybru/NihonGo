"""Experimental phone feedback using the learner-provided XLS-R checkpoint."""
import base64
import binascii
import io
import json
import math
import os
import re
import threading
from pathlib import Path

from api_errors import ApiError

_lock = threading.Lock()
_runtime = None


def feedback_units(rows, uncertain=False):
    """Group reference phones into readable kana; never infer kanji boundaries."""
    kana = dict(zip('a i u e o'.split(), 'アイウエオ'))
    for consonant, syllables in {
        'k': 'カキクケコ', 'g': 'ガギグゲゴ', 's': 'サスィスセソ',
        'z': 'ザズィズゼゾ', 't': 'タティトゥテト', 'd': 'ダディドゥデド',
        'n': 'ナニヌネノ', 'h': 'ハヒフヘホ', 'b': 'バビブベボ',
        'p': 'パピプペポ', 'm': 'マミムメモ', 'r': 'ラリルレロ',
    }.items():
        # Multi-character transliterations are handled explicitly below.
        if consonant not in {'s', 'z', 't', 'd'}:
            kana.update(zip((consonant + v for v in 'aiueo'), syllables))
    kana.update(dict(zip('sa si su se so za zi zu ze zo ta ti tu te to da di du de do'.split(),
                         'サ スィ ス セ ソ ザ ズィ ズ ゼ ゾ タ ティ トゥ テ ト ダ ディ ドゥ デ ド'.split())))
    for consonant, base in {'ky': 'キ', 'gy': 'ギ', 'ny': 'ニ', 'hy': 'ヒ', 'by': 'ビ',
                            'py': 'ピ', 'my': 'ミ', 'ry': 'リ', 'sh': 'シ', 'ch': 'チ',
                            'j': 'ジ', 'ty': 'テ', 'dy': 'デ', 'vy': 'ヴ'}.items():
        kana.update({consonant + v: base + small for v, small in zip('aiueo', 'ャィュェョ')})
    for consonant, base in {'f': 'フ', 'v': 'ヴ', 'kw': 'ク', 'gw': 'グ', 'ts': 'ツ'}.items():
        kana.update({consonant + v: base + small for v, small in zip('aiueo', 'ァィゥェォ')})
    kana.update({'shi': 'シ', 'chi': 'チ', 'ji': 'ジ', 'fu': 'フ', 'tsu': 'ツ',
                 'ya': 'ヤ', 'yu': 'ユ', 'yo': 'ヨ', 'wa': 'ワ', 'wo': 'ヲ',
                 'N': 'ン', 'cl': 'ッ'})
    units, pending = [], []
    for row in rows:
        pending.append(row)
        if row['phone'].lower() not in {'a', 'i', 'u', 'e', 'o'} and row['phone'] not in {'N', 'cl'}:
            continue
        phones = [p['phone'] for p in pending]
        key = ''.join(p if p in {'N', 'cl'} else p.lower() for p in phones)
        status = 'unclear' if uncertain or any(p['evidence_frames'] <= 0 for p in pending) else (
            'retry' if any(p['gop_like_margin'] < 0 for p in pending) else
            'matched' if all(p['mean_reference_posterior'] >= .5 for p in pending) else 'unclear')
        units.append({'label': kana.get(key, key), 'phones': phones,
                      'position': pending[0]['index'] + 1, 'status': status})
        pending = []
    if pending:
        units.append({'label': ' '.join(p['phone'] for p in pending),
                      'phones': [p['phone'] for p in pending],
                      'position': pending[0]['index'] + 1, 'status': 'unclear'})
    return units


def runtime():
    global _runtime
    if _runtime is None:
        from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
        folder = Path(os.getenv('PRONUNCIATION_MODEL_DIR', str(Path(__file__).resolve().parents[1] / 'models/pronunciation')))
        if not (folder / 'model.safetensors').exists():
            raise ApiError('Bộ phân tích phát âm chưa sẵn sàng.', 503, 'pronunciation_unavailable')
        vocab = json.loads((folder / 'vocab.json').read_text())
        model = Wav2Vec2ForCTC.from_pretrained(folder, local_files_only=True).eval()
        extractor = Wav2Vec2FeatureExtractor.from_pretrained(folder, local_files_only=True)
        _runtime = (model, extractor, vocab)
    return _runtime


def analyze_recording(data):
    if not isinstance(data, dict):
        raise ApiError('Bản ghi không hợp lệ.')
    text, encoded = data.get('text'), data.get('audio')
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 160 or not re.search(r'[ぁ-ゖァ-ヺ一-龯]', text):
        raise ApiError('Hãy chọn một câu tiếng Nhật ngắn, tối đa 160 ký tự.')
    if not isinstance(encoded, str) or len(encoded) > 1200000:
        raise ApiError('Bản ghi không hợp lệ hoặc quá dài.')
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise ApiError('Bản ghi không hợp lệ.') from None
    import numpy as np
    import soundfile as sf
    try:
        with sf.SoundFile(io.BytesIO(raw)) as source:
            if source.format != 'WAV' or not 8000 <= source.samplerate <= 48000 or source.channels > 2:
                raise ValueError()
            sr = source.samplerate
            if not .5 <= len(source) / sr <= 20:
                raise ValueError()
            audio = source.read(dtype='float32', always_2d=True).mean(axis=1)
    except (ValueError, RuntimeError, sf.LibsndfileError):
        raise ApiError('Hãy thu một câu từ 0,5 đến 20 giây rồi thử lại.') from None
    if not np.isfinite(audio).all() or np.sqrt(np.mean(audio ** 2)) < 0.0001:
        raise ApiError('Bản ghi quá nhỏ hoặc chưa có giọng nói. Hãy đến gần micro và thu lại.')
    if not _lock.acquire(blocking=False):
        raise ApiError('Bộ phân tích đang bận. Hãy thử lại sau ít giây.', 429, 'pronunciation_busy')
    try:
        import pyopenjtalk
        import torch
        from scipy.signal import resample_poly
        from .ctc import collapse, diagnostics, edit_distance
        phones = [p for p in pyopenjtalk.g2p(text.strip()).split() if p not in {'sil', 'pau'}]
        model, extractor, vocab = runtime()
        if not phones or len(phones) > 140 or any(p not in vocab for p in phones):
            raise ApiError('Câu này quá dài hoặc có cách đọc chưa hỗ trợ. Hãy chọn câu ngắn hơn.')
        if sr != 16000:
            divisor = math.gcd(sr, 16000)
            audio = resample_poly(audio, 16000 // divisor, sr // divisor).astype('float32')
        inputs = extractor(audio, sampling_rate=16000, return_tensors='pt', return_attention_mask=True)
        with torch.inference_mode():
            log_probs = model(**inputs).logits[0].float().log_softmax(-1).cpu()
        target = [vocab[p] for p in phones]
        recognized = collapse(log_probs.argmax(-1).tolist())
        mismatch = not recognized or edit_distance(target, recognized) / len(target) > .5
        try:
            report = diagnostics(log_probs.tolist(), target, {v: k for k, v in vocab.items()}, math.prod(model.config.conv_stride) / 16000)
        except ValueError:
            mismatch, report = True, {'phones': []}
        focus = sorted((p for p in report['phones'] if p['gop_like_margin'] < 0), key=lambda p: p['gop_like_margin'])[:5]
        return {'reference_text': text.strip(), 'reading': pyopenjtalk.g2p(text.strip(), kana=True),
                'status': 'uncertain' if mismatch else 'analyzed',
                'units': feedback_units(report['phones'], mismatch),
                'focus_phones': [] if mismatch else [{'phone': p['phone'], 'position': p['index'] + 1} for p in focus],
                'message': 'Chưa đối chiếu rõ với câu mẫu. Hãy nghe mẫu và đọc lại cả câu.' if mismatch else
                    'Hãy nghe lại các âm được gợi ý, rồi thử thu thêm một lần.' if focus else
                    'Đã đối chiếu bản ghi. Bạn có thể nghe lại giọng mình hoặc luyện câu tiếp theo.',
                'note': 'Góp ý âm vị đang thử nghiệm; chưa đánh giá trọng âm hoặc cho điểm phát âm.'}
    except ImportError:
        raise ApiError('Bộ phân tích phát âm chưa đủ thư viện. Vui lòng thử lại sau.', 503, 'pronunciation_unavailable') from None
    except (OSError, RuntimeError):
        raise ApiError('Bộ phân tích chưa xử lý được bản ghi. Hãy thử lại sau.', 503, 'pronunciation_unavailable') from None
    finally:
        _lock.release()
