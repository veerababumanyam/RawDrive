"""Create invitation_view_analytics table for detailed tracking.

Feature: 017-digital-wedding-invitations
Revision ID: 0071
Revises: 0070
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_view_analytics table."""
    op.execute(
        """
        CREATE TABLE invitation_view_analytics (
            -- Primary key
            view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Foreign keys
            invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Visitor identification (hashed for privacy)
            visitor_hash VARCHAR(64), -- SHA256 of IP + User-Agent
            session_id VARCHAR(64),

            -- Device info
            device_type VARCHAR(20) CHECK (device_type IN ('phone', 'tablet', 'desktop', 'unknown')),
            browser VARCHAR(50),
            os VARCHAR(50),

            -- Geographic (from IP geolocation)
            country_code CHAR(2),
            region VARCHAR(100),
            city VARCHAR(100),

            -- Referrer
            referrer_domain VARCHAR(255),
            referrer_type VARCHAR(20) CHECK (referrer_type IN ('direct', 'social', 'search', 'email', 'other')),

            -- Engagement
            duration_seconds INTEGER,
            scrolled_to_rsvp BOOLEAN DEFAULT FALSE,
            interacted_with_media BOOLEAN DEFAULT FALSE,

            -- Timestamp
            viewed_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes
    op.execute(
        """
        CREATE INDEX idx_invitation_views_invitation ON invitation_view_analytics(invitation_id);
        CREATE INDEX idx_invitation_views_workspace ON invitation_view_analytics(workspace_id);
        CREATE INDEX idx_invitation_views_time ON invitation_view_analytics(viewed_at DESC);
        CREATE INDEX idx_invitation_views_device ON invitation_view_analytics(invitation_id, device_type);
        CREATE INDEX idx_invitation_views_geo ON invitation_view_analytics(invitation_id, country_code);
        """
    )


def downgrade() -> None:
    """Drop invitation_view_analytics table."""
    op.execute("DROP TABLE IF EXISTS invitation_view_analytics;")
