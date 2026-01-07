"""Granular permission system with conditional permissions and time-based access.

Implements:
- Conditional permissions with resource-level restrictions
- Time-based access expiration for temporary team members
- Role audit trails with detailed change tracking
- Permission delegation rules

Revision ID: 0108b
Revises: 0108a
Create Date: 2025-01-06
"""

from alembic import op

revision = "0108b"
down_revision = "0108a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Permission conditions table - stores granular conditions for permissions
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS permission_conditions (
            condition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            condition_type VARCHAR(50) NOT NULL,
            condition_config JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_by_user_id UUID REFERENCES users(user_id),
            UNIQUE(workspace_id, name)
        );
        """
    )

    # Granular permissions table - maps permissions to conditions
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS granular_permissions (
            granular_permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            member_role_id UUID NOT NULL REFERENCES member_roles(member_role_id) ON DELETE CASCADE,
            permission VARCHAR(100) NOT NULL,
            condition_id UUID REFERENCES permission_conditions(condition_id) ON DELETE CASCADE,
            granted_at TIMESTAMPTZ DEFAULT NOW(),
            granted_by_user_id UUID REFERENCES users(user_id),
            expires_at TIMESTAMPTZ,
            is_active BOOLEAN DEFAULT TRUE,
            notes TEXT,
            UNIQUE(member_role_id, permission, condition_id)
        );
        """
    )

    # Time-based role assignments - supports temporary access
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS time_based_role_assignments (
            assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            membership_id UUID NOT NULL REFERENCES workspace_memberships(membership_id) ON DELETE CASCADE,
            role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
            starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            reason TEXT,
            granted_by_user_id UUID REFERENCES users(user_id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            revoked_at TIMESTAMPTZ,
            revoked_by_user_id UUID REFERENCES users(user_id),
            revocation_reason TEXT,
            CONSTRAINT valid_time_range CHECK (expires_at > starts_at)
        );
        """
    )

    # Role change audit log - detailed tracking of all role changes
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS role_audit_log (
            audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            actor_user_id UUID REFERENCES users(user_id),
            action_type VARCHAR(50) NOT NULL,
            target_type VARCHAR(50) NOT NULL,
            target_id UUID NOT NULL,
            target_user_id UUID REFERENCES users(user_id),
            previous_state JSONB,
            new_state JSONB,
            change_summary TEXT,
            ip_address INET,
            user_agent TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Permission delegation rules - who can grant what permissions
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS permission_delegation_rules (
            rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            delegator_role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
            delegatable_permissions TEXT[] NOT NULL DEFAULT '{}',
            max_delegation_depth INT DEFAULT 1,
            can_set_expiration BOOLEAN DEFAULT TRUE,
            max_expiration_days INT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(workspace_id, delegator_role_id)
        );
        """
    )

    # Add condition_type enum check
    op.execute(
        """
        ALTER TABLE permission_conditions
        ADD CONSTRAINT check_condition_type
        CHECK (condition_type IN (
            'gallery_status',
            'gallery_ids',
            'client_ids',
            'date_range',
            'asset_type',
            'tag_filter',
            'sub_gallery_ids',
            'custom'
        ));
        """
    )

    # Add action_type enum check for role_audit_log
    op.execute(
        """
        ALTER TABLE role_audit_log
        ADD CONSTRAINT check_action_type
        CHECK (action_type IN (
            'role_created',
            'role_updated',
            'role_deleted',
            'permission_granted',
            'permission_revoked',
            'permission_expired',
            'member_role_assigned',
            'member_role_removed',
            'time_based_access_granted',
            'time_based_access_revoked',
            'time_based_access_expired',
            'delegation_rule_created',
            'delegation_rule_updated',
            'delegation_rule_deleted',
            'condition_created',
            'condition_updated',
            'condition_deleted'
        ));
        """
    )

    # Add target_type enum check for role_audit_log
    op.execute(
        """
        ALTER TABLE role_audit_log
        ADD CONSTRAINT check_target_type
        CHECK (target_type IN (
            'role',
            'member_role',
            'granular_permission',
            'permission_condition',
            'delegation_rule',
            'time_based_assignment'
        ));
        """
    )

    # Indexes for efficient querying
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_permission_conditions_workspace ON permission_conditions(workspace_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_granular_permissions_member_role ON granular_permissions(member_role_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_granular_permissions_workspace ON granular_permissions(workspace_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_granular_permissions_expires ON granular_permissions(expires_at) WHERE expires_at IS NOT NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_time_based_assignments_membership ON time_based_role_assignments(membership_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_time_based_assignments_expires ON time_based_role_assignments(expires_at);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_time_based_assignments_active ON time_based_role_assignments(workspace_id) WHERE revoked_at IS NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_role_audit_log_workspace_time ON role_audit_log(workspace_id, created_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_role_audit_log_actor ON role_audit_log(actor_user_id, created_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_role_audit_log_target ON role_audit_log(target_type, target_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_role_audit_log_target_user ON role_audit_log(target_user_id) WHERE target_user_id IS NOT NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_delegation_rules_workspace ON permission_delegation_rules(workspace_id);"
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_delegation_rules_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_role_audit_log_target_user;")
    op.execute("DROP INDEX IF EXISTS idx_role_audit_log_target;")
    op.execute("DROP INDEX IF EXISTS idx_role_audit_log_actor;")
    op.execute("DROP INDEX IF EXISTS idx_role_audit_log_workspace_time;")
    op.execute("DROP INDEX IF EXISTS idx_time_based_assignments_active;")
    op.execute("DROP INDEX IF EXISTS idx_time_based_assignments_expires;")
    op.execute("DROP INDEX IF EXISTS idx_time_based_assignments_membership;")
    op.execute("DROP INDEX IF EXISTS idx_granular_permissions_expires;")
    op.execute("DROP INDEX IF EXISTS idx_granular_permissions_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_granular_permissions_member_role;")
    op.execute("DROP INDEX IF EXISTS idx_permission_conditions_workspace;")

    # Drop tables
    op.execute("DROP TABLE IF EXISTS permission_delegation_rules;")
    op.execute("DROP TABLE IF EXISTS role_audit_log;")
    op.execute("DROP TABLE IF EXISTS time_based_role_assignments;")
    op.execute("DROP TABLE IF EXISTS granular_permissions;")
    op.execute("DROP TABLE IF EXISTS permission_conditions;")
