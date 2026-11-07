"""Một party/mã phòng, nhiều trò; session giữ nguyên qua các vòng."""
import copy
import secrets
import uuid
from types import SimpleNamespace
from flask import g, jsonify, current_app
from sqlalchemy import select
from api_errors import ApiError
from auth.models import User
from auth.security import require_auth, body, limit
from extensions import db
from vocabulary.models import JLPT_LEVELS
from .models import GameRoom
from .routes import bp, advance
from . import engine, castle, media

GAMES = ('castle', 'write', 'read')


def public(row):
    s, session = row.state, row.state['session']
    return dict(id=row.id, code=row.code, host_id=row.host_id, version=row.version,
                phase=s['phase'], game='castle' if s.get('game') == 'castle' else row.mode if s.get('game') != 'lobby' else None,
                selected_game=session['selected_game'], settings=session['settings'],
                members=session['members'], round=session['round'], read_available=media.configured(),
                configured=s.get('game') != 'lobby')


def notify(row):
    db.session.commit()
    current_app.extensions['game_socketio'].emit('room_changed', {'code': row.code, 'version': row.version}, to=row.code, namespace='/games')
    return jsonify(public(row))


def load(code, membership=True):
    row, s = engine.locked(code, allow_castle=True, allow_lobby=True)
    if not s.get('session'):
        raise ApiError('Đây không phải phòng dùng chung.', 409)
    if membership and not any(p['id'] == g.user.id for p in s['session']['members']):
        raise ApiError('Bạn chưa vào phòng này.', 403)
    advance(row, s)
    return row, s


@bp.post('/lobbies')
@require_auth
def shared_create():
    limit('game-create', g.user.id, 20, 3600)
    data, at = body(), engine.millis()
    selected, level = data.get('game'), data.get('level', 'N5')
    if selected is not None and selected not in GAMES or level not in JLPT_LEVELS:
        raise ApiError('Chọn game và trình độ hợp lệ.')
    db.session.execute(select(User.id).where(User.id == g.user.id).with_for_update())
    rows = list(db.session.scalars(select(GameRoom).where(GameRoom.host_id == g.user.id, GameRoom.status != 'closed', GameRoom.expires_at > at)))
    if sum(row.status != 'finished' or bool(row.state.get('session')) for row in rows) >= 3:
        raise ApiError('Bạn đang có 3 phòng đang mở.', 409)
    for _ in range(20):
        code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
        if not db.session.scalar(select(GameRoom.id).where(GameRoom.code == code)):
            break
    else:
        raise ApiError('Chưa tạo được mã phòng.', 503)
    members = [dict(id=g.user.id, name=g.user.name, ready=False)]
    settings = dict(level=level, source='starter' if selected == 'castle' else 'jlpt', topic='Tất cả', lesson_id=None,
                    question_count=10, seconds=9 if selected == 'castle' else 15)
    s = dict(game='lobby', phase='waiting', deadline=None, players=[dict(**members[0], left=False, score=0)],
             session=dict(selected_game=selected, settings=settings, members=members, round=0))
    row = GameRoom(id=str(uuid.uuid4()), code=code, host_id=g.user.id, mode='write', status='waiting',
                   state=s, version=1, updated_at=at, expires_at=at+7200000)
    db.session.add(row)
    db.session.flush()
    return notify(row)


@bp.get('/lobbies/<code>')
@require_auth
def shared_snapshot(code):
    limit('lobby-read', g.user.id, 600, 60)
    row, s = load(code)
    # Metadata heartbeat không phát event, tránh vòng fetch tự kích hoạt.
    if s.get('game') == 'castle':
        for p in s['players']:
            if p['id'] == g.user.id and not p['left']:
                p['last_seen'] = engine.millis()
    if s != row.state:
        engine.mutate(row, s)
    db.session.commit()
    return jsonify(public(row))


