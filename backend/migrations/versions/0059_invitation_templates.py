"""Create invitation_templates table for Save The Date feature.

This migration creates:
- invitation_templates: System and workspace-specific invitation templates
- Extends magic_link_target_type enum to include 'invitation'

Security considerations:
- All templates enforce workspace isolation (NULL = system template)
- JSONB layout supports flexible template customization

Feature: 016-save-the-date
Revision ID: 0059
Revises: 0058
Create Date: 2025-12-30
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_templates table and extend magic_link_target_type enum."""

    # =========================================================================
    # 1. Extend magic_link_target_type enum to include 'invitation'
    # =========================================================================
    op.execute(
        """
        ALTER TYPE magic_link_target_type ADD VALUE IF NOT EXISTS 'invitation';
        """
    )

    # =========================================================================
    # 2. Create invitation_templates table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invitation_templates (
            -- Primary key
            template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Workspace scoping (NULL = system template available to all)
            workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Identity
            name VARCHAR(200) NOT NULL,
            slug VARCHAR(200) NOT NULL,
            description TEXT,

            -- Classification
            category VARCHAR(50) NOT NULL CHECK (category IN (
                'wedding', 'birthday', 'anniversary', 'baby_shower',
                'engagement', 'festival', 'corporate', 'other'
            )),
            subcategory VARCHAR(50),
            tags TEXT[] DEFAULT ARRAY[]::TEXT[],

            -- Template Content (JSONB for flexible schema)
            layout JSONB NOT NULL DEFAULT '{}'::JSONB,
            content_i18n JSONB DEFAULT '{}'::JSONB,
            supported_languages TEXT[] DEFAULT ARRAY['en-IN'],

            -- Preview Images
            preview_image_url TEXT,
            thumbnail_url TEXT,

            -- Status
            is_active BOOLEAN DEFAULT TRUE,
            is_premium BOOLEAN DEFAULT FALSE,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Constraints: slug unique per workspace (NULLS NOT DISTINCT for system templates)
            CONSTRAINT invitation_templates_slug_workspace_unique
                UNIQUE NULLS NOT DISTINCT (workspace_id, slug)
        );
        """
    )

    # =========================================================================
    # 3. Create indexes for query optimization
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_templates_workspace
        ON invitation_templates(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_templates_category
        ON invitation_templates(category);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_templates_active
        ON invitation_templates(is_active)
        WHERE is_active = TRUE;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_templates_layout
        ON invitation_templates USING GIN (layout);
        """
    )

    # =========================================================================
    # 4. Create trigger for automatic updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_invitation_templates_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_invitation_templates_updated_at ON invitation_templates;
        CREATE TRIGGER trigger_invitation_templates_updated_at
            BEFORE UPDATE ON invitation_templates
            FOR EACH ROW
            EXECUTE FUNCTION update_invitation_templates_updated_at();
        """
    )

    # =========================================================================
    # 5. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE invitation_templates IS
        'System and workspace-specific templates for Save The Date digital invitations';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_templates.workspace_id IS
        'NULL for system templates (available to all workspaces), non-NULL for workspace-specific custom templates';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_templates.layout IS
        'JSONB template configuration: sections, fonts, colors, positions, assets';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_templates.content_i18n IS
        'Language-specific default content: {"en-IN": {"header": "You are Invited"}, "hi-IN": {...}}';
        """
    )


def downgrade() -> None:
    """Remove invitation_templates table.

    Note: Cannot remove enum value in PostgreSQL without recreating the type.
    The 'invitation' value remains in magic_link_target_type.
    """
    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_invitation_templates_updated_at ON invitation_templates;")
    op.execute("DROP FUNCTION IF EXISTS update_invitation_templates_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_templates_layout;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_templates_active;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_templates_category;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_templates_workspace;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS invitation_templates;")
