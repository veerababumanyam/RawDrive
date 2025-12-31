"""Create invitation_rsvps table for Save The Date feature.

This migration creates:
- invitation_rsvps: Guest RSVP responses with edit tokens

Security considerations:
- Email uniqueness per invitation (deduplication)
- Edit tokens hashed with SHA-256
- Rate limiting supported via IP tracking

Feature: 016-save-the-date
Revision ID: 0063
Revises: 0062
Create Date: 2025-12-30
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_rsvps table."""

    # =========================================================================
    # 1. Create rsvp_status enum
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rsvp_status') THEN
                CREATE TYPE rsvp_status AS ENUM (
                    'pending', 'confirmed', 'declined', 'maybe', 'cancelled'
                );
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create rsvp_source enum
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rsvp_source') THEN
                CREATE TYPE rsvp_source AS ENUM (
                    'web', 'qr_code', 'whatsapp', 'email_link', 'personal_link'
                );
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 3. Create invitation_rsvps table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invitation_rsvps (
            -- Primary key
            rsvp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Foreign keys
            invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            guest_id UUID REFERENCES invitation_guests(guest_id) ON DELETE SET NULL,

            -- Guest information
            guest_name VARCHAR(200) NOT NULL,
            guest_email VARCHAR(255) NOT NULL,
            guest_phone VARCHAR(20),

            -- RSVP response
            attending BOOLEAN NOT NULL,
            party_size INTEGER DEFAULT 1,
            party_names TEXT[],
            dietary_preferences TEXT,
            message TEXT,
            custom_answers JSONB DEFAULT '{}'::JSONB,

            -- Edit token (for updating RSVP without account)
            edit_token_hash VARCHAR(64),
            token_expires_at TIMESTAMPTZ,

            -- Tracking
            ip_address INET,
            user_agent TEXT,
            source rsvp_source DEFAULT 'web',

            -- Status
            status rsvp_status DEFAULT 'confirmed',

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT invitation_rsvps_email_unique UNIQUE (invitation_id, guest_email),
            CONSTRAINT invitation_rsvps_party_size_valid CHECK (party_size >= 1 AND party_size <= 20)
        );
        """
    )

    # =========================================================================
    # 4. Create indexes
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_invitation
        ON invitation_rsvps(invitation_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_workspace
        ON invitation_rsvps(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_email
        ON invitation_rsvps(guest_email);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_attending
        ON invitation_rsvps(invitation_id, attending);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_created
        ON invitation_rsvps(invitation_id, created_at DESC);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_status
        ON invitation_rsvps(invitation_id, status);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_edit_token
        ON invitation_rsvps(edit_token_hash)
        WHERE edit_token_hash IS NOT NULL;
        """
    )

    # =========================================================================
    # 5. Create trigger for automatic updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_invitation_rsvps_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_invitation_rsvps_updated_at ON invitation_rsvps;
        CREATE TRIGGER trigger_invitation_rsvps_updated_at
            BEFORE UPDATE ON invitation_rsvps
            FOR EACH ROW
            EXECUTE FUNCTION update_invitation_rsvps_updated_at();
        """
    )

    # =========================================================================
    # 6. Create trigger to update invitation rsvp_count
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_invitation_rsvp_count()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE invitations
                SET rsvp_count = rsvp_count + 1, updated_at = NOW()
                WHERE invitation_id = NEW.invitation_id;
            ELSIF TG_OP = 'DELETE' THEN
                UPDATE invitations
                SET rsvp_count = rsvp_count - 1, updated_at = NOW()
                WHERE invitation_id = OLD.invitation_id;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trigger_invitation_rsvp_count ON invitation_rsvps;
        CREATE TRIGGER trigger_invitation_rsvp_count
            AFTER INSERT OR DELETE ON invitation_rsvps
            FOR EACH ROW
            EXECUTE FUNCTION update_invitation_rsvp_count();
        """
    )

    # =========================================================================
    # 7. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE invitation_rsvps IS
        'Guest RSVP responses with deduplication by email and edit token support';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_rsvps.edit_token_hash IS
        'SHA-256 hash of JWT edit token. Plaintext returned only on RSVP creation.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_rsvps.custom_answers IS
        'Answers to custom RSVP questions defined in invitation.rsvp_custom_questions';
        """
    )


def downgrade() -> None:
    """Remove invitation_rsvps table."""
    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS trigger_invitation_rsvp_count ON invitation_rsvps;")
    op.execute("DROP FUNCTION IF EXISTS update_invitation_rsvp_count();")
    op.execute("DROP TRIGGER IF EXISTS trigger_invitation_rsvps_updated_at ON invitation_rsvps;")
    op.execute("DROP FUNCTION IF EXISTS update_invitation_rsvps_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_edit_token;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_status;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_created;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_attending;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_email;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_invitation;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS invitation_rsvps;")

    # Drop enums
    op.execute("DROP TYPE IF EXISTS rsvp_source;")
    op.execute("DROP TYPE IF EXISTS rsvp_status;")
