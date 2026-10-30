"""Keep the most recent dictionary entries for each account."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'd7e8f901a2b3'
down_revision = 'c6d7e8f901a2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('dictionary_history',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('items', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=False))


def downgrade():
    op.drop_table('dictionary_history')
