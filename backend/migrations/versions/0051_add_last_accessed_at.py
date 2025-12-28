"""Add last_accessed_at column to galleries and clients tables.

This migration adds tracking for when galleries and clients were last accessed.
Used for sorting by "recently accessed" in the UI.

Revision ID: 0051
Revises: 0050
Create Date: 2025-12-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add last_accessed_at to galleries
    op.add_column(
        "galleries",
        sa.Column(
            "last_accessed_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )

    # Add index for sorting by last_accessed_at
    op.create_index(
        "idx_galleries_last_accessed_at",
        "galleries",
        [sa.text("last_accessed_at DESC NULLS LAST")],
    )

    # Add last_accessed_at to clients
    op.add_column(
        "clients",
        sa.Column(
            "last_accessed_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )

    # Add index for sorting by last_accessed_at
    op.create_index(
        "idx_clients_last_accessed_at",
        "clients",
        [sa.text("last_accessed_at DESC NULLS LAST")],
    )


def downgrade() -> None:
    op.drop_index("idx_clients_last_accessed_at", table_name="clients")
    op.drop_column("clients", "last_accessed_at")
    op.drop_index("idx_galleries_last_accessed_at", table_name="galleries")
    op.drop_column("galleries", "last_accessed_at")
