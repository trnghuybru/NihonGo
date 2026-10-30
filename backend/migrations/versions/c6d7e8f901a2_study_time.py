"""Persist daily study intervals and their deduplicated duration."""
from alembic import op
import sqlalchemy as sa

revision = 'c6d7e8f901a2'
down_revision = 'b5c6d7e8f901'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('learning_study_days',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('day', sa.Date, primary_key=True),
        sa.Column('seconds', sa.Integer, nullable=False),
        sa.Column('intervals', sa.JSON, nullable=False),
        sa.Column('updated_at', sa.BigInteger, nullable=False),
        sa.CheckConstraint('seconds >= 0 AND seconds <= 86400', name='ck_study_day_seconds'))


def downgrade():
    op.drop_table('learning_study_days')
