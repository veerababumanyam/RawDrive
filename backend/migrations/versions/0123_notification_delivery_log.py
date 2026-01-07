"""Create notification_delivery_log table for notifications microservice.

This migration creates the notification_delivery_log table that tracks all
delivery attempts for notifications across channels.

The table supports:
- Multi-tenant isolation via workspace_id
- Per-attempt tracking with status and error details
- Provider-specific response storage (SendGrid, Twilio, etc.)
- Webhook event tracking (delivered, opened, clicked, bounced, etc.)
- Retry history and timing analytics
- Compliance and audit requirements

Feature: Notifications & Communication Microservice
Task: T014 - Create notification_delivery_log table migration
Revision ID: 0123
Revises: 0122
Create Date: 2026-01-07
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0123"
down_revision = "0122"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create notification_delivery_log table with supporting types and indexes."""

    # =========================================================================
    # 1. Create notification_delivery_status enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE notification_delivery_status AS ENUM (
                'pending',
                'queued',
                'sent',
                'delivered',
                'opened',
                'clicked',
                'bounced',
                'failed',
                'rejected',
                'unsubscribed',
                'spam_reported',
                'deferred'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create notification_provider enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE notification_provider AS ENUM (
                'sendgrid',
                'twilio',
                'firebase',
                'internal',
                'mock'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 3. Create notification_delivery_log table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_delivery_log (
            -- Primary key: UUID for log entry identification
            log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant scoping (required for workspace isolation)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Link to the notification event that triggered this delivery
            event_id UUID NOT NULL REFERENCES notification_events(event_id) ON DELETE CASCADE,

            -- =========================================================================
            -- DELIVERY DETAILS
            -- =========================================================================

            -- Channel used for this delivery attempt
            channel notification_channel NOT NULL,

            -- Provider used for delivery
            provider notification_provider NOT NULL,

            -- Current delivery status
            status notification_delivery_status NOT NULL DEFAULT 'pending',

            -- Attempt number for this event/channel combination (starts at 1)
            attempt_number INTEGER NOT NULL DEFAULT 1,

            -- =========================================================================
            -- RECIPIENT INFORMATION
            -- =========================================================================

            -- Recipient email (for email channel)
            recipient_email VARCHAR(320),

            -- Recipient phone (for SMS channel)
            recipient_phone VARCHAR(20),

            -- Recipient user ID (for in-app/push channels)
            recipient_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Recipient device token (for push notifications)
            recipient_device_token TEXT,

            -- =========================================================================
            -- PROVIDER RESPONSE
            -- =========================================================================

            -- External message ID from provider (e.g., SendGrid message_id)
            provider_message_id VARCHAR(255),

            -- HTTP status code from provider API
            provider_http_status INTEGER,

            -- Raw response from provider (for debugging)
            provider_response JSONB DEFAULT '{}'::JSONB,

            -- Error code from provider (if applicable)
            provider_error_code VARCHAR(100),

            -- Error message from provider (if applicable)
            provider_error_message TEXT,

            -- =========================================================================
            -- WEBHOOK TRACKING
            -- =========================================================================

            -- Webhook event type that updated this record
            last_webhook_event VARCHAR(50),

            -- Timestamp of last webhook event
            last_webhook_at TIMESTAMPTZ,

            -- Full webhook event history (for audit)
            webhook_events JSONB DEFAULT '[]'::JSONB,

            -- =========================================================================
            -- ENGAGEMENT METRICS
            -- =========================================================================

            -- When the notification was opened (email/push)
            opened_at TIMESTAMPTZ,

            -- Number of times opened
            open_count INTEGER DEFAULT 0,

            -- When a link was first clicked
            clicked_at TIMESTAMPTZ,

            -- Number of clicks
            click_count INTEGER DEFAULT 0,

            -- Links clicked (for analytics)
            clicked_links JSONB DEFAULT '[]'::JSONB,

            -- =========================================================================
            -- BOUNCE/FAILURE DETAILS
            -- =========================================================================

            -- Bounce type (hard, soft, block)
            bounce_type VARCHAR(20),

            -- Bounce/failure reason
            bounce_reason TEXT,

            -- Whether the recipient was marked as invalid
            recipient_invalidated BOOLEAN DEFAULT FALSE,

            -- =========================================================================
            -- TIMING
            -- =========================================================================

            -- When this log entry was created
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- When delivery was queued to provider
            queued_at TIMESTAMPTZ,

            -- When provider acknowledged send
            sent_at TIMESTAMPTZ,

            -- When delivery was confirmed
            delivered_at TIMESTAMPTZ,

            -- When delivery failed (final)
            failed_at TIMESTAMPTZ,

            -- Last status update timestamp
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- =========================================================================
            -- COST TRACKING
            -- =========================================================================

            -- Cost of this delivery (in cents USD)
            cost_cents INTEGER DEFAULT 0,

            -- Cost breakdown by provider
            cost_metadata JSONB DEFAULT '{}'::JSONB,

            -- =========================================================================
            -- CORRELATION
            -- =========================================================================

            -- Correlation ID for linking related deliveries
            correlation_id UUID,

            -- Request ID from the API call that triggered this
            request_id UUID,

            -- =========================================================================
            -- CONSTRAINTS
            -- =========================================================================

            -- One log entry per event/channel/attempt combination
            CONSTRAINT notification_delivery_log_event_channel_attempt_unique
                UNIQUE (event_id, channel, attempt_number)
        );
        """
    )

    # =========================================================================
    # 4. Create indexes for common query patterns
    # =========================================================================

    # Workspace + event lookup (most common - getting delivery status for an event)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_event
        ON notification_delivery_log(event_id, channel, attempt_number DESC);
        """
    )

    # Workspace-level queries with status filtering
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_workspace_status
        ON notification_delivery_log(workspace_id, status, created_at DESC);
        """
    )

    # Provider message ID lookup (for webhook processing)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_provider_message
        ON notification_delivery_log(provider_message_id)
        WHERE provider_message_id IS NOT NULL;
        """
    )

    # Failed deliveries (for retry processing)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_failed
        ON notification_delivery_log(workspace_id, created_at DESC)
        WHERE status IN ('failed', 'bounced', 'rejected');
        """
    )

    # Pending/queued deliveries (for worker queue)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_pending
        ON notification_delivery_log(status, created_at)
        WHERE status IN ('pending', 'queued', 'deferred');
        """
    )

    # Recipient email lookup (for bounce/complaint handling)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_recipient_email
        ON notification_delivery_log(recipient_email, created_at DESC)
        WHERE recipient_email IS NOT NULL;
        """
    )

    # Recipient user lookup (for user notification history)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_recipient_user
        ON notification_delivery_log(recipient_user_id, created_at DESC)
        WHERE recipient_user_id IS NOT NULL;
        """
    )

    # Channel-based queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_channel
        ON notification_delivery_log(channel, workspace_id, created_at DESC);
        """
    )

    # Provider-based queries (for provider analytics)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_provider
        ON notification_delivery_log(provider, status, created_at DESC);
        """
    )

    # Correlation ID lookup (for tracing related deliveries)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_correlation
        ON notification_delivery_log(correlation_id)
        WHERE correlation_id IS NOT NULL;
        """
    )

    # Engagement metrics (opened notifications)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_opened
        ON notification_delivery_log(workspace_id, opened_at DESC)
        WHERE opened_at IS NOT NULL;
        """
    )

    # Engagement metrics (clicked notifications)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_clicked
        ON notification_delivery_log(workspace_id, clicked_at DESC)
        WHERE clicked_at IS NOT NULL;
        """
    )

    # Date-based partitioning support (for efficient time-range queries)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_created_at
        ON notification_delivery_log(created_at DESC, workspace_id);
        """
    )

    # Invalidated recipients (for suppression list building)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_invalidated
        ON notification_delivery_log(recipient_email)
        WHERE recipient_invalidated = TRUE;
        """
    )

    # =========================================================================
    # 5. Create trigger for updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_notification_delivery_log_updated_at()
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
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_delivery_log_updated_at'
            ) THEN
                CREATE TRIGGER trg_notification_delivery_log_updated_at
                BEFORE UPDATE ON notification_delivery_log
                FOR EACH ROW
                EXECUTE FUNCTION update_notification_delivery_log_updated_at();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 6. Create trigger to update notification_events status
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION sync_notification_event_status()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Update the parent notification_events record when delivery status changes
            IF NEW.status = 'delivered' THEN
                UPDATE notification_events
                SET status = 'delivered',
                    delivered_at = COALESCE(NEW.delivered_at, NOW()),
                    updated_at = NOW()
                WHERE event_id = NEW.event_id
                  AND status NOT IN ('delivered', 'failed', 'cancelled');
            ELSIF NEW.status IN ('bounced', 'failed', 'rejected') THEN
                -- Only mark as failed if all delivery attempts for this event have failed
                IF NOT EXISTS (
                    SELECT 1 FROM notification_delivery_log
                    WHERE event_id = NEW.event_id
                      AND log_id != NEW.log_id
                      AND status NOT IN ('bounced', 'failed', 'rejected', 'spam_reported')
                ) THEN
                    UPDATE notification_events
                    SET status = 'failed',
                        error_message = COALESCE(NEW.provider_error_message, NEW.bounce_reason),
                        updated_at = NOW()
                    WHERE event_id = NEW.event_id
                      AND status NOT IN ('delivered', 'cancelled');
                END IF;
            ELSIF NEW.status = 'sent' THEN
                UPDATE notification_events
                SET status = 'sent',
                    processed_at = COALESCE(NEW.sent_at, NOW()),
                    updated_at = NOW()
                WHERE event_id = NEW.event_id
                  AND status IN ('pending', 'processing');
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_delivery_log_sync_event'
            ) THEN
                CREATE TRIGGER trg_notification_delivery_log_sync_event
                AFTER INSERT OR UPDATE OF status ON notification_delivery_log
                FOR EACH ROW
                EXECUTE FUNCTION sync_notification_event_status();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 7. Create trigger to track webhook events
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION append_notification_webhook_event()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Append webhook event to history when last_webhook_event changes
            IF NEW.last_webhook_event IS NOT NULL AND
               (OLD.last_webhook_event IS NULL OR NEW.last_webhook_event != OLD.last_webhook_event) THEN
                NEW.webhook_events = NEW.webhook_events || jsonb_build_object(
                    'event', NEW.last_webhook_event,
                    'timestamp', COALESCE(NEW.last_webhook_at, NOW()),
                    'status', NEW.status
                );
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_delivery_log_webhook'
            ) THEN
                CREATE TRIGGER trg_notification_delivery_log_webhook
                BEFORE UPDATE OF last_webhook_event ON notification_delivery_log
                FOR EACH ROW
                EXECUTE FUNCTION append_notification_webhook_event();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 8. Create trigger for engagement tracking
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION track_notification_engagement()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Set opened_at timestamp on first open
            IF NEW.status = 'opened' AND OLD.opened_at IS NULL THEN
                NEW.opened_at = COALESCE(NEW.last_webhook_at, NOW());
            END IF;

            -- Increment open count
            IF NEW.status = 'opened' THEN
                NEW.open_count = COALESCE(OLD.open_count, 0) + 1;
            END IF;

            -- Set clicked_at timestamp on first click
            IF NEW.status = 'clicked' AND OLD.clicked_at IS NULL THEN
                NEW.clicked_at = COALESCE(NEW.last_webhook_at, NOW());
            END IF;

            -- Increment click count
            IF NEW.status = 'clicked' THEN
                NEW.click_count = COALESCE(OLD.click_count, 0) + 1;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_delivery_log_engagement'
            ) THEN
                CREATE TRIGGER trg_notification_delivery_log_engagement
                BEFORE UPDATE OF status ON notification_delivery_log
                FOR EACH ROW
                WHEN (NEW.status IN ('opened', 'clicked'))
                EXECUTE FUNCTION track_notification_engagement();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 9. Add check constraints for data validation
    # =========================================================================

    # Attempt number must be positive
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_delivery_attempt'
            ) THEN
                ALTER TABLE notification_delivery_log
                ADD CONSTRAINT check_notification_delivery_attempt
                CHECK (attempt_number >= 1);
            END IF;
        END $$;
        """
    )

    # Recipient must be provided based on channel
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_delivery_recipient'
            ) THEN
                ALTER TABLE notification_delivery_log
                ADD CONSTRAINT check_notification_delivery_recipient
                CHECK (
                    (channel = 'email' AND recipient_email IS NOT NULL) OR
                    (channel = 'sms' AND recipient_phone IS NOT NULL) OR
                    (channel = 'in_app' AND recipient_user_id IS NOT NULL) OR
                    (channel = 'push' AND (recipient_device_token IS NOT NULL OR recipient_user_id IS NOT NULL))
                );
            END IF;
        END $$;
        """
    )

    # Cost cannot be negative
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_delivery_cost'
            ) THEN
                ALTER TABLE notification_delivery_log
                ADD CONSTRAINT check_notification_delivery_cost
                CHECK (cost_cents >= 0);
            END IF;
        END $$;
        """
    )

    # Open count cannot be negative
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_delivery_open_count'
            ) THEN
                ALTER TABLE notification_delivery_log
                ADD CONSTRAINT check_notification_delivery_open_count
                CHECK (open_count >= 0);
            END IF;
        END $$;
        """
    )

    # Click count cannot be negative
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_delivery_click_count'
            ) THEN
                ALTER TABLE notification_delivery_log
                ADD CONSTRAINT check_notification_delivery_click_count
                CHECK (click_count >= 0);
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 10. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE notification_delivery_log IS
        'Tracks all delivery attempts for notifications. Supports multi-channel delivery, retry tracking, webhook events, and engagement metrics.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.event_id IS
        'Reference to the notification event that triggered this delivery attempt.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.provider IS
        'The delivery provider used (sendgrid, twilio, firebase, internal, mock).';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.status IS
        'Current delivery status. Updated via webhooks for async delivery confirmation.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.attempt_number IS
        'Attempt number for this event/channel combination. Starts at 1, increments with retries.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.provider_message_id IS
        'External message ID from the provider (e.g., SendGrid sg_message_id). Used for webhook correlation.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.provider_response IS
        'Full JSON response from the provider API. Useful for debugging delivery issues.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.webhook_events IS
        'Array of webhook events received for this delivery: [{event, timestamp, status}, ...]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.bounce_type IS
        'Type of bounce (hard, soft, block). Hard bounces should invalidate the recipient.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.recipient_invalidated IS
        'If TRUE, the recipient was marked as invalid (hard bounce, spam complaint). Future sends should be blocked.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.cost_cents IS
        'Cost of this delivery attempt in cents USD. Used for billing and cost analytics.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.clicked_links IS
        'Array of clicked links: [{url, clicked_at, user_agent}, ...]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_delivery_log.correlation_id IS
        'Links related delivery logs (e.g., multi-channel sends for the same event).';
        """
    )


