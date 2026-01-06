"""Legal Holds table for compliance and litigation preservation.

Creates the legal_holds table to manage preservation of data:
- Prevents deletion of resources under legal or regulatory hold
- Supports litigation holds, regulatory investigations, and internal audits
- Tracks hold scope, affected resources, and custodians
- Integrates with data subject requests to block erasure when holds apply

The table supports:
- Multi-tenant workspace isolation
- Hierarchical hold scope (workspace, user, resource-level)
- Multiple custodian assignments
- Audit trail of hold lifecycle
- Integration with data subject request blocking

Feature: Audit & Compliance System
Revision ID: 0111
Revises: 0110
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0111"
down_revision = "0110"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create legal_holds table with comprehensive tracking."""

    # =========================================================================
    # 1. Create legal_holds table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS legal_holds (
            -- Primary key
            hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Hold identification
            hold_number VARCHAR(50) NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,

            -- Hold classification
            hold_type VARCHAR(30) NOT NULL DEFAULT 'litigation',
            matter_id VARCHAR(100),
            matter_name VARCHAR(255),

            -- Status tracking
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            status_reason TEXT,

            -- Priority/severity
            priority VARCHAR(10) NOT NULL DEFAULT 'normal',

            -- Legal/external references
            external_reference VARCHAR(255),
            legal_counsel VARCHAR(255),
            law_firm VARCHAR(255),

            -- Hold scope definition
            scope_type VARCHAR(30) NOT NULL DEFAULT 'selective',

            -- Scope filters (which resources are held)
            scope_users JSONB NOT NULL DEFAULT '[]',
            scope_resources JSONB NOT NULL DEFAULT '[]',
            scope_resource_types JSONB NOT NULL DEFAULT '[]',
            scope_date_range JSONB,
            scope_keywords JSONB NOT NULL DEFAULT '[]',

            -- Custodian management
            custodians JSONB NOT NULL DEFAULT '[]',
            custodian_acknowledgments JSONB NOT NULL DEFAULT '[]',

            -- Hold dates
            issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            effective_until TIMESTAMPTZ,
            released_at TIMESTAMPTZ,

            -- Issuer information
            issued_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
            released_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            release_reason TEXT,

            -- Notifications
            notification_sent_at TIMESTAMPTZ,
            reminder_frequency_days INTEGER,
            last_reminder_sent_at TIMESTAMPTZ,
            next_reminder_at TIMESTAMPTZ,

            -- Statistics (updated periodically)
            affected_users_count INTEGER NOT NULL DEFAULT 0,
            affected_resources_count INTEGER NOT NULL DEFAULT 0,
            blocked_deletions_count INTEGER NOT NULL DEFAULT 0,
            blocked_requests_count INTEGER NOT NULL DEFAULT 0,

            -- Internal notes and audit trail
            internal_notes TEXT,
            status_history JSONB NOT NULL DEFAULT '[]',

            -- Metadata for additional context
            metadata JSONB NOT NULL DEFAULT '{}',

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 2. Add check constraint for hold_type
    # =========================================================================
    op.execute(
        """
        ALTER TABLE legal_holds
        ADD CONSTRAINT check_lh_hold_type
        CHECK (hold_type IN (
            'litigation',       -- Legal litigation/lawsuit
            'regulatory',       -- Regulatory investigation
            'internal_audit',   -- Internal audit/investigation
            'compliance',       -- Compliance requirement
            'preservation',     -- General preservation request
            'subpoena',         -- Subpoena/court order
            'government',       -- Government inquiry
            'other'             -- Other hold type
        ));
        """
    )

    # =========================================================================
    # 3. Add check constraint for status
    # =========================================================================
    op.execute(
        """
        ALTER TABLE legal_holds
        ADD CONSTRAINT check_lh_status
        CHECK (status IN (
            'draft',            -- Hold being prepared, not yet active
            'pending_approval', -- Awaiting legal/management approval
            'active',           -- Currently enforced
            'suspended',        -- Temporarily suspended
            'released',         -- Hold has been released
            'expired',          -- Hold expired (effective_until passed)
            'cancelled'         -- Hold cancelled before activation
        ));
        """
    )

    # =========================================================================
    # 4. Add check constraint for priority
    # =========================================================================
    op.execute(
        """
        ALTER TABLE legal_holds
        ADD CONSTRAINT check_lh_priority
        CHECK (priority IN (
            'low',
            'normal',
            'high',
            'critical'
        ));
        """
    )

    # =========================================================================
    # 5. Add check constraint for scope_type
    # =========================================================================
    op.execute(
        """
        ALTER TABLE legal_holds
        ADD CONSTRAINT check_lh_scope_type
        CHECK (scope_type IN (
            'workspace_wide',   -- All resources in workspace
            'user_based',       -- All resources for specific users
            'selective',        -- Specific resources/types only
            'keyword_based',    -- Resources matching keywords
            'date_range',       -- Resources within date range
            'combined'          -- Multiple criteria combined
        ));
        """
    )

    # =========================================================================
    # 6. Create unique constraint for hold_number within workspace
    # =========================================================================
    op.execute(
        """
        ALTER TABLE legal_holds
        ADD CONSTRAINT uq_lh_workspace_hold_number
        UNIQUE (workspace_id, hold_number);
        """
    )

    # =========================================================================
    # 7. Create indexes for common query patterns
    # =========================================================================

    # Workspace + status for dashboard views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_workspace_status
        ON legal_holds(workspace_id, status);
        """
    )

    # Workspace + created_at for chronological listing
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_workspace_created
        ON legal_holds(workspace_id, created_at DESC);
        """
    )

    # Active holds for enforcement checks
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_active
        ON legal_holds(workspace_id, effective_from, effective_until)
        WHERE status = 'active';
        """
    )

    # Hold type for categorized views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_workspace_type
        ON legal_holds(workspace_id, hold_type);
        """
    )

    # Issuer for accountability tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_issued_by
        ON legal_holds(issued_by_user_id);
        """
    )

    # Matter ID for case management
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_matter
        ON legal_holds(matter_id)
        WHERE matter_id IS NOT NULL;
        """
    )

    # Scope users GIN index for user lookup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_scope_users
        ON legal_holds USING GIN (scope_users);
        """
    )

    # Scope resources GIN index for resource lookup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_scope_resources
        ON legal_holds USING GIN (scope_resources);
        """
    )

    # Scope resource types GIN index
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_scope_resource_types
        ON legal_holds USING GIN (scope_resource_types);
        """
    )

    # Reminder scheduling
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_next_reminder
        ON legal_holds(next_reminder_at)
        WHERE status = 'active' AND next_reminder_at IS NOT NULL;
        """
    )

    # Expiring holds for cleanup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lh_expiring
        ON legal_holds(effective_until)
        WHERE status = 'active' AND effective_until IS NOT NULL;
        """
    )

    # =========================================================================
    # 8. Add foreign key from data_subject_requests to legal_holds
    # =========================================================================
    op.execute(
        """
        ALTER TABLE data_subject_requests
        ADD CONSTRAINT fk_dsr_legal_hold
        FOREIGN KEY (blocked_by_legal_hold_id)
        REFERENCES legal_holds(hold_id) ON DELETE SET NULL;
        """
    )

    # =========================================================================
    # 9. Create legal_hold_resources junction table for tracking held resources
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS legal_hold_resources (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- References
            hold_id UUID NOT NULL REFERENCES legal_holds(hold_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Resource identification
            resource_type VARCHAR(50) NOT NULL,
            resource_id UUID NOT NULL,

            -- User associated with the resource (if applicable)
            user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- How the resource was captured
            capture_method VARCHAR(30) NOT NULL DEFAULT 'scope_match',

            -- Tracking
            added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            added_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Deletion attempts while held
            deletion_attempts INTEGER NOT NULL DEFAULT 0,
            last_deletion_attempt_at TIMESTAMPTZ,

            -- Metadata
            metadata JSONB NOT NULL DEFAULT '{}',

            -- Unique constraint: each resource can only be in a hold once
            CONSTRAINT uq_lhr_hold_resource UNIQUE (hold_id, resource_type, resource_id)
        );
        """
    )

    # =========================================================================
    # 10. Add check constraint for capture_method
    # =========================================================================
    op.execute(
        """
        ALTER TABLE legal_hold_resources
        ADD CONSTRAINT check_lhr_capture_method
        CHECK (capture_method IN (
            'scope_match',      -- Automatically matched by scope criteria
            'manual_add',       -- Manually added by admin
            'custodian',        -- Captured as custodian resource
            'keyword_match',    -- Matched by keyword search
            'related'           -- Related/linked resource
        ));
        """
    )

    # =========================================================================
    # 11. Create indexes for legal_hold_resources
    # =========================================================================

    # Hold + resource lookup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lhr_hold
        ON legal_hold_resources(hold_id);
        """
    )

    # Resource lookup (for checking if resource is held)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lhr_resource
        ON legal_hold_resources(resource_type, resource_id);
        """
    )

    # Workspace + resource for tenant-scoped queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lhr_workspace_resource
        ON legal_hold_resources(workspace_id, resource_type, resource_id);
        """
    )

    # User lookup for custodian resources
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lhr_user
        ON legal_hold_resources(user_id)
        WHERE user_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 12. Add table and column comments for documentation
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE legal_holds IS
        'Manages legal and regulatory holds to prevent deletion of data. Supports litigation, regulatory, and internal audit holds with full scope definition and tracking.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_holds.hold_number IS
        'Human-readable hold identifier (e.g., LH-2026-00001). Unique within workspace.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_holds.matter_id IS
        'External legal matter/case identifier for integration with legal case management systems.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_holds.scope_type IS
        'Defines how the hold scope is determined: workspace_wide affects all, selective targets specific resources.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_holds.scope_users IS
        'JSON array of user IDs whose resources are covered by this hold: ["uuid1", "uuid2"]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_holds.scope_resources IS
        'JSON array of specific resource IDs under hold: [{"type": "asset", "id": "uuid"}, ...]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_holds.scope_resource_types IS
        'JSON array of resource types covered: ["asset", "gallery", "user_data"]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_holds.custodians IS
        'JSON array of custodian info: [{"user_id": "...", "name": "...", "email": "...", "notified_at": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_holds.custodian_acknowledgments IS
        'JSON array of acknowledgment records: [{"user_id": "...", "acknowledged_at": "...", "method": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_holds.status_history IS
        'JSON array of status changes: [{"status": "active", "changed_at": "...", "changed_by": "...", "reason": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE legal_hold_resources IS
        'Junction table tracking individual resources covered by legal holds. Used for enforcement and reporting.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN legal_hold_resources.deletion_attempts IS
        'Count of blocked deletion attempts while resource is under hold. For compliance reporting.';
        """
    )

    # =========================================================================
    # 13. Create trigger for updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_lh_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_lh_updated_at ON legal_holds;
        CREATE TRIGGER trigger_lh_updated_at
            BEFORE UPDATE ON legal_holds
            FOR EACH ROW
            EXECUTE FUNCTION update_lh_updated_at();
        """
    )


def downgrade() -> None:
    """Drop legal_holds table and related objects."""

    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_lh_updated_at ON legal_holds;")
    op.execute("DROP FUNCTION IF EXISTS update_lh_updated_at();")

    # Drop foreign key from data_subject_requests
    op.execute(
        """
        ALTER TABLE data_subject_requests
        DROP CONSTRAINT IF EXISTS fk_dsr_legal_hold;
        """
    )

    # Drop legal_hold_resources table indexes
    op.execute("DROP INDEX IF EXISTS idx_lhr_user;")
    op.execute("DROP INDEX IF EXISTS idx_lhr_workspace_resource;")
    op.execute("DROP INDEX IF EXISTS idx_lhr_resource;")
    op.execute("DROP INDEX IF EXISTS idx_lhr_hold;")

    # Drop legal_hold_resources table
    op.execute("DROP TABLE IF EXISTS legal_hold_resources CASCADE;")

    # Drop legal_holds table indexes
    op.execute("DROP INDEX IF EXISTS idx_lh_expiring;")
    op.execute("DROP INDEX IF EXISTS idx_lh_next_reminder;")
    op.execute("DROP INDEX IF EXISTS idx_lh_scope_resource_types;")
    op.execute("DROP INDEX IF EXISTS idx_lh_scope_resources;")
    op.execute("DROP INDEX IF EXISTS idx_lh_scope_users;")
    op.execute("DROP INDEX IF EXISTS idx_lh_matter;")
    op.execute("DROP INDEX IF EXISTS idx_lh_issued_by;")
    op.execute("DROP INDEX IF EXISTS idx_lh_workspace_type;")
    op.execute("DROP INDEX IF EXISTS idx_lh_active;")
    op.execute("DROP INDEX IF EXISTS idx_lh_workspace_created;")
    op.execute("DROP INDEX IF EXISTS idx_lh_workspace_status;")

    # Drop legal_holds table (cascades constraints)
    op.execute("DROP TABLE IF EXISTS legal_holds CASCADE;")
