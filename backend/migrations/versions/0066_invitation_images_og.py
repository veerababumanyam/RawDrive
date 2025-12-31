"""Add og_image_url column for Open Graph social sharing optimization.

This migration adds:
- og_image_url: Pre-generated 1200x630px image for social sharing previews

When cover images are uploaded, an OG-optimized variant (1200x630px)
will be generated and stored for use in Open Graph and Twitter Card meta tags.
This ensures optimal preview images on WhatsApp, Facebook, Twitter, etc.

Feature: 016-save-the-date (Phase 8: WhatsApp-Optimized Sharing)
Revision ID: 0066
Revises: 0065
Create Date: 2025-12-30
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add og_image_url column to invitation_images table."""

    # Add og_image_url column for OG-optimized images (1200x630px)
    op.execute(
        """
        ALTER TABLE invitation_images
        ADD COLUMN IF NOT EXISTS og_image_url TEXT;
        """
    )

    # Add og_object_key for storage tracking
    op.execute(
        """
        ALTER TABLE invitation_images
        ADD COLUMN IF NOT EXISTS og_object_key TEXT;
        """
    )

    # Add documentation
    op.execute(
        """
        COMMENT ON COLUMN invitation_images.og_image_url IS
        'Pre-generated 1200x630px image URL for Open Graph/Twitter Card social previews';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_images.og_object_key IS
        'R2/S3 storage key for OG image: workspaces/{workspace_id}/invitations/{invitation_id}/images/og/{filename}';
        """
    )


def downgrade() -> None:
    """Remove og_image_url columns."""
    op.execute("ALTER TABLE invitation_images DROP COLUMN IF EXISTS og_object_key;")
    op.execute("ALTER TABLE invitation_images DROP COLUMN IF EXISTS og_image_url;")
