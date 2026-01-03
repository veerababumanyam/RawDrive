"""Clean duplicate RSVPs (case-insensitive) before adding unique constraint.

This migration removes duplicate RSVPs, keeping the oldest record for each
(invitation_id, email) pair. This ensures the new unique constraint can be applied.

Feature: 020-invitation-rsvp-hardening
Revision ID: 0081
Revises: 0080
Create Date: 2026-01-03

IMPORTANT: Run check_rsvp_duplicates() first to review duplicates before applying.
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0081"
down_revision = "0080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Remove duplicate RSVPs, keeping the oldest record for each email.

    Strategy: For each (invitation_id, LOWER(guest_email)) pair with multiple
    entries, delete all but the oldest (MIN rsvp_id by created_at).

    This is a one-way migration - deleted duplicates cannot be recovered.
    """
    # Delete duplicates, keeping the oldest RSVP for each invitation+email combo
    op.execute(
        """
        DELETE FROM invitation_rsvps a
        USING (
            SELECT
                invitation_id,
                LOWER(guest_email) as email_lower,
                (ARRAY_AGG(rsvp_id ORDER BY created_at ASC))[1] as keep_id
            FROM invitation_rsvps
            GROUP BY invitation_id, LOWER(guest_email)
            HAVING COUNT(*) > 1
        ) b
        WHERE a.invitation_id = b.invitation_id
          AND LOWER(a.guest_email) = b.email_lower
          AND a.rsvp_id != b.keep_id;
        """
    )


def downgrade() -> None:
    """Downgrade is not possible - deleted RSVPs cannot be recovered.

    This is intentional as duplicate RSVPs represent data integrity issues
    that should not be reintroduced.
    """
    # No-op - cannot restore deleted duplicates
    pass
