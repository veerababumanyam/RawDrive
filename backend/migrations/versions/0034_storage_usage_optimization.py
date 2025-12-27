"""Add storage usage optimization indexes and materialized view.

Revision ID: 0034
Revises: 0033
Create Date: 2025-12-27

This migration adds:
1. Partial index for efficient storage calculation (only 'available' assets)
2. Composite index for workspace storage aggregation
3. Function for getting storage usage with caching support
"""

from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add storage optimization indexes."""

    # Partial index for storage aggregation - only 'available' assets count
    # This dramatically speeds up SUM(original_bytes) WHERE status = 'available'
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_assets_storage_usage
        ON assets(workspace_id, original_bytes)
        WHERE status = 'available';
        """
    )

    # Create a function for storage calculation with optional caching hint
    # This can be called directly or used as basis for background job aggregation
    op.execute(
        """
        CREATE OR REPLACE FUNCTION get_workspace_storage_bytes(ws_id UUID)
        RETURNS BIGINT AS $$
        DECLARE
            total_bytes BIGINT;
        BEGIN
            SELECT COALESCE(SUM(original_bytes), 0)
            INTO total_bytes
            FROM assets
            WHERE workspace_id = ws_id
              AND status = 'available';

            RETURN total_bytes;
        END;
        $$ LANGUAGE plpgsql STABLE;
        """
    )

    # Create workspace_storage_cache table for caching aggregated storage
    # This reduces load on the assets table for frequently accessed workspaces
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_storage_cache (
            workspace_id UUID PRIMARY KEY REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            storage_used_bytes BIGINT NOT NULL DEFAULT 0,
            asset_count INTEGER NOT NULL DEFAULT 0,
            last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            -- Track if cache is stale (updated by triggers on assets table)
            is_stale BOOLEAN NOT NULL DEFAULT TRUE
        );
        """
    )

    # Index for finding stale caches (background job optimization)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_storage_cache_stale
        ON workspace_storage_cache(is_stale)
        WHERE is_stale = TRUE;
        """
    )

    # Trigger function to mark cache as stale when assets change
    op.execute(
        """
        CREATE OR REPLACE FUNCTION mark_storage_cache_stale()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Mark the workspace's storage cache as stale
            -- Use UPSERT to handle case where cache row doesn't exist yet
            INSERT INTO workspace_storage_cache (workspace_id, is_stale)
            VALUES (
                COALESCE(NEW.workspace_id, OLD.workspace_id),
                TRUE
            )
            ON CONFLICT (workspace_id)
            DO UPDATE SET is_stale = TRUE;

            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Trigger on assets table for INSERT/UPDATE/DELETE
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_mark_storage_stale ON assets;
        CREATE TRIGGER trg_mark_storage_stale
        AFTER INSERT OR UPDATE OF original_bytes, status OR DELETE
        ON assets
        FOR EACH ROW
        EXECUTE FUNCTION mark_storage_cache_stale();
        """
    )

    # Function to refresh a single workspace's storage cache
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_workspace_storage_cache(ws_id UUID)
        RETURNS workspace_storage_cache AS $$
        DECLARE
            result workspace_storage_cache;
        BEGIN
            INSERT INTO workspace_storage_cache (
                workspace_id,
                storage_used_bytes,
                asset_count,
                last_updated_at,
                is_stale
            )
            SELECT
                ws_id,
                COALESCE(SUM(original_bytes), 0),
                COUNT(*),
                NOW(),
                FALSE
            FROM assets
            WHERE workspace_id = ws_id
              AND status = 'available'
            ON CONFLICT (workspace_id)
            DO UPDATE SET
                storage_used_bytes = EXCLUDED.storage_used_bytes,
                asset_count = EXCLUDED.asset_count,
                last_updated_at = EXCLUDED.last_updated_at,
                is_stale = FALSE
            RETURNING * INTO result;

            RETURN result;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def downgrade() -> None:
    """Remove storage optimization."""

    # Drop trigger
    op.execute("DROP TRIGGER IF EXISTS trg_mark_storage_stale ON assets;")

    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS refresh_workspace_storage_cache(UUID);")
    op.execute("DROP FUNCTION IF EXISTS mark_storage_cache_stale();")
    op.execute("DROP FUNCTION IF EXISTS get_workspace_storage_bytes(UUID);")

    # Drop cache table
    op.execute("DROP TABLE IF EXISTS workspace_storage_cache;")

    # Drop index
    op.execute("DROP INDEX IF EXISTS idx_assets_storage_usage;")
