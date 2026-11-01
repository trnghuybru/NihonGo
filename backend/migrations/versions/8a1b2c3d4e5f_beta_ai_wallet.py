"""Per-user Gemini budget and attempt ledger for invite beta."""
from alembic import op
import sqlalchemy as sa

revision = "8a1b2c3d4e5f"
down_revision = "4e56f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("beta_ai_wallets",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("spent_micro_usd", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("held_micro_usd", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.BigInteger(), nullable=False))
    op.create_table("beta_ai_attempts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("held_micro_usd", sa.BigInteger(), nullable=False),
        sa.Column("charged_micro_usd", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("finished_at", sa.BigInteger()),
        sa.Column("expires_at", sa.BigInteger()))
    op.create_index("ix_beta_ai_attempts_user_id", "beta_ai_attempts", ["user_id"])


def downgrade():
    op.drop_index("ix_beta_ai_attempts_user_id", table_name="beta_ai_attempts")
    op.drop_table("beta_ai_attempts")
    op.drop_table("beta_ai_wallets")
