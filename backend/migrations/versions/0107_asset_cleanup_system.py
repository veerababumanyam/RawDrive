"""Asset cleanup and duplicate detection system.

This migration creates the infrastructure for automatic asset cleanup:
- cleanup_recommendations: Stores flagged assets with recommendations for deletion
- cleanup_jobs: Background job tracking for cleanup analysis
- cleanup_settings: Per-workspace settings for cleanup behavior

Features:
- Duplicate detection via sha256 hash
- Similar faces detection via embedding cosine distance
- Unused asset identification via view history
- Integration with billing tier storage limits

Revision ID: 0107
Revises: 0106
Create Date: 2025-01-06
"""

from alembic import op

revision = "0107"
down_revision = "0106"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create asset cleanup infrastructure."""

    # ==========================================================================
    # CLEANUP RECOMMENDATIONS TABLE
    # ==========================================================================
    # Stores flagged assets with cleanup recommendations and confidence scores
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cleanup_recommendations (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation - all queries must filter by workspace_id
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Asset being recommended for cleanup
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,

            -- Recommendation type
            -- 'duplicate': Exact or near-duplicate file (sha256 match)
            -- 'similar_face': Very similar photo with same face(s)
            -- 'unused': No views, downloads, or gallery inclusion
            -- 'low_quality': Below quality threshold
            -- 'old_unused': Old file with no recent activity
            recommendation_type VARCHAR(50) NOT NULL
                CHECK (recommendation_type IN (
                    'duplicate',
                    'similar_face',
                    'unused',
                    'low_quality',
                    'old_unused'
                )),

            -- Confidence score (0.0-1.0) for the recommendation
            -- Higher score = more confident this asset should be cleaned up
            confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

            -- Status of the recommendation
            -- 'pending': Awaiting user review
            -- 'approved': User approved for deletion
            -- 'rejected': User rejected, will not delete
            -- 'deleted': Asset has been deleted
            -- 'auto_approved': Auto-approved based on workspace settings
            status VARCHAR(50) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'deleted', 'auto_approved')),

            -- Reference to related asset (for duplicates/similar comparisons)
            -- For duplicate recommendations, this is the original/kept asset
            related_asset_id UUID REFERENCES assets(asset_id) ON DELETE SET NULL,

            -- Detailed reasoning for the recommendation
            -- JSONB allows flexible storage of different recommendation details
            -- Examples:
            -- - duplicate: {"sha256_match": true, "size_bytes": 5242880}
            -- - similar_face: {"face_ids": [...], "similarity_score": 0.95}
            -- - unused: {"days_since_upload": 90, "view_count": 0}
            details JSONB NOT NULL DEFAULT '{}',

            -- Bytes that would be freed if asset is deleted
            potential_savings_bytes BIGINT NOT NULL DEFAULT 0,

            -- User who reviewed this recommendation (NULL if pending)
            reviewed_by_user_id UUID REFERENCES users(user_id),
            reviewed_at TIMESTAMPTZ,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Ensure unique recommendation per asset/type combination
            CONSTRAINT uq_cleanup_recommendation_asset_type
                UNIQUE (asset_id, recommendation_type)
        );
        """
    )

    # Indexes for common query patterns
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cleanup_recs_workspace "
        "ON cleanup_recommendations(workspace_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cleanup_recs_status "
        "ON cleanup_recommendations(workspace_id, status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cleanup_recs_type "
        "ON cleanup_recommendations(workspace_id, recommendation_type);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cleanup_recs_confidence "
        "ON cleanup_recommendations(workspace_id, confidence DESC) "
        "WHERE status = 'pending';"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cleanup_recs_savings "
        "ON cleanup_recommendations(workspace_id, potential_savings_bytes DESC) "
        "WHERE status = 'pending';"
    )

    # ==========================================================================
    # CLEANUP JOBS TABLE
    # ==========================================================================
    # Tracks background cleanup analysis jobs
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cleanup_jobs (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Job status
            -- 'pending': Waiting to run
            -- 'running': Currently analyzing
            -- 'completed': Analysis complete
            -- 'failed': Job failed with error
            -- 'cancelled': User cancelled
            status VARCHAR(50) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

            -- Job type - what kind of cleanup analysis
            -- 'full_scan': Complete workspace analysis
            -- 'incremental': Analyze new assets since last job
            -- 'duplicates_only': Only check for duplicates
            -- 'faces_only': Only check for similar faces
            job_type VARCHAR(50) NOT NULL DEFAULT 'full_scan'
                CHECK (job_type IN (
                    'full_scan',
                    'incremental',
                    'duplicates_only',
                    'faces_only'
                )),

            -- Progress tracking
            total_assets INTEGER NOT NULL DEFAULT 0,
            processed_assets INTEGER NOT NULL DEFAULT 0,
            recommendations_created INTEGER NOT NULL DEFAULT 0,
            potential_savings_bytes BIGINT NOT NULL DEFAULT 0,

            -- Job scheduling
            scheduled_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,

            -- Error tracking
            error_message TEXT,
            error_details JSONB,

            -- User who initiated the job (NULL for scheduled jobs)
            initiated_by_user_id UUID REFERENCES users(user_id),

            -- Celery task ID for job management
            celery_task_id VARCHAR(255),

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # Indexes for cleanup jobs
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cleanup_jobs_workspace "
        "ON cleanup_jobs(workspace_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cleanup_jobs_status "
        "ON cleanup_jobs(workspace_id, status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cleanup_jobs_scheduled "
        "ON cleanup_jobs(scheduled_at) WHERE status = 'pending';"
    )

    # ==========================================================================
    # CLEANUP SETTINGS TABLE
    # ==========================================================================
    # Per-workspace cleanup configuration
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cleanup_settings (
            -- Primary key = workspace_id (one settings row per workspace)
            workspace_id UUID PRIMARY KEY REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Whether automatic cleanup analysis is enabled
            auto_analysis_enabled BOOLEAN NOT NULL DEFAULT FALSE,

            -- How often to run automatic analysis (days between runs)
            auto_analysis_interval_days INTEGER NOT NULL DEFAULT 30
                CHECK (auto_analysis_interval_days >= 1 AND auto_analysis_interval_days <= 365),

            -- Auto-approve high-confidence recommendations above this threshold
            -- NULL means no auto-approval
            auto_approve_threshold DECIMAL(5,4)
                CHECK (auto_approve_threshold IS NULL OR
                       (auto_approve_threshold >= 0.5 AND auto_approve_threshold <= 1.0)),

            -- Detection settings
            -- Minimum confidence for duplicate detection recommendations
            duplicate_confidence_threshold DECIMAL(5,4) NOT NULL DEFAULT 0.95
                CHECK (duplicate_confidence_threshold >= 0.5 AND duplicate_confidence_threshold <= 1.0),

            -- Minimum similarity for face-based recommendations (cosine distance)
            face_similarity_threshold DECIMAL(5,4) NOT NULL DEFAULT 0.90
                CHECK (face_similarity_threshold >= 0.5 AND face_similarity_threshold <= 1.0),

            -- Days without activity before considering asset "unused"
            unused_days_threshold INTEGER NOT NULL DEFAULT 90
                CHECK (unused_days_threshold >= 7 AND unused_days_threshold <= 730),

            -- Include assets in galleries when checking for "unused"
            include_gallery_assets BOOLEAN NOT NULL DEFAULT FALSE,

            -- Storage threshold - only show recommendations when usage exceeds
            -- this percentage of storage limit (0-100)
            storage_alert_threshold_percent INTEGER NOT NULL DEFAULT 80
                CHECK (storage_alert_threshold_percent >= 50 AND storage_alert_threshold_percent <= 100),

            -- Notification settings
            email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            notify_on_high_confidence BOOLEAN NOT NULL DEFAULT TRUE,
            notify_on_storage_critical BOOLEAN NOT NULL DEFAULT TRUE,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # ==========================================================================
    # ASSET VIEW TRACKING
    # ==========================================================================
    # Add view tracking columns to assets if not already present
    # This helps identify unused assets
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
        """
    )
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;
        """
    )
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0;
        """
    )
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS last_downloaded_at TIMESTAMPTZ;
        """
    )

    # Index for finding unused assets
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_assets_unused_check
        ON assets(workspace_id, view_count, created_at)
        WHERE status = 'available';
        """
    )

    # ==========================================================================
    # TRIGGERS FOR UPDATED_AT
    # ==========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_cleanup_recs_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trigger_cleanup_recs_updated_at ON cleanup_recommendations;
        CREATE TRIGGER trigger_cleanup_recs_updated_at
            BEFORE UPDATE ON cleanup_recommendations
            FOR EACH ROW
            EXECUTE FUNCTION update_cleanup_recs_updated_at();
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_cleanup_jobs_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trigger_cleanup_jobs_updated_at ON cleanup_jobs;
        CREATE TRIGGER trigger_cleanup_jobs_updated_at
            BEFORE UPDATE ON cleanup_jobs
            FOR EACH ROW
            EXECUTE FUNCTION update_cleanup_jobs_updated_at();
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_cleanup_settings_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trigger_cleanup_settings_updated_at ON cleanup_settings;
        CREATE TRIGGER trigger_cleanup_settings_updated_at
            BEFORE UPDATE ON cleanup_settings
            FOR EACH ROW
            EXECUTE FUNCTION update_cleanup_settings_updated_at();
        """
    )

    # ==========================================================================
    # HELPER FUNCTIONS
    # ==========================================================================

    # Function to get workspace cleanup summary
    op.execute(
        """
        CREATE OR REPLACE FUNCTION get_cleanup_summary(ws_id UUID)
        RETURNS TABLE (
            total_recommendations BIGINT,
            pending_recommendations BIGINT,
            potential_savings_bytes BIGINT,
            duplicates_count BIGINT,
            similar_faces_count BIGINT,
            unused_count BIGINT
        ) AS $$
        BEGIN
            RETURN QUERY
            SELECT
                COUNT(*) as total_recommendations,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_recommendations,
                COALESCE(SUM(potential_savings_bytes) FILTER (WHERE status = 'pending'), 0) as potential_savings_bytes,
                COUNT(*) FILTER (WHERE recommendation_type = 'duplicate' AND status = 'pending') as duplicates_count,
                COUNT(*) FILTER (WHERE recommendation_type = 'similar_face' AND status = 'pending') as similar_faces_count,
                COUNT(*) FILTER (WHERE recommendation_type = 'unused' AND status = 'pending') as unused_count
            FROM cleanup_recommendations
            WHERE workspace_id = ws_id;
        END;
        $$ LANGUAGE plpgsql STABLE;
        """
    )

    # Function to check if cleanup is needed based on storage usage
    op.execute(
        """
        CREATE OR REPLACE FUNCTION should_run_cleanup(ws_id UUID)
        RETURNS BOOLEAN AS $$
        DECLARE
            storage_used BIGINT;
            storage_limit BIGINT;
            alert_threshold INTEGER;
            usage_percent NUMERIC;
        BEGIN
            -- Get workspace storage usage
            SELECT storage_used_bytes INTO storage_used
            FROM workspace_storage_cache
            WHERE workspace_id = ws_id;

            IF storage_used IS NULL THEN
                RETURN FALSE;
            END IF;

            -- Get storage limit from plan
            SELECT sp.storage_bytes INTO storage_limit
            FROM workspace_subscriptions ws
            JOIN subscription_plans sp ON ws.plan_id = sp.plan_id
            WHERE ws.workspace_id = ws_id
              AND ws.status IN ('active', 'trialing')
            LIMIT 1;

            IF storage_limit IS NULL OR storage_limit <= 0 THEN
                RETURN FALSE;
            END IF;

            -- Get alert threshold
            SELECT COALESCE(cs.storage_alert_threshold_percent, 80) INTO alert_threshold
            FROM cleanup_settings cs
            WHERE cs.workspace_id = ws_id;

            IF alert_threshold IS NULL THEN
                alert_threshold := 80;
            END IF;

            -- Calculate usage percentage
            usage_percent := (storage_used::NUMERIC / storage_limit::NUMERIC) * 100;

            RETURN usage_percent >= alert_threshold;
        END;
        $$ LANGUAGE plpgsql STABLE;
        """
    )


