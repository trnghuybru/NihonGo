"""Add writing submissions for submitted essays."""

from alembic import op
import sqlalchemy as sa

revision = "0f3b4c5d6e7f"
down_revision = "d6d2f3c4e5a6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "writing_submissions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("prompt_id", sa.String(length=64), nullable=True),
        sa.Column("prompt_title", sa.String(length=160), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("corrected_text", sa.Text(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=False),
        sa.Column("submitted_at", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["prompt_id"], ["writing_prompts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_writing_submissions_user_id", "writing_submissions", ["user_id"], unique=False)
    op.create_index("ix_writing_submissions_prompt_id", "writing_submissions", ["prompt_id"], unique=False)


def downgrade():
    op.drop_index("ix_writing_submissions_prompt_id", table_name="writing_submissions")
    op.drop_index("ix_writing_submissions_user_id", table_name="writing_submissions")
    op.drop_table("writing_submissions")
