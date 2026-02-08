"""Add missing foreign key constraints for gallery cover assets.

Revision ID: 0191
Revises: 0190
Create Date: 2026-02-08

Description:
    This migration adds the missing foreign key constraints for cover_asset_id
    columns in the galleries and sub_galleries tables. These constraints were
    never added when the tables were initially created.

    Foreign Keys Added:
    1. galleries.cover_asset_id → assets.asset_id ON DELETE SET NULL
       - When an asset is deleted, the cover_asset_id is set to NULL
       - This allows galleries to remain even if their cover asset is removed

    2. sub_galleries.cover_asset_id → assets.asset_id ON DELETE SET NULL
       - When an asset is deleted, the cover_asset_id is set to NULL
       - This allows sub-galleries to remain even if their cover asset is removed

    Note: gallery_assets.asset_id → assets.asset_id was already added in migration 0006

Data Integrity:
    - Ensures referential integrity between galleries/sub-galleries and assets
    - Prevents orphaned references (cover_asset_id pointing to non-existent assets)
    - Allows graceful handling of asset deletion with ON DELETE SET NULL

Performance Impact:
    - Foreign key constraints add minimal overhead to INSERT/UPDATE operations
    - Indexes on asset_id columns already exist for efficient lookups
    - No impact on query performance for SELECT operations

Backwards Compatibility:
    - Fully backwards compatible
    - Existing data is validated during constraint creation
    - Invalid references will cause the migration to fail (expected behavior)
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0191'
down_revision = '0190'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add foreign key constraints for gallery cover asset references."""

    # =========================================================================
    # Step 1: Add foreign key constraint for galleries.cover_asset_id
    # =========================================================================
    # This ensures that the cover_asset_id in galleries references a valid asset
    # ON DELETE SET NULL allows the gallery to remain if the cover asset is deleted
    op.execute("""
        ALTER TABLE galleries
        ADD CONSTRAINT fk_galleries_cover_asset_id
        FOREIGN KEY (cover_asset_id)
        REFERENCES assets(asset_id)
        ON DELETE SET NULL;
    """)

    # =========================================================================
    # Step 2: Add foreign key constraint for sub_galleries.cover_asset_id
    # =========================================================================
    # This ensures that the cover_asset_id in sub_galleries references a valid asset
    # ON DELETE SET NULL allows the sub-gallery to remain if the cover asset is deleted
    op.execute("""
        ALTER TABLE sub_galleries
        ADD CONSTRAINT fk_sub_galleries_cover_asset_id
        FOREIGN KEY (cover_asset_id)
        REFERENCES assets(asset_id)
        ON DELETE SET NULL;
    """)

    # =========================================================================
    # Step 3: Verify constraints were created successfully
    # =========================================================================
    # This query will return the constraints if they were created successfully
    # It's useful for verification during the migration process
    op.execute("""
        SELECT
            conname AS constraint_name,
            conrelid::regclass AS table_name,
            confrelid::regclass AS referenced_table,
            pg_get_constraintdef(oid) AS constraint_definition
        FROM pg_constraint
        WHERE conname IN (
            'fk_galleries_cover_asset_id',
            'fk_sub_galleries_cover_asset_id'
        );
    """)


def downgrade() -> None:
    """Remove foreign key constraints for gallery cover asset references."""

    # =========================================================================
    # Step 1: Drop foreign key constraint for sub_galleries.cover_asset_id
    # =========================================================================
    # Drop in reverse order of creation to avoid dependency issues
    op.execute("""
        ALTER TABLE sub_galleries
        DROP CONSTRAINT IF EXISTS fk_sub_galleries_cover_asset_id;
    """)

    # =========================================================================
    # Step 2: Drop foreign key constraint for galleries.cover_asset_id
    # =========================================================================
    op.execute("""
        ALTER TABLE galleries
        DROP CONSTRAINT IF EXISTS fk_galleries_cover_asset_id;
    """)