def downgrade() -> None:
    """Remove asset cleanup infrastructure."""

    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS should_run_cleanup(UUID);")
    op.execute("DROP FUNCTION IF EXISTS get_cleanup_summary(UUID);")

    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS trigger_cleanup_settings_updated_at ON cleanup_settings;")
    op.execute("DROP TRIGGER IF EXISTS trigger_cleanup_jobs_updated_at ON cleanup_jobs;")
    op.execute("DROP TRIGGER IF EXISTS trigger_cleanup_recs_updated_at ON cleanup_recommendations;")

    # Drop trigger functions
    op.execute("DROP FUNCTION IF EXISTS update_cleanup_settings_updated_at();")
    op.execute("DROP FUNCTION IF EXISTS update_cleanup_jobs_updated_at();")
    op.execute("DROP FUNCTION IF EXISTS update_cleanup_recs_updated_at();")

    # Drop asset view tracking columns
    op.execute("DROP INDEX IF EXISTS idx_assets_unused_check;")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS last_downloaded_at;")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS download_count;")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS last_viewed_at;")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS view_count;")

    # Drop tables
    op.execute("DROP TABLE IF EXISTS cleanup_settings;")
    op.execute("DROP TABLE IF EXISTS cleanup_jobs;")
    op.execute("DROP TABLE IF EXISTS cleanup_recommendations;")
