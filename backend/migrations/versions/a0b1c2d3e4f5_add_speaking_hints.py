"""Cache guided speaking hints on assistant messages."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "a0b1c2d3e4f5"
down_revision = "de6f718293a4"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("conversation_messages") as batch:
        batch.add_column(sa.Column("hint_payload", sa.JSON().with_variant(JSONB(), "postgresql")))
        batch.add_column(sa.Column("hint_attempt_id", sa.Uuid(as_uuid=False)))
        batch.add_column(sa.Column("hint_started_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("hint_used_level", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    with op.batch_alter_table("conversation_messages") as batch:
        for name in ("hint_payload", "hint_attempt_id", "hint_started_at", "hint_used_level"):
            batch.drop_column(name)
