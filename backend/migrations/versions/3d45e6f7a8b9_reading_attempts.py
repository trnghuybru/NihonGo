"""Persist server-graded reading attempts by account."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '3d45e6f7a8b9'
down_revision = '2c34d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('reading_attempts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('passage_id', sa.String(48), sa.ForeignKey('reading_passages.id', ondelete='CASCADE'), nullable=False),
        sa.Column('request_id', sa.String(36), nullable=False),
        sa.Column('version', sa.String(64), nullable=False),
        sa.Column('result', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False),
        sa.Column('created_at', sa.BigInteger, nullable=False),
        sa.UniqueConstraint('user_id', 'request_id', name='uq_reading_attempt_request'))
    op.create_index('ix_reading_attempt_user_passage', 'reading_attempts', ['user_id', 'passage_id', 'created_at'])


def downgrade():
    op.drop_table('reading_attempts')
