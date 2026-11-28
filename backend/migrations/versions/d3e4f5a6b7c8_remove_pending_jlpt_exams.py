"""Remove the unstructured imported sessions; preserve the two exams and all R2 images."""
from alembic import op
import sqlalchemy as sa

revision = 'd3e4f5a6b7c8'
down_revision = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None


def upgrade():
    exams = sa.table('jlpt_exams', sa.column('id', sa.String),
        sa.column('source_sha256', sa.String), sa.column('normalized', sa.JSON))
    op.execute(exams.delete().where(
        exams.c.source_sha256 == '4ec4fddc850fdc39278a5b1cfe1aecc19685a3a3471f001b90dd5ea6fad21410',
        exams.c.id.notin_(['n3-2016-12', 'n3-2017-07']),
        exams.c.normalized.is_(None)))


def downgrade():
    # Source content can be re-imported explicitly; never invent deleted exam data.
    pass
