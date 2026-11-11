"""Track three distinct daily videos while retaining existing usage."""
from alembic import op
import sqlalchemy as sa

revision = "de6f718293a4"
down_revision = "cd5e6f718293"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("beta_daily_quotas", sa.Column("video_ids", sa.JSON(), nullable=False, server_default="[]"))


def downgrade():
    op.drop_column("beta_daily_quotas", "video_ids")
