"""Add variant column to asset_encryption table.

Revision ID: 0008
Revises: 0007
Create Date: 2025-12-19

The encryption service requires a variant column to support encrypting
different variants (original, preview, thumbnail) of the same asset
with separate encryption metadata.
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add variant column with default 'original' for existing rows
    op.execute(
        """
        ALTER TABLE asset_encryption
        ADD COLUMN IF NOT EXISTS variant VARCHAR(50) NOT NULL DEFAULT 'original';
        """
    )

    # Drop existing primary key
    op.execute(
        """
        ALTER TABLE asset_encryption
        DROP CONSTRAINT IF EXISTS asset_encryption_pkey;
        """
    )

    # Create new composite primary key on (asset_id, variant)
    op.execute(
        """
        ALTER TABLE asset_encryption
        ADD PRIMARY KEY (asset_id, variant);
        """
    )


def downgrade() -> None:
    # Drop composite primary key
    op.execute(
        """
        ALTER TABLE asset_encryption
        DROP CONSTRAINT IF EXISTS asset_encryption_pkey;
        """
    )

    # Remove variant column
    op.execute(
        """
        ALTER TABLE asset_encryption
        DROP COLUMN IF EXISTS variant;
        """
    )

    # Restore original primary key on asset_id only
    op.execute(
        """
        ALTER TABLE asset_encryption
        ADD PRIMARY KEY (asset_id);
        """
    )
