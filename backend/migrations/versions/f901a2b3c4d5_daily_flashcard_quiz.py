"""Durable daily flashcard challenges, independent from self ratings."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'f901a2b3c4d5'
down_revision = 'e8f901a2b3c4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('flashcard_sessions', sa.Column('rating_times',
        sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False, server_default='{}'))
    op.create_table('flashcard_daily_quizzes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('study_date', sa.Date, nullable=False),
        sa.Column('questions', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False),
        sa.Column('answers', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False),
        sa.Column('started_at', sa.BigInteger, nullable=False),
        sa.Column('finished_at', sa.BigInteger),
        sa.UniqueConstraint('user_id', 'study_date', name='uq_flashcard_quiz_user_date'))


def downgrade():
    op.drop_table('flashcard_daily_quizzes')
    op.drop_column('flashcard_sessions', 'rating_times')
