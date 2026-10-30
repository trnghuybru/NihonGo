"""Multiplayer vocabulary game rooms with server-owned question snapshots."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = '1b23c4d5e6f7'
down_revision = '0a12b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('vocabulary_game_rooms',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('code', sa.String(6), nullable=False),
        sa.Column('host_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('mode', sa.String(8), nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('state', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False),
        sa.Column('version', sa.Integer, nullable=False),
        sa.Column('updated_at', sa.BigInteger, nullable=False),
        sa.Column('expires_at', sa.BigInteger, nullable=False),
        sa.CheckConstraint("mode IN ('write','read')", name='ck_game_mode'))
    op.create_index('ix_vocabulary_game_rooms_code', 'vocabulary_game_rooms', ['code'], unique=True)
    op.create_index('ix_vocabulary_game_rooms_status', 'vocabulary_game_rooms', ['status'])
    op.create_index('ix_vocabulary_game_rooms_expires_at', 'vocabulary_game_rooms', ['expires_at'])


def downgrade():
    op.drop_table('vocabulary_game_rooms')
