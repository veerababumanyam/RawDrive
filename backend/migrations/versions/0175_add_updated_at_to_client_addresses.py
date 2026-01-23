"""Add updated_at column to client_addresses table.

This fixes the validation error where AddressResponse requires updated_at
but the table only has created_at.

Revision ID: 0175
Revises: 0174
Create Date: 2026-01-23
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0175'
down_revision = '0174'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add updated_at column to client_addresses with default value
    op.add_column(
        'client_addresses',
        sa.Column(
            'updated_at',
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text('NOW()'),
            nullable=False
        )
    )

    # Set existing rows to have updated_at = created_at
    op.execute("""
        UPDATE client_addresses
        SET updated_at = created_at
        WHERE updated_at IS NULL OR updated_at = NOW()
    """)

    # Create trigger to auto-update updated_at on row modification
    op.execute("""
        CREATE OR REPLACE FUNCTION update_client_addresses_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_update_client_addresses_updated_at ON client_addresses;
        CREATE TRIGGER trigger_update_client_addresses_updated_at
            BEFORE UPDATE ON client_addresses
            FOR EACH ROW
            EXECUTE FUNCTION update_client_addresses_updated_at();
    """)


def downgrade() -> None:
    # Drop trigger
    op.execute("DROP TRIGGER IF EXISTS trigger_update_client_addresses_updated_at ON client_addresses;")
    op.execute("DROP FUNCTION IF EXISTS update_client_addresses_updated_at();")

    # Drop column
    op.drop_column('client_addresses', 'updated_at')
