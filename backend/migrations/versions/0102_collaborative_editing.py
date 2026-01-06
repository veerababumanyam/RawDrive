"""Add collaborative editing tables for real-time gallery collaboration.

Revision ID: 0102
Revises: 0101
Create Date: 2026-01-06

This migration adds tables for:
- edit_sessions: Track active collaborative editing sessions
- edit_session_participants: Track users in sessions with presence data
- collaborative_actions: Log of all collaborative actions for history/undo
- resource_locks: Distributed locking for conflict prevention
- edit_conflicts: Record of detected conflicts and resolutions
"""

from alembic import op

revision = "0102"
down_revision = "0101"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---------------------------------------------------------------------------
    # Edit Sessions Table
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS edit_sessions (
            session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'expired', 'closed')),
            version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_activity TIMESTAMPTZ DEFAULT NOW(),
            closed_at TIMESTAMPTZ,
            metadata JSONB DEFAULT '{}'::jsonb
        );
        """
    )

    # Indexes for edit_sessions
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_sessions_workspace ON edit_sessions(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_sessions_gallery ON edit_sessions(gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_sessions_status ON edit_sessions(status) WHERE status = 'active';")
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_sessions_gallery_active ON edit_sessions(gallery_id, status) WHERE status = 'active';")

    # ---------------------------------------------------------------------------
    # Edit Session Participants Table
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS edit_session_participants (
            participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES edit_sessions(session_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            color VARCHAR(7) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'disconnected')),
            cursor_position JSONB,
            selected_assets UUID[] DEFAULT '{}',
            focus_area VARCHAR(255),
            joined_at TIMESTAMPTZ DEFAULT NOW(),
            last_activity TIMESTAMPTZ DEFAULT NOW(),
            left_at TIMESTAMPTZ,
            UNIQUE(session_id, user_id)
        );
        """
    )

    # Indexes for edit_session_participants
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_session_participants_session ON edit_session_participants(session_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_session_participants_user ON edit_session_participants(user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_session_participants_active ON edit_session_participants(session_id, status) WHERE status = 'active';")

    # ---------------------------------------------------------------------------
    # Collaborative Actions Table
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS collaborative_actions (
            action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES edit_sessions(session_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            action_type VARCHAR(100) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}',
            base_version INTEGER NOT NULL,
            result_version INTEGER,
            undoable BOOLEAN NOT NULL DEFAULT TRUE,
            undone BOOLEAN NOT NULL DEFAULT FALSE,
            undone_by_action_id UUID REFERENCES collaborative_actions(action_id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            applied_at TIMESTAMPTZ,
            error_message TEXT
        );
        """
    )

    # Indexes for collaborative_actions
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaborative_actions_session ON collaborative_actions(session_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaborative_actions_user ON collaborative_actions(user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaborative_actions_gallery ON collaborative_actions(gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaborative_actions_created ON collaborative_actions(session_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaborative_actions_version ON collaborative_actions(session_id, base_version);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaborative_actions_type ON collaborative_actions(action_type);")

    # ---------------------------------------------------------------------------
    # Resource Locks Table
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS resource_locks (
            lock_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            session_id UUID REFERENCES edit_sessions(session_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('gallery', 'sub_gallery', 'asset', 'settings')),
            resource_id UUID NOT NULL,
            lock_type VARCHAR(50) NOT NULL DEFAULT 'exclusive' CHECK (lock_type IN ('exclusive', 'shared')),
            reason TEXT,
            acquired_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            released_at TIMESTAMPTZ
        );
        """
    )

    # Partial unique index for active locks (only one active exclusive lock per resource)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_locks_unique_active ON resource_locks(resource_type, resource_id, lock_type) WHERE released_at IS NULL;")

    # Indexes for resource_locks
    op.execute("CREATE INDEX IF NOT EXISTS idx_resource_locks_workspace ON resource_locks(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_resource_locks_session ON resource_locks(session_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_resource_locks_user ON resource_locks(user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_resource_locks_resource ON resource_locks(resource_type, resource_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_resource_locks_active ON resource_locks(resource_type, resource_id) WHERE released_at IS NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_resource_locks_expiry ON resource_locks(expires_at) WHERE released_at IS NULL;")

    # ---------------------------------------------------------------------------
    # Edit Conflicts Table
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS edit_conflicts (
            conflict_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES edit_sessions(session_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            action_id_1 UUID NOT NULL REFERENCES collaborative_actions(action_id) ON DELETE CASCADE,
            action_id_2 UUID NOT NULL REFERENCES collaborative_actions(action_id) ON DELETE CASCADE,
            conflict_type VARCHAR(50) NOT NULL CHECK (conflict_type IN ('concurrent_edit', 'stale_version', 'lock_violation')),
            resource_type VARCHAR(50) NOT NULL,
            resource_id UUID NOT NULL,
            suggested_resolution VARCHAR(50) NOT NULL CHECK (suggested_resolution IN ('last_write_wins', 'first_write_wins', 'manual', 'merge')),
            resolution_options JSONB DEFAULT '[]'::jsonb,
            resolved_at TIMESTAMPTZ,
            resolution_option_id VARCHAR(100),
            resolution_data JSONB,
            detected_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for edit_conflicts
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_conflicts_session ON edit_conflicts(session_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_conflicts_gallery ON edit_conflicts(gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_edit_conflicts_unresolved ON edit_conflicts(session_id) WHERE resolved_at IS NULL;")

    # ---------------------------------------------------------------------------
    # Collaboration Events Log Table (for audit/analytics)
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS collaboration_events (
            event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID REFERENCES edit_sessions(session_id) ON DELETE SET NULL,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            event_type VARCHAR(100) NOT NULL,
            event_data JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for collaboration_events
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaboration_events_session ON collaboration_events(session_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaboration_events_gallery ON collaboration_events(gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaboration_events_user ON collaboration_events(user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaboration_events_type ON collaboration_events(event_type);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_collaboration_events_created ON collaboration_events(gallery_id, created_at DESC);")

    # ---------------------------------------------------------------------------
    # Functions for automatic timestamp updates and cleanup
    # ---------------------------------------------------------------------------

    # Function to update session activity timestamp
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_session_activity()
        RETURNS TRIGGER AS $$
        BEGIN
            UPDATE edit_sessions
            SET last_activity = NOW()
            WHERE session_id = NEW.session_id;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Trigger to update session activity on participant activity
    op.execute(
        """
        CREATE TRIGGER trigger_update_session_activity
        AFTER UPDATE OF last_activity ON edit_session_participants
        FOR EACH ROW
        EXECUTE FUNCTION update_session_activity();
        """
    )

    # Function to expire stale locks
    op.execute(
        """
        CREATE OR REPLACE FUNCTION expire_stale_locks()
        RETURNS INTEGER AS $$
        DECLARE
            expired_count INTEGER;
        BEGIN
            UPDATE resource_locks
            SET released_at = NOW()
            WHERE expires_at < NOW() AND released_at IS NULL;

            GET DIAGNOSTICS expired_count = ROW_COUNT;
            RETURN expired_count;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Function to close idle sessions (call periodically via cron/worker)
    op.execute(
        """
        CREATE OR REPLACE FUNCTION close_idle_sessions(idle_threshold_minutes INTEGER DEFAULT 30)
        RETURNS INTEGER AS $$
        DECLARE
            closed_count INTEGER;
        BEGIN
            UPDATE edit_sessions
            SET status = 'expired', closed_at = NOW()
            WHERE status = 'active'
              AND last_activity < NOW() - (idle_threshold_minutes || ' minutes')::interval;

            GET DIAGNOSTICS closed_count = ROW_COUNT;
            RETURN closed_count;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def downgrade() -> None:
    # Drop triggers and functions
    op.execute("DROP TRIGGER IF EXISTS trigger_update_session_activity ON edit_session_participants;")
    op.execute("DROP FUNCTION IF EXISTS update_session_activity();")
    op.execute("DROP FUNCTION IF EXISTS expire_stale_locks();")
    op.execute("DROP FUNCTION IF EXISTS close_idle_sessions(INTEGER);")

    # Drop indexes for collaboration_events
    op.execute("DROP INDEX IF EXISTS idx_collaboration_events_created;")
    op.execute("DROP INDEX IF EXISTS idx_collaboration_events_type;")
    op.execute("DROP INDEX IF EXISTS idx_collaboration_events_user;")
    op.execute("DROP INDEX IF EXISTS idx_collaboration_events_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_collaboration_events_session;")

    # Drop indexes for edit_conflicts
    op.execute("DROP INDEX IF EXISTS idx_edit_conflicts_unresolved;")
    op.execute("DROP INDEX IF EXISTS idx_edit_conflicts_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_edit_conflicts_session;")

    # Drop indexes for resource_locks
    op.execute("DROP INDEX IF EXISTS idx_resource_locks_expiry;")
    op.execute("DROP INDEX IF EXISTS idx_resource_locks_active;")
    op.execute("DROP INDEX IF EXISTS idx_resource_locks_resource;")
    op.execute("DROP INDEX IF EXISTS idx_resource_locks_user;")
    op.execute("DROP INDEX IF EXISTS idx_resource_locks_session;")
    op.execute("DROP INDEX IF EXISTS idx_resource_locks_workspace;")

    # Drop indexes for collaborative_actions
    op.execute("DROP INDEX IF EXISTS idx_collaborative_actions_type;")
    op.execute("DROP INDEX IF EXISTS idx_collaborative_actions_version;")
    op.execute("DROP INDEX IF EXISTS idx_collaborative_actions_created;")
    op.execute("DROP INDEX IF EXISTS idx_collaborative_actions_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_collaborative_actions_user;")
    op.execute("DROP INDEX IF EXISTS idx_collaborative_actions_session;")

    # Drop indexes for edit_session_participants
    op.execute("DROP INDEX IF EXISTS idx_edit_session_participants_active;")
    op.execute("DROP INDEX IF EXISTS idx_edit_session_participants_user;")
    op.execute("DROP INDEX IF EXISTS idx_edit_session_participants_session;")

    # Drop indexes for edit_sessions
    op.execute("DROP INDEX IF EXISTS idx_edit_sessions_gallery_active;")
    op.execute("DROP INDEX IF EXISTS idx_edit_sessions_status;")
    op.execute("DROP INDEX IF EXISTS idx_edit_sessions_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_edit_sessions_workspace;")

    # Drop tables (in reverse order due to foreign keys)
    op.execute("DROP TABLE IF EXISTS collaboration_events;")
    op.execute("DROP TABLE IF EXISTS edit_conflicts;")
    op.execute("DROP TABLE IF EXISTS resource_locks;")
    op.execute("DROP TABLE IF EXISTS collaborative_actions;")
    op.execute("DROP TABLE IF EXISTS edit_session_participants;")
    op.execute("DROP TABLE IF EXISTS edit_sessions;")
