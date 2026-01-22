"""Add design control resource types for locking.

Revision ID: 0167
Revises: 0166
Create Date: 2026-01-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0167'
down_revision = '0166'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add design control resource types to resource_locks constraint."""
    # Drop existing constraint that restricts resource_type values
    op.execute("""
        ALTER TABLE resource_locks
        DROP CONSTRAINT IF EXISTS resource_locks_resource_type_check;
    """)

    # Add new constraint with design control resource types
    op.execute("""
        ALTER TABLE resource_locks
        ADD CONSTRAINT resource_locks_resource_type_check
        CHECK (resource_type IN (
            'gallery',
            'sub_gallery',
            'asset',
            'settings',
            'design_cover',
            'design_theme',
            'design_typography',
            'design_grid'
        ));
    """)


def downgrade() -> None:
    """Revert design control resource types from constraint."""
    # Drop the new constraint
    op.execute("""
        ALTER TABLE resource_locks
        DROP CONSTRAINT IF EXISTS resource_locks_resource_type_check;
    """)

    # Restore original constraint without design types
    op.execute("""
        ALTER TABLE resource_locks
        ADD CONSTRAINT resource_locks_resource_type_check
        CHECK (resource_type IN (
            'gallery',
            'sub_gallery',
            'asset',
            'settings'
        ));
    """)
