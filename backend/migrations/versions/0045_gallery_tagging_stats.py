"""Create gallery_tagging_stats materialized view for health dashboard.

This migration creates a materialized view that aggregates tagging completion
statistics per gallery for efficient health metrics queries.

The view is refreshed:
- On-demand via refresh_gallery_tagging_stats() function
- CONCURRENTLY to avoid blocking reads
- Recommended: Refresh every 5 minutes via cron or after bulk operations

Revision ID: 0045
Revises: 0044
Create Date: 2025-12-28
"""

from alembic import op

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create materialized view for gallery tagging stats
    # Aggregates analysis status per gallery for efficient dashboard queries
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS gallery_tagging_stats AS
        SELECT
            ga.gallery_id,
            g.workspace_id,
            COUNT(DISTINCT a.asset_id) as total_assets,
            COUNT(DISTINCT CASE WHEN aa.status = 'completed' THEN a.asset_id END) as tagged_assets,
            COUNT(DISTINCT CASE WHEN aa.status = 'pending' THEN a.asset_id END) as pending_assets,
            COUNT(DISTINCT CASE WHEN aa.status = 'processing' THEN a.asset_id END) as processing_assets,
            COUNT(DISTINCT CASE WHEN aa.status = 'failed' THEN a.asset_id END) as failed_assets,
            COUNT(DISTINCT CASE WHEN aa.status = 'skipped' THEN a.asset_id END) as skipped_assets,
            COUNT(DISTINCT CASE WHEN aa.status IS NULL THEN a.asset_id END) as unqueued_assets,
            MAX(aa.updated_at) as last_analysis_at,
            NOW() as refreshed_at
        FROM galleries g
        JOIN gallery_assets ga ON g.gallery_id = ga.gallery_id
        JOIN assets a ON ga.asset_id = a.asset_id AND a.deleted = FALSE
        LEFT JOIN asset_analysis aa ON a.asset_id = aa.asset_id
        WHERE g.deleted = FALSE
        GROUP BY ga.gallery_id, g.workspace_id;
        """
    )

    # Unique index on gallery_id for CONCURRENTLY refresh
    # Required for REFRESH MATERIALIZED VIEW CONCURRENTLY
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_tagging_stats_gallery
        ON gallery_tagging_stats(gallery_id);
        """
    )

    # Index for workspace-level queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_tagging_stats_workspace
        ON gallery_tagging_stats(workspace_id);
        """
    )

    # Function to refresh the materialized view concurrently
    # CONCURRENTLY allows reads during refresh (requires unique index)
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_gallery_tagging_stats()
        RETURNS void AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY gallery_tagging_stats;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Function to refresh stats for a specific workspace (more efficient for single-workspace updates)
    # Note: PostgreSQL doesn't support partial refresh of materialized views,
    # but this function can be extended in the future with a custom table approach
    op.execute(
        """
        COMMENT ON FUNCTION refresh_gallery_tagging_stats() IS
        'Refreshes the gallery_tagging_stats materialized view concurrently. Call after bulk tagging operations or on a schedule (recommended: every 5 minutes).';
        """
    )

    # Add comment on materialized view
    op.execute(
        """
        COMMENT ON MATERIALIZED VIEW gallery_tagging_stats IS
        'Aggregated tagging completion statistics per gallery for health dashboard. Refresh via refresh_gallery_tagging_stats().';
        """
    )


def downgrade() -> None:
    # Drop function first
    op.execute("DROP FUNCTION IF EXISTS refresh_gallery_tagging_stats();")

    # Drop indexes (automatically dropped with view, but explicit for clarity)
    op.execute("DROP INDEX IF EXISTS idx_gallery_tagging_stats_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_tagging_stats_gallery;")

    # Drop materialized view
    op.execute("DROP MATERIALIZED VIEW IF EXISTS gallery_tagging_stats;")
