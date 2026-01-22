"""Add rating, flag, and color_label columns to gallery_assets table.

Revision ID: 0169
Revises: 0168
Create Date: 2026-01-22

These columns support the Pro Review Mode feature allowing photographers
to rate (0-5 stars), flag (pick/unflagged/reject), and color-label assets
for culling workflow. These are OWNER ratings, not client ratings.
"""

from alembic import op

revision = "0169"
down_revision = "0168"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add rating column (0-5 stars, NULL means unrated)
    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS rating SMALLINT
        CHECK (rating >= 0 AND rating <= 5);
        """
    )

    # Add flag column (pick/unflagged/reject)
    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS flag VARCHAR(20) DEFAULT 'unflagged'
        CHECK (flag IN ('pick', 'unflagged', 'reject'));
        """
    )

    # Add color_label column (Adobe Lightroom compatible colors)
    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS color_label VARCHAR(20) DEFAULT 'none'
        CHECK (color_label IN ('none', 'red', 'yellow', 'green', 'blue', 'purple'));
        """
    )

    # Add rating_updated_at timestamp for sync conflict resolution
    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS rating_updated_at TIMESTAMPTZ;
        """
    )

    # Add rating_updated_by for audit trail
    op.execute(
        """
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS rating_updated_by UUID;
        """
    )

    # Index for filtering by rating (common in Review Mode)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_assets_rating
        ON gallery_assets (gallery_id, rating)
        WHERE rating IS NOT NULL;
        """
    )

    # Index for filtering by flag (common in Review Mode)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_assets_flag
        ON gallery_assets (gallery_id, flag)
        WHERE flag != 'unflagged';
        """
    )

    # Index for filtering by color_label
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_assets_color_label
        ON gallery_assets (gallery_id, color_label)
        WHERE color_label != 'none';
        """
    )

    # Composite index for Review Mode filtering (rating + flag)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_assets_review_filters
        ON gallery_assets (gallery_id, rating, flag, color_label);
        """
    )

    # Add comments for documentation
    op.execute(
        """
        COMMENT ON COLUMN gallery_assets.rating IS
        'Photographer rating 0-5 stars (NULL = unrated, 0 = explicitly no rating)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN gallery_assets.flag IS
        'Photographer flag: pick (selected), unflagged (neutral), reject (to delete)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN gallery_assets.color_label IS
        'Adobe Lightroom compatible color labels for categorization';
        """
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_review_filters;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_color_label;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_flag;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_rating;")

    # Drop columns
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS rating_updated_by;")
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS rating_updated_at;")
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS color_label;")
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS flag;")
    op.execute("ALTER TABLE gallery_assets DROP COLUMN IF EXISTS rating;")
