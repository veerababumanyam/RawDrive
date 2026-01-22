"""Create gallery_design_templates table for custom and system templates.

Revision ID: 0168
Revises: 0167
Create Date: 2026-01-22 10:45:00.000000

This migration creates the gallery_design_templates table for storing reusable
Gallery Design Studio configurations. Supports both system templates (workspace_id=NULL)
and workspace-specific custom templates.

Feature: Enhancement 3 - Custom Templates
Task: Template persistence layer

Schema:
- template_id: Unique identifier (UUID)
- workspace_id: Workspace association (NULL = system template)
- name: Template name (required, unique per workspace)
- description: Template description (optional)
- category: Template category (wedding, portrait, event, product, landscape, other)
- tags: Array of searchable tags
- design_config: JSONB with complete GalleryDesignConfig structure
- thumbnail_url: URL to template preview (640x360px, 16:9)
- thumbnail_asset_id: Reference to R2 stored thumbnail
- is_active: Soft-delete flag
- is_system: Flag for system templates
- created_at/updated_at: Timestamps
- created_by_user_id: Creator tracking

Indexes:
- workspace_id (for filtered queries)
- category (for category filtering)
- tags[] (GIN for tag search)
- (workspace_id, name) UNIQUE constraint
"""

from alembic import op

revision = "0168"
down_revision = "0167"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create gallery_design_templates table with all indexes and constraints."""

    # Create the main table
    op.execute("""
        CREATE TABLE IF NOT EXISTS gallery_design_templates (
            -- ===================================================================
            -- PRIMARY KEY AND WORKSPACE ASSOCIATION
            -- ===================================================================

            -- Unique template identifier
            template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Workspace association (NULL = system template available to all)
            workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- ===================================================================
            -- TEMPLATE METADATA
            -- ===================================================================

            -- Template name (required)
            name VARCHAR(200) NOT NULL,

            -- Template description (optional)
            description TEXT,

            -- Template category for organization
            category VARCHAR(50) NOT NULL DEFAULT 'other'
                CHECK (category IN (
                    'wedding',
                    'portrait',
                    'event',
                    'product',
                    'landscape',
                    'other'
                )),

            -- Searchable tags for filtering
            tags TEXT[] DEFAULT ARRAY[]::TEXT[],

            -- ===================================================================
            -- DESIGN CONFIGURATION
            -- ===================================================================

            -- Complete GalleryDesignConfig as JSONB
            -- Schema includes: cover, typography, theme, grid
            design_config JSONB NOT NULL DEFAULT '{}'::JSONB,

            -- ===================================================================
            -- THUMBNAIL STORAGE
            -- ===================================================================

            -- URL to rendered template preview (640x360px, 16:9)
            -- Generated server-side using Playwright
            thumbnail_url TEXT,

            -- R2 asset reference for thumbnail
            thumbnail_asset_id UUID,

            -- ===================================================================
            -- STATUS AND TRACKING
            -- ===================================================================

            -- Soft-delete flag (is_active=FALSE instead of hard delete)
            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            -- Flag to distinguish system vs custom templates
            is_system BOOLEAN NOT NULL DEFAULT FALSE,

            -- Template creation and modification timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- User who created the template (for workspace-specific tracking)
            created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- ===================================================================
            -- CONSTRAINTS
            -- ===================================================================

            -- Unique constraint: name must be unique per workspace
            -- NULLS NOT DISTINCT allows multiple system templates with same name
            CONSTRAINT gallery_design_templates_name_workspace_unique
                UNIQUE NULLS NOT DISTINCT (workspace_id, name)
        );
    """)

    # =========================================================================
    # CREATE INDEXES FOR QUERY OPTIMIZATION
    # =========================================================================

    # Index for filtering templates by workspace
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gallery_design_templates_workspace
        ON gallery_design_templates(workspace_id);
    """)

    # Index for filtering templates by category
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gallery_design_templates_category
        ON gallery_design_templates(category);
    """)

    # GIN index for fast tag-based searches
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gallery_design_templates_tags
        ON gallery_design_templates USING GIN(tags);
    """)

    # Index for active templates filtering (soft-delete pattern)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gallery_design_templates_active
        ON gallery_design_templates(workspace_id, is_active)
        WHERE is_active = TRUE;
    """)

    # =========================================================================
    # ADD TABLE DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE gallery_design_templates IS
        'Reusable Gallery Design Studio templates. System templates (workspace_id=NULL) available to all workspaces. Custom templates scoped to workspace_id. Supports categories, tags, and soft-deletion via is_active flag.';
    """)

    op.execute("""
        COMMENT ON COLUMN gallery_design_templates.design_config IS
        'Complete GalleryDesignConfig as JSONB: {cover, typography, theme, grid}. Follows same schema as galleries.design_config.';
    """)

    op.execute("""
        COMMENT ON COLUMN gallery_design_templates.thumbnail_url IS
        'Signed URL to 640x360px (16:9) template preview image. Generated server-side using Playwright. 1-hour TTL.';
    """)

    op.execute("""
        COMMENT ON COLUMN gallery_design_templates.is_active IS
        'Soft-delete flag. FALSE indicates template is archived/deleted but retained for audit. Query filters WHERE is_active = TRUE.';
    """)


def downgrade() -> None:
    """Drop gallery_design_templates table and all indexes."""

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_gallery_design_templates_active;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_design_templates_tags;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_design_templates_category;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_design_templates_workspace;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS gallery_design_templates;")
