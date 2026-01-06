"""Create sync_sessions table for Live Camera Sync feature.

This migration creates the sync_sessions table to track active and historical
sync sessions for folder-to-gallery mappings. Each session represents an
individual sync operation tracking real-time progress, status, and statistics.

The table stores:
- Session identification and ownership
- Reference to the parent sync_mapping
- Session status and lifecycle timestamps
- Real-time progress metrics (files queued, synced, failed)
- Upload statistics (bytes transferred, speed)
- Error tracking and metadata

Feature: RawDrive Live Camera Sync
Task: T005 - Create Alembic migration for sync_sessions table
Revision ID: 0104
Revises: 0103
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0104"
down_revision = "0103"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create sync_sessions table for tracking sync operations."""

    # =========================================================================
    # CREATE SYNC_SESSIONS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS sync_sessions (
            -- Primary key: UUID for session identification
            session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Parent mapping this session belongs to
            mapping_id UUID NOT NULL REFERENCES sync_mappings(mapping_id) ON DELETE CASCADE,

            -- Workspace association (denormalized for efficient queries)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- User who started the sync session
            created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Session status
            status VARCHAR(50) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'paused', 'completed', 'failed', 'expired')),

            -- Progress tracking: file counts
            total_files_queued INT NOT NULL DEFAULT 0,
            total_files_synced INT NOT NULL DEFAULT 0,
            total_files_failed INT NOT NULL DEFAULT 0,
            total_files_skipped INT NOT NULL DEFAULT 0,

            -- Progress tracking: byte counts
            total_bytes_queued BIGINT NOT NULL DEFAULT 0,
            total_bytes_synced BIGINT NOT NULL DEFAULT 0,

            -- Current upload speed (bytes per second, updated periodically)
            current_upload_speed BIGINT DEFAULT 0,

            -- Estimated time remaining in seconds (calculated from speed and remaining bytes)
            estimated_seconds_remaining INT,

            -- Session lifecycle timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            started_at TIMESTAMPTZ,
            paused_at TIMESTAMPTZ,
            resumed_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

            -- Activity tracking
            last_activity_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- Error tracking
            last_error TEXT,
            last_error_code VARCHAR(50),
            error_count INT NOT NULL DEFAULT 0,

            -- Flexible metadata storage (upload stats, client info, etc.)
            metadata JSONB DEFAULT '{}'::jsonb
        );
    """)

    # =========================================================================
    # CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # Index for looking up sessions by mapping (primary lookup)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_mapping
        ON sync_sessions(mapping_id);
    """)

    # Index for looking up sessions by workspace
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_workspace
        ON sync_sessions(workspace_id);
    """)

    # Index for active sessions within a workspace
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_workspace_active
        ON sync_sessions(workspace_id, status)
        WHERE status = 'active';
    """)

    # Index for finding active session for a specific mapping
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_mapping_active
        ON sync_sessions(mapping_id, status)
        WHERE status = 'active';
    """)

    # Index for finding sessions by status
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_status
        ON sync_sessions(status);
    """)

    # Index for finding sessions by creator
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_creator
        ON sync_sessions(created_by_user_id);
    """)

    # Index for finding expired sessions (cleanup job)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_expires
        ON sync_sessions(expires_at)
        WHERE status IN ('active', 'paused');
    """)

    # Index for recent activity (dashboard queries)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_last_activity
        ON sync_sessions(last_activity_at DESC)
        WHERE status = 'active';
    """)

    # Composite index for dashboard queries
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_dashboard
        ON sync_sessions(workspace_id, status, created_at DESC);
    """)

    # Index for sessions with errors
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_sessions_errors
        ON sync_sessions(status, error_count)
        WHERE status = 'failed' OR error_count > 0;
    """)

    # =========================================================================
    # CREATE TRIGGER FOR updated_at TIMESTAMP
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_sync_sessions_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_sync_sessions_updated_at ON sync_sessions;
        CREATE TRIGGER trigger_sync_sessions_updated_at
        BEFORE UPDATE ON sync_sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_sync_sessions_updated_at();
    """)

    # =========================================================================
    # CREATE TRIGGER TO UPDATE last_activity_at ON PROGRESS CHANGES
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_sync_sessions_last_activity()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Update last_activity_at when progress metrics change
            IF OLD.total_files_synced IS DISTINCT FROM NEW.total_files_synced
               OR OLD.total_files_failed IS DISTINCT FROM NEW.total_files_failed
               OR OLD.total_bytes_synced IS DISTINCT FROM NEW.total_bytes_synced
            THEN
                NEW.last_activity_at = NOW();
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_sync_sessions_last_activity ON sync_sessions;
        CREATE TRIGGER trigger_sync_sessions_last_activity
        BEFORE UPDATE ON sync_sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_sync_sessions_last_activity();
    """)

    # =========================================================================
    # ADD COMMENTS FOR DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE sync_sessions IS
        'Tracks individual sync sessions for Live Camera Sync. Each session represents an active or historical sync operation for a folder-to-gallery mapping.';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.session_id IS
        'Unique identifier for the sync session';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.mapping_id IS
        'Reference to the parent sync_mapping this session belongs to';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.workspace_id IS
        'Workspace ID (denormalized from mapping for efficient queries)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.created_by_user_id IS
        'User who initiated this sync session';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.status IS
        'Session status: active (syncing), paused (temporarily stopped), completed (all files synced), failed (unrecoverable error), expired (session timeout)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.total_files_queued IS
        'Total number of files detected and queued for sync in this session';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.total_files_synced IS
        'Number of files successfully uploaded in this session';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.total_files_failed IS
        'Number of files that failed to upload in this session';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.total_files_skipped IS
        'Number of files skipped (duplicates, excluded patterns, etc.)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.total_bytes_queued IS
        'Total bytes of all files queued for sync';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.total_bytes_synced IS
        'Total bytes successfully uploaded in this session';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.current_upload_speed IS
        'Current upload speed in bytes per second (updated periodically)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.estimated_seconds_remaining IS
        'Estimated seconds until sync completion (calculated from speed and remaining bytes)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.started_at IS
        'Timestamp when the sync session actually started processing files';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.paused_at IS
        'Timestamp when the session was last paused';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.resumed_at IS
        'Timestamp when the session was last resumed from pause';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.completed_at IS
        'Timestamp when the session finished (completed or failed)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.expires_at IS
        'Session expiration time (default 24 hours from creation)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.last_activity_at IS
        'Timestamp of last sync activity (file upload completed/failed)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.last_error IS
        'Human-readable description of the last error encountered';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.last_error_code IS
        'Programmatic error code (e.g., UPLOAD_FAILED, QUOTA_EXCEEDED, NETWORK_ERROR)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.error_count IS
        'Number of consecutive errors in this session (reset on successful upload)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_sessions.metadata IS
        'Flexible JSONB storage for additional data (client info, browser details, performance stats)';
    """)


def downgrade() -> None:
    """Drop sync_sessions table and related objects."""

    # Drop triggers first
    op.execute("DROP TRIGGER IF EXISTS trigger_sync_sessions_last_activity ON sync_sessions;")
    op.execute("DROP FUNCTION IF EXISTS update_sync_sessions_last_activity();")
    op.execute("DROP TRIGGER IF EXISTS trigger_sync_sessions_updated_at ON sync_sessions;")
    op.execute("DROP FUNCTION IF EXISTS update_sync_sessions_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_errors;")
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_dashboard;")
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_last_activity;")
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_expires;")
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_creator;")
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_status;")
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_mapping_active;")
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_workspace_active;")
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_sync_sessions_mapping;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS sync_sessions;")
