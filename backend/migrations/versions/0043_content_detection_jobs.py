"""Create content_detection_jobs table for vision/content analysis job queue.

This migration creates the content_detection_jobs table which tracks the status
of AI content detection (tagging, scene detection, etc.) for each asset.

Follows the same pattern as face_detection_jobs but for content/vision analysis.

Key features:
- Job status tracking (pending, processing, completed, failed)
- Retry count and error message for failure handling
- Priority queuing for user-initiated re-processing
- Provider tracking for debugging and analytics
- Timestamps for job lifecycle monitoring

Revision ID: 0043
Revises: 0042
Create Date: 2025-12-28
"""

from alembic import op

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create content_detection_jobs table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS content_detection_jobs (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Reference to the asset being processed
            -- UNIQUE constraint ensures only one job per asset
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,

            -- Current job status
            -- pending: Queued, waiting for worker
            -- processing: Worker is actively processing
            -- completed: Successfully finished
            -- failed: Failed after all retries exhausted
            status VARCHAR(20) NOT NULL DEFAULT 'pending',

            -- Which AI provider processed this job
            -- NULL until processing starts
            -- Values: 'cloud_vision', 'gemini', 'local'
            provider_used VARCHAR(50),

            -- Number of tags detected in the asset
            -- NULL until job completes successfully
            tags_detected INTEGER,

            -- Error message if job failed
            error_message TEXT,

            -- Number of retry attempts made
            retry_count INTEGER NOT NULL DEFAULT 0,

            -- Job priority for queue ordering
            -- Higher values = processed first
            -- 0: batch/background, 5: new upload (default), 10: manual re-analysis
            priority INTEGER NOT NULL DEFAULT 5,

            -- Timestamp for scheduled processing (NULL = process immediately)
            scheduled_at TIMESTAMPTZ DEFAULT NOW(),

            -- Timestamp when worker started processing
            started_at TIMESTAMPTZ,

            -- Timestamp when processing completed (success or final failure)
            completed_at TIMESTAMPTZ,

            -- Timestamp when job was created/queued
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Constraints
            CONSTRAINT content_detection_jobs_status_valid CHECK (
                status IN ('pending', 'processing', 'completed', 'failed')
            ),
            CONSTRAINT content_detection_jobs_retry_count_positive CHECK (retry_count >= 0),
            CONSTRAINT content_detection_jobs_tags_detected_positive CHECK (
                tags_detected IS NULL OR tags_detected >= 0
            ),

            -- Ensure only one job per asset
            CONSTRAINT content_detection_jobs_asset_unique UNIQUE (asset_id)
        );
        """
    )

    # Add table documentation
    op.execute(
        """
        COMMENT ON TABLE content_detection_jobs IS
        'Job queue for AI content/vision analysis processing (follows face_detection_jobs pattern)';
        """
    )

    # Index for worker queue queries - find pending jobs by priority
    # Workers query: SELECT * FROM content_detection_jobs
    #                WHERE status = 'pending'
    #                ORDER BY priority DESC, scheduled_at ASC
    #                FOR UPDATE SKIP LOCKED
    #                LIMIT batch_size
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_content_detection_jobs_queue
        ON content_detection_jobs(status, priority DESC, scheduled_at ASC)
        WHERE status = 'pending';
        """
    )

    # Index for workspace-scoped queries (admin dashboard, health metrics)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_content_detection_jobs_workspace
        ON content_detection_jobs(workspace_id);
        """
    )

    # Index for finding job by asset (status checks)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_content_detection_jobs_asset
        ON content_detection_jobs(asset_id);
        """
    )

    # Index for finding failed jobs (retry/monitoring)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_content_detection_jobs_failed
        ON content_detection_jobs(status)
        WHERE status = 'failed';
        """
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_content_detection_jobs_failed;")
    op.execute("DROP INDEX IF EXISTS idx_content_detection_jobs_asset;")
    op.execute("DROP INDEX IF EXISTS idx_content_detection_jobs_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_content_detection_jobs_queue;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS content_detection_jobs;")
