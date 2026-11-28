"""Persist JLPT source sessions and content-addressed R2 image references."""
from alembic import op
import sqlalchemy as sa

revision = 'c2d3e4f5a6b7'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('jlpt_exams',
        sa.Column('id', sa.String(32), primary_key=True),
        sa.Column('level', sa.String(8), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('has_exam', sa.Boolean(), nullable=False),
        sa.Column('source_sha256', sa.String(64), nullable=False),
        sa.Column('source_data', sa.JSON(), nullable=False),
        sa.Column('normalized', sa.JSON(none_as_null=True)))
    op.create_table('jlpt_images',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('bucket', sa.String(128), nullable=False),
        sa.Column('storage_key', sa.String(256), nullable=False, unique=True),
        sa.Column('mime_type', sa.String(32), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False))
    op.create_table('jlpt_imports',
        sa.Column('source_sha256', sa.String(64), primary_key=True),
        sa.Column('metadata_json', sa.JSON(), nullable=False))


def downgrade():
    op.drop_table('jlpt_imports')
    op.drop_table('jlpt_images')
    op.drop_table('jlpt_exams')
