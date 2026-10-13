"""Shared, resumable Vietnamese subtitle translation jobs."""
from alembic import op
import sqlalchemy as sa

revision = 'a4b5c6d7e8f9'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('shadowing_translations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('job_id', sa.String(36), sa.ForeignKey('shadowing_jobs.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('language', sa.String(8), nullable=False),
        sa.Column('source_hash', sa.String(64), nullable=False),
        sa.Column('source', sa.JSON, nullable=False),
        sa.Column('translations', sa.JSON, nullable=False),
        sa.Column('model', sa.String(100), nullable=False),
        sa.Column('prompt_version', sa.Integer, nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('attempts', sa.Integer, nullable=False),
        sa.Column('error_message', sa.Text),
        sa.Column('created_at', sa.BigInteger, nullable=False),
        sa.Column('updated_at', sa.BigInteger, nullable=False),
        sa.Column('last_enqueued_at', sa.BigInteger),
        sa.Column('lease_token', sa.String(36)),
        sa.Column('lease_expires_at', sa.BigInteger))
    op.create_index('ix_shadowing_translations_status', 'shadowing_translations', ['status'])


def downgrade():
    op.drop_table('shadowing_translations')
