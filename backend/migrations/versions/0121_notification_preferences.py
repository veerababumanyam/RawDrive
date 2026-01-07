"""Create notification_preferences table for notifications microservice.

This migration creates the notification_preferences table that stores user
notification preferences for multi-channel delivery control.

The table supports:
- Multi-tenant isolation via workspace_id
- User-level and workspace-level default preferences
- Per-category preference controls (gallery_activity, billing, marketing, etc.)
- Per-channel opt-in/opt-out (email, sms, in_app, push)
- Quiet hours / Do-Not-Disturb schedules
- Digest frequency preferences (instant, daily, weekly)
- Language preferences for localized notifications

Feature: Notifications & Communication Microservice
Task: T013 - Create notification_preferences table migration
Revision ID: 0121
Revises: 0120
Create Date: 2026-01-07
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0121"
down_revision = "0120"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create notification_preferences table with supporting types and indexes."""

    # =========================================================================
    # 1. Create notification_digest_frequency enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE notification_digest_frequency AS ENUM (
                'instant',
                'hourly',
                'daily',
                'weekly',
                'never'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create notification_preferences table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_preferences (
            -- Primary key: UUID for preference record identification
            preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant scoping (required for workspace isolation)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- User association (NULL = workspace-level defaults)
            user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,

            -- =========================================================================
            -- CHANNEL PREFERENCES
            -- =========================================================================

            -- Email notification preferences
            email_enabled BOOLEAN NOT NULL DEFAULT TRUE,

            -- SMS notification preferences
            sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,

            -- In-app notification preferences
            in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,

            -- Push notification preferences
            push_enabled BOOLEAN NOT NULL DEFAULT TRUE,

            -- =========================================================================
            -- CATEGORY PREFERENCES
            -- =========================================================================

            -- Gallery activity notifications (published, shared, comments, downloads)
            gallery_activity_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            gallery_activity_channels notification_channel[] DEFAULT ARRAY['email', 'in_app']::notification_channel[],
            gallery_activity_frequency notification_digest_frequency DEFAULT 'instant',

            -- Client interaction notifications (RSVP, favorites, messages)
            client_interactions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            client_interactions_channels notification_channel[] DEFAULT ARRAY['email', 'in_app']::notification_channel[],
            client_interactions_frequency notification_digest_frequency DEFAULT 'instant',

            -- System alerts (security, maintenance, account)
            system_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            system_alerts_channels notification_channel[] DEFAULT ARRAY['email', 'in_app']::notification_channel[],
            -- System alerts are always instant (no digest option)

            -- Billing notifications (payments, invoices, subscription)
            billing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            billing_channels notification_channel[] DEFAULT ARRAY['email']::notification_channel[],
            -- Billing notifications are always instant (no digest option)

            -- Marketing notifications (newsletters, promotions, product updates)
            marketing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            marketing_channels notification_channel[] DEFAULT ARRAY['email']::notification_channel[],
            marketing_frequency notification_digest_frequency DEFAULT 'weekly',

            -- Invitation notifications (RSVP, check-ins, guest updates)
            invitation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            invitation_channels notification_channel[] DEFAULT ARRAY['email', 'in_app']::notification_channel[],
            invitation_frequency notification_digest_frequency DEFAULT 'instant',

            -- =========================================================================
            -- QUIET HOURS / DO-NOT-DISTURB
            -- =========================================================================

            -- Enable quiet hours (no notifications during specified times)
            quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,

            -- Quiet hours start time (local time, 24h format)
            quiet_hours_start TIME,

            -- Quiet hours end time (local time, 24h format)
            quiet_hours_end TIME,

            -- Timezone for quiet hours calculation
            timezone VARCHAR(50) DEFAULT 'UTC',

            -- Days of week when quiet hours apply (0=Sunday, 6=Saturday)
            quiet_hours_days INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],

            -- =========================================================================
            -- DIGEST PREFERENCES
            -- =========================================================================

            -- Preferred time for daily digest delivery (local time)
            daily_digest_time TIME DEFAULT '09:00',

            -- Preferred day for weekly digest (0=Sunday, 6=Saturday)
            weekly_digest_day INTEGER DEFAULT 1,

            -- =========================================================================
            -- LOCALIZATION
            -- =========================================================================

            -- Preferred language for notifications (ISO 639-1)
            language VARCHAR(5) DEFAULT 'en',

            -- =========================================================================
            -- TRANSACTIONAL OVERRIDES
            -- =========================================================================

            -- Even with channels disabled, transactional notifications can be sent
            -- This tracks if user has explicitly opted out of specific transactional types
            transactional_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,

            -- =========================================================================
            -- UNSUBSCRIBE TRACKING
            -- =========================================================================

            -- Global unsubscribe (user has unsubscribed from all non-transactional)
            global_unsubscribe BOOLEAN NOT NULL DEFAULT FALSE,
            global_unsubscribe_at TIMESTAMPTZ,

            -- Unsubscribe token for email links
            unsubscribe_token UUID DEFAULT gen_random_uuid(),

            -- =========================================================================
            -- METADATA
            -- =========================================================================

            -- Additional preference settings (custom rules, filters, etc.)
            metadata JSONB DEFAULT '{}'::JSONB,

            -- Source of last preference update
            last_updated_source VARCHAR(50) DEFAULT 'user'
                CHECK (last_updated_source IN (
                    'user',
                    'admin',
                    'api',
                    'migration',
                    'unsubscribe_link',
                    'email_preferences'
                )),

            -- =========================================================================
            -- TIMESTAMPS
            -- =========================================================================

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- =========================================================================
            -- CONSTRAINTS
            -- =========================================================================

            -- Unique constraint: one preference record per user per workspace
            -- For workspace defaults, user_id is NULL
            CONSTRAINT notification_preferences_user_workspace_unique
                UNIQUE NULLS NOT DISTINCT (workspace_id, user_id)
        );
        """
    )

    # =========================================================================
    # 3. Create indexes for common query patterns
    # =========================================================================

    # User preferences lookup (most common query)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
        ON notification_preferences(user_id, workspace_id)
        WHERE user_id IS NOT NULL;
        """
    )

    # Workspace defaults lookup (user_id IS NULL)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_preferences_workspace_defaults
        ON notification_preferences(workspace_id)
        WHERE user_id IS NULL;
        """
    )

    # Unsubscribe token lookup (for email unsubscribe links)
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_preferences_unsubscribe_token
        ON notification_preferences(unsubscribe_token);
        """
    )

    # Marketing enabled lookup (for campaign targeting)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_preferences_marketing
        ON notification_preferences(workspace_id, user_id)
        WHERE marketing_enabled = TRUE AND global_unsubscribe = FALSE;
        """
    )

    # Global unsubscribe tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_preferences_unsubscribed
        ON notification_preferences(workspace_id, global_unsubscribe_at DESC)
        WHERE global_unsubscribe = TRUE;
        """
    )

    # Email enabled lookup (for email delivery filtering)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_preferences_email_enabled
        ON notification_preferences(user_id)
        WHERE email_enabled = TRUE AND global_unsubscribe = FALSE;
        """
    )

    # Language-based queries (for localized notifications)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_preferences_language
        ON notification_preferences(language, workspace_id);
        """
    )

    # Timezone-based queries (for quiet hours processing)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_preferences_timezone
        ON notification_preferences(timezone)
        WHERE quiet_hours_enabled = TRUE;
        """
    )

    # =========================================================================
    # 4. Create trigger for updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
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
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_preferences_updated_at'
            ) THEN
                CREATE TRIGGER trg_notification_preferences_updated_at
                BEFORE UPDATE ON notification_preferences
                FOR EACH ROW
                EXECUTE FUNCTION update_notification_preferences_updated_at();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 5. Create trigger to handle global unsubscribe
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION handle_notification_global_unsubscribe()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Auto-set timestamp when global unsubscribe is enabled
            IF NEW.global_unsubscribe = TRUE AND OLD.global_unsubscribe = FALSE THEN
                NEW.global_unsubscribe_at = COALESCE(NEW.global_unsubscribe_at, NOW());
                -- Disable marketing when globally unsubscribed
                NEW.marketing_enabled = FALSE;
            END IF;

            -- Clear timestamp when global unsubscribe is disabled
            IF NEW.global_unsubscribe = FALSE AND OLD.global_unsubscribe = TRUE THEN
                NEW.global_unsubscribe_at = NULL;
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
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_preferences_global_unsubscribe'
            ) THEN
                CREATE TRIGGER trg_notification_preferences_global_unsubscribe
                BEFORE UPDATE OF global_unsubscribe ON notification_preferences
                FOR EACH ROW
                EXECUTE FUNCTION handle_notification_global_unsubscribe();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 6. Create trigger to regenerate unsubscribe token
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION regenerate_notification_unsubscribe_token()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Regenerate token when global unsubscribe is toggled off
            IF NEW.global_unsubscribe = FALSE AND OLD.global_unsubscribe = TRUE THEN
                NEW.unsubscribe_token = gen_random_uuid();
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
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_preferences_regenerate_token'
            ) THEN
                CREATE TRIGGER trg_notification_preferences_regenerate_token
                BEFORE UPDATE OF global_unsubscribe ON notification_preferences
                FOR EACH ROW
                EXECUTE FUNCTION regenerate_notification_unsubscribe_token();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 7. Add check constraints for data validation
    # =========================================================================

    # Quiet hours validation: start and end must both be set or both be null
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_quiet_hours'
            ) THEN
                ALTER TABLE notification_preferences
                ADD CONSTRAINT check_notification_quiet_hours
                CHECK (
                    (quiet_hours_start IS NULL AND quiet_hours_end IS NULL) OR
                    (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)
                );
            END IF;
        END $$;
        """
    )

    # Weekly digest day validation (0-6)
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_weekly_digest_day'
            ) THEN
                ALTER TABLE notification_preferences
                ADD CONSTRAINT check_notification_weekly_digest_day
                CHECK (weekly_digest_day >= 0 AND weekly_digest_day <= 6);
            END IF;
        END $$;
        """
    )

    # Quiet hours days validation (all values 0-6)
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_quiet_hours_days'
            ) THEN
                ALTER TABLE notification_preferences
                ADD CONSTRAINT check_notification_quiet_hours_days
                CHECK (
                    quiet_hours_days IS NULL OR
                    (
                        array_length(quiet_hours_days, 1) <= 7 AND
                        quiet_hours_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]
                    )
                );
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 8. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE notification_preferences IS
        'User notification preferences for multi-channel delivery control. Supports per-category settings, quiet hours, and digest frequencies.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.user_id IS
        'NULL for workspace-level defaults, non-NULL for user-specific preferences. Users inherit workspace defaults if no preference record exists.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.email_enabled IS
        'Global email channel toggle. If FALSE, no email notifications (except transactional if transactional_email_enabled is TRUE).';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.gallery_activity_channels IS
        'Channels for gallery notifications. Empty array = disabled. Uses notification_channel enum from notification_events.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.gallery_activity_frequency IS
        'Delivery frequency: instant (real-time), hourly, daily, weekly digests, or never.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.quiet_hours_enabled IS
        'If TRUE, notifications are held during quiet hours and delivered after. Does not apply to transactional notifications.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.quiet_hours_days IS
        'Days when quiet hours apply. Array of integers 0-6 (Sunday-Saturday). NULL or empty = all days.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.timezone IS
        'IANA timezone for quiet hours and digest scheduling (e.g., America/New_York, Asia/Kolkata).';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.transactional_email_enabled IS
        'If FALSE, even transactional emails are blocked. Use with caution - may affect critical notifications like password reset.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.global_unsubscribe IS
        'If TRUE, user has globally unsubscribed from all non-transactional notifications. Marketing is auto-disabled.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.unsubscribe_token IS
        'Unique token for one-click unsubscribe links in emails. Regenerated when user resubscribes.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.last_updated_source IS
        'Source of the last preference update: user (settings UI), admin, api, migration, unsubscribe_link, email_preferences.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_preferences.metadata IS
        'Additional preference settings as JSONB. Can store custom filters, blocked event types, sender preferences, etc.';
        """
    )


