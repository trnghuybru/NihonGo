"""Store rubric scores and anchored writing corrections."""
from alembic import op
import sqlalchemy as sa

revision = 'bc4d5e6f7182'
down_revision = 'ab3c4d5e6f71'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('writing_submissions', sa.Column('assessment', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('writing_submissions') as batch:
        batch.drop_column('assessment')
