"""Gallery Feature Completion - schema changes for 10 missing features.

Adds:
- daily_download_limit and slideshow_audio_url to galleries table
- parent_sub_gallery_id and depth to sub_galleries table with max depth constraint
- utm_params JSONB column to magic_links table
- gallery_password_resets table with indexes
- Validation trigger for sub-gallery hierarchy

Revision ID: 0162
Revises: 0161
Create Date: 2026-01-10
"""

from alembic import op

revision = "0162"
down_revision = "0161"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply gallery feature completion schema changes."""

    # =========================================================================
    # 1. Add daily_download_limit and slideshow_audio_url to galleries
    # =========================================================================
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS daily_download_limit INTEGER DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS slideshow_audio_url VARCHAR(512) DEFAULT NULL;
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN galleries.daily_download_limit IS
        'Max downloads per client per day. NULL = unlimited. Values: 5, 10, 25, 50, 100';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN galleries.slideshow_audio_url IS
        'Cloudflare R2 URL for slideshow background music. Max 10MB.';
        """
    )

    # =========================================================================
    # 2. Add parent_sub_gallery_id and depth to sub_galleries
    # =========================================================================
    op.execute(
        """
        ALTER TABLE sub_galleries
        ADD COLUMN IF NOT EXISTS parent_sub_gallery_id UUID REFERENCES sub_galleries(sub_gallery_id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0 NOT NULL;
        """
    )

    # Add constraint for max nesting depth (0, 1, 2 = 3 levels total)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'max_nesting_depth'
            ) THEN
                ALTER TABLE sub_galleries
                ADD CONSTRAINT max_nesting_depth CHECK (depth >= 0 AND depth <= 2);
            END IF;
        END $$;
        """
    )

    # Indexes for hierarchy queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sub_galleries_parent
        ON sub_galleries(parent_sub_gallery_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_sub_galleries_depth
        ON sub_galleries(gallery_id, depth);
        """
    )

    # =========================================================================
    # 3. Create validation trigger for sub-gallery hierarchy
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION validate_sub_gallery_hierarchy()
        RETURNS TRIGGER AS $$
        DECLARE
            parent_depth INTEGER;
            parent_gallery_id UUID;
        BEGIN
            -- If parent_sub_gallery_id is set, validate it
            IF NEW.parent_sub_gallery_id IS NOT NULL THEN
                -- Get parent's gallery_id and depth
                SELECT gallery_id, depth INTO parent_gallery_id, parent_depth
                FROM sub_galleries
                WHERE sub_gallery_id = NEW.parent_sub_gallery_id;

                -- Ensure parent exists and belongs to same gallery
                IF parent_gallery_id IS NULL THEN
                    RAISE EXCEPTION 'Parent sub-gallery does not exist';
                END IF;

                IF parent_gallery_id != NEW.gallery_id THEN
                    RAISE EXCEPTION 'Parent sub-gallery must belong to same gallery';
                END IF;

                -- Set depth based on parent
                NEW.depth := parent_depth + 1;

                -- Check max depth constraint
                IF NEW.depth > 2 THEN
                    RAISE EXCEPTION 'Maximum nesting depth (3 levels) exceeded';
                END IF;
            ELSE
                -- Root level sub-gallery
                NEW.depth := 0;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_validate_sub_gallery_hierarchy ON sub_galleries;
        CREATE TRIGGER trg_validate_sub_gallery_hierarchy
        BEFORE INSERT OR UPDATE ON sub_galleries
        FOR EACH ROW EXECUTE FUNCTION validate_sub_gallery_hierarchy();
        """
    )

    # =========================================================================
    # 4. Add utm_params JSONB column to magic_links
    # =========================================================================
    op.execute(
        """
        ALTER TABLE magic_links
        ADD COLUMN IF NOT EXISTS utm_params JSONB DEFAULT NULL;
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN magic_links.utm_params IS
        'UTM tracking parameters for analytics attribution. Keys: utm_source, utm_medium, utm_campaign, utm_content, utm_term';
        """
    )

    # Index for analytics queries on UTM source
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_utm_source
        ON magic_links((utm_params->>'utm_source'))
        WHERE utm_params IS NOT NULL;
        """
    )

    # =========================================================================
    # 5. Create gallery_password_resets table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS gallery_password_resets (
            reset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for password reset lookups
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_password_resets_gallery
        ON gallery_password_resets(gallery_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gallery_password_resets_expires
        ON gallery_password_resets(expires_at)
        WHERE used_at IS NULL;
        """
    )

    op.execute(
        """
        COMMENT ON TABLE gallery_password_resets IS
        'Track password reset tokens for gallery access recovery. Tokens expire after 1 hour.';
        """
    )

    # =========================================================================
    # 6. Cleanup function for expired password reset tokens
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION cleanup_expired_password_resets()
        RETURNS void AS $$
        BEGIN
            DELETE FROM gallery_password_resets
            WHERE expires_at < now() - INTERVAL '1 day';
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def downgrade() -> None:
    """Reverse gallery feature completion schema changes."""

    # Drop cleanup function
    op.execute("DROP FUNCTION IF EXISTS cleanup_expired_password_resets();")

    # Drop password reset indexes and table
    op.execute("DROP INDEX IF EXISTS idx_gallery_password_resets_expires;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_password_resets_gallery;")
    op.execute("DROP TABLE IF EXISTS gallery_password_resets;")

    # Drop UTM params index and column
    op.execute("DROP INDEX IF EXISTS idx_magic_links_utm_source;")
    op.execute("ALTER TABLE magic_links DROP COLUMN IF EXISTS utm_params;")

    # Drop sub-gallery hierarchy trigger and function
    op.execute("DROP TRIGGER IF EXISTS trg_validate_sub_gallery_hierarchy ON sub_galleries;")
    op.execute("DROP FUNCTION IF EXISTS validate_sub_gallery_hierarchy();")

    # Drop sub-gallery hierarchy indexes and columns
    op.execute("DROP INDEX IF EXISTS idx_sub_galleries_depth;")
    op.execute("DROP INDEX IF EXISTS idx_sub_galleries_parent;")
    op.execute("ALTER TABLE sub_galleries DROP CONSTRAINT IF EXISTS max_nesting_depth;")
    op.execute("ALTER TABLE sub_galleries DROP COLUMN IF EXISTS depth;")
    op.execute("ALTER TABLE sub_galleries DROP COLUMN IF EXISTS parent_sub_gallery_id;")

    # Drop gallery columns
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS slideshow_audio_url;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS daily_download_limit;")
