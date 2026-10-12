"""Portable processing core. No Flask, database, queue or permanent audio storage."""
import argparse
import json
import math
import os
import re
from pathlib import Path


class ProcessingError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message
        super().__init__(message)


def publish_phase(directory, status, title=''):
    path = Path(directory) / 'phase.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'status': status, 'title': title}), encoding='utf-8')
    temporary.replace(path)


def json3_captions(data):
    segments = []
    for event in data.get('events', []):
        text = ''.join(part.get('utf8', '') for part in event.get('segs', []))
        text = ' '.join(text.split())
        start = event.get('tStartMs', 0) / 1000
        end = start + event.get('dDurationMs', 0) / 1000
        if text and end > start:
            segment = {'text': text, 'start_seconds': start, 'end_seconds': end}
            parts = event.get('segs', [])
            if any('tOffsetMs' in part for part in parts):
                words = []
                for part in parts:
                    value = part.get('utf8', '')
                    if value.strip():
                        word_start = start + part.get('tOffsetMs', 0) / 1000
                        words.append({'text': value, 'start_seconds': word_start, 'end_seconds': end})
                for position in range(len(words) - 1):
                    words[position]['end_seconds'] = words[position + 1]['start_seconds']
                segment['words'] = words
            segments.append(segment)
    return segments


def normalize_segments(raw, duration):
    """Remove rolling-caption overlaps and merge short fragments into practice phrases.

    Timestamp boundaries are retained. Long phrases are never split at invented times.
    """
    cleaned = []
    for item in sorted(raw, key=lambda item: item['start_seconds']):
        start, end = float(item['start_seconds']), min(float(item['end_seconds']), duration)
        text = ' '.join(item['text'].split())
        if not text or not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            continue
        if cleaned and start < cleaned[-1]['end_seconds']:
            previous = cleaned[-1]
            if text == previous['text']:
                previous['end_seconds'] = max(previous['end_seconds'], end)
                continue
            if text.startswith(previous['text']):
                previous['text'], previous['end_seconds'] = text, max(previous['end_seconds'], end)
                continue
            # Japanese automatic captions often repeat the tail of a rolling line.
            overlap = next((size for size in range(min(len(previous['text']), len(text)), 1, -1)
                            if previous['text'].endswith(text[:size])), 0)
            if overlap:
                text = text[overlap:].lstrip()
            # Cut the previous display lifetime; never move the new speech later.
            previous['end_seconds'] = min(previous['end_seconds'], start)
            if previous['end_seconds'] <= previous['start_seconds']:
                cleaned.pop()
        if text and end > start:
            cleaned.append({'text': text, 'start_seconds': start, 'end_seconds': end})
    phrases = []
    for item in cleaned:
        if (phrases and not re.search(r'[。！？!?]$', phrases[-1]['text'])
                and item['start_seconds'] - phrases[-1]['end_seconds'] <= 0.5
                and item['end_seconds'] - phrases[-1]['start_seconds'] <= 12):
            phrases[-1]['text'] += item['text']
            phrases[-1]['end_seconds'] = item['end_seconds']
        else:
            phrases.append(dict(item))
    if not phrases:
        raise ProcessingError('no_speech', 'Không tìm thấy lời nói tiếng Nhật rõ ràng trong video.')
    return phrases


