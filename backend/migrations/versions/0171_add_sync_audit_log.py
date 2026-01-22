"""Add sync_audit_log table for XMP sync operations audit trail.

Revision ID: 0171
Revises: 0170
Create Date: 2026-01-22

This table logs all XMP import/export operations for SOC2 compliance
and debugging purposes. Supports GDPR data subject rights.
"""

from alembic import op

revision = "0171"
down_revision = "0170"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create sync_audit_log table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_audit_log (
            log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE SET NULL,
            action VARCHAR(50) NOT NULL CHECK (action IN (
                'xmp_export',
                'xmp_import',
                'rating_update',
                'flag_update',
                'color_label_update',
                'batch_update',
                'sync_started',
                'sync_completed',
                'sync_failed',
                'api_key_created',
                'api_key_revoked'
            )),
            source VARCHAR(50) NOT NULL CHECK (source IN (
                'web_ui',
                'desktop_app',
                'api',
                'import'
            )),
            actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('user', 'api_key', 'system')),
            actor_id UUID,
            api_key_id UUID REFERENCES sync_api_keys(key_id) ON DELETE SET NULL,
            affected_asset_ids UUID[] DEFAULT '{}',
            affected_count INTEGER DEFAULT 0,
            details JSONB DEFAULT '{}',
            ip_address INET,
            user_agent VARCHAR(500),
            status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
            error_message TEXT,
            duration_ms INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Index for workspace audit trail
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_audit_log_workspace
        ON sync_audit_log (workspace_id, created_at DESC);
        """
    )

    # Index for gallery audit trail
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_audit_log_gallery
        ON sync_audit_log (gallery_id, created_at DESC)
        WHERE gallery_id IS NOT NULL;
        """
    )

    # Index for actor audit trail
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_audit_log_actor
        ON sync_audit_log (actor_id, created_at DESC)
        WHERE actor_id IS NOT NULL;
        """
    )

    # Index for action filtering
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_audit_log_action
        ON sync_audit_log (action, created_at DESC);
        """
    )

    # Index for API key audit
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_audit_log_api_key
        ON sync_audit_log (api_key_id, created_at DESC)
        WHERE api_key_id IS NOT NULL;
        """
    )

    # Index for time-based queries (retention cleanup)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_audit_log_created
        ON sync_audit_log (created_at);
        """
    )

    # Partial index for failed operations (debugging)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sync_audit_log_failed
        ON sync_audit_log (workspace_id, created_at DESC)
        WHERE status = 'failed';
        """
    )

    # Add comments for documentation
    op.execute(
        """
        COMMENT ON TABLE sync_audit_log IS
        'Audit trail for XMP sync operations. Supports SOC2 compliance and GDPR data subject rights.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN sync_audit_log.action IS
        'Type of sync operation performed';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN sync_audit_log.source IS
        'Origin of the operation: web_ui, desktop_app, api, or import';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN sync_audit_log.details IS
        'JSONB containing operation-specific details (e.g., matched files, changes applied)';
        """
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_sync_audit_log_failed;")
    op.execute("DROP INDEX IF EXISTS idx_sync_audit_log_created;")
    op.execute("DROP INDEX IF EXISTS idx_sync_audit_log_api_key;")
    op.execute("DROP INDEX IF EXISTS idx_sync_audit_log_action;")
    op.execute("DROP INDEX IF EXISTS idx_sync_audit_log_actor;")
    op.execute("DROP INDEX IF EXISTS idx_sync_audit_log_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_sync_audit_log_workspace;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS sync_audit_log;")
