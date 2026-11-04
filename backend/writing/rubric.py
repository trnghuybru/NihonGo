"""Versioned practice rubric; scores and text anchors are computed on the server."""
RUBRIC = [
    ('task', 'Đáp ứng đề bài', [
        ('relevance', 'Đúng yêu cầu và chủ đề'),
        ('development', 'Phát triển ý và ví dụ'),
        ('instructions', 'Hình thức và độ dài theo đề'),
    ]),
    ('organization', 'Tổ chức và liên kết', [
        ('logical_order', 'Sắp xếp ý hợp lý'),
        ('connections', 'Liên kết câu và ý'),
        ('paragraphing', 'Bố cục phù hợp dạng bài'),
    ]),
    ('grammar', 'Ngữ pháp', [
        ('accuracy', 'Độ chính xác ngữ pháp'),
        ('range', 'Cấu trúc phù hợp trình độ'),
        ('punctuation', 'Dấu câu và cách kết thúc câu'),
    ]),
    ('vocabulary', 'Từ vựng và chính tả', [
        ('range', 'Vốn từ phù hợp trình độ'),
        ('word_choice', 'Dùng từ đúng và tự nhiên'),
        ('script', 'Kana, Kanji và chính tả'),
    ]),
]

LEVEL_EXPECTATIONS = {
    'N5': 'Short simple daily-life sentences, basic particles and desu/masu forms. Hiragana is acceptable. Do not require an essay introduction/conclusion, complex grammar or advanced kanji.',
    'N4': 'A short connected paragraph about everyday experiences, reasons and plans. Expect basic tense, te-forms and simple connectors; do not demand academic argumentation.',
    'N3': 'Connected paragraphs explaining experiences and opinions, reasons and concrete examples. Expect appropriate intermediate grammar and vocabulary.',
    'N2': 'A clear position with developed reasoning, relevant examples, coherent paragraphs and appropriate register. Expect varied upper-intermediate structures and precise vocabulary.',
    'N1': 'Well-developed nuanced argument, logical transitions, precise vocabulary and consistently natural register. Expect advanced structures only where they serve the task.',
}


def normalize_level(level):
    return level if isinstance(level, str) and level in LEVEL_EXPECTATIONS else 'N5'


def _text(value, maximum, *, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise ValueError('Invalid assessment text')
    return value


def validate_assessment(result, text, level):
    if not isinstance(result, dict) or set(result) != {'criteria', 'corrections', 'next_step'}:
        raise ValueError('Invalid assessment fields')
    criteria = result['criteria']
    if not isinstance(criteria, list) or len(criteria) != len(RUBRIC):
        raise ValueError('Incomplete rubric')
    by_id = {item.get('id'): item for item in criteria if isinstance(item, dict)}
    if len(by_id) != len(RUBRIC):
        raise ValueError('Duplicate rubric criteria')
    normalized = []
    for identifier, title, subcriteria in RUBRIC:
        item = by_id.get(identifier)
        if not isinstance(item, dict) or set(item) != {'id', 'comment', 'scores'}:
            raise ValueError('Invalid criterion')
        scores = item['scores']
        if not isinstance(scores, list) or len(scores) != len(subcriteria):
            raise ValueError('Incomplete subscores')
        scores_by_id = {score.get('id'): score for score in scores if isinstance(score, dict)}
        if len(scores_by_id) != len(subcriteria):
            raise ValueError('Duplicate subscores')
        subscores = []
        for sub_id, sub_title in subcriteria:
            score = scores_by_id.get(sub_id)
            if not isinstance(score, dict) or set(score) != {'id', 'score'}:
                raise ValueError('Invalid subscore')
            value = score['score']
            if type(value) is not int or not 0 <= value <= 5:
                raise ValueError('Invalid subscore range')
            subscores.append({'id': sub_id, 'title': sub_title, 'score': value})
        # Mean of subscores, scaled to 25, rounded half up.
        total = sum(score['score'] for score in subscores)
        score = (total * 10 + len(subscores)) // (2 * len(subscores))
        normalized.append({'id': identifier, 'title': title, 'score': score,
                           'comment': _text(item['comment'], 500).strip(), 'subcriteria': subscores})

    raw_corrections = result['corrections']
    if not isinstance(raw_corrections, list) or len(raw_corrections) > 6:
        raise ValueError('Invalid corrections')
    corrections = []
    for correction in raw_corrections:
        if not isinstance(correction, dict) or set(correction) != {'original', 'replacement', 'explanation', 'criterion_id', 'kind'}:
            raise ValueError('Invalid correction')
        original = _text(correction['original'], 1200)
        replacement = _text(correction['replacement'], 1600, empty=True)
        start = text.find(original)
        if start < 0 or text.find(original, start + 1) >= 0 or original == replacement:
            raise ValueError('Correction must match one unique original span')
        if correction['criterion_id'] not in by_id or correction['kind'] not in ('error', 'suggestion'):
            raise ValueError('Invalid correction category')
        corrections.append({**correction, 'start': start, 'end': start + len(original),
                            'explanation': _text(correction['explanation'], 500).strip()})
    corrections.sort(key=lambda item: item['start'])
    for left, right in zip(corrections, corrections[1:]):
        if left['end'] > right['start']:
            raise ValueError('Overlapping corrections')
    corrected_text = text
    for correction in reversed(corrections):
        corrected_text = corrected_text[:correction['start']] + correction['replacement'] + corrected_text[correction['end']:]
    report = {'version': 1, 'level': normalize_level(level), 'criteria': normalized,
              'corrections': corrections, 'next_step': _text(result['next_step'], 500).strip()}
    feedback = '\n\n'.join(f"{item['title']}: {item['comment']}" for item in normalized)
    feedback += '\n\nBài tập tiếp theo: ' + report['next_step']
    return {'score': sum(item['score'] for item in normalized),
            'corrected_text': corrected_text, 'feedback': feedback, 'assessment': report}
