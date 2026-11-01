"""Persistent per-user daily video and Gemini Live quotas."""
from extensions import db
from auth.models import new_id, now


class DailyQuota(db.Model):
    __tablename__ = "beta_daily_quotas"
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day = db.Column(db.Date, primary_key=True)
    video_id = db.Column(db.String(11))
    live_count = db.Column(db.Integer, nullable=False, default=0)


class DailyLiveSession(db.Model):
    __tablename__ = "beta_daily_live_sessions"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    day = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(16), nullable=False, default="pending")
    created_at = db.Column(db.BigInteger, nullable=False, default=now)
    expires_at = db.Column(db.BigInteger, nullable=False)
