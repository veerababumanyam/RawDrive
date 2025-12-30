"""Add gallery_picks_summary materialized view for client activity sync.

This migration adds:
- gallery_picks_summary: Materialized view aggregating picks (selections) per asset
- Additional indexes for performance

Feature: 015-client-selection-sync
Revision ID: 0058
Revises: 0057
Create Date: 2025-12-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # T006: Create gallery_picks_summary materialized view
    # Mirrors gallery_favorites_summary but for 'select' type interactions
    # =========================================================================
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS gallery_picks_summary AS
        SELECT
            ga.workspace_id,
            ga.gallery_id,
            ga.asset_id,
            COUNT(DISTINCT ci.actor->>'visitor_id') AS unique_pick_count,
            MAX(ci.created_at) AS last_picked_at
        FROM gallery_assets ga
        LEFT JOIN client_interactions ci
            ON ga.gallery_id = ci.gallery_id
            AND ga.asset_id = ci.asset_id
            AND ci.type = 'select'
        WHERE ga.visible = TRUE
        GROUP BY ga.workspace_id, ga.gallery_id, ga.asset_id;
        """
    )

    # =========================================================================
    # T007: Create unique index for concurrent refresh
    # =========================================================================
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_gps_gallery_asset ON gallery_picks_summary(gallery_id, asset_id);"
    )

    # =========================================================================
    # T008: Create index for sorting by pick count
    # =========================================================================
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gps_workspace_count ON gallery_picks_summary(workspace_id, unique_pick_count DESC);"
    )

    # =========================================================================
    # T009: Create refresh function for both materialized views
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_client_activity_views()
        RETURNS void AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY gallery_favorites_summary;
            REFRESH MATERIALIZED VIEW CONCURRENTLY gallery_picks_summary;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # =========================================================================
    # Additional index on client_interactions for faster type filtering
    # =========================================================================
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ci_gallery_asset_type ON client_interactions(gallery_id, asset_id, type);"
    )


def downgrade() -> None:
    # Drop function
    op.execute("DROP FUNCTION IF EXISTS refresh_client_activity_views();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_ci_gallery_asset_type;")
    op.execute("DROP INDEX IF EXISTS idx_gps_workspace_count;")
    op.execute("DROP INDEX IF EXISTS idx_gps_gallery_asset;")

    # Drop materialized view
    op.execute("DROP MATERIALIZED VIEW IF EXISTS gallery_picks_summary;")
