"""Add client avatar fields.

Revision ID: 0173
Revises: 0172
Create Date: 2026-01-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0173'
down_revision = '0172'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add avatar fields to clients table
    op.add_column(
        'clients',
        sa.Column('avatar_asset_id', sa.UUID(), sa.ForeignKey('assets.asset_id', ondelete='SET NULL'), nullable=True)
    )
    op.add_column(
        'clients',
        sa.Column('avatar_crop_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )


def downgrade() -> None:
    # Remove avatar fields from clients table
    op.drop_column('clients', 'avatar_crop_data')
    op.drop_column('clients', 'avatar_asset_id')
