"""Create invitation_checkins table for Save The Date feature.

This migration creates:
- invitation_checkins: Event-day guest check-in records

Security considerations:
- Workspace isolation enforced
- QR token used for audit trail
- Idempotent check-in via unique constraints

Feature: 016-save-the-date
Revision ID: 0064
Revises: 0063
Create Date: 2025-12-30
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0064"
down_revision = "0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_checkins table."""

    # =========================================================================
    # 1. Create checkin_verification_method enum
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checkin_verification_method') THEN
                CREATE TYPE checkin_verification_method AS ENUM (
                    'qr_scan', 'manual', 'name_lookup', 'token'
                );
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create invitation_checkins table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invitation_checkins (
            -- Primary key
            checkin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Foreign keys
            invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            rsvp_id UUID REFERENCES invitation_rsvps(rsvp_id) ON DELETE SET NULL,
            guest_id UUID REFERENCES invitation_guests(guest_id) ON DELETE SET NULL,

            -- Check-in details
            guest_name VARCHAR(200) NOT NULL,
            party_size_checked_in INTEGER DEFAULT 1,

            -- Verification
            verification_method checkin_verification_method DEFAULT 'qr_scan',
            qr_token_used VARCHAR(255),

            -- Operator
            checked_in_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Timestamp
            checked_in_at TIMESTAMPTZ DEFAULT NOW(),

            -- Location (optional, for venue verification)
            checkin_latitude DECIMAL(10, 8),
            checkin_longitude DECIMAL(11, 8),

            -- Notes
            notes TEXT,

            -- Constraints
            CONSTRAINT invitation_checkins_party_size_valid CHECK (party_size_checked_in >= 1 AND party_size_checked_in <= 50)
        );
        """
    )

    # =========================================================================
    # 3. Create unique index to prevent duplicate check-ins
    # =========================================================================
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_invitation_checkins_rsvp_unique
        ON invitation_checkins(rsvp_id)
        WHERE rsvp_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 4. Create additional indexes
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_checkins_invitation
        ON invitation_checkins(invitation_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_checkins_workspace
        ON invitation_checkins(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_checkins_rsvp
        ON invitation_checkins(rsvp_id)
        WHERE rsvp_id IS NOT NULL;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_checkins_time
        ON invitation_checkins(invitation_id, checked_in_at DESC);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_checkins_qr_token
        ON invitation_checkins(qr_token_used)
        WHERE qr_token_used IS NOT NULL;
        """
    )

    # =========================================================================
    # 5. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE invitation_checkins IS
        'Event-day guest check-in records via QR scan or manual verification';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_checkins.qr_token_used IS
        'JWT token from QR code used for check-in (for audit trail)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_checkins.checkin_latitude IS
        'Optional GPS coordinates for venue verification';
        """
    )


def downgrade() -> None:
    """Remove invitation_checkins table."""
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_checkins_qr_token;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_checkins_time;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_checkins_rsvp;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_checkins_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_checkins_invitation;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_checkins_rsvp_unique;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS invitation_checkins;")

    # Drop enum
    op.execute("DROP TYPE IF EXISTS checkin_verification_method;")
