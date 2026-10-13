"""Import public Japanese captions from a playlist; never download audio or run ASR."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
from urllib.parse import parse_qs, urlparse
import uuid

from sqlalchemy import select

from extensions import db
from shadowing.models import ShadowingJob
from shadowing.processor import normalize_segments, display_captions, attach_practice_segments
from .importer import import_dataset, positive_number
from .models import CaptionSegment, ExampleVideo

LANGUAGES = ('ja', 'ja-JP', 'ja-orig')


def playlist_id(value):
    parsed = urlparse(value)
    if parsed.scheme != 'https' or parsed.hostname not in ('youtube.com', 'www.youtube.com'):
        raise ValueError('Cần URL playlist YouTube HTTPS.')
    identifier = parse_qs(parsed.query).get('list', [''])[0]
    if not re.fullmatch(r'[A-Za-z0-9_-]{10,100}', identifier):
        raise ValueError('URL chưa có ID playlist hợp lệ.')
    return identifier


def select_track(tracks, manual_only=False):
    native = [track for track in tracks if track.language_code in LANGUAGES
              and 'tlang' not in parse_qs(urlparse(getattr(track, '_url', '')).query)]
    manual = [track for track in native if not track.is_generated]
    return next(iter(manual or ([] if manual_only else native)), None)


def caption_dataset(entry, snippets, kind, playlist_url):
    duration = entry.get('duration')
    if not positive_number(duration):
        raise ValueError('Thiếu thời lượng video.')
    raw = [{'text': snippet.text, 'start_seconds': snippet.start,
            'end_seconds': snippet.start + snippet.duration} for snippet in snippets]
    phrases = normalize_segments(raw, duration)
    identifier = entry['id']
    dataset = {'schema_version': 1,
        'video': {'youtube_id': identifier, 'title': entry['title'],
                  'channel': entry.get('channel') or 'YouTube', 'duration_seconds': duration},
        'caption_track': {'language': 'ja', 'kind': kind,
                          'source': 'youtube_automatic' if kind == 'asr' else 'youtube_manual'},
        'source_playlist': playlist_url, 'fetched_at': datetime.now(timezone.utc).isoformat(),
        'segment_count': len(phrases), 'segments': [
            {**phrase, 'id': f'{identifier}-ja-{sequence:04d}', 'sequence': sequence}
            for sequence, phrase in enumerate(phrases, 1)], 'raw_captions': raw}
    dataset['display_captions'] = attach_practice_segments(
        display_captions(raw, duration), dataset['segments'], identifier)
    return dataset


def ensure_ready_job(video, dataset=None):
    job = db.session.scalar(select(ShadowingJob).where(ShadowingJob.video_id == video.id).with_for_update())
    if job and job.status in ('queued', 'extracting', 'transcribing', 'normalizing'):
        raise ValueError('Video đang có job xử lý; giữ nguyên job hiện tại.')
    now = int(time.time())
    if job is None:
        job = ShadowingJob(id=str(uuid.uuid4()), video_id=video.id, created_at=now, updated_at=now)
        db.session.add(job)
    job.status, job.title = 'ready', video.title
    job.error_code = job.error_message = job.lease_token = job.lease_expires_at = None
    if dataset:
        job.raw_captions = dataset['raw_captions']
        job.display_captions = dataset['display_captions']
        job.word_analysis = None
        job.updated_at = now
    return job


def persist_dataset(dataset):
    identifier = dataset['video']['youtube_id']
    # Validate/import and create the ready catalog entry in the same transaction.
    import_dataset(dataset, commit=False)
    ensure_ready_job(db.session.get(ExampleVideo, identifier), dataset)
    db.session.commit()


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def import_playlist(url, output, manifest=None, manual_only=False, limit=None, delay=0.5, max_imports=None):
    from yt_dlp import YoutubeDL
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import RequestBlocked, IpBlocked
    from requests import Session

    identifier = playlist_id(url)
    canonical = f'https://www.youtube.com/playlist?list={identifier}'
    options = {'quiet': True, 'no_warnings': True, 'extract_flat': True, 'skip_download': True,
               'socket_timeout': 20, 'retries': 1, 'cachedir': False}
    if manifest:
        listing = json.loads(manifest.read_text(encoding='utf-8'))
        if listing['id'] != identifier:
            raise ValueError('Manifest không khớp playlist.')
    else:
        with YoutubeDL(options) as downloader:
            metadata = downloader.extract_info(canonical, download=False)
        listing = {'id': identifier, 'title': metadata['title'], 'entries': [
            {key: entry.get(key) for key in ('id', 'title', 'duration', 'channel', 'availability')}
            for entry in metadata['entries'] if entry]}
    save_json(output / 'playlist.json', listing)
    report_path = output / 'report.json'
    report = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {
        'playlist_id': identifier, 'title': listing['title'], 'url': canonical, 'results': {}}
    if report['playlist_id'] != identifier:
        raise ValueError('Thư mục output thuộc playlist khác.')
    counters = Counter()
    report.pop('stopped_reason', None)
    report.pop('blocked_video_id', None)
    with Session() as session:
        original_request = session.request
        session.request = lambda *args, **kwargs: original_request(*args, **{**kwargs, 'timeout': (5, 20)})
        api = YouTubeTranscriptApi(http_client=session)
        for position, entry in enumerate(listing['entries'], 1):
            if max_imports is not None and counters['imported'] + counters['existing'] >= max_imports:
                break
            if limit is not None and sum(counters.values()) >= limit:
                break
            video_id = entry['id']
            if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id or ''):
                continue
            cached = report['results'].get(video_id, {})
            video = db.session.get(ExampleVideo, video_id)
            exists = video and db.session.scalar(select(CaptionSegment.id).where(
                CaptionSegment.video_id == video_id).limit(1))
            if exists and (not manual_only or video.caption_kind == 'manual'):
                try:
                    ensure_ready_job(video)
                    db.session.commit()
                    result = ({**cached} if cached.get('status') == 'imported' else
                              {'status': 'existing', 'kind': video.caption_kind})
                except ValueError:
                    db.session.rollback()
                    result = {'status': 'skipped', 'reason': 'active_job'}
            elif cached.get('status') == 'skipped':
                continue
            elif not entry.get('title'):
                result = {'status': 'skipped', 'reason': 'unavailable_metadata'}
            else:
                db.session.rollback()  # Never hold a DB transaction during network I/O.
                snapshot = output / f'{video_id}.ja.json'
                try:
                    if snapshot.exists():
                        dataset = json.loads(snapshot.read_text(encoding='utf-8'))
                        if manual_only and dataset['caption_track']['kind'] != 'manual':
                            raise ValueError('Snapshot không phải phụ đề của kênh.')
                    else:
                        tracks = list(api.list(video_id))
                        track = select_track(tracks, manual_only)
                        if track is None:
                            result = {'status': 'skipped', 'reason': 'no_native_japanese_captions'}
                            dataset = None
                        else:
                            if not positive_number(entry.get('duration')):
                                with YoutubeDL({**options, 'extract_flat': False,
                                                'ignore_no_formats_error': True, 'js_runtimes': {'node': {}}}) as downloader:
                                    info = downloader.extract_info(f'https://www.youtube.com/watch?v={video_id}', download=False)
                                entry = {**entry, 'duration': info['duration']}
                            dataset = caption_dataset(entry, track.fetch(),
                                'asr' if track.is_generated else 'manual', canonical)
                            save_json(snapshot, dataset)
                    if dataset:
                        persist_dataset(dataset)
                        result = {'status': 'imported', 'kind': dataset['caption_track']['kind'],
                                  'segments': dataset['segment_count']}
                except (RequestBlocked, IpBlocked):
                    db.session.rollback()
                    report['stopped_reason'] = 'youtube_request_blocked'
                    report['blocked_video_id'] = video_id
                    save_json(report_path, report)
                    print('STOP: YouTube blocked caption requests; saved progress, no ASR fallback.', flush=True)
                    break
                except Exception as error:
                    db.session.rollback()
                    # Store only the class name, never provider URLs or credentials.
                    reason = type(error).__name__
                    status = 'skipped' if reason in ('TranscriptsDisabled', 'VideoUnavailable',
                        'VideoUnplayable', 'AgeRestricted', 'InvalidVideoId') else 'error'
                    result = {'status': status, 'reason': reason}
                if delay:
                    time.sleep(delay)
            counters[result['status']] += 1
            report['results'][video_id] = {**result, 'position': position, 'title': entry.get('title')}
            report['counts'] = dict(Counter(item['status'] for item in report['results'].values()))
            report['updated_at'] = datetime.now(timezone.utc).isoformat()
            save_json(report_path, report)
            print(f"[{position}/{len(listing['entries'])}] {video_id} {result['status']} {result.get('kind', result.get('reason', ''))}", flush=True)
    print(json.dumps({'counts': report.get('counts', {}), 'stopped_reason': report.get('stopped_reason')}, ensure_ascii=False), flush=True)
    report['processed_videos'] = len(report['results'])
    report['playlist_videos'] = len(listing['entries'])
    report['complete'] = len(report['results']) == len(listing['entries']) and not report.get('stopped_reason')
    save_json(report_path, report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--manual-only', action='store_true')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--max-imports', type=int, help='Stop after this many eligible videos, excluding skips/errors.')
    parser.add_argument('--delay', type=float, default=0.5)
    args = parser.parse_args()
    from app import app
    with app.app_context():
        report = import_playlist(args.url, args.output, args.manifest, args.manual_only, args.limit, args.delay, args.max_imports)
        if report.get('stopped_reason'):
            raise SystemExit(2)


if __name__ == '__main__':
    main()
