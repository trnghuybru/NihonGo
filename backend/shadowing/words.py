"""Cached Japanese morphology and exact, batched lookup in the existing word bank."""

import json
import time
import click
from flask.cli import with_appcontext
from sqlalchemy import select

from extensions import db
from vocabulary.models import VocabularyWord, VocabularyLesson, VocabularyTextbook
from .models import ShadowingJob

from .morphology import analyze, fingerprint, hiragana


def cached_analysis(job, segments, captions):
    analysis = job.word_analysis
    if not analysis or analysis.get('fingerprint') != fingerprint(segments, captions):
        analysis = analyze(segments, captions)
        job.word_analysis = analysis
        db.session.commit()
    return analysis


def dictionary_entries(bank):
    terms = sorted({form for word in bank.values() for form in
                    (word['surface'], word['lemma'], word['normalized']) if form})
    candidates = {}
    for offset in range(0, len(terms), 500):
        rows = db.session.execute(select(VocabularyWord, VocabularyTextbook.level)
            .join(VocabularyLesson, VocabularyWord.lesson_id == VocabularyLesson.id)
            .join(VocabularyTextbook, VocabularyLesson.textbook_id == VocabularyTextbook.id)
            .where(VocabularyWord.word.in_(terms[offset:offset + 500]))).all()
        for entry, level in rows:
            candidates.setdefault(entry.word, []).append({'id': entry.id, 'word': entry.word,
                'reading': entry.reading, 'meaning_vi': entry.meaning_vi, 'level': level})
    result = {}
    for key, word in bank.items():
        matches = [entry for form in dict.fromkeys((word['surface'], word['lemma'], word['normalized']))
                   for entry in candidates.get(form, [])]
        expected = word['lemma_reading'] if word['surface'] != word['lemma'] else word['reading']
        # Readings discriminate homographs. Keep all available senses of a reading.
        same_reading = [entry for entry in matches if hiragana(entry['reading']) == expected]
        if same_reading:
            matches = same_reading
        elif expected and any(entry['reading'] for entry in matches):
            matches = []  # Do not choose an unrelated pronunciation by guessing.
        seen, entries = set(), []
        for entry in sorted(matches, key=lambda row: (row['word'] != word['lemma'], row['level'], row['id'])):
            identity = (hiragana(entry['reading']), entry['meaning_vi'])
            if identity not in seen:
                entries.append(entry)
                seen.add(identity)
        result[key] = {name: word[name] for name in ('surface', 'lemma', 'reading', 'pos')}
        result[key]['entries'] = entries[:4]
    return result


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
            words = dictionary_entries(analysis['words'])
            payload = {'tokens': {'segments': analysis['segments'], 'captions': analysis['captions']}, 'words': words}
            size = len(current_app.json.dumps(payload).encode())
            matched = sum(bool(word['entries']) for word in words.values())
            click.echo(f'{job.video_id}: {len(words)} từ / {matched} có nghĩa; {size // 1024} KiB; lookup {(time.perf_counter() - started) * 1000:.1f} ms')
        count += 1
    click.echo(f'Đã chuẩn bị tra từ cho {count} video.')
