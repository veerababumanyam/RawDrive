"""Fix owner role permissions - add billing:read.

This migration ensures all owner roles have billing:read permission.
Previously, some owner roles were created with only billing:write,
which caused 403 errors when fetching subscription status.

Revision ID: 0050
Revises: 0049
Create Date: 2025-12-28
"""

from alembic import op

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add billing:read to all owner roles that don't have it
    op.execute("""
        UPDATE roles
        SET permissions = array_append(permissions, 'billing:read')
        WHERE name = 'owner'
        AND NOT ('billing:read' = ANY(permissions))
    """)

    # Also ensure workspace:read is present (write should imply read)
    op.execute("""
        UPDATE roles
        SET permissions = array_append(permissions, 'workspace:read')
        WHERE name = 'owner'
        AND NOT ('workspace:read' = ANY(permissions))
    """)

    # Ensure members:read is present
    op.execute("""
        UPDATE roles
        SET permissions = array_append(permissions, 'members:read')
        WHERE name = 'owner'
        AND NOT ('members:read' = ANY(permissions))
    """)

    # Ensure roles:read is present
    op.execute("""
        UPDATE roles
        SET permissions = array_append(permissions, 'roles:read')
        WHERE name = 'owner'
        AND NOT ('roles:read' = ANY(permissions))
    """)

    # Ensure galleries:read is present
    op.execute("""
        UPDATE roles
        SET permissions = array_append(permissions, 'galleries:read')
        WHERE name = 'owner'
        AND NOT ('galleries:read' = ANY(permissions))
    """)

    # Ensure assets:read is present
    op.execute("""
        UPDATE roles
        SET permissions = array_append(permissions, 'assets:read')
        WHERE name = 'owner'
        AND NOT ('assets:read' = ANY(permissions))
    """)


def downgrade() -> None:
    # We don't remove permissions on downgrade as it could break access
    pass
