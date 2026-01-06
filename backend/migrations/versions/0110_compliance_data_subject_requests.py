"""Data Subject Requests table for GDPR/CCPA/DPDP compliance.

Creates the data_subject_requests table to track and manage data subject rights:
- Access requests (GDPR Art. 15) - Right to access personal data
- Rectification requests (GDPR Art. 16) - Right to correct data
- Erasure requests (GDPR Art. 17) - Right to be forgotten
- Portability requests (GDPR Art. 20) - Right to data portability
- Restriction requests (GDPR Art. 18) - Right to restrict processing
- Objection requests (GDPR Art. 21) - Right to object to processing

The table supports:
- Multi-tenant workspace isolation
- Request lifecycle tracking with status workflow
- Audit trail of all status changes
- Export/deletion job tracking
- Legal hold integration (blocks deletion)
- SLA tracking for regulatory deadlines

Feature: Audit & Compliance System
Revision ID: 0110
Revises: 0109
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0110"
down_revision = "0109b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create data_subject_requests table with comprehensive tracking."""

    # =========================================================================
    # 1. Create data_subject_requests table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS data_subject_requests (
            -- Primary key
            request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Request identification
            request_number VARCHAR(50) NOT NULL,

            -- Data subject information
            subject_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            subject_email VARCHAR(255) NOT NULL,
            subject_name VARCHAR(255),
            subject_type VARCHAR(20) NOT NULL DEFAULT 'user',

            -- Request details
            request_type VARCHAR(30) NOT NULL,
            request_source VARCHAR(30) NOT NULL DEFAULT 'user_portal',
            description TEXT,

            -- Status tracking
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            status_reason TEXT,

            -- Priority and categorization
            priority VARCHAR(10) NOT NULL DEFAULT 'normal',

            -- Assignment
            assigned_to_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Regulatory deadline tracking (30 days for GDPR, 45 days for CCPA)
            submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deadline_at TIMESTAMPTZ NOT NULL,
            extended_deadline_at TIMESTAMPTZ,
            extension_reason TEXT,

            -- Processing timestamps
            acknowledged_at TIMESTAMPTZ,
            processing_started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,

            -- Identity verification
            verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
            verification_method VARCHAR(30),
            verified_at TIMESTAMPTZ,
            verified_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Export/deletion job tracking
            export_job_id UUID,
            export_storage_key VARCHAR(500),
            export_expires_at TIMESTAMPTZ,
            export_download_count INTEGER NOT NULL DEFAULT 0,

            -- Legal hold blocking
            blocked_by_legal_hold_id UUID,
            blocked_at TIMESTAMPTZ,
            blocked_reason TEXT,

            -- Scope specification (which data to include)
            scope JSONB NOT NULL DEFAULT '{}',

            -- Processing notes and audit trail
            internal_notes TEXT,
            status_history JSONB NOT NULL DEFAULT '[]',

            -- Metadata for additional context
            metadata JSONB NOT NULL DEFAULT '{}',

            -- IP and request context
            requester_ip_address VARCHAR(45),
            requester_user_agent TEXT,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 2. Add check constraint for request_type
    # =========================================================================
    op.execute(
        """
        ALTER TABLE data_subject_requests
        ADD CONSTRAINT check_dsr_request_type
        CHECK (request_type IN (
            'access',           -- Right to access (GDPR Art. 15)
            'rectification',    -- Right to rectification (GDPR Art. 16)
            'erasure',          -- Right to erasure/be forgotten (GDPR Art. 17)
            'portability',      -- Right to data portability (GDPR Art. 20)
            'restriction',      -- Right to restrict processing (GDPR Art. 18)
            'objection',        -- Right to object (GDPR Art. 21)
            'opt_out_sale',     -- CCPA opt-out of sale
            'disclosure'        -- CCPA right to know
        ));
        """
    )

    # =========================================================================
    # 3. Add check constraint for status
    # =========================================================================
    op.execute(
        """
        ALTER TABLE data_subject_requests
        ADD CONSTRAINT check_dsr_status
        CHECK (status IN (
            'pending',              -- Initial state, awaiting review
            'identity_verification',-- Verifying requester identity
            'acknowledged',         -- Request acknowledged, in queue
            'in_progress',          -- Actively being processed
            'awaiting_approval',    -- Needs manager/legal approval
            'blocked',              -- Blocked by legal hold
            'completed',            -- Successfully completed
            'partially_completed',  -- Partially fulfilled (some data restricted)
            'rejected',             -- Rejected (invalid request, identity not verified)
            'cancelled',            -- Cancelled by requester
            'expired'               -- Deadline passed without completion
        ));
        """
    )

    # =========================================================================
    # 4. Add check constraint for request_source
    # =========================================================================
    op.execute(
        """
        ALTER TABLE data_subject_requests
        ADD CONSTRAINT check_dsr_source
        CHECK (request_source IN (
            'user_portal',      -- Self-service user request
            'email',            -- Email request
            'api',              -- API-initiated request
            'admin',            -- Admin-initiated on behalf of user
            'legal',            -- Legal/regulatory initiated
            'automated'         -- System automated (e.g., account deletion)
        ));
        """
    )

    # =========================================================================
    # 5. Add check constraint for subject_type
    # =========================================================================
    op.execute(
        """
        ALTER TABLE data_subject_requests
        ADD CONSTRAINT check_dsr_subject_type
        CHECK (subject_type IN (
            'user',             -- Platform user
            'client',           -- Client/customer
            'visitor',          -- Anonymous visitor
            'guest',            -- Event guest
            'employee',         -- Internal employee
            'other'             -- Other data subject
        ));
        """
    )

    # =========================================================================
    # 6. Add check constraint for priority
    # =========================================================================
    op.execute(
        """
        ALTER TABLE data_subject_requests
        ADD CONSTRAINT check_dsr_priority
        CHECK (priority IN (
            'low',
            'normal',
            'high',
            'urgent'
        ));
        """
    )

    # =========================================================================
    # 7. Add check constraint for verification_status
    # =========================================================================
    op.execute(
        """
        ALTER TABLE data_subject_requests
        ADD CONSTRAINT check_dsr_verification_status
        CHECK (verification_status IN (
            'pending',          -- Not yet verified
            'in_progress',      -- Verification in progress
            'verified',         -- Identity confirmed
            'failed',           -- Verification failed
            'waived'            -- Verification waived (e.g., logged-in user)
        ));
        """
    )

    # =========================================================================
    # 8. Create unique constraint for request_number within workspace
    # =========================================================================
    op.execute(
        """
        ALTER TABLE data_subject_requests
        ADD CONSTRAINT uq_dsr_workspace_request_number
        UNIQUE (workspace_id, request_number);
        """
    )

    # =========================================================================
    # 9. Create indexes for common query patterns
    # =========================================================================

    # Workspace + status for dashboard views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_workspace_status
        ON data_subject_requests(workspace_id, status);
        """
    )

    # Workspace + created_at for chronological listing
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_workspace_created
        ON data_subject_requests(workspace_id, created_at DESC);
        """
    )

    # Workspace + deadline for SLA tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_workspace_deadline
        ON data_subject_requests(workspace_id, deadline_at)
        WHERE status NOT IN ('completed', 'rejected', 'cancelled', 'expired');
        """
    )

    # Subject email for finding related requests
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_subject_email
        ON data_subject_requests(subject_email);
        """
    )

    # Subject user_id for user-specific lookups
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_subject_user
        ON data_subject_requests(subject_user_id)
        WHERE subject_user_id IS NOT NULL;
        """
    )

    # Assigned user for workload tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_assigned_user
        ON data_subject_requests(assigned_to_user_id)
        WHERE assigned_to_user_id IS NOT NULL;
        """
    )

    # Request type for analytics
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_workspace_type
        ON data_subject_requests(workspace_id, request_type);
        """
    )

    # Pending/in-progress requests for queue processing
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_pending_queue
        ON data_subject_requests(workspace_id, priority DESC, submitted_at)
        WHERE status IN ('pending', 'identity_verification', 'acknowledged', 'in_progress');
        """
    )

    # Blocked requests for legal hold reports
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_blocked
        ON data_subject_requests(blocked_by_legal_hold_id)
        WHERE blocked_by_legal_hold_id IS NOT NULL;
        """
    )

    # Export job tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dsr_export_job
        ON data_subject_requests(export_job_id)
        WHERE export_job_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 10. Add table and column comments for documentation
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE data_subject_requests IS
        'Tracks data subject rights requests for GDPR/CCPA/DPDP compliance. Supports access, rectification, erasure, portability, and objection requests with full audit trail.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN data_subject_requests.request_number IS
        'Human-readable request identifier (e.g., DSR-2026-00001). Unique within workspace.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN data_subject_requests.deadline_at IS
        'Regulatory deadline for request completion. Default 30 days for GDPR, 45 days for CCPA.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN data_subject_requests.extended_deadline_at IS
        'Extended deadline if granted (GDPR allows up to 60 additional days with justification).';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN data_subject_requests.scope IS
        'JSON specification of which data categories to include/exclude: {"categories": ["profile", "files", "logs"], "date_range": {...}}';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN data_subject_requests.status_history IS
        'JSON array of status changes: [{"status": "pending", "changed_at": "...", "changed_by": "...", "reason": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN data_subject_requests.blocked_by_legal_hold_id IS
        'Reference to legal_holds table if this request is blocked. Prevents erasure until hold is released.';
        """
    )

    # =========================================================================
    # 11. Create trigger for updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_dsr_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_dsr_updated_at ON data_subject_requests;
        CREATE TRIGGER trigger_dsr_updated_at
            BEFORE UPDATE ON data_subject_requests
            FOR EACH ROW
            EXECUTE FUNCTION update_dsr_updated_at();
        """
    )


def downgrade() -> None:
    """Drop data_subject_requests table and related objects."""

    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_dsr_updated_at ON data_subject_requests;")
    op.execute("DROP FUNCTION IF EXISTS update_dsr_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_dsr_export_job;")
    op.execute("DROP INDEX IF EXISTS idx_dsr_blocked;")
    op.execute("DROP INDEX IF EXISTS idx_dsr_pending_queue;")
    op.execute("DROP INDEX IF EXISTS idx_dsr_workspace_type;")
    op.execute("DROP INDEX IF EXISTS idx_dsr_assigned_user;")
    op.execute("DROP INDEX IF EXISTS idx_dsr_subject_user;")
    op.execute("DROP INDEX IF EXISTS idx_dsr_subject_email;")
    op.execute("DROP INDEX IF EXISTS idx_dsr_workspace_deadline;")
    op.execute("DROP INDEX IF EXISTS idx_dsr_workspace_created;")
    op.execute("DROP INDEX IF EXISTS idx_dsr_workspace_status;")

    # Drop table (cascades constraints)
    op.execute("DROP TABLE IF EXISTS data_subject_requests CASCADE;")
