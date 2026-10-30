"""Reading passages imported from JLPT CSV with cached morphology."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = '2c34d5e6f7a8'
down_revision = '1b23c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('reading_passages',
        sa.Column('id', sa.String(48), primary_key=True),
        sa.Column('level', sa.String(2), nullable=False),
        sa.Column('kind', sa.String(16), nullable=False),
        sa.Column('title', sa.Text, nullable=False),
        sa.Column('exercise', sa.Integer, nullable=False),
        sa.Column('paragraph', sa.Integer, nullable=False),
        sa.Column('text', sa.Text, nullable=False),
        sa.Column('source_url', sa.Text, nullable=False),
        sa.Column('questions', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False),
        sa.Column('analysis', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=True),
        sa.UniqueConstraint('level', 'title', 'paragraph', 'source_url', name='uq_reading_source'))
    op.create_index('ix_reading_passages_level', 'reading_passages', ['level'])
    op.create_index('ix_reading_passages_kind', 'reading_passages', ['kind'])


def downgrade():
    op.drop_table('reading_passages')
