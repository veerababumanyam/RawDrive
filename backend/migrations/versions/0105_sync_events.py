"""Create sync_events table for Live Camera Sync feature.

This migration creates the sync_events table to log all sync-related events
for audit tracking, debugging, and analytics. Each event represents a
discrete action or state change during the sync process.

The table stores:
- Event identification and timestamps
- References to session, mapping, and workspace
- Event type classification
- File information (path, name, size, asset_id)
- Error tracking (message, code)
- Flexible event data storage

Event types include:
- Session lifecycle: session_started, session_paused, session_resumed, session_ended
- File processing: file_detected, file_queued
- Upload progress: upload_started, upload_progress, upload_completed, upload_failed
- Special events: duplicate_detected, error_occurred
- Quota events: quota_warning, quota_exceeded
- Connection events: connection_lost, connection_restored

Feature: RawDrive Live Camera Sync
Task: T006 - Create Alembic migration for sync_events table
Revision ID: 0105
Revises: 0104
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0105"
down_revision = "0104"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create sync_events table for audit logging of sync operations."""

    # =========================================================================
    # CREATE SYNC_EVENTS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS sync_events (
            -- Primary key: UUID for event identification
            event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Session this event belongs to
            session_id UUID NOT NULL REFERENCES sync_sessions(session_id) ON DELETE CASCADE,

            -- Parent mapping (denormalized for efficient queries without joins)
            mapping_id UUID NOT NULL REFERENCES sync_mappings(mapping_id) ON DELETE CASCADE,

            -- Workspace association (denormalized for efficient queries)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Event type classification
            event_type VARCHAR(50) NOT NULL
                CHECK (event_type IN (
                    'session_started',
                    'session_paused',
                    'session_resumed',
                    'session_ended',
                    'file_detected',
                    'file_queued',
                    'upload_started',
                    'upload_progress',
                    'upload_completed',
                    'upload_failed',
                    'duplicate_detected',
                    'error_occurred',
                    'quota_warning',
                    'quota_exceeded',
                    'connection_lost',
                    'connection_restored'
                )),

            -- File information (optional, for file-related events)
            file_path TEXT,
            file_name VARCHAR(512),
            file_size BIGINT,

            -- Asset reference (for completed uploads)
            asset_id UUID REFERENCES assets(asset_id) ON DELETE SET NULL,

            -- Error tracking (for error events)
            error_message TEXT,
            error_code VARCHAR(50),

            -- Flexible event data storage (upload progress %, speed, etc.)
            event_data JSONB DEFAULT '{}'::jsonb,

            -- Event timestamp
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
    """)

    # =========================================================================
    # CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # Index for looking up events by session (primary lookup for session history)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_session
        ON sync_events(session_id, created_at DESC);
    """)

    # Index for looking up events by mapping (mapping history)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_mapping
        ON sync_events(mapping_id, created_at DESC);
    """)

    # Index for looking up events by workspace
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_workspace
        ON sync_events(workspace_id, created_at DESC);
    """)

    # Index for filtering events by type
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_type
        ON sync_events(event_type);
    """)

    # Composite index for session + event type queries
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_session_type
        ON sync_events(session_id, event_type, created_at DESC);
    """)

    # Index for finding events by asset (track file history)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_asset
        ON sync_events(asset_id)
        WHERE asset_id IS NOT NULL;
    """)

    # Index for error events (debugging and monitoring)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_errors
        ON sync_events(session_id, error_code, created_at DESC)
        WHERE error_code IS NOT NULL;
    """)

    # Index for upload events (upload tracking)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_uploads
        ON sync_events(session_id, created_at DESC)
        WHERE event_type IN ('upload_started', 'upload_completed', 'upload_failed');
    """)

    # Index for file path lookups (find events for a specific file)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_file_path
        ON sync_events(mapping_id, file_path)
        WHERE file_path IS NOT NULL;
    """)

    # Index for time-range queries (analytics, retention cleanup)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_created_at
        ON sync_events(created_at DESC);
    """)

    # Composite index for workspace + time range queries (dashboard analytics)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_workspace_time
        ON sync_events(workspace_id, event_type, created_at DESC);
    """)

    # Index for connection events (network stability tracking)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_connection
        ON sync_events(session_id, created_at DESC)
        WHERE event_type IN ('connection_lost', 'connection_restored');
    """)

    # Index for quota events (billing and usage alerts)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_events_quota
        ON sync_events(workspace_id, created_at DESC)
        WHERE event_type IN ('quota_warning', 'quota_exceeded');
    """)

    # =========================================================================
    # CREATE PARTITION HELPER (OPTIONAL - FOR FUTURE PARTITIONING)
    # =========================================================================
    # Note: This table can grow very large in production.
    # Consider time-based partitioning if event volume exceeds expectations.
    # The created_at index supports efficient partition pruning.

    # =========================================================================
    # ADD COMMENTS FOR DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE sync_events IS
        'Audit log of all sync-related events for Live Camera Sync. Records file detections, uploads, errors, and session state changes for debugging, analytics, and compliance.';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.event_id IS
        'Unique identifier for the sync event';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.session_id IS
        'Reference to the sync session this event belongs to';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.mapping_id IS
        'Reference to the sync mapping (denormalized for efficient queries)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.workspace_id IS
        'Workspace ID (denormalized for efficient queries and access control)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.event_type IS
        'Type of event: session lifecycle (started/paused/resumed/ended), file processing (detected/queued), upload (started/progress/completed/failed), or special (duplicate_detected/error_occurred/quota_warning/quota_exceeded/connection_lost/connection_restored)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.file_path IS
        'Full local file path (for file-related events)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.file_name IS
        'File name extracted from path (for display and search)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.file_size IS
        'File size in bytes (for file-related events)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.asset_id IS
        'Reference to the created asset (for upload_completed events)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.error_message IS
        'Human-readable error description (for error events)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.error_code IS
        'Programmatic error code for handling (e.g., UPLOAD_FAILED, QUOTA_EXCEEDED)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.event_data IS
        'Flexible JSONB storage for additional event-specific data (upload progress percentage, bytes transferred, speed, etc.)';
    """)

    op.execute("""
        COMMENT ON COLUMN sync_events.created_at IS
        'Timestamp when the event occurred';
    """)


def downgrade() -> None:
    """Drop sync_events table and related objects."""

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_sync_events_quota;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_connection;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_workspace_time;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_created_at;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_file_path;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_uploads;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_errors;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_asset;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_session_type;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_type;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_mapping;")
    op.execute("DROP INDEX IF EXISTS idx_sync_events_session;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS sync_events;")
