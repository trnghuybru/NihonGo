import time
import uuid

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func, select

from api_errors import ApiError
from auth.models import User
from auth.security import limit, require_auth
from dictionary.models import DictionaryEntry
from extensions import db
from vocabulary.models import VocabularyLesson, VocabularyTextbook, VocabularyWord, JLPT_LEVELS
from .models import FlashcardDeck, FlashcardFavorite, FlashcardSchedule, FlashcardSession

bp = Blueprint('flashcards', __name__, url_prefix='/api/flashcards')


def timestamp():
    return int(time.time() * 1000)


@bp.errorhandler(ApiError)
def error(error):
    db.session.rollback()
    return jsonify({'error': error.message, 'code': error.code}), error.status


def body():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ApiError('Dữ liệu không hợp lệ.')
    return value


def locked_user():
    if getattr(g, 'flashcard_user_locked', False):
        return
    limit('flashcards-write-user', g.user.id, 120, 60)
    db.session.execute(select(User.id).where(User.id == g.user.id).with_for_update())
    g.flashcard_user_locked = True


def owned_deck(identifier):
    row = db.session.scalar(select(FlashcardDeck).where(FlashcardDeck.id == identifier, FlashcardDeck.user_id == g.user.id))
    if row is None:
        raise ApiError('Không tìm thấy bộ thẻ.', 404)
    return row


def session_row(identifier, lock=False):
    query = select(FlashcardSession).where(FlashcardSession.id == identifier, FlashcardSession.user_id == g.user.id)
    if lock:
        if not getattr(g, 'flashcard_user_locked', False):
            limit('flashcards-write-user', g.user.id, 120, 60)
        query = query.with_for_update()
    row = db.session.scalar(query)
    if row is None:
        raise ApiError('Không tìm thấy phiên học.', 404)
    return row


def public_session(row):
    from .srs import rating_options
    counts = [sum(value == grade for value in row.ratings.values()) for grade in range(4)]
    studied = sum(counts)
    current = next((card for card in row.cards if card['id'] not in row.ratings), None)
    return {'id': row.id, 'kind': row.kind, 'deck_id': row.deck_id, 'title': row.title,
            'rating_options': rating_options(row.user_id, current, timestamp()) if current and row.finished_at is None else [],
            'cards': row.cards, 'ratings': row.ratings, 'started_at': row.started_at,
            'finished_at': row.finished_at, 'summary': {'total': len(row.cards), 'studied': studied,
            'counts': counts, 'remembered': counts[2] + counts[3],
            'remembered_percent': round((counts[2] + counts[3]) * 100 / studied) if studied else 0}}


