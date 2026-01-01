"""Add columns to invitation_guests for microservice compatibility.

This migration adds columns needed by the invitations microservice:
- status: Enum tracking guest invitation/RSVP state
- plus_ones: Number of additional guests (replaces expected_party_size)
- dietary_restrictions: Guest dietary requirements
- notes: Additional notes
- import_batch_id: Track CSV/Excel import batches
- rsvp_at: When guest responded
- rsvp_response: Full RSVP response data as JSONB

Feature: 017-digital-wedding-invitations
Revision ID: 0073
Revises: 0072
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add microservice-required columns to invitation_guests."""

    # =========================================================================
    # 1. Create guest_status enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE guest_status AS ENUM (
                'pending',
                'invited',
                'viewed',
                'rsvp_yes',
                'rsvp_no',
                'rsvp_maybe'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 2. Add new columns to invitation_guests
    # =========================================================================
    op.execute(
        """
        ALTER TABLE invitation_guests
        ADD COLUMN IF NOT EXISTS status guest_status DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS plus_ones INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS dietary_restrictions VARCHAR(500),
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS import_batch_id UUID,
        ADD COLUMN IF NOT EXISTS rsvp_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS rsvp_response JSONB DEFAULT '{}'::JSONB;
        """
    )

    # =========================================================================
    # 3. Add constraints (use DO block since ADD CONSTRAINT IF NOT EXISTS is not supported)
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_plus_ones_range'
            ) THEN
                ALTER TABLE invitation_guests
                ADD CONSTRAINT check_plus_ones_range
                CHECK (plus_ones >= 0 AND plus_ones <= 10);
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 4. Create index on import_batch_id for batch operations
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_guests_import_batch
        ON invitation_guests(import_batch_id)
        WHERE import_batch_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 5. Create index on status for filtering
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_guests_status
        ON invitation_guests(invitation_id, status);
        """
    )

    # =========================================================================
    # 6. Migrate existing data - sync status from boolean fields
    # =========================================================================
    op.execute(
        """
        UPDATE invitation_guests
        SET status = CASE
            WHEN invitation_viewed = TRUE THEN 'viewed'::guest_status
            WHEN invitation_sent = TRUE THEN 'invited'::guest_status
            ELSE 'pending'::guest_status
        END
        WHERE status IS NULL OR status = 'pending';
        """
    )

    # =========================================================================
    # 7. Sync plus_ones from expected_party_size (minus 1 for the guest)
    # =========================================================================
    op.execute(
        """
        UPDATE invitation_guests
        SET plus_ones = GREATEST(0, COALESCE(expected_party_size, 1) - 1)
        WHERE plus_ones IS NULL OR plus_ones = 0;
        """
    )

    # =========================================================================
    # 8. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON COLUMN invitation_guests.status IS
        'Current state: pending, invited, viewed, rsvp_yes, rsvp_no, rsvp_maybe';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_guests.import_batch_id IS
        'UUID grouping guests imported together via CSV/Excel';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_guests.rsvp_response IS
        'Full RSVP response including custom questions as JSONB';
        """
    )


def downgrade() -> None:
    """Remove microservice columns from invitation_guests."""

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_guests_status;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_guests_import_batch;")

    # Drop constraint
    op.execute("ALTER TABLE invitation_guests DROP CONSTRAINT IF EXISTS check_plus_ones_range;")

    # Drop columns
    op.execute(
        """
        ALTER TABLE invitation_guests
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS plus_ones,
        DROP COLUMN IF EXISTS dietary_restrictions,
        DROP COLUMN IF EXISTS notes,
        DROP COLUMN IF EXISTS import_batch_id,
        DROP COLUMN IF EXISTS rsvp_at,
        DROP COLUMN IF EXISTS rsvp_response;
        """
    )

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS guest_status;")
