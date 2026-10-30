from sqlalchemy.dialects.postgresql import JSONB

from extensions import db

json_type = db.JSON().with_variant(JSONB(), 'postgresql')


class DictionaryEntry(db.Model):
    __tablename__ = 'dictionary_entries'
    id = db.Column(db.String(80), primary_key=True)
    word = db.Column(db.Text, nullable=False)
    reading = db.Column(db.Text, nullable=False)
    # Keep alternate spellings, reading restrictions and individual senses intact.
    content = db.Column(json_type, nullable=False)
    common = db.Column(db.Boolean, nullable=False, default=False)


class DictionaryTerm(db.Model):
    __tablename__ = 'dictionary_terms'
    id = db.Column(db.Integer, primary_key=True)
    entry_id = db.Column(db.String(80), db.ForeignKey('dictionary_entries.id', ondelete='CASCADE'), nullable=False, index=True)
    kind = db.Column(db.String(16), nullable=False)
    text = db.Column(db.Text, nullable=False, index=True)
    __table_args__ = (db.UniqueConstraint('entry_id', 'kind', 'text', name='uq_dictionary_term'),)


class DictionaryKanji(db.Model):
    __tablename__ = 'dictionary_kanji'
    literal = db.Column(db.String(4), primary_key=True)
    content = db.Column(json_type, nullable=False)
    search_text = db.Column(db.Text, nullable=False)
    strokes = db.Column(db.Integer, nullable=False)


class DictionarySource(db.Model):
    __tablename__ = 'dictionary_sources'
    id = db.Column(db.String(64), primary_key=True)
    content = db.Column(json_type, nullable=False)


class DictionaryHistory(db.Model):
    __tablename__ = 'dictionary_history'
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    items = db.Column(json_type, nullable=False, default=list)
