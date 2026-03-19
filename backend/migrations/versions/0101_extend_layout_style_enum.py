"""Extend layout_style CHECK constraint to 8 values.

Revision ID: 0101
Revises: 0199_add_company_logo_r2_keys
Create Date: 2026-03-19

Adds justified, mosaic, filmstrip, slideshow to the layout_style
CHECK constraint on the galleries table.
"""

from alembic import op


# revision identifiers
revision = "0101_extend_layout_style"
down_revision = "0199_add_company_logo_r2_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the existing CHECK constraint on layout_style
    # Original constraint from 0002_galleries_schema.py only allowed ('tabs', 'continuous')
    op.execute(
        "ALTER TABLE galleries DROP CONSTRAINT IF EXISTS galleries_layout_style_check"
    )
    # Add new CHECK constraint with all 8 layout style values
    op.execute(
        """ALTER TABLE galleries ADD CONSTRAINT galleries_layout_style_check
           CHECK (layout_style IN ('tabs', 'continuous', 'grid', 'masonry', 'justified', 'mosaic', 'filmstrip', 'slideshow'))"""
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE galleries DROP CONSTRAINT IF EXISTS galleries_layout_style_check"
    )
    # Revert to 4 values (tabs, continuous, grid, masonry)
    op.execute(
        """ALTER TABLE galleries ADD CONSTRAINT galleries_layout_style_check
           CHECK (layout_style IN ('tabs', 'continuous', 'grid', 'masonry'))"""
    )
