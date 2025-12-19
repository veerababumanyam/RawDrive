"""Add deletion columns and recycle bin support.

Adds soft delete columns (deleted, deleted_at, delete_status) to galleries and assets.
Creates deletion_audit_log table for tracking all deletion operations.

Revision ID: 0009
Revises: 0008
Create Date: 2025-12-19
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add soft delete columns to galleries table
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delete_status VARCHAR(50)
            CHECK (delete_status IS NULL OR delete_status IN ('pending', 'permanent_deleting', 'delete_failed'));
        """
    )

    # Add soft delete columns to assets table
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delete_status VARCHAR(50)
            CHECK (delete_status IS NULL OR delete_status IN ('pending', 'permanent_deleting', 'delete_failed'));
        """
    )

    # Add soft delete columns to sub_galleries table
    op.execute(
        """
        ALTER TABLE sub_galleries
        ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
        """
    )

    # Create deletion_audit_log table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS deletion_audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(user_id),
            entity_id UUID NOT NULL,
            entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('gallery', 'photo', 'sub_gallery')),
            action VARCHAR(50) NOT NULL CHECK (action IN ('soft_delete', 'restore', 'permanent_delete', 'auto_cleanup')),
            r2_keys_deleted TEXT[],
            storage_freed BIGINT,
            error_message TEXT,
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Create indexes for efficient recycle bin queries
    # Partial index for deleted galleries (only includes deleted items)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_galleries_recycle_bin
        ON galleries(workspace_id, deleted_at DESC)
        WHERE deleted = TRUE;
        """
    )

    # Partial index for deleted assets
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_assets_recycle_bin
        ON assets(workspace_id, deleted_at DESC)
        WHERE deleted = TRUE;
        """
    )

    # Index for finding items pending permanent deletion (auto-cleanup)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_galleries_pending_cleanup
        ON galleries(deleted_at)
        WHERE deleted = TRUE AND delete_status IS NULL;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_assets_pending_cleanup
        ON assets(deleted_at)
        WHERE deleted = TRUE AND delete_status IS NULL;
        """
    )

    # Index for deleted sub_galleries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sub_galleries_deleted
        ON sub_galleries(gallery_id, deleted)
        WHERE deleted = TRUE;
        """
    )

    # Indexes for deletion_audit_log
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_deletion_audit_workspace_time
        ON deletion_audit_log(workspace_id, created_at DESC);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_deletion_audit_entity
        ON deletion_audit_log(entity_id, entity_type);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_deletion_audit_action
        ON deletion_audit_log(workspace_id, action, created_at DESC);
        """
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_deletion_audit_action;")
    op.execute("DROP INDEX IF EXISTS idx_deletion_audit_entity;")
    op.execute("DROP INDEX IF EXISTS idx_deletion_audit_workspace_time;")
    op.execute("DROP INDEX IF EXISTS idx_sub_galleries_deleted;")
    op.execute("DROP INDEX IF EXISTS idx_assets_pending_cleanup;")
    op.execute("DROP INDEX IF EXISTS idx_galleries_pending_cleanup;")
    op.execute("DROP INDEX IF EXISTS idx_assets_recycle_bin;")
    op.execute("DROP INDEX IF EXISTS idx_galleries_recycle_bin;")

    # Drop deletion_audit_log table
    op.execute("DROP TABLE IF EXISTS deletion_audit_log;")

    # Remove columns from sub_galleries
    op.execute("ALTER TABLE sub_galleries DROP COLUMN IF EXISTS deleted_at;")
    op.execute("ALTER TABLE sub_galleries DROP COLUMN IF EXISTS deleted;")

    # Remove columns from assets
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS delete_status;")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS deleted_at;")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS deleted;")

    # Remove columns from galleries
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS delete_status;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS deleted_at;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS deleted;")
