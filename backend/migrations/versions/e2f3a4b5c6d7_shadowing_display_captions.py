"""Separate timed display cues from practice phrases."""
from alembic import op
import sqlalchemy as sa

revision = 'e2f3a4b5c6d7'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('shadowing_jobs', sa.Column('display_captions', sa.JSON, nullable=True))


def downgrade():
    op.drop_column('shadowing_jobs', 'display_captions')
