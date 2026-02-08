"""Add GEO (Generative Engine Optimization) search tables and indexes.

Creates tables for GEO search logging and query embedding caching:
- geo_search_logs: Track search queries, results, user interactions, and performance metrics
- geo_query_embeddings: Cache query text → 512-dim CLIP embeddings for faster lookups

Feature: GEO (Generative Engine Optimization) - Natural Language Photo Search
Revision ID: 0183
Revises: 0182
Create Date: 2026-02-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0183"
down_revision = "0182"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create GEO search tables and indexes."""

    # =========================================================================
    # GEO_SEARCH_LOGS TABLE - Search query logging and analytics
    # =========================================================================
    op.create_table(
        "geo_search_logs",
        sa.Column("search_id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),

        # Query details
        sa.Column("query_text", sa.Text, nullable=False),
        sa.Column("parsed_intent", postgresql.JSONB, nullable=True),
        sa.Column("gallery_id", postgresql.UUID(as_uuid=True), nullable=True),

        # Results
        sa.Column("result_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("top_result_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),

        # User interaction tracking
        sa.Column("clicked_asset_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.Column("downloaded_asset_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.Column("feedback_score", sa.Integer, nullable=True),
        sa.Column("feedback_comment", sa.Text, nullable=True),

        # Performance metrics
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("cache_hit", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("error_message", sa.Text, nullable=True),

        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),

        # Foreign keys
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.workspace_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["gallery_id"],
            ["galleries.gallery_id"],
            ondelete="SET NULL",
        ),
    )

    # Indexes for geo_search_logs
    op.create_index(
        "idx_geo_search_workspace",
        "geo_search_logs",
        ["workspace_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_geo_search_user",
        "geo_search_logs",
        ["user_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_geo_search_created",
        "geo_search_logs",
        [sa.text("created_at DESC")],
    )

    # Partial index for no-result queries (for identifying failed searches)
    op.execute(
        """
        CREATE INDEX idx_geo_search_no_results
        ON geo_search_logs(workspace_id, created_at DESC)
        WHERE result_count = 0
        """
    )

    # GIN index for full-text search on query_text
    op.execute(
        """
        CREATE INDEX idx_geo_search_query_text
        ON geo_search_logs
        USING gin(to_tsvector('english', query_text))
        """
    )

    # =========================================================================
    # GEO_QUERY_EMBEDDINGS TABLE - Query embedding cache
    # =========================================================================
    op.create_table(
        "geo_query_embeddings",
        sa.Column("query_hash", sa.String(64), primary_key=True),
        sa.Column("query_text", sa.Text, nullable=False),
        sa.Column("embedding", postgresql.ARRAY(sa.Float), nullable=False),

        # Usage tracking
        sa.Column("use_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),

        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),

        # Constraint: Verify 512-dimensional CLIP embedding
        sa.CheckConstraint(
            "array_length(embedding, 1) = 512",
            name="chk_geo_embedding_dim_512",
        ),
    )

    # Indexes for geo_query_embeddings
    op.create_index(
        "idx_geo_query_last_used",
        "geo_query_embeddings",
        [sa.text("last_used_at DESC")],
    )
    op.create_index(
        "idx_geo_query_use_count",
        "geo_query_embeddings",
        [sa.text("use_count DESC")],
    )

    # Cleanup trigger: Delete query embeddings unused for 90 days
    op.execute(
        """
        CREATE OR REPLACE FUNCTION cleanup_old_query_embeddings()
        RETURNS TRIGGER AS $$
        BEGIN
            DELETE FROM geo_query_embeddings
            WHERE last_used_at < NOW() - INTERVAL '90 days';
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trigger_cleanup_query_embeddings ON geo_query_embeddings;

        CREATE TRIGGER trigger_cleanup_query_embeddings
        AFTER INSERT ON geo_query_embeddings
        FOR EACH ROW
        EXECUTE FUNCTION cleanup_old_query_embeddings();
        """
    )

    # =========================================================================
    # EXTEND AI_PROCESSING_RESULTS TABLE with GEO metadata
    # =========================================================================
    op.execute("ALTER TABLE ai_processing_results ADD COLUMN IF NOT EXISTS scene_classification JSONB")
    op.execute("ALTER TABLE ai_processing_results ADD COLUMN IF NOT EXISTS mood_tags JSONB")
    op.execute("ALTER TABLE ai_processing_results ADD COLUMN IF NOT EXISTS activity_tags JSONB")

    # GIN indexes for JSONB columns to support GEO metadata queries
    op.execute(
        """
        CREATE INDEX idx_ai_results_scene
        ON ai_processing_results
        USING gin(scene_classification jsonb_path_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX idx_ai_results_mood
        ON ai_processing_results
        USING gin(mood_tags jsonb_path_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX idx_ai_results_activity
        ON ai_processing_results
        USING gin(activity_tags jsonb_path_ops)
        """
    )

    # Add column comments
    op.execute(
        """
        COMMENT ON TABLE geo_search_logs IS
        'Tracks all photo search queries, results, user interactions, and performance metrics for GEO (Generative Engine Optimization) analytics and learning.';
        """
    )
    op.execute(
        """
        COMMENT ON TABLE geo_query_embeddings IS
        'Caches query text → 512-dimensional CLIP text embeddings to avoid repeated calls to AI Processing Service. TTL: effectively infinite (queries don''t change semantically).';
        """
    )
    op.execute(
        """
        COMMENT ON COLUMN ai_processing_results.scene_classification IS
        'JSONB storing detected scene type: {"scene": "ceremony", "confidence": 0.92, "subscene": "vows"}. Used by GEO for scene-based filtering.';
        """
    )
    op.execute(
        """
        COMMENT ON COLUMN ai_processing_results.mood_tags IS
        'JSONB array storing detected moods/atmospheres: [{"tag": "romantic", "confidence": 0.88}]. Used by GEO for mood-based search.';
        """
    )
    op.execute(
        """
        COMMENT ON COLUMN ai_processing_results.activity_tags IS
        'JSONB array storing detected activities/actions: [{"tag": "dancing", "confidence": 0.95}]. Used by GEO for activity-based search.';
        """
    )


def downgrade() -> None:
    """Drop GEO search tables and indexes."""

    # Drop column comments
    op.execute("COMMENT ON COLUMN ai_processing_results.activity_tags IS NULL")
    op.execute("COMMENT ON COLUMN ai_processing_results.mood_tags IS NULL")
    op.execute("COMMENT ON COLUMN ai_processing_results.scene_classification IS NULL")
    op.execute("COMMENT ON TABLE geo_query_embeddings IS NULL")
    op.execute("COMMENT ON TABLE geo_search_logs IS NULL")

    # Drop JSONB indexes and columns
    op.execute("DROP INDEX IF EXISTS idx_ai_results_activity")
    op.execute("DROP INDEX IF EXISTS idx_ai_results_mood")
    op.execute("DROP INDEX IF EXISTS idx_ai_results_scene")
    op.drop_column("ai_processing_results", "activity_tags")
    op.drop_column("ai_processing_results", "mood_tags")
    op.drop_column("ai_processing_results", "scene_classification")

    # Drop cleanup trigger
    op.execute("DROP TRIGGER IF EXISTS trigger_cleanup_query_embeddings ON geo_query_embeddings")
    op.execute("DROP FUNCTION IF EXISTS cleanup_old_query_embeddings()")

    # Drop tables
    op.drop_table("geo_query_embeddings")
    op.drop_table("geo_search_logs")
