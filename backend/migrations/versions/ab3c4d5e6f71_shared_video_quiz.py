"""Persist one shared five-question quiz per video job."""
from alembic import op
import sqlalchemy as sa

revision = 'ab3c4d5e6f71'
down_revision = '9b2c3d4e5f60'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('shadowing_jobs', sa.Column('quiz_data', sa.JSON(), nullable=True))
    op.add_column('shadowing_jobs', sa.Column('quiz_lease_token', sa.String(36), nullable=True))
    op.add_column('shadowing_jobs', sa.Column('quiz_lease_expires_at', sa.BigInteger(), nullable=True))


def downgrade():
    with op.batch_alter_table('shadowing_jobs') as batch:
        batch.drop_column('quiz_lease_expires_at')
        batch.drop_column('quiz_lease_token')
        batch.drop_column('quiz_data')
