"""Create biometric consent and face audit remediation tables.

This migration creates the database schema for Face Detection Audit Remediation (002):
- workspace_biometric_settings: GDPR Article 9 biometric consent tracking
- face_rate_limit_config: Dedicated rate limits for face operations
- face_embedding_retention_jobs: Scheduled cleanup job tracking
- Adds face_embedding_retention_days to workspace_privacy_settings

Finding References:
- COM-001: Biometric Consent Management (Priority P1)
- SEC-001: Rate Limiting for Face Operations (Priority P2)
- COM-002: Face Data Retention Policy (Priority P4)

Feature: Face Detection Audit Remediation
Branch: 002-face-audit-remediation
Tasks: T001-T005
Revision ID: 0165
Revises: 0164
Create Date: 2026-01-21
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0165"
down_revision = "0164"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create biometric consent and face audit tables."""

    # =========================================================================
    # 1. WORKSPACE BIOMETRIC SETTINGS TABLE (T001, COM-001)
    # =========================================================================
    # Tracks GDPR Article 9 compliant consent for biometric data processing

    op.execute("""
        CREATE TABLE IF NOT EXISTS workspace_biometric_settings (
            -- Primary key and workspace association
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- =========================================================================
            -- CONSENT STATUS
            -- =========================================================================

            -- Whether face detection consent is granted for this workspace
            face_detection_enabled BOOLEAN NOT NULL DEFAULT FALSE,

            -- Current consent status for tracking
            consent_status VARCHAR(30) NOT NULL DEFAULT 'not_granted'
                CHECK (consent_status IN (
                    'not_granted',      -- No consent given
                    'granted',          -- Active consent
                    'withdrawn',        -- Consent revoked
                    'pending_deletion'  -- Awaiting cascade delete
                )),

            -- =========================================================================
            -- CONSENT AUDIT TRAIL (GDPR Article 9 Compliance)
            -- =========================================================================

            -- Who granted consent (user_id from users table)
            consented_by UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- When consent was granted
            consented_at TIMESTAMPTZ,

            -- IP address from which consent was granted
            consent_ip_address INET,

            -- User agent from consent action
            consent_user_agent TEXT,

            -- Version of privacy policy/terms accepted
            consent_policy_version VARCHAR(20),

            -- =========================================================================
            -- WITHDRAWAL TRACKING
            -- =========================================================================

            -- Who withdrew consent
            withdrawn_by UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- When consent was withdrawn
            withdrawn_at TIMESTAMPTZ,

            -- IP address from withdrawal
            withdrawal_ip_address INET,

            -- Reason for withdrawal (optional, user-provided)
            withdrawal_reason TEXT,

            -- =========================================================================
            -- FEATURE TOGGLES
            -- =========================================================================

            -- Allow face search in public galleries (requires privacy notice)
            public_face_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,

            -- Auto-cluster faces when detected
            auto_clustering_enabled BOOLEAN NOT NULL DEFAULT TRUE,

            -- Allow AI provider to process face data
            ai_processing_consent BOOLEAN NOT NULL DEFAULT FALSE,

            -- =========================================================================
            -- TIMESTAMPS
            -- =========================================================================

            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
    """)

    # Indexes for workspace_biometric_settings
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_biometric_settings_workspace
        ON workspace_biometric_settings(workspace_id);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_biometric_settings_status
        ON workspace_biometric_settings(consent_status)
        WHERE consent_status IN ('granted', 'pending_deletion');
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_biometric_settings_consented_by
        ON workspace_biometric_settings(consented_by)
        WHERE consented_by IS NOT NULL;
    """)

    # Trigger for updated_at
    op.execute("""
        CREATE OR REPLACE FUNCTION update_biometric_settings_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_biometric_settings_updated_at ON workspace_biometric_settings;
        CREATE TRIGGER trigger_biometric_settings_updated_at
        BEFORE UPDATE ON workspace_biometric_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_biometric_settings_updated_at();
    """)

    # =========================================================================
    # 2. FACE RATE LIMIT CONFIG TABLE (T002, SEC-001)
    # =========================================================================
    # Per-workspace rate limit configuration for face operations

    op.execute("""
        CREATE TABLE IF NOT EXISTS face_rate_limit_config (
            -- Primary key and workspace association
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- =========================================================================
            -- RATE LIMIT THRESHOLDS
            -- =========================================================================

            -- Face similarity search rate limit (requests per minute)
            face_search_rpm INTEGER NOT NULL DEFAULT 20
                CHECK (face_search_rpm >= 1 AND face_search_rpm <= 1000),

            -- Face detection trigger daily quota
            face_detection_daily_quota INTEGER NOT NULL DEFAULT 1000
                CHECK (face_detection_daily_quota >= 0 AND face_detection_daily_quota <= 100000),

            -- Bulk face operations rate limit (requests per minute)
            bulk_operations_rpm INTEGER NOT NULL DEFAULT 30
                CHECK (bulk_operations_rpm >= 1 AND bulk_operations_rpm <= 100),

            -- Face group merge operations rate limit (requests per minute)
            group_merge_rpm INTEGER NOT NULL DEFAULT 10
                CHECK (group_merge_rpm >= 1 AND group_merge_rpm <= 50),

            -- =========================================================================
            -- CURRENT USAGE TRACKING
            -- =========================================================================

            -- Current detection count for the day
            current_daily_detections INTEGER NOT NULL DEFAULT 0,

            -- When the daily quota resets (midnight UTC)
            daily_quota_reset_at TIMESTAMPTZ,

            -- =========================================================================
            -- OVERRIDE FLAGS
            -- =========================================================================

            -- Whether workspace has premium/unlimited rate limits
            is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,

            -- Custom rate limit multiplier (for enterprise plans)
            rate_limit_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.0
                CHECK (rate_limit_multiplier >= 0.1 AND rate_limit_multiplier <= 10.0),

            -- =========================================================================
            -- TIMESTAMPS
            -- =========================================================================

            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
    """)

    # Indexes for face_rate_limit_config
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_face_rate_limit_workspace
        ON face_rate_limit_config(workspace_id);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_face_rate_limit_unlimited
        ON face_rate_limit_config(is_unlimited)
        WHERE is_unlimited = TRUE;
    """)

    # Trigger for updated_at
    op.execute("""
        DROP TRIGGER IF EXISTS trigger_face_rate_limit_updated_at ON face_rate_limit_config;
        CREATE TRIGGER trigger_face_rate_limit_updated_at
        BEFORE UPDATE ON face_rate_limit_config
        FOR EACH ROW
        EXECUTE FUNCTION update_biometric_settings_updated_at();
    """)

    # =========================================================================
    # 3. FACE EMBEDDING RETENTION JOBS TABLE (T003, COM-002)
    # =========================================================================
    # Tracks scheduled cleanup jobs for face embedding retention

    op.execute("""
        CREATE TABLE IF NOT EXISTS face_embedding_retention_jobs (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Workspace association (NULL for system-wide cleanup)
            workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- =========================================================================
            -- JOB DETAILS
            -- =========================================================================

            -- Job type
            job_type VARCHAR(50) NOT NULL DEFAULT 'scheduled_cleanup'
                CHECK (job_type IN (
                    'scheduled_cleanup',     -- Nightly retention cleanup
                    'consent_withdrawal',    -- Cascade delete on consent revoke
                    'manual_cleanup',        -- Admin-triggered cleanup
                    'gdpr_deletion'          -- GDPR right-to-erasure request
                )),

            -- Job status
            status VARCHAR(30) NOT NULL DEFAULT 'pending'
                CHECK (status IN (
                    'pending',       -- Awaiting execution
                    'running',       -- Currently processing
                    'completed',     -- Successfully finished
                    'failed',        -- Execution failed
                    'cancelled',     -- Cancelled before completion
                    'paused'         -- Temporarily paused
                )),

            -- =========================================================================
            -- EXECUTION DETAILS
            -- =========================================================================

            -- When the job started
            started_at TIMESTAMPTZ,

            -- When the job completed
            completed_at TIMESTAMPTZ,

            -- Total embeddings to process
            total_embeddings INTEGER NOT NULL DEFAULT 0,

            -- Embeddings processed so far
            processed_embeddings INTEGER NOT NULL DEFAULT 0,

            -- Embeddings deleted
            deleted_embeddings INTEGER NOT NULL DEFAULT 0,

            -- Embeddings skipped (legal hold, in-use, etc.)
            skipped_embeddings INTEGER NOT NULL DEFAULT 0,

            -- Last processed face ID (for checkpoint/resume)
            last_processed_face_id UUID,

            -- Batch size used for processing
            batch_size INTEGER NOT NULL DEFAULT 1000,

            -- =========================================================================
            -- RETENTION CRITERIA
            -- =========================================================================

            -- Retention cutoff date (delete embeddings older than this)
            retention_cutoff_date TIMESTAMPTZ,

            -- Retention days used for calculation
            retention_days INTEGER,

            -- =========================================================================
            -- ERROR HANDLING
            -- =========================================================================

            -- Last error message if failed
            error_message TEXT,

            -- Number of retry attempts
            retry_count INTEGER NOT NULL DEFAULT 0,

            -- Maximum retry attempts
            max_retries INTEGER NOT NULL DEFAULT 3,

            -- =========================================================================
            -- AUDIT TRAIL
            -- =========================================================================

            -- Who triggered the job (NULL for system-triggered)
            triggered_by UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Reason for the job
            trigger_reason TEXT,

            -- =========================================================================
            -- TIMESTAMPS
            -- =========================================================================

            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
    """)

    # Indexes for face_embedding_retention_jobs
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_retention_jobs_workspace
        ON face_embedding_retention_jobs(workspace_id)
        WHERE workspace_id IS NOT NULL;
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_retention_jobs_status
        ON face_embedding_retention_jobs(status, created_at DESC);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_retention_jobs_pending
        ON face_embedding_retention_jobs(created_at)
        WHERE status IN ('pending', 'running');
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_retention_jobs_type
        ON face_embedding_retention_jobs(job_type, status);
    """)

    # Trigger for updated_at
    op.execute("""
        DROP TRIGGER IF EXISTS trigger_retention_jobs_updated_at ON face_embedding_retention_jobs;
        CREATE TRIGGER trigger_retention_jobs_updated_at
        BEFORE UPDATE ON face_embedding_retention_jobs
        FOR EACH ROW
        EXECUTE FUNCTION update_biometric_settings_updated_at();
    """)

    # =========================================================================
    # 4. ADD RETENTION FIELDS TO WORKSPACE PRIVACY SETTINGS (T004)
    # =========================================================================

    op.execute("""
        ALTER TABLE workspace_privacy_settings
        ADD COLUMN IF NOT EXISTS face_embedding_retention_days INTEGER DEFAULT 2555
            CHECK (face_embedding_retention_days IS NULL OR
                   (face_embedding_retention_days >= 30 AND face_embedding_retention_days <= 3650));
    """)

    op.execute("""
        ALTER TABLE workspace_privacy_settings
        ADD COLUMN IF NOT EXISTS face_retention_policy_updated_at TIMESTAMPTZ;
    """)

    op.execute("""
        ALTER TABLE workspace_privacy_settings
        ADD COLUMN IF NOT EXISTS face_retention_policy_updated_by UUID
        REFERENCES users(user_id) ON DELETE SET NULL;
    """)

    # =========================================================================
    # 5. TABLE COMMENTS FOR DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE workspace_biometric_settings IS
        'GDPR Article 9 compliant biometric consent tracking for face detection processing per workspace';
    """)

    op.execute("""
        COMMENT ON COLUMN workspace_biometric_settings.face_detection_enabled IS
        'Master toggle for face detection - all operations blocked when FALSE';
    """)

    op.execute("""
        COMMENT ON COLUMN workspace_biometric_settings.consent_status IS
        'Current consent state: not_granted, granted, withdrawn, or pending_deletion';
    """)

    op.execute("""
        COMMENT ON TABLE face_rate_limit_config IS
        'Per-workspace rate limit configuration for face operations (SEC-001)';
    """)

    op.execute("""
        COMMENT ON COLUMN face_rate_limit_config.face_search_rpm IS
        'Maximum face similarity searches per minute (default: 20)';
    """)

    op.execute("""
        COMMENT ON COLUMN face_rate_limit_config.face_detection_daily_quota IS
        'Maximum face detections per day per workspace (default: 1000)';
    """)

    op.execute("""
        COMMENT ON TABLE face_embedding_retention_jobs IS
        'Tracks face embedding cleanup jobs for retention policy enforcement (COM-002)';
    """)

    op.execute("""
        COMMENT ON COLUMN face_embedding_retention_jobs.job_type IS
        'Type of cleanup: scheduled_cleanup, consent_withdrawal, manual_cleanup, gdpr_deletion';
    """)

    op.execute("""
        COMMENT ON COLUMN workspace_privacy_settings.face_embedding_retention_days IS
        'Number of days to retain face embeddings (default: 2555 = ~7 years, min: 30, max: 3650)';
    """)


