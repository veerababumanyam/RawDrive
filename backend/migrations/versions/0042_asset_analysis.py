"""Create asset_analysis table for tracking AI processing state.

Tracks AI analysis status per asset to prevent duplicate processing and
provide visibility into tagging completion.

Revision ID: 0042
Revises: 0041
Create Date: 2025-12-28

This table tracks:
- Overall analysis status (pending, processing, completed, failed, skipped)
- Vision/content analysis status and results
- Face analysis status and results
- Error handling with retry logic
"""

from alembic import op

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create asset_analysis table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS asset_analysis (
            asset_id UUID PRIMARY KEY REFERENCES assets(asset_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Overall status (derived from vision and face statuses)
            status VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),

            -- Content/vision analysis tracking
            vision_status VARCHAR(20) DEFAULT 'pending'
                CHECK (vision_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
            vision_analyzed_at TIMESTAMPTZ,
            vision_provider VARCHAR(50),
            vision_model_version VARCHAR(100),
            vision_tags_count INTEGER DEFAULT 0,

            -- Face analysis tracking
            face_status VARCHAR(20) DEFAULT 'pending'
                CHECK (face_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
            face_analyzed_at TIMESTAMPTZ,
            face_provider VARCHAR(50),
            faces_detected INTEGER DEFAULT 0,

            -- Error handling
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            next_retry_at TIMESTAMPTZ,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Add table documentation
    op.execute(
        """
        COMMENT ON TABLE asset_analysis IS
        'Tracks AI analysis state for each asset to prevent duplicate processing';
        """
    )

    # Index for workspace-level health queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_analysis_workspace_status
        ON asset_analysis(workspace_id, status);
        """
    )

    # Index for finding pending/processing vision jobs
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_analysis_vision_status
        ON asset_analysis(vision_status)
        WHERE vision_status IN ('pending', 'processing');
        """
    )

    # Index for finding pending/processing face jobs
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_analysis_face_status
        ON asset_analysis(face_status)
        WHERE face_status IN ('pending', 'processing');
        """
    )

    # Index for retry scheduling
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_analysis_next_retry
        ON asset_analysis(next_retry_at)
        WHERE next_retry_at IS NOT NULL AND status = 'failed';
        """
    )

    # Function to auto-update updated_at timestamp
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_asset_analysis_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Trigger to auto-update timestamp
    op.execute(
        """
        DROP TRIGGER IF EXISTS trigger_asset_analysis_updated_at ON asset_analysis;
        CREATE TRIGGER trigger_asset_analysis_updated_at
            BEFORE UPDATE ON asset_analysis
            FOR EACH ROW
            EXECUTE FUNCTION update_asset_analysis_timestamp();
        """
    )


def downgrade() -> None:
    # Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS trigger_asset_analysis_updated_at ON asset_analysis;")
    op.execute("DROP FUNCTION IF EXISTS update_asset_analysis_timestamp;")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_asset_analysis_next_retry;")
    op.execute("DROP INDEX IF EXISTS idx_asset_analysis_face_status;")
    op.execute("DROP INDEX IF EXISTS idx_asset_analysis_vision_status;")
    op.execute("DROP INDEX IF EXISTS idx_asset_analysis_workspace_status;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS asset_analysis;")
