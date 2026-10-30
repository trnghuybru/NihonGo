"""Independent dictionary and kanji data, merging the writing/shadowing branches."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b5c6d7e8f901'
down_revision = ('0f3b4c5d6e7f', 'a4b5c6d7e8f9')
branch_labels = None
depends_on = None


def upgrade():
    data = sa.JSON().with_variant(postgresql.JSONB(), 'postgresql')
    op.create_table('dictionary_entries',
        sa.Column('id', sa.String(80), primary_key=True),
        sa.Column('word', sa.Text, nullable=False),
        sa.Column('reading', sa.Text, nullable=False),
        sa.Column('content', data, nullable=False),
        sa.Column('common', sa.Boolean, nullable=False))
    op.create_table('dictionary_terms',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('entry_id', sa.String(80), sa.ForeignKey('dictionary_entries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(16), nullable=False),
        sa.Column('text', sa.Text, nullable=False),
        sa.UniqueConstraint('entry_id', 'kind', 'text', name='uq_dictionary_term'))
    op.create_index('ix_dictionary_terms_entry_id', 'dictionary_terms', ['entry_id'])
    op.create_index('ix_dictionary_terms_text', 'dictionary_terms', ['text'])
    op.create_table('dictionary_kanji',
        sa.Column('literal', sa.String(4), primary_key=True),
        sa.Column('content', data, nullable=False),
        sa.Column('search_text', sa.Text, nullable=False),
        sa.Column('strokes', sa.Integer, nullable=False))
    op.create_table('dictionary_sources',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('content', data, nullable=False))
    if op.get_bind().dialect.name == 'postgresql':
        op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
        op.execute('CREATE INDEX ix_dictionary_terms_trgm ON dictionary_terms USING gin (text gin_trgm_ops)')
        op.execute('CREATE INDEX ix_dictionary_kanji_trgm ON dictionary_kanji USING gin (search_text gin_trgm_ops)')


def downgrade():
    op.drop_table('dictionary_sources')
    op.drop_table('dictionary_kanji')
    op.drop_table('dictionary_terms')
    op.drop_table('dictionary_entries')
