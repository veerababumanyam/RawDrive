"""Create invitation_views table for analytics tracking.

This migration creates a table to track invitation page views:
- visitor_hash: SHA256 hash of visitor fingerprint (privacy-preserving)
- device_type: desktop, mobile, tablet, unknown
- browser: Browser name and version
- os: Operating system name
- referrer: Truncated referring URL

Feature: 018-invitations-production-readiness
Revision ID: 0075
Revises: 0074
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0075"
down_revision = "0074"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_views table for analytics."""

    # =========================================================================
    # 1. Create invitation_views table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invitation_views (
            view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
            visitor_hash VARCHAR(64) NOT NULL,
            device_type VARCHAR(20),
            browser VARCHAR(50),
            os VARCHAR(50),
            referrer VARCHAR(255),
            viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 2. Create index for analytics queries (by invitation and time)
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_views_analytics
        ON invitation_views(invitation_id, viewed_at);
        """
    )

    # =========================================================================
    # 3. Create index for unique visitor counting
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_views_unique_visitors
        ON invitation_views(invitation_id, visitor_hash);
        """
    )

    # =========================================================================
    # 4. Create index for workspace isolation
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_views_workspace
        ON invitation_views(workspace_id);
        """
    )

    # =========================================================================
    # 5. Add check constraint for device_type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_device_type'
            ) THEN
                ALTER TABLE invitation_views
                ADD CONSTRAINT check_device_type
                CHECK (device_type IS NULL OR device_type IN ('desktop', 'mobile', 'tablet', 'unknown'));
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 6. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE invitation_views IS
        'Tracks page views for invitation analytics with privacy-preserving visitor fingerprints';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_views.visitor_hash IS
        'SHA256 hash of visitor fingerprint (IP + User-Agent + Accept-Language)';
        """
    )


def downgrade() -> None:
    """Drop invitation_views table."""

    op.execute("DROP TABLE IF EXISTS invitation_views CASCADE;")
