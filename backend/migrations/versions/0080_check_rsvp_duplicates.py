"""Check for duplicate RSVPs before adding unique constraint.

This is a diagnostic migration that identifies case-insensitive duplicate
RSVPs. It does NOT delete any data - that's handled by the next migration.

Feature: 020-invitation-rsvp-hardening
Revision ID: 0080
Revises: 0079
Create Date: 2026-01-03
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0080"
down_revision = "0079"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create a helper function to check for duplicate RSVPs.

    This function can be called to identify duplicates before cleanup.
    Usage: SELECT * FROM check_rsvp_duplicates();
    """
    op.execute(
        """
        CREATE OR REPLACE FUNCTION check_rsvp_duplicates()
        RETURNS TABLE (
            invitation_id UUID,
            email_lower TEXT,
            duplicate_count BIGINT,
            rsvp_ids UUID[]
        )
        LANGUAGE SQL
        STABLE
        AS $$
            SELECT
                invitation_id,
                LOWER(guest_email) as email_lower,
                COUNT(*) as duplicate_count,
                ARRAY_AGG(rsvp_id ORDER BY created_at ASC) as rsvp_ids
            FROM invitation_rsvps
            GROUP BY invitation_id, LOWER(guest_email)
            HAVING COUNT(*) > 1
            ORDER BY duplicate_count DESC;
        $$;
        """
    )

    op.execute(
        """
        COMMENT ON FUNCTION check_rsvp_duplicates() IS
        'Identifies duplicate RSVPs by email (case-insensitive). Returns rsvp_ids in chronological order - first ID is the oldest (should be kept).';
        """
    )


def downgrade() -> None:
    """Remove the duplicate check function."""
    op.execute("DROP FUNCTION IF EXISTS check_rsvp_duplicates();")
