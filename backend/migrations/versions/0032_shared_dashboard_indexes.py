"""Add indexes for Shared Dashboard feature.

This migration adds indexes to optimize workspace-wide aggregation queries
for the Security & Sharing Dashboard (/workspace/shared).

The dashboard provides:
- Aggregated view of all magic links across galleries
- Filtering by status (active/expired/revoked)
- Sorting by creation date, access count, expiry

Revision ID: 0032
Revises: 0031
Create Date: 2025-12-26
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add indexes for efficient workspace-wide magic link queries."""

    # =========================================================================
    # 1. Index for filtering by workspace and status
    # =========================================================================
    # Used by: GET /shared/links?status=active
    # Enables fast filtering of active/expired/revoked links across workspace
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_workspace_status
        ON magic_links(workspace_id, status);
        """
    )

    op.execute(
        """
        COMMENT ON INDEX idx_magic_links_workspace_status IS
        'Optimizes Shared Dashboard filtering by link status across workspace';
        """
    )

    # =========================================================================
    # 2. Index for sorting by creation date
    # =========================================================================
    # Used by: GET /shared/links?sort_by=created_at&sort_order=desc
    # Default sort order for dashboard - most recent first
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_workspace_created
        ON magic_links(workspace_id, created_at DESC);
        """
    )

    op.execute(
        """
        COMMENT ON INDEX idx_magic_links_workspace_created IS
        'Optimizes Shared Dashboard sorting by creation date';
        """
    )

    # =========================================================================
    # 3. Index for sorting by access count (popular links)
    # =========================================================================
    # Used by: GET /shared/links?sort_by=access_count&sort_order=desc
    # Find most viewed links
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_workspace_access_count
        ON magic_links(workspace_id, access_count DESC);
        """
    )

    op.execute(
        """
        COMMENT ON INDEX idx_magic_links_workspace_access_count IS
        'Optimizes Shared Dashboard sorting by access count';
        """
    )

    # =========================================================================
    # 4. Index for getting recent accesses per link
    # =========================================================================
    # Used by: GET /shared/links (to show recent_visitors preview)
    # Already have idx_magic_link_accesses_time but add workspace-aware one
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_link_accesses_recent
        ON magic_link_accesses(link_id, accessed_at DESC)
        INCLUDE (visitor_id, country_code, device_type);
        """
    )

    op.execute(
        """
        COMMENT ON INDEX idx_magic_link_accesses_recent IS
        'Optimizes fetching recent visitors for Shared Dashboard link rows';
        """
    )


def downgrade() -> None:
    """Remove Shared Dashboard indexes."""
    op.execute("DROP INDEX IF EXISTS idx_magic_link_accesses_recent;")
    op.execute("DROP INDEX IF EXISTS idx_magic_links_workspace_access_count;")
    op.execute("DROP INDEX IF EXISTS idx_magic_links_workspace_created;")
    op.execute("DROP INDEX IF EXISTS idx_magic_links_workspace_status;")
