"""Add partial index on gallery_assets(gallery_id, visible) for face search.

Revision ID: 0201
Revises: 0200
Create Date: 2026-03-20

Description:
    Adds a partial index on gallery_assets(gallery_id, visible) WHERE visible = TRUE.
    This optimizes face search queries that filter visible assets within a gallery,
    as specified in the FaceID feature flow documentation.

    Query pattern optimized:
        SELECT * FROM gallery_assets
        WHERE gallery_id = $1 AND visible = TRUE

    Note: This is distinct from idx_gallery_assets_workspace_subgallery_visible
    (added in 0192) which indexes (workspace_id, sub_gallery_id, visible).
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0201"
down_revision = "0200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add partial index on gallery_assets for visible assets by gallery."""
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gallery_assets_gallery_visible
        ON gallery_assets (gallery_id, visible)
        WHERE visible = TRUE;
    """)


def downgrade() -> None:
    """Remove gallery_assets visible index."""
    op.execute("DROP INDEX IF EXISTS idx_gallery_assets_gallery_visible;")
