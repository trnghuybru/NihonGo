"""Store timestamped Japanese captions with a trigram search index."""
from alembic import op
import sqlalchemy as sa

revision = "c0d1e2f3a4b5"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public")
    op.create_table("example_videos",
        sa.Column("id", sa.String(11), primary_key=True),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("channel", sa.Text, nullable=False),
        sa.Column("duration_seconds", sa.Float, nullable=False),
        sa.Column("language", sa.String(8), nullable=False),
        sa.Column("caption_kind", sa.String(16), nullable=False),
        sa.CheckConstraint("duration_seconds > 0", name="ck_example_video_duration"))
    op.create_table("video_caption_segments",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("video_id", sa.String(11), sa.ForeignKey("example_videos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("search_text", sa.Text, nullable=False),
        sa.Column("start_seconds", sa.Float, nullable=False),
        sa.Column("end_seconds", sa.Float, nullable=False),
        sa.UniqueConstraint("video_id", "sequence", name="uq_video_caption_sequence"),
        sa.CheckConstraint("sequence > 0 AND start_seconds >= 0 AND end_seconds > start_seconds",
                           name="ck_video_caption_times"))
    op.create_index("ix_video_caption_search_trgm", "video_caption_segments", ["search_text"],
                    postgresql_using="gin", postgresql_ops={"search_text": "public.gin_trgm_ops"})


def downgrade():
    op.drop_table("video_caption_segments")
    op.drop_table("example_videos")
    # pg_trgm may be used by other tables; retain the shared extension.
