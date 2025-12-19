"""Add asset_id to upload_sessions.

Revision ID: 0007
Revises: 0006
Create Date: 2025-12-19
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE upload_sessions
        ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES assets(asset_id) ON DELETE SET NULL;
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_upload_sessions_asset_id ON upload_sessions(asset_id);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_upload_sessions_asset_id;")
    op.execute("ALTER TABLE upload_sessions DROP COLUMN IF EXISTS asset_id;")
