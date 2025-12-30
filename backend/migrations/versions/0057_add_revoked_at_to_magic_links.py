"""Add revoked_at timestamp column to magic_links table.

Tracks when links were revoked to support auto-purging after retention period.
SOC 2 compliance requires maintaining audit trail for 90 days before purging.

Revision ID: 0057
Revises: 0056
Create Date: 2025-12-30
"""

from alembic import op

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add revoked_at column and backfill existing revoked links."""
    op.execute("""
        -- Add revoked_at column
        ALTER TABLE magic_links
        ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

        -- Backfill revoked_at for existing revoked links using updated_at
        UPDATE magic_links
        SET revoked_at = updated_at
        WHERE status = 'revoked' AND revoked_at IS NULL;

        -- Add index for efficient purge queries
        CREATE INDEX IF NOT EXISTS idx_magic_links_revoked_at
        ON magic_links (revoked_at)
        WHERE status = 'revoked';

        COMMENT ON COLUMN magic_links.revoked_at IS
        'Timestamp when link was revoked. Used for 90-day retention before auto-purge (SOC 2 compliance).';
    """)


def downgrade() -> None:
    """Remove revoked_at column from magic_links."""
    op.execute("""
        DROP INDEX IF EXISTS idx_magic_links_revoked_at;
        ALTER TABLE magic_links DROP COLUMN IF EXISTS revoked_at;
    """)