def display_captions(raw, duration, max_chars=28, max_seconds=4):
    """Short visual cues using source word boundaries; never estimate speech times."""
    cues = []
    for item in sorted(raw, key=lambda row: row['start_seconds']):
        text = ' '.join(item['text'].split())
        start, end = float(item['start_seconds']), min(float(item['end_seconds']), duration)
        if not text or not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            continue
        words = item.get('words') or []
        # Missing/partial word timing must not discard text or invent a split time.
        valid = bool(words) and ' '.join(''.join(word['text'] for word in words).split()) == text
        previous_start = start
        for word in words:
            word_start, word_end = word['start_seconds'], word['end_seconds']
            if not (math.isfinite(word_start) and math.isfinite(word_end)
                    and previous_start <= word_start < end and word_start <= word_end <= end):
                valid = False
            previous_start = word_start
        if not valid:
            cues.append({'text': text, 'start_seconds': start, 'end_seconds': end})
            continue
        group = None
        for word in words:
            word_start, word_end = word['start_seconds'], word['end_seconds']
            # Words sharing a timestamp are inseparable without inventing timing.
            split = (group and word_start > group['start_seconds'] and
                     (len(group['text'] + word['text']) > max_chars or
                      word_end - group['start_seconds'] > max_seconds or
                      re.search(r'[。！？!?]$', group['text'])))
            if split:
                group['end_seconds'] = min(group['end_seconds'], word_start)
                if group['end_seconds'] > group['start_seconds']:
                    cues.append(group)
                group = None
            if group is None:
                group = {'text': word['text'], 'start_seconds': word_start, 'end_seconds': word_end}
            else:
                group['text'] += word['text']
                group['end_seconds'] = max(group['end_seconds'], word_end)
        if group and group['end_seconds'] > group['start_seconds']:
            cues.append(group)
    # Rolling caption updates replace earlier cues at their ORIGINAL onset.
    result = []
    for cue in sorted(cues, key=lambda row: row['start_seconds']):
        cue['text'] = ' '.join(cue['text'].split())
        while result and result[-1]['end_seconds'] > cue['start_seconds']:
            if result[-1]['start_seconds'] == cue['start_seconds']:
                result.pop()
            else:
                result[-1]['end_seconds'] = cue['start_seconds']
                break
        result.append(cue)
    return result


def attach_practice_segments(cues, segments, video_id):
    """Match short cues to complete practice phrases without changing cue clocks."""
    from bisect import bisect_right
    starts = [segment['start_seconds'] for segment in segments]
    result = []
    for sequence, cue in enumerate(cues, 1):
        position = max(0, bisect_right(starts, cue['start_seconds']) - 1)
        if position + 1 < len(segments) and segments[position]['end_seconds'] <= cue['start_seconds']:
            position += 1
        result.append({**cue, 'id': f'{video_id}-display-{sequence:04d}',
                       'segment_id': segments[position]['id']})
    return result


_models = {}


def transcribe_file(path):
    from faster_whisper import WhisperModel
    model_name = os.getenv('SHADOWING_WHISPER_MODEL', 'small')
    threads = int(os.getenv('SHADOWING_CPU_THREADS', '2'))
    if model_name not in _models:
        _models[model_name] = WhisperModel(model_name, device='cpu', compute_type='int8',
            cpu_threads=threads, num_workers=1, download_root=os.getenv('SHADOWING_MODEL_DIR'))
    segments, info = _models[model_name].transcribe(str(path), task='transcribe',
        vad_filter=True, condition_on_previous_text=False, beam_size=5, word_timestamps=True)
    if info.language != 'ja':
        raise ProcessingError('wrong_language', 'Hãy chọn video có lời nói chủ yếu bằng tiếng Nhật.')
    raw = [{'text': item.text.strip(), 'start_seconds': item.start, 'end_seconds': item.end, 'words': [
               {'text': word.word, 'start_seconds': word.start, 'end_seconds': word.end}
               for word in (item.words or [])]}
           for item in segments if item.text.strip()]
    return raw


