"""Add tables for Public Profile Editor.

Creates schema for:
- themes: Pre-built design templates with colors, typography, layouts
- theme_customizations: User-specific theme modifications
- custom_fonts: User-uploaded brand fonts
- brand_assets: Logo variants and brand visual assets
- profile_versions: Version control for profile snapshots
- profile_visibility_configs: Granular per-field visibility controls
- preview_links: Shareable preview links for collaboration

Extends:
- branding_profiles: Additional theme and customization fields

Revision ID: 0017
Revises: 0016
Create Date: 2025-12-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. THEMES TABLE - Pre-built design templates
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS themes (
            theme_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            category VARCHAR(50) NOT NULL CHECK (category IN ('minimal', 'bold', 'elegant', 'modern', 'creative')),
            description TEXT,
            preview_image_url TEXT,

            -- Theme configuration (JSONB)
            -- base_colors: { primary, secondary, accent, neutral[], gradients[] }
            base_colors JSONB NOT NULL DEFAULT '{}',

            -- default_typography: { heading_font, body_font, accent_font }
            default_typography JSONB NOT NULL DEFAULT '{}',

            -- layout_config: { spacing, hero_style, section_layout }
            layout_config JSONB NOT NULL DEFAULT '{}',

            -- Theme metadata
            is_premium BOOLEAN DEFAULT false,
            is_popular BOOLEAN DEFAULT false,
            usage_count INTEGER DEFAULT 0,

            -- Variants support
            supports_dark_mode BOOLEAN DEFAULT false,
            variants JSONB DEFAULT '[]',

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for themes
    op.execute("CREATE INDEX IF NOT EXISTS idx_themes_category ON themes(category);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_themes_popular ON themes(is_popular, usage_count DESC);")

    # =========================================================================
    # 2. THEME_CUSTOMIZATIONS TABLE - User-specific modifications
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS theme_customizations (
            customization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            theme_id UUID NOT NULL REFERENCES themes(theme_id) ON DELETE CASCADE,
            name VARCHAR(100),

            -- Customized values (override theme defaults)
            custom_colors JSONB DEFAULT '{}',
            custom_typography JSONB DEFAULT '{}',
            custom_layout JSONB DEFAULT '{}',

            -- Preset flag for saved configurations
            is_preset BOOLEAN DEFAULT false,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for theme_customizations
    op.execute("CREATE INDEX IF NOT EXISTS idx_theme_customizations_workspace ON theme_customizations(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_theme_customizations_theme ON theme_customizations(theme_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_theme_customizations_presets ON theme_customizations(workspace_id, is_preset) WHERE is_preset = true;")

    # =========================================================================
    # 3. CUSTOM_FONTS TABLE - User-uploaded brand fonts
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS custom_fonts (
            custom_font_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            font_family VARCHAR(100) NOT NULL,

            -- Font files (JSONB array)
            -- [{ file_id, object_key, weight, style, format }]
            font_files JSONB NOT NULL DEFAULT '[]',

            -- Metadata
            file_size_bytes INTEGER NOT NULL DEFAULT 0,
            format VARCHAR(20) NOT NULL CHECK (format IN ('woff2', 'ttf', 'woff')),

            -- Security validation
            is_validated BOOLEAN DEFAULT false,
            validation_date TIMESTAMPTZ,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Unique font family per workspace
            CONSTRAINT uq_custom_fonts_workspace_family UNIQUE(workspace_id, font_family)
        );
        """
    )

    # Indexes for custom_fonts
    op.execute("CREATE INDEX IF NOT EXISTS idx_custom_fonts_workspace ON custom_fonts(workspace_id);")

    # =========================================================================
    # 4. BRAND_ASSETS TABLE - Logo variants and brand assets
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS brand_assets (
            asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN ('logo', 'favicon', 'cover')),
            variant VARCHAR(20) NOT NULL CHECK (variant IN ('full', 'icon', 'light', 'dark')),

            -- Asset storage
            object_key TEXT NOT NULL,

            -- Optimized formats (JSONB)
            -- { webp: key, avif: key, png: key }
            optimized_formats JSONB DEFAULT '{}',

            -- Dimensions and size
            width INTEGER NOT NULL DEFAULT 0,
            height INTEGER NOT NULL DEFAULT 0,
            file_size_bytes INTEGER NOT NULL DEFAULT 0,

            -- Context recommendations
            -- ['light-backgrounds', 'dark-backgrounds']
            recommended_for TEXT[] DEFAULT '{}',

            -- Version control
            version INTEGER DEFAULT 1,
            is_current BOOLEAN DEFAULT true,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for brand_assets
    op.execute("CREATE INDEX IF NOT EXISTS idx_brand_assets_workspace ON brand_assets(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_brand_assets_current ON brand_assets(workspace_id, asset_type, is_current) WHERE is_current = true;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_brand_assets_type_variant ON brand_assets(workspace_id, asset_type, variant);")

    # =========================================================================
    # 5. PROFILE_VERSIONS TABLE - Version control for snapshots
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS profile_versions (
            version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            profile_type VARCHAR(20) NOT NULL CHECK (profile_type IN ('company', 'photographer')),
            profile_id UUID NOT NULL,

            -- Snapshot data (JSONB)
            profile_snapshot JSONB NOT NULL DEFAULT '{}',
            visibility_snapshot JSONB NOT NULL DEFAULT '{}',
            theme_snapshot JSONB NOT NULL DEFAULT '{}',

            -- Version metadata
            version_number INTEGER NOT NULL DEFAULT 1,
            label VARCHAR(200),
            is_auto_snapshot BOOLEAN DEFAULT false,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by UUID
        );
        """
    )

    # Indexes for profile_versions
    op.execute("CREATE INDEX IF NOT EXISTS idx_profile_versions_workspace ON profile_versions(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_profile_versions_profile ON profile_versions(workspace_id, profile_type, profile_id, created_at DESC);")

    # =========================================================================
    # 6. PROFILE_VISIBILITY_CONFIGS TABLE - Granular visibility controls
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS profile_visibility_configs (
            visibility_config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            profile_type VARCHAR(20) NOT NULL CHECK (profile_type IN ('company', 'photographer')),
            profile_id UUID NOT NULL,

            -- Field visibility map (JSONB)
            -- { field_name: boolean }
            field_visibility JSONB NOT NULL DEFAULT '{}',

            -- Per-platform social media visibility (JSONB)
            -- { instagram: true, facebook: false, ... }
            social_visibility JSONB NOT NULL DEFAULT '{}',

            -- Preset support
            preset_name VARCHAR(100),
            is_default BOOLEAN DEFAULT false,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- One config per profile
            CONSTRAINT uq_visibility_configs_profile UNIQUE(workspace_id, profile_type, profile_id)
        );
        """
    )

    # Indexes for profile_visibility_configs
    op.execute("CREATE INDEX IF NOT EXISTS idx_visibility_configs_workspace ON profile_visibility_configs(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_visibility_configs_profile ON profile_visibility_configs(workspace_id, profile_type, profile_id);")

    # =========================================================================
    # 7. PREVIEW_LINKS TABLE - Shareable preview links for collaboration
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS preview_links (
            link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            profile_id UUID NOT NULL,

            -- Secure token for access
            token VARCHAR(64) NOT NULL UNIQUE,

            -- Expiration and security
            expires_at TIMESTAMPTZ NOT NULL,
            password_hash VARCHAR(255),

            -- View tracking
            view_count INTEGER DEFAULT 0,
            last_viewed_at TIMESTAMPTZ,

            -- Status
            is_revoked BOOLEAN DEFAULT false,
            revoked_at TIMESTAMPTZ,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by UUID
        );
        """
    )

    # Indexes for preview_links
    op.execute("CREATE INDEX IF NOT EXISTS idx_preview_links_token ON preview_links(token);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_preview_links_workspace ON preview_links(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_preview_links_expires ON preview_links(expires_at) WHERE is_revoked = false;")

    # =========================================================================
    # 8. PREVIEW_COMMENTS TABLE - Comments and feedback on previews
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS preview_comments (
            comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            link_id UUID NOT NULL REFERENCES preview_links(link_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Comment content
            content TEXT NOT NULL,
            element_selector VARCHAR(255),

            -- Commenter info (could be external reviewer)
            commenter_name VARCHAR(100),
            commenter_email VARCHAR(255),

            -- Resolution tracking
            is_resolved BOOLEAN DEFAULT false,
            resolved_at TIMESTAMPTZ,
            resolved_by UUID,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for preview_comments
    op.execute("CREATE INDEX IF NOT EXISTS idx_preview_comments_link ON preview_comments(link_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_preview_comments_workspace ON preview_comments(workspace_id);")

    # =========================================================================
    # 9. PROFILE_ANALYTICS TABLE - Analytics for public profile views
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS profile_analytics (
            analytics_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            profile_id UUID NOT NULL,

            -- Event type
            event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('view', 'link_click', 'vcard_download', 'qr_scan')),

            -- Event details
            link_url TEXT,
            link_label VARCHAR(100),

            -- Visitor info (anonymized for privacy)
            visitor_country VARCHAR(2),
            visitor_region VARCHAR(100),
            referrer_source VARCHAR(50),
            referrer_url TEXT,

            -- Session tracking
            session_duration_seconds INTEGER,

            -- Timestamp
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for profile_analytics (optimized for time-series queries)
    op.execute("CREATE INDEX IF NOT EXISTS idx_profile_analytics_workspace ON profile_analytics(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_profile_analytics_profile ON profile_analytics(workspace_id, profile_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_profile_analytics_time ON profile_analytics(workspace_id, profile_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_profile_analytics_event ON profile_analytics(workspace_id, event_type, created_at DESC);")

    # =========================================================================
    # 10. EXTEND BRANDING_PROFILES TABLE (if exists) or COMPANY_PROFILES
    # =========================================================================
    # Since company_profiles exists and contains branding fields, extend it
    op.execute(
        """
        DO $$
        BEGIN
            -- Add theme_id if not exists
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'company_profiles' AND column_name = 'theme_id'
            ) THEN
                ALTER TABLE company_profiles
                ADD COLUMN theme_id UUID REFERENCES themes(theme_id) ON DELETE SET NULL;
            END IF;

            -- Add theme_customization_id if not exists
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'company_profiles' AND column_name = 'theme_customization_id'
            ) THEN
                ALTER TABLE company_profiles
                ADD COLUMN theme_customization_id UUID REFERENCES theme_customizations(customization_id) ON DELETE SET NULL;
            END IF;

            -- Add color_palette if not exists
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'company_profiles' AND column_name = 'color_palette'
            ) THEN
                ALTER TABLE company_profiles
                ADD COLUMN color_palette JSONB DEFAULT '{}';
            END IF;

            -- Add typography_config if not exists
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'company_profiles' AND column_name = 'typography_config'
            ) THEN
                ALTER TABLE company_profiles
                ADD COLUMN typography_config JSONB DEFAULT '{}';
            END IF;

            -- Add layout_preferences if not exists
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'company_profiles' AND column_name = 'layout_preferences'
            ) THEN
                ALTER TABLE company_profiles
                ADD COLUMN layout_preferences JSONB DEFAULT '{}';
            END IF;

            -- Add is_published if not exists
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'company_profiles' AND column_name = 'is_published'
            ) THEN
                ALTER TABLE company_profiles
                ADD COLUMN is_published BOOLEAN DEFAULT true;
            END IF;

            -- Add published_at if not exists
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'company_profiles' AND column_name = 'published_at'
            ) THEN
                ALTER TABLE company_profiles
                ADD COLUMN published_at TIMESTAMPTZ;
            END IF;
        END $$;
        """
    )

    # Add index for theme lookups on company_profiles
    op.execute("CREATE INDEX IF NOT EXISTS idx_company_profiles_theme ON company_profiles(theme_id) WHERE theme_id IS NOT NULL;")


def downgrade() -> None:
    # Remove columns from company_profiles
    op.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE company_profiles DROP COLUMN IF EXISTS theme_id;
            ALTER TABLE company_profiles DROP COLUMN IF EXISTS theme_customization_id;
            ALTER TABLE company_profiles DROP COLUMN IF EXISTS color_palette;
            ALTER TABLE company_profiles DROP COLUMN IF EXISTS typography_config;
            ALTER TABLE company_profiles DROP COLUMN IF EXISTS layout_preferences;
            ALTER TABLE company_profiles DROP COLUMN IF EXISTS is_published;
            ALTER TABLE company_profiles DROP COLUMN IF EXISTS published_at;
        END $$;
        """
    )

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_company_profiles_theme;")
    op.execute("DROP INDEX IF EXISTS idx_profile_analytics_event;")
    op.execute("DROP INDEX IF EXISTS idx_profile_analytics_time;")
    op.execute("DROP INDEX IF EXISTS idx_profile_analytics_profile;")
    op.execute("DROP INDEX IF EXISTS idx_profile_analytics_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_preview_comments_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_preview_comments_link;")
    op.execute("DROP INDEX IF EXISTS idx_preview_links_expires;")
    op.execute("DROP INDEX IF EXISTS idx_preview_links_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_preview_links_token;")
    op.execute("DROP INDEX IF EXISTS idx_visibility_configs_profile;")
    op.execute("DROP INDEX IF EXISTS idx_visibility_configs_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_profile_versions_profile;")
    op.execute("DROP INDEX IF EXISTS idx_profile_versions_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_brand_assets_type_variant;")
    op.execute("DROP INDEX IF EXISTS idx_brand_assets_current;")
    op.execute("DROP INDEX IF EXISTS idx_brand_assets_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_custom_fonts_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_theme_customizations_presets;")
    op.execute("DROP INDEX IF EXISTS idx_theme_customizations_theme;")
    op.execute("DROP INDEX IF EXISTS idx_theme_customizations_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_themes_popular;")
    op.execute("DROP INDEX IF EXISTS idx_themes_category;")

    # Drop tables in reverse order (respect foreign key constraints)
    op.execute("DROP TABLE IF EXISTS profile_analytics;")
    op.execute("DROP TABLE IF EXISTS preview_comments;")
    op.execute("DROP TABLE IF EXISTS preview_links;")
    op.execute("DROP TABLE IF EXISTS profile_visibility_configs;")
    op.execute("DROP TABLE IF EXISTS profile_versions;")
    op.execute("DROP TABLE IF EXISTS brand_assets;")
    op.execute("DROP TABLE IF EXISTS custom_fonts;")
    op.execute("DROP TABLE IF EXISTS theme_customizations;")
    op.execute("DROP TABLE IF EXISTS themes;")
