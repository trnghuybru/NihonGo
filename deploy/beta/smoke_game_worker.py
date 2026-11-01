"""Create a disposable reading room and wait for the voice worker heartbeat."""
import time
import uuid

from app import app
from auth.models import User
from extensions import db
from games import engine
from games.models import GameRoom


with app.app_context():
    user = User(name="Game smoke test", email=f"game-smoke-{uuid.uuid4().hex}@invalid.example",
                phone="", active=True, email_verified=True)
    db.session.add(user)
    db.session.flush()
    room = engine.create_room(user, {"mode": "read", "level": "N5", "source": "jlpt",
                                     "question_count": 1, "seconds": 10})
    db.session.commit()
    user_id, room_id = user.id, room.id
    try:
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            db.session.expire_all()
            state = db.session.get(GameRoom, room_id).state
            if state.get("voice_ready_at", 0) > 0:
                print("game_worker=joined_and_ready")
                break
            time.sleep(1)
        else:
            raise RuntimeError("voice_worker_not_ready")
    finally:
        db.session.remove()
        db.session.delete(db.session.get(GameRoom, room_id))
        db.session.delete(db.session.get(User, user_id))
        db.session.commit()
        print("game_worker=cleaned")
