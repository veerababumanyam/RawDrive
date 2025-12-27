"""Add folder_id column to upload_sessions table.

This allows uploads to be associated with library folders.

Revision ID: 0036
Revises: 0035
Create Date: 2025-12-27
"""

from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add folder_id column to upload_sessions table
    op.execute(
        """
        ALTER TABLE upload_sessions
        ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES library_folders(folder_id) ON DELETE SET NULL;
        """
    )

    # Index for folder_id
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_upload_sessions_folder ON upload_sessions(folder_id) WHERE folder_id IS NOT NULL;"
    )


def downgrade() -> None:
    # Drop index
    op.execute("DROP INDEX IF EXISTS idx_upload_sessions_folder;")

    # Remove folder_id column
    op.execute("ALTER TABLE upload_sessions DROP COLUMN IF EXISTS folder_id;")
