"""Add personal_profiles table for digital visiting cards.

Creates schema for:
- personal_profiles: Personal profile digital visiting card for photographers
- personal_profile_avatars: Multi-size avatar storage

Revision ID: 0155_personal_profiles
Revises: 0154_add_search_engine_indexing
Create Date: 2026-01-09
"""

from alembic import op

revision = "0155_personal_profiles"
down_revision = "0154_add_search_engine_indexing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. PERSONAL_PROFILES TABLE
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS personal_profiles (
            profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Identity
            display_name VARCHAR(255) NOT NULL,
            profile_title VARCHAR(255),
            slug VARCHAR(100) NOT NULL,
            avatar_url TEXT,

            -- Bio & Description
            bio TEXT,
            location VARCHAR(255),

            -- Contact Info
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            website TEXT,

            -- Secondary contacts (max 2 each)
            -- Schema: [{ email, label }]
            secondary_emails JSONB DEFAULT '[]',
            -- Schema: [{ phone, label }]
            secondary_phones JSONB DEFAULT '[]',

            -- Location & Travel
            -- Schema: { line1, line2, city, state, postal_code, country, latitude?, longitude? }
            address_structured JSONB DEFAULT '{}',
            service_areas TEXT[],

            -- Social Media Links
            -- Schema: { instagram, facebook, twitter, linkedin, youtube, tiktok, pinterest, behance, dribbble, spotify, whatsapp }
            socials JSONB DEFAULT '{}',

            -- Custom Links
            -- Schema: [{ label, url, logo_url?, type? }]
            custom_links JSONB DEFAULT '[]',

            -- Embedded Media
            -- Schema: { tiktok_username?, spotify_playlist_id? }
            embedded_media JSONB DEFAULT '{}',

            -- Featured Gallery
            featured_gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE SET NULL,

            -- Categories/Niches
            categories TEXT[],

            -- Branding
            brand_color VARCHAR(50),
            background_theme VARCHAR(50),

            -- Visibility Configuration
            -- Schema: { display_name: bool, profile_title: bool, avatar_url: bool, bio: bool, ... }
            visibility_config JSONB DEFAULT '{}',

            -- Public Profile Toggle
            is_public BOOLEAN DEFAULT FALSE,

            -- SEO Metadata
            -- Schema: { meta_title, meta_description, meta_keywords[], og_image, twitter_card }
            seo_metadata JSONB DEFAULT '{}',

            -- Verification & Badges
            is_verified BOOLEAN DEFAULT FALSE,
            badges TEXT[],

            -- Calendar Integration
            booking_calendar_url TEXT,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT uq_personal_profiles_slug UNIQUE(slug),
            CONSTRAINT uq_personal_profiles_user_workspace UNIQUE(workspace_id, user_id)
        );

        -- Table comment
        COMMENT ON TABLE personal_profiles IS 'Personal profile digital visiting cards for photographers';
        """
    )

    # Indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_personal_profiles_workspace ON personal_profiles(workspace_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_personal_profiles_user ON personal_profiles(user_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_personal_profiles_slug ON personal_profiles(slug);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_personal_profiles_is_public ON personal_profiles(is_public) WHERE is_public = TRUE;"
    )

    # Updated_at trigger function and trigger
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_personal_profiles_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_personal_profiles_updated_at ON personal_profiles;
        CREATE TRIGGER trigger_personal_profiles_updated_at
        BEFORE UPDATE ON personal_profiles
        FOR EACH ROW
        EXECUTE FUNCTION update_personal_profiles_updated_at();
        """
    )

    # =========================================================================
    # 2. PERSONAL_PROFILE_AVATARS TABLE
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS personal_profile_avatars (
            avatar_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            profile_id UUID NOT NULL REFERENCES personal_profiles(profile_id) ON DELETE CASCADE,

            -- Image data for different sizes (stored as WebP bytes)
            image_64 BYTEA,   -- 64x64 thumbnail
            image_128 BYTEA,  -- 128x128 thumbnail
            image_256 BYTEA,  -- 256x256 thumbnail
            image_512 BYTEA,  -- 512x512 for high-res displays

            -- Metadata
            content_type VARCHAR(50) NOT NULL DEFAULT 'image/webp',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- One avatar per profile
            CONSTRAINT uq_personal_profile_avatars_profile UNIQUE (workspace_id, profile_id)
        );

        -- Table comment
        COMMENT ON TABLE personal_profile_avatars IS 'Avatar images for personal profiles at multiple sizes';
        """
    )

    # Index for fast lookup
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_personal_profile_avatars_profile ON personal_profile_avatars(workspace_id, profile_id);"
    )

    # Updated_at trigger function and trigger
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_personal_profile_avatars_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_personal_profile_avatars_updated_at ON personal_profile_avatars;
        CREATE TRIGGER trigger_personal_profile_avatars_updated_at
        BEFORE UPDATE ON personal_profile_avatars
        FOR EACH ROW
        EXECUTE FUNCTION update_personal_profile_avatars_updated_at();
        """
    )


def downgrade() -> None:
    # Drop triggers and functions
    op.execute(
        "DROP TRIGGER IF EXISTS trigger_personal_profile_avatars_updated_at ON personal_profile_avatars;"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS update_personal_profile_avatars_updated_at();"
    )
    op.execute(
        "DROP TRIGGER IF EXISTS trigger_personal_profiles_updated_at ON personal_profiles;"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS update_personal_profiles_updated_at();"
    )

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_personal_profile_avatars_profile;")
    op.execute("DROP INDEX IF EXISTS idx_personal_profiles_is_public;")
    op.execute("DROP INDEX IF EXISTS idx_personal_profiles_slug;")
    op.execute("DROP INDEX IF EXISTS idx_personal_profiles_user;")
    op.execute("DROP INDEX IF EXISTS idx_personal_profiles_workspace;")

    # Drop tables (order matters due to foreign key)
    op.execute("DROP TABLE IF EXISTS personal_profile_avatars;")
    op.execute("DROP TABLE IF EXISTS personal_profiles;")
