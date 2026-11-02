import copy
import os
import threading
import time
import jwt
from flask import request
from flask_socketio import SocketIO, disconnect, join_room
from sqlalchemy import or_, select
from api_errors import ApiError
from auth.models import AuthSession, User, now
from extensions import db
from .models import GameRoom
from . import engine, media


def sync_rooms(socketio, versions):
    """Advance and broadcast room versions, including terminal changes from workers."""
    rows = list(db.session.scalars(select(GameRoom).where(or_(
        GameRoom.status.notin_(('closed', 'finished')),
        GameRoom.updated_at > engine.millis() - 120000)).limit(200)))
    for item in rows:
        row = db.session.scalar(select(GameRoom).where(GameRoom.id == item.id)
            .with_for_update(skip_locked=True).execution_options(populate_existing=True))
        if not row:
            continue
        state = copy.deepcopy(row.state)
        before = state['phase']
        at = engine.millis()
        changed = engine.tick(state, row.mode, at)
        if row.expires_at <= at and state['phase'] not in ('finished', 'closed'):
            state.update(phase='closed', deadline=None)
            changed = True
        if row.mode == 'read' and state.get('holder') and before == 'reading' and state['phase'] != 'reading':
            try:
                media.permission(row, state['holder'], False)
            except ApiError:
                state.update(phase='closed', deadline=None, result={'technical_error': 'Mất kết nối âm thanh. Phòng đã dừng.'})
        if changed:
            engine.mutate(row, state)
        db.session.commit()
        # Also wakes clients when the voice worker has updated a room in another process.
        if versions.get(row.id) != row.version:
            versions[row.id] = row.version
            socketio.emit('room_changed', {'code': row.code, 'version': row.version}, to=row.code, namespace='/games')


def init_games(app, start_timer=True):
    for key in ('LIVEKIT_URL', 'LIVEKIT_PUBLIC_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'GAME_REDIS_URL'):
        app.config.setdefault(key, os.getenv(key, ''))
    origins = os.getenv('GAME_SOCKET_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')
    socketio = SocketIO(app, async_mode='threading', cors_allowed_origins=origins,
                        message_queue=app.config['GAME_REDIS_URL'] or None, logger=False, engineio_logger=False)
    app.extensions['game_socketio'] = socketio
    connections = {}
    from .routes import bp
    app.register_blueprint(bp)

    def authenticated(sid):
        info = connections.get(sid)
        if not info:
            return None
        session = db.session.get(AuthSession, info[0])
        if not session or session.revoked_at or min(session.access_expires_at, session.expires_at) <= now():
            return None
        user = db.session.get(User, session.user_id)
        if not user or not user.active:
            return None
        from auth.beta import check_invite
        from auth.security import AuthError
        try:
            check_invite(user.email)
        except AuthError:
            return None
        return user.id

    @socketio.on('connect', namespace='/games')
    def connect(auth):
        try:
            claims = jwt.decode((auth or {}).get('ticket', ''), app.config['AUTH_SECRET_KEY'],
                                algorithms=['HS256'], audience='game-socket')
            connections[request.sid] = (claims['sid'], claims['sub'])
            if authenticated(request.sid) != claims['sub']:
                connections.pop(request.sid, None)
                return False
        except (jwt.PyJWTError, KeyError, TypeError):
            return False

    @socketio.on('subscribe', namespace='/games')
    def subscribe(data):
        user_id = authenticated(request.sid)
        if not user_id:
            disconnect()
            return {'ok': False}
        try:
            code = data.get('code', '') if isinstance(data, dict) else ''
            row, _ = engine.locked(code, user_id)
            db.session.commit()
            join_room(row.code)
            return {'ok': True}
        except ApiError:
            db.session.rollback()
            return {'ok': False}

    @socketio.on('disconnect', namespace='/games')
    def disconnected(_reason=None):
        connections.pop(request.sid, None)

    versions = {}
    def timers():
        while True:
            socketio.sleep(0.25)
            with app.app_context():
                try:
                    for sid in list(connections):
                        if authenticated(sid) is None:
                            socketio.server.disconnect(sid, namespace='/games')
                    sync_rooms(socketio, versions)
                except Exception as error:
                    db.session.rollback()
                    app.logger.warning('Game timer failed (%s)', type(error).__name__)
                finally:
                    db.session.remove()
    if start_timer and not app.testing and os.getenv('GAME_TIMERS_ENABLED', '1') != '0':
        socketio.start_background_task(timers)
    return socketio
