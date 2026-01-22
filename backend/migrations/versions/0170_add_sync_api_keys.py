"""Add sync_api_keys table for desktop app authentication.

Revision ID: 0170
Revises: 0169
Create Date: 2026-01-22

This table stores API keys for the desktop sync application.
Each key is scoped to specific galleries and can be revoked.
Supports SOC2 audit trail requirements.
"""

from alembic import op

revision = "0170"
down_revision = "0169"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create sync_api_keys table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_api_keys (
            key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            key_hash VARCHAR(255) NOT NULL,
            key_prefix VARCHAR(12) NOT NULL,
            scoped_gallery_ids UUID[] DEFAULT '{}',
            permissions VARCHAR(50)[] DEFAULT '{read,write}',
            last_used_at TIMESTAMPTZ,
            last_used_ip INET,
            expires_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            revoked_by UUID REFERENCES users(user_id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT sync_api_keys_permissions_check CHECK (
                permissions <@ ARRAY['read', 'write', 'export', 'import']::VARCHAR[]
            )
        );
        """
    )

    # Index for authentication (lookup by key_prefix)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_api_keys_prefix
        ON sync_api_keys (key_prefix)
        WHERE revoked_at IS NULL;
        """
    )

    # Index for workspace listing
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_api_keys_workspace
        ON sync_api_keys (workspace_id, created_at DESC)
        WHERE revoked_at IS NULL;
        """
    )

    # Index for user's keys
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_api_keys_user
        ON sync_api_keys (user_id, created_at DESC);
        """
    )

    # Index for gallery scope (array contains)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_api_keys_galleries
        ON sync_api_keys USING GIN (scoped_gallery_ids)
        WHERE revoked_at IS NULL;
        """
    )

    # Add comments for documentation
    op.execute(
        """
        COMMENT ON TABLE sync_api_keys IS
        'API keys for desktop sync application authentication. Keys are hashed with bcrypt.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN sync_api_keys.key_hash IS
        'bcrypt hash of the full API key';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN sync_api_keys.key_prefix IS
        'First 8 characters of the key for identification (e.g., "rds_abc1...")';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN sync_api_keys.scoped_gallery_ids IS
        'Array of gallery IDs this key can access. Empty array = all galleries in workspace.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN sync_api_keys.permissions IS
        'Allowed operations: read (view), write (update metadata), export (XMP export), import (XMP import)';
        """
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_sync_api_keys_galleries;")
    op.execute("DROP INDEX IF EXISTS idx_sync_api_keys_user;")
    op.execute("DROP INDEX IF EXISTS idx_sync_api_keys_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_sync_api_keys_prefix;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS sync_api_keys;")
