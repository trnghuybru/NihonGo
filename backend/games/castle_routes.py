import copy
import re
from flask import g, jsonify, request, current_app
from sqlalchemy import select
from api_errors import ApiError
from auth.security import require_auth, body, limit
from extensions import db
from .routes import bp
from .models import GameRoom
from . import engine, castle


def load(code):
    row, state = engine.locked(code, allow_castle=True)
    if state.get('game') != 'castle':
        raise ApiError('Đây không phải phòng Công thành Momo.', 409, 'wrong_game')
    return row, state


def save(row, state):
    engine.mutate(row, state)
    db.session.commit()
    current_app.extensions['game_socketio'].emit('room_changed', {'code': row.code, 'version': row.version},
                                               to=row.code, namespace='/games')
    return jsonify(castle.public(row, g.user.id))


def participant(state, include_left=False):
    for i, p in enumerate(state['players']):
        if p['id'] == g.user.id and (include_left or not p['left']):
            return i
    raise ApiError('Bạn không ở trong phòng này.', 403, 'room_forbidden')


@bp.get('/resolve/<code>')
@require_auth
def resolve(code):
    limit('game-resolve', g.user.id, 60, 60)
    if not re.fullmatch(r'[A-Za-z0-9]{6}', code):
        raise ApiError('Mã phòng không hợp lệ.')
    row = db.session.scalar(select(GameRoom).where(GameRoom.code == code.upper()))
    if not row:
        raise ApiError('Không tìm thấy phòng chơi.', 404)
    if row.expires_at <= engine.millis():
        raise ApiError('Phòng chơi đã hết hạn.', 410)
    return jsonify(game='shared' if row.state.get('session') else row.state.get('game', 'vocabulary'), mode=row.mode, code=row.code)


@bp.post('/castle/rooms')
@require_auth
def castle_create():
    limit('game-create', g.user.id, 20, 3600)
    row = castle.create(g.user, body(), engine.millis())
    return save(row, copy.deepcopy(row.state))


@bp.get('/castle/rooms/<code>')
@require_auth
def castle_snapshot(code):
    limit('castle-read', g.user.id, 900, 60)
    row, state = load(code)
    me = participant(state, include_left=state['phase'] in ('finished', 'ending', 'closed'))
    at = engine.millis()
    changed = castle.tick(state, at)
    state['players'][me]['last_seen'] = at
    # Snapshot cũng là heartbeat; không phát notification để tránh vòng lặp fetch.
    if changed:
        engine.mutate(row, state)
    else:
        row.state = state
    db.session.commit()
    return jsonify(castle.public(row, g.user.id))


@bp.post('/castle/rooms/<code>/<action>')
@require_auth
def castle_action(code, action):
    limit('castle-action', g.user.id, 180, 60)
    if action not in ('join', 'ready', 'start', 'answer', 'skill', 'leave'):
        raise ApiError('Thao tác không hợp lệ.', 404)
    data, at = body(), engine.millis()
    row, state = load(code)
    castle.tick(state, at)
    if action == 'join':
        if state.get('session'):
            raise ApiError('Hãy vào qua phòng chung.', 409, 'shared_lobby')
        existing = next((p for p in state['players'] if p['id'] == g.user.id), None)
        if existing and not existing['left']:
            existing['last_seen'] = at
            return save(row, state)
        if state['phase'] != 'waiting':
            raise ApiError('Trận đã bắt đầu hoặc kết thúc.', 409)
        if len(state['players']) >= 2:
            raise ApiError('Phòng đã đủ hai người.', 409, 'room_full')
        state['players'].append(castle.member(g.user, at))
        return save(row, state)
    side = participant(state, include_left=action == 'leave' and state['phase'] in ('ending', 'finished', 'closed'))
    p = state['players'][side]
    p['last_seen'] = at
    if action in ('ready','start') and state.get('session'):
        raise ApiError('Hãy dùng điều khiển phòng chung.', 409, 'shared_lobby')
    if action == 'ready':
        if state['phase'] != 'waiting' or type(data.get('ready')) is not bool:
            raise ApiError('Không đổi được trạng thái sẵn sàng.', 409)
        p['ready'] = data['ready']
    elif action == 'start':
        if row.host_id != g.user.id:
            raise ApiError('Chỉ chủ phòng được bắt đầu.', 403)
        if state['phase'] != 'waiting' or len(state['players']) != 2 or not all(x['ready'] and at - x['last_seen'] < castle.GRACE for x in state['players']):
            raise ApiError('Cần hai người đang kết nối và sẵn sàng.', 409)
        state.update(phase='countdown', last_tick=at)
    elif action == 'answer':
        castle.answer(state, side, data.get('index'), data.get('round_id'))
    elif action == 'skill':
        castle.skill(state, side, data.get('kind'))
    elif action == 'leave':
        if state['phase'] == 'waiting':
            if row.host_id == g.user.id:
                state['phase'] = 'closed'
            else:
                state['players'].pop(side)
                # Người vừa rời vẫn nhận được acknowledgement, không cần private snapshot.
                engine.mutate(row, state)
                db.session.commit()
                current_app.extensions['game_socketio'].emit('room_changed', {'code': row.code, 'version': row.version}, to=row.code, namespace='/games')
                return jsonify(left=True)
        elif state['phase'] in ('countdown', 'battle'):
            p['left'] = True
            castle.finish(state, 'Đối thủ đã rời trận', 1 - side)
    return save(row, state)
