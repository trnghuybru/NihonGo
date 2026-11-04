import copy
from datetime import timedelta
import jwt
import re
from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import func, select
from api_errors import ApiError
from auth.models import User
from auth.security import body, limit, require_auth
from extensions import db
from vocabulary.models import JLPT_LEVELS, VocabularyLesson, VocabularyTextbook, VocabularyWord
from .models import GameRoom
from . import engine, media

bp = Blueprint('games', __name__, url_prefix='/api/games')


@bp.errorhandler(ApiError)
def error_response(error):
    db.session.rollback()
    return jsonify(error=error.message, code=error.code), error.status


def publish(row):
    db.session.commit()
    current_app.extensions['game_socketio'].emit('room_changed', {'code': row.code, 'version': row.version},
                                                to=row.code, namespace='/games')
    return jsonify(engine.public_room(row))


def changed(row, state):
    engine.mutate(row, state)
    return publish(row)


def advance(row, state):
    before = state['phase']
    changed = engine.tick(state, row.mode, engine.millis())
    if changed and row.mode == 'read' and before == 'reading':
        try:
            media.permission(row, state['holder'], False)
        except ApiError:
            state.update(phase='closed', deadline=None)
    return changed


def action_room(code, data):
    limit('game-user', g.user.id, 240, 60)
    row, state = engine.locked(code, g.user.id)
    if advance(row, state):
        engine.mutate(row, state)
        publish(row)
        raise ApiError('Lượt chơi vừa thay đổi. Hãy thử lại theo trạng thái mới.', 409, 'stale_round')
    if data.get('round_id') != state.get('round_id'):
        raise ApiError('Câu hỏi đã thay đổi. Hãy tải lại trạng thái phòng.', 409, 'stale_round')
    return row, state


@bp.get('/catalog')
@require_auth
def catalog():
    level = request.args.get('level', 'N5')
    try:
        page = int(request.args.get('page', '1'))
    except ValueError:
        raise ApiError('Trang không hợp lệ.') from None
    if level not in JLPT_LEVELS or not 1 <= page <= 1000:
        raise ApiError('Cấp JLPT hoặc trang không hợp lệ.')
    query = select(VocabularyLesson, VocabularyTextbook.title, func.count(VocabularyWord.id)).join(
        VocabularyTextbook, VocabularyTextbook.id == VocabularyLesson.textbook_id).join(VocabularyWord, VocabularyWord.lesson_id == VocabularyLesson.id).where(VocabularyTextbook.level == level).group_by(
            VocabularyLesson.id, VocabularyTextbook.title)
    total = db.session.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.session.execute(query.order_by(VocabularyTextbook.title, VocabularyLesson.unit_number,
        VocabularyLesson.number).offset((page-1)*12).limit(12))
    return jsonify(level=level, available_count=len(engine.word_pool(level)),
        lessons=[{'id': lesson.id, 'title': lesson.title, 'textbook': book, 'word_count': len(engine.word_pool(level, lesson.id))}
                 for lesson, book, count in rows], page=page, total_pages=(total+11)//12,
        read_available=media.configured())


@bp.post('/rooms')
@require_auth
def create():
    limit('game-create', g.user.id, 20, 3600)
    data = body()
    if data.get('mode') == 'read' and not media.configured():
        raise ApiError('Máy chủ chưa cấu hình âm thanh cho mode đọc. Bạn có thể chơi mode viết trước.', 503, 'game_audio_unavailable')
    # Serialize per-user room creation, including the active-room quota.
    db.session.execute(select(User.id).where(User.id == g.user.id).with_for_update())
    count = db.session.scalar(select(func.count()).select_from(GameRoom).where(
        GameRoom.host_id == g.user.id, GameRoom.status.notin_(('finished', 'closed')), GameRoom.expires_at > engine.millis()))
    if count >= 3:
        raise ApiError('Bạn đang có 3 phòng chưa kết thúc. Hãy rời hoặc kết thúc phòng cũ.', 409)
    row = engine.create_room(g.user, data)
    return publish(row)


