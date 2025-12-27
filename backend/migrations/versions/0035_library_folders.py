"""Add library_folders table for organizing workspace assets.

Revision ID: 0035
Revises: 0034
Create Date: 2025-12-27
"""

from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Library folders table for organizing assets
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
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(workspace_id, parent_folder_id, name)
        );
        """
    )

    # Add folder_id column to assets table
    op.execute(
        """
        ALTER TABLE assets 
        ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES library_folders(folder_id) ON DELETE SET NULL;
        """
    )

    # Indexes for library_folders
    op.execute("CREATE INDEX IF NOT EXISTS idx_library_folders_workspace ON library_folders(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_library_folders_parent ON library_folders(parent_folder_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_library_folders_workspace_parent ON library_folders(workspace_id, parent_folder_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_library_folders_sort ON library_folders(workspace_id, parent_folder_id, sort_order);")
    
    # Index for assets folder_id
    op.execute("CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets(folder_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_assets_workspace_folder ON assets(workspace_id, folder_id);")


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_assets_workspace_folder;")
    op.execute("DROP INDEX IF EXISTS idx_assets_folder;")
    op.execute("DROP INDEX IF EXISTS idx_library_folders_sort;")
    op.execute("DROP INDEX IF EXISTS idx_library_folders_workspace_parent;")
    op.execute("DROP INDEX IF EXISTS idx_library_folders_parent;")
    op.execute("DROP INDEX IF EXISTS idx_library_folders_workspace;")
    
    # Remove folder_id from assets
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS folder_id;")
    
    # Drop table
    op.execute("DROP TABLE IF EXISTS library_folders;")
