"""Add file_bytes to upload_sessions.

Revision ID: 0124
Revises: 0123
Create Date: 2026-01-07
"""

from alembic import op
import sqlalchemy as sa

revision = "0124"
down_revision = "0123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE upload_sessions
        ADD COLUMN IF NOT EXISTS file_bytes BIGINT;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE upload_sessions DROP COLUMN IF EXISTS file_bytes;")
