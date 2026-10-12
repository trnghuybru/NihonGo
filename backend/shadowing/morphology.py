"""Portable, cached Japanese tokenizer; no database or Flask dependency."""
import hashlib
import json
import threading
from functools import lru_cache

VERSION = 4
_lock = threading.RLock()


def hiragana(value):
    import unicodedata
    return ''.join(chr(ord(char) - 0x60) if '\u30a1' <= char <= '\u30f6' else char
                   for char in unicodedata.normalize('NFKC', value or ''))


@lru_cache(maxsize=1)
def tokenizer():
    from sudachipy import Dictionary
    return Dictionary(dict='core').create()


def fingerprint(segments, captions):
    return hashlib.sha256(json.dumps([VERSION,
        [(row['id'], row['text']) for row in segments],
        [(row['id'], row['text'], row.get('segment_id')) for row in captions]], ensure_ascii=False).encode()).hexdigest()


def analyze(segments, captions):
    bank, identities = {}, {}
    def tokens(text):
        groups, offset = [], 0
        for morph in tokenizer().tokenize(text):
            start, end = morph.begin(), morph.end()
            if start > offset:
                groups.append({'surface': text[offset:start], 'pos': '空白', 'end': start})
            pos = morph.part_of_speech()
            surface = text[start:end]
            previous = groups[-1] if groups else None
            # A readable inflected word: 立っ + た, 言っ + て, 住ん + で + いる.
            attach = previous and previous['end'] == start and previous['pos'] in ('動詞', '形容詞', '形状詞') and (
                pos[0] == '助動詞' or
                (pos[0] == '助詞' and pos[1] == '接続助詞' and surface in ('て', 'で')) or
                (previous['surface'].endswith(('て', 'で')) and morph.dictionary_form() in ('いる', '居る')))
            adjacent = previous and previous['end'] == start
            compound = adjacent and previous['pos'] == '助詞' and pos[0] == '助詞' and previous['surface'] + surface in ('でも', 'とか')
            honorific = adjacent and previous['pos'] == '名詞' and pos[0] == '接尾辞' and surface in ('さん', 'ちゃん', '様', 'さま', '君', 'くん')
            if attach or compound or honorific:
                previous['surface'] += surface
                previous['reading'] += hiragana(morph.reading_form())
                previous['end'] = end
                if compound or honorific:
                    previous['lemma'] += morph.dictionary_form()
                    previous['normalized'] = previous['surface']
            else:
                groups.append({'surface': surface, 'reading': hiragana(morph.reading_form()),
                    'lemma': morph.dictionary_form(), 'normalized': morph.normalized_form(),
                    'pos': pos[0], 'end': end})
            offset = end
        if offset < len(text):
            groups.append({'surface': text[offset:], 'pos': '空白'})
        result = []
        for group in groups:
            surface = group['surface']
            if group['pos'] in ('補助記号', '記号', '空白'):
                result.append({'text': surface})
                continue
            lemma, reading = group['lemma'], group['reading']
            identity = (surface, lemma, reading, group['normalized'], group['pos'])
            key = identities.get(identity)
            if key is None:
                key = str(len(bank) + 1)
                identities[identity] = key
                lemma_reading = ''.join(hiragana(item.reading_form()) for item in tokenizer().tokenize(lemma))
                bank[key] = {'surface': surface, 'lemma': lemma, 'reading': reading,
                    'lemma_reading': lemma_reading, 'normalized': group['normalized'], 'pos': group['pos']}
            result.append({'text': surface, 'key': key})
        return result

    with _lock:
        practice = {row['id']: tokens(row['text']) for row in segments}
        originals = {row['id']: row['text'] for row in segments}
        display = {}
        for cue in captions:
            text, parent = cue['text'], cue.get('segment_id')
            original = originals.get(parent, '')
            # A cue cut through a word still refers to that whole word when its
            # location in the practice sentence is unambiguous.
            if text and original.count(text) == 1:
                begin, stop = original.index(text), original.index(text) + len(text)
                projected, offset = [], 0
                for token in practice[parent]:
                    end = offset + len(token['text'])
                    left, right = max(begin, offset), min(stop, end)
                    if right > left:
                        projected.append({**token, 'text': original[left:right]})
                    offset = end
                display[cue['id']] = projected
            else:
                display[cue['id']] = tokens(text)
    return {'version': VERSION, 'fingerprint': fingerprint(segments, captions),
            'segments': practice, 'captions': display, 'words': bank}

