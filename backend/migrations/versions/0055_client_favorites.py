"""Add client favorites tables and materialized view.

This migration adds:
- favorite_lists: Named collections of favorites per client per gallery
- favorite_shares: Shareable links for favorite lists
- favorite_downloads: ZIP download request tracking
- list_id column on client_interactions for list association
- gallery_favorites_summary materialized view for photographer analytics

Feature: 012-client-favorites
Revision ID: 0055
Revises: 0054
Create Date: 2025-12-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # T002: favorite_lists table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS favorite_lists (
            list_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            client_token VARCHAR(255) NOT NULL,
            name VARCHAR(50) NOT NULL,
            is_default BOOLEAN DEFAULT FALSE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(gallery_id, client_token, name)
        );
        """
    )

    # =========================================================================
    # T003: favorite_shares table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS favorite_shares (
            share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            list_id UUID NOT NULL REFERENCES favorite_lists(list_id) ON DELETE CASCADE,
            share_token VARCHAR(64) NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ,
            access_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ
        );
        """
    )

    # =========================================================================
    # T004: favorite_downloads table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS favorite_downloads (
            download_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            list_id UUID NOT NULL REFERENCES favorite_lists(list_id) ON DELETE CASCADE,
            client_token VARCHAR(255) NOT NULL,
            status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
            progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
            file_size_bytes BIGINT,
            download_url TEXT,
            error_message TEXT,
            resolution VARCHAR(20) DEFAULT 'web',
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # T005: Add list_id to client_interactions
    # =========================================================================
    op.execute(
        """
        ALTER TABLE client_interactions
        ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES favorite_lists(list_id) ON DELETE SET NULL;
        """
    )

    # =========================================================================
    # T006: Create indexes
    # =========================================================================
    # favorite_lists indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fl_gallery_client ON favorite_lists(gallery_id, client_token);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fl_workspace ON favorite_lists(workspace_id);"
    )

    # favorite_shares indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fs_token ON favorite_shares(share_token);"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_fs_list ON favorite_shares(list_id);")

    # favorite_downloads indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fd_list_status ON favorite_downloads(list_id, status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fd_client ON favorite_downloads(client_token);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fd_pending ON favorite_downloads(status, created_at) WHERE status = 'pending';"
    )

    # client_interactions list_id index
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ci_list ON client_interactions(list_id) WHERE list_id IS NOT NULL;"
    )

    # =========================================================================
    # T007: Create materialized view for photographer analytics
    # =========================================================================
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS gallery_favorites_summary AS
        SELECT
            ga.workspace_id,
            ga.gallery_id,
            ga.asset_id,
            COALESCE(SUBSTRING(a.original_object_key FROM '[^/]+$'), a.original_filename) AS filename,
            COUNT(DISTINCT ci.actor->>'visitor_id') AS unique_favorite_count,
            MAX(ci.created_at) AS last_favorited_at
        FROM gallery_assets ga
        JOIN assets a ON ga.asset_id = a.asset_id
        LEFT JOIN client_interactions ci
            ON ga.gallery_id = ci.gallery_id
            AND ga.asset_id = ci.asset_id
            AND ci.type = 'favorite'
        WHERE ga.visible = TRUE AND a.deleted = FALSE
        GROUP BY ga.workspace_id, ga.gallery_id, ga.asset_id, a.original_object_key, a.original_filename;
        """
    )

    # Indexes on materialized view
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_gfs_gallery_asset ON gallery_favorites_summary(gallery_id, asset_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gfs_workspace_count ON gallery_favorites_summary(workspace_id, unique_favorite_count DESC);"
    )


def downgrade() -> None:
    # Drop materialized view
    op.execute("DROP MATERIALIZED VIEW IF EXISTS gallery_favorites_summary;")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_ci_list;")
    op.execute("DROP INDEX IF EXISTS idx_fd_pending;")
    op.execute("DROP INDEX IF EXISTS idx_fd_client;")
    op.execute("DROP INDEX IF EXISTS idx_fd_list_status;")
    op.execute("DROP INDEX IF EXISTS idx_fs_list;")
    op.execute("DROP INDEX IF EXISTS idx_fs_token;")
    op.execute("DROP INDEX IF EXISTS idx_fl_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_fl_gallery_client;")

    # Remove list_id from client_interactions
    op.execute("ALTER TABLE client_interactions DROP COLUMN IF EXISTS list_id;")

    # Drop tables in reverse order (respecting FKs)
    op.execute("DROP TABLE IF EXISTS favorite_downloads;")
    op.execute("DROP TABLE IF EXISTS favorite_shares;")
    op.execute("DROP TABLE IF EXISTS favorite_lists;")
