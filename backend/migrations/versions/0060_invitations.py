"""Create invitations table for Save The Date feature.

This migration creates:
- invitations: Core invitation entity with event details, RSVP settings, and customization

Security considerations:
- Workspace isolation enforced via workspace_id NOT NULL
- Password hashes stored with argon2id (via application layer)
- Slug uniqueness per workspace prevents enumeration

Feature: 016-save-the-date
Revision ID: 0060
Revises: 0059
Create Date: 2025-12-30
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitations table."""

    # =========================================================================
    # 1. Create invitation_status enum
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
                CREATE TYPE invitation_status AS ENUM ('draft', 'published', 'archived', 'deleted');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create invitation_event_type enum
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_event_type') THEN
                CREATE TYPE invitation_event_type AS ENUM (
                    'wedding', 'birthday', 'anniversary', 'baby_shower',
                    'engagement', 'festival', 'corporate', 'other'
                );
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 3. Create invitations table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE digital_invitations (
            -- Primary key
            invitation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation (REQUIRED)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Template reference
            template_id UUID REFERENCES invitation_templates(template_id) ON DELETE SET NULL,
            customization JSONB DEFAULT '{}'::JSONB,

            -- Identity
            title VARCHAR(300) NOT NULL,
            slug VARCHAR(300),
            description TEXT,

            -- Event details
            event_type invitation_event_type NOT NULL DEFAULT 'wedding',
            event_datetime TIMESTAMPTZ NOT NULL,
            event_end_datetime TIMESTAMPTZ,
            event_timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',

            -- Venue information
            venue_name VARCHAR(300),
            venue_address TEXT,
            venue_city VARCHAR(100),
            venue_state VARCHAR(100),
            venue_country VARCHAR(100) DEFAULT 'India',
            venue_postal_code VARCHAR(20),
            venue_latitude DECIMAL(10, 8),
            venue_longitude DECIMAL(11, 8),
            venue_map_url TEXT,

            -- Host information
            host_names TEXT[],
            host_contact_phone VARCHAR(20),
            host_contact_email VARCHAR(255),

            -- RSVP settings
            rsvp_enabled BOOLEAN DEFAULT TRUE,
            rsvp_deadline TIMESTAMPTZ,
            rsvp_max_party_size INTEGER DEFAULT 10,
            rsvp_collect_dietary BOOLEAN DEFAULT FALSE,
            rsvp_collect_phone BOOLEAN DEFAULT FALSE,
            rsvp_custom_questions JSONB DEFAULT '[]'::JSONB,

            -- Cover image
            cover_image_url TEXT,
            cover_image_object_key TEXT,

            -- Languages
            primary_language VARCHAR(10) DEFAULT 'en-IN',
            secondary_language VARCHAR(10),
            content_i18n JSONB DEFAULT '{}'::JSONB,

            -- Magic link integration
            magic_link_id UUID REFERENCES magic_links(link_id) ON DELETE SET NULL,
            public_url TEXT,

            -- Security (password protection)
            password_protected BOOLEAN DEFAULT FALSE,
            password_hash VARCHAR(255),
            pin_protected BOOLEAN DEFAULT FALSE,
            pin_hash VARCHAR(255),

            -- Status
            status invitation_status NOT NULL DEFAULT 'draft',
            published_at TIMESTAMPTZ,
            archived_at TIMESTAMPTZ,

            -- Auto-deletion
            auto_delete_enabled BOOLEAN DEFAULT TRUE,
            auto_delete_days INTEGER DEFAULT 7,
            scheduled_deletion_at TIMESTAMPTZ,

            -- Analytics (denormalized for performance)
            view_count INTEGER DEFAULT 0,
            unique_view_count INTEGER DEFAULT 0,
            rsvp_count INTEGER DEFAULT 0,

            -- Notification preferences
            notification_preference VARCHAR(20) DEFAULT 'immediate'
                CHECK (notification_preference IN ('immediate', 'daily_digest', 'disabled')),

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,

            -- Constraints
            CONSTRAINT digital_invitations_slug_workspace_unique UNIQUE (workspace_id, slug),
            CONSTRAINT digital_invitations_rsvp_max_party_size_positive CHECK (rsvp_max_party_size > 0 AND rsvp_max_party_size <= 50),
            CONSTRAINT digital_invitations_auto_delete_days_valid CHECK (auto_delete_days > 0 AND auto_delete_days <= 365)
        );
        """
    )

    # =========================================================================
    # 4. Create indexes for query optimization
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_workspace
        ON digital_invitations(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_workspace_status
        ON digital_invitations(workspace_id, status);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_slug
        ON digital_invitations(slug)
        WHERE slug IS NOT NULL;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_event_datetime
        ON digital_invitations(event_datetime);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_scheduled_deletion
        ON digital_invitations(scheduled_deletion_at)
        WHERE auto_delete_enabled = TRUE AND status != 'deleted';
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_magic_link
        ON digital_invitations(magic_link_id)
        WHERE magic_link_id IS NOT NULL;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_created_by
        ON digital_invitations(created_by_user_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_template
        ON digital_invitations(template_id)
        WHERE template_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 5. Create trigger for automatic updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_digital_invitations_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_digital_invitations_updated_at ON digital_invitations;
        CREATE TRIGGER trigger_digital_invitations_updated_at
            BEFORE UPDATE ON digital_invitations
            FOR EACH ROW
            EXECUTE FUNCTION update_digital_invitations_updated_at();
        """
    )

    # =========================================================================
    # 6. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE digital_invitations IS
        'Core Save The Date digital invitations with event details, RSVP settings, and customization';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN digital_invitations.customization IS
        'JSONB overlay on template layout: colors, fonts, custom content';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN digital_invitations.rsvp_custom_questions IS
        'Array of custom RSVP questions: [{"question": "...", "type": "text|select|checkbox", "required": bool}]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN digital_invitations.scheduled_deletion_at IS
        'Computed: event_datetime + auto_delete_days. Used by cleanup scheduler.';
        """
    )


def downgrade() -> None:
    """Remove invitations table and related enums."""
    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_digital_invitations_updated_at ON digital_invitations;")
    op.execute("DROP FUNCTION IF EXISTS update_digital_invitations_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_template;")
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_created_by;")
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_magic_link;")
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_scheduled_deletion;")
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_event_datetime;")
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_slug;")
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_workspace;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS digital_invitations;")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS invitation_event_type;")
    op.execute("DROP TYPE IF EXISTS invitation_status;")
