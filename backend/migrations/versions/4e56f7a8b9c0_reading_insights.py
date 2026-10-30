"""Durable source-versioned reading explanations and analysis."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '4e56f7a8b9c0'
down_revision = '3d45e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('reading_insights',
        sa.Column('passage_id', sa.String(48), sa.ForeignKey('reading_passages.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('kind', sa.String(64), primary_key=True),
        sa.Column('source_hash', sa.String(64), nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('lease', sa.String(36)),
        sa.Column('updated_at', sa.BigInteger, nullable=False),
        sa.Column('payload', sa.JSON().with_variant(JSONB(), 'postgresql')))


def downgrade():
    op.drop_table('reading_insights')
