"""Add encryption tables for secure media handling.

Revision ID: 0003
Revises: 0002
Create Date: 2025-01-27
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Workspace encryption keys table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_encryption_keys (
            key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            key_version INTEGER NOT NULL,
            encrypted_key TEXT NOT NULL,
            algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
            status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'retired')),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            rotated_at TIMESTAMPTZ,
            UNIQUE(workspace_id, key_version)
        );
        """
    )

    # Asset encryption metadata table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS asset_encryption (
            asset_id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            key_version INTEGER NOT NULL,
            iv TEXT NOT NULL,
            auth_tag TEXT NOT NULL,
            encrypted_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for workspace_encryption_keys
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_encryption_keys_ws_version "
        "ON workspace_encryption_keys(workspace_id, key_version DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_encryption_keys_ws_active "
        "ON workspace_encryption_keys(workspace_id, status) WHERE status = 'active';"
    )

    # Indexes for asset_encryption
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_asset_encryption_ws_key_version "
        "ON asset_encryption(workspace_id, key_version);"
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_asset_encryption_ws_key_version;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_encryption_keys_ws_active;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_encryption_keys_ws_version;")

    # Drop tables
    op.execute("DROP TABLE IF EXISTS asset_encryption;")
    op.execute("DROP TABLE IF EXISTS workspace_encryption_keys;")

