import json
from functools import lru_cache
from pathlib import Path

from api_errors import ApiError

DATA = Path(__file__).parent / 'data'
TIMING_SOURCES = {
    'n3-2016-12': 'https://www.jlpt.jp/statistics/pdf/2016_2_1.pdf',
    'n3-2017-07': 'https://www.jlpt.jp/statistics/pdf/2017_1_9.pdf',
}


def duration(exam, index):
    if exam['id'] in TIMING_SOURCES:
        return [1800, 4200, 2400][index]
    seconds = exam['sections'][index].get('duration_seconds')
    return seconds if type(seconds) is int and 0 < seconds <= 14400 else None


@lru_cache(maxsize=1)
def _load_exams(signature):
    loaded = [json.loads(Path(path).read_text()) for path, _, _ in signature]
    return {exam['id']: exam for exam in sorted(loaded, key=lambda e: (e['year'], e['month']), reverse=True)}


def exams():
    from .database import available, JlptExamRecord, db
    if available():
        rows = db.session.query(JlptExamRecord).filter(JlptExamRecord.normalized.isnot(None)).all()
        if rows:
            return {r.id: r.normalized for r in sorted(rows, key=lambda r: (r.year, r.month), reverse=True)}
    # Local imports become visible without restarting the API or keeping stale content.
    signature = tuple((str(path), path.stat().st_mtime_ns, path.stat().st_size)
                      for path in sorted(DATA.glob('*.json')))
    return _load_exams(signature)


def get_exam(exam_id):
    exam = exams().get(exam_id)
    if exam is None:
        raise ApiError('Không tìm thấy kỳ thi này.', 404, 'exam_not_found')
    return exam


def preview(exam):
    return {**{k: exam[k] for k in ['id', 'level', 'year', 'month', 'title', 'version', 'audio_url', 'content_note']},
            'total': sum(len(s['questions']) for s in exam['sections']),
            'timing_source_url': TIMING_SOURCES.get(exam['id']) or exam.get('timing_source_url'),
            'sections': [{k: s[k] for k in ['id', 'label', 'original_label']} |
                         {'total': len(s['questions']), 'duration_seconds': duration(exam, i)}
                         for i, s in enumerate(exam['sections'])]}


def public_exam(exam):
    from .database import public_images
    result = {**preview(exam), 'source_filename': exam['source_filename'],
            'sections': [{**s, 'duration_seconds': duration(exam, i),
                          'questions': [{k: v for k, v in q.items() if k != 'answer_index'}
                                           for q in s['questions']]} for i, s in enumerate(exam['sections'])]}
    return public_images(result)


def grade(exam, payload):
    if not isinstance(payload, dict) or type(payload.get('version')) is not int or payload['version'] != exam['version']:
        raise ApiError('Đề thi đã thay đổi. Hãy mở lại kỳ thi trước khi nộp bài.')
    answers = payload.get('answers')
    questions = {q['id']: q for s in exam['sections'] for q in s['questions']}
    if not isinstance(answers, dict) or any(
        key not in questions or type(value) is not int or not 0 <= value < len(questions[key]['options'])
        for key, value in answers.items()
    ):
        raise ApiError('Có đáp án không hợp lệ. Hãy kiểm tra lại bài làm.')
    results = {key: {'selected_index': answers.get(key), 'correct_index': q['answer_index'],
                     'status': 'unanswered' if key not in answers else
                        'correct' if answers[key] == q['answer_index'] else 'incorrect'}
               for key, q in questions.items()}
    sections = [{'id': s['id'], 'label': s['label'], 'total': len(s['questions']),
                 'answered': sum(q['id'] in answers for q in s['questions']),
                 'correct': sum(results[q['id']]['status'] == 'correct' for q in s['questions'])}
                for s in exam['sections']]
    return {'total': len(questions), 'answered': len(answers),
            'correct': sum(s['correct'] for s in sections), 'sections': sections, 'results': results,
            'note': 'Kết quả theo số câu đúng, không quy đổi thành điểm JLPT hoặc kết luận đỗ/trượt.'}
