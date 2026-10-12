from extensions import db


class ExampleVideo(db.Model):
    __tablename__ = "example_videos"
    id = db.Column(db.String(11), primary_key=True)
    title = db.Column(db.Text, nullable=False)
    channel = db.Column(db.Text, nullable=False)
    duration_seconds = db.Column(db.Float, nullable=False)
    language = db.Column(db.String(8), nullable=False)
    caption_kind = db.Column(db.String(16), nullable=False)
    __table_args__ = (
        db.CheckConstraint("duration_seconds > 0", name="ck_example_video_duration"),
    )


class CaptionSegment(db.Model):
    __tablename__ = "video_caption_segments"
    id = db.Column(db.String(128), primary_key=True)
    video_id = db.Column(db.String(11), db.ForeignKey("example_videos.id", ondelete="CASCADE"), nullable=False)
    sequence = db.Column(db.Integer, nullable=False)
    text = db.Column(db.Text, nullable=False)
    search_text = db.Column(db.Text, nullable=False)
    start_seconds = db.Column(db.Float, nullable=False)
    end_seconds = db.Column(db.Float, nullable=False)
    __table_args__ = (
        db.UniqueConstraint("video_id", "sequence", name="uq_video_caption_sequence"),
        db.CheckConstraint("sequence > 0 AND start_seconds >= 0 AND end_seconds > start_seconds",
                           name="ck_video_caption_times"),
        db.Index("ix_video_caption_search_trgm", "search_text", postgresql_using="gin",
                 postgresql_ops={"search_text": "public.gin_trgm_ops"}).ddl_if(dialect="postgresql"),
    )
