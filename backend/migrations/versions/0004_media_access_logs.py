"""Add media access logs table for audit trail.

Revision ID: 0004
Revises: 0003
Create Date: 2025-01-27
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Media access logs table (immutable audit trail)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS media_access_logs (
            log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            asset_id UUID NOT NULL,
            user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            share_link_id UUID,
            action VARCHAR(50) NOT NULL CHECK (
                action IN (
                    'view_thumbnail', 'view_preview', 'view_original',
                    'download_webp', 'download_original'
                )
            ),
            ip_address VARCHAR(45) NOT NULL,
            user_agent TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for media_access_logs
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_media_access_logs_ws_asset "
        "ON media_access_logs(workspace_id, asset_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_media_access_logs_ws_time "
        "ON media_access_logs(workspace_id, created_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_media_access_logs_ws_user "
        "ON media_access_logs(workspace_id, user_id) WHERE user_id IS NOT NULL;"
    )


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_media_access_logs_ws_user;")
    op.execute("DROP INDEX IF EXISTS idx_media_access_logs_ws_time;")
    op.execute("DROP INDEX IF EXISTS idx_media_access_logs_ws_asset;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS media_access_logs;")

