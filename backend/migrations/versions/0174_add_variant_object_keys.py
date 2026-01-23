"""Add variant object key columns to assets table.

Stores the definitive R2 object keys for thumbnail, medium, and preview variants.
This eliminates the guessing logic in the gallery service and provides an audit trail
for variant regeneration and storage migration.

Revision ID: 0174
Revises: 0173
Create Date: 2026-01-23
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0174'
down_revision = '0173'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add variant object key columns (nullable for backward compatibility)."""
    # Add variant object key columns to assets table
    op.add_column(
        'assets',
        sa.Column('thumbnail_object_key', sa.String(500), nullable=True)
    )
    op.add_column(
        'assets',
        sa.Column('medium_object_key', sa.String(500), nullable=True)
    )
    op.add_column(
        'assets',
        sa.Column('preview_object_key', sa.String(500), nullable=True)
    )

    # Add indexes for efficient lookups (only on non-NULL values)
    op.create_index(
        'ix_assets_thumbnail_object_key',
        'assets',
        ['thumbnail_object_key'],
        postgresql_where=sa.text('thumbnail_object_key IS NOT NULL')
    )
    op.create_index(
        'ix_assets_medium_object_key',
        'assets',
        ['medium_object_key'],
        postgresql_where=sa.text('medium_object_key IS NOT NULL')
    )
    op.create_index(
        'ix_assets_preview_object_key',
        'assets',
        ['preview_object_key'],
        postgresql_where=sa.text('preview_object_key IS NOT NULL')
    )


def downgrade() -> None:
    """Remove variant object key columns and indexes."""
    # Drop indexes
    op.drop_index('ix_assets_preview_object_key', 'assets')
    op.drop_index('ix_assets_medium_object_key', 'assets')
    op.drop_index('ix_assets_thumbnail_object_key', 'assets')

    # Drop columns
    op.drop_column('assets', 'preview_object_key')
    op.drop_column('assets', 'medium_object_key')
    op.drop_column('assets', 'thumbnail_object_key')
