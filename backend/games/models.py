from sqlalchemy.dialects.postgresql import JSONB
from extensions import db


class GameRoom(db.Model):
    __tablename__ = 'vocabulary_game_rooms'
    id = db.Column(db.String(36), primary_key=True)
    code = db.Column(db.String(6), nullable=False, unique=True, index=True)
    host_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    mode = db.Column(db.String(8), nullable=False)
    status = db.Column(db.String(16), nullable=False, index=True)
    state = db.Column(db.JSON().with_variant(JSONB(), 'postgresql'), nullable=False)
    version = db.Column(db.Integer, nullable=False, default=1)
    updated_at = db.Column(db.BigInteger, nullable=False)
    expires_at = db.Column(db.BigInteger, nullable=False, index=True)
    __table_args__ = (db.CheckConstraint("mode IN ('write','read')", name='ck_game_mode'),)
