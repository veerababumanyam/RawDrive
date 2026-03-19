"""Create gallery_visitor_actions table for per-visitor proofing state.

Revision ID: 0102
Revises: 0101_extend_layout_style
Create Date: 2026-03-19

Stores per-visitor favorites and selections so that Client A's
proofing state does not leak into Client B's view. The existing
gallery_assets.is_favorited / is_selected columns become aggregate
booleans updated by trigger-like application logic.
"""

from alembic import op


# revision identifiers
revision = "0102_gallery_visitor_actions"
down_revision = "0101_extend_layout_style"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE gallery_visitor_actions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            gallery_id UUID NOT NULL,
            visitor_token VARCHAR(255) NOT NULL,
            asset_id UUID NOT NULL,
            action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('favorite', 'select')),
            value BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_visitor_action UNIQUE (gallery_id, visitor_token, asset_id, action_type)
        )
        """
    )
    op.execute(
        "CREATE INDEX idx_gva_gallery_visitor ON gallery_visitor_actions(gallery_id, visitor_token)"
    )
    op.execute(
        "CREATE INDEX idx_gva_asset ON gallery_visitor_actions(asset_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS gallery_visitor_actions")
