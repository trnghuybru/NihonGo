"""Stable, exact source anchors. Browser offsets use UTF-16 code units."""
import re


def utf16(value):
    return len(value.encode('utf-16-le')) // 2


def sentences(text):
    result = []
    for paragraph, line in enumerate(text.split('\n')):
        for match in re.finditer(r'.+?(?:[。！？!?]+[」』）】]*|$)', line):
            if not match[0].strip():
                continue
            result.append({'id': f's{len(result) + 1}', 'paragraph_id': str(paragraph),
                           'text': match[0], 'start': utf16(line[:match.start()]), 'end': utf16(line[:match.end()])})
    return result


def anchor(location, source):
    if not isinstance(location, dict):
        raise ValueError('Missing source location')
    sentence = next((s for s in source['sentences'] if s['id'] == location.get('sentence_id')), None)
    quote = location.get('quote')
    if not sentence or not isinstance(quote, str) or not quote.strip() or quote not in sentence['text']:
        raise ValueError('Citation is not an exact source quotation')
    offset = sentence['text'].index(quote)
    start = sentence['start'] + utf16(sentence['text'][:offset])
    return {'sentence_id': sentence['id'], 'paragraph_id': sentence['paragraph_id'],
            'quote': quote, 'start': start, 'end': start + utf16(quote)}
