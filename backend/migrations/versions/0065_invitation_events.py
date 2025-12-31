"""Create invitation_events audit table and invitation_stats materialized view.

This migration creates:
- invitation_events: Activity log for invitation actions
- invitation_stats: Materialized view for RSVP analytics

Security considerations:
- Workspace isolation for all audit logs
- No PII in event_data (use IDs only)

Feature: 016-save-the-date
Revision ID: 0065
Revises: 0064
Create Date: 2025-12-30
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_events table and invitation_stats materialized view."""

    # =========================================================================
    # 1. Create invitation_event_type_audit enum
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_event_type_audit') THEN
                CREATE TYPE invitation_event_type_audit AS ENUM (
                    'created', 'updated', 'published', 'unpublished', 'archived',
                    'viewed', 'shared', 'rsvp_received', 'rsvp_updated',
                    'checkin', 'exported', 'deleted'
                );
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create invitation_actor_type enum
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_actor_type') THEN
                CREATE TYPE invitation_actor_type AS ENUM ('user', 'guest', 'system');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 3. Create invitation_events table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invitation_events (
            -- Primary key
            event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Foreign keys
            invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Event type
            event_type invitation_event_type_audit NOT NULL,

            -- Actor
            actor_type invitation_actor_type NOT NULL,
            actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            actor_guest_email VARCHAR(255),
            actor_ip_address INET,

            -- Event data (flexible JSONB payload)
            event_data JSONB DEFAULT '{}'::JSONB,

            -- Timestamp
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 4. Create indexes for invitation_events
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_events_invitation
        ON invitation_events(invitation_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_events_workspace
        ON invitation_events(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_events_type
        ON invitation_events(invitation_id, event_type);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_events_time
        ON invitation_events(invitation_id, created_at DESC);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_events_workspace_time
        ON invitation_events(workspace_id, created_at DESC);
        """
    )

    # =========================================================================
    # 5. Create invitation_stats materialized view
    # =========================================================================
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS invitation_stats AS
        SELECT
            i.invitation_id,
            i.workspace_id,
            i.title,
            i.event_datetime,
            i.status,
            i.view_count,
            COUNT(r.rsvp_id) FILTER (WHERE r.attending = TRUE) AS attending_count,
            COUNT(r.rsvp_id) FILTER (WHERE r.attending = FALSE) AS not_attending_count,
            COUNT(r.rsvp_id) FILTER (WHERE r.status = 'maybe') AS maybe_count,
            COALESCE(SUM(r.party_size) FILTER (WHERE r.attending = TRUE), 0) AS total_party_size,
            COUNT(c.checkin_id) AS checked_in_count,
            COALESCE(SUM(c.party_size_checked_in), 0) AS total_checked_in
        FROM invitations i
        LEFT JOIN invitation_rsvps r ON i.invitation_id = r.invitation_id
        LEFT JOIN invitation_checkins c ON i.invitation_id = c.invitation_id
        GROUP BY i.invitation_id;
        """
    )

    # =========================================================================
    # 6. Create indexes for materialized view
    # =========================================================================
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_invitation_stats_invitation
        ON invitation_stats(invitation_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_stats_workspace
        ON invitation_stats(workspace_id);
        """
    )

    # =========================================================================
    # 7. Create refresh function for materialized view
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_invitation_stats()
        RETURNS void AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY invitation_stats;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # =========================================================================
    # 8. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE invitation_events IS
        'Audit log for all invitation-related activities (SOC 2 compliance)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_events.event_data IS
        'Flexible JSONB payload for event-specific data. Use IDs only, no PII.';
        """
    )

    op.execute(
        """
        COMMENT ON MATERIALIZED VIEW invitation_stats IS
        'Pre-aggregated RSVP and check-in statistics. Refresh every 5 minutes.';
        """
    )


def downgrade() -> None:
    """Remove invitation_events table and invitation_stats materialized view."""
    # Drop function
    op.execute("DROP FUNCTION IF EXISTS refresh_invitation_stats();")

    # Drop materialized view indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_stats_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_stats_invitation;")

    # Drop materialized view
    op.execute("DROP MATERIALIZED VIEW IF EXISTS invitation_stats;")

    # Drop table indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_events_workspace_time;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_events_time;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_events_type;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_events_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_events_invitation;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS invitation_events;")

    # Drop enums
    op.execute("DROP TYPE IF EXISTS invitation_actor_type;")
    op.execute("DROP TYPE IF EXISTS invitation_event_type_audit;")