def downgrade() -> None:
    """Drop notification_delivery_log table and related objects."""

    # Drop triggers and functions
    op.execute("DROP TRIGGER IF EXISTS trg_notification_delivery_log_engagement ON notification_delivery_log;")
    op.execute("DROP FUNCTION IF EXISTS track_notification_engagement();")
    op.execute("DROP TRIGGER IF EXISTS trg_notification_delivery_log_webhook ON notification_delivery_log;")
    op.execute("DROP FUNCTION IF EXISTS append_notification_webhook_event();")
    op.execute("DROP TRIGGER IF EXISTS trg_notification_delivery_log_sync_event ON notification_delivery_log;")
    op.execute("DROP FUNCTION IF EXISTS sync_notification_event_status();")
    op.execute("DROP TRIGGER IF EXISTS trg_notification_delivery_log_updated_at ON notification_delivery_log;")
    op.execute("DROP FUNCTION IF EXISTS update_notification_delivery_log_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_invalidated;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_created_at;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_clicked;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_opened;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_correlation;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_provider;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_channel;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_recipient_user;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_recipient_email;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_pending;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_failed;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_provider_message;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_notification_delivery_log_event;")

    # Drop table (constraints are dropped automatically)
    op.execute("DROP TABLE IF EXISTS notification_delivery_log CASCADE;")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS notification_provider;")
    op.execute("DROP TYPE IF EXISTS notification_delivery_status;")
