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


class ShadowingTranslation(db.Model):
    __tablename__ = 'shadowing_translations'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = db.Column(db.String(36), db.ForeignKey('shadowing_jobs.id', ondelete='CASCADE'), nullable=False, unique=True)
    language = db.Column(db.String(8), nullable=False, default='vi')
    source_hash = db.Column(db.String(64), nullable=False)
    source = db.Column(db.JSON, nullable=False)
    translations = db.Column(db.JSON, nullable=False, default=dict)
    model = db.Column(db.String(100), nullable=False)
    prompt_version = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(16), nullable=False, default='queued', index=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    error_message = db.Column(db.Text)
    created_at = db.Column(db.BigInteger, nullable=False)
    updated_at = db.Column(db.BigInteger, nullable=False)
    last_enqueued_at = db.Column(db.BigInteger)
    lease_token = db.Column(db.String(36))
    lease_expires_at = db.Column(db.BigInteger)
