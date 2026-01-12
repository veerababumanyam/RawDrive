"""Add gallery client interaction and advanced settings columns.

Revision ID: 0157
Revises: 0156
Create Date: 2026-01-09

New columns added to galleries table:
- Client interaction: comments_enabled, favorites_enabled, selections_enabled, selection_limit, ratings_enabled
- Advanced config (JSONB): watermark_config, findme_config, slideshow_config, activity_tracking
- Notifications: notify_on_comment, notify_on_favorite, notify_on_selection, notify_on_download
"""

from alembic import op
import sqlalchemy as sa

revision = "0157"
down_revision = "0156"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Client interaction settings
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN DEFAULT TRUE;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS favorites_enabled BOOLEAN DEFAULT TRUE;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS selections_enabled BOOLEAN DEFAULT TRUE;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS selection_limit INTEGER;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS ratings_enabled BOOLEAN DEFAULT FALSE;
        """
    )

    # Advanced configuration (JSONB)
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS watermark_config JSONB;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS findme_config JSONB;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS slideshow_config JSONB;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS activity_tracking JSONB;
        """
    )

    # Notification settings
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS notify_on_comment BOOLEAN DEFAULT TRUE;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS notify_on_favorite BOOLEAN DEFAULT FALSE;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS notify_on_selection BOOLEAN DEFAULT TRUE;
        """
    )

    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS notify_on_download BOOLEAN DEFAULT FALSE;
        """
    )

    # Add column comments for documentation
    op.execute("COMMENT ON COLUMN galleries.comments_enabled IS 'Allow clients to leave comments on photos';")
    op.execute("COMMENT ON COLUMN galleries.favorites_enabled IS 'Allow clients to mark photos as favorites';")
    op.execute("COMMENT ON COLUMN galleries.selections_enabled IS 'Allow clients to select photos for albums/prints';")
    op.execute("COMMENT ON COLUMN galleries.selection_limit IS 'Maximum number of photos clients can select (NULL = unlimited)';")
    op.execute("COMMENT ON COLUMN galleries.ratings_enabled IS 'Allow clients to rate photos 1-5 stars';")
    op.execute("COMMENT ON COLUMN galleries.watermark_config IS 'JSONB: {enabled, position, opacity, scale, custom_watermark_asset_id}';")
    op.execute("COMMENT ON COLUMN galleries.findme_config IS 'JSONB: {enabled, confidence_threshold, max_results, allow_guest_search}';")
    op.execute("COMMENT ON COLUMN galleries.slideshow_config IS 'JSONB: {enabled, interval_seconds, transition, show_captions, loop, autoplay}';")
    op.execute("COMMENT ON COLUMN galleries.activity_tracking IS 'JSONB: {track_views, track_downloads, track_shares, anonymous_mode}';")
    op.execute("COMMENT ON COLUMN galleries.notify_on_comment IS 'Send notification when client leaves a comment';")
    op.execute("COMMENT ON COLUMN galleries.notify_on_favorite IS 'Send notification when client favorites a photo';")
    op.execute("COMMENT ON COLUMN galleries.notify_on_selection IS 'Send notification when client updates selections';")
    op.execute("COMMENT ON COLUMN galleries.notify_on_download IS 'Send notification when client downloads photos';")


def downgrade() -> None:
    # Notification settings
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS notify_on_download;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS notify_on_selection;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS notify_on_favorite;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS notify_on_comment;")

    # Advanced configuration
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS activity_tracking;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS slideshow_config;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS findme_config;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS watermark_config;")

    # Client interaction settings
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS ratings_enabled;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS selection_limit;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS selections_enabled;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS favorites_enabled;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS comments_enabled;")
