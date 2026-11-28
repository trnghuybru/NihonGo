from flask import Blueprint, g, jsonify, request
from auth.security import require_auth, limit
from api_errors import ApiError
from .service import exams, get_exam, grade, preview, public_exam

bp = Blueprint('jlpt', __name__, url_prefix='/api/jlpt')


@bp.get('/exams')
@require_auth
def catalog():
    return jsonify({'items': [preview(e) for e in exams().values()]})


@bp.get('/exams/<exam_id>')
@require_auth
def detail(exam_id):
    return jsonify(public_exam(get_exam(exam_id)))


@bp.post('/exams/<exam_id>/grade')
@require_auth
def submit(exam_id):
    if request.content_length is not None and request.content_length > 16384:
        raise ApiError('Bài làm không hợp lệ.', 413)
    from .review import review_token
    exam = get_exam(exam_id)
    result = grade(exam, request.get_json(silent=True))
    return jsonify({**result, 'review_token': review_token(exam, g.user.id)})


@bp.post('/exams/<exam_id>/questions/<question_id>/review')
@require_auth
def review(exam_id, question_id):
    from .review import review_question, vocabulary
    if request.content_length is not None and request.content_length > 4096:
        raise ApiError('Yêu cầu ôn tập quá lớn.', 413)
    exam = get_exam(exam_id)
    question = review_question(exam, g.user.id, question_id, request.get_json(silent=True))
    return jsonify(vocabulary(question))


@bp.post('/exams/<exam_id>/questions/<question_id>/explanation')
@require_auth
def explanation(exam_id, question_id):
    from .review import review_question, explain
    if request.content_length is not None and request.content_length > 4096:
        raise ApiError('Yêu cầu giải thích quá lớn.', 413)
    payload = request.get_json(silent=True)
    exam = get_exam(exam_id)
    question = review_question(exam, g.user.id, question_id, payload)
    limit('jlpt_explanation', g.user.id, 12, 60)
    return jsonify(explain(exam, question, payload.get('option_index')))
