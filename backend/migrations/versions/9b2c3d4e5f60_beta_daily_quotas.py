"""Daily beta limits for videos and Live sessions."""
from alembic import op
import sqlalchemy as sa

revision = "9b2c3d4e5f60"
down_revision = "8a1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("beta_daily_quotas",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("video_id", sa.String(11)),
        sa.Column("live_count", sa.Integer(), nullable=False, server_default="0"))
    op.create_table("beta_daily_live_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False))
    op.create_index("ix_beta_daily_live_sessions_user_id", "beta_daily_live_sessions", ["user_id"])


def downgrade():
    op.drop_index("ix_beta_daily_live_sessions_user_id", table_name="beta_daily_live_sessions")
    op.drop_table("beta_daily_live_sessions")
    op.drop_table("beta_daily_quotas")
