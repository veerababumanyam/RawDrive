"""User profile settings schema extensions.

Add new columns to users table for profile information, notification preferences,
and privacy settings. Create new tables for TOTP settings, data export requests,
and account deletion requests.

Revision ID: 0037
Revises: 0036
Create Date: 2025-12-27
"""

from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Extend users table with new profile columns
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
        ADD COLUMN IF NOT EXISTS job_title VARCHAR(100),
        ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
        ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
        ADD COLUMN IF NOT EXISTS bio TEXT,
        ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
            "email": {
                "gallery_activity": true,
                "client_interactions": true,
                "system_alerts": true,
                "marketing": false
            },
            "in_app": {
                "gallery_activity": true,
                "client_interactions": true,
                "system_alerts": true,
                "marketing": true
            }
        }'::jsonb,
        ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{
            "analytics_enabled": true,
            "public_profile_enabled": true
        }'::jsonb,
        ADD COLUMN IF NOT EXISTS last_password_changed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
        """
    )

    # 2. Create user_totp_settings table for 2FA
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_totp_settings (
            user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
            totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            totp_secret_encrypted BYTEA,
            backup_codes_hashed TEXT[],
            totp_enabled_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # 3. Create data_export_requests table for GDPR exports
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS data_export_requests (
            export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ,
            download_url TEXT,
            expires_at TIMESTAMPTZ,
            CONSTRAINT valid_export_status CHECK (
                status IN ('pending', 'processing', 'completed', 'failed', 'expired')
            )
        );
        """
    )

    # 4. Create account_deletion_requests table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS account_deletion_requests (
            request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id),
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            scheduled_deletion_at TIMESTAMPTZ NOT NULL,
            cancelled_at TIMESTAMPTZ,
            processed_at TIMESTAMPTZ,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            CONSTRAINT valid_deletion_status CHECK (
                status IN ('pending', 'cancelled', 'completed')
            )
        );
        """
    )

    # 4b. Create pending_email_changes table for email change verification
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_email_changes (
            change_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            new_email VARCHAR(320) NOT NULL,
            token_hash VARCHAR(64) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            verified_at TIMESTAMPTZ,
            CONSTRAINT pending_email_unique UNIQUE (user_id, new_email, verified_at)
        );
        """
    )

    # Create index for token lookup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_pending_email_token_hash
        ON pending_email_changes(token_hash);
        """
    )

    # Create index for active pending changes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_pending_email_user_active
        ON pending_email_changes(user_id)
        WHERE verified_at IS NULL;
        """
    )

    # 5. Add location column to sessions table for IP geolocation
    op.execute(
        """
        ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS location JSONB;
        """
    )

    # 6. Create indexes for efficient lookups
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_users_deletion_requested
        ON users(deletion_requested_at)
        WHERE deletion_requested_at IS NOT NULL;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_data_export_user_status
        ON data_export_requests(user_id, status);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_data_export_expires
        ON data_export_requests(expires_at)
        WHERE status = 'completed';
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_account_deletion_user_pending
        ON account_deletion_requests(user_id)
        WHERE status = 'pending';
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_account_deletion_scheduled
        ON account_deletion_requests(scheduled_deletion_at)
        WHERE status = 'pending';
        """
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_pending_email_user_active;")
    op.execute("DROP INDEX IF EXISTS idx_pending_email_token_hash;")
    op.execute("DROP INDEX IF EXISTS idx_account_deletion_scheduled;")
    op.execute("DROP INDEX IF EXISTS idx_account_deletion_user_pending;")
    op.execute("DROP INDEX IF EXISTS idx_data_export_expires;")
    op.execute("DROP INDEX IF EXISTS idx_data_export_user_status;")
    op.execute("DROP INDEX IF EXISTS idx_users_deletion_requested;")

    # Remove location column from sessions
    op.execute("ALTER TABLE sessions DROP COLUMN IF EXISTS location;")

    # Drop new tables
    op.execute("DROP TABLE IF EXISTS pending_email_changes;")
    op.execute("DROP TABLE IF EXISTS account_deletion_requests;")
    op.execute("DROP TABLE IF EXISTS data_export_requests;")
    op.execute("DROP TABLE IF EXISTS user_totp_settings;")

    # Remove new columns from users table
    op.execute(
        """
        ALTER TABLE users
        DROP COLUMN IF EXISTS avatar_url,
        DROP COLUMN IF EXISTS job_title,
        DROP COLUMN IF EXISTS phone,
        DROP COLUMN IF EXISTS timezone,
        DROP COLUMN IF EXISTS bio,
        DROP COLUMN IF EXISTS notification_preferences,
        DROP COLUMN IF EXISTS privacy_settings,
        DROP COLUMN IF EXISTS last_password_changed_at,
        DROP COLUMN IF EXISTS deletion_requested_at;
        """
    )
