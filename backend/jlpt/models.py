from extensions import db


class JlptExamRecord(db.Model):
    __tablename__ = 'jlpt_exams'

    id = db.Column(db.String(32), primary_key=True)
    level = db.Column(db.String(8), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    month = db.Column(db.Integer, nullable=False)
    has_exam = db.Column(db.Boolean, nullable=False)
    source_sha256 = db.Column(db.String(64), nullable=False)
    source_data = db.Column(db.JSON, nullable=False)
    normalized = db.Column(db.JSON(none_as_null=True))


class JlptImage(db.Model):
    __tablename__ = 'jlpt_images'

    id = db.Column(db.String(64), primary_key=True)
    bucket = db.Column(db.String(128), nullable=False)
    storage_key = db.Column(db.String(256), nullable=False, unique=True)
    mime_type = db.Column(db.String(32), nullable=False)
    size_bytes = db.Column(db.Integer, nullable=False)


class JlptImport(db.Model):
    __tablename__ = 'jlpt_imports'

    source_sha256 = db.Column(db.String(64), primary_key=True)
    metadata_json = db.Column(db.JSON, nullable=False)
