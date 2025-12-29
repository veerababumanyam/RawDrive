"""Add album_title column to magic_links table.

Supports the Public Gallery Branding feature where photographers can
set a custom client-facing title when creating share links.

Revision ID: 0056
Revises: 0055
Create Date: 2025-12-29
"""

from alembic import op

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add album_title column to magic_links."""
    op.execute("""
        ALTER TABLE magic_links
        ADD COLUMN IF NOT EXISTS album_title VARCHAR(200);

        COMMENT ON COLUMN magic_links.album_title IS
        'Client-facing album title displayed on public gallery page. Falls back to gallery title if NULL.';
    """)


def downgrade() -> None:
    """Remove album_title column from magic_links."""
    op.execute("ALTER TABLE magic_links DROP COLUMN IF EXISTS album_title;")
