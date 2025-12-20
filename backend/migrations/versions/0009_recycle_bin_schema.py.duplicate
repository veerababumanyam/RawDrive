"""Add recycle bin infrastructure for soft-delete with timestamps.

Revision ID: 0009
Revises: 0008
Create Date: 2025-12-19

Adds deleted_at timestamp to galleries and gallery_assets tables
to support a centralized recycle bin view. Items can be restored
within a retention period (default 30 days).
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add deleted_at column to galleries table
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
        """
    )

    # Add deleted_by_user_id to galleries
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID REFERENCES users(user_id);
        """
    )

    # Add deleted_at column to gallery_assets table
    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
        """
    )

    # Add deleted_by_user_id to gallery_assets
    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID REFERENCES users(user_id);
        """
    )

    # Create index for efficient recycle bin queries on galleries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_galleries_deleted_at
        ON galleries(workspace_id, deleted_at DESC)
        WHERE deleted_at IS NOT NULL;
        """
    )

    # Create index for efficient recycle bin queries on gallery_assets
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_assets_deleted_at
        ON gallery_assets(workspace_id, deleted_at DESC)
        WHERE deleted_at IS NOT NULL;
        """
    )

    # Update existing soft-deleted gallery_assets to have a deleted_at timestamp
    # This migrates the old visible=FALSE pattern to the new timestamp-based pattern
    op.execute(
        """
        UPDATE gallery_assets
        SET deleted_at = NOW()
        WHERE visible = FALSE AND deleted_at IS NULL;
        """
    )

    # Update existing archived galleries to have a deleted_at timestamp
    op.execute(
        """
        UPDATE galleries
        SET deleted_at = NOW()
        WHERE status = 'archived' AND deleted_at IS NULL;
        """
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_deleted_at;")
    op.execute("DROP INDEX IF EXISTS idx_galleries_deleted_at;")

    # Drop columns from gallery_assets
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS deleted_by_user_id;")
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS deleted_at;")

    # Drop columns from galleries
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS deleted_by_user_id;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS deleted_at;")
