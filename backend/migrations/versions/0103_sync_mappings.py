"""Create sync_mappings table for Live Camera Sync feature.

This migration creates the sync_mappings table to store folder-to-gallery
mapping configurations for the Live Camera Sync feature. Each mapping
represents a relationship between a local folder path and a cloud gallery.

The table stores:
- Mapping identification and ownership
- Local folder path and target gallery
- Configuration options (subfolders, patterns)
- Sync statistics (files synced, bytes transferred)
- Status and error tracking

Feature: RawDrive Live Camera Sync
Task: T004 - Create Alembic migration for sync_mappings table
Revision ID: 0103
Revises: 0102
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0103"
down_revision = "0102"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create sync_mappings table for folder-to-gallery mapping."""

    # =========================================================================
    # CREATE SYNC_MAPPINGS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS sync_mappings (
            -- Primary key: UUID for mapping identification
            mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Workspace association (required)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Target gallery for synced files
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,

            -- Local folder path (stored for display/reference)
            folder_path TEXT NOT NULL,

            -- Display name for the mapping (optional, user-friendly name)
            display_name VARCHAR(255),

            -- Whether to include files from subdirectories
            include_subfolders BOOLEAN NOT NULL DEFAULT FALSE,

            -- File patterns to include (glob patterns, e.g., ["*.jpg", "*.raw"])
            include_patterns JSONB DEFAULT '["*.jpg", "*.jpeg", "*.png", "*.gif", "*.webp", "*.heic", "*.heif", "*.raw", "*.cr2", "*.cr3", "*.nef", "*.arw", "*.dng", "*.orf", "*.rw2"]'::jsonb,

            -- File patterns to exclude (glob patterns)
            exclude_patterns JSONB DEFAULT '[]'::jsonb,

            -- Mapping status
            status VARCHAR(50) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'paused', 'disabled', 'error')),

            -- Sync statistics
            total_files_synced BIGINT NOT NULL DEFAULT 0,
            total_bytes_synced BIGINT NOT NULL DEFAULT 0,

            -- Last sync activity timestamp
            last_sync_at TIMESTAMPTZ,

            -- Error tracking
            last_error TEXT,
            last_error_code VARCHAR(50),
            error_count INT NOT NULL DEFAULT 0,

            -- User who created the mapping
            created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- Ensure unique mapping per folder path within a workspace
            CONSTRAINT uq_sync_mappings_workspace_folder UNIQUE (workspace_id, folder_path)
        );
    """)

    # =========================================================================
    # CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # Index for looking up mappings by workspace (primary lookup)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_mappings_workspace
        ON sync_mappings(workspace_id);
    """)

    # Index for looking up mappings by gallery
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_mappings_gallery
        ON sync_mappings(gallery_id);
    """)

    # Index for active mappings within a workspace
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_mappings_workspace_active
        ON sync_mappings(workspace_id, status)
        WHERE status = 'active';
    """)

    # Index for finding mappings by status
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_mappings_status
        ON sync_mappings(status);
    """)

    # Index for finding mappings with errors
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_mappings_errors
        ON sync_mappings(status, error_count)
        WHERE status = 'error';
    """)

    # Index for finding mappings by creator
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_mappings_creator
        ON sync_mappings(created_by_user_id);
    """)

    # Index for sorting by last sync activity
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_mappings_last_sync
        ON sync_mappings(last_sync_at DESC NULLS LAST)
        WHERE status = 'active';
    """)

    # Composite index for dashboard queries (workspace + status + recent activity)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_mappings_dashboard
        ON sync_mappings(workspace_id, status, updated_at DESC);
    """)

    # =========================================================================
    # CREATE TRIGGER FOR updated_at TIMESTAMP
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_sync_mappings_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_sync_mappings_updated_at ON sync_mappings;
        CREATE TRIGGER trigger_sync_mappings_updated_at
        BEFORE UPDATE ON sync_mappings
        FOR EACH ROW
        EXECUTE FUNCTION update_sync_mappings_updated_at();
    """)

    # =========================================================================
    # ADD COMMENTS FOR DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE sync_mappings IS
        'Stores folder-to-gallery mappings for Live Camera Sync feature. Each mapping defines a sync relationship between a local folder and a cloud gallery.';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.mapping_id IS
        'Unique identifier for the sync mapping';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.folder_path IS
        'Local folder path on the client machine (stored for display and reference)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.display_name IS
        'User-friendly display name for the mapping (e.g., "Wedding Day Photos")';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.include_subfolders IS
        'Whether to recursively watch and sync files from subdirectories';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.include_patterns IS
        'JSONB array of glob patterns for files to include (e.g., ["*.jpg", "*.raw"])';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.exclude_patterns IS
        'JSONB array of glob patterns for files to exclude (e.g., ["*.tmp", ".*"])';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.status IS
        'Current mapping status: active (syncing), paused (manually paused), disabled (turned off), error (has errors)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.total_files_synced IS
        'Cumulative count of files successfully synced through this mapping';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.total_bytes_synced IS
        'Cumulative bytes successfully synced through this mapping';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.last_sync_at IS
        'Timestamp of the last successful file sync';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.last_error IS
        'Human-readable description of the last error encountered';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.last_error_code IS
        'Programmatic error code (e.g., FOLDER_NOT_FOUND, QUOTA_EXCEEDED)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_mappings.error_count IS
        'Number of consecutive errors (reset on successful sync)';
    """)


def downgrade() -> None:
    """Drop sync_mappings table and related objects."""

    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_sync_mappings_updated_at ON sync_mappings;")
    op.execute("DROP FUNCTION IF EXISTS update_sync_mappings_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_sync_mappings_dashboard;")
    op.execute("DROP INDEX IF EXISTS idx_sync_mappings_last_sync;")
    op.execute("DROP INDEX IF EXISTS idx_sync_mappings_creator;")
    op.execute("DROP INDEX IF EXISTS idx_sync_mappings_errors;")
    op.execute("DROP INDEX IF EXISTS idx_sync_mappings_status;")
    op.execute("DROP INDEX IF EXISTS idx_sync_mappings_workspace_active;")
    op.execute("DROP INDEX IF EXISTS idx_sync_mappings_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_sync_mappings_workspace;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS sync_mappings;")
