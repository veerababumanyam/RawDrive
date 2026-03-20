"""Add section_order column to personal_profiles and company_profiles.

Revision ID: 0200
Revises: 0199
Create Date: 2026-03-20

Stores the user-configured section ordering for the profile editor.
Default value matches the standard section layout: header, bio, contact, socials.
"""

revision = "0200"
down_revision = "0102_gallery_visitor_actions"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


def upgrade() -> None:
    # Add section_order to personal_profiles
    op.add_column(
        "personal_profiles",
        sa.Column(
            "section_order",
            JSONB,
            server_default='["header","bio","contact","socials"]',
            nullable=False,
        ),
    )

    # Add section_order to company_profiles
    op.add_column(
        "company_profiles",
        sa.Column(
            "section_order",
            JSONB,
            server_default='["header","bio","contact","socials"]',
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("company_profiles", "section_order")
    op.drop_column("personal_profiles", "section_order")
