"""Fix client_contacts schema to match client-service

- Rename contact_subtype to label
- Rename verified to is_verified
- Update CHECK constraint to include 'social_media' and 'other'
- Add updated_at column

Revision ID: 0164
Revises: 0163
Create Date: 2026-01-21
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0164'
down_revision = '0163'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename columns
    op.alter_column(
        'client_contacts',
        'contact_subtype',
        new_column_name='label'
    )
    op.alter_column(
        'client_contacts',
        'verified',
        new_column_name='is_verified'
    )

    # Add updated_at column
    op.add_column(
        'client_contacts',
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True)
    )

    # Update existing 'social' values to 'social_media'
    op.execute("UPDATE client_contacts SET contact_type = 'social_media' WHERE contact_type = 'social'")

    # Drop old CHECK constraint
    op.execute("ALTER TABLE client_contacts DROP CONSTRAINT IF EXISTS client_contacts_contact_type_check")

    # Add new CHECK constraint with updated values
    op.execute("""
        ALTER TABLE client_contacts ADD CONSTRAINT client_contacts_contact_type_check
        CHECK (contact_type IN ('email', 'phone', 'website', 'social_media', 'other'))
    """)

    # Drop old unique constraint that uses contact_subtype
    op.execute("""
        ALTER TABLE client_contacts DROP CONSTRAINT IF EXISTS client_contacts_workspace_id_client_id_contact_type_contact_key
    """)

    # Create new unique constraint with label
    op.create_unique_constraint(
        'client_contacts_workspace_client_type_label_value_key',
        'client_contacts',
        ['workspace_id', 'client_id', 'contact_type', 'label', 'value']
    )


def downgrade() -> None:
    # Restore unique constraint
    op.drop_constraint(
        'client_contacts_workspace_client_type_label_value_key',
        'client_contacts'
    )
    op.create_unique_constraint(
        'client_contacts_workspace_id_client_id_contact_type_contact_key',
        'client_contacts',
        ['workspace_id', 'client_id', 'contact_type', 'contact_subtype', 'value']
    )

    # Drop new CHECK constraint
    op.execute("ALTER TABLE client_contacts DROP CONSTRAINT IF EXISTS client_contacts_contact_type_check")

    # Update 'social_media' back to 'social'
    op.execute("UPDATE client_contacts SET contact_type = 'social' WHERE contact_type = 'social_media'")

    # Restore old CHECK constraint
    op.execute("""
        ALTER TABLE client_contacts ADD CONSTRAINT client_contacts_contact_type_check
        CHECK (contact_type IN ('email', 'phone', 'website', 'social'))
    """)

    # Drop updated_at column
    op.drop_column('client_contacts', 'updated_at')

    # Rename columns back
    op.alter_column(
        'client_contacts',
        'label',
        new_column_name='contact_subtype'
    )
    op.alter_column(
        'client_contacts',
        'is_verified',
        new_column_name='verified'
    )
