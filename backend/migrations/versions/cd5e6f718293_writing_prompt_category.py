"""Add writing topic categories for the prompt library."""
from alembic import op
import sqlalchemy as sa

revision = "cd5e6f718293"
down_revision = "bc4d5e6f7182"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("writing_prompts", sa.Column("category", sa.String(24), nullable=False, server_default="daily"))

def downgrade():
    op.drop_column("writing_prompts", "category")
