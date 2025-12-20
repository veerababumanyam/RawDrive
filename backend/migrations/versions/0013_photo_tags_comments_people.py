"""Add photo tags, comments, people, and face detection tables.

Creates tables for:
- tags: Workspace-scoped keyword/category tags for photos
- asset_tags: Many-to-many relationship between assets and tags
- comments: Comments on assets (photos) within galleries
- people: Named people for face tagging
- face_detections: Detected faces linked to assets and optionally to people

Revision ID: 0013
Revises: 0012
Create Date: 2025-12-20
"""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. TAGS TABLE - Workspace-scoped tags for categorizing photos
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tags (
            tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Tag details
            name VARCHAR(100) NOT NULL,
            type VARCHAR(30) DEFAULT 'keyword' CHECK (type IN ('keyword', 'location', 'event', 'category', 'custom')),
            color VARCHAR(20),

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Unique tag name per workspace
            UNIQUE(workspace_id, name)
        );
        """
    )

    # Tags indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_tags_workspace ON tags(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tags_workspace_type ON tags(workspace_id, type);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tags_name_search ON tags USING gin(to_tsvector('english', name));")

    # =========================================================================
    # 2. ASSET_TAGS TABLE - Many-to-many relationship between assets and tags
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS asset_tags (
            asset_tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
            tag_id UUID NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,

            -- Who tagged this asset
            created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),

            -- Prevent duplicate tag assignments
            UNIQUE(workspace_id, asset_id, tag_id)
        );
        """
    )

    # Asset tags indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_asset_tags_workspace_asset ON asset_tags(workspace_id, asset_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_asset_tags_workspace_tag ON asset_tags(workspace_id, tag_id);")

    # =========================================================================
    # 3. COMMENTS TABLE - Comments on assets within galleries
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS comments (
            comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            asset_id UUID REFERENCES assets(asset_id) ON DELETE CASCADE,

            -- Author info (can be a user or a client via share link)
            author_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            author_name VARCHAR(255),
            author_email VARCHAR(255),

            -- Comment content
            body TEXT NOT NULL,

            -- Optional annotations (for marking specific areas on photo)
            annotations JSONB,

            -- Internal notes vs client-visible
            is_internal BOOLEAN NOT NULL DEFAULT FALSE,

            -- Status for tracking (client requests/issues)
            status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
            resolved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            resolved_at TIMESTAMPTZ,

            -- Moderation state
            moderation_state VARCHAR(20) DEFAULT 'published' CHECK (moderation_state IN ('published', 'pending', 'blocked')),

            -- Soft delete
            deleted BOOLEAN DEFAULT FALSE,
            deleted_at TIMESTAMPTZ,

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Comments indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_comments_workspace_gallery ON comments(workspace_id, gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_comments_workspace_asset ON comments(workspace_id, asset_id) WHERE asset_id IS NOT NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_comments_workspace_gallery_time ON comments(workspace_id, gallery_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_comments_body_search ON comments USING gin(to_tsvector('english', body));")

    # =========================================================================
    # 4. PEOPLE TABLE - Named people for face tagging
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS people (
            person_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Person details
            display_name VARCHAR(255),

            -- Cover photo (representative face)
            cover_face_id UUID,

            -- Status
            status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted')),

            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # People indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_people_workspace ON people(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_people_workspace_status ON people(workspace_id, status);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_people_name_search ON people USING gin(to_tsvector('english', display_name)) WHERE display_name IS NOT NULL;")

    # =========================================================================
    # 5. FACE_DETECTIONS TABLE - Detected faces linked to assets and people
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS face_detections (
            face_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,

            -- Bounding box (normalized 0-1 coordinates)
            bbox JSONB NOT NULL,

            -- Linked person (null if not yet identified)
            person_id UUID REFERENCES people(person_id) ON DELETE SET NULL,

            -- Detection confidence
            confidence NUMERIC(5, 4),

            -- Who tagged this face (null if auto-detected)
            tagged_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Audit fields
            detected_at TIMESTAMPTZ DEFAULT NOW(),
            tagged_at TIMESTAMPTZ,

            -- Prevent duplicate face detections at same location
            UNIQUE(workspace_id, asset_id, bbox)
        );
        """
    )

    # Face detections indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_face_detections_workspace_asset ON face_detections(workspace_id, asset_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_face_detections_workspace_person ON face_detections(workspace_id, person_id) WHERE person_id IS NOT NULL;")

    # Add cover_face_id foreign key constraint after face_detections table exists
    op.execute(
        """
        ALTER TABLE people
        ADD CONSTRAINT fk_people_cover_face
        FOREIGN KEY (cover_face_id) REFERENCES face_detections(face_id) ON DELETE SET NULL;
        """
    )


def downgrade() -> None:
    # Remove foreign key constraint first
    op.execute("ALTER TABLE people DROP CONSTRAINT IF EXISTS fk_people_cover_face;")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_face_detections_workspace_person;")
    op.execute("DROP INDEX IF EXISTS idx_face_detections_workspace_asset;")
    op.execute("DROP INDEX IF EXISTS idx_people_name_search;")
    op.execute("DROP INDEX IF EXISTS idx_people_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_people_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_comments_body_search;")
    op.execute("DROP INDEX IF EXISTS idx_comments_workspace_gallery_time;")
    op.execute("DROP INDEX IF EXISTS idx_comments_workspace_asset;")
    op.execute("DROP INDEX IF EXISTS idx_comments_workspace_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_asset_tags_workspace_tag;")
    op.execute("DROP INDEX IF EXISTS idx_asset_tags_workspace_asset;")
    op.execute("DROP INDEX IF EXISTS idx_tags_name_search;")
    op.execute("DROP INDEX IF EXISTS idx_tags_workspace_type;")
    op.execute("DROP INDEX IF EXISTS idx_tags_workspace;")

    # Drop tables in reverse order
    op.execute("DROP TABLE IF EXISTS face_detections;")
    op.execute("DROP TABLE IF EXISTS people;")
    op.execute("DROP TABLE IF EXISTS comments;")
    op.execute("DROP TABLE IF EXISTS asset_tags;")
    op.execute("DROP TABLE IF EXISTS tags;")
