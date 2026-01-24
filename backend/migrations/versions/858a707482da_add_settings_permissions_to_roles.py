"""add_settings_permissions_to_roles

Revision ID: 858a707482da
Revises: 0175
Create Date: 2026-01-23 18:14:53.193035

Adds settings:read and settings:write permissions to existing workspace roles.
This is required for biometric consent and face rate limit endpoints.
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = '858a707482da'
down_revision = '0175'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add settings:* to owner roles
    op.execute("""
        UPDATE roles
        SET permissions = array_append(permissions, 'settings:*')
        WHERE name = 'owner'
        AND is_system = true
        AND NOT 'settings:*' = ANY(permissions)
    """)

    # Add settings:* to admin roles
    op.execute("""
        UPDATE roles
        SET permissions = array_append(permissions, 'settings:*')
        WHERE name = 'admin'
        AND is_system = true
        AND NOT 'settings:*' = ANY(permissions)
    """)

    # Add settings:read to viewer roles
    op.execute("""
        UPDATE roles
        SET permissions = array_append(permissions, 'settings:read')
        WHERE name = 'viewer'
        AND is_system = true
        AND NOT 'settings:read' = ANY(permissions)
    """)


def downgrade() -> None:
    # Remove settings:* from owner roles
    op.execute("""
        UPDATE roles
        SET permissions = array_remove(permissions, 'settings:*')
        WHERE name = 'owner'
        AND is_system = true
    """)

    # Remove settings:* from admin roles
    op.execute("""
        UPDATE roles
        SET permissions = array_remove(permissions, 'settings:*')
        WHERE name = 'admin'
        AND is_system = true
    """)

    # Remove settings:read from viewer roles
    op.execute("""
        UPDATE roles
        SET permissions = array_remove(permissions, 'settings:read')
        WHERE name = 'viewer'
        AND is_system = true
    """)
