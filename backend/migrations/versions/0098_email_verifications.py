"""Create email_verifications table with tokens and expiry.

This migration creates the email_verifications table to track email verification
tokens sent during onboarding and account management. Key features:

1. Secure Token Storage: Token hash stored instead of plain text for security.
   The actual token is sent via email and only the hash is stored.

2. Expiry Handling: Tokens expire after a configurable period (default 24 hours).
   The expires_at timestamp enables efficient cleanup and validation.

3. Rate Limiting Support: Track attempts to prevent brute-force attacks.
   max_attempts and current attempt count enable lockout after too many tries.

4. Verification Types: Supports multiple verification purposes:
   - email_verification: Initial email verification during signup
   - email_change: Verifying new email during email change
   - password_reset: Password reset verification
   - reactivation: Account reactivation after email change

5. Onboarding Integration: Links to onboarding_sessions for flow tracking.

Feature: Automated Onboarding System
Task: T005 - Create email_verifications table with tokens and expiry
Revision ID: 0098
Revises: 0097
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0098"
down_revision = "0097"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create email_verifications table with tokens and expiry."""

    # =========================================================================
    # CREATE EMAIL_VERIFICATIONS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS email_verifications (
            -- Primary key: UUID for verification record identification
            verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- User association (required - who this verification is for)
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Email address being verified (may differ from user's current email for email change)
            email VARCHAR(255) NOT NULL,

            -- Token hash (SHA-256 hash of the actual token sent via email)
            -- The actual token is never stored, only its hash for security
            token_hash VARCHAR(64) NOT NULL,

            -- Type of verification
            verification_type VARCHAR(30) NOT NULL DEFAULT 'email_verification'
                CHECK (verification_type IN (
                    'email_verification',
                    'email_change',
                    'password_reset',
                    'reactivation'
                )),

            -- Current status of the verification
            status VARCHAR(30) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'verified', 'expired', 'revoked', 'failed')),

            -- =========================================================================
            -- EXPIRY AND RATE LIMITING
            -- =========================================================================

            -- When this token expires (typically 24 hours from creation)
            expires_at TIMESTAMPTZ NOT NULL,

            -- Maximum verification attempts allowed before lockout
            max_attempts INT DEFAULT 5,

            -- Current number of failed verification attempts
            attempt_count INT DEFAULT 0,

            -- Last failed attempt timestamp (for rate limiting)
            last_attempt_at TIMESTAMPTZ,

            -- Lockout until timestamp (if too many failed attempts)
            locked_until TIMESTAMPTZ,

            -- =========================================================================
            -- ONBOARDING INTEGRATION
            -- =========================================================================

            -- Link to onboarding session (for signup flow tracking)
            onboarding_session_id UUID REFERENCES onboarding_sessions(session_id) ON DELETE SET NULL,

            -- =========================================================================
            -- AUDIT AND TRACKING
            -- =========================================================================

            -- IP address from which verification was requested
            request_ip_address INET,

            -- User agent from verification request
            request_user_agent TEXT,

            -- IP address from which verification was completed
            verified_ip_address INET,

            -- User agent from verification completion
            verified_user_agent TEXT,

            -- Flexible metadata (e.g., source page, campaign tracking)
            metadata JSONB DEFAULT '{}',

            -- =========================================================================
            -- TIMESTAMPS
            -- =========================================================================

            -- When verification record was created
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- When verification record was last updated
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- When verification was successfully completed
            verified_at TIMESTAMPTZ,

            -- When token was revoked (if manually invalidated)
            revoked_at TIMESTAMPTZ,

            -- Reason for revocation (if applicable)
            revoked_reason VARCHAR(255)
        );
    """)

    # =========================================================================
    # CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # Primary lookup by token hash (for verification attempt)
    # This is the main query path when user clicks verification link
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_email_verifications_token_hash
        ON email_verifications(token_hash)
        WHERE status = 'pending';
    """)

    # User-based queries (find all verifications for a user)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_email_verifications_user
        ON email_verifications(user_id, created_at DESC);
    """)

    # Email-based queries (check if email has pending verification)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_email_verifications_email
        ON email_verifications(email, status)
        WHERE status = 'pending';
    """)

    # Active/pending verifications by user (for limiting concurrent verifications)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_email_verifications_user_pending
        ON email_verifications(user_id, verification_type)
        WHERE status = 'pending';
    """)

    # Expired verifications for cleanup job
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_email_verifications_expires
        ON email_verifications(expires_at)
        WHERE status = 'pending';
    """)

    # Onboarding session lookup (for flow integration)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_email_verifications_onboarding
        ON email_verifications(onboarding_session_id)
        WHERE onboarding_session_id IS NOT NULL;
    """)

    # Verification type queries (e.g., all password resets)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_email_verifications_type
        ON email_verifications(verification_type, status, created_at DESC);
    """)

    # Recently verified (for analytics and monitoring)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_email_verifications_verified
        ON email_verifications(verified_at DESC)
        WHERE status = 'verified';
    """)

    # Failed attempts monitoring (for security alerting)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_email_verifications_failed
        ON email_verifications(attempt_count, last_attempt_at)
        WHERE attempt_count >= 3 AND status = 'pending';
    """)

    # =========================================================================
    # CREATE TRIGGER FOR updated_at TIMESTAMP
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_email_verifications_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_email_verifications_updated_at ON email_verifications;
        CREATE TRIGGER trigger_email_verifications_updated_at
        BEFORE UPDATE ON email_verifications
        FOR EACH ROW
        EXECUTE FUNCTION update_email_verifications_updated_at();
    """)

    # =========================================================================
    # CREATE TRIGGER TO AUTO-EXPIRE TOKENS
    # =========================================================================

    # This trigger automatically sets status to 'expired' when expires_at passes
    # and prevents verification attempts on expired tokens
    op.execute("""
        CREATE OR REPLACE FUNCTION check_email_verification_expiry()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Auto-expire if past expiry time
            IF NEW.status = 'pending' AND NEW.expires_at < NOW() THEN
                NEW.status = 'expired';
            END IF;

            -- Prevent verification if locked out
            IF NEW.status = 'pending' AND NEW.locked_until IS NOT NULL AND NEW.locked_until > NOW() THEN
                RAISE EXCEPTION 'Verification locked until %', NEW.locked_until;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_email_verifications_expiry_check ON email_verifications;
        CREATE TRIGGER trigger_email_verifications_expiry_check
        BEFORE UPDATE ON email_verifications
        FOR EACH ROW
        EXECUTE FUNCTION check_email_verification_expiry();
    """)

    # =========================================================================
    # CREATE TRIGGER TO INCREMENT ATTEMPT COUNT
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION increment_email_verification_attempts()
        RETURNS TRIGGER AS $$
        BEGIN
            -- If attempt_count is being incremented, update last_attempt_at
            IF NEW.attempt_count > OLD.attempt_count THEN
                NEW.last_attempt_at = NOW();

                -- Lock out if max attempts exceeded
                IF NEW.attempt_count >= NEW.max_attempts THEN
                    NEW.locked_until = NOW() + INTERVAL '1 hour';
                    NEW.status = 'failed';
                END IF;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_email_verifications_attempts ON email_verifications;
        CREATE TRIGGER trigger_email_verifications_attempts
        BEFORE UPDATE OF attempt_count ON email_verifications
        FOR EACH ROW
        EXECUTE FUNCTION increment_email_verification_attempts();
    """)

    # =========================================================================
    # ADD COMMENTS FOR DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE email_verifications IS
        'Tracks email verification tokens with expiry and rate limiting for secure email verification flow';
    """)

    op.execute("""
        COMMENT ON COLUMN email_verifications.token_hash IS
        'SHA-256 hash of the verification token. Actual token is sent via email and never stored.';
    """)

    op.execute("""
        COMMENT ON COLUMN email_verifications.verification_type IS
        'Type of verification: email_verification (signup), email_change, password_reset, reactivation';
    """)

    op.execute("""
        COMMENT ON COLUMN email_verifications.expires_at IS
        'Token expiry timestamp. Default is 24 hours from creation for email verification.';
    """)

    op.execute("""
        COMMENT ON COLUMN email_verifications.max_attempts IS
        'Maximum allowed verification attempts before lockout (default: 5)';
    """)

    op.execute("""
        COMMENT ON COLUMN email_verifications.attempt_count IS
        'Current number of failed verification attempts. Auto-incremented on failed attempts.';
    """)

    op.execute("""
        COMMENT ON COLUMN email_verifications.locked_until IS
        'If too many failed attempts, lockout until this timestamp (auto-set by trigger)';
    """)

    op.execute("""
        COMMENT ON COLUMN email_verifications.onboarding_session_id IS
        'Link to onboarding session for tracking verification during signup flow';
    """)


def downgrade() -> None:
    """Drop email_verifications table and related objects."""

    # Drop triggers first
    op.execute("DROP TRIGGER IF EXISTS trigger_email_verifications_attempts ON email_verifications;")
    op.execute("DROP FUNCTION IF EXISTS increment_email_verification_attempts();")
    op.execute("DROP TRIGGER IF EXISTS trigger_email_verifications_expiry_check ON email_verifications;")
    op.execute("DROP FUNCTION IF EXISTS check_email_verification_expiry();")
    op.execute("DROP TRIGGER IF EXISTS trigger_email_verifications_updated_at ON email_verifications;")
    op.execute("DROP FUNCTION IF EXISTS update_email_verifications_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_email_verifications_failed;")
    op.execute("DROP INDEX IF EXISTS idx_email_verifications_verified;")
    op.execute("DROP INDEX IF EXISTS idx_email_verifications_type;")
    op.execute("DROP INDEX IF EXISTS idx_email_verifications_onboarding;")
    op.execute("DROP INDEX IF EXISTS idx_email_verifications_expires;")
    op.execute("DROP INDEX IF EXISTS idx_email_verifications_user_pending;")
    op.execute("DROP INDEX IF EXISTS idx_email_verifications_email;")
    op.execute("DROP INDEX IF EXISTS idx_email_verifications_user;")
    op.execute("DROP INDEX IF EXISTS idx_email_verifications_token_hash;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS email_verifications;")
