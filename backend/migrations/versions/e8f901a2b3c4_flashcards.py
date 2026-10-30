"""Personal decks, favorites and durable flashcard sessions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'e8f901a2b3c4'
down_revision = 'd7e8f901a2b3'
branch_labels = None
depends_on = None


def upgrade():
    json_type = sa.JSON().with_variant(JSONB(), 'postgresql')
    op.create_table('flashcard_decks',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(80), nullable=False), sa.Column('cards', json_type, nullable=False),
        sa.Column('updated_at', sa.BigInteger, nullable=False))
    op.create_index('ix_flashcard_decks_user_id', 'flashcard_decks', ['user_id'])
    op.create_table('flashcard_favorites',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('source', sa.String(16), primary_key=True), sa.Column('target', sa.String(128), primary_key=True),
        sa.Column('card', json_type, nullable=False), sa.Column('created_at', sa.BigInteger, nullable=False))
    op.create_table('flashcard_sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(16), nullable=False), sa.Column('deck_id', sa.String(128), nullable=False),
        sa.Column('title', sa.Text, nullable=False), sa.Column('cards', json_type, nullable=False),
        sa.Column('ratings', json_type, nullable=False), sa.Column('started_at', sa.BigInteger, nullable=False),
        sa.Column('finished_at', sa.BigInteger),
        sa.CheckConstraint("kind IN ('lesson','custom','favorites')", name='ck_flashcard_session_kind'))
    op.create_index('ix_flashcard_sessions_user_id', 'flashcard_sessions', ['user_id'])


def downgrade():
    op.drop_table('flashcard_sessions')
    op.drop_table('flashcard_favorites')
    op.drop_table('flashcard_decks')