@bp.post('/rooms/<code>/join')
@require_auth
def join(code):
    limit('game-join', g.user.id, 30, 60)
    if not re.fullmatch('[A-Za-z0-9]{6}', code):
        raise ApiError('Mã phòng gồm 6 chữ hoặc số.')
    row, state = engine.locked(code)
    player = next((p for p in state['players'] if p['id'] == g.user.id), None)
    if state['phase'] == 'finished' and player:
        return publish(row)
    if state['phase'] in ('finished', 'closed'):
        raise ApiError('Phòng đã kết thúc.', 409)
    if player and not player['left']:
        return publish(row)
    if state['phase'] != 'waiting':
        raise ApiError('Trận đã bắt đầu. Chỉ người đang trong trận được kết nối lại.', 409)
    if sum(not p['left'] for p in state['players']) >= 8:
        raise ApiError('Phòng đã đủ 8 người.', 409)
    if player:
        player.update(left=False, ready=False)
    else:
        state['players'].append({'id': g.user.id, 'name': g.user.name, 'ready': False, 'left': False, 'score': 0})
    return changed(row, state)


@bp.get('/rooms/<code>')
@require_auth
def snapshot(code):
    row, state = engine.locked(code, g.user.id)
    if advance(row, state):
        return changed(row, state)
    db.session.commit()
    return jsonify(engine.public_room(row))


@bp.post('/rooms/<code>/ready')
@require_auth
def ready(code):
    data = body()
    row, state = engine.locked(code, g.user.id)
    if state['phase'] != 'waiting' or type(data.get('ready')) is not bool:
        raise ApiError('Chỉ thay đổi sẵn sàng trong phòng chờ.', 409)
    next(p for p in state['players'] if p['id'] == g.user.id)['ready'] = data['ready']
    return changed(row, state)


@bp.post('/rooms/<code>/start')
@require_auth
def start(code):
    row, state = engine.locked(code, g.user.id)
    players = [p for p in state['players'] if not p['left']]
    if row.host_id != g.user.id:
        raise ApiError('Chỉ chủ phòng được bắt đầu.', 403)
    if state['phase'] != 'waiting' or len(players) < 2 or not all(p['ready'] for p in players):
        raise ApiError('Cần ít nhất 2 người và tất cả đã sẵn sàng.', 409)
    if row.mode == 'read' and state.get('voice_ready_at', 0) < engine.millis()-10000:
        raise ApiError('Bộ chấm giọng đang kết nối. Vui lòng thử lại sau.', 503, 'game_voice_unavailable')
    state.update(phase='countdown', deadline=engine.millis()+3000)
    return changed(row, state)


@bp.post('/rooms/<code>/answer')
@require_auth
def answer(code):
    data = body()
    row, state = action_room(code, data)
    if row.mode != 'write':
        raise ApiError('Mode đọc chỉ nhận kết quả audio từ máy chủ.', 403)
    answer = data.get('answer')
    if not isinstance(answer, str) or not 1 <= len(answer.strip()) <= 100:
        raise ApiError('Nhập cách đọc, tối đa 100 ký tự.')
    engine.submit(state, g.user.id, answer.strip(), engine.millis(), 'write')
    return changed(row, state)


@bp.post('/rooms/<code>/buzz')
@require_auth
def buzz(code):
    data = body()
    row, state = action_room(code, data)
    recognizer = data.get('recognizer', 'cloud')
    if recognizer not in ('browser', 'cloud'):
        raise ApiError('Phương thức nhận dạng không hợp lệ.')
    if row.mode != 'read' or state['phase'] != 'question' or state['holder']:
        raise ApiError('Lượt đọc đã thuộc về người khác hoặc câu đã kết thúc.', 409, 'turn_taken')
    if state.get('voice_ready_at', 0) < engine.millis()-10000:
        raise ApiError('Bộ nhận dạng tạm mất kết nối.', 503, 'game_voice_unavailable')
    # The DB lock ensures two simultaneous buzzes cannot both grant publication.
    media.permission(row, g.user.id, True)
    at = engine.millis()
    state.update(holder=g.user.id, phase='reading', buzzed_at=at, deadline=at+8000, recognizer=recognizer)
    return changed(row, state)


