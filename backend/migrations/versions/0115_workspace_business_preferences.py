"""Add workspace business preferences fields to onboarding_sessions.

This migration adds business identity fields to the onboarding_sessions table
to capture workspace customization preferences during the onboarding flow:
- business_type: Photography business specialization (wedding, portrait, etc.)
- timezone: User's preferred timezone (IANA identifier)
- business_currency: Currency for business operations (ISO 4217)
- date_format: Preferred date display format
- language: Preferred interface language
- brand_color: Primary brand color (hex code)

These fields are collected during the workspace setup step and used to
pre-configure the workspace with personalized settings.

Feature: Automated Onboarding System - Business Identity
Task: T002 - Create Alembic migration for workspace business preferences
Revision ID: 0115
Revises: 0114
Create Date: 2026-01-07
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0115"
down_revision = "0114"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add business identity fields to onboarding_sessions table."""

    # =========================================================================
    # 1. CREATE ENUM TYPES FOR BUSINESS IDENTITY
    # =========================================================================

    # Business type enum for photography business specialization
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE business_type AS ENUM (
                'wedding',
                'portrait',
                'commercial',
                'event',
                'newborn',
                'real_estate',
                'product',
                'fashion',
                'sports',
                'wildlife',
                'travel',
                'fine_art',
                'boudoir',
                'family',
                'headshot',
                'food',
                'architecture',
                'drone',
                'video',
                'multi_specialty',
                'other'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # Date format enum for display preferences
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE date_format_preference AS ENUM (
                'MM/DD/YYYY',
                'DD/MM/YYYY',
                'YYYY-MM-DD',
                'MM-DD-YYYY',
                'DD-MM-YYYY',
                'Month DD, YYYY',
                'DD Month YYYY'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # Language enum for interface localization
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE interface_language AS ENUM (
                'en',
                'es',
                'fr',
                'de',
                'it',
                'pt',
                'nl',
                'pl',
                'ru',
                'ja',
                'ko',
                'zh',
                'zh-TW',
                'ar',
                'hi',
                'th',
                'vi',
                'tr',
                'sv',
                'da',
                'no',
                'fi'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # =========================================================================
    # 2. ADD BUSINESS IDENTITY COLUMNS TO ONBOARDING_SESSIONS
    # =========================================================================

    # Add business_type column
    op.execute(
        """
        ALTER TABLE onboarding_sessions
        ADD COLUMN IF NOT EXISTS business_type business_type;
        """
    )

    # Add timezone column (IANA timezone identifier, e.g., "America/New_York")
    op.execute(
        """
        ALTER TABLE onboarding_sessions
        ADD COLUMN IF NOT EXISTS timezone VARCHAR(100);
        """
    )

    # Add business_currency column (ISO 4217, e.g., "USD", "EUR", "INR")
    op.execute(
        """
        ALTER TABLE onboarding_sessions
        ADD COLUMN IF NOT EXISTS business_currency VARCHAR(3);
        """
    )

    # Add date_format column
    op.execute(
        """
        ALTER TABLE onboarding_sessions
        ADD COLUMN IF NOT EXISTS date_format date_format_preference;
        """
    )

    # Add language column
    op.execute(
        """
        ALTER TABLE onboarding_sessions
        ADD COLUMN IF NOT EXISTS language interface_language;
        """
    )

    # Add brand_color column (hex color code, e.g., "#FF5733")
    op.execute(
        """
        ALTER TABLE onboarding_sessions
        ADD COLUMN IF NOT EXISTS brand_color VARCHAR(7);
        """
    )

    # =========================================================================
    # 3. ADD CONSTRAINT FOR BRAND COLOR VALIDATION
    # =========================================================================

    # Validate brand_color is a valid hex color code
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'chk_brand_color_format'
            ) THEN
                ALTER TABLE onboarding_sessions
                ADD CONSTRAINT chk_brand_color_format
                CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9A-Fa-f]{6}$');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 4. CREATE INDEXES FOR BUSINESS IDENTITY QUERIES
    # =========================================================================

    # Index for querying sessions by business type (analytics)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_business_type
        ON onboarding_sessions(business_type)
        WHERE business_type IS NOT NULL;
        """
    )

    # Index for querying sessions by timezone (regional analytics)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_timezone
        ON onboarding_sessions(timezone)
        WHERE timezone IS NOT NULL;
        """
    )

    # Index for querying sessions by language (localization analytics)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_language
        ON onboarding_sessions(language)
        WHERE language IS NOT NULL;
        """
    )

    # =========================================================================
    # 5. ADD DOCUMENTATION COMMENTS
    # =========================================================================

    op.execute(
        """
        COMMENT ON COLUMN onboarding_sessions.business_type IS
        'Photography business specialization (wedding, portrait, commercial, etc.) - captured during workspace setup';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN onboarding_sessions.timezone IS
        'User preferred timezone in IANA format (e.g., America/New_York, Europe/London)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN onboarding_sessions.business_currency IS
        'ISO 4217 currency code for business operations (e.g., USD, EUR, INR)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN onboarding_sessions.date_format IS
        'Preferred date display format for the workspace interface';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN onboarding_sessions.language IS
        'Preferred interface language for the workspace';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN onboarding_sessions.brand_color IS
        'Primary brand color in hex format (e.g., #FF5733) for workspace theming';
        """
    )


def downgrade() -> None:
    """Remove business identity fields from onboarding_sessions table."""

    # =========================================================================
    # 1. DROP INDEXES
    # =========================================================================

    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_language;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_timezone;")
    op.execute("DROP INDEX IF EXISTS idx_onboarding_sessions_business_type;")

    # =========================================================================
    # 2. DROP CONSTRAINT
    # =========================================================================

    op.execute(
        """
        ALTER TABLE onboarding_sessions
        DROP CONSTRAINT IF EXISTS chk_brand_color_format;
        """
    )

    # =========================================================================
    # 3. DROP COLUMNS
    # =========================================================================

    op.execute("ALTER TABLE onboarding_sessions DROP COLUMN IF EXISTS brand_color;")
    op.execute("ALTER TABLE onboarding_sessions DROP COLUMN IF EXISTS language;")
    op.execute("ALTER TABLE onboarding_sessions DROP COLUMN IF EXISTS date_format;")
    op.execute("ALTER TABLE onboarding_sessions DROP COLUMN IF EXISTS business_currency;")
    op.execute("ALTER TABLE onboarding_sessions DROP COLUMN IF EXISTS timezone;")
    op.execute("ALTER TABLE onboarding_sessions DROP COLUMN IF EXISTS business_type;")

    # =========================================================================
    # 4. DROP ENUM TYPES
    # =========================================================================

    op.execute("DROP TYPE IF EXISTS interface_language CASCADE;")
    op.execute("DROP TYPE IF EXISTS date_format_preference CASCADE;")
    op.execute("DROP TYPE IF EXISTS business_type CASCADE;")
