"""Add JLPT vocabulary textbooks, lessons and ordered entries."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade():
    json_type = sa.JSON().with_variant(JSONB(), "postgresql")
    op.create_table("vocabulary_textbooks",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("level", sa.String(2), nullable=False),
        sa.Column("source_url", sa.Text, nullable=False),
        sa.CheckConstraint("level IN ('N5','N4','N3','N2','N1')", name="ck_vocabulary_level"))
    op.create_index("ix_vocabulary_textbooks_level", "vocabulary_textbooks", ["level"])
    op.create_table("vocabulary_lessons",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("textbook_id", sa.String(64), sa.ForeignKey("vocabulary_textbooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit_number", sa.Integer, nullable=False),
        sa.Column("unit_title", sa.Text, nullable=False),
        sa.Column("number", sa.Integer, nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("source_url", sa.Text, nullable=False),
        sa.Column("audio_urls", json_type, nullable=False),
        sa.UniqueConstraint("textbook_id", "unit_number", "number", name="uq_vocabulary_lesson_order"),
        sa.CheckConstraint("unit_number > 0 AND number > 0", name="ck_vocabulary_lesson_order"))
    op.create_table("vocabulary_words",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("lesson_id", sa.String(100), sa.ForeignKey("vocabulary_lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer, nullable=False),
        sa.Column("word", sa.Text, nullable=False),
        sa.Column("reading", sa.Text, nullable=False),
        sa.Column("meaning_vi", sa.Text, nullable=False),
        sa.Column("han_viet", sa.Text),
        sa.Column("details", json_type, nullable=False),
        sa.UniqueConstraint("lesson_id", "number", name="uq_vocabulary_word_order"),
        sa.CheckConstraint("number > 0", name="ck_vocabulary_word_number"))


def downgrade():
    op.drop_table("vocabulary_words")
    op.drop_table("vocabulary_lessons")
    op.drop_index("ix_vocabulary_textbooks_level", table_name="vocabulary_textbooks")
    op.drop_table("vocabulary_textbooks")
