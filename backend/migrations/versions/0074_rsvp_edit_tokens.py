"""Add RSVP edit token columns to invitation_guests.

This migration adds columns for secure RSVP editing:
- edit_token: Unique token for guest to edit their RSVP
- edit_token_expires_at: Token expiration timestamp (30 days from creation)

Feature: 018-invitations-production-readiness
Revision ID: 0074
Revises: 0073
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0074"
down_revision = "0073"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add edit token columns to invitation_guests."""

    # =========================================================================
    # 1. Add edit_token and edit_token_expires_at columns
    # =========================================================================
    op.execute(
        """
        ALTER TABLE invitation_guests
        ADD COLUMN IF NOT EXISTS edit_token VARCHAR(64),
        ADD COLUMN IF NOT EXISTS edit_token_expires_at TIMESTAMPTZ;
        """
    )

    # =========================================================================
    # 2. Create unique index on edit_token for fast lookups
    # =========================================================================
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_edit_token
        ON invitation_guests(edit_token)
        WHERE edit_token IS NOT NULL;
        """
    )

    # =========================================================================
    # 3. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON COLUMN invitation_guests.edit_token IS
        'HMAC-signed token allowing guest to edit their RSVP response';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_guests.edit_token_expires_at IS
        'Token expiration timestamp (typically 30 days from creation)';
        """
    )


def downgrade() -> None:
    """Remove edit token columns from invitation_guests."""

    # Drop index
    op.execute("DROP INDEX IF EXISTS idx_guests_edit_token;")

    # Drop columns
    op.execute(
        """
        ALTER TABLE invitation_guests
        DROP COLUMN IF EXISTS edit_token,
        DROP COLUMN IF EXISTS edit_token_expires_at;
        """
    )
