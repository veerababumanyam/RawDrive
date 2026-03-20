"""Add testimonials JSONB column to personal_profiles.

Revision ID: 0202
Revises: 0201
Create Date: 2026-03-20

Stores testimonials as JSONB array of objects with client_name, text, rating.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = "0202"
down_revision = "0201"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "personal_profiles",
        sa.Column(
            "testimonials",
            JSONB,
            server_default=sa.text("'[]'::jsonb"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("personal_profiles", "testimonials")
