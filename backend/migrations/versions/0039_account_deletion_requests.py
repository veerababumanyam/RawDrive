"""Account deletion requests table for GDPR-compliant deletion workflow.

Revision ID: 0039
Revises: 0038
Create Date: 2025-12-27

This migration creates the account_deletion_requests table for tracking
user account deletion requests with a 30-day grace period.
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Account deletion requests table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS account_deletion_requests (
            deletion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id),
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            reason TEXT,
            requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            scheduled_deletion_at TIMESTAMPTZ NOT NULL,
            cancelled_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            error_message TEXT,

            -- Constraints
            CONSTRAINT valid_status CHECK (
                status IN ('pending', 'cancelled', 'processing', 'completed', 'failed')
            )
        );
        """
    )

    # Indexes for efficient queries
    op.execute(
        """
        CREATE INDEX idx_account_deletion_requests_user_id
        ON account_deletion_requests(user_id);
        """
    )
    op.execute(
        """
        CREATE INDEX idx_account_deletion_requests_status
        ON account_deletion_requests(status);
        """
    )
    op.execute(
        """
        CREATE INDEX idx_account_deletion_requests_scheduled
        ON account_deletion_requests(scheduled_deletion_at)
        WHERE status = 'pending';
        """
    )

    # Comment for documentation
    op.execute(
        """
        COMMENT ON TABLE account_deletion_requests IS
        'GDPR-compliant account deletion tracking with 30-day grace period';
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS account_deletion_requests CASCADE;")
