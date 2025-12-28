"""Add encrypted credential columns to galleries table.

This migration adds support for the credential reveal feature.
Stores AES-256-GCM encrypted passwords and PINs alongside existing hashes.
- Hashes (existing): Used for visitor verification
- Encrypted (new): Used for owner reveal feature

Legacy galleries will have NULL encrypted values and show
"Original credential unavailable" in the UI.

Revision ID: 0047
Revises: 0046
Create Date: 2025-12-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add encrypted credential columns for password
    op.add_column(
        "galleries",
        sa.Column("password_encrypted", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "galleries",
        sa.Column("password_iv", sa.String(24), nullable=True),
    )

    # Add encrypted credential columns for PIN
    op.add_column(
        "galleries",
        sa.Column("pin_encrypted", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "galleries",
        sa.Column("pin_iv", sa.String(24), nullable=True),
    )

    # Add comments for documentation
    op.execute(
        "COMMENT ON COLUMN galleries.password_encrypted IS "
        "'AES-256-GCM encrypted password for reveal feature'"
    )
    op.execute(
        "COMMENT ON COLUMN galleries.password_iv IS "
        "'Base64-encoded 12-byte IV for password encryption'"
    )
    op.execute(
        "COMMENT ON COLUMN galleries.pin_encrypted IS "
        "'AES-256-GCM encrypted PIN for reveal feature'"
    )
    op.execute(
        "COMMENT ON COLUMN galleries.pin_iv IS "
        "'Base64-encoded 12-byte IV for PIN encryption'"
    )


def downgrade() -> None:
    # Remove encrypted credential columns
    op.drop_column("galleries", "pin_iv")
    op.drop_column("galleries", "pin_encrypted")
    op.drop_column("galleries", "password_iv")
    op.drop_column("galleries", "password_encrypted")
