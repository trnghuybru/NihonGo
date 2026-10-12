"""Cache subtitle tokens and index exact word lookup."""
from alembic import op
import sqlalchemy as sa
revision = 'f3a4b5c6d7e8'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('shadowing_jobs', sa.Column('word_analysis', sa.JSON, nullable=True))
    op.create_index('ix_vocabulary_words_word', 'vocabulary_words', ['word'])


def downgrade():
    op.drop_index('ix_vocabulary_words_word', table_name='vocabulary_words')
    op.drop_column('shadowing_jobs', 'word_analysis')
