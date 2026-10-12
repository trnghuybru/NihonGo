"""Persist transcript feedback and evaluation attempt leases.

Revision ID: e82c9a471b30
Revises: c9f41b2a6e80
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e82c9a471b30"
down_revision = "c9f41b2a6e80"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("session_evaluations") as batch:
        batch.alter_column("status", existing_type=sa.String(16), type_=sa.String(24), existing_nullable=False)
        batch.add_column(sa.Column("result_payload", sa.JSON().with_variant(postgresql.JSONB(), "postgresql")))
        batch.add_column(sa.Column("processing_started_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("attempt_id", sa.Uuid(as_uuid=False)))
        batch.drop_constraint("ck_evaluation_status", type_="check")
        batch.create_check_constraint("ck_evaluation_status", "status IN ('pending', 'processing', 'completed', 'failed', 'insufficient_data')")


def downgrade():
    op.execute("UPDATE session_evaluations SET status = 'failed' WHERE status = 'insufficient_data'")
    with op.batch_alter_table("session_evaluations") as batch:
        batch.alter_column("status", existing_type=sa.String(24), type_=sa.String(16), existing_nullable=False)
        batch.drop_constraint("ck_evaluation_status", type_="check")
        batch.create_check_constraint("ck_evaluation_status", "status IN ('pending', 'processing', 'completed', 'failed')")
        batch.drop_column("attempt_id")
        batch.drop_column("processing_started_at")
        batch.drop_column("result_payload")
