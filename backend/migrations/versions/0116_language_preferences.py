"""Create language_preferences table and enhance user/workspace language columns.

This migration creates the infrastructure for comprehensive localization support:

1. language_preferences Table:
   - Stores detailed language preferences per user per context
   - Supports context-specific preferences (UI, notifications, emails, etc.)
   - Tracks preference hierarchy (user > workspace > system defaults)
   - Enables guest language preferences linked to magic links

2. Enhanced User Language Settings:
   - Adds secondary_language for fallback
   - Adds date_locale and number_locale for regional formatting

3. Enhanced Workspace Language Settings:
   - Adds supported_languages array for multi-language workspaces
   - Adds guest_default_language for client-facing content

4. Supported Languages:
   Based on frontend i18n config with 13 Indian regional languages:
   - en (English), hi (Hindi), te (Telugu), ta (Tamil)
   - kn (Kannada), ml (Malayalam), as (Assamese), bn (Bengali)
   - gu (Gujarati), mr (Marathi), or (Odia), pa (Punjabi)
   - ur (Urdu - RTL)

Feature: Localization & Regional Features
Task: T001 - Create Alembic migration for language_preferences table
Revision ID: 0116
Revises: 0115
Create Date: 2026-01-07
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0116"
down_revision = "0115"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create language_preferences table and enhance language columns."""

    # =========================================================================
    # 1. CREATE SUPPORTED LANGUAGE ENUM
    # =========================================================================
    # Based on frontend SUPPORTED_LANGUAGES in i18n/config.ts
    # Includes all 13 languages supported by the application

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE supported_language AS ENUM (
                'en',   -- English
                'hi',   -- Hindi (हिन्दी)
                'te',   -- Telugu (తెలుగు)
                'ta',   -- Tamil (தமிழ்)
                'kn',   -- Kannada (ಕನ್ನಡ)
                'ml',   -- Malayalam (മലയാളം)
                'as',   -- Assamese (অসমীয়া)
                'bn',   -- Bengali (বাংলা)
                'gu',   -- Gujarati (ગુજરાતી)
                'mr',   -- Marathi (मराठी)
                'or',   -- Odia (ଓଡ଼ିଆ)
                'pa',   -- Punjabi (ਪੰਜਾਬੀ)
                'ur'    -- Urdu (اردو) - RTL
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # =========================================================================
    # 2. CREATE LANGUAGE PREFERENCE CONTEXT ENUM
    # =========================================================================
    # Defines contexts where language preferences can be applied

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE language_context AS ENUM (
                'ui',           -- User interface language
                'email',        -- Email communications
                'notification', -- In-app notifications
                'invoice',      -- Invoices and billing documents
                'gallery',      -- Gallery and client-facing content
                'invitation',   -- Event invitations
                'report'        -- Generated reports
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # =========================================================================
    # 3. CREATE LANGUAGE_PREFERENCES TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS language_preferences (
            -- Primary key
            preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- =========================================================================
            -- OWNERSHIP AND SCOPE
            -- =========================================================================

            -- User who owns this preference (NULL for guest/anonymous preferences)
            user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,

            -- Workspace context (NULL for user-level preferences)
            workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Guest identifier for anonymous users (e.g., magic link access)
            -- Links to magic_links.magic_link_id or stores visitor session ID
            guest_identifier UUID,

            -- =========================================================================
            -- LANGUAGE SETTINGS
            -- =========================================================================

            -- Context for this preference
            context language_context NOT NULL DEFAULT 'ui',

            -- Primary language preference
            primary_language supported_language NOT NULL DEFAULT 'en',

            -- Fallback language if primary language content is unavailable
            fallback_language supported_language DEFAULT 'en',

            -- =========================================================================
            -- REGIONAL FORMATTING PREFERENCES
            -- =========================================================================

            -- Locale for date formatting (e.g., 'en-IN', 'hi-IN', 'en-US')
            -- More specific than language for regional date formats
            date_locale VARCHAR(10) DEFAULT 'en-IN',

            -- Locale for number/currency formatting
            number_locale VARCHAR(10) DEFAULT 'en-IN',

            -- Preferred currency for display (ISO 4217)
            currency_code VARCHAR(3) DEFAULT 'INR',

            -- Timezone for date/time display (IANA identifier)
            timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',

            -- =========================================================================
            -- DETECTION AND SOURCE
            -- =========================================================================

            -- How this preference was determined
            source VARCHAR(30) DEFAULT 'user_selected'
                CHECK (source IN (
                    'user_selected',     -- User explicitly chose this language
                    'browser_detected',  -- Auto-detected from browser settings
                    'workspace_default', -- Inherited from workspace
                    'system_default',    -- System fallback
                    'api_header',        -- Set via Accept-Language header
                    'url_param',         -- Set via URL parameter
                    'cookie',            -- Set via cookie preference
                    'imported'           -- Imported from external system
                )),

            -- Whether user has explicitly set this preference
            -- vs. it being auto-detected or inherited
            is_explicit BOOLEAN DEFAULT FALSE,

            -- =========================================================================
            -- STATUS AND METADATA
            -- =========================================================================

            -- Whether this preference is currently active
            is_active BOOLEAN DEFAULT TRUE,

            -- Priority for preference resolution (lower = higher priority)
            priority INTEGER DEFAULT 100,

            -- Flexible metadata (e.g., detection confidence, A/B test info)
            metadata JSONB DEFAULT '{}',

            -- =========================================================================
            -- TIMESTAMPS
            -- =========================================================================

            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- =========================================================================
            -- CONSTRAINTS
            -- =========================================================================

            -- Ensure at least one identifier is present
            CONSTRAINT chk_language_pref_owner
                CHECK (user_id IS NOT NULL OR guest_identifier IS NOT NULL),

            -- Unique preference per user/workspace/context combination
            CONSTRAINT uq_language_pref_user_workspace_context
                UNIQUE NULLS NOT DISTINCT (user_id, workspace_id, context)
        );
    """)

    # =========================================================================
    # 4. ENHANCE USERS TABLE WITH ADDITIONAL LANGUAGE COLUMNS
    # =========================================================================

    # Add secondary language for fallback
    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS secondary_language VARCHAR(10);
    """)

    # Add locale preferences for formatting
    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS date_locale VARCHAR(10) DEFAULT 'en-IN';
    """)

    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS number_locale VARCHAR(10) DEFAULT 'en-IN';
    """)

    # Add language detection metadata
    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS language_detected_from VARCHAR(30);
    """)

    # =========================================================================
    # 5. ENHANCE WORKSPACES TABLE WITH ADDITIONAL LANGUAGE COLUMNS
    # =========================================================================

    # Add supported languages array (languages enabled for this workspace)
    op.execute("""
        ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS supported_languages VARCHAR(10)[] DEFAULT ARRAY['en'];
    """)

    # Add guest default language (for client-facing content)
    op.execute("""
        ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS guest_default_language VARCHAR(10) DEFAULT 'en';
    """)

    # Add locale preferences for workspace
    op.execute("""
        ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS date_locale VARCHAR(10) DEFAULT 'en-IN';
    """)

    op.execute("""
        ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS number_locale VARCHAR(10) DEFAULT 'en-IN';
    """)

    # =========================================================================
    # 6. CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # User preferences lookup
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_language_prefs_user
        ON language_preferences(user_id, context)
        WHERE user_id IS NOT NULL AND is_active = TRUE;
    """)

    # Workspace preferences lookup
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_language_prefs_workspace
        ON language_preferences(workspace_id, context)
        WHERE workspace_id IS NOT NULL AND is_active = TRUE;
    """)

    # Guest preferences lookup (for magic link visitors)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_language_prefs_guest
        ON language_preferences(guest_identifier)
        WHERE guest_identifier IS NOT NULL AND is_active = TRUE;
    """)

    # Language analytics (what languages are being used)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_language_prefs_language
        ON language_preferences(primary_language)
        WHERE is_active = TRUE;
    """)

    # Source analytics (how preferences are being set)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_language_prefs_source
        ON language_preferences(source, created_at DESC)
        WHERE is_active = TRUE;
    """)

    # User preferred language lookup (for quick user settings)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_preferred_language
        ON users(preferred_language)
        WHERE preferred_language IS NOT NULL;
    """)

    # Workspace default language lookup
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_workspaces_default_language
        ON workspaces(default_language)
        WHERE default_language IS NOT NULL;
    """)

    # =========================================================================
    # 7. CREATE TRIGGER FOR updated_at TIMESTAMP
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_language_preferences_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_language_preferences_updated_at ON language_preferences;
        CREATE TRIGGER trigger_language_preferences_updated_at
        BEFORE UPDATE ON language_preferences
        FOR EACH ROW
        EXECUTE FUNCTION update_language_preferences_updated_at();
    """)

    # =========================================================================
    # 8. CREATE HELPER FUNCTION FOR LANGUAGE RESOLUTION
    # =========================================================================
    # This function resolves the effective language for a given context
    # following the priority: user explicit > workspace default > system default

    op.execute("""
        CREATE OR REPLACE FUNCTION resolve_language_preference(
            p_user_id UUID,
            p_workspace_id UUID,
            p_context language_context DEFAULT 'ui'
        )
        RETURNS TABLE (
            language supported_language,
            fallback supported_language,
            source VARCHAR(30),
            is_explicit BOOLEAN
        ) AS $$
        BEGIN
            -- First, try user-specific preference for this context
            RETURN QUERY
            SELECT
                lp.primary_language,
                lp.fallback_language,
                lp.source,
                lp.is_explicit
            FROM language_preferences lp
            WHERE lp.user_id = p_user_id
              AND (lp.workspace_id = p_workspace_id OR lp.workspace_id IS NULL)
              AND lp.context = p_context
              AND lp.is_active = TRUE
            ORDER BY
                CASE WHEN lp.workspace_id IS NOT NULL THEN 0 ELSE 1 END,
                lp.priority ASC
            LIMIT 1;

            -- If no rows returned, check workspace default
            IF NOT FOUND THEN
                RETURN QUERY
                SELECT
                    w.default_language::supported_language,
                    'en'::supported_language,
                    'workspace_default'::VARCHAR(30),
                    FALSE
                FROM workspaces w
                WHERE w.workspace_id = p_workspace_id;
            END IF;

            -- If still no rows, return system default
            IF NOT FOUND THEN
                RETURN QUERY
                SELECT
                    'en'::supported_language,
                    'en'::supported_language,
                    'system_default'::VARCHAR(30),
                    FALSE;
            END IF;
        END;
        $$ LANGUAGE plpgsql STABLE;
    """)

    # =========================================================================
    # 9. ADD DOCUMENTATION COMMENTS
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE language_preferences IS
        'Stores detailed language preferences per user, workspace, and context for comprehensive localization support';
    """)

    op.execute("""
        COMMENT ON COLUMN language_preferences.context IS
        'Context where this language preference applies: ui, email, notification, invoice, gallery, invitation, report';
    """)

    op.execute("""
        COMMENT ON COLUMN language_preferences.primary_language IS
        'Primary language preference (one of 13 supported Indian regional languages)';
    """)

    op.execute("""
        COMMENT ON COLUMN language_preferences.fallback_language IS
        'Fallback language when primary language content is unavailable (defaults to English)';
    """)

    op.execute("""
        COMMENT ON COLUMN language_preferences.date_locale IS
        'Locale for date formatting (e.g., en-IN for dd/mm/yyyy, en-US for mm/dd/yyyy)';
    """)

    op.execute("""
        COMMENT ON COLUMN language_preferences.source IS
        'How this preference was determined: user_selected, browser_detected, workspace_default, etc.';
    """)

    op.execute("""
        COMMENT ON COLUMN language_preferences.is_explicit IS
        'Whether user explicitly set this preference vs. auto-detected or inherited';
    """)

    op.execute("""
        COMMENT ON COLUMN language_preferences.guest_identifier IS
        'Guest/anonymous user identifier for magic link visitors or unauthenticated users';
    """)

    op.execute("""
        COMMENT ON COLUMN users.secondary_language IS
        'Fallback language preference for user when primary language content unavailable';
    """)

    op.execute("""
        COMMENT ON COLUMN users.date_locale IS
        'Locale for date formatting specific to user preferences';
    """)

    op.execute("""
        COMMENT ON COLUMN users.language_detected_from IS
        'Source of automatic language detection: browser, ip_geolocation, account_settings';
    """)

    op.execute("""
        COMMENT ON COLUMN workspaces.supported_languages IS
        'Array of languages enabled for this workspace (for multi-language content)';
    """)

    op.execute("""
        COMMENT ON COLUMN workspaces.guest_default_language IS
        'Default language for guest/client-facing content in this workspace';
    """)

    op.execute("""
        COMMENT ON FUNCTION resolve_language_preference IS
        'Resolves effective language for a user/workspace/context following priority hierarchy';
    """)


