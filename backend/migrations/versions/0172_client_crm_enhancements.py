"""Client CRM enhancements: Add country_code and google_map_link.

Revision ID: 0172
Revises: 0171
Create Date: 2026-01-22
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0172'
down_revision = '0171'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add country_code to client_contacts
    op.add_column(
        'client_contacts',
        sa.Column('country_code', sa.String(length=10), nullable=True)
    )
    
    # Add google_map_link to client_addresses
    op.add_column(
        'client_addresses',
        sa.Column('google_map_link', sa.String(length=1000), nullable=True)
    )


def downgrade() -> None:
    # Remove google_map_link from client_addresses
    op.drop_column('client_addresses', 'google_map_link')
    
    # Remove country_code from client_contacts
    op.drop_column('client_contacts', 'country_code')
