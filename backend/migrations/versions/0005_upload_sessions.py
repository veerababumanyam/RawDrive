"""Add upload_sessions table for resumable uploads.

Revision ID: 0005
Revises: 0004
Create Date: 2025-01-27
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Upload sessions table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS upload_sessions (
            upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            created_by_user_id UUID NOT NULL REFERENCES users(user_id),
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            sub_gallery_id UUID REFERENCES sub_galleries(sub_gallery_id) ON DELETE SET NULL,
            file_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            size_bytes BIGINT NOT NULL,
            sha256 VARCHAR(64),
            resumable_protocol VARCHAR(50) DEFAULT 's3_multipart' CHECK (resumable_protocol IN ('tus', 's3_multipart')),
            provider VARCHAR(50) DEFAULT 'r2' CHECK (provider IN ('r2', 'byos')),
            state VARCHAR(50) NOT NULL DEFAULT 'created' CHECK (state IN ('created', 'uploading', 'verifying', 'committed', 'aborted', 'expired')),
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for upload_sessions
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_upload_sessions_workspace_state "
        "ON upload_sessions(workspace_id, state);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires "
        "ON upload_sessions(expires_at) WHERE state != 'committed';"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_upload_sessions_gallery "
        "ON upload_sessions(gallery_id) WHERE gallery_id IS NOT NULL;"
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_upload_sessions_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_upload_sessions_expires;")
    op.execute("DROP INDEX IF EXISTS idx_upload_sessions_workspace_state;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS upload_sessions;")

