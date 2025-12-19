"""Add galleries, sub_galleries, and gallery_assets tables.

Revision ID: 0002
Revises: 0001
Create Date: 2025-12-17
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Galleries table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS galleries (
            gallery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description VARCHAR(1000),
            client_name VARCHAR(255),
            status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
            branding_profile_id UUID,
            portal_language VARCHAR(10),
            layout_style VARCHAR(50) DEFAULT 'tabs' CHECK (layout_style IN ('tabs', 'continuous')),
            theme VARCHAR(50) DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
            download_policy VARCHAR(50) DEFAULT 'view_only' CHECK (download_policy IN ('view_only', 'web_only', 'watermarked_only', 'original_allowed')),
            exif_visible BOOLEAN DEFAULT FALSE,
            password_hash VARCHAR(255),
            email_registration_required BOOLEAN DEFAULT FALSE,
            expires_at TIMESTAMPTZ,
            custom_domain VARCHAR(255),
            cover_asset_id UUID,
            created_by_user_id UUID NOT NULL REFERENCES users(user_id),
            published_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Sub-galleries table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS sub_galleries (
            sub_gallery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            visible BOOLEAN NOT NULL DEFAULT TRUE,
            cover_asset_id UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(gallery_id, name)
        );
        """
    )

    # Gallery assets junction table
    # Note: assets table will be created in a separate migration for storage/ingestion
    # For now, we'll reference it but the foreign key constraint will be added later
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS gallery_assets (
            gallery_asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            sub_gallery_id UUID REFERENCES sub_galleries(sub_gallery_id) ON DELETE SET NULL,
            asset_id UUID NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            visible BOOLEAN NOT NULL DEFAULT TRUE,
            is_private BOOLEAN NOT NULL DEFAULT FALSE,
            access_code_hash VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(gallery_id, asset_id)
        );
        """
    )

    # Client interactions table (for favorites, selections, comments)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_interactions (
            interaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            asset_id UUID,
            type VARCHAR(50) NOT NULL CHECK (type IN ('view', 'favorite', 'select', 'comment', 'download')),
            actor JSONB NOT NULL,
            payload JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for galleries
    op.execute("CREATE INDEX IF NOT EXISTS idx_galleries_workspace ON galleries(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_galleries_workspace_status ON galleries(workspace_id, status);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_galleries_workspace_created ON galleries(workspace_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_galleries_created_by ON galleries(created_by_user_id);")

    # Indexes for sub_galleries
    op.execute("CREATE INDEX IF NOT EXISTS idx_sub_galleries_workspace ON sub_galleries(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_sub_galleries_gallery ON sub_galleries(gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_sub_galleries_gallery_order ON sub_galleries(gallery_id, sort_order);")

    # Indexes for gallery_assets
    op.execute("CREATE INDEX IF NOT EXISTS idx_gallery_assets_workspace ON gallery_assets(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gallery_assets_gallery ON gallery_assets(gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gallery_assets_sub_gallery ON gallery_assets(sub_gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gallery_assets_asset ON gallery_assets(asset_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gallery_assets_gallery_order ON gallery_assets(gallery_id, sort_order);")

    # Indexes for client_interactions
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_interactions_workspace ON client_interactions(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_interactions_gallery ON client_interactions(gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_interactions_asset ON client_interactions(asset_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_interactions_gallery_time ON client_interactions(gallery_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_interactions_asset_time ON client_interactions(asset_id, created_at DESC);")


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_client_interactions_asset_time;")
    op.execute("DROP INDEX IF EXISTS idx_client_interactions_gallery_time;")
    op.execute("DROP INDEX IF EXISTS idx_client_interactions_asset;")
    op.execute("DROP INDEX IF EXISTS idx_client_interactions_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_client_interactions_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_gallery_order;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_asset;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_sub_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_sub_galleries_gallery_order;")
    op.execute("DROP INDEX IF EXISTS idx_sub_galleries_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_sub_galleries_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_galleries_created_by;")
    op.execute("DROP INDEX IF EXISTS idx_galleries_workspace_created;")
    op.execute("DROP INDEX IF EXISTS idx_galleries_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_galleries_workspace;")

    # Drop tables (in reverse order due to foreign keys)
    op.execute("DROP TABLE IF EXISTS client_interactions;")
    op.execute("DROP TABLE IF EXISTS gallery_assets;")
    op.execute("DROP TABLE IF EXISTS sub_galleries;")
    op.execute("DROP TABLE IF EXISTS galleries;")