@bp.post('/lobbies/<code>/<action>')
@require_auth
def shared_action(code, action):
    limit('lobby-action', g.user.id, 120, 60)
    if action not in ('join', 'select', 'ready', 'start', 'leave'):
        raise ApiError('Thao tác không hợp lệ.', 404)
    data, at = body(), engine.millis()
    row, s = load(code, membership=action != 'join')
    session, idle = s['session'], s['phase'] in ('waiting', 'finished', 'closed')
    members = session['members']
    me = next((p for p in members if p['id'] == g.user.id), None)
    if action == 'join':
        if not me:
            if not idle or len(members) >= 8 or not members:
                raise ApiError('Phòng đang chơi hoặc đã đủ 8 người.', 409)
            members.append(dict(id=g.user.id, name=g.user.name, ready=False))
            for p in members:
                p['ready'] = False
            if s['phase'] == 'waiting' and s.get('game') != 'lobby':
                if s.get('game') == 'castle':
                    s['players'].append(castle.member(g.user, at))
                else:
                    s['players'].append(dict(id=g.user.id, name=g.user.name, ready=False, left=False, score=0))
    elif action == 'select':
        if row.host_id != g.user.id:
            raise ApiError('Chỉ chủ phòng được đổi game.', 403)
        if not idle:
            raise ApiError('Hãy kết thúc trận trước khi đổi game.', 409)
        game = data.get('game', session['selected_game'])
        if game not in GAMES:
            raise ApiError('Hãy chọn một trò chơi.')
        level = data.get('level', session['settings']['level'])
        source = data.get('source', 'starter' if game == 'castle' else 'jlpt')
        seconds = data.get('seconds', 9 if game == 'castle' else 15)
        config = dict(level=level, source=source, topic=data.get('topic', 'Tất cả'), lesson_id=data.get('lesson_id'),
                      seconds=seconds, question_count=data.get('question_count', 10))
        # Chuẩn bị engine trước để voice worker kết nối được mode đọc trong lobby.
        if game == 'castle':
            fresh = castle.create(g.user, {**config, 'round_seconds': seconds}, at, state_only=True)
        else:
            fresh = engine.create_room(g.user, {**config, 'mode': game}, state_only=True)
        for p in members:
            p['ready'] = False
        session.update(selected_game=game, settings=config)
        fresh['players'] = [castle.member(SimpleNamespace(**p), at) if game == 'castle' else dict(**p, left=False, score=0) for p in members]
        fresh['session'] = session
        s = fresh
        row.mode = 'read' if game == 'read' else 'write'
    elif action == 'ready':
        if s['phase'] != 'waiting' or s.get('game') == 'lobby' or type(data.get('ready')) is not bool:
            raise ApiError('Chờ chủ phòng áp dụng thiết lập trước khi sẵn sàng.', 409)
        me['ready'] = data['ready']
    elif action == 'start':
        if row.host_id != g.user.id:
            raise ApiError('Chỉ chủ phòng được bắt đầu.', 403)
        game = session['selected_game']
        if not idle or s['phase'] != 'waiting' or s.get('game') == 'lobby' or len(members) < 2 or not all(p['ready'] for p in members):
            raise ApiError('Cần áp dụng game và tất cả người chơi sẵn sàng.', 409)
        if game == 'castle' and len(members) != 2:
            raise ApiError('Công thành cần đúng 2 người; hãy chọn trò khác khi phòng đông hơn.', 409)
        if game == 'read' and (not media.configured() or s.get('voice_ready_at', 0) < at-10000):
            raise ApiError('Âm thanh đang kết nối. Hãy thử lại sau.', 503, 'game_voice_unavailable')
        if game == 'castle':
            for p in s['players']:
                p['last_seen'] = at
            s.update(phase='countdown', last_tick=at)
        else:
            s.update(phase='countdown', deadline=at+3000)
        row.expires_at = at + 7200000
        session['round'] += 1
        for p in members:
            p['ready'] = False
    elif action == 'leave':
        members[:] = [p for p in members if p['id'] != g.user.id]
        for p in s['players']:
            if p['id'] == g.user.id:
                p['left'] = True
        if not members:
            s.update(phase='closed', deadline=None)
        elif not idle:
            if s.get('game') == 'castle':
                side = next(i for i,p in enumerate(s['players']) if p['id'] == g.user.id)
                castle.finish(s, 'Đối thủ đã rời phòng', 1-side)
            else:
                if row.mode == 'read' and s.get('holder') == g.user.id:
                    try:
                        media.permission(row, g.user.id, False)
                    except ApiError:
                        pass
                s.update(phase='finished', deadline=None)
        elif s['phase'] == 'waiting':
            s['players'] = [p for p in s['players'] if p['id'] != g.user.id]
        if members and row.host_id == g.user.id:
            row.host_id = members[0]['id']
        for p in members:
            p['ready'] = False
        engine.mutate(row,s)
        db.session.commit()
        current_app.extensions['game_socketio'].emit('room_changed', {'code':row.code,'version':row.version}, to=row.code,namespace='/games')
        return jsonify(left=True)
    engine.mutate(row, s)
    return notify(row)
