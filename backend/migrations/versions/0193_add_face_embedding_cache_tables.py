"""Add face embedding cache tables for smart tagging layer.

This migration creates tables for caching face detection results and embeddings
to avoid repeated AI API calls for already-processed photos. This implements
the L3 (persistent database) layer of the multi-tier caching architecture.

Features:
- Asset-level embedding cache with hash-based deduplication
- Face group centroid cache to avoid recalculating clusters
- TTL-based cache expiration with hit tracking
- Performance-optimized indexes for common queries

Performance Targets:
- Cache hit latency: 50-200ms (vs 5-10s for AI API calls)
- 90% reduction in database queries for repeated face detections
- Reduced AI API costs by avoiding re-processing

Feature: Smart Face Tagging Cache Layer
Task: Sprint 1, Task 1.4 - Add cache tables migration

Revision ID: 0193
Revises: 0192
Create Date: 2026-02-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers used by Alembic
revision = "0193"
down_revision = "0192"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create face embedding cache tables and indexes.

    New tables:
    - asset_embeddings_cache: L3 cache for processed assets
    - face_group_centroids_cache: Cache for computed cluster centroids

    These tables enable the smart caching layer that significantly
    improves face detection performance by avoiding repeated
    AI API calls for already-processed photos.
    """

    # =========================================================================
    # Asset Embeddings Cache Table
    # =========================================================================

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS asset_embeddings_cache (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,

            -- Image hash for deduplication (SHA-256)
            image_hash VARCHAR(64) NOT NULL,

            -- Cached detection results (JSONB for flexibility)
            faces_detected INTEGER DEFAULT 0,
            bounding_boxes JSONB,
            embeddings JSONB,
            confidence_scores JSONB,
            detection_metadata JSONB,

            -- Cache metadata
            cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ttl_seconds INTEGER DEFAULT 3600,
            hit_count INTEGER DEFAULT 0,
            last_accessed_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT asset_embeddings_cache_unique UNIQUE (workspace_id, asset_id, image_hash)
        );
        """
    )

    # Indexes for asset_embeddings_cache

    # Index for looking up cached results by asset
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_embeddings_cache_asset
        ON asset_embeddings_cache(asset_id);
        """
    )

    # Index for workspace queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_embeddings_cache_workspace
        ON asset_embeddings_cache(workspace_id);
        """
    )

    # Index for hash-based lookups (for duplicate detection)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_embeddings_cache_hash
        ON asset_embeddings_cache(image_hash);
        """
    )

    # Index for TTL-based cleanup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_embeddings_cache_expired
        ON asset_embeddings_cache(cached_at, ttl_seconds);
        """
    )

    # Index for popular assets (high hit count)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_embeddings_cache_popular
        ON asset_embeddings_cache(workspace_id, hit_count DESC, last_accessed_at DESC)
        WHERE hit_count > 10;
        """
    )

    # Column comments
    op.execute(
        """
        COMMENT ON TABLE asset_embeddings_cache IS
        'L3 cache for face detection results. Stores embeddings and bounding boxes
        to avoid repeated AI API calls. Implements write-through pattern with TTL.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN asset_embeddings_cache.image_hash IS
        'SHA-256 hash of image data for deduplication. Same image = same hash = cache hit.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN asset_embeddings_cache.bounding_boxes IS
        'JSONB array of {x, y, width, height} bounding boxes for detected faces.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN asset_embeddings_cache.embeddings IS
        'JSONB array of 512-dimensional face embeddings for similarity matching.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN asset_embeddings_cache.confidence_scores IS
        'JSONB array of detection confidence scores (0-1) for each face.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN asset_embeddings_cache.ttl_seconds IS
        'Time-to-live in seconds. Default 3600 (1 hour). Set to NULL for permanent cache.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN asset_embeddings_cache.hit_count IS
        'Number of times this cache entry has been accessed. Used for cache warming decisions.';
        """
    )

    # =========================================================================
    # Face Group Centroids Cache Table
    # =========================================================================

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS face_group_centroids_cache (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            face_group_id UUID NOT NULL REFERENCES face_groups(id) ON DELETE CASCADE,

            -- Cached centroid vector
            centroid_vector JSONB NOT NULL,
            face_count INTEGER NOT NULL,

            -- Cluster quality metrics
            quality_score DECIMAL(5,4),

            -- Metadata
            last_face_added_at TIMESTAMPTZ,
            calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ttl_seconds INTEGER DEFAULT 7200,

            -- Cache tracking
            hit_count INTEGER DEFAULT 0,
            last_accessed_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT face_group_centroids_cache_unique UNIQUE (workspace_id, face_group_id)
        );
        """
    )

    # Indexes for face_group_centroids_cache

    # Index for looking up cached centroids by group
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_group_centroids_cache_group
        ON face_group_centroids_cache(face_group_id);
        """
    )

    # Index for workspace queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_group_centroids_cache_workspace
        ON face_group_centroids_cache(workspace_id);
        """
    )

    # Index for TTL-based cleanup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_group_centroids_cache_expired
        ON face_group_centroids_cache(calculated_at, ttl_seconds);
        """
    )

    # Index for quality-based sorting
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_group_centroids_cache_quality
        ON face_group_centroids_cache(workspace_id, quality_score DESC NULLS LAST, face_count DESC);
        """
    )


    # Column comments
    op.execute(
        """
        COMMENT ON TABLE face_group_centroids_cache IS
        'Cache for computed face group centroids. Avoids recalculating cluster centers
        for similarity matching and clustering operations.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN face_group_centroids_cache.centroid_vector IS
        '512-dimensional centroid vector (mean of all face embeddings in the group).';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN face_group_centroids_cache.quality_score IS
        'Cluster quality metric (0-1). Higher = tighter cluster. NULL if not calculated.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN face_group_centroids_cache.ttl_seconds IS
        'Time-to-live in seconds. Default 7200 (2 hours). Centroids change less frequently.';
        """
    )

    # =========================================================================
    # Cache Statistics Helper Function
    # =========================================================================

    op.execute(
        """
        CREATE OR REPLACE FUNCTION get_face_cache_stats(p_workspace_id UUID)
        RETURNS TABLE (
            table_name TEXT,
            total_entries BIGINT,
            active_entries BIGINT,
            expired_entries BIGINT,
            total_hits BIGINT,
            avg_hit_count DECIMAL(10,2),
            cache_hit_rate DECIMAL(5,2)
        ) AS $$
        BEGIN
            RETURN QUERY
            SELECT
                'asset_embeddings_cache'::TEXT as table_name,
                COUNT(*)::BIGINT as total_entries,
                COUNT(*) FILTER (WHERE cached_at + INTERVAL '1 second' * ttl_seconds > NOW())::BIGINT as active_entries,
                COUNT(*) FILTER (WHERE cached_at + INTERVAL '1 second' * ttl_seconds < NOW())::BIGINT as expired_entries,
                COALESCE(SUM(hit_count), 0)::BIGINT as total_hits,
                COALESCE(AVG(hit_count), 0)::DECIMAL(10,2) as avg_hit_count,
                -- Calculate hit rate (hits / total requests, estimated)
                CASE
                    WHEN COUNT(*) > 0 THEN
                        COALESCE(
                            (SUM(hit_count)::DECIMAL / NULLIF(SUM(hit_count) + COUNT(*) * 0.1, 0)) * 100,
                            0
                        )
                    ELSE 0
                END as cache_hit_rate
            FROM asset_embeddings_cache
            WHERE workspace_id = p_workspace_id

            UNION ALL

            SELECT
                'face_group_centroids_cache'::TEXT,
                COUNT(*)::BIGINT,
                COUNT(*) FILTER (WHERE calculated_at + INTERVAL '1 second' * ttl_seconds > NOW())::BIGINT,
                COUNT(*) FILTER (WHERE calculated_at + INTERVAL '1 second' * ttl_seconds < NOW())::BIGINT,
                COALESCE(SUM(hit_count), 0)::BIGINT,
                COALESCE(AVG(hit_count), 0)::DECIMAL(10,2),
                CASE
                    WHEN COUNT(*) > 0 THEN
                        COALESCE(
                            (SUM(hit_count)::DECIMAL / NULLIF(SUM(hit_count) + COUNT(*) * 0.1, 0)) * 100,
                            0
                        )
                    ELSE 0
                END
            FROM face_group_centroids_cache
            WHERE workspace_id = p_workspace_id;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        COMMENT ON FUNCTION get_face_cache_stats IS
        'Get cache statistics for a workspace. Returns entry counts, hit rates,
        and other metrics for monitoring cache effectiveness.';
        """
    )

    # =========================================================================
    # Cache Cleanup Helper Function
    # =========================================================================

    op.execute(
        """
        CREATE OR REPLACE FUNCTION cleanup_expired_face_cache(p_workspace_id UUID DEFAULT NULL)
        RETURNS TABLE (
            table_name TEXT,
            entries_deleted BIGINT
        ) AS $$
        DECLARE
            v_deleted_assets BIGINT;
            v_deleted_centroids BIGINT;
        BEGIN
            -- Clean up expired asset embeddings
            DELETE FROM asset_embeddings_cache
            WHERE
                (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
                AND cached_at + INTERVAL '1 second' * ttl_seconds < NOW();
            GET DIAGNOSTICS v_deleted_assets = ROW_COUNT;

            table_name := 'asset_embeddings_cache';
            entries_deleted := v_deleted_assets;
            RETURN NEXT;

            -- Clean up expired face group centroids
            DELETE FROM face_group_centroids_cache
            WHERE
                (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
                AND calculated_at + INTERVAL '1 second' * ttl_seconds < NOW();
            GET DIAGNOSTICS v_deleted_centroids = ROW_COUNT;

            table_name := 'face_group_centroids_cache';
            entries_deleted := v_deleted_centroids;
            RETURN NEXT;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        COMMENT ON FUNCTION cleanup_expired_face_cache IS
        'Clean up expired cache entries. Call with workspace_id to clean specific workspace,
        or NULL to clean all expired entries globally.';
        """
    )


def downgrade() -> None:
    """Remove face embedding cache tables and indexes."""

    # Drop helper functions first
    op.execute("DROP FUNCTION IF EXISTS cleanup_expired_face_cache(UUID);")
    op.execute("DROP FUNCTION IF EXISTS get_face_cache_stats(UUID);")

    # Drop face_group_centroids_cache table (indexes dropped automatically)
    op.execute("DROP TABLE IF EXISTS face_group_centroids_cache;")

    # Drop asset_embeddings_cache table (indexes dropped automatically)
    op.execute("DROP TABLE IF EXISTS asset_embeddings_cache;")
