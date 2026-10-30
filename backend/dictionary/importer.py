"""Explicit, transactional imports. No downloads or AI calls during lookup."""
import gzip
from copy import deepcopy
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone

import click
from flask.cli import with_appcontext
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from extensions import db
from .models import DictionaryEntry, DictionaryKanji, DictionarySource, DictionaryTerm
from .normalize import normalize

SOURCES = {
    'jmdict': {'name': 'JMdict', 'url': 'https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html',
               'license': 'EDRDG Dictionary Licence', 'license_url': 'https://www.edrdg.org/edrdg/licence.html'},
    'kanjidic2': {'name': 'KANJIDIC2', 'url': 'https://www.edrdg.org/kanjidic/kanjd2index.html',
                 'license': 'EDRDG Dictionary Licence', 'license_url': 'https://www.edrdg.org/edrdg/licence.html'},
    'kanjivg': {'name': 'KanjiVG — Ulrich Apel', 'url': 'https://kanjivg.tagaini.net/',
               'license': 'CC BY-SA 3.0', 'license_url': 'https://creativecommons.org/licenses/by-sa/3.0/'},
}


def upsert(model, rows, key):
    if not rows:
        return
    insert = pg_insert if db.engine.dialect.name == 'postgresql' else sqlite_insert
    statement = insert(model).values(rows)
    db.session.execute(statement.on_conflict_do_update(
        index_elements=[key], set_={name: getattr(statement.excluded, name) for name in rows[0] if name != key}))


