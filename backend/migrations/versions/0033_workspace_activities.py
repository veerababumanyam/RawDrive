"""Add workspace_activities table for dashboard activity feed.

Creates a workspace-level activity tracking table that captures:
- Gallery views by visitors
- Photo downloads
- Comments added
- Favorites toggled
- Selections made
- Upload completions
- Gallery publishing

This is distinct from client_activities (CRM-focused) as it tracks
workspace-wide events from both authenticated users and anonymous visitors.

Revision ID: 0033
Revises: 0032
Create Date: 2025-12-26
"""

from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # WORKSPACE_ACTIVITIES TABLE - Workspace-level activity feed
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_activities (
            activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Activity type - what happened
            activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN (
                'gallery_viewed',
                'gallery_published',
                'gallery_created',
                'photo_downloaded',
                'photos_downloaded',
                'comment_added',
                'favorite_added',
                'favorite_removed',
                'selection_added',
                'selection_removed',
                'upload_completed',
                'visitor_registered',
                'face_search_performed'
            )),

            -- Actor information (who performed the action)
            -- For authenticated users
            actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            -- For visitors/guests
            actor_visitor_id UUID REFERENCES visitors(visitor_id) ON DELETE SET NULL,
            -- Display name (cached for quick display)
            actor_name VARCHAR(255),
            actor_email VARCHAR(255),
            actor_avatar_url TEXT,
            -- Actor type for easy filtering
            actor_type VARCHAR(20) NOT NULL DEFAULT 'guest' CHECK (actor_type IN ('user', 'visitor', 'guest')),

            -- Target entity (what was acted upon)
            target_type VARCHAR(30) NOT NULL CHECK (target_type IN (
                'gallery', 'asset', 'comment', 'visitor'
            )),
            target_id UUID NOT NULL,
            -- Cached target info for quick display
            target_name VARCHAR(255),
            target_thumbnail_url TEXT,

            -- Related gallery (for context - most activities relate to a gallery)
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            gallery_name VARCHAR(255),

            -- Additional context
            description TEXT,
            metadata JSONB DEFAULT '{}',

            -- Quantitative data (e.g., number of photos downloaded)
            count INTEGER DEFAULT 1,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for efficient querying
    # Primary query: recent activities for a workspace
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_activities_workspace_time "
        "ON workspace_activities(workspace_id, created_at DESC);"
    )

    # Filter by activity type
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_activities_workspace_type_time "
        "ON workspace_activities(workspace_id, activity_type, created_at DESC);"
    )

    # Filter by gallery
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_activities_gallery_time "
        "ON workspace_activities(gallery_id, created_at DESC) "
        "WHERE gallery_id IS NOT NULL;"
    )

    # Filter by actor type (e.g., show only visitor activities)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_activities_actor_type "
        "ON workspace_activities(workspace_id, actor_type, created_at DESC);"
    )

    # JSONB index for metadata queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_activities_metadata "
        "ON workspace_activities USING gin(metadata);"
    )

    # Note: Partial indexes with NOW() aren't possible as NOW() isn't immutable.
    # The primary workspace_time index handles performance for recent queries.


def downgrade() -> None:
    # Drop indexes first
    op.execute("DROP INDEX IF EXISTS idx_workspace_activities_recent;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_activities_metadata;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_activities_actor_type;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_activities_gallery_time;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_activities_workspace_type_time;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_activities_workspace_time;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS workspace_activities;")
