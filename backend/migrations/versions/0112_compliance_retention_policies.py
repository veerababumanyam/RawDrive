"""Retention Policies table for data lifecycle management.

Creates the retention_policies table to manage data retention and disposal:
- Defines how long different data types are retained
- Supports regulatory requirements (GDPR minimum retention, industry-specific)
- Enables automated archival and deletion of expired data
- Tracks policy application and enforcement history

The table supports:
- Multi-tenant workspace isolation
- Resource type-specific retention rules
- Tiered retention (active -> archive -> delete)
- Regulatory compliance mapping
- Audit trail of policy changes

Feature: Audit & Compliance System
Revision ID: 0112
Revises: 0111
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0112"
down_revision = "0111"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create retention_policies table with comprehensive policy management."""

    # =========================================================================
    # 1. Create retention_policies table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS retention_policies (
            -- Primary key
            policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Policy identification
            policy_name VARCHAR(100) NOT NULL,
            policy_code VARCHAR(50) NOT NULL,
            description TEXT,

            -- Policy classification
            policy_type VARCHAR(30) NOT NULL DEFAULT 'custom',

            -- Status
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            status_reason TEXT,

            -- Priority (for conflict resolution when multiple policies apply)
            priority INTEGER NOT NULL DEFAULT 100,

            -- Resource targeting
            resource_types JSONB NOT NULL DEFAULT '[]',
            resource_filters JSONB NOT NULL DEFAULT '{}',

            -- Retention periods (in days, 0 = indefinite)
            retention_period_days INTEGER NOT NULL,
            archive_after_days INTEGER,
            delete_after_days INTEGER,

            -- Grace period before permanent deletion
            grace_period_days INTEGER NOT NULL DEFAULT 30,

            -- Actions
            action_on_expiry VARCHAR(30) NOT NULL DEFAULT 'delete',
            archive_storage_class VARCHAR(30),
            notification_days_before INTEGER[] NOT NULL DEFAULT ARRAY[30, 7, 1],

            -- Regulatory compliance
            regulatory_basis VARCHAR(50),
            regulatory_reference TEXT,
            compliance_frameworks JSONB NOT NULL DEFAULT '[]',

            -- Exceptions and overrides
            allow_user_extension BOOLEAN NOT NULL DEFAULT false,
            max_extension_days INTEGER,
            allow_legal_hold_override BOOLEAN NOT NULL DEFAULT true,

            -- Scope limitations
            applies_to_existing BOOLEAN NOT NULL DEFAULT true,
            applies_to_new BOOLEAN NOT NULL DEFAULT true,
            effective_from TIMESTAMPTZ,
            effective_until TIMESTAMPTZ,

            -- Policy owner
            created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
            approved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,

            -- Version tracking (for policy updates)
            version INTEGER NOT NULL DEFAULT 1,
            previous_version_id UUID REFERENCES retention_policies(policy_id) ON DELETE SET NULL,
            is_active_version BOOLEAN NOT NULL DEFAULT true,

            -- Execution tracking
            last_executed_at TIMESTAMPTZ,
            next_execution_at TIMESTAMPTZ,
            execution_frequency VARCHAR(20) NOT NULL DEFAULT 'daily',

            -- Statistics (updated after each execution)
            total_resources_affected INTEGER NOT NULL DEFAULT 0,
            total_resources_archived INTEGER NOT NULL DEFAULT 0,
            total_resources_deleted INTEGER NOT NULL DEFAULT 0,
            total_storage_reclaimed_bytes BIGINT NOT NULL DEFAULT 0,

            -- Internal notes and audit trail
            internal_notes TEXT,
            change_history JSONB NOT NULL DEFAULT '[]',

            -- Metadata for additional context
            metadata JSONB NOT NULL DEFAULT '{}',

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 2. Add check constraint for policy_type
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_policy_type
        CHECK (policy_type IN (
            'system',           -- System-wide default policy
            'regulatory',       -- Required by regulation
            'industry',         -- Industry standard
            'organizational',   -- Organization-wide policy
            'workspace',        -- Workspace-specific policy
            'custom'            -- Custom user-defined policy
        ));
        """
    )

    # =========================================================================
    # 3. Add check constraint for status
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_status
        CHECK (status IN (
            'draft',            -- Policy being prepared
            'pending_approval', -- Awaiting approval
            'active',           -- Currently enforced
            'paused',           -- Temporarily suspended
            'retired',          -- No longer in use
            'superseded'        -- Replaced by newer version
        ));
        """
    )

    # =========================================================================
    # 4. Add check constraint for action_on_expiry
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_action_on_expiry
        CHECK (action_on_expiry IN (
            'delete',           -- Permanently delete
            'archive',          -- Move to cold storage
            'anonymize',        -- Remove PII but keep aggregate data
            'review',           -- Flag for manual review
            'notify_only'       -- Only notify, no automated action
        ));
        """
    )

    # =========================================================================
    # 5. Add check constraint for archive_storage_class
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_archive_storage_class
        CHECK (archive_storage_class IS NULL OR archive_storage_class IN (
            'standard',         -- Standard storage
            'infrequent',       -- Infrequent access tier
            'cold',             -- Cold storage
            'glacier',          -- Archive/glacier tier
            'deep_archive'      -- Deep archive tier
        ));
        """
    )

    # =========================================================================
    # 6. Add check constraint for execution_frequency
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_execution_frequency
        CHECK (execution_frequency IN (
            'hourly',
            'daily',
            'weekly',
            'monthly',
            'quarterly',
            'manual'
        ));
        """
    )

    # =========================================================================
    # 7. Add check constraint for retention period validation
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_retention_period
        CHECK (retention_period_days >= 0);
        """
    )

    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_archive_after
        CHECK (archive_after_days IS NULL OR archive_after_days >= 0);
        """
    )

    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_delete_after
        CHECK (delete_after_days IS NULL OR delete_after_days >= 0);
        """
    )

    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_grace_period
        CHECK (grace_period_days >= 0);
        """
    )

    # =========================================================================
    # 8. Add check constraint for priority validation
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT check_rp_priority
        CHECK (priority >= 0 AND priority <= 1000);
        """
    )

    # =========================================================================
    # 9. Create unique constraint for policy_code within workspace
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policies
        ADD CONSTRAINT uq_rp_workspace_policy_code
        UNIQUE (workspace_id, policy_code);
        """
    )

    # =========================================================================
    # 10. Create indexes for common query patterns
    # =========================================================================

    # Workspace + status for dashboard views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_workspace_status
        ON retention_policies(workspace_id, status);
        """
    )

    # Workspace + created_at for chronological listing
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_workspace_created
        ON retention_policies(workspace_id, created_at DESC);
        """
    )

    # Active policies for enforcement
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_active
        ON retention_policies(workspace_id, priority DESC)
        WHERE status = 'active' AND is_active_version = true;
        """
    )

    # Policy type for categorized views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_workspace_type
        ON retention_policies(workspace_id, policy_type);
        """
    )

    # Creator for accountability tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_created_by
        ON retention_policies(created_by_user_id);
        """
    )

    # Next execution for scheduler
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_next_execution
        ON retention_policies(next_execution_at)
        WHERE status = 'active' AND next_execution_at IS NOT NULL;
        """
    )

    # Resource types GIN index for type lookup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_resource_types
        ON retention_policies USING GIN (resource_types);
        """
    )

    # Compliance frameworks GIN index
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_compliance_frameworks
        ON retention_policies USING GIN (compliance_frameworks);
        """
    )

    # Regulatory basis for compliance reporting
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_regulatory_basis
        ON retention_policies(regulatory_basis)
        WHERE regulatory_basis IS NOT NULL;
        """
    )

    # Version tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rp_previous_version
        ON retention_policies(previous_version_id)
        WHERE previous_version_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 11. Create retention_policy_executions table for tracking policy runs
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS retention_policy_executions (
            -- Primary key
            execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- References
            policy_id UUID NOT NULL REFERENCES retention_policies(policy_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Execution details
            execution_type VARCHAR(20) NOT NULL DEFAULT 'scheduled',
            status VARCHAR(20) NOT NULL DEFAULT 'pending',

            -- Timing
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            duration_ms INTEGER,

            -- Initiated by (null for scheduled)
            initiated_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Results
            resources_scanned INTEGER NOT NULL DEFAULT 0,
            resources_matched INTEGER NOT NULL DEFAULT 0,
            resources_archived INTEGER NOT NULL DEFAULT 0,
            resources_deleted INTEGER NOT NULL DEFAULT 0,
            resources_anonymized INTEGER NOT NULL DEFAULT 0,
            resources_flagged INTEGER NOT NULL DEFAULT 0,
            resources_skipped INTEGER NOT NULL DEFAULT 0,
            resources_failed INTEGER NOT NULL DEFAULT 0,

            -- Storage metrics
            storage_scanned_bytes BIGINT NOT NULL DEFAULT 0,
            storage_reclaimed_bytes BIGINT NOT NULL DEFAULT 0,

            -- Errors and warnings
            error_count INTEGER NOT NULL DEFAULT 0,
            warning_count INTEGER NOT NULL DEFAULT 0,
            errors JSONB NOT NULL DEFAULT '[]',
            warnings JSONB NOT NULL DEFAULT '[]',

            -- Affected resources log (for audit)
            affected_resources JSONB NOT NULL DEFAULT '[]',

            -- Metadata
            metadata JSONB NOT NULL DEFAULT '{}',

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 12. Add check constraints for retention_policy_executions
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policy_executions
        ADD CONSTRAINT check_rpe_execution_type
        CHECK (execution_type IN (
            'scheduled',        -- Automated scheduled run
            'manual',           -- Manually triggered
            'preview',          -- Dry run/preview
            'remediation'       -- Fix/cleanup run
        ));
        """
    )

    op.execute(
        """
        ALTER TABLE retention_policy_executions
        ADD CONSTRAINT check_rpe_status
        CHECK (status IN (
            'pending',          -- Waiting to start
            'running',          -- Currently executing
            'completed',        -- Finished successfully
            'completed_with_errors', -- Finished with some errors
            'failed',           -- Failed to complete
            'cancelled'         -- Cancelled by user
        ));
        """
    )

    # =========================================================================
    # 13. Create indexes for retention_policy_executions
    # =========================================================================

    # Policy + execution listing
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpe_policy
        ON retention_policy_executions(policy_id, created_at DESC);
        """
    )

    # Workspace + created for history
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpe_workspace_created
        ON retention_policy_executions(workspace_id, created_at DESC);
        """
    )

    # Status for monitoring running executions
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpe_status
        ON retention_policy_executions(status)
        WHERE status IN ('pending', 'running');
        """
    )

    # Initiated by for user tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpe_initiated_by
        ON retention_policy_executions(initiated_by_user_id)
        WHERE initiated_by_user_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 14. Create retention_policy_exemptions table for resource exemptions
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS retention_policy_exemptions (
            -- Primary key
            exemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- References
            policy_id UUID NOT NULL REFERENCES retention_policies(policy_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Resource identification
            resource_type VARCHAR(50) NOT NULL,
            resource_id UUID NOT NULL,

            -- Exemption details
            exemption_reason VARCHAR(50) NOT NULL,
            reason_details TEXT,

            -- Validity
            exemption_type VARCHAR(20) NOT NULL DEFAULT 'permanent',
            expires_at TIMESTAMPTZ,

            -- User context
            created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
            approved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,

            -- Status
            status VARCHAR(20) NOT NULL DEFAULT 'active',

            -- Metadata
            metadata JSONB NOT NULL DEFAULT '{}',

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Unique constraint: one exemption per resource per policy
            CONSTRAINT uq_rpe_policy_resource UNIQUE (policy_id, resource_type, resource_id)
        );
        """
    )

    # =========================================================================
    # 15. Add check constraints for retention_policy_exemptions
    # =========================================================================
    op.execute(
        """
        ALTER TABLE retention_policy_exemptions
        ADD CONSTRAINT check_rpex_exemption_reason
        CHECK (exemption_reason IN (
            'legal_hold',       -- Under legal hold
            'litigation',       -- Involved in litigation
            'regulatory',       -- Regulatory requirement
            'business_critical', -- Critical business data
            'user_request',     -- User requested extension
            'admin_override',   -- Admin override
            'system',           -- System-protected resource
            'other'             -- Other reason
        ));
        """
    )

    op.execute(
        """
        ALTER TABLE retention_policy_exemptions
        ADD CONSTRAINT check_rpex_exemption_type
        CHECK (exemption_type IN (
            'permanent',        -- Never expires
            'temporary',        -- Expires at specified time
            'until_review'      -- Until manual review
        ));
        """
    )

    op.execute(
        """
        ALTER TABLE retention_policy_exemptions
        ADD CONSTRAINT check_rpex_status
        CHECK (status IN (
            'pending',          -- Awaiting approval
            'active',           -- Currently enforced
            'expired',          -- Exemption expired
            'revoked',          -- Manually revoked
            'superseded'        -- Replaced by another exemption
        ));
        """
    )

    # =========================================================================
    # 16. Create indexes for retention_policy_exemptions
    # =========================================================================

    # Policy + resource lookup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpex_policy
        ON retention_policy_exemptions(policy_id);
        """
    )

    # Resource lookup (for checking if resource is exempt)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpex_resource
        ON retention_policy_exemptions(resource_type, resource_id);
        """
    )

    # Workspace + resource for tenant-scoped queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpex_workspace_resource
        ON retention_policy_exemptions(workspace_id, resource_type, resource_id);
        """
    )

    # Active exemptions
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpex_active
        ON retention_policy_exemptions(workspace_id, status)
        WHERE status = 'active';
        """
    )

    # Expiring exemptions for cleanup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpex_expiring
        ON retention_policy_exemptions(expires_at)
        WHERE status = 'active' AND expires_at IS NOT NULL;
        """
    )

    # Created by for accountability
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rpex_created_by
        ON retention_policy_exemptions(created_by_user_id);
        """
    )

    # =========================================================================
    # 17. Add table and column comments for documentation
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE retention_policies IS
        'Defines data retention rules for compliance and storage management. Supports regulatory requirements, automated archival, and deletion with full audit trail.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.policy_code IS
        'Machine-readable policy identifier (e.g., GDPR-MIN-7Y). Unique within workspace.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.retention_period_days IS
        'Minimum number of days to retain data before any action. 0 means indefinite retention.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.archive_after_days IS
        'Days after creation to move data to archive storage. NULL means no archival.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.delete_after_days IS
        'Days after creation to permanently delete data. NULL means retain indefinitely.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.grace_period_days IS
        'Days between marking for deletion and actual deletion. Allows for recovery.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.resource_types IS
        'JSON array of resource types this policy applies to: ["asset", "gallery", "audit_log"]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.resource_filters IS
        'JSON object with additional filters: {"owner_type": "user", "size_gt": 1000000, "tags": ["temp"]}';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.compliance_frameworks IS
        'JSON array of compliance frameworks: ["GDPR", "CCPA", "SOC2", "HIPAA"]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.notification_days_before IS
        'Array of days before expiry to send notifications: {30, 7, 1} means notify at 30, 7, and 1 day before.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policies.change_history IS
        'JSON array of policy changes: [{"version": 1, "changed_at": "...", "changed_by": "...", "changes": {...}}]';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE retention_policy_executions IS
        'Tracks each execution/run of a retention policy. Records what was scanned, matched, and acted upon.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN retention_policy_executions.affected_resources IS
        'JSON array of resources affected: [{"resource_type": "...", "resource_id": "...", "action": "deleted"}]';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE retention_policy_exemptions IS
        'Tracks resources exempted from specific retention policies. Supports legal holds, regulatory requirements, and business-critical overrides.';
        """
    )

    # =========================================================================
    # 18. Create trigger for updated_at timestamp on retention_policies
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_rp_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_rp_updated_at ON retention_policies;
        CREATE TRIGGER trigger_rp_updated_at
            BEFORE UPDATE ON retention_policies
            FOR EACH ROW
            EXECUTE FUNCTION update_rp_updated_at();
        """
    )

    # =========================================================================
    # 19. Create trigger for updated_at timestamp on retention_policy_exemptions
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_rpex_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_rpex_updated_at ON retention_policy_exemptions;
        CREATE TRIGGER trigger_rpex_updated_at
            BEFORE UPDATE ON retention_policy_exemptions
            FOR EACH ROW
            EXECUTE FUNCTION update_rpex_updated_at();
        """
    )


