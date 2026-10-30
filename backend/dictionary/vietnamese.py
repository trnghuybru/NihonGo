"""Japanese definitions from Vietnamese Wiktionary, extracted by Wiktextract."""
import gzip
import hashlib
import json
import re
from urllib.parse import quote

from sqlalchemy import select

from extensions import db
from .models import DictionaryEntry


def kana(value):
    return bool(value) and bool(re.fullmatch(r'[ぁ-ゖァ-ヺー・\s]+', value))


def ruby_reading(word, ruby):
    """Replace annotated fragments while retaining unannotated okurigana."""
    result, offset = '', 0
    for base, reading in ruby:
        position = word.find(base, offset)
        if position < 0 or not kana(reading):
            return None
        result += word[offset:position] + reading
        offset = position + len(base)
    result += word[offset:]
    return result if kana(result) else None


def import_vietnamese(path):
    # Only borrow a reading when the exact JMdict headword is unambiguous.
    # Vietnamese senses remain independent; never attach translations to guessed senses.
    from .importer import record_source, save_entries
    known = {}
    for word, reading, common in db.session.execute(select(
            DictionaryEntry.word, DictionaryEntry.reading, DictionaryEntry.common
    ).where(DictionaryEntry.id.like('jmdict:%'))):
        item = known.setdefault(word, {'readings': set(), 'common': False})
        item['readings'].add(reading)
        item['common'] |= common

    groups = {}
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf-8') as stream:
        for line in stream:
            if not line.strip():
                continue
            data = json.loads(line)
            word = data.get('word', '').strip()
            if data.get('lang_code') != 'ja' or data.get('pos') == 'romanization' or not word:
                continue
            # Old romanized headwords are not Japanese spelling entries.
            if not re.search(r'[ぁ-ヺ㐀-鿿\U00020000-\U000323af]', word):
                continue
            senses = []
            for sense in data.get('senses', []):
                glosses = [text.strip() for text in sense.get('glosses', []) if text.strip()]
                if not glosses or 'no-gloss' in sense.get('tags', []):
                    continue
                senses.append({'parts_of_speech': [data.get('pos_title') or data.get('pos', '')],
                    'glosses': [{'language': 'vi', 'text': text} for text in glosses],
                    'applies_to_forms': [], 'applies_to_readings': [], 'notes': [],
                    'tags': sense.get('tags', [])})
            if not senses:
                continue
            group = groups.setdefault(word, {'senses': [], 'readings': [], 'examples': []})
            readings = []
            for form in data.get('forms', []):
                text = form.get('form', '')
                if text == word and form.get('ruby'):
                    readings.append(ruby_reading(word, form['ruby']))
                elif kana(text):
                    # Inflected forms are not headword readings.
                    if not set(form.get('tags', [])) - {'canonical', 'hiragana', 'katakana'}:
                        readings.append(text)
            readings += [sound.get('other') for sound in data.get('sounds', []) if kana(sound.get('other'))]
            if kana(word):
                readings.append(word)
            readings = list(dict.fromkeys(text for text in readings if text))
            for sense in senses:
                sense['applies_to_readings'] = readings
                if sense not in group['senses']:
                    group['senses'].append(sense)
            group['readings'] = list(dict.fromkeys(group['readings'] + readings))
            for sense in data.get('senses', []):
                for example in sense.get('examples', []):
                    if example.get('text'):
                        item = {'japanese': example['text']}
                        if example.get('translation'):
                            item['meaning_vi'] = example['translation']
                        if item not in group['examples']:
                            group['examples'].append(item)

    if not groups:
        raise ValueError('No Japanese definitions found in Vietnamese Wiktionary file.')
    rows = []
    for word, group in groups.items():
        reference = known.get(word, {})
        readings = group['readings']
        if not readings and len(reference.get('readings', [])) == 1:
            readings = list(reference['readings'])
        # A stable headword ID groups POS sections without duplicating entries on refresh.
        rows.append({'id': 'viwiktionary:' + hashlib.sha256(word.encode()).hexdigest()[:32],
            'word': word, 'reading': readings[0] if readings else '', 'common': reference.get('common', False),
            'content': {'forms': [{'text': word, 'info': []}],
                'readings': [{'text': text, 'applies_to': [], 'info': [], 'no_kanji': False} for text in readings],
                'senses': group['senses'], 'examples': group['examples'], 'source_id': 'viwiktionary',
                'source_url': 'https://vi.wiktionary.org/wiki/' + quote(word, safe='') + '#Tiếng_Nhật'}})
        if len(rows) == 100:
            save_entries(rows)
            rows = []
    save_entries(rows)
    record_source('viwiktionary', path, len(groups), {
        'name': 'Wiktionary tiếng Việt — cộng đồng đóng góp; bản trích xuất Kaikki/Wiktextract',
        'url': 'https://kaikki.org/viwiktionary/',
        'license': 'CC BY-SA 4.0 và GFDL (theo điều khoản Wiktionary)',
        'license_url': 'https://vi.wiktionary.org/wiki/Wiktionary:Bản_quyền',
        'notes': 'Chỉ nhập mục tiếng Nhật có định nghĩa; bỏ mục Latinh hóa. Chuẩn hóa cấu trúc JSON, bổ sung cách đọc JMdict khi khớp duy nhất. Lịch sử tác giả tại trang mục từ Wiktionary.'})
    return len(groups)
