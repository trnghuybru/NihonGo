import uuid
from extensions import db


class ShadowingJob(db.Model):
    __tablename__ = 'shadowing_jobs'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id = db.Column(db.String(11), nullable=False, unique=True)
    status = db.Column(db.String(24), nullable=False, default='queued', index=True)
    title = db.Column(db.Text, nullable=False, default='')
    error_code = db.Column(db.String(40))
    error_message = db.Column(db.Text)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.BigInteger, nullable=False)
    updated_at = db.Column(db.BigInteger, nullable=False)
    last_enqueued_at = db.Column(db.BigInteger)
    lease_token = db.Column(db.String(36))
    lease_expires_at = db.Column(db.BigInteger)
    raw_captions = db.Column(db.JSON)
    display_captions = db.Column(db.JSON)
    word_analysis = db.Column(db.JSON)


class ShadowingRequest(db.Model):
    __tablename__ = 'shadowing_requests'
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    job_id = db.Column(db.String(36), db.ForeignKey('shadowing_jobs.id', ondelete='CASCADE'), primary_key=True)
    created_at = db.Column(db.BigInteger, nullable=False)