def process_video(video_id, directory):
    import requests
    from yt_dlp import YoutubeDL
    from yt_dlp.utils import DownloadError

    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
        raise ProcessingError('invalid_video', 'Video không hợp lệ.')
    url = f'https://www.youtube.com/watch?v={video_id}'
    options = {'quiet': True, 'no_warnings': True, 'noplaylist': True, 'socket_timeout': 20,
               'retries': 1, 'fragment_retries': 1, 'cachedir': False,
               'js_runtimes': {'node': {}}, 'format': 'bestaudio/best',
               'outtmpl': str(Path(directory) / 'audio.%(ext)s'),
               'max_filesize': 100_000_000}
    publish_phase(directory, 'extracting')
    try:
        with YoutubeDL(options) as downloader:
            metadata = downloader.extract_info(url, download=False)
            if metadata.get('id') != video_id or metadata.get('_type') in ('playlist', 'multi_video'):
                raise ProcessingError('invalid_video', 'Cần một video YouTube cụ thể.')
            duration = metadata.get('duration')
            maximum = int(os.getenv('SHADOWING_MAX_SECONDS', '1200'))
            if metadata.get('is_live') or not duration or not 0 < duration <= maximum:
                raise ProcessingError('video_too_long', f'Chọn video đã kết thúc, dài tối đa {maximum // 60} phút.')
            if metadata.get('age_limit', 0) >= 18 or metadata.get('availability') in ('private', 'premium_only', 'subscriber_only'):
                raise ProcessingError('video_unavailable', 'Video này không thể truy cập công khai.')
            title = metadata.get('title') or 'Video YouTube'
            if metadata.get('playable_in_embed') is False:
                raise ProcessingError('embed_disabled', 'Video này không cho phép phát trong ứng dụng.')
            raw, kind = [], 'manual'
            for tracks, track_kind in ((metadata.get('subtitles', {}), 'manual'),
                                       (metadata.get('automatic_captions', {}), 'asr')):
                for language, formats in tracks.items():
                    if language not in ('ja', 'ja-JP', 'ja-orig'):
                        continue
                    # Avoid machine-translated Japanese tracks from another language.
                    track = next((track for track in formats if track.get('ext') == 'json3'
                                  and 'tlang=' not in track.get('url', '')), None)
                    if track:
                        try:
                            response = requests.get(track['url'], timeout=20)
                            response.raise_for_status()
                            raw = json3_captions(response.json())
                            kind = track_kind
                        except (requests.RequestException, ValueError, TypeError):
                            raw = []
                    if raw:
                        break
                if raw:
                    break
            if not raw:
                publish_phase(directory, 'extracting', title)
                downloader.download([url])
                audio = next((path for path in Path(directory).glob('audio.*')
                              if path.is_file() and path.suffix not in ('.part', '.json', '.ytdl')), None)
                if audio is None or audio.stat().st_size > 100_000_000:
                    raise ProcessingError('audio_unavailable', 'Không lấy được audio của video.')
                publish_phase(directory, 'transcribing', title)
                raw, kind = transcribe_file(audio), 'asr'
            publish_phase(directory, 'normalizing', title)
            phrases = normalize_segments(raw, duration)
            dataset = {'schema_version': 1, 'video': {'youtube_id': video_id,
                'title': title, 'channel': metadata.get('channel') or metadata.get('uploader') or 'YouTube',
                'duration_seconds': duration}, 'caption_track': {'language': 'ja', 'kind': kind},
                'segment_count': len(phrases), 'segments': [
                    {**phrase, 'id': f'{video_id}-ja-{sequence:04d}', 'sequence': sequence}
                    for sequence, phrase in enumerate(phrases, 1)]}
            from .morphology import analyze
            cues = attach_practice_segments(display_captions(raw, duration), dataset['segments'], video_id)
            return {'dataset': dataset, 'raw_captions': raw, 'display_captions': cues,
                    'word_analysis': analyze(dataset['segments'], cues)}
    except DownloadError:
        raise ProcessingError('source_unavailable', 'Không lấy được dữ liệu YouTube. Video có thể bị hạn chế hoặc nguồn đang chặn truy cập. Hãy thử lại sau.') from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('video_id')
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    try:
        result = process_video(args.video_id, args.directory)
    except ProcessingError as error:
        result = {'error_code': error.code, 'error_message': error.message}
    except Exception:
        result = {'error_code': 'processing_failed', 'error_message': 'Không tạo được phụ đề. Hãy kiểm tra worker và thử lại.'}
    (args.directory / 'result.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
