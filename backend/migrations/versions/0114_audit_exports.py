"""Audit exports table for audit log export jobs.

Creates the audit_exports table to track and manage audit log export jobs:
- Async export job creation and tracking
- Export filtering and format options (CSV, JSON)
- File storage reference and expiration
- Rate limiting enforcement

The table supports:
- Multi-tenant workspace isolation
- Background job processing with status tracking
- Export rate limiting per user
- Download URL expiration (24 hours)
- Large dataset handling

Feature: Audit & Compliance System (T011)
Revision ID: 0114
Revises: 0113
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0114"
down_revision = "0113"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create audit_exports table for export job tracking."""

    # =========================================================================
    # 1. Create export status enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE audit_export_status AS ENUM (
                'pending',
                'processing',
                'completed',
                'failed',
                'expired'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create export format enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE audit_export_format AS ENUM (
                'csv',
                'json'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # =========================================================================
    # 3. Create audit_exports table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_exports (
            export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,

            -- Job configuration
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            format VARCHAR(10) NOT NULL DEFAULT 'csv',
            from_date TIMESTAMPTZ NOT NULL,
            to_date TIMESTAMPTZ NOT NULL,
            filters JSONB DEFAULT '{}',

            -- Progress tracking
            estimated_records INTEGER,
            record_count INTEGER,
            file_size_bytes BIGINT,

            -- Output storage
            -- For small exports, we store directly in DB (development/small scale)
            -- For production, this would be a path to object storage (S3/GCS)
            export_data TEXT,
            file_path VARCHAR(512),
            download_url VARCHAR(1024),
            download_expires_at TIMESTAMPTZ,

            -- Error handling
            error_message TEXT,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMPTZ,

            -- Constraints
            CONSTRAINT check_export_date_range CHECK (from_date < to_date),
            CONSTRAINT check_export_status CHECK (
                status IN ('pending', 'processing', 'completed', 'failed', 'expired')
            ),
            CONSTRAINT check_export_format CHECK (
                format IN ('csv', 'json')
            )
        );
        """
    )

    # =========================================================================
    # 4. Create indexes for common queries
    # =========================================================================

    # Workspace + created_at for listing exports
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_audit_exports_workspace_created
        ON audit_exports(workspace_id, created_at DESC);
        """
    )

    # User + created_at for rate limiting
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_audit_exports_user_created
        ON audit_exports(created_by, created_at DESC);
        """
    )

    # Status for processing queue
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_audit_exports_status
        ON audit_exports(status)
        WHERE status IN ('pending', 'processing');
        """
    )

    # Expiration cleanup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_audit_exports_expires
        ON audit_exports(download_expires_at)
        WHERE download_expires_at IS NOT NULL AND status = 'completed';
        """
    )

    # =========================================================================
    # 5. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE audit_exports IS
        'Tracks audit log export jobs for compliance data extraction.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN audit_exports.filters IS
        'JSONB with export filters: {event_types: [...], actor_user_id: ..., etc.}';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN audit_exports.export_data IS
        'For small exports: actual CSV/JSON content. For large exports: null (use file_path).';
        """
    )


def downgrade() -> None:
    """Drop audit_exports table and related objects."""

    op.execute("DROP TABLE IF EXISTS audit_exports CASCADE;")
    op.execute("DROP TYPE IF EXISTS audit_export_status CASCADE;")
    op.execute("DROP TYPE IF EXISTS audit_export_format CASCADE;")