def record_source(identifier, path, count, metadata=None):
    content = {**SOURCES.get(identifier, {}), **(metadata or {}), 'count': count,
               'imported_at': datetime.now(timezone.utc).isoformat()}
    if path:
        content.update(file_name=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    upsert(DictionarySource, [{'id': identifier, 'content': content}], 'id')


def kanji_characters(text):
    return list(dict.fromkeys(c for c in text if '\u3400' <= c <= '\u9fff' or 0x20000 <= ord(c) <= 0x323af))


def entry_terms(row):
    data = row['content']
    terms = set()
    for form in data['forms']:
        terms.add(('spelling', normalize(form['text'])))
        terms.update(('kanji', c) for c in kanji_characters(form['text']))
    for reading in data['readings']:
        terms.add(('reading', normalize(reading['text'])))
    for sense in data['senses']:
        for gloss in sense['glosses']:
            terms.add(('meaning_vi' if gloss['language'] == 'vi' else 'meaning', normalize(gloss['text'])))
    for text in data.get('han_viet', []):
        terms.add(('han_viet', normalize(text)))
    return [{'entry_id': row['id'], 'kind': kind, 'text': text} for kind, text in terms if text]


def _preserve_saved_meanings(previous, current):
    """Keep stored Vietnamese glosses when the imported English sense is unchanged."""
    def source_key(sense):
        source = {key: value for key, value in sense.items() if key != 'translation'}
        source['glosses'] = [gloss for gloss in sense['glosses'] if not gloss.get('machine')]
        return json.dumps(source, ensure_ascii=False, sort_keys=True)

    saved = {source_key(sense): sense for sense in previous.get('senses', []) if sense.get('translation')}
    for sense in current['senses']:
        old = saved.get(source_key(sense))
        if old and not any(gloss['language'] == 'vi' for gloss in sense['glosses']):
            sense['glosses'].extend(deepcopy([gloss for gloss in old['glosses'] if gloss.get('machine')]))
            sense['translation'] = deepcopy(old['translation'])


def save_entries(rows):
    identifiers = [row['id'] for row in rows if row['id'].startswith('jmdict:')]
    if identifiers:
        previous = {row.id: row.content for row in db.session.scalars(
            select(DictionaryEntry).where(DictionaryEntry.id.in_(identifiers)))}
        for row in rows:
            if row['id'] in previous:
                _preserve_saved_meanings(previous[row['id']], row['content'])
    upsert(DictionaryEntry, rows, 'id')
    db.session.execute(delete(DictionaryTerm).where(DictionaryTerm.entry_id.in_([r['id'] for r in rows])))
    terms = [term for row in rows for term in entry_terms(row)]
    # Small batches stay inside SQLite parameter limits in integration tests.
    for start in range(0, len(terms), 200):
        db.session.execute(DictionaryTerm.__table__.insert(), terms[start:start + 200])


def xml_records(path, tag):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rb') as stream:
        context = ET.iterparse(stream, events=('start', 'end'))
        _, root = next(context)
        for event, node in context:
            if event == 'end' and node.tag == tag:
                yield node
                root.clear()


def import_jmdict(path):
    count, rows = 0, []
    for node in xml_records(path, 'entry'):
        forms = [{'text': x.findtext('keb'), 'info': [n.text for n in x.findall('ke_inf')]}
                 for x in node.findall('k_ele')]
        readings = [{'text': x.findtext('reb'), 'applies_to': [n.text for n in x.findall('re_restr')],
                     'no_kanji': x.find('re_nokanji') is not None,
                     'info': [n.text for n in x.findall('re_inf')]} for x in node.findall('r_ele')]
        senses, inherited_pos = [], []
        for sense in node.findall('sense'):
            inherited_pos = [x.text for x in sense.findall('pos')] or inherited_pos
            senses.append({'parts_of_speech': inherited_pos,
                'applies_to_forms': [x.text for x in sense.findall('stagk')],
                'applies_to_readings': [x.text for x in sense.findall('stagr')],
                'glosses': [{'language': x.get('{http://www.w3.org/XML/1998/namespace}lang', 'eng'),
                             'text': x.text or ''} for x in sense.findall('gloss')],
                'notes': [x.text for x in sense.findall('s_inf')],
                'tags': [x.text for key in ('misc', 'field', 'dial') for x in sense.findall(key)]})
        if not readings or not senses:
            raise ValueError('JMdict entry is incomplete.')
        primary_form = forms[0]['text'] if forms else readings[0]['text']
        primary_reading = next((reading for reading in readings if not reading['no_kanji'] and
            (not reading['applies_to'] or primary_form in reading['applies_to'])), readings[0])
        if primary_reading['no_kanji']:
            primary_form = primary_reading['text']
        elif primary_reading['applies_to'] and primary_form not in primary_reading['applies_to']:
            primary_form = primary_reading['applies_to'][0]
        rows.append({'id': 'jmdict:' + node.findtext('ent_seq'),
            'word': primary_form, 'reading': primary_reading['text'],
            'common': any(p.text in ('ichi1', 'news1', 'spec1', 'gai1') for p in node.findall('.//ke_pri') + node.findall('.//re_pri')),
            'content': {'forms': forms or [{'text': readings[0]['text'], 'info': []}],
                        'readings': readings, 'senses': senses, 'source_id': 'jmdict', 'examples': []}})
        count += 1
        if len(rows) == 200:
            save_entries(rows)
            rows = []
    save_entries(rows)
    if not count:
        raise ValueError('Empty JMdict file.')
    record_source('jmdict', path, count)
    return count


def import_kanjidic(path):
    rows, count = [], 0
    for node in xml_records(path, 'character'):
        readings = node.findall('./reading_meaning/rmgroup/reading')
        def values(kind):
            return [unicodedata.normalize('NFC', x.text) for x in readings if x.get('r_type') == kind]
        meanings = [{'language': x.get('m_lang', 'en'), 'text': x.text}
                    for x in node.findall('./reading_meaning/rmgroup/meaning')]
        literal = node.findtext('literal')
        data = {'on': values('ja_on'), 'kun': values('ja_kun'), 'han_viet': values('vietnam'),
                'meanings': meanings, 'radicals': [int(x.text) for x in node.findall('./radical/rad_value') if x.get('rad_type') == 'classical'],
                'nanori': [x.text for x in node.findall('./reading_meaning/nanori')],
                'grade': node.findtext('./misc/grade'), 'frequency': node.findtext('./misc/freq'),
                'source_id': 'kanjidic2'}
        # Avoid calling pre-2010 KANJIDIC JLPT values modern N1–N5 levels.
        search = [literal, *data['on'], *data['kun'], *data['han_viet'], *data['nanori'],
                  *(x['text'] for x in meanings if x['language'] in ('en', 'vi'))]
        search += [x.replace('.', '').replace('-', '') for x in data['kun']]
        rows.append({'literal': literal, 'content': data, 'strokes': int(node.findtext('./misc/stroke_count')),
                     'search_text': '\n'.join(normalize(x) for x in search)})
        count += 1
        if len(rows) == 200:
            _save_kanji(rows)
            rows = []
    _save_kanji(rows)
    if not count:
        raise ValueError('Empty KANJIDIC file.')
    record_source('kanjidic2', path, count)
    return count


def _save_kanji(rows):
    # Preserve installed diagrams when metadata is refreshed.
    existing = {x.literal: x.content.get('stroke_paths') for x in db.session.scalars(
        select(DictionaryKanji).where(DictionaryKanji.literal.in_([r['literal'] for r in rows])))} if rows else {}
    for row in rows:
        if existing.get(row['literal']):
            row['content']['stroke_paths'] = existing[row['literal']]
    upsert(DictionaryKanji, rows, 'literal')


def import_kanjivg(path):
    count = 0
    # Store only path geometry: no executable SVG, network URLs, or arbitrary markup.
    for node in xml_records(path, 'kanji'):
        identifier = node.get('id', '').split('_')[-1]
        if not re.fullmatch('[0-9a-fA-F]{4,6}', identifier):
            continue
        row = db.session.get(DictionaryKanji, chr(int(identifier, 16)))
        if row is None:
            continue
        paths = [x.get('d') for x in node.iter() if x.tag.split('}')[-1] == 'path'
                 and x.get('d') and re.fullmatch(r'[MmZzLlHhVvCcSsQqTtAaEe0-9.,+\s-]+', x.get('d'))]
        if paths:
            row.content = {**row.content, 'stroke_paths': paths}
            count += 1
    if not count:
        raise ValueError('No KanjiVG diagrams matched. Import KANJIDIC2 first.')
    record_source('kanjivg', path, count)
    return count


def import_vocabulary():
    """A separate Vietnamese reference layer, never guessed alignment to JMdict senses."""
    from vocabulary.models import VocabularyWord, VocabularyLesson, VocabularyTextbook
    groups = {}
    for word, lesson, book in db.session.execute(select(VocabularyWord, VocabularyLesson, VocabularyTextbook)
            .join(VocabularyLesson, VocabularyWord.lesson_id == VocabularyLesson.id)
            .join(VocabularyTextbook, VocabularyLesson.textbook_id == VocabularyTextbook.id)
            .order_by(VocabularyWord.id)):
        signature = word.word + '\0' + normalize(word.reading)
        row = groups.setdefault(signature, {'id': 'local:' + hashlib.sha256(signature.encode()).hexdigest()[:32],
            'word': word.word, 'reading': word.reading, 'common': False,
            'content': {'forms': [{'text': word.word, 'info': []}],
                        'readings': [{'text': word.reading, 'applies_to': [], 'no_kanji': False, 'info': []}] if word.reading else [],
                        'senses': [], 'examples': [], 'han_viet': [], 'references': [], 'source_id': 'local'}})
        data = row['content']
        sense = {'parts_of_speech': [], 'glosses': [{'language': 'vi', 'text': word.meaning_vi}],
                 'notes': [], 'tags': [], 'reference_id': word.id}
        # Each source meaning stays separately attributed, even if wording matches.
        data['senses'].append(sense)
        data['references'].append({'word_id': word.id, 'title': book.title,
            'url': lesson.source_url or book.source_url, 'level': book.level,
            'quality': 'Nội dung nguồn chưa hiệu đính', 'source': word.details.get('source', {})})
        for example in word.details.get('examples', []):
            if example not in data['examples']:
                data['examples'].append(example)
        if word.han_viet and word.han_viet not in data['han_viet']:
            data['han_viet'].append(word.han_viet)
    rows = list(groups.values())
    for start in range(0, len(rows), 100):
        save_entries(rows[start:start + 100])
    record_source('local', None, len(rows), {'name': 'Kho từ vựng NihonGO',
        'url': '', 'license': 'Theo từng nguồn giáo trình; xem xuất xứ ở mục từ',
        'license_url': '', 'notes': 'Dữ liệu sẵn có của dự án, chưa hiệu đính; không khẳng định có giấy phép phân phối công khai.'})
    return len(rows)


@click.command('dictionary-import')
@click.option('--jmdict', type=click.Path(exists=True, path_type=Path))
@click.option('--kanjidic', type=click.Path(exists=True, path_type=Path))
@click.option('--kanjivg', type=click.Path(exists=True, path_type=Path))
@click.option('--vietnamese', type=click.Path(exists=True, path_type=Path), help='Vietnamese Wiktionary raw JSONL or JSONL.gz from Kaikki.')
@click.option('--vocabulary', is_flag=True, help='Legacy lesson reference import; excluded from dictionary lookup.')
@with_appcontext
def import_command(jmdict, kanjidic, kanjivg, vietnamese, vocabulary):
    from .vietnamese import import_vietnamese
    if not any((jmdict, kanjidic, kanjivg, vietnamese, vocabulary)):
        raise click.UsageError('Chọn --jmdict, --kanjidic, --kanjivg, --vietnamese hoặc --vocabulary.')
    try:
        for name, path, importer in [('JMdict', jmdict, import_jmdict),
                                     ('KANJIDIC2', kanjidic, import_kanjidic), ('KanjiVG', kanjivg, import_kanjivg),
                                     ('Nhật–Việt', vietnamese, import_vietnamese)]:
            if path:
                click.echo(f'{name}: {importer(path)} mục.')
        if vocabulary:
            click.echo(f'Từ vựng tiếng Việt: {import_vocabulary()} mục.')
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        raise click.ClickException(f'Không nhập được từ điển ({type(error).__name__}). Không lưu thay đổi.') from error
