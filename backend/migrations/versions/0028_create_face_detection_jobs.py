"""Create face_detection_jobs table for background job tracking.

This migration creates the face_detection_jobs table which tracks the status
of face detection processing for each photo. Key features:

- Job status tracking (pending, processing, completed, failed)
- Retry count and error message for failure handling
- Priority queuing for user-initiated re-processing
- Provider tracking for debugging and analytics
- Timestamps for job lifecycle monitoring

Jobs are created when photos are uploaded and processed asynchronously
by background workers using BullMQ.

Revision ID: 0028
Revises: 0027
Create Date: 2025-12-23
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create face_detection_jobs table for job tracking.
    
    Table structure:
    - id: Primary key UUID
    - workspace_id: Multi-tenant isolation (required)
    - photo_id: Reference to photo being processed (required, unique)
    - status: Job status (pending, processing, completed, failed)
    - provider_used: Which AI provider processed this job
    - faces_detected: Number of faces found (NULL until completed)
    - error_message: Error details if job failed
    - retry_count: Number of retry attempts
    - priority: Job priority (higher = processed first)
    - started_at: When processing began
    - completed_at: When processing finished
    - created_at: When job was queued
    """
    
    # Create face_detection_jobs table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS face_detection_jobs (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            
            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            
            -- Reference to the photo being processed
            -- UNIQUE constraint ensures only one job per photo
            photo_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
            
            -- Current job status
            -- pending: Queued, waiting for worker
            -- processing: Worker is actively processing
            -- completed: Successfully finished
            -- failed: Failed after all retries exhausted
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            
            -- Which AI provider processed this job
            -- NULL until processing starts
            -- Values: 'cloud_vision', 'gemini'
            provider_used VARCHAR(50),
            
            -- Number of faces detected in the photo
            -- NULL until job completes successfully
            faces_detected INTEGER,
            
            -- Error message if job failed
            -- Contains user-friendly message and technical details
            error_message TEXT,
            
            -- Number of retry attempts made
            -- Incremented each time job fails and is retried
            retry_count INTEGER NOT NULL DEFAULT 0,
            
            -- Job priority for queue ordering
            -- Higher values = processed first
            -- Default 0 for automatic jobs, 10+ for user-initiated
            priority INTEGER NOT NULL DEFAULT 0,
            
            -- Timestamp when worker started processing
            -- NULL until processing begins
            started_at TIMESTAMPTZ,
            
            -- Timestamp when processing completed (success or final failure)
            -- NULL until job finishes
            completed_at TIMESTAMPTZ,
            
            -- Timestamp when job was created/queued
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            -- Constraints
            CONSTRAINT face_detection_jobs_status_valid CHECK (
                status IN ('pending', 'processing', 'completed', 'failed')
            ),
            CONSTRAINT face_detection_jobs_retry_count_positive CHECK (retry_count >= 0),
            CONSTRAINT face_detection_jobs_faces_detected_positive CHECK (
                faces_detected IS NULL OR faces_detected >= 0
            ),
            
            -- Ensure only one job per photo
            CONSTRAINT face_detection_jobs_photo_unique UNIQUE (photo_id)
        );
        """
    )
    
    # Create indexes for common query patterns
    
    # Index for finding jobs by status and priority (worker queue queries)
    # Workers query: SELECT * FROM face_detection_jobs 
    #                WHERE status = 'pending' 
    #                ORDER BY priority DESC, created_at ASC
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_detection_jobs_queue 
        ON face_detection_jobs(status, priority DESC, created_at ASC);
        """
    )
    
    # Index for workspace-scoped queries (admin dashboard)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_detection_jobs_workspace ON face_detection_jobs(workspace_id);"
    )
    
    # Index for finding job by photo (status checks)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_detection_jobs_photo ON face_detection_jobs(photo_id);"
    )
    
    # Index for finding failed jobs (retry/monitoring)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_detection_jobs_failed ON face_detection_jobs(status) WHERE status = 'failed';"
    )


def downgrade() -> None:
    """Drop face_detection_jobs table.
    
    WARNING: This will permanently delete all job tracking data.
    """
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_face_detection_jobs_failed;")
    op.execute("DROP INDEX IF EXISTS idx_face_detection_jobs_photo;")
    op.execute("DROP INDEX IF EXISTS idx_face_detection_jobs_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_face_detection_jobs_queue;")
    
    # Drop table
    op.execute("DROP TABLE IF EXISTS face_detection_jobs;")
