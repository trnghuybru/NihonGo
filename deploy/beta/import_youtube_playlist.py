"""Resumable operator import: public Japanese captions only; no AI or user quota."""
import argparse
from collections import Counter
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import time
import tempfile


def save(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--max-imports', type=int, default=100)
    parser.add_argument('--max-seconds', type=int, default=1800)
    parser.add_argument('--delay', type=float, default=8)
    args = parser.parse_args()
    if args.max_imports < 1 or args.max_seconds < 1 or args.delay < 0:
        parser.error('Invalid limits')
    listing = json.loads(args.manifest.read_text(encoding='utf-8'))
    args.output.mkdir(parents=True, exist_ok=True)
    report_file = args.output / 'report.json'
    report = json.loads(report_file.read_text()) if report_file.exists() else {
        'playlist_id': listing['id'], 'playlist_title': listing.get('title'),
        'max_seconds_exclusive': args.max_seconds, 'target_new_videos': args.max_imports,
        'results': {}, 'status': 'running',
    }
    if report['playlist_id'] != listing['id'] or report['max_seconds_exclusive'] != args.max_seconds:
        raise SystemExit('Report does not match requested playlist/filter')
    report['target_new_videos'] = args.max_imports
    report['status'] = 'running'
    report.pop('stop_reason', None)

    def checkpoint():
        report['counts'] = dict(Counter(row['status'] for row in report['results'].values()))
        report['updated_at'] = datetime.now(timezone.utc).isoformat()
        save(report_file, report)

    from app import app
    from extensions import db
    from sqlalchemy import select
    from shadowing.models import ShadowingJob
    from shadowing.processor import process_video, ProcessingError
    from video_examples.models import ExampleVideo, CaptionSegment
    from video_examples.playlist import persist_dataset, ensure_ready_job

    # The limit affects only this isolated importer, not the interactive worker.
    os.environ['SHADOWING_MAX_SECONDS'] = str(args.max_seconds)
    checkpoint()
    with app.app_context():
        for position, entry in enumerate(listing['entries'], 1):
            imported = sum(row['status'] == 'imported' for row in report['results'].values())
            if imported >= args.max_imports:
                report['status'] = 'complete'
                report['stop_reason'] = 'target_reached'
                break
            video_id = entry['id']
            if video_id in report['results']:
                continue
            duration = entry.get('duration')
            result = {'position': position, 'title': entry.get('title'), 'duration_seconds': duration}
            if isinstance(duration, (int, float)) and duration >= args.max_seconds:
                result.update(status='skipped', reason='duration_not_under_limit')
            else:
                video = db.session.get(ExampleVideo, video_id)
                job = db.session.scalar(select(ShadowingJob).where(ShadowingJob.video_id == video_id))
                has_captions = video and db.session.scalar(select(CaptionSegment.id).where(
                    CaptionSegment.video_id == video_id).limit(1))
                if job and job.status in ('queued', 'extracting', 'transcribing', 'normalizing'):
                    result.update(status='skipped', reason='active_job')
                elif has_captions:
                    if video.duration_seconds < args.max_seconds:
                        ensure_ready_job(video)
                        db.session.commit()
                        result.update(status='imported' if (args.output / f'{video_id}.ja.json').exists() else 'existing')
                    else:
                        result.update(status='skipped', reason='duration_not_under_limit')
                else:
                    db.session.rollback()  # No database transaction during YouTube I/O.
                    report['current_video'] = video_id
                    checkpoint()
                    try:
                        # Provider logs can contain signed URLs. Retain only public summary/status.
                        with tempfile.TemporaryDirectory(prefix='nihongo-playlist-') as directory, \
                                redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
                            output = process_video(video_id, directory)
                        dataset = output['dataset']
                        actual_duration = dataset['video']['duration_seconds']
                        if not 0 < actual_duration < args.max_seconds:
                            result.update(status='skipped', reason='duration_not_under_limit')
                        else:
                            dataset.update(raw_captions=output['raw_captions'],
                                display_captions=output['display_captions'],
                                source_playlist=listing['id'])
                            # Save a restartable public caption snapshot before the atomic import.
                            save(args.output / f'{video_id}.ja.json', dataset)
                            persist_dataset(dataset)
                            result.update(status='imported', duration_seconds=actual_duration,
                                segments=dataset['segment_count'], kind=dataset['caption_track']['kind'])
                    except ProcessingError as error:
                        db.session.rollback()
                        if error.code in ('source_blocked', 'source_configuration'):
                            report.update(status='paused', stop_reason=error.code)
                            checkpoint()
                            print(json.dumps({'status': 'paused', 'reason': error.code, 'counts': report['counts']}), flush=True)
                            return 2
                        result.update(status='skipped', reason=error.code)
                    except Exception as error:
                        db.session.rollback()
                        result.update(status='error', reason=type(error).__name__)
                    finally:
                        report.pop('current_video', None)
                    if args.delay:
                        time.sleep(args.delay)
            report['results'][video_id] = result
            checkpoint()
            print(json.dumps({'position': position, 'video_id': video_id,
                'status': result['status'], 'reason': result.get('reason'),
                'counts': report['counts']}, ensure_ascii=False), flush=True)
        else:
            report.update(status='complete', stop_reason='playlist_exhausted')
    checkpoint()
    print(json.dumps({'status': report['status'], 'counts': report['counts'],
                      'stop_reason': report.get('stop_reason')}, ensure_ascii=False), flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
