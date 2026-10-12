"""Durable shadowing jobs and per-user subscriptions."""
from alembic import op
import sqlalchemy as sa

revision = 'd1e2f3a4b5c6'
down_revision = 'c0d1e2f3a4b5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('shadowing_jobs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('video_id', sa.String(11), nullable=False, unique=True),
        sa.Column('status', sa.String(24), nullable=False),
        sa.Column('title', sa.Text, nullable=False),
        sa.Column('error_code', sa.String(40)), sa.Column('error_message', sa.Text),
        sa.Column('attempts', sa.Integer, nullable=False),
        sa.Column('created_at', sa.BigInteger, nullable=False),
        sa.Column('updated_at', sa.BigInteger, nullable=False),
        sa.Column('last_enqueued_at', sa.BigInteger),
        sa.Column('lease_token', sa.String(36)), sa.Column('lease_expires_at', sa.BigInteger),
        sa.Column('raw_captions', sa.JSON))
    op.create_index('ix_shadowing_jobs_status', 'shadowing_jobs', ['status'])
    op.create_table('shadowing_requests',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('job_id', sa.String(36), sa.ForeignKey('shadowing_jobs.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', sa.BigInteger, nullable=False))


def downgrade():
    op.drop_table('shadowing_requests')
    op.drop_table('shadowing_jobs')
