"""Per-user FSRS scheduling, review history and local reminder preferences."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0a12b3c4d5e6'
down_revision = 'f901a2b3c4d5'
branch_labels = None
depends_on = None


def upgrade():
    json_type = sa.JSON().with_variant(JSONB(), 'postgresql')
    op.create_table('flashcard_schedules',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('card_id', sa.String(160), primary_key=True),
        sa.Column('card', json_type, nullable=False),
        sa.Column('fsrs_card', json_type, nullable=False),
        sa.Column('due_at', sa.BigInteger, nullable=False),
        sa.Column('last_review_at', sa.BigInteger, nullable=False),
        sa.Column('review_count', sa.Integer, nullable=False),
        sa.Column('active', sa.Boolean, nullable=False, server_default=sa.true()))
    op.create_index('ix_flashcard_schedule_due', 'flashcard_schedules', ['user_id', 'active', 'due_at'])
    op.create_table('flashcard_review_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('card_id', sa.String(160), nullable=False),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('flashcard_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('grade', sa.Integer, nullable=False),
        sa.Column('reviewed_at', sa.BigInteger, nullable=False),
        sa.Column('due_at', sa.BigInteger, nullable=False),
        sa.Column('fsrs_log', json_type, nullable=False),
        sa.UniqueConstraint('session_id', 'card_id', name='uq_flashcard_review_session_card'),
        sa.CheckConstraint('grade BETWEEN 0 AND 3', name='ck_flashcard_review_grade'))
    op.create_index('ix_flashcard_review_user_card', 'flashcard_review_logs', ['user_id', 'card_id', 'reviewed_at'])
    op.create_table('flashcard_reminder_preferences',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('enabled', sa.Boolean, nullable=False),
        sa.Column('hour', sa.Integer, nullable=False),
        sa.Column('minute', sa.Integer, nullable=False),
        sa.CheckConstraint('hour BETWEEN 0 AND 23', name='ck_flashcard_reminder_hour'),
        sa.CheckConstraint('minute BETWEEN 0 AND 59', name='ck_flashcard_reminder_minute'))


def downgrade():
    op.drop_table('flashcard_reminder_preferences')
    op.drop_table('flashcard_review_logs')
    op.drop_table('flashcard_schedules')
