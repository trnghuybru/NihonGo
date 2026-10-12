"""Rebuild local caption snapshots from preserved source timestamps, without downloads."""
import click
from flask.cli import with_appcontext
from sqlalchemy import select

from extensions import db
from video_examples.importer import import_dataset
from video_examples.models import CaptionSegment, ExampleVideo
from .models import ShadowingJob
from .processor import normalize_segments, display_captions, attach_practice_segments


def rebuild_saved_captions():
    updated = 0
    for job in db.session.scalars(select(ShadowingJob).where(ShadowingJob.status == 'ready').with_for_update()):
        video = db.session.get(ExampleVideo, job.video_id)
        if not video:
            continue
        if job.raw_captions:
            phrases = normalize_segments(job.raw_captions, video.duration_seconds)
            segments = [{**phrase, 'id': f'{video.id}-ja-{sequence:04d}', 'sequence': sequence}
                        for sequence, phrase in enumerate(phrases, 1)]
            import_dataset({'schema_version': 1, 'video': {'youtube_id': video.id,
                'title': video.title, 'channel': video.channel, 'duration_seconds': video.duration_seconds},
                'caption_track': {'language': 'ja', 'kind': video.caption_kind},
                'segment_count': len(segments), 'segments': segments}, commit=False)
        else:
            rows = db.session.scalars(select(CaptionSegment).where(CaptionSegment.video_id == video.id)
                                      .order_by(CaptionSegment.sequence)).all()
            segments = [{'id': row.id, 'text': row.text, 'start_seconds': row.start_seconds,
                         'end_seconds': row.end_seconds} for row in rows]
        if not segments:
            continue
        job.display_captions = attach_practice_segments(
            display_captions(job.raw_captions or segments, video.duration_seconds), segments, video.id)
        job.word_analysis = None
        updated += 1
    db.session.commit()
    return updated


@click.command('shadowing-rebuild-captions')
@with_appcontext
def rebuild_command():
    """Refresh display cues/practice phrases using local raw captions only."""
    try:
        count = rebuild_saved_captions()
    except Exception as error:
        db.session.rollback()
        raise click.ClickException('Không cập nhật được phụ đề. Kiểm tra migration và dữ liệu nguồn.') from error
    click.echo(f'Đã cập nhật phụ đề cho {count} video.')