def downgrade() -> None:
    """Drop retention_policies table and related objects."""

    # Drop triggers first
    op.execute("DROP TRIGGER IF EXISTS trigger_rpex_updated_at ON retention_policy_exemptions;")
    op.execute("DROP FUNCTION IF EXISTS update_rpex_updated_at();")
    op.execute("DROP TRIGGER IF EXISTS trigger_rp_updated_at ON retention_policies;")
    op.execute("DROP FUNCTION IF EXISTS update_rp_updated_at();")

    # Drop retention_policy_exemptions indexes
    op.execute("DROP INDEX IF EXISTS idx_rpex_created_by;")
    op.execute("DROP INDEX IF EXISTS idx_rpex_expiring;")
    op.execute("DROP INDEX IF EXISTS idx_rpex_active;")
    op.execute("DROP INDEX IF EXISTS idx_rpex_workspace_resource;")
    op.execute("DROP INDEX IF EXISTS idx_rpex_resource;")
    op.execute("DROP INDEX IF EXISTS idx_rpex_policy;")

    # Drop retention_policy_exemptions table
    op.execute("DROP TABLE IF EXISTS retention_policy_exemptions CASCADE;")

    # Drop retention_policy_executions indexes
    op.execute("DROP INDEX IF EXISTS idx_rpe_initiated_by;")
    op.execute("DROP INDEX IF EXISTS idx_rpe_status;")
    op.execute("DROP INDEX IF EXISTS idx_rpe_workspace_created;")
    op.execute("DROP INDEX IF EXISTS idx_rpe_policy;")

    # Drop retention_policy_executions table
    op.execute("DROP TABLE IF EXISTS retention_policy_executions CASCADE;")

    # Drop retention_policies indexes
    op.execute("DROP INDEX IF EXISTS idx_rp_previous_version;")
    op.execute("DROP INDEX IF EXISTS idx_rp_regulatory_basis;")
    op.execute("DROP INDEX IF EXISTS idx_rp_compliance_frameworks;")
    op.execute("DROP INDEX IF EXISTS idx_rp_resource_types;")
    op.execute("DROP INDEX IF EXISTS idx_rp_next_execution;")
    op.execute("DROP INDEX IF EXISTS idx_rp_created_by;")
    op.execute("DROP INDEX IF EXISTS idx_rp_workspace_type;")
    op.execute("DROP INDEX IF EXISTS idx_rp_active;")
    op.execute("DROP INDEX IF EXISTS idx_rp_workspace_created;")
    op.execute("DROP INDEX IF EXISTS idx_rp_workspace_status;")

    # Drop retention_policies table (cascades constraints)
    op.execute("DROP TABLE IF EXISTS retention_policies CASCADE;")
