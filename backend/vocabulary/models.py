from sqlalchemy.dialects.postgresql import JSONB

from extensions import db

JLPT_LEVELS = ("N5", "N4", "N3", "N2", "N1")


class VocabularyTextbook(db.Model):
    __tablename__ = "vocabulary_textbooks"
    id = db.Column(db.String(64), primary_key=True)
    title = db.Column(db.Text, nullable=False)
    level = db.Column(db.String(2), nullable=False, index=True)
    source_url = db.Column(db.Text, nullable=False)
    __table_args__ = (
        db.CheckConstraint("level IN ('N5','N4','N3','N2','N1')", name="ck_vocabulary_level"),
    )


class VocabularyLesson(db.Model):
    __tablename__ = "vocabulary_lessons"
    id = db.Column(db.String(100), primary_key=True)
    textbook_id = db.Column(db.String(64), db.ForeignKey("vocabulary_textbooks.id", ondelete="CASCADE"), nullable=False)
    unit_number = db.Column(db.Integer, nullable=False)
    unit_title = db.Column(db.Text, nullable=False)
    number = db.Column(db.Integer, nullable=False)
    title = db.Column(db.Text, nullable=False)
    source_url = db.Column(db.Text, nullable=False)
    audio_urls = db.Column(db.JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    __table_args__ = (
        db.UniqueConstraint("textbook_id", "unit_number", "number", name="uq_vocabulary_lesson_order"),
        db.CheckConstraint("unit_number > 0 AND number > 0", name="ck_vocabulary_lesson_order"),
    )


class VocabularyWord(db.Model):
    __tablename__ = "vocabulary_words"
    id = db.Column(db.String(128), primary_key=True)
    lesson_id = db.Column(db.String(100), db.ForeignKey("vocabulary_lessons.id", ondelete="CASCADE"), nullable=False)
    number = db.Column(db.Integer, nullable=False)
    word = db.Column(db.Text, nullable=False)
    reading = db.Column(db.Text, nullable=False)
    meaning_vi = db.Column(db.Text, nullable=False)
    han_viet = db.Column(db.Text)
    details = db.Column(db.JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    __table_args__ = (
        db.UniqueConstraint("lesson_id", "number", name="uq_vocabulary_word_order"),
        db.CheckConstraint("number > 0", name="ck_vocabulary_word_number"),
    )
