"""Persist personal practice steps and AI writing topics by learner and day."""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5a6'
down_revision = 'a0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('learning_journeys',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('day', sa.Date(), primary_key=True),
        sa.Column('plan', sa.JSON(), nullable=False),
        sa.Column('completed', sa.JSON(), nullable=False),
        sa.Column('writing_topic', sa.JSON()))


def downgrade():
    op.drop_table('learning_journeys')
