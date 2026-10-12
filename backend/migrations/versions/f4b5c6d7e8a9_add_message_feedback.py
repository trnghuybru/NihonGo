"""Cache on-demand feedback for individual learner messages."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "f4b5c6d7e8a9"
down_revision = "e82c9a471b30"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("conversation_messages") as batch:
        batch.add_column(sa.Column("feedback_payload", sa.JSON().with_variant(JSONB, "postgresql")))
        batch.add_column(sa.Column("feedback_attempt_id", sa.Uuid(as_uuid=False)))
        batch.add_column(sa.Column("feedback_started_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("feedback_error", sa.Text()))
        batch.add_column(sa.Column("feedback_model", sa.String(200)))


def downgrade():
    with op.batch_alter_table("conversation_messages") as batch:
        for name in ("feedback_payload", "feedback_attempt_id", "feedback_started_at", "feedback_error", "feedback_model"):
            batch.drop_column(name)
