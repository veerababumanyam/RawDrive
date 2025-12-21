"""Add avatar_images table to store avatar image data.

This migration creates a table to store avatar thumbnail images
for clients, avoiding external storage dependency for small images.

Revision ID: 0020
Revises: 0019
Create Date: 2025-12-21
"""

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create avatar_images table to store thumbnail data
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS avatar_images (
            avatar_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Image data for different sizes (stored as WebP bytes)
            image_64 BYTEA,   -- 64x64 thumbnail
            image_128 BYTEA,  -- 128x128 thumbnail
            image_256 BYTEA,  -- 256x256 thumbnail

            -- Metadata
            content_type VARCHAR(50) NOT NULL DEFAULT 'image/webp',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- One avatar per client
            UNIQUE (workspace_id, client_id)
        );
        """
    )

    # Index for fast lookup
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_avatar_images_client ON avatar_images(workspace_id, client_id);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS avatar_images;")
