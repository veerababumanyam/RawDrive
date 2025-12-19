"""Add is_favorited and is_selected to gallery_assets.

Revision ID: 0011
Revises: 0010
Create Date: 2024-12-19 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0011'
down_revision: Union[str, None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_favorited and is_selected columns to gallery_assets table."""
    op.execute("""
        ALTER TABLE gallery_assets
        ADD COLUMN IF NOT EXISTS is_favorited BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS is_selected BOOLEAN NOT NULL DEFAULT FALSE;
    """)


def downgrade() -> None:
    """Remove is_favorited and is_selected columns from gallery_assets table."""
    op.execute("""
        ALTER TABLE gallery_assets
        DROP COLUMN IF EXISTS is_favorited,
        DROP COLUMN IF EXISTS is_selected;
    """)
