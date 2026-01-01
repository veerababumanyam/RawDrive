"""Create email_send_log table for bulk invite tracking.

This migration creates a table to track individual email sends:
- batch_id: Groups emails from the same bulk operation
- status: queued, sending, sent, delivered, bounced, failed
- provider: Email provider used (sendgrid, smtp, etc.)
- provider_message_id: External provider's message ID
- retry_count: Number of retry attempts

Feature: 018-invitations-production-readiness
Revision ID: 0077
Revises: 0076
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0077"
down_revision = "0076"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create email_send_log table for tracking email delivery."""

    # =========================================================================
    # 1. Create email_send_status enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE email_send_status AS ENUM (
                'queued',
                'sending',
                'sent',
                'delivered',
                'bounced',
                'failed'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create email_send_log table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_send_log (
            send_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
            guest_id UUID NOT NULL REFERENCES invitation_guests(guest_id) ON DELETE CASCADE,
            batch_id UUID,
            status email_send_status NOT NULL DEFAULT 'queued',
            provider VARCHAR(20) NOT NULL,
            provider_message_id VARCHAR(100),
            error_message TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            sent_at TIMESTAMPTZ,
            failed_at TIMESTAMPTZ
        );
        """
    )

    # =========================================================================
    # 3. Create index for batch status queries
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_send_batch
        ON email_send_log(batch_id)
        WHERE batch_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 4. Create index for guest email history
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_send_guest
        ON email_send_log(guest_id, queued_at DESC);
        """
    )

    # =========================================================================
    # 5. Create index for processing queued emails
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_send_status_queue
        ON email_send_log(status, queued_at)
        WHERE status = 'queued';
        """
    )

    # =========================================================================
    # 6. Create index for workspace isolation
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_send_workspace
        ON email_send_log(workspace_id);
        """
    )

    # =========================================================================
    # 7. Add check constraint for retry count
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_retry_count'
            ) THEN
                ALTER TABLE email_send_log
                ADD CONSTRAINT check_retry_count
                CHECK (retry_count >= 0 AND retry_count <= 10);
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 8. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE email_send_log IS
        'Tracks individual email sends for bulk operations with delivery status';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN email_send_log.batch_id IS
        'Groups emails from the same bulk invite operation';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN email_send_log.provider_message_id IS
        'External provider message ID for tracking (e.g., SendGrid message ID)';
        """
    )


def downgrade() -> None:
    """Drop email_send_log table and enum type."""

    op.execute("DROP TABLE IF EXISTS email_send_log CASCADE;")
    op.execute("DROP TYPE IF EXISTS email_send_status;")