def downgrade() -> None:
    """Remove language_preferences table and related columns."""

    # =========================================================================
    # 1. DROP HELPER FUNCTION
    # =========================================================================

    op.execute("DROP FUNCTION IF EXISTS resolve_language_preference;")

    # =========================================================================
    # 2. DROP TRIGGERS
    # =========================================================================

    op.execute("DROP TRIGGER IF EXISTS trigger_language_preferences_updated_at ON language_preferences;")
    op.execute("DROP FUNCTION IF EXISTS update_language_preferences_updated_at();")

    # =========================================================================
    # 3. DROP INDEXES
    # =========================================================================

    op.execute("DROP INDEX IF EXISTS idx_workspaces_default_language;")
    op.execute("DROP INDEX IF EXISTS idx_users_preferred_language;")
    op.execute("DROP INDEX IF EXISTS idx_language_prefs_source;")
    op.execute("DROP INDEX IF EXISTS idx_language_prefs_language;")
    op.execute("DROP INDEX IF EXISTS idx_language_prefs_guest;")
    op.execute("DROP INDEX IF EXISTS idx_language_prefs_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_language_prefs_user;")

    # =========================================================================
    # 4. DROP WORKSPACE COLUMNS
    # =========================================================================

    op.execute("ALTER TABLE workspaces DROP COLUMN IF EXISTS number_locale;")
    op.execute("ALTER TABLE workspaces DROP COLUMN IF EXISTS date_locale;")
    op.execute("ALTER TABLE workspaces DROP COLUMN IF EXISTS guest_default_language;")
    op.execute("ALTER TABLE workspaces DROP COLUMN IF EXISTS supported_languages;")

    # =========================================================================
    # 5. DROP USER COLUMNS
    # =========================================================================

    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS language_detected_from;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS number_locale;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS date_locale;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS secondary_language;")

    # =========================================================================
    # 6. DROP TABLE
    # =========================================================================

    op.execute("DROP TABLE IF EXISTS language_preferences;")

    # =========================================================================
    # 7. DROP ENUM TYPES
    # =========================================================================

    op.execute("DROP TYPE IF EXISTS language_context CASCADE;")
    op.execute("DROP TYPE IF EXISTS supported_language CASCADE;")
