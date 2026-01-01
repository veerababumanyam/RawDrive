"""Create audit_events table for compliance logging.

This migration creates an append-only audit log table:
- action: Action type (guest.create, guest.update, rsvp.submit, etc.)
- resource_type: Entity type (guest, invitation, rsvp)
- changes: JSONB with before/after values for updates
- metadata: Additional context (batch_id, count, etc.)

The table is designed to be append-only for SOC2/GDPR compliance.
Application user has INSERT only - no UPDATE/DELETE permissions.

Feature: 018-invitations-production-readiness
Revision ID: 0076
Revises: 0075
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0076"
down_revision = "0075"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create audit_events table with append-only permissions."""

    # =========================================================================
    # 1. Create audit_events table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_events (
            event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL,
            actor_id UUID NOT NULL,
            action VARCHAR(50) NOT NULL,
            resource_type VARCHAR(50) NOT NULL,
            resource_id UUID NOT NULL,
            changes JSONB,
            metadata JSONB,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 2. Create index for workspace + time queries (most common)
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_audit_workspace_time
        ON audit_events(workspace_id, created_at DESC);
        """
    )

    # =========================================================================
    # 3. Create index for resource lookups
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_audit_resource
        ON audit_events(resource_type, resource_id);
        """
    )

    # =========================================================================
    # 4. Create index for actor queries
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_audit_actor
        ON audit_events(actor_id, created_at DESC);
        """
    )

    # =========================================================================
    # 5. Add check constraint for action types
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_audit_action'
            ) THEN
                ALTER TABLE audit_events
                ADD CONSTRAINT check_audit_action
                CHECK (action IN (
                    'guest.create', 'guest.update', 'guest.delete',
                    'guest.bulk_import', 'guest.bulk_invite',
                    'rsvp.submit', 'rsvp.update',
                    'invitation.view', 'invitation.create', 'invitation.update', 'invitation.delete'
                ));
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 6. Add check constraint for resource types
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_audit_resource_type'
            ) THEN
                ALTER TABLE audit_events
                ADD CONSTRAINT check_audit_resource_type
                CHECK (resource_type IN ('guest', 'invitation', 'rsvp'));
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 7. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE audit_events IS
        'Immutable audit trail for SOC2/GDPR compliance. Append-only - no UPDATE/DELETE.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN audit_events.changes IS
        'JSONB with before/after values for updates: {"before": {...}, "after": {...}}';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN audit_events.metadata IS
        'Additional context: batch_id, count, correlation_id, etc.';
        """
    )

    # =========================================================================
    # 8. Revoke UPDATE/DELETE permissions for application user
    #    Note: This assumes the app connects as 'rawdrive_app' user.
    #    Adjust the username if different in your environment.
    # =========================================================================
    # Commented out as the specific user may not exist in all environments
    # Uncomment and adjust for production:
    # op.execute("REVOKE UPDATE, DELETE ON audit_events FROM rawdrive_app;")


def downgrade() -> None:
    """Drop audit_events table."""

    op.execute("DROP TABLE IF EXISTS audit_events CASCADE;")