def downgrade() -> None:
    """Drop notification_preferences table and related objects."""

    # Drop triggers and functions
    op.execute("DROP TRIGGER IF EXISTS trg_notification_preferences_regenerate_token ON notification_preferences;")
    op.execute("DROP FUNCTION IF EXISTS regenerate_notification_unsubscribe_token();")
    op.execute("DROP TRIGGER IF EXISTS trg_notification_preferences_global_unsubscribe ON notification_preferences;")
    op.execute("DROP FUNCTION IF EXISTS handle_notification_global_unsubscribe();")
    op.execute("DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON notification_preferences;")
    op.execute("DROP FUNCTION IF EXISTS update_notification_preferences_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_notification_preferences_timezone;")
    op.execute("DROP INDEX IF EXISTS idx_notification_preferences_language;")
    op.execute("DROP INDEX IF EXISTS idx_notification_preferences_email_enabled;")
    op.execute("DROP INDEX IF EXISTS idx_notification_preferences_unsubscribed;")
    op.execute("DROP INDEX IF EXISTS idx_notification_preferences_marketing;")
    op.execute("DROP INDEX IF EXISTS idx_notification_preferences_unsubscribe_token;")
    op.execute("DROP INDEX IF EXISTS idx_notification_preferences_workspace_defaults;")
    op.execute("DROP INDEX IF EXISTS idx_notification_preferences_user;")

    # Drop table (constraints are dropped automatically)
    op.execute("DROP TABLE IF EXISTS notification_preferences CASCADE;")

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS notification_digest_frequency;")
