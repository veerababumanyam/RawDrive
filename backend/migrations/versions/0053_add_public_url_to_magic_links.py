"""Add public_url column to magic_links table.

Revision ID: 0053
Revises: 0052
Create Date: 2025-12-29

This migration adds a public_url column to store the shareable URL
for magic links. This allows the URL to be returned when listing
existing magic links, fixing the 422 error that occurred when
ShareDialog fell back to using link_id (UUID) instead of the token.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add public_url column to magic_links table
    # This stores the shareable URL (e.g., https://rawdrive.ai/g/{token})
    # The URL is generated on creation and stored for later retrieval
    op.add_column(
        "magic_links",
        sa.Column(
            "public_url",
            sa.String(500),
            nullable=True,
            comment="Shareable URL for this magic link"
        ),
    )


def downgrade() -> None:
    op.drop_column("magic_links", "public_url")
