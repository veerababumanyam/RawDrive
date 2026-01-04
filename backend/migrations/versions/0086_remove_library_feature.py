"""Remove library feature - library_folders table and folder_id columns.

This migration removes the Library feature entirely:
- Deletes orphan assets (not in any gallery)
- Removes folder_id from assets and upload_sessions tables
- Drops the library_folders table

Revision ID: 0086
Revises: 0085
Create Date: 2026-01-04
"""

from alembic import op

revision = "0086"
down_revision = "0085"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Delete orphan assets (assets not linked to any gallery)
    # First, log the count of orphan assets for audit purposes
    op.execute(
        """
        DO $$
        DECLARE
            orphan_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO orphan_count
            FROM assets a
            WHERE a.deleted = FALSE
              AND NOT EXISTS (
                  SELECT 1 FROM gallery_assets ga WHERE ga.asset_id = a.asset_id
              );
            RAISE NOTICE 'Deleting % orphan assets not linked to any gallery', orphan_count;
        END $$;
        """
    )

    # Hard delete orphan assets (R2 storage cleanup should be handled separately)
    op.execute(
        """
        DELETE FROM assets
        WHERE deleted = FALSE
          AND NOT EXISTS (
              SELECT 1 FROM gallery_assets ga WHERE ga.asset_id = assets.asset_id
          );
        """
    )

    # Step 2: Drop indexes on folder_id columns
    op.execute("DROP INDEX IF EXISTS idx_upload_sessions_folder;")
    op.execute("DROP INDEX IF EXISTS idx_assets_workspace_folder;")
    op.execute("DROP INDEX IF EXISTS idx_assets_folder;")

    # Step 3: Drop folder_id column from upload_sessions (removes FK constraint too)
    op.execute("ALTER TABLE upload_sessions DROP COLUMN IF EXISTS folder_id;")

    # Step 4: Drop folder_id column from assets (removes FK constraint too)
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS folder_id;")

    # Step 5: Drop library_folders indexes
    op.execute("DROP INDEX IF EXISTS idx_library_folders_sort;")
    op.execute("DROP INDEX IF EXISTS idx_library_folders_workspace_parent;")
    op.execute("DROP INDEX IF EXISTS idx_library_folders_parent;")
    op.execute("DROP INDEX IF EXISTS idx_library_folders_workspace;")

    # Step 6: Drop library_folders table
    op.execute("DROP TABLE IF EXISTS library_folders;")


def downgrade() -> None:
    # Recreate library_folders table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS library_folders (
            folder_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            parent_folder_id UUID REFERENCES library_folders(folder_id) ON DELETE CASCADE,
            description TEXT,
            cover_asset_id UUID,
            color VARCHAR(7),
            sort_order INTEGER DEFAULT 0,
            created_by_user_id UUID REFERENCES users(user_id),
            pin VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(workspace_id, parent_folder_id, name)
        );
        """
    )

    # Recreate library_folders indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_folders_workspace ON library_folders(workspace_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_folders_parent ON library_folders(parent_folder_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_folders_workspace_parent ON library_folders(workspace_id, parent_folder_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_folders_sort ON library_folders(workspace_id, parent_folder_id, sort_order);"
    )

    # Add folder_id column back to assets
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES library_folders(folder_id) ON DELETE SET NULL;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets(folder_id);")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_assets_workspace_folder ON assets(workspace_id, folder_id);"
    )

    # Add folder_id column back to upload_sessions
    op.execute(
        """
        ALTER TABLE upload_sessions
        ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES library_folders(folder_id) ON DELETE SET NULL;
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_upload_sessions_folder ON upload_sessions(folder_id) WHERE folder_id IS NOT NULL;"
    )
