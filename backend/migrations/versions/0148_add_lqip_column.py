"""Add LQIP (Low Quality Image Placeholder) column to assets.

LQIP stores a tiny 20x20 WebP thumbnail as base64 for instant blur-up effect.
This dramatically improves perceived loading speed by showing blurred previews
while full thumbnails load.

Revision ID: 0148
Revises: 0147
Create Date: 2026-01-09
"""

from alembic import op
import sqlalchemy as sa

revision = '0148'
down_revision = '0147'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add LQIP column to assets table
    # Stores base64-encoded 20x20 WebP (~100-200 bytes)
    op.add_column(
        'assets',
        sa.Column('lqip', sa.Text(), nullable=True, comment='Base64-encoded 20x20 WebP placeholder for blur-up effect')
    )

    # Add index for efficient LQIP lookups (partial index for non-null values)
    # Note: Using regular CREATE INDEX since column starts empty (instant operation)
    # For large datasets with existing data, run CONCURRENTLY manually after migration
    op.create_index(
        'idx_assets_lqip_exists',
        'assets',
        ['asset_id'],
        postgresql_where=sa.text('lqip IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('idx_assets_lqip_exists', table_name='assets')
    op.drop_column('assets', 'lqip')
