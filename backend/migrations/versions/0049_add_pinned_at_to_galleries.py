"""Add pinned_at column to galleries table.

This migration adds:
- pinned_at timestamp column for gallery pinning feature

Revision ID: 0049
Revises: 0048
Create Date: 2025-12-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add pinned_at column to galleries table
    op.add_column(
        "galleries",
        sa.Column(
            "pinned_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )

    # Create index for efficient pinned galleries queries
    op.create_index(
        "idx_galleries_pinned_at",
        "galleries",
        ["pinned_at"],
        postgresql_where=sa.text("pinned_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_galleries_pinned_at", table_name="galleries")
    op.drop_column("galleries", "pinned_at")
