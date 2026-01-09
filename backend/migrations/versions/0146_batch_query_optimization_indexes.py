"""Add batch query optimization indexes.

Revision ID: 0146
Revises: 0145
Create Date: 2026-01-09

Adds indexes to optimize batch query operations:
- Sub-gallery photo counts (LEFT JOIN optimization)
- Gallery list photo counts (CTE optimization)
- Batch asset lookups
- Batch quality score lookups

Reference: SQL Query Batching Implementation Plan
Target: Reduce N+1 queries from ~50 to 2-3 queries
"""

from alembic import op

revision = "0146"
down_revision = "0145"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ===========================================================================
    # gallery_assets indexes for photo count optimization
    # ===========================================================================

    # Index: Optimizes sub-gallery photo counts in get_gallery()
    # Used by: LEFT JOIN subquery for counting visible assets per sub-gallery
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_assets_subgallery_counts
        ON gallery_assets(gallery_id, sub_gallery_id, visible)
        WHERE visible = TRUE;
        """
    )

    # Index: Optimizes gallery list photo counts in list_galleries()
    # Used by: CTE for batch counting assets per gallery in workspace
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_assets_workspace_gallery_visible
        ON gallery_assets(workspace_id, gallery_id, visible)
        WHERE visible = TRUE;
        """
    )

    # ===========================================================================
    # assets indexes for batch lookups
    # ===========================================================================

    # Index: Optimizes batch asset metadata queries
    # Used by: POST /api/v1/batch/assets/metadata
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_assets_workspace_batch
        ON assets(workspace_id, asset_id)
        WHERE deleted = FALSE;
        """
    )

    # ===========================================================================
    # photo_quality_analysis indexes for batch lookups
    # ===========================================================================

    # Index: Optimizes batch quality score queries with DISTINCT ON
    # Used by: POST /api/v1/batch/assets/quality-scores
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_photo_quality_batch
        ON photo_quality_analysis(workspace_id, asset_id, analyzed_at DESC);
        """
    )


def downgrade() -> None:
    # Drop indexes in reverse order
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_photo_quality_batch;")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_assets_workspace_batch;")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_gallery_assets_workspace_gallery_visible;")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_gallery_assets_subgallery_counts;")
