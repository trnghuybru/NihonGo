"""Extract the supplied Mimi kara N1 Anki deck without executing card templates."""
import argparse
import hashlib
import json
import re
import sqlite3
import tempfile
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

if __package__:
    from .extract_n4_anki import plain_text
else:
    from extract_n4_anki import plain_text

FIELDS = ('Front', 'Back', 'audio', 'KATAKANA', 'Example', "Example's meaning", 'Hán việt')
BOOK_ID = 'mimikara-n1'


def extract_dataset(package):
    package = Path(package)
    checksum = hashlib.sha256(package.read_bytes()).hexdigest()
    source = {'kind': 'user_supplied_anki', 'file_name': package.name, 'sha256': checksum}
    source_url = f'urn:sha256:{checksum}'
    with zipfile.ZipFile(package) as archive, tempfile.TemporaryDirectory() as directory:
        member = next((name for name in ('collection.anki21', 'collection.anki2')
                       if name in archive.namelist()), None)
        if member is None:
            raise ValueError('No supported SQLite collection in package.')
        media = json.loads(archive.read('media')) if 'media' in archive.namelist() else {}
        media_members = {filename: key for key, filename in media.items()}
        archive_names = set(archive.namelist())
        database = Path(directory) / 'collection.sqlite'
        database.write_bytes(archive.read(member))
        connection = sqlite3.connect(f'{database.as_uri()}?mode=ro', uri=True)
        try:
            models_json, decks_json = connection.execute('SELECT models, decks FROM col').fetchone()
            models, decks = json.loads(models_json), json.loads(decks_json)
            notes = connection.execute('SELECT id, mid, tags, flds FROM notes ORDER BY id').fetchall()
            cards = connection.execute('SELECT nid, did FROM cards').fetchall()
        finally:
            connection.close()
    memberships = {}
    for note_id, deck_id in cards:
        memberships.setdefault(note_id, set()).add(str(deck_id))
    words, warnings = [], []
    for number, (note_id, model_id, tags, raw) in enumerate(notes, 1):
        names = [field['name'] for field in models[str(model_id)]['flds']]
        values = raw.split('\x1f')
        if len(names) != len(values) or not set(FIELDS).issubset(names):
            raise ValueError(f'Unexpected fields on note {note_id}.')
        fields = dict(zip(names, values))
        deck_ids = memberships.get(note_id, set())
        if len(deck_ids) != 1:
            raise ValueError(f'Expected one source deck for note {note_id}.')
        deck_id = next(iter(deck_ids))
        word, reading = plain_text(fields['Back'], True), plain_text(fields['KATAKANA'], True)
        meaning = plain_text(fields['Front'])
        sentence, translation = plain_text(fields['Example'], True), plain_text(fields["Example's meaning"])
        if not all((word, reading, meaning, sentence, translation)):
            raise ValueError(f'Missing required content on note {note_id}.')
        audio_files = re.findall(r'\[sound:([^\]]+)\]', fields['audio'])
        audio = [{'file_name': filename, 'archive_member': media_members.get(filename),
                  'present_in_package': media_members.get(filename) in archive_names}
                 for filename in audio_files]
        for item in audio:
            if not item['present_in_package']:
                warnings.append({'note_id': note_id, 'field': 'audio', 'reason': 'missing_media',
                                 'file_name': item['file_name']})
        han_viet = plain_text(fields['Hán việt'])
        words.append({
            'id': f'{BOOK_ID}-note-{note_id}', 'number': number,
            'word': word, 'reading': reading, 'meaning_vi': meaning,
            'han_viet': han_viet if han_viet not in ('', '—', '-') else None,
            'segments': [{'text': word, 'reading': reading if reading != word else None}],
            'examples': [{'japanese': sentence, 'reading': '', 'meaning_vi': translation,
                          'segments': [{'text': sentence, 'reading': None}]}],
            'related': [], 'source': {**source, 'note_id': note_id, 'deck_id': deck_id,
                'deck_name': decks[deck_id]['name'], 'tags': tags.split(), 'audio': audio},
        })
    if not words:
        raise ValueError('Empty collection.')
    lessons = []
    for offset in range(0, len(words), 25):
        number = offset // 25 + 1
        lessons.append({'id': f'{BOOK_ID}-u01-l{number:02d}', 'unit_number': 1,
                        'unit_title': 'Từ vựng', 'lesson_number': number, 'title': f'Bài {number}',
                        'source_url': source_url, 'audio_urls': [], 'words': words[offset:offset + 25]})
    duplicates = Counter((word['word'], word['reading']) for word in words)
    warnings.extend({'word': word, 'reading': reading, 'count': count,
                     'reason': 'repeated_source_notes_preserved'}
                    for (word, reading), count in duplicates.items() if count > 1)
    return {'schema_version': 1, 'assembled_at': datetime.now(timezone.utc).isoformat(),
            'textbook': {'id': BOOK_ID, 'title': 'Mimi kara oboeru N1', 'jlpt_level': 'N1',
                         'source_url': source_url}, 'sources': [source],
            'units': [{'number': 1, 'title': 'Từ vựng', 'lessons': lessons}],
            'counts': {'units': 1, 'lessons': len(lessons), 'words': len(words),
                       'examples': len(words), 'related': 0},
            'coverage': {'complete': True, 'source_notes': len(notes), 'imported_notes': len(words)},
            'quality_warnings': warnings,
            'source_review': {'proofread': False, 'order': 'ascending Anki note ID',
                'note': 'Source text retained; HTML removed. App groups of 25 notes are not textbook chapters. Source deck name contains N2; level N1 follows the user-provided package designation.'}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apkg', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data/vocabulary/mimikara-n1.json')
    args = parser.parse_args()
    dataset = extract_dataset(args.apkg)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(args.output)
    print(f'Saved {args.output}: {dataset["counts"]}')


if __name__ == '__main__':
    main()
