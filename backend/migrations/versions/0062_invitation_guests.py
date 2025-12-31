"""Create invitation_guests table for Save The Date feature.

This migration creates:
- invitation_guests: Pre-populated guest list for personalized invitations

Security considerations:
- Workspace isolation enforced
- Personal tokens for guest-specific tracking
- Email uniqueness per invitation

Feature: 016-save-the-date
Revision ID: 0062
Revises: 0061
Create Date: 2025-12-30
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_guests table."""

    # =========================================================================
    # 1. Create invitation_guests table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invitation_guests (
            -- Primary key
            guest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Foreign keys
            invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Guest details
            name VARCHAR(200) NOT NULL,
            email VARCHAR(255),
            phone VARCHAR(20),

            -- Personalization
            salutation VARCHAR(50),
            group_name VARCHAR(100),
            personalized_message TEXT,
            expected_party_size INTEGER DEFAULT 1,

            -- Personal invite token (for tracking individual guest links)
            personal_token VARCHAR(64) UNIQUE,

            -- Status tracking
            invitation_sent BOOLEAN DEFAULT FALSE,
            invitation_sent_at TIMESTAMPTZ,
            invitation_viewed BOOLEAN DEFAULT FALSE,
            invitation_viewed_at TIMESTAMPTZ,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT invitation_guests_email_unique UNIQUE (invitation_id, email),
            CONSTRAINT invitation_guests_expected_party_size_valid CHECK (expected_party_size > 0 AND expected_party_size <= 20)
        );
        """
    )

    # =========================================================================
    # 2. Create indexes
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_guests_invitation
        ON invitation_guests(invitation_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_guests_workspace
        ON invitation_guests(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_guests_personal_token
        ON invitation_guests(personal_token)
        WHERE personal_token IS NOT NULL;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_guests_group
        ON invitation_guests(invitation_id, group_name);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_guests_email
        ON invitation_guests(email)
        WHERE email IS NOT NULL;
        """
    )

    # =========================================================================
    # 3. Create trigger for automatic updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_invitation_guests_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_invitation_guests_updated_at ON invitation_guests;
        CREATE TRIGGER trigger_invitation_guests_updated_at
            BEFORE UPDATE ON invitation_guests
            FOR EACH ROW
            EXECUTE FUNCTION update_invitation_guests_updated_at();
        """
    )

    # =========================================================================
    # 4. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE invitation_guests IS
        'Pre-populated guest list for personalized invitation tracking and individual links';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_guests.personal_token IS
        'Unique token for guest-specific invitation URL tracking (optional)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_guests.group_name IS
        'Guest grouping for organization: Family, Friends, Colleagues, etc.';
        """
    )


def downgrade() -> None:
    """Remove invitation_guests table."""
    # Drop trigger
    op.execute("DROP TRIGGER IF EXISTS trigger_invitation_guests_updated_at ON invitation_guests;")
    op.execute("DROP FUNCTION IF EXISTS update_invitation_guests_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_guests_email;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_guests_group;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_guests_personal_token;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_guests_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_guests_invitation;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS invitation_guests;")
