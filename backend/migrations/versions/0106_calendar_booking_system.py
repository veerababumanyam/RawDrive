"""Create calendar and booking system tables.

This migration creates the tables for the Calendar Integrations & Booking Management feature:
- calendar_integrations: External calendar connections (Google, Microsoft)
- service_types: Photography service types with pricing
- availability_settings: Working hours configuration
- availability_overrides: Date-specific availability changes
- bookings: Client appointments and sessions
- slot_holds: Temporary slot reservations
- booking_policies: Cancellation and reminder policies

Feature: Calendar Integrations & Booking Management
Revision ID: 0106
Revises: 0105
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0106"
down_revision = "0105"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create calendar and booking system tables."""

    # =========================================================================
    # CREATE CALENDAR_INTEGRATIONS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS calendar_integrations (
            integration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Provider identification
            provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'microsoft')),
            account_email VARCHAR(255) NOT NULL,
            display_name VARCHAR(200),

            -- External calendar reference
            external_calendar_id VARCHAR(500) NOT NULL,
            external_calendar_name VARCHAR(255),

            -- Connection status
            status VARCHAR(20) NOT NULL DEFAULT 'connected'
                CHECK (status IN ('connected', 'disconnected', 'needs_reauth', 'error')),
            sync_direction VARCHAR(20) NOT NULL DEFAULT 'bidirectional'
                CHECK (sync_direction IN ('read_only', 'write_only', 'bidirectional')),
            include_in_availability BOOLEAN DEFAULT TRUE,

            -- OAuth tokens (encrypted)
            access_token_encrypted TEXT,
            refresh_token_encrypted TEXT,
            token_expires_at TIMESTAMPTZ,

            -- Sync tracking
            last_sync_at TIMESTAMPTZ,
            last_sync_error TEXT,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- Unique constraint: one calendar per workspace per provider account
            UNIQUE(workspace_id, provider, external_calendar_id)
        );
    """)

    # Indexes for calendar_integrations
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_calendar_integrations_workspace
        ON calendar_integrations(workspace_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_calendar_integrations_user
        ON calendar_integrations(user_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_calendar_integrations_status
        ON calendar_integrations(status)
        WHERE status != 'disconnected';
    """)

    # =========================================================================
    # CREATE SERVICE_TYPES TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS service_types (
            service_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Service details
            name VARCHAR(200) NOT NULL,
            description TEXT,

            -- Duration
            duration INT NOT NULL CHECK (duration >= 15 AND duration <= 1440),
            duration_unit VARCHAR(10) NOT NULL DEFAULT 'minutes'
                CHECK (duration_unit IN ('minutes', 'hours')),

            -- Pricing
            price_cents INT NOT NULL CHECK (price_cents >= 0),
            currency VARCHAR(3) NOT NULL DEFAULT 'USD',
            deposit_cents INT NOT NULL DEFAULT 0 CHECK (deposit_cents >= 0),

            -- Display settings
            is_active BOOLEAN DEFAULT TRUE,
            display_order INT DEFAULT 0,
            color VARCHAR(7),

            -- Location settings
            location VARCHAR(500),
            client_location_allowed BOOLEAN DEFAULT FALSE,
            max_per_day INT,

            -- Notes
            public_notes TEXT,
            private_notes TEXT,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
    """)

    # Indexes for service_types
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_service_types_workspace
        ON service_types(workspace_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_service_types_active
        ON service_types(workspace_id, is_active, display_order)
        WHERE is_active = TRUE;
    """)

    # =========================================================================
    # CREATE AVAILABILITY_SETTINGS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS availability_settings (
            settings_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Timezone
            timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',

            -- Weekly schedule (JSONB array of day availability)
            weekly_schedule JSONB NOT NULL DEFAULT '[
                {"day": "monday", "is_available": true, "time_windows": [{"start": "09:00", "end": "17:00"}]},
                {"day": "tuesday", "is_available": true, "time_windows": [{"start": "09:00", "end": "17:00"}]},
                {"day": "wednesday", "is_available": true, "time_windows": [{"start": "09:00", "end": "17:00"}]},
                {"day": "thursday", "is_available": true, "time_windows": [{"start": "09:00", "end": "17:00"}]},
                {"day": "friday", "is_available": true, "time_windows": [{"start": "09:00", "end": "17:00"}]},
                {"day": "saturday", "is_available": false, "time_windows": []},
                {"day": "sunday", "is_available": false, "time_windows": []}
            ]'::jsonb,

            -- Buffer times
            buffer_before_minutes INT NOT NULL DEFAULT 15 CHECK (buffer_before_minutes >= 0 AND buffer_before_minutes <= 120),
            buffer_after_minutes INT NOT NULL DEFAULT 15 CHECK (buffer_after_minutes >= 0 AND buffer_after_minutes <= 120),

            -- Booking constraints
            minimum_notice_hours INT NOT NULL DEFAULT 24 CHECK (minimum_notice_hours >= 0 AND minimum_notice_hours <= 720),
            max_advance_days INT NOT NULL DEFAULT 60 CHECK (max_advance_days >= 1 AND max_advance_days <= 365),
            slot_increment_minutes INT NOT NULL DEFAULT 30 CHECK (slot_increment_minutes >= 15 AND slot_increment_minutes <= 120),

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
    """)

    # =========================================================================
    # CREATE AVAILABILITY_OVERRIDES TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS availability_overrides (
            override_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Date override
            override_date DATE NOT NULL,
            is_available BOOLEAN NOT NULL,

            -- Custom time windows (only if is_available is true)
            time_windows JSONB,

            -- Reason for override
            reason VARCHAR(200),

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- One override per date per workspace
            UNIQUE(workspace_id, override_date)
        );
    """)

    # Indexes for availability_overrides
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_availability_overrides_workspace_date
        ON availability_overrides(workspace_id, override_date);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_availability_overrides_date_range
        ON availability_overrides(override_date)
        WHERE is_available = FALSE;
    """)

    # =========================================================================
    # CREATE BOOKING_POLICIES TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS booking_policies (
            policies_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Cancellation policy (JSONB)
            cancellation_policy JSONB NOT NULL DEFAULT '{
                "type": "full_refund",
                "free_cancellation_hours": 48,
                "partial_refund_percent": 50,
                "description": "Free cancellation up to 48 hours before the appointment. 50% refund for later cancellations."
            }'::jsonb,

            -- Reschedule settings
            allow_reschedule BOOLEAN DEFAULT TRUE,
            reschedule_deadline_hours INT NOT NULL DEFAULT 24 CHECK (reschedule_deadline_hours >= 0),
            max_reschedules INT NOT NULL DEFAULT 3 CHECK (max_reschedules >= 0),

            -- Payment settings
            require_deposit BOOLEAN DEFAULT TRUE,
            collect_full_payment BOOLEAN DEFAULT FALSE,

            -- Confirmation message
            confirmation_message TEXT,

            -- Reminder settings (JSONB)
            reminder_settings JSONB NOT NULL DEFAULT '{
                "send_24h_reminder": true,
                "send_1h_reminder": true,
                "send_follow_up": true,
                "follow_up_delay_hours": 24
            }'::jsonb,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
    """)

    # =========================================================================
    # CREATE BOOKINGS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            service_type_id UUID NOT NULL REFERENCES service_types(service_type_id) ON DELETE RESTRICT,

            -- Service snapshot (for historical accuracy)
            service_type_name VARCHAR(200) NOT NULL,

            -- Client information
            client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
            client_name VARCHAR(200) NOT NULL,
            client_email VARCHAR(255) NOT NULL,
            client_phone VARCHAR(50),

            -- Status
            status VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled')),
            payment_status VARCHAR(30) NOT NULL DEFAULT 'none'
                CHECK (payment_status IN ('none', 'deposit_paid', 'fully_paid', 'refunded', 'partially_refunded', 'failed')),

            -- Timing
            start_time TIMESTAMPTZ NOT NULL,
            end_time TIMESTAMPTZ NOT NULL,
            timezone VARCHAR(50) NOT NULL,

            -- Location
            location VARCHAR(500),

            -- Notes
            client_notes TEXT,
            internal_notes TEXT,

            -- Pricing
            total_price_cents INT NOT NULL CHECK (total_price_cents >= 0),
            deposit_amount_cents INT NOT NULL DEFAULT 0 CHECK (deposit_amount_cents >= 0),
            amount_paid_cents INT NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
            currency VARCHAR(3) NOT NULL DEFAULT 'USD',

            -- Payment integration
            stripe_payment_intent_id VARCHAR(255),

            -- External calendar event
            external_event_id VARCHAR(500),

            -- Booking metadata
            source VARCHAR(20) NOT NULL DEFAULT 'public_page'
                CHECK (source IN ('public_page', 'manual', 'api', 'import')),
            confirmation_code VARCHAR(20) NOT NULL UNIQUE,

            -- Cancellation tracking
            cancellation_reason VARCHAR(500),
            cancelled_at TIMESTAMPTZ,
            cancelled_by VARCHAR(20),

            -- Reschedule tracking
            rescheduled_from_id UUID REFERENCES bookings(booking_id) ON DELETE SET NULL,
            rescheduled_to_id UUID REFERENCES bookings(booking_id) ON DELETE SET NULL,

            -- Reminder tracking (JSONB)
            reminders_sent JSONB NOT NULL DEFAULT '{"reminder_24h": false, "reminder_1h": false, "follow_up": false}'::jsonb,

            -- Temporary hold expiration (for pending bookings)
            hold_expires_at TIMESTAMPTZ,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- Constraint: end_time must be after start_time
            CHECK (end_time > start_time)
        );
    """)

    # Indexes for bookings
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_workspace
        ON bookings(workspace_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_service_type
        ON bookings(service_type_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_client
        ON bookings(client_id)
        WHERE client_id IS NOT NULL;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_status
        ON bookings(workspace_id, status);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_start_time
        ON bookings(workspace_id, start_time);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_upcoming
        ON bookings(workspace_id, start_time)
        WHERE status IN ('pending', 'confirmed');
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_confirmation_code
        ON bookings(confirmation_code);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_client_email
        ON bookings(client_email, workspace_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_stripe_pi
        ON bookings(stripe_payment_intent_id)
        WHERE stripe_payment_intent_id IS NOT NULL;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bookings_hold_expires
        ON bookings(hold_expires_at)
        WHERE status = 'pending' AND hold_expires_at IS NOT NULL;
    """)

    # =========================================================================
    # CREATE SLOT_HOLDS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS slot_holds (
            hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            service_type_id UUID NOT NULL REFERENCES service_types(service_type_id) ON DELETE CASCADE,

            -- Time slot
            start_time TIMESTAMPTZ NOT NULL,
            end_time TIMESTAMPTZ NOT NULL,

            -- Client tracking
            client_email VARCHAR(255) NOT NULL,

            -- Hold status
            expires_at TIMESTAMPTZ NOT NULL,
            is_released BOOLEAN DEFAULT FALSE,
            released_at TIMESTAMPTZ,

            -- Converted booking reference
            booking_id UUID REFERENCES bookings(booking_id) ON DELETE SET NULL,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- Constraint: end_time must be after start_time
            CHECK (end_time > start_time)
        );
    """)

    # Indexes for slot_holds
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_slot_holds_workspace_time
        ON slot_holds(workspace_id, start_time, end_time)
        WHERE is_released = FALSE;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_slot_holds_expires
        ON slot_holds(expires_at)
        WHERE is_released = FALSE;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_slot_holds_client_email
        ON slot_holds(client_email, workspace_id)
        WHERE is_released = FALSE;
    """)

    # =========================================================================
    # CREATE UPDATED_AT TRIGGERS
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_calendar_booking_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Trigger for calendar_integrations
    op.execute("""
        DROP TRIGGER IF EXISTS trigger_calendar_integrations_updated_at ON calendar_integrations;
        CREATE TRIGGER trigger_calendar_integrations_updated_at
        BEFORE UPDATE ON calendar_integrations
        FOR EACH ROW
        EXECUTE FUNCTION update_calendar_booking_updated_at();
    """)

    # Trigger for service_types
    op.execute("""
        DROP TRIGGER IF EXISTS trigger_service_types_updated_at ON service_types;
        CREATE TRIGGER trigger_service_types_updated_at
        BEFORE UPDATE ON service_types
        FOR EACH ROW
        EXECUTE FUNCTION update_calendar_booking_updated_at();
    """)

    # Trigger for availability_settings
    op.execute("""
        DROP TRIGGER IF EXISTS trigger_availability_settings_updated_at ON availability_settings;
        CREATE TRIGGER trigger_availability_settings_updated_at
        BEFORE UPDATE ON availability_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_calendar_booking_updated_at();
    """)

    # Trigger for booking_policies
    op.execute("""
        DROP TRIGGER IF EXISTS trigger_booking_policies_updated_at ON booking_policies;
        CREATE TRIGGER trigger_booking_policies_updated_at
        BEFORE UPDATE ON booking_policies
        FOR EACH ROW
        EXECUTE FUNCTION update_calendar_booking_updated_at();
    """)

    # Trigger for bookings
    op.execute("""
        DROP TRIGGER IF EXISTS trigger_bookings_updated_at ON bookings;
        CREATE TRIGGER trigger_bookings_updated_at
        BEFORE UPDATE ON bookings
        FOR EACH ROW
        EXECUTE FUNCTION update_calendar_booking_updated_at();
    """)

    # =========================================================================
    # ADD TABLE COMMENTS
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE calendar_integrations IS
        'External calendar integrations (Google, Microsoft) for availability sync';
    """)

    op.execute("""
        COMMENT ON TABLE service_types IS
        'Photography service types with pricing (e.g., Portrait Session, Wedding Consultation)';
    """)

    op.execute("""
        COMMENT ON TABLE availability_settings IS
        'Working hours and booking constraints per workspace';
    """)

    op.execute("""
        COMMENT ON TABLE availability_overrides IS
        'Date-specific availability overrides (holidays, vacations)';
    """)

    op.execute("""
        COMMENT ON TABLE booking_policies IS
        'Cancellation, rescheduling, and payment policies per workspace';
    """)

    op.execute("""
        COMMENT ON TABLE bookings IS
        'Client booking/appointments with full lifecycle tracking';
    """)

    op.execute("""
        COMMENT ON TABLE slot_holds IS
        'Temporary slot reservations to prevent double-booking during checkout';
    """)


def downgrade() -> None:
    """Drop calendar and booking system tables."""

    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS trigger_bookings_updated_at ON bookings;")
    op.execute("DROP TRIGGER IF EXISTS trigger_booking_policies_updated_at ON booking_policies;")
    op.execute("DROP TRIGGER IF EXISTS trigger_availability_settings_updated_at ON availability_settings;")
    op.execute("DROP TRIGGER IF EXISTS trigger_service_types_updated_at ON service_types;")
    op.execute("DROP TRIGGER IF EXISTS trigger_calendar_integrations_updated_at ON calendar_integrations;")
    op.execute("DROP FUNCTION IF EXISTS update_calendar_booking_updated_at();")

    # Drop tables in reverse order (respecting foreign key constraints)
    op.execute("DROP TABLE IF EXISTS slot_holds;")
    op.execute("DROP TABLE IF EXISTS bookings;")
    op.execute("DROP TABLE IF EXISTS booking_policies;")
    op.execute("DROP TABLE IF EXISTS availability_overrides;")
    op.execute("DROP TABLE IF EXISTS availability_settings;")
    op.execute("DROP TABLE IF EXISTS service_types;")
    op.execute("DROP TABLE IF EXISTS calendar_integrations;")
