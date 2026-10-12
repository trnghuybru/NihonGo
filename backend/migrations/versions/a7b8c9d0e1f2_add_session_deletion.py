"""Persist deletion tombstones and final audio cleanup deadlines."""
from alembic import op
import sqlalchemy as sa

revision = "a7b8c9d0e1f2"
down_revision = "f4b5c6d7e8a9"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("conversation_sessions") as batch:
        batch.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("audio_cleanup_after", sa.DateTime(timezone=True)))


def downgrade():
    # Do not resurrect hidden transcripts if an operator rolls this migration back.
    op.execute("DELETE FROM conversation_sessions WHERE deleted_at IS NOT NULL")
    with op.batch_alter_table("conversation_sessions") as batch:
        batch.drop_column("audio_cleanup_after")
        batch.drop_column("deleted_at")
