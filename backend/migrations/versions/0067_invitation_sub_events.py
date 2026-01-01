"""Create invitation_sub_events table for multi-event support.

Feature: 017-digital-wedding-invitations
Revision ID: 0067
Revises: 0066
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0067"
down_revision = "0066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_sub_events table."""
    op.execute(
        """
        CREATE TABLE invitation_sub_events (
            -- Primary key
            sub_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Foreign keys (multi-tenant)
            invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Event details
            name VARCHAR(200) NOT NULL,
            event_type VARCHAR(50), -- optional sub-event type
            event_datetime TIMESTAMPTZ NOT NULL,
            event_end_datetime TIMESTAMPTZ,
            event_timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
            description TEXT,

            -- Venue (can differ from main invitation)
            venue_name VARCHAR(300),
            venue_address TEXT,
            venue_city VARCHAR(100),
            venue_map_url TEXT,

            -- Display
            display_order INTEGER DEFAULT 0,
            show_countdown BOOLEAN DEFAULT TRUE,

            -- RSVP per event (optional)
            enable_individual_rsvp BOOLEAN DEFAULT FALSE,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes
    op.execute(
        """
        CREATE INDEX idx_invitation_sub_events_invitation ON invitation_sub_events(invitation_id);
        CREATE INDEX idx_invitation_sub_events_workspace ON invitation_sub_events(workspace_id);
        CREATE INDEX idx_invitation_sub_events_datetime ON invitation_sub_events(event_datetime);
        """
    )


def downgrade() -> None:
    """Drop invitation_sub_events table."""
    op.execute("DROP TABLE IF EXISTS invitation_sub_events;")
