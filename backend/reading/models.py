from sqlalchemy.dialects.postgresql import JSONB
from extensions import db

json_type = db.JSON().with_variant(JSONB(), 'postgresql')
LEVELS = ('N5', 'N4', 'N3', 'N2', 'N1')
TYPES = {'short': ('短文', 'Đoản văn'), 'medium': ('中文', 'Trung văn'),
         'long': ('長文', 'Trường văn'), 'information': ('情報検索', 'Tìm thông tin'),
         'opinion': ('主張理解', 'Hiểu quan điểm')}


class ReadingPassage(db.Model):
    __tablename__ = 'reading_passages'
    id = db.Column(db.String(48), primary_key=True)
    level = db.Column(db.String(2), nullable=False, index=True)
    kind = db.Column(db.String(16), nullable=False, index=True)
    title = db.Column(db.Text, nullable=False)
    exercise = db.Column(db.Integer, nullable=False)
    paragraph = db.Column(db.Integer, nullable=False)
    text = db.Column(db.Text, nullable=False)
    source_url = db.Column(db.Text, nullable=False)
    questions = db.Column(json_type, nullable=False)
    analysis = db.Column(json_type, nullable=True)
    __table_args__ = (db.UniqueConstraint('level', 'title', 'paragraph', 'source_url', name='uq_reading_source'),)


class ReadingAttempt(db.Model):
    __tablename__ = 'reading_attempts'
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    passage_id = db.Column(db.String(48), db.ForeignKey('reading_passages.id', ondelete='CASCADE'), nullable=False)
    request_id = db.Column(db.String(36), nullable=False)
    version = db.Column(db.String(64), nullable=False)
    result = db.Column(json_type, nullable=False)
    created_at = db.Column(db.BigInteger, nullable=False)
    __table_args__ = (
        db.UniqueConstraint('user_id', 'request_id', name='uq_reading_attempt_request'),
        db.Index('ix_reading_attempt_user_passage', 'user_id', 'passage_id', 'created_at'),
    )


class ReadingInsight(db.Model):
    __tablename__ = 'reading_insights'
    passage_id = db.Column(db.String(48), db.ForeignKey('reading_passages.id', ondelete='CASCADE'), primary_key=True)
    kind = db.Column(db.String(64), primary_key=True)
    source_hash = db.Column(db.String(64), nullable=False)
    status = db.Column(db.String(16), nullable=False)
    lease = db.Column(db.String(36), nullable=True)
    updated_at = db.Column(db.BigInteger, nullable=False)
    payload = db.Column(json_type, nullable=True)
