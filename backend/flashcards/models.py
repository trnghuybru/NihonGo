from sqlalchemy.dialects.postgresql import JSONB
from extensions import db

json_type = db.JSON().with_variant(JSONB(), 'postgresql')


class FlashcardDeck(db.Model):
    __tablename__ = 'flashcard_decks'
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    title = db.Column(db.String(80), nullable=False)
    cards = db.Column(json_type, nullable=False)
    updated_at = db.Column(db.BigInteger, nullable=False)


class FlashcardFavorite(db.Model):
    __tablename__ = 'flashcard_favorites'
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    source = db.Column(db.String(16), primary_key=True)
    target = db.Column(db.String(128), primary_key=True)
    card = db.Column(json_type, nullable=False)
    created_at = db.Column(db.BigInteger, nullable=False)


class FlashcardSession(db.Model):
    __tablename__ = 'flashcard_sessions'
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    kind = db.Column(db.String(16), nullable=False)
    deck_id = db.Column(db.String(128), nullable=False)
    title = db.Column(db.Text, nullable=False)
    cards = db.Column(json_type, nullable=False)
    ratings = db.Column(json_type, nullable=False, default=dict)
    rating_times = db.Column(json_type, nullable=False, default=dict, server_default='{}')
    started_at = db.Column(db.BigInteger, nullable=False)
    finished_at = db.Column(db.BigInteger)
    __table_args__ = (db.CheckConstraint("kind IN ('lesson','custom','favorites')", name='ck_flashcard_session_kind'),)


class FlashcardDailyQuiz(db.Model):
    __tablename__ = 'flashcard_daily_quizzes'
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    study_date = db.Column(db.Date, nullable=False)
    questions = db.Column(json_type, nullable=False)
    answers = db.Column(json_type, nullable=False, default=dict)
    started_at = db.Column(db.BigInteger, nullable=False)
    finished_at = db.Column(db.BigInteger)
    __table_args__ = (db.UniqueConstraint('user_id', 'study_date', name='uq_flashcard_quiz_user_date'),)


class FlashcardSchedule(db.Model):
    __tablename__ = 'flashcard_schedules'
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    card_id = db.Column(db.String(160), primary_key=True)
    card = db.Column(json_type, nullable=False)
    fsrs_card = db.Column(json_type, nullable=False)
    due_at = db.Column(db.BigInteger, nullable=False)
    last_review_at = db.Column(db.BigInteger, nullable=False)
    review_count = db.Column(db.Integer, nullable=False, default=0)
    active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    __table_args__ = (db.Index('ix_flashcard_schedule_due', 'user_id', 'active', 'due_at'),)


class FlashcardReviewLog(db.Model):
    __tablename__ = 'flashcard_review_logs'
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    card_id = db.Column(db.String(160), nullable=False)
    session_id = db.Column(db.String(36), db.ForeignKey('flashcard_sessions.id', ondelete='CASCADE'), nullable=False)
    grade = db.Column(db.Integer, nullable=False)
    reviewed_at = db.Column(db.BigInteger, nullable=False)
    due_at = db.Column(db.BigInteger, nullable=False)
    fsrs_log = db.Column(json_type, nullable=False)
    __table_args__ = (
        db.UniqueConstraint('session_id', 'card_id', name='uq_flashcard_review_session_card'),
        db.Index('ix_flashcard_review_user_card', 'user_id', 'card_id', 'reviewed_at'),
        db.CheckConstraint('grade BETWEEN 0 AND 3', name='ck_flashcard_review_grade'),
    )


class FlashcardReminderPreference(db.Model):
    __tablename__ = 'flashcard_reminder_preferences'
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    enabled = db.Column(db.Boolean, nullable=False, default=False)
    hour = db.Column(db.Integer, nullable=False, default=19)
    minute = db.Column(db.Integer, nullable=False, default=0)
    __table_args__ = (
        db.CheckConstraint('hour BETWEEN 0 AND 23', name='ck_flashcard_reminder_hour'),
        db.CheckConstraint('minute BETWEEN 0 AND 59', name='ck_flashcard_reminder_minute'),
    )