@bp.post('/rooms/<code>/speech-answer')
@require_auth
def speech_answer(code):
    """Casual beta: browser text is untrusted; holder, round and score stay server-owned."""
    data = body()
    row, state = action_room(code, data)
    if row.mode != 'read' or state['holder'] != g.user.id or state.get('recognizer') != 'browser':
        raise ApiError('Bạn không giữ lượt nhận dạng trên trình duyệt.', 403)
    if state['phase'] == 'results':
        return jsonify(engine.public_room(row))  # Retry after a lost response cannot award points twice.
    if state['phase'] != 'reading':
        raise ApiError('Lượt đọc đã kết thúc.', 409, 'round_closed')
    alternatives = data.get('alternatives')
    if (not isinstance(alternatives, list) or not 1 <= len(alternatives) <= 3 or
            any(not isinstance(text, str) or not 1 <= len(text.strip()) <= 100 for text in alternatives)):
        raise ApiError('Kết quả nhận dạng không hợp lệ.')
    word = state['questions'][state['index']]
    answer = next((text.strip() for text in alternatives if engine.speech_matches(text, word)), alternatives[0].strip())
    media.permission(row, g.user.id, False)
    state.update(phase='judging')
    engine.submit(state, g.user.id, answer, engine.millis(), 'read')
    return changed(row, state)


@bp.post('/rooms/<code>/finish-reading')
@require_auth
def finish_reading(code):
    data = body()
    row, state = action_room(code, data)
    if row.mode != 'read' or state['holder'] != g.user.id:
        raise ApiError('Bạn không giữ lượt đọc.', 403)
    if state['phase'] == 'reading':
        if data.get('fallback') is True and state.get('recognizer') == 'browser':
            # Retain the live microphone and captured audio while the player continues.
            state['recognizer'] = 'cloud'
            return changed(row, state)
        media.permission(row, g.user.id, False)
        state.update(phase='judging', deadline=engine.millis()+30000, recognizer='cloud')
    return changed(row, state)


@bp.post('/rooms/<code>/audio')
@require_auth
def audio(code):
    row, _ = engine.locked(code, g.user.id)
    if row.mode != 'read' or not media.configured() or row.status in ('closed', 'finished'):
        raise ApiError('Âm thanh không khả dụng trong phòng này.', 409)
    return jsonify(url=current_app.config.get('LIVEKIT_PUBLIC_URL') or current_app.config['LIVEKIT_URL'],
                   token=media.access_token(row, g.user.id, g.user.name))


@bp.post('/rooms/<code>/leave')
@require_auth
def leave(code):
    row, state = engine.locked(code, g.user.id)
    player = next(p for p in state['players'] if p['id'] == g.user.id)
    player.update(left=True, ready=False)
    if row.mode == 'read' and state.get('holder') == g.user.id and state['phase'] in ('reading', 'judging'):
        try:
            media.permission(row, g.user.id, False)
            engine.conclude(state, engine.millis(), 'Người giữ mic đã rời phòng. Câu này không tính điểm.')
        except ApiError:
            state.update(phase='closed', deadline=None)
    players = [p for p in state['players'] if not p['left']]
    if not players:
        state.update(phase='closed', deadline=None)
    elif row.host_id == g.user.id:
        row.host_id = players[0]['id']
    return changed(row, state)


@bp.post('/socket-ticket')
@require_auth
def socket_ticket():
    import time
    token = jwt.encode({'sid': g.auth_session.id, 'sub': g.user.id, 'aud': 'game-socket', 'exp': int(time.time())+60},
                       current_app.config['AUTH_SECRET_KEY'], algorithm='HS256')
    return jsonify(ticket=token)
