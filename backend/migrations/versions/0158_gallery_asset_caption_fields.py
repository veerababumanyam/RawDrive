"""Add caption fields to gallery_assets table.

Revision ID: 0158
Revises: 0157
Create Date: 2026-01-09

New columns added to gallery_assets table:
- caption: Text caption for the photo
- caption_visible: Whether the caption is visible to clients
- average_rating: Aggregated average star rating from clients
"""

from alembic import op
import sqlalchemy as sa

revision = "0158"
down_revision = "0157"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Caption fields
    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS caption TEXT;
        """
    )

    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS caption_visible BOOLEAN DEFAULT TRUE;
        """
    )

    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2);
        """
    )

    # Add column comments
    op.execute("COMMENT ON COLUMN gallery_assets.caption IS 'Photo caption text visible to clients';")
    op.execute("COMMENT ON COLUMN gallery_assets.caption_visible IS 'Whether the caption is displayed to clients';")
    op.execute("COMMENT ON COLUMN gallery_assets.average_rating IS 'Average star rating from client ratings (1.00-5.00)';")

    # Create index for rating sorting
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_assets_average_rating
        ON gallery_assets (gallery_id, average_rating DESC NULLS LAST)
        WHERE average_rating IS NOT NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_average_rating;")
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS average_rating;")
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS caption_visible;")
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS caption;")
