"""Create onboarding_sessions table for flow state tracking.

This migration creates the onboarding_sessions table to track users through
the multi-step onboarding flow:
1. Plan selection
2. Account registration
3. Email verification
4. Payment processing
5. Workspace setup

The table stores:
- Session identification and expiry
- Selected plan and billing preferences
- Current step and completion status
- User association (once registered)
- OAuth/registration source tracking
- Flow metadata for analytics

Feature: Automated Onboarding System
Task: T003 - Create onboarding_sessions table for flow state tracking
Revision ID: 0096
Revises: 0095
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0096"
down_revision = "0095"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create onboarding_sessions table for flow state tracking."""

    # =========================================================================
    # CREATE ONBOARDING_SESSIONS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS onboarding_sessions (
            -- Primary key: UUID for session identification
            session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Session token for URL-based session resumption (hashed for security)
            session_token_hash VARCHAR(255) NOT NULL UNIQUE,

            -- User association (NULL until user registers/logs in)
            user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,

            -- Workspace association (NULL until workspace is created)
            workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Selected plan (NULL until plan is selected)
            plan_id UUID REFERENCES plans(plan_id) ON DELETE SET NULL,

            -- Billing preferences
            billing_interval VARCHAR(20) DEFAULT 'monthly'
                CHECK (billing_interval IN ('monthly', 'annual')),
            currency VARCHAR(3) DEFAULT 'INR',

            -- Current step in the onboarding flow
            current_step VARCHAR(50) NOT NULL DEFAULT 'plan_selection'
                CHECK (current_step IN (
                    'plan_selection',
                    'registration',
                    'email_verification',
                    'payment',
                    'workspace_setup',
                    'completed'
                )),

            -- Step completion tracking (JSONB for flexibility)
            steps_completed JSONB DEFAULT '{
                "plan_selection": false,
                "registration": false,
                "email_verification": false,
                "payment": false,
                "workspace_setup": false
            }'::jsonb,

            -- Registration method
            registration_method VARCHAR(30) DEFAULT 'email'
                CHECK (registration_method IN ('email', 'google', 'apple')),

            -- Pre-filled registration data (from OAuth or form)
            registration_data JSONB DEFAULT '{}',

            -- Payment tracking
            stripe_payment_intent_id VARCHAR(255),
            stripe_setup_intent_id VARCHAR(255),
            payment_status VARCHAR(30) DEFAULT 'none'
                CHECK (payment_status IN ('none', 'pending', 'processing', 'succeeded', 'failed', 'requires_action')),

            -- Email verification tracking
            email_verified BOOLEAN DEFAULT FALSE,
            email_verification_sent_at TIMESTAMPTZ,

            -- Session status
            status VARCHAR(30) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'abandoned', 'expired')),

            -- Source tracking for analytics
            utm_source VARCHAR(100),
            utm_medium VARCHAR(100),
            utm_campaign VARCHAR(100),
            utm_content VARCHAR(100),
            utm_term VARCHAR(100),
            referrer_url TEXT,
            landing_page TEXT,

            -- Device and location info
            ip_address INET,
            user_agent TEXT,
            device_type VARCHAR(30),

            -- Promo/coupon code
            promo_code VARCHAR(50),

            -- Flexible metadata for additional tracking
            metadata JSONB DEFAULT '{}',

            -- Error tracking
            last_error TEXT,
            error_count INT DEFAULT 0,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            completed_at TIMESTAMPTZ,

            -- Last activity for session timeout calculations
            last_activity_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
    """)

    # =========================================================================
    # CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # Index for looking up sessions by token hash (primary lookup method)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_token
        ON onboarding_sessions(session_token_hash);
    """)

    # Index for finding sessions by user (after registration)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user
        ON onboarding_sessions(user_id)
        WHERE user_id IS NOT NULL;
    """)

    # Index for active sessions (for cleanup and status queries)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_active
        ON onboarding_sessions(status, created_at)
        WHERE status = 'active';
    """)

    # Index for expired session cleanup
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_expires
        ON onboarding_sessions(expires_at)
        WHERE status = 'active';
    """)

    # Index for step-based queries (e.g., find all sessions at payment step)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_step
        ON onboarding_sessions(current_step)
        WHERE status = 'active';
    """)

    # Index for Stripe payment intent lookup
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_stripe_pi
        ON onboarding_sessions(stripe_payment_intent_id)
        WHERE stripe_payment_intent_id IS NOT NULL;
    """)

    # Index for analytics queries by UTM source
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_utm_source
        ON onboarding_sessions(utm_source, created_at)
        WHERE utm_source IS NOT NULL;
    """)

    # Index for finding sessions with promo codes
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_promo
        ON onboarding_sessions(promo_code)
        WHERE promo_code IS NOT NULL;
    """)

    # Composite index for dashboard analytics
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_analytics
        ON onboarding_sessions(status, current_step, created_at DESC);
    """)

    # =========================================================================
    # CREATE TRIGGER FOR updated_at TIMESTAMP
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_onboarding_sessions_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_onboarding_sessions_updated_at ON onboarding_sessions;
        CREATE TRIGGER trigger_onboarding_sessions_updated_at
        BEFORE UPDATE ON onboarding_sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_onboarding_sessions_updated_at();
    """)

    # =========================================================================
    # ADD COMMENTS FOR DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE onboarding_sessions IS
        'Tracks user progress through the multi-step onboarding flow from plan selection to workspace setup';
    """)

    op.execute("""
        COMMENT ON COLUMN onboarding_sessions.session_token_hash IS
        'Hashed session token used for URL-based session resumption (token stored in cookie/URL)';
    """)

    op.execute("""
        COMMENT ON COLUMN onboarding_sessions.current_step IS
        'Current step in onboarding: plan_selection, registration, email_verification, payment, workspace_setup, completed';
    """)

    op.execute("""
        COMMENT ON COLUMN onboarding_sessions.steps_completed IS
        'JSONB tracking completion status of each onboarding step';
    """)

    op.execute("""
        COMMENT ON COLUMN onboarding_sessions.registration_method IS
        'How user registered: email (form), google (OAuth), apple (OAuth)';
    """)

    op.execute("""
        COMMENT ON COLUMN onboarding_sessions.registration_data IS
        'Pre-filled data from OAuth or partial form submission (email, name, etc.)';
    """)

    op.execute("""
        COMMENT ON COLUMN onboarding_sessions.metadata IS
        'Flexible JSONB for additional tracking: A/B test variants, feature flags, etc.';
    """)

    op.execute("""
        COMMENT ON COLUMN onboarding_sessions.last_activity_at IS
        'Last user activity timestamp for session timeout calculations and engagement tracking';
    """)


def downgrade() -> None:
    """Drop onboarding_sessions table and related objects."""

    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_onboarding_sessions_updated_at ON onboarding_sessions;")
    op.execute("DROP FUNCTION IF EXISTS update_onboarding_sessions_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_analytics;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_promo;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_utm_source;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_stripe_pi;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_step;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_expires;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_active;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_user;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_token;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS onboarding_sessions;")
