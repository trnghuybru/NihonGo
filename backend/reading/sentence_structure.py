"""Normalize semantic segments without rewriting or losing any source characters."""
from .study_source import utf16

ROLE_LABELS = {'subject': 'Chủ thể', 'predicate': 'Vị ngữ', 'object': 'Bổ ngữ',
               'modifier': 'Mệnh đề bổ nghĩa', 'adjunct': 'Thành phần phụ', 'other': 'Thành phần khác'}


def sentence_structure(item, source):
    sentence = next((s for s in source['sentences'] if s['id'] == item.get('sentence_id')), None)
    if not sentence:
        raise ValueError('Unknown sentence')
    values = item.get('segments')
    if not isinstance(values, list) or not 1 <= len(values) <= 32:
        raise ValueError('Invalid sentence segments')
    cursor, segments = 0, []
    for value in values:
        if not isinstance(value, dict):
            raise ValueError('Invalid segment')
        quote, role, core, explanation = (value.get(key) for key in ('text', 'role', 'is_core', 'explanation'))
        if (not isinstance(quote, str) or not quote or not sentence['text'].startswith(quote, cursor)
                or not isinstance(role, str) or role not in ROLE_LABELS or type(core) is not bool
                or not isinstance(explanation, str) or not explanation.strip() or len(explanation) > 600):
            raise ValueError('Segments must partition exact source text in order')
        start = sentence['start'] + utf16(sentence['text'][:cursor])
        segments.append({'id': f'{sentence["id"]}-p{len(segments) + 1}', 'text': quote,
                         'role': role, 'is_core': core, 'explanation': explanation.strip(),
                         'location': {'sentence_id': sentence['id'], 'paragraph_id': sentence['paragraph_id'],
                                      'quote': quote, 'start': start, 'end': start + utf16(quote)}})
        cursor += len(quote)
    if cursor != len(sentence['text']) or not any(s['role'] == 'predicate' and s['is_core'] for s in segments):
        raise ValueError('Missing source text or main predicate')
    if sum(s['role'] == 'subject' and s['is_core'] for s in segments) > 1:
        raise ValueError('Nested subjects must stay inside their modifier')
    if any(s['role'] == 'adjunct' and s['text'].strip('、。 ') in ('いつも', '必ず', '決して') and not s['is_core'] for s in segments):
        raise ValueError('Keep essential frequency and negation in the core')
    core_text = ''.join(s['text'] for s in segments if s['is_core'])
    def required(key, allow_empty=False):
        value = item.get(key)
        if not isinstance(value, str) or len(value) > 1600 or (not allow_empty and not value.strip()):
            raise ValueError('Invalid sentence translation')
        return value.strip()
    translation, core_translation = required('translation_vi'), required('core_translation_vi')
    implicit_subject = required('implicit_subject', True)
    return {'sentence_id': sentence['id'], 'original': sentence['text'], 'segments': segments,
            'core_text': core_text, 'core_translation_vi': core_translation, 'implicit_subject': implicit_subject,
            'translation_vi': translation, 'main_idea': core_translation,
            # Keep compatible fields for existing clients and saved analysis panels.
            'core': {'subject': ''.join(s['text'] for s in segments if s['role'] == 'subject' and s['is_core']) or implicit_subject,
                     'predicate': ''.join(s['text'] for s in segments if s['role'] == 'predicate' and s['is_core']),
                     'object': ''.join(s['text'] for s in segments if s['role'] == 'object' and s['is_core'])},
            'layers': [{'text': core_text, 'meaning': core_translation}, {'text': sentence['text'], 'meaning': translation}],
            'parts': [{'role': ROLE_LABELS[s['role']], 'explanation': s['explanation'], 'location': s['location']} for s in segments],
            'caution': required('caution', True)}
