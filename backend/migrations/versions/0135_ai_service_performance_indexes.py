"""Add AI service performance indexes.

Revision ID: 0135
Revises: 0134
Create Date: 2026-01-08

Addresses HIGH priority performance issues from SECURITY_REVIEW.md:
- Missing database indexes for photo_quality_analysis and asset_analysis tables
- These indexes optimize the queries used by AI filter endpoints

Reference: services/ai-service/IMMEDIATE_FIXES.md Issue 3
"""

from alembic import op

revision = "0135"
down_revision = "3a46921d84b5"  # Merge head
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ===========================================================================
    # photo_quality_analysis additional indexes
    # ===========================================================================

    # Index: Workspace + overall_score for quality tier filtering
    # Used by: /api/v1/workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/ai-filter
    op.execute(
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_photo_quality_workspace_score
        ON photo_quality_analysis(workspace_id, overall_score DESC)
        WHERE overall_score IS NOT NULL;
        """
    )

    # Index: Workspace + blur detection for blur filtering
    # Used by: AI filter blur_hide parameter
    op.execute(
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_photo_quality_workspace_blur
        ON photo_quality_analysis(workspace_id, blur_detected)
        WHERE blur_detected = TRUE;
        """
    )

    # ===========================================================================
    # asset_analysis additional indexes
    # ===========================================================================

    # Index: Composite workspace + asset_id for lookup queries
    # Used by: Gallery health endpoint joins
    op.execute(
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_analysis_workspace_asset
        ON asset_analysis(workspace_id, asset_id);
        """
    )

    # Index: Workspace + vision_status + face_status for status filtering
    # Used by: Gallery health statistics queries
    op.execute(
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_analysis_workspace_status_composite
        ON asset_analysis(workspace_id, vision_status, face_status);
        """
    )


def downgrade() -> None:
    # Drop indexes in reverse order
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_asset_analysis_workspace_status_composite;")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_asset_analysis_workspace_asset;")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_photo_quality_workspace_blur;")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_photo_quality_workspace_score;")
