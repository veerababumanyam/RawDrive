"""Ensure deletion columns exist.

This migration manually ensures that the deletion columns (deleted, deleted_at, delete_status)
exist on the relevant tables, as they were seemingly missed in a previous migration state.

Revision ID: 0010
Revises: 0009
Create Date: 2025-12-19
"""

from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure columns on galleries
    op.execute("""
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delete_status VARCHAR(50)
            CHECK (delete_status IS NULL OR delete_status IN ('pending', 'permanent_deleting', 'delete_failed'));
    """)

    # Ensure columns on assets
    op.execute("""
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delete_status VARCHAR(50)
            CHECK (delete_status IS NULL OR delete_status IN ('pending', 'permanent_deleting', 'delete_failed'));
    """)

    # Ensure columns on sub_galleries
    op.execute("""
        ALTER TABLE sub_galleries
        ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    """)


def downgrade() -> None:
    # We generally don't want to remove these if we're just ensuring they exist,
    # but for completeness, we can remove them if this migration is reverted.
    # However, since this is a "fix" migration, reverting it might delete data if we aren't careful.
    # Given the context (fixing a broken state), we'll skip dropping them to avoid accidental data loss 
    # if 0009 is still considered "active". 
    # But strictly speaking, downgrade should reverse upgrade.
    pass
