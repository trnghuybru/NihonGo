"""Add per-user manual level and learning goals.

Revision ID: ab7248e36f10
Revises: d5e828d1d173
"""
from alembic import op
import sqlalchemy as sa

revision = "ab7248e36f10"
down_revision = "d5e828d1d173"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "learning_preferences",
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("level", sa.String(16), nullable=False),
        sa.Column("goal", sa.String(24), nullable=False),
        sa.Column("daily_minutes", sa.Integer(), nullable=False),
        sa.Column("level_confirmed_at", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint("level IN ('beginner', 'N5', 'N4', 'N3', 'N2', 'N1')", name="ck_learning_level"),
        sa.CheckConstraint("goal IN ('communication', 'jlpt', 'travel', 'work', 'culture')", name="ck_learning_goal"),
        sa.CheckConstraint("daily_minutes IN (5, 10, 15, 30, 60)", name="ck_learning_minutes"),
        sa.CheckConstraint("version > 0", name="ck_learning_version"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade():
    op.drop_table("learning_preferences")
