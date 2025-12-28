"""Extend asset_tags table for AI-generated tags.

Adds source, confidence, and ai_metadata columns to track AI-generated tags
separately from manual tags.

Revision ID: 0041
Revises: 0040
Create Date: 2025-12-28

This migration adds columns to distinguish AI-generated tags from manual tags:
- source: 'manual', 'ai_vision', 'ai_gemini', 'ai_local'
- confidence: AI confidence score 0.0-1.0
- ai_metadata: Provider-specific metadata (bounding boxes, model version, etc.)
"""

from alembic import op

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add source column with check constraint
    op.execute(
        """
        ALTER TABLE asset_tags
        ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'ai_vision', 'ai_gemini', 'ai_local'));
        """
    )

    # Add confidence column for AI tags
    op.execute(
        """
        ALTER TABLE asset_tags
        ADD COLUMN IF NOT EXISTS confidence NUMERIC(5, 4);
        """
    )

    # Add ai_metadata column for provider-specific data
    op.execute(
        """
        ALTER TABLE asset_tags
        ADD COLUMN IF NOT EXISTS ai_metadata JSONB;
        """
    )

    # Add documentation comments
    op.execute(
        """
        COMMENT ON COLUMN asset_tags.source IS
        'Tag source: manual (user added), ai_vision (Cloud Vision), ai_gemini (Gemini), ai_local (local model)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN asset_tags.confidence IS
        'AI confidence score 0.0-1.0, NULL for manual tags';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN asset_tags.ai_metadata IS
        'Provider-specific metadata (e.g., detection bounding box, model version)';
        """
    )

    # Index for filtering by source (common query pattern)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_tags_source
        ON asset_tags(workspace_id, source);
        """
    )

    # GIN index for AI metadata queries (only for AI-generated tags)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_tags_ai_metadata
        ON asset_tags USING gin(ai_metadata)
        WHERE source != 'manual';
        """
    )


def downgrade() -> None:
    # Drop indexes first
    op.execute("DROP INDEX IF EXISTS idx_asset_tags_ai_metadata;")
    op.execute("DROP INDEX IF EXISTS idx_asset_tags_source;")

    # Drop columns
    op.execute("ALTER TABLE asset_tags DROP COLUMN IF EXISTS ai_metadata;")
    op.execute("ALTER TABLE asset_tags DROP COLUMN IF EXISTS confidence;")
    op.execute("ALTER TABLE asset_tags DROP COLUMN IF EXISTS source;")