@bp.get('/decks')
@require_auth
def decks():
    kind = request.args.get('kind', 'lesson')
    level = request.args.get('level', 'N5')
    try:
        page = int(request.args.get('page', 1))
    except ValueError:
        raise ApiError('Phân trang không hợp lệ.') from None
    if kind not in ('lesson', 'custom', 'favorites') or level not in JLPT_LEVELS or not 1 <= page <= 1000:
        raise ApiError('Bộ thẻ hoặc trình độ không hợp lệ.')
    size = 20
    if kind == 'lesson':
        query = select(VocabularyLesson, VocabularyTextbook, func.count(VocabularyWord.id)).join(
            VocabularyTextbook, VocabularyTextbook.id == VocabularyLesson.textbook_id).join(
            VocabularyWord, VocabularyWord.lesson_id == VocabularyLesson.id).where(
            VocabularyTextbook.level == level).group_by(VocabularyLesson.id, VocabularyTextbook.id)
        total = db.session.scalar(select(func.count()).select_from(query.subquery()))
        rows = db.session.execute(query.order_by(VocabularyTextbook.title, VocabularyLesson.unit_number,
            VocabularyLesson.number).offset((page - 1) * size).limit(size))
        items = [{'id': lesson.id, 'kind': kind, 'title': lesson.title,
                  'subtitle': f'{book.title} · {lesson.unit_title}', 'card_count': count} for lesson, book, count in rows]
    elif kind == 'custom':
        query = select(FlashcardDeck).where(FlashcardDeck.user_id == g.user.id)
        total = db.session.scalar(select(func.count()).select_from(query.subquery()))
        rows = db.session.scalars(query.order_by(FlashcardDeck.updated_at.desc(), FlashcardDeck.id).offset((page - 1) * size).limit(size))
        items = [{'id': row.id, 'kind': kind, 'title': row.title, 'subtitle': 'Bộ tự tạo', 'card_count': len(row.cards)} for row in rows]
    else:
        count = db.session.scalar(select(func.count()).select_from(FlashcardFavorite).where(FlashcardFavorite.user_id == g.user.id))
        total = 1
        items = [{'id': 'favorites', 'kind': kind, 'title': 'Từ yêu thích', 'subtitle': '', 'card_count': count}] if page == 1 else []
    active = db.session.scalar(select(FlashcardSession).where(FlashcardSession.user_id == g.user.id,
        FlashcardSession.finished_at.is_(None)).order_by(FlashcardSession.started_at.desc()).limit(1))
    return jsonify({'items': items, 'pagination': {'page': page, 'total_pages': (total + size - 1) // size},
        'active_session': {'id': active.id, 'title': active.title, 'studied': len(active.ratings), 'total': len(active.cards)} if active else None})


def clean_deck(data, previous=()):
    title, cards = data.get('title'), data.get('cards')
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 80 or not isinstance(cards, list) or not 1 <= len(cards) <= 100:
        raise ApiError('Nhập tên bộ thẻ (tối đa 80 ký tự) và từ 1 đến 100 thẻ.')
    result = []
    for card in cards:
        if not isinstance(card, dict):
            raise ApiError('Thẻ không hợp lệ.')
        front, back, reading = card.get('front'), card.get('back'), card.get('reading', '')
        if (not isinstance(front, str) or not 1 <= len(front.strip()) <= 100 or
                not isinstance(back, str) or not 1 <= len(back.strip()) <= 2000 or
                not isinstance(reading, str) or len(reading) > 100):
            raise ApiError('Mỗi thẻ cần từ và nghĩa; tối đa 100 ký tự cho từ, 2000 ký tự cho nghĩa.')
        content = {'front': front.strip(), 'reading': reading.strip(), 'back': back.strip()}
        # Preserve unchanged cards even when an older client omits their IDs.
        used = {item['id'] for item in result}
        match = next((old for old in previous if old['id'] not in used and
            all(old.get(key, '') == value for key, value in content.items()) and
            (not card.get('id') or card['id'] == old['id'])), None)
        result.append({'id': match['id'] if match else str(uuid.uuid4()), **content})
    return title.strip(), result


@bp.post('/decks')
@require_auth
def create_deck():
    title, cards = clean_deck(body())
    locked_user()
    if db.session.scalar(select(func.count()).select_from(FlashcardDeck).where(FlashcardDeck.user_id == g.user.id)) >= 100:
        raise ApiError('Bạn đã có 100 bộ thẻ tự tạo.')
    row = FlashcardDeck(id=str(uuid.uuid4()), user_id=g.user.id, title=title, cards=cards, updated_at=timestamp())
    db.session.add(row)
    db.session.commit()
    return jsonify({'id': row.id, 'title': row.title, 'cards': row.cards}), 201


@bp.get('/decks/<identifier>')
@require_auth
def deck_detail(identifier):
    row = owned_deck(identifier)
    return jsonify({'id': row.id, 'title': row.title, 'cards': row.cards})


@bp.put('/decks/<identifier>')
@require_auth
def update_deck(identifier):
    locked_user()
    row = owned_deck(identifier)
    title, cards = clean_deck(body(), row.cards)
    removed = {card['id'] for card in row.cards} - {card['id'] for card in cards}
    if removed:
        saved = set(db.session.scalars(select(FlashcardFavorite.target).where(
            FlashcardFavorite.user_id == g.user.id, FlashcardFavorite.source == 'custom',
            FlashcardFavorite.target.in_(removed))))
        for state in db.session.scalars(select(FlashcardSchedule).where(
                FlashcardSchedule.user_id == g.user.id, FlashcardSchedule.card_id.in_(removed))):
            state.active = state.card_id in saved
    row.title, row.cards, row.updated_at = title, cards, timestamp()
    db.session.commit()
    return jsonify({'id': row.id, 'title': row.title, 'cards': row.cards})


@bp.post('/decks/<identifier>/cards')
@require_auth
def append_dictionary_card(identifier):
    data = body()
    target = data.get('dictionary_id')
    if not isinstance(target, str) or not target or len(target) > 128:
        raise ApiError('Chọn một từ trong từ điển để lưu.')
    locked_user()
    row = owned_deck(identifier)
    source = source_card('dictionary', target)
    draft = {key: source[key] for key in ('front', 'reading', 'back')}
    existing = next((card for card in row.cards if all(card.get(key, '') == value for key, value in draft.items())), None)
    if existing:
        return jsonify({'added': False, 'deck_id': row.id, 'title': row.title, 'card': existing})
    if len(row.cards) >= 100:
        raise ApiError('Bộ thẻ đã đủ 100 thẻ. Hãy chọn bộ khác.')
    _, cards = clean_deck({'title': row.title, 'cards': [draft]})
    row.cards = [*row.cards, cards[0]]
    row.updated_at = timestamp()
    db.session.commit()
    return jsonify({'added': True, 'deck_id': row.id, 'title': row.title, 'card': cards[0]}), 201


def source_card(source, target):
    if source == 'lesson':
        row = db.session.get(VocabularyWord, target)
        if row:
            return {'id': f'lesson:{row.id}', 'front': row.word, 'reading': row.reading, 'back': row.meaning_vi}
    elif source == 'dictionary':
        row = db.session.get(DictionaryEntry, target)
        if row and row.id.startswith(('jmdict:', 'viwiktionary:')):
            meanings = []
            for sense in row.content['senses']:
                vi = [x['text'] for x in sense['glosses'] if x['language'] == 'vi']
                english = [x['text'] for x in sense['glosses'] if x['language'] in ('eng', 'en')]
                meanings.extend(vi or [text + ' · Anh' for text in english])
            return {'id': f'dictionary:{row.id}', 'front': row.word, 'reading': row.reading, 'back': '; '.join(meanings)}
    raise ApiError('Không tìm thấy từ để lưu.', 404)


@bp.get('/favorites/<source>/<path:target>')
@require_auth
def favorite_state(source, target):
    return jsonify({'saved': db.session.get(FlashcardFavorite, (g.user.id, source, target)) is not None})


@bp.route('/favorites/<source>/<path:target>', methods=['PUT', 'DELETE'])
@require_auth
def favorite_write(source, target):
    if source not in ('lesson', 'dictionary') or len(target) > 128:
        raise ApiError('Từ yêu thích không hợp lệ.')
    card = source_card(source, target) if request.method == 'PUT' else None
    return store_favorite(source, target, card)


def store_favorite(source, target, card):
    locked_user()
    row = db.session.get(FlashcardFavorite, (g.user.id, source, target))
    if request.method == 'DELETE':
        if row:
            db.session.delete(row)
    elif row is None:
        if db.session.scalar(select(func.count()).select_from(FlashcardFavorite).where(FlashcardFavorite.user_id == g.user.id)) >= 500:
            raise ApiError('Bộ yêu thích đã đủ 500 thẻ.')
        db.session.add(FlashcardFavorite(user_id=g.user.id, source=source, target=target, card=card, created_at=timestamp()))
    else:
        row.card = card
    if source == 'custom':
        state = db.session.get(FlashcardSchedule, (g.user.id, target))
        if state:
            state.active = request.method == 'PUT' or any(
                item['id'] == target for cards in db.session.scalars(select(FlashcardDeck.cards).where(
                    FlashcardDeck.user_id == g.user.id)) for item in cards)
    db.session.commit()
    return jsonify({'saved': request.method == 'PUT'})


@bp.route('/sessions/<identifier>/favorite/<path:card_id>', methods=['GET', 'PUT', 'DELETE'])
@require_auth
def session_favorite(identifier, card_id):
    if request.method != 'GET':
        locked_user()
    session = session_row(identifier)
    card = next((item for item in session.cards if item['id'] == card_id), None)
    if card is None:
        raise ApiError('Thẻ không thuộc phiên học này.', 404)
    key = card.get('srs_id', card['id'])
    source, target = key.split(':', 1) if key.startswith(('lesson:', 'dictionary:')) else ('custom', key)
    if request.method == 'GET':
        return jsonify({'saved': db.session.get(FlashcardFavorite, (g.user.id, source, target)) is not None})
    snapshot = {field: card.get(field, '') for field in ('front', 'reading', 'back')}
    return store_favorite(source, target, {'id': key, **snapshot} if request.method == 'PUT' else None)


@bp.post('/sessions')
@require_auth
def start_session():
    data = body()
    kind, identifier = data.get('kind'), data.get('deck_id')
    if kind not in ('lesson', 'custom', 'favorites') or not isinstance(identifier, str) or not 1 <= len(identifier) <= 128:
        raise ApiError('Chọn bộ thẻ hợp lệ.')
    if kind == 'favorites':
        identifier = 'favorites'
    locked_user()
    # Retrying a start request resumes the existing active session for that deck.
    existing = db.session.scalar(select(FlashcardSession).where(FlashcardSession.user_id == g.user.id,
        FlashcardSession.kind == kind, FlashcardSession.deck_id == identifier,
        FlashcardSession.finished_at.is_(None)).order_by(FlashcardSession.started_at.desc()).limit(1))
    if existing:
        return jsonify(public_session(existing))
    if kind == 'lesson':
        lesson = db.session.get(VocabularyLesson, identifier)
        if lesson is None:
            raise ApiError('Không tìm thấy bài học.', 404)
        rows = list(db.session.scalars(select(VocabularyWord).where(VocabularyWord.lesson_id == identifier).order_by(VocabularyWord.number)))
        title, cards = lesson.title, [{'id': f'lesson:{row.id}', 'front': row.word, 'reading': row.reading, 'back': row.meaning_vi} for row in rows]
    elif kind == 'custom':
        deck = owned_deck(identifier)
        title, cards = deck.title, deck.cards
    else:
        title = 'Từ yêu thích'
        cards = [row.card for row in db.session.scalars(select(FlashcardFavorite).where(
            FlashcardFavorite.user_id == g.user.id).order_by(FlashcardFavorite.created_at.desc(), FlashcardFavorite.target))]
    if not cards:
        raise ApiError('Bộ thẻ chưa có từ nào. Hãy thêm từ trước khi học.')
    row = FlashcardSession(id=str(uuid.uuid4()), user_id=g.user.id, kind=kind, deck_id=identifier,
        title=title, cards=cards, ratings={}, started_at=timestamp())
    db.session.add(row)
    db.session.commit()
    return jsonify(public_session(row)), 201


@bp.get('/sessions/<identifier>')
@require_auth
def get_session(identifier):
    from .srs import prune_due_session
    locked_user()
    row = session_row(identifier, lock=True)
    prune_due_session(row)
    db.session.commit()
    return jsonify(public_session(row))


@bp.post('/sessions/<identifier>/rate')
@require_auth
def rate(identifier):
    data = body()
    card_id, grade = data.get('card_id'), data.get('grade')
    if not isinstance(card_id, str) or type(grade) is not int or grade not in range(4):
        raise ApiError('Chọn mức nhớ hợp lệ.')
    # All decks/favorite views of one card share a single memory state.
    locked_user()
    row = session_row(identifier, lock=True)
    if card_id in row.ratings:
        if row.ratings[card_id] != grade:
            raise ApiError('Thẻ này đã được đánh giá.', 409)
        return jsonify(public_session(row))
    remaining = [card for card in row.cards if card['id'] not in row.ratings]
    if row.finished_at or not remaining or remaining[0]['id'] != card_id:
        raise ApiError('Thẻ không phải lượt học hiện tại.', 409)
    from .srs import due_query, schedule_rating
    if row.deck_id == 'review:due' and not db.session.scalar(due_query(g.user.id).where(
            FlashcardSchedule.card_id == card_id)):
        raise ApiError('Thẻ đã được ôn ở phiên khác. Hãy tải lại phiên học.', 409)
    at = timestamp()
    schedule_rating(row, remaining[0], grade, at)
    row.ratings = {**row.ratings, card_id: grade}
    row.rating_times = {**(row.rating_times or {}), card_id: at}
    if len(row.ratings) == len(row.cards):
        row.finished_at = timestamp()
    db.session.commit()
    return jsonify(public_session(row))


@bp.post('/sessions/<identifier>/finish')
@require_auth
def finish(identifier):
    row = session_row(identifier, lock=True)
    if row.finished_at is None:
        row.finished_at = timestamp()
    db.session.commit()
    return jsonify(public_session(row))
