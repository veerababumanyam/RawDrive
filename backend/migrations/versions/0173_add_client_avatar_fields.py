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
    # Avatar fields were already added in migration 0012 (initial client CRM schema)
    # This migration is kept for compatibility but columns already exist
    # Check if columns exist before adding to make migration idempotent
    conn = op.get_bind()

    # Check if avatar_asset_id exists
    result = conn.execute(sa.text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'avatar_asset_id'
    """))
    if not result.fetchone():
        op.add_column(
            'clients',
            sa.Column('avatar_asset_id', sa.UUID(), sa.ForeignKey('assets.asset_id', ondelete='SET NULL'), nullable=True)
        )

    # Check if avatar_crop_data exists
    result = conn.execute(sa.text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'avatar_crop_data'
    """))
    if not result.fetchone():
        op.add_column(
            'clients',
            sa.Column('avatar_crop_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True)
        )


def downgrade() -> None:
    # Remove avatar fields from clients table
    op.drop_column('clients', 'avatar_crop_data')
    op.drop_column('clients', 'avatar_asset_id')