def downgrade() -> None:
    """Drop biometric consent and face audit tables."""

    # Drop columns from workspace_privacy_settings
    op.execute("""
        ALTER TABLE workspace_privacy_settings
        DROP COLUMN IF EXISTS face_retention_policy_updated_by;
    """)

    op.execute("""
        ALTER TABLE workspace_privacy_settings
        DROP COLUMN IF EXISTS face_retention_policy_updated_at;
    """)

    op.execute("""
        ALTER TABLE workspace_privacy_settings
        DROP COLUMN IF EXISTS face_embedding_retention_days;
    """)

    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS trigger_retention_jobs_updated_at ON face_embedding_retention_jobs;")
    op.execute("DROP TRIGGER IF EXISTS trigger_face_rate_limit_updated_at ON face_rate_limit_config;")
    op.execute("DROP TRIGGER IF EXISTS trigger_biometric_settings_updated_at ON workspace_biometric_settings;")

    # Drop function (shared by all three tables)
    op.execute("DROP FUNCTION IF EXISTS update_biometric_settings_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_retention_jobs_type;")
    op.execute("DROP INDEX IF EXISTS idx_retention_jobs_pending;")
    op.execute("DROP INDEX IF EXISTS idx_retention_jobs_status;")
    op.execute("DROP INDEX IF EXISTS idx_retention_jobs_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_face_rate_limit_unlimited;")
    op.execute("DROP INDEX IF EXISTS idx_face_rate_limit_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_biometric_settings_consented_by;")
    op.execute("DROP INDEX IF EXISTS idx_biometric_settings_status;")
    op.execute("DROP INDEX IF EXISTS idx_biometric_settings_workspace;")

    # Drop tables
    op.execute("DROP TABLE IF EXISTS face_embedding_retention_jobs;")
    op.execute("DROP TABLE IF EXISTS face_rate_limit_config;")
    op.execute("DROP TABLE IF EXISTS workspace_biometric_settings;")
