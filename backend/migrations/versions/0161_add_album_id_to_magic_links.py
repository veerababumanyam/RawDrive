"""Add album support to magic_links table.

Extends magic_links to support album proofing share links:
- Adds 'album' to magic_link_target_type enum
- Adds album_id column with foreign key to albums
- Updates constraint to allow album targeting

Revision ID: 0161
Revises: 0160
Create Date: 2026-01-10
"""

from alembic import op
from sqlalchemy import text

revision = "0161"
down_revision = "0160"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add album support to magic_links table."""

    # =========================================================================
    # 1. Add 'album' to magic_link_target_type enum
    # PostgreSQL requires enum values to be committed before use,
    # so we use AUTOCOMMIT isolation level for this operation.
    # =========================================================================
    connection = op.get_bind()
    connection.execute(
        text("COMMIT")
    )
    connection.execute(
        text("ALTER TYPE magic_link_target_type ADD VALUE IF NOT EXISTS 'album'")
    )
    connection.execute(
        text("BEGIN")
    )

    # =========================================================================
    # 2. Add album_id column to magic_links
    # =========================================================================
    op.execute(
        """
        ALTER TABLE magic_links
        ADD COLUMN IF NOT EXISTS album_id UUID REFERENCES albums(album_id) ON DELETE CASCADE;
        """
    )

    # =========================================================================
    # 3. Create index for album lookups
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_album
        ON magic_links(album_id)
        WHERE album_id IS NOT NULL;
        """
    )

    # =========================================================================
    # 4. Drop existing target_id constraint
    # =========================================================================
    op.execute(
        """
        ALTER TABLE magic_links
        DROP CONSTRAINT IF EXISTS magic_links_target_id_required;
        """
    )

    # =========================================================================
    # 5. Add new constraint including album
    # =========================================================================
    op.execute(
        """
        ALTER TABLE magic_links
        ADD CONSTRAINT magic_links_target_id_required CHECK (
            (target_type = 'gallery' AND target_id IS NULL AND album_id IS NULL) OR
            (target_type = 'album' AND album_id IS NOT NULL AND target_id IS NULL) OR
            (target_type NOT IN ('gallery', 'album') AND target_id IS NOT NULL)
        );
        """
    )

    # =========================================================================
    # 6. Add comment for album_id column
    # =========================================================================
    op.execute(
        """
        COMMENT ON COLUMN magic_links.album_id IS
        'Reference to album for album proofing share links. Required when target_type = album.';
        """
    )


def downgrade() -> None:
    """Remove album support from magic_links.

    NOTE: This will NOT remove 'album' from the enum type as PostgreSQL
    does not support removing enum values. Any magic_links with target_type='album'
    should be deleted before running this migration.
    """
    # Drop constraint
    op.execute(
        """
        ALTER TABLE magic_links
        DROP CONSTRAINT IF EXISTS magic_links_target_id_required;
        """
    )

    # Restore original constraint (without album)
    op.execute(
        """
        ALTER TABLE magic_links
        ADD CONSTRAINT magic_links_target_id_required CHECK (
            (target_type = 'gallery' AND target_id IS NULL) OR
            (target_type != 'gallery' AND target_id IS NOT NULL)
        );
        """
    )

    # Drop index
    op.execute("DROP INDEX IF EXISTS idx_magic_links_album;")

    # Remove column
    op.execute("ALTER TABLE magic_links DROP COLUMN IF EXISTS album_id;")

    # Note: Cannot remove 'album' from enum type in PostgreSQL
    # If needed, recreate the enum type or leave it (unused values are harmless)
