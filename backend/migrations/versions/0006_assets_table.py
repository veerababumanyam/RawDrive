"""Add assets table for media files.

Revision ID: 0006
Revises: 0005
Create Date: 2025-01-27
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Assets table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS assets (
            asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            library_id UUID,
            folder_id UUID,
            type VARCHAR(50) NOT NULL CHECK (type IN ('photo', 'video')),
            original_object_key VARCHAR(500) NOT NULL,
            original_bytes BIGINT NOT NULL,
            sha256 VARCHAR(64) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            exif JSONB,
            status VARCHAR(50) NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'available', 'processing', 'failed', 'deleted')),
            created_by_user_id UUID NOT NULL REFERENCES users(user_id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Add foreign key constraint for gallery_assets.asset_id
    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD CONSTRAINT fk_gallery_assets_asset_id
        FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE;
        """
    )

    # Indexes for assets
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_assets_workspace_created "
        "ON assets(workspace_id, created_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_assets_workspace_sha256 "
        "ON assets(workspace_id, sha256);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_assets_workspace_folder "
        "ON assets(workspace_id, folder_id) WHERE folder_id IS NOT NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_assets_workspace_status "
        "ON assets(workspace_id, status);"
    )


def downgrade() -> None:
    # Drop foreign key constraint
    op.execute(
        "ALTER TABLE gallery_assets DROP CONSTRAINT IF EXISTS fk_gallery_assets_asset_id;"
    )

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_assets_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_assets_workspace_folder;")
    op.execute("DROP INDEX IF EXISTS idx_assets_workspace_sha256;")
    op.execute("DROP INDEX IF EXISTS idx_assets_workspace_created;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS assets;")

