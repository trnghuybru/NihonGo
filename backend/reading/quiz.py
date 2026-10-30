"""Source-backed reading questions. Answer keys never leave the server before grading."""
import hashlib
import hmac
import json
import unicodedata
from flask import current_app

from api_errors import ApiError


def normalized(value):
    return ' '.join(unicodedata.normalize('NFKC', value).split())


def question_set(passage):
    questions = []
    for index, question in enumerate(passage.questions or []):
        if not isinstance(question, dict):
            continue
        options, answer = question.get('options'), question.get('answer')
        if (not isinstance(question.get('text'), str) or not question['text'].strip()
                or not isinstance(options, list) or not 2 <= len(options) <= 6
                or any(not isinstance(option, str) or not option.strip() for option in options)
                or type(answer) is not int or not 1 <= answer <= len(options)
                or not isinstance(question.get('answer_text'), str)
                or normalized(options[answer - 1]) != normalized(question['answer_text'])):
            continue
        questions.append({'id': f'q{index + 1}', 'text': question['text'], 'options': options,
                          'correct_index': answer - 1})
    # Key the fingerprint so the public version cannot be used to guess a small answer key offline.
    version = hmac.new(current_app.config['AUTH_SECRET_KEY'].encode(),
                       json.dumps([passage.text, questions], ensure_ascii=False, sort_keys=True).encode(),
                       hashlib.sha256).hexdigest()
    return version, questions


def public_quiz(passage):
    version, questions = question_set(passage)
    return {'version': version, 'questions': [
        {key: question[key] for key in ('id', 'text', 'options')} for question in questions]}


def grade(passage, payload):
    version, questions = question_set(passage)
    if not questions:
        raise ApiError('Bài đọc chưa có câu hỏi để chấm điểm.', 409, 'reading_quiz_unavailable')
    if payload.get('version') != version:
        raise ApiError('Câu hỏi đã thay đổi. Hãy tải lại bài đọc.', 409, 'reading_quiz_changed')
    answers = payload.get('answers')
    if not isinstance(answers, dict) or set(answers) != {q['id'] for q in questions}:
        raise ApiError('Hãy trả lời đầy đủ các câu hỏi.', 400, 'reading_answers_invalid')
    results = []
    for question in questions:
        choice = answers[question['id']]
        if type(choice) is not int or not 0 <= choice < len(question['options']):
            raise ApiError('Lựa chọn không hợp lệ.', 400, 'reading_answers_invalid')
        results.append({**question, 'selected_index': choice, 'correct': choice == question['correct_index']})
    correct = sum(item['correct'] for item in results)
    return {'version': version, 'correct': correct, 'total': len(questions),
            'score': round(correct * 100 / len(questions), 1), 'results': results}
