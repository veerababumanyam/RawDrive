"""Create notification_events table for notifications microservice.

This migration creates the notification_events table that stores all notification
events triggered by the system. The table supports:
- Multi-channel delivery (email, sms, in_app, push)
- Multi-tenant isolation via workspace_id
- Event categorization (gallery_activity, client_interactions, system_alerts, billing, marketing)
- Priority levels for processing order
- Status tracking through the notification lifecycle
- Idempotency key for deduplication

Feature: Notifications & Communication Microservice
Revision ID: 0119
Revises: 0118
Create Date: 2026-01-07
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0119"
down_revision = "0118"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create notification_events table with supporting types and indexes."""

    # =========================================================================
    # 1. Create notification_channel enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE notification_channel AS ENUM (
                'email',
                'sms',
                'in_app',
                'push'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create notification_category enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE notification_category AS ENUM (
                'gallery_activity',
                'client_interactions',
                'system_alerts',
                'billing',
                'marketing',
                'invitation'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 3. Create notification_priority enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE notification_priority AS ENUM (
                'low',
                'normal',
                'high',
                'urgent'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 4. Create notification_event_status enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE notification_event_status AS ENUM (
                'pending',
                'processing',
                'sent',
                'delivered',
                'failed',
                'cancelled',
                'skipped'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 5. Create notification_events table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_events (
            event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Recipient information
            recipient_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            recipient_email VARCHAR(320),
            recipient_phone VARCHAR(20),

            -- Event classification
            event_type VARCHAR(100) NOT NULL,
            category notification_category NOT NULL,
            channel notification_channel NOT NULL,
            priority notification_priority NOT NULL DEFAULT 'normal',

            -- Template and content
            template_id UUID,
            template_code VARCHAR(100),
            subject VARCHAR(500),
            payload JSONB NOT NULL DEFAULT '{}',

            -- Processing status
            status notification_event_status NOT NULL DEFAULT 'pending',
            error_message TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,

            -- Tracking
            idempotency_key VARCHAR(255),
            correlation_id UUID,
            source_service VARCHAR(50),

            -- Scheduling
            scheduled_for TIMESTAMPTZ,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            processed_at TIMESTAMPTZ,
            delivered_at TIMESTAMPTZ
        );
        """
    )

    # =========================================================================
    # 6. Create index for workspace + status queries (processing queue)
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_events_workspace_status
        ON notification_events(workspace_id, status, created_at DESC);
        """
    )

    # =========================================================================
    # 7. Create index for pending events (worker queue)
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_events_pending
        ON notification_events(status, priority DESC, created_at)
        WHERE status = 'pending';
        """
    )

    # =========================================================================
    # 8. Create index for scheduled notifications
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_events_scheduled
        ON notification_events(scheduled_for)
        WHERE scheduled_for IS NOT NULL AND status = 'pending';
        """
    )

    # =========================================================================
    # 9. Create index for recipient user lookups
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_events_recipient_user
        ON notification_events(recipient_user_id, created_at DESC)
        WHERE recipient_user_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 10. Create unique index for idempotency
    # =========================================================================
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_events_idempotency
        ON notification_events(idempotency_key)
        WHERE idempotency_key IS NOT NULL;
        """
    )

    # =========================================================================
    # 11. Create index for correlation lookups
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_events_correlation
        ON notification_events(correlation_id)
        WHERE correlation_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 12. Create index for event type queries
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_events_type
        ON notification_events(event_type, workspace_id);
        """
    )

    # =========================================================================
    # 13. Create index for category-based queries
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_events_category
        ON notification_events(category, workspace_id, created_at DESC);
        """
    )

    # =========================================================================
    # 14. Add check constraint for retry count
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_retry_count'
            ) THEN
                ALTER TABLE notification_events
                ADD CONSTRAINT check_notification_retry_count
                CHECK (retry_count >= 0 AND retry_count <= max_retries);
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 15. Add check constraint for recipient (must have at least one)
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_recipient'
            ) THEN
                ALTER TABLE notification_events
                ADD CONSTRAINT check_notification_recipient
                CHECK (
                    recipient_user_id IS NOT NULL OR
                    recipient_email IS NOT NULL OR
                    recipient_phone IS NOT NULL
                );
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 16. Create trigger for updated_at
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_notification_events_updated_at()
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
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_events_updated_at'
            ) THEN
                CREATE TRIGGER trg_notification_events_updated_at
                BEFORE UPDATE ON notification_events
                FOR EACH ROW
                EXECUTE FUNCTION update_notification_events_updated_at();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 17. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE notification_events IS
        'Central event table for the notifications microservice. Stores all notification events with multi-channel support.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_events.event_type IS
        'Specific event type (e.g., gallery.published, billing.payment_failed, rsvp.received)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_events.category IS
        'High-level category for preference matching (gallery_activity, billing, etc.)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_events.payload IS
        'JSONB containing template variables and additional context for rendering';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_events.idempotency_key IS
        'Unique key to prevent duplicate notifications from the same trigger';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_events.correlation_id IS
        'Links related notifications (e.g., all channels for one event)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_events.scheduled_for IS
        'If set, notification will not be processed until this timestamp';
        """
    )


def downgrade() -> None:
    """Drop notification_events table and related types."""

    # Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS trg_notification_events_updated_at ON notification_events;")
    op.execute("DROP FUNCTION IF EXISTS update_notification_events_updated_at();")

    # Drop table
    op.execute("DROP TABLE IF EXISTS notification_events CASCADE;")

    # Drop enum types (only if not used elsewhere)
    op.execute("DROP TYPE IF EXISTS notification_event_status;")
    op.execute("DROP TYPE IF EXISTS notification_priority;")
    op.execute("DROP TYPE IF EXISTS notification_category;")
    op.execute("DROP TYPE IF EXISTS notification_channel;")
