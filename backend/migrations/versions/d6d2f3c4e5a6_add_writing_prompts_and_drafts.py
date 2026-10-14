"""Add writing prompts and user drafts."""

from alembic import op
import sqlalchemy as sa

revision = "d6d2f3c4e5a6"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "writing_prompts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("level", sa.String(length=8), nullable=False),
        sa.Column("prompt_type", sa.String(length=24), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("model_hint", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "writing_drafts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("prompt_id", sa.String(length=64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["prompt_id"], ["writing_prompts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_writing_drafts_user_id", "writing_drafts", ["user_id"], unique=False)
    op.create_index("ix_writing_drafts_prompt_id", "writing_drafts", ["prompt_id"], unique=False)


def downgrade():
    op.drop_index("ix_writing_drafts_prompt_id", table_name="writing_drafts")
    op.drop_index("ix_writing_drafts_user_id", table_name="writing_drafts")
    op.drop_table("writing_drafts")
    op.drop_table("writing_prompts")
