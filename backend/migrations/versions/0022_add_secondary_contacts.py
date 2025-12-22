"""Add secondary contacts columns to company_profiles table.

Supports up to 2 secondary emails and 2 secondary phones per profile,
each with individual visibility control.

Revision ID: 0022
Revises: 0021
Create Date: 2024-12-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic
revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add secondary contacts columns."""
    # Add secondary contacts JSONB arrays
    # Format: [{"value": "email@example.com", "label": "Work"}, ...]
    op.add_column(
        "company_profiles",
        sa.Column(
            "secondary_emails",
            JSONB,
            server_default="[]",
            nullable=False,
            comment="Array of secondary emails: [{value, label}]",
        ),
    )
    op.add_column(
        "company_profiles",
        sa.Column(
            "secondary_phones",
            JSONB,
            server_default="[]",
            nullable=False,
            comment="Array of secondary phones: [{value, label}]",
        ),
    )

    # Update company_visibility JSONB to include new visibility fields
    # This uses a PostgreSQL function to merge new visibility keys
    # The default visibility for secondary contacts is true
    op.execute(
        """
        UPDATE company_profiles
        SET company_visibility = company_visibility || '{
            "secondary_email_1": true,
            "secondary_email_2": true,
            "secondary_phone_1": true,
            "secondary_phone_2": true,
            "qr_code": true,
            "vcard": true
        }'::jsonb
        WHERE company_visibility IS NOT NULL
          AND NOT (company_visibility ? 'secondary_email_1');
        """
    )


def downgrade() -> None:
    """Remove secondary contacts columns."""
    op.drop_column("company_profiles", "secondary_phones")
    op.drop_column("company_profiles", "secondary_emails")

    # Remove new visibility keys from existing profiles
    op.execute(
        """
        UPDATE company_profiles
        SET company_visibility = company_visibility - ARRAY[
            'secondary_email_1',
            'secondary_email_2',
            'secondary_phone_1',
            'secondary_phone_2',
            'qr_code',
            'vcard'
        ]
        WHERE company_visibility IS NOT NULL;
        """
    )
