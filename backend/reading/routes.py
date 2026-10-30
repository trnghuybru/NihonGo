import time
import uuid
from flask import Blueprint, g, jsonify, request
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from api_errors import ApiError
from auth.security import require_auth
from extensions import db
from .analysis import passage_analysis
from .models import LEVELS, TYPES, ReadingPassage, ReadingAttempt
from .quiz import grade, public_quiz
from .study_source import sentences
from .study import cached, get_or_generate

bp = Blueprint('reading', __name__, url_prefix='/api/reading')


@bp.errorhandler(ApiError)
def api_error(error):
    return jsonify({'error': error.message, 'code': error.code}), error.status


def preview(row):
    return {'id': row.id, 'title': row.title, 'level': row.level, 'kind': row.kind,
            'kind_label': TYPES[row.kind][1], 'exercise': row.exercise, 'paragraph': row.paragraph,
            'excerpt': row.text[:120], 'character_count': len(row.text), 'source_url': row.source_url}


@bp.get('/passages')
@require_auth
def passages():
    level, kind, query = (request.args.get(key, '').strip() for key in ('level', 'type', 'q'))
    try:
        page, size = int(request.args.get('page', '1')), int(request.args.get('page_size', '12'))
    except ValueError:
        raise ApiError('Phân trang không hợp lệ.') from None
    if level and level not in LEVELS or kind and kind not in TYPES or len(query) > 100 or not 1 <= page <= 10000 or not 1 <= size <= 40:
        raise ApiError('Bộ lọc hoặc phân trang không hợp lệ.')
    statement = select(ReadingPassage)
    if level:
        statement = statement.where(ReadingPassage.level == level)
    if kind:
        statement = statement.where(ReadingPassage.kind == kind)
    if query:
        pattern = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        statement = statement.where(or_(ReadingPassage.title.ilike(pattern, escape='\\'), ReadingPassage.text.ilike(pattern, escape='\\')))
    total = db.session.scalar(select(func.count()).select_from(statement.subquery()))
    rows = db.session.scalars(statement.order_by(case({value: i for i, value in enumerate(LEVELS)}, value=ReadingPassage.level),
        ReadingPassage.exercise, ReadingPassage.title, ReadingPassage.paragraph, ReadingPassage.id)
        .offset((page - 1) * size).limit(size))
    return jsonify({'items': [preview(row) for row in rows],
        'types': [{'id': key, 'label': value[1]} for key, value in TYPES.items()],
        'pagination': {'page': page, 'page_size': size, 'total': total, 'total_pages': (total + size - 1) // size}})


@bp.get('/passages/<passage_id>')
@require_auth
def passage(passage_id):
    row = db.session.get(ReadingPassage, passage_id)
    if row is None:
        raise ApiError('Không tìm thấy bài đọc.', 404, 'reading_not_found')
    analysis = passage_analysis(row)
    db.session.commit()
    quiz = public_quiz(row)
    latest = db.session.scalar(select(ReadingAttempt).where(
        ReadingAttempt.user_id == g.user.id, ReadingAttempt.passage_id == row.id,
        ReadingAttempt.version == quiz['version']).order_by(ReadingAttempt.created_at.desc(), ReadingAttempt.id.desc()))
    quiz['last_attempt'] = latest.result if latest else None
    return jsonify({**preview(row), 'text': row.text, 'quiz': quiz,
        'sentences': sentences(row.text), 'study_analysis': cached(row, 'analysis'),
        'paragraphs': [{'id': str(i), 'text': text, 'tokens': analysis['segments'][str(i)]}
                       for i, text in enumerate(row.text.split('\n'))],
        'words': {key: {name: word[name] for name in ('surface', 'lemma', 'reading', 'pos')}
                  for key, word in analysis['words'].items()}})


@bp.post('/passages/<passage_id>/attempts')
@require_auth
def submit_attempt(passage_id):
    if request.content_length is not None and request.content_length > 65536:
        raise ApiError('Dữ liệu bài làm quá lớn.', 413)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError('Bài làm không hợp lệ.')
    try:
        request_id = str(uuid.UUID(payload.get('request_id', '')))
    except (ValueError, TypeError, AttributeError):
        raise ApiError('Mã bài làm không hợp lệ.') from None
    row = db.session.scalar(select(ReadingPassage).where(ReadingPassage.id == passage_id).with_for_update())
    if row is None:
        raise ApiError('Không tìm thấy bài đọc.', 404, 'reading_not_found')
    result = grade(row, payload)
    existing = db.session.scalar(select(ReadingAttempt).where(
        ReadingAttempt.user_id == g.user.id, ReadingAttempt.request_id == request_id))
    if existing:
        return replay_attempt(existing, row.id, result)
    identifier = str(uuid.uuid4())
    result = {**result, 'id': identifier, 'submitted_at': int(time.time() * 1000)}
    attempt = ReadingAttempt(id=identifier, user_id=g.user.id, passage_id=row.id, request_id=request_id,
                             version=result['version'], result=result, created_at=result['submitted_at'])
    db.session.add(attempt)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = db.session.scalar(select(ReadingAttempt).where(
            ReadingAttempt.user_id == g.user.id, ReadingAttempt.request_id == request_id))
        if existing is None:
            raise
        return replay_attempt(existing, passage_id, result)
    return jsonify(result), 201


def replay_attempt(existing, passage_id, result):
    if (existing.passage_id != passage_id or existing.version != result['version']
            or existing.result['results'] != result['results']):
        raise ApiError('Mã bài làm đã được sử dụng. Hãy tải lại bài đọc.', 409, 'reading_attempt_conflict')
    return jsonify(existing.result)


@bp.post('/passages/<passage_id>/analysis')
@require_auth
def analyze_passage(passage_id):
    return jsonify(get_or_generate(passage_id, 'analysis'))


@bp.post('/passages/<passage_id>/sentences/<sentence_id>/analysis')
@require_auth
def analyze_sentence(passage_id, sentence_id):
    return jsonify(get_or_generate(passage_id, 'sentence:' + sentence_id))


@bp.post('/passages/<passage_id>/questions/<question_id>/explanation')
@require_auth
def explain_answer(passage_id, question_id):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get('attempt_id'), str):
        raise ApiError('Chọn bài làm đã được chấm để xem giải thích.')
    passage = db.session.get(ReadingPassage, passage_id)
    if not passage:
        raise ApiError('Không tìm thấy bài đọc.', 404, 'reading_not_found')
    attempt = db.session.get(ReadingAttempt, payload['attempt_id'])
    if (not attempt or attempt.user_id != g.user.id or attempt.passage_id != passage_id
            or attempt.version != public_quiz(passage)['version']
            or not any(item['id'] == question_id for item in attempt.result['results'])):
        raise ApiError('Giải thích chỉ mở cho bài làm của bạn sau khi nộp bài.', 403, 'reading_explanation_forbidden')
    return jsonify(get_or_generate(passage_id, 'explanation:' + question_id))
