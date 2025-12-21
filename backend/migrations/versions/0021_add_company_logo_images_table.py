"""Add company_logo_images table to store logo image data.

This migration creates a table to store company logo thumbnail images,
similar to avatar_images for clients.

Revision ID: 0021
Revises: 0020
Create Date: 2025-12-21
"""

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create company_logo_images table to store logo data
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS company_logo_images (
            logo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            profile_id UUID NOT NULL REFERENCES company_profiles(profile_id) ON DELETE CASCADE,

            -- Image data for different sizes (stored as WebP bytes)
            image_64 BYTEA,   -- 64x64 thumbnail
            image_128 BYTEA,  -- 128x128 thumbnail
            image_256 BYTEA,  -- 256x256 thumbnail
            image_512 BYTEA,  -- 512x512 for high-res displays

            -- Metadata
            content_type VARCHAR(50) NOT NULL DEFAULT 'image/webp',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- One logo per profile
            UNIQUE (workspace_id, profile_id)
        );
        """
    )

    # Index for fast lookup
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_company_logo_images_profile ON company_logo_images(workspace_id, profile_id);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS company_logo_images;")
