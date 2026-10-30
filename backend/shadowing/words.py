"""Cached subtitle morphology; meanings are loaded on demand from the dictionary API."""

import time
import click
from flask.cli import with_appcontext
from sqlalchemy import select

from extensions import db
from .models import ShadowingJob

from .morphology import analyze, fingerprint


def cached_analysis(job, segments, captions):
    analysis = job.word_analysis
    if not analysis or analysis.get('fingerprint') != fingerprint(segments, captions):
        analysis = analyze(segments, captions)
        job.word_analysis = analysis
        db.session.commit()
    return analysis


def lookup_words(bank):
    # Only token metadata belongs in the lesson response. Never mix lesson glosses
    # into dictionary lookup or prefetch every definition before a word is tapped.
    return {key: {name: word[name] for name in ('surface', 'lemma', 'reading', 'pos')}
            for key, word in bank.items()}


@click.command('shadowing-prepare-words')
@click.option('--stats', is_flag=True, help='Show local lookup size and timing.')
@with_appcontext
def prepare_command(stats):
    from video_examples.models import CaptionSegment, ExampleVideo
    from .processor import display_captions, attach_practice_segments
    count = 0
    for job in db.session.scalars(select(ShadowingJob).where(ShadowingJob.status == 'ready')):
        video = db.session.get(ExampleVideo, job.video_id)
        rows = db.session.scalars(select(CaptionSegment).where(CaptionSegment.video_id == job.video_id)
                                  .order_by(CaptionSegment.sequence)).all()
        if not video or not rows:
            continue
        segments = [{'id': row.id, 'text': row.text, 'start_seconds': row.start_seconds, 'end_seconds': row.end_seconds} for row in rows]
        cues = job.display_captions or attach_practice_segments(display_captions(job.raw_captions or segments, video.duration_seconds), segments, job.video_id)
        analysis = cached_analysis(job, segments, cues)
        if stats:
            from flask import current_app
            started = time.perf_counter()
            words = lookup_words(analysis['words'])
            payload = {'tokens': {'segments': analysis['segments'], 'captions': analysis['captions']}, 'words': words}
            size = len(current_app.json.dumps(payload).encode())
            click.echo(f'{job.video_id}: {len(words)} từ tra cứu; {size // 1024} KiB; metadata {(time.perf_counter() - started) * 1000:.1f} ms')
        count += 1
    click.echo(f'Đã chuẩn bị tra từ cho {count} video.')
