"""Create user_consents table for GDPR/terms tracking.

This migration creates the user_consents table to track user consent for
various legal and compliance requirements:

1. Consent Types: Supports multiple consent categories:
   - terms_of_service: Acceptance of Terms of Service
   - privacy_policy: Acceptance of Privacy Policy
   - marketing_emails: Opt-in for marketing communications
   - data_processing: GDPR data processing consent
   - cookies: Cookie consent preferences
   - third_party_sharing: Consent for sharing data with partners
   - analytics: Consent for analytics tracking
   - age_verification: Verification that user is of legal age

2. Version Tracking: Each consent is tied to a specific document version,
   allowing re-consent when policies are updated.

3. Consent Lifecycle: Tracks when consent was given and when/if withdrawn,
   supporting GDPR right to withdraw consent.

4. Audit Trail: Full audit trail with IP addresses, user agents, and
   source tracking for compliance demonstration.

5. Onboarding Integration: Links to onboarding sessions for capturing
   consent during signup flow.

Feature: Automated Onboarding System
Task: T006 - Create user_consents table for GDPR/terms tracking
Revision ID: 0099
Revises: 0098
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0099"
down_revision = "0098"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create user_consents table for GDPR/terms tracking."""

    # =========================================================================
    # CREATE USER_CONSENTS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS user_consents (
            -- Primary key: UUID for consent record identification
            consent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- User association (required - who gave the consent)
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- =========================================================================
            -- CONSENT DETAILS
            -- =========================================================================

            -- Type of consent being tracked
            consent_type VARCHAR(50) NOT NULL
                CHECK (consent_type IN (
                    'terms_of_service',
                    'privacy_policy',
                    'marketing_emails',
                    'data_processing',
                    'cookies',
                    'third_party_sharing',
                    'analytics',
                    'age_verification'
                )),

            -- Version of the document/policy being consented to
            -- Format: semantic versioning (e.g., '1.0.0', '2.1.0')
            document_version VARCHAR(20) NOT NULL,

            -- URL to the document version (for audit/reference)
            document_url TEXT,

            -- Hash of the document content (for integrity verification)
            document_hash VARCHAR(64),

            -- Whether consent was granted or denied (for explicit choices)
            consent_granted BOOLEAN NOT NULL DEFAULT TRUE,

            -- =========================================================================
            -- CONSENT STATUS
            -- =========================================================================

            -- Current status of the consent
            status VARCHAR(30) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'withdrawn', 'expired', 'superseded')),

            -- If consent is required (vs optional like marketing)
            is_required BOOLEAN DEFAULT TRUE,

            -- For time-limited consents (e.g., cookie consent expires)
            expires_at TIMESTAMPTZ,

            -- =========================================================================
            -- ONBOARDING INTEGRATION
            -- =========================================================================

            -- Link to onboarding session (if consent given during signup)
            onboarding_session_id UUID REFERENCES onboarding_sessions(session_id) ON DELETE SET NULL,

            -- Source of consent (where in the app consent was given)
            consent_source VARCHAR(50) DEFAULT 'onboarding'
                CHECK (consent_source IN (
                    'onboarding',
                    'settings',
                    'checkout',
                    'banner',
                    'modal',
                    'api',
                    'import',
                    'migration'
                )),

            -- =========================================================================
            -- AUDIT AND TRACKING
            -- =========================================================================

            -- IP address from which consent was given
            ip_address INET,

            -- User agent from consent action
            user_agent TEXT,

            -- Geographic location (for jurisdiction compliance)
            country_code VARCHAR(2),
            region VARCHAR(100),

            -- Method of consent capture
            capture_method VARCHAR(30) DEFAULT 'checkbox'
                CHECK (capture_method IN (
                    'checkbox',
                    'button',
                    'toggle',
                    'signature',
                    'implicit',
                    'api'
                )),

            -- Was consent double-confirmed (e.g., email confirmation)
            double_opt_in BOOLEAN DEFAULT FALSE,
            double_opt_in_at TIMESTAMPTZ,

            -- Flexible metadata (A/B test variants, campaign info, etc.)
            metadata JSONB DEFAULT '{}',

            -- =========================================================================
            -- WITHDRAWAL TRACKING
            -- =========================================================================

            -- When consent was withdrawn (if applicable)
            withdrawn_at TIMESTAMPTZ,

            -- Reason for withdrawal (user-provided or system)
            withdrawal_reason TEXT,

            -- IP address from which withdrawal was made
            withdrawal_ip_address INET,

            -- User agent from withdrawal action
            withdrawal_user_agent TEXT,

            -- =========================================================================
            -- TIMESTAMPS
            -- =========================================================================

            -- When consent was given
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- When consent record was last updated
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- =========================================================================
            -- UNIQUE CONSTRAINT
            -- =========================================================================
            -- A user can only have one active consent per type/version combination
            -- When a new version requires consent, a new record is created
            UNIQUE(user_id, consent_type, document_version)
        );
    """)

    # =========================================================================
    # CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # User-based queries (find all consents for a user)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_user
        ON user_consents(user_id, created_at DESC);
    """)

    # Active consents by user (for checking current consent status)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_user_active
        ON user_consents(user_id, consent_type)
        WHERE status = 'active';
    """)

    # Consent type queries (e.g., all users who consented to marketing)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_type
        ON user_consents(consent_type, consent_granted)
        WHERE status = 'active';
    """)

    # Document version tracking (find all consents for a specific policy version)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_version
        ON user_consents(consent_type, document_version);
    """)

    # Expiring consents for renewal reminders
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_expires
        ON user_consents(expires_at)
        WHERE status = 'active' AND expires_at IS NOT NULL;
    """)

    # Withdrawn consents for compliance reporting
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_withdrawn
        ON user_consents(withdrawn_at DESC)
        WHERE status = 'withdrawn';
    """)

    # Country-based queries (for jurisdiction-specific compliance)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_country
        ON user_consents(country_code, consent_type)
        WHERE country_code IS NOT NULL;
    """)

    # Onboarding session lookup
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_onboarding
        ON user_consents(onboarding_session_id)
        WHERE onboarding_session_id IS NOT NULL;
    """)

    # Date range queries for compliance reporting
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_created_date
        ON user_consents(created_at DESC);
    """)

    # Marketing consent lookup (common query for email campaigns)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_consents_marketing
        ON user_consents(user_id)
        WHERE consent_type = 'marketing_emails' AND status = 'active' AND consent_granted = TRUE;
    """)

    # =========================================================================
    # CREATE TRIGGER FOR updated_at TIMESTAMP
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_user_consents_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_user_consents_updated_at ON user_consents;
        CREATE TRIGGER trigger_user_consents_updated_at
        BEFORE UPDATE ON user_consents
        FOR EACH ROW
        EXECUTE FUNCTION update_user_consents_updated_at();
    """)

    # =========================================================================
    # CREATE TRIGGER TO HANDLE CONSENT WITHDRAWAL
    # =========================================================================

    # This trigger automatically sets withdrawn_at when status changes to 'withdrawn'
    op.execute("""
        CREATE OR REPLACE FUNCTION handle_user_consent_withdrawal()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Auto-set withdrawn_at when status changes to withdrawn
            IF NEW.status = 'withdrawn' AND OLD.status != 'withdrawn' THEN
                NEW.withdrawn_at = COALESCE(NEW.withdrawn_at, NOW());
            END IF;

            -- Clear withdrawal fields if status is changed back to active
            IF NEW.status = 'active' AND OLD.status = 'withdrawn' THEN
                NEW.withdrawn_at = NULL;
                NEW.withdrawal_reason = NULL;
                NEW.withdrawal_ip_address = NULL;
                NEW.withdrawal_user_agent = NULL;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_user_consents_withdrawal ON user_consents;
        CREATE TRIGGER trigger_user_consents_withdrawal
        BEFORE UPDATE OF status ON user_consents
        FOR EACH ROW
        EXECUTE FUNCTION handle_user_consent_withdrawal();
    """)

    # =========================================================================
    # CREATE TRIGGER TO AUTO-EXPIRE CONSENTS
    # =========================================================================

    # This trigger automatically expires consents when their expiry date passes
    op.execute("""
        CREATE OR REPLACE FUNCTION check_user_consent_expiry()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Auto-expire if past expiry time
            IF NEW.status = 'active' AND NEW.expires_at IS NOT NULL AND NEW.expires_at < NOW() THEN
                NEW.status = 'expired';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_user_consents_expiry_check ON user_consents;
        CREATE TRIGGER trigger_user_consents_expiry_check
        BEFORE UPDATE ON user_consents
        FOR EACH ROW
        EXECUTE FUNCTION check_user_consent_expiry();
    """)

    # =========================================================================
    # ADD COMMENTS FOR DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE user_consents IS
        'Tracks user consent for GDPR, terms of service, privacy policy, and marketing with full audit trail';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.consent_type IS
        'Type of consent: terms_of_service, privacy_policy, marketing_emails, data_processing, cookies, etc.';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.document_version IS
        'Version of the document being consented to (e.g., 1.0.0). Enables re-consent on policy updates.';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.document_hash IS
        'SHA-256 hash of the document content for integrity verification';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.consent_granted IS
        'Whether consent was granted (TRUE) or explicitly denied (FALSE). Relevant for optional consents.';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.status IS
        'Consent status: active (current), withdrawn (user revoked), expired (time limit), superseded (new version)';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.is_required IS
        'Whether this consent is required (TRUE) or optional (FALSE, e.g., marketing)';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.consent_source IS
        'Where consent was captured: onboarding, settings, checkout, banner, modal, api';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.capture_method IS
        'How consent was captured: checkbox, button, toggle, signature, implicit, api';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.double_opt_in IS
        'Whether consent was double-confirmed (e.g., email confirmation for GDPR compliance)';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.country_code IS
        'ISO 3166-1 alpha-2 country code for jurisdiction-specific compliance (EU, CA, etc.)';
    """)

    op.execute("""
        COMMENT ON COLUMN user_consents.withdrawn_at IS
        'Timestamp when consent was withdrawn. Auto-set via trigger when status changes to withdrawn.';
    """)


def downgrade() -> None:
    """Drop user_consents table and related objects."""

    # Drop triggers first
    op.execute("DROP TRIGGER IF EXISTS trigger_user_consents_expiry_check ON user_consents;")
    op.execute("DROP FUNCTION IF EXISTS check_user_consent_expiry();")
    op.execute("DROP TRIGGER IF EXISTS trigger_user_consents_withdrawal ON user_consents;")
    op.execute("DROP FUNCTION IF EXISTS handle_user_consent_withdrawal();")
    op.execute("DROP TRIGGER IF EXISTS trigger_user_consents_updated_at ON user_consents;")
    op.execute("DROP FUNCTION IF EXISTS update_user_consents_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_user_consents_marketing;")
    op.execute("DROP INDEX IF EXISTS idx_user_consents_created_date;")
    op.execute("DROP INDEX IF EXISTS idx_user_consents_onboarding;")
    op.execute("DROP INDEX IF EXISTS idx_user_consents_country;")
    op.execute("DROP INDEX IF EXISTS idx_user_consents_withdrawn;")
    op.execute("DROP INDEX IF EXISTS idx_user_consents_expires;")
    op.execute("DROP INDEX IF EXISTS idx_user_consents_version;")
    op.execute("DROP INDEX IF EXISTS idx_user_consents_type;")
    op.execute("DROP INDEX IF EXISTS idx_user_consents_user_active;")
    op.execute("DROP INDEX IF EXISTS idx_user_consents_user;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS user_consents;")
