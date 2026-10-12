from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_, select

from api_errors import ApiError
from auth.security import require_auth
from extensions import db
from .models import JLPT_LEVELS, VocabularyTextbook, VocabularyLesson, VocabularyWord

bp = Blueprint("vocabulary", __name__, url_prefix="/api/vocabulary")


@bp.errorhandler(ApiError)
def api_error(error):
    return jsonify({"error": error.message, "code": error.code}), error.status


def level_arg():
    level = request.args.get("level", "N2")
    if level not in JLPT_LEVELS:
        raise ApiError("Chọn trình độ từ N5 đến N1.")
    return level


def public_book(book, word_count, lesson_count):
    return {"id": book.id, "title": book.title, "level": book.level,
            "source_url": book.source_url, "word_count": word_count, "lesson_count": lesson_count}


def public_word(word):
    details = {key: value for key, value in word.details.items() if key != 'audio'}
    return {"id": word.id, "number": word.number, "word": word.word,
            "reading": word.reading, "meaning_vi": word.meaning_vi,
            "han_viet": word.han_viet, **details, "has_audio": bool(word.details.get('audio'))}


@bp.get('/words/<word_id>/audio/playback')
@require_auth
def audio_playback(word_id):
    from .audio import playback
    word = db.session.get(VocabularyWord, word_id)
    if word is None:
        raise ApiError('Không tìm thấy từ vựng.', 404, 'word_not_found')
    response = jsonify(playback(word))
    response.headers['Cache-Control'] = 'no-store'
    return response


@bp.get("/textbooks")
@require_auth
def textbooks():
    level = level_arg()
    rows = db.session.execute(select(VocabularyTextbook, func.count(VocabularyWord.id),
        func.count(func.distinct(VocabularyLesson.id))).select_from(VocabularyTextbook)
        .join(VocabularyLesson, VocabularyLesson.textbook_id == VocabularyTextbook.id)
        .join(VocabularyWord, VocabularyWord.lesson_id == VocabularyLesson.id)
        .where(VocabularyTextbook.level == level)
        .group_by(VocabularyTextbook.id).order_by(VocabularyTextbook.title)).all()
    return jsonify({"level": level, "items": [public_book(*row) for row in rows]})


@bp.get("/textbooks/<book_id>")
@require_auth
def textbook(book_id):
    book = db.session.get(VocabularyTextbook, book_id)
    if book is None:
        raise ApiError("Không tìm thấy giáo trình.", 404, "textbook_not_found")
    rows = db.session.execute(select(VocabularyLesson, func.count(VocabularyWord.id))
        .join(VocabularyWord).where(VocabularyLesson.textbook_id == book.id)
        .group_by(VocabularyLesson.id)
        .order_by(VocabularyLesson.unit_number, VocabularyLesson.number)).all()
    units = {}
    for lesson, count in rows:
        unit = units.setdefault(lesson.unit_number, {"number": lesson.unit_number,
            "title": lesson.unit_title, "word_count": 0, "lessons": []})
        unit["word_count"] += count
        unit["lessons"].append({"id": lesson.id, "number": lesson.number,
                               "title": lesson.title, "word_count": count})
    return jsonify({"textbook": public_book(book, sum(count for _, count in rows), len(rows)),
                    "units": list(units.values())})


@bp.get("/lessons/<lesson_id>")
@require_auth
def lesson_detail(lesson_id):
    lesson = db.session.get(VocabularyLesson, lesson_id)
    if lesson is None:
        raise ApiError("Không tìm thấy bài học.", 404, "lesson_not_found")
    words = db.session.scalars(select(VocabularyWord).where(VocabularyWord.lesson_id == lesson.id)
                              .order_by(VocabularyWord.number)).all()
    return jsonify({"lesson": {"id": lesson.id, "title": lesson.title,
        "textbook_id": lesson.textbook_id, "unit_number": lesson.unit_number,
        "unit_title": lesson.unit_title, "number": lesson.number,
        "source_url": lesson.source_url, "audio_urls": lesson.audio_urls,
        "word_count": len(words)}, "words": [public_word(word) for word in words]})


@bp.get("/words")
@require_auth
def search_words():
    level = level_arg()
    query = request.args.get("q", "").strip()
    try:
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", "20"))
    except ValueError:
        raise ApiError("Phân trang không hợp lệ.") from None
    if not query or len(query) > 100 or page < 1 or not 1 <= page_size <= 40:
        raise ApiError("Nhập từ cần tìm tối đa 100 ký tự và chọn phân trang hợp lệ.")
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    statement = select(VocabularyWord).join(VocabularyLesson).join(VocabularyTextbook).where(
        VocabularyTextbook.level == level,
        or_(*(column.ilike(pattern, escape="\\") for column in
              (VocabularyWord.word, VocabularyWord.reading, VocabularyWord.meaning_vi))))
    total = db.session.scalar(select(func.count()).select_from(statement.subquery()))
    words = db.session.scalars(statement.order_by(VocabularyWord.number, VocabularyWord.id)
        .offset((page - 1) * page_size).limit(page_size)).all()
    return jsonify({"items": [public_word(word) for word in words],
                    "pagination": {"page": page, "page_size": page_size, "total": total,
                                   "total_pages": (total + page_size - 1) // page_size}})
