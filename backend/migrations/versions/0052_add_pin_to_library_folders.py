"""Add pin column to library_folders for folder protection.

This migration adds:
- pin column for PIN-based folder protection (encrypted)

Revision ID: 0052
Revises: 0051
Create Date: 2025-12-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add pin column to library_folders table for folder protection
    op.add_column(
        "library_folders",
        sa.Column(
            "pin",
            sa.String(255),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("library_folders", "pin")
