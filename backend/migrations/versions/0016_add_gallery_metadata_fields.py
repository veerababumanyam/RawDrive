"""Add shoot_date and client_id to galleries.

Revision ID: 0016
Revises: 0015
Create Date: 2025-12-21
"""

from alembic import op

revision = "0016"
down_revision = "0015_recycle_bin_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add shoot_date column
    op.execute("ALTER TABLE galleries ADD COLUMN IF NOT EXISTS shoot_date TIMESTAMPTZ;")
    
    # Add client_id column with foreign key to clients
    op.execute("ALTER TABLE galleries ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL;")

    # Add index for client_id
    op.execute("CREATE INDEX IF NOT EXISTS idx_galleries_client_id ON galleries(client_id);")


def downgrade() -> None:
    # Remove columns
    op.execute("DROP INDEX IF EXISTS idx_galleries_client_id;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF NOT EXISTS client_id;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF NOT EXISTS shoot_date;")
