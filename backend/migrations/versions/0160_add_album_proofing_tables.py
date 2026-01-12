"""Add album proofing tables.

Creates infrastructure for Album Preview & Proofing feature (026-album-proofing):
- albums: Core album entity with status lifecycle
- album_spreads: Spread pages within albums
- album_elements: Design elements on spreads (photos, text, shapes)
- album_versions: Point-in-time snapshots for version control
- album_comments: Position-aware comments on spreads
- album_renders: PDF generation tracking

Security considerations:
- All tables enforce workspace isolation via workspace_id FK
- Comment positions constrained to 0-100 percentage range
- JSONB fields for flexible metadata storage

Revision ID: 0160
Revises: 0159
Create Date: 2026-01-10
"""

from alembic import op

revision = "0160"
down_revision = "0159"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create album proofing tables with full schema."""

    # =========================================================================
    # 1. Create album_status enum type
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'album_status') THEN
                CREATE TYPE album_status AS ENUM ('draft', 'proof_sent', 'changes_requested', 'approved', 'exported');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create comment_status enum type
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'album_comment_status') THEN
                CREATE TYPE album_comment_status AS ENUM ('open', 'in_progress', 'resolved');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 3. Create element_type enum type
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'album_element_type') THEN
                CREATE TYPE album_element_type AS ENUM ('photo', 'text', 'shape');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 4. Create render_type enum type
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'album_render_type') THEN
                CREATE TYPE album_render_type AS ENUM ('preview_pdf', 'print_pdf', 'spread_images');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 5. Create render_status enum type
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'album_render_status') THEN
                CREATE TYPE album_render_status AS ENUM ('queued', 'running', 'ready', 'failed');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 6. Create albums table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS albums (
            -- Primary key
            album_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Optional source gallery
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE SET NULL,

            -- Album metadata
            title VARCHAR(255) NOT NULL,
            description TEXT,
            status album_status NOT NULL DEFAULT 'draft',

            -- Page dimensions
            page_size VARCHAR(50),
            width_mm DECIMAL(10,2),
            height_mm DECIMAL(10,2),
            bleed_mm DECIMAL(5,2) DEFAULT 3.0,
            safe_margin_mm DECIMAL(5,2) DEFAULT 10.0,

            -- Configuration
            lab_preset_id UUID,
            cover_spread_id UUID,

            -- Approval tracking
            approved_by_email VARCHAR(255),
            approved_at TIMESTAMPTZ,
            proof_sent_at TIMESTAMPTZ,

            -- Version tracking
            version_number INTEGER NOT NULL DEFAULT 1,

            -- Creator tracking
            created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 7. Create album_spreads table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_spreads (
            -- Primary key
            spread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Parent album
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,

            -- Multi-tenant isolation (denormalized for query performance)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Position in album
            page_number INTEGER NOT NULL,

            -- Layout configuration
            template_id VARCHAR(100),
            background_color VARCHAR(7),
            background_image_asset_id UUID,

            -- Page-specific overrides (JSONB)
            left_page_config JSONB DEFAULT '{}',
            right_page_config JSONB DEFAULT '{}',

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Constraints
            CONSTRAINT album_spreads_unique_page UNIQUE (album_id, page_number),
            CONSTRAINT album_spreads_page_positive CHECK (page_number > 0),
            CONSTRAINT album_spreads_bgcolor_hex CHECK (background_color IS NULL OR background_color ~ '^#[0-9A-Fa-f]{6}$')
        );
        """
    )

    # =========================================================================
    # 8. Create album_elements table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_elements (
            -- Primary key
            element_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Parent spread
            spread_id UUID NOT NULL REFERENCES album_spreads(spread_id) ON DELETE CASCADE,

            -- Multi-tenant isolation (denormalized for query performance)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Element type
            type album_element_type NOT NULL,

            -- Content (depends on type)
            asset_id UUID,
            text_content TEXT,

            -- Position and size (pixels)
            position_x DECIMAL(10,2) NOT NULL,
            position_y DECIMAL(10,2) NOT NULL,
            width DECIMAL(10,2) NOT NULL,
            height DECIMAL(10,2) NOT NULL,

            -- Transform
            rotation DECIMAL(5,2) NOT NULL DEFAULT 0,
            opacity DECIMAL(3,2) NOT NULL DEFAULT 1.0,
            z_index INTEGER NOT NULL DEFAULT 0,

            -- Crop and styling (JSONB)
            crop JSONB,
            styling JSONB DEFAULT '{}',

            -- Locked state
            locked BOOLEAN NOT NULL DEFAULT FALSE,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Constraints
            CONSTRAINT album_elements_rotation_range CHECK (rotation >= 0 AND rotation <= 360),
            CONSTRAINT album_elements_opacity_range CHECK (opacity >= 0 AND opacity <= 1),
            CONSTRAINT album_elements_positive_size CHECK (width > 0 AND height > 0),
            CONSTRAINT album_elements_positive_position CHECK (position_x >= 0 AND position_y >= 0)
        );
        """
    )

    # =========================================================================
    # 9. Create album_versions table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_versions (
            -- Primary key
            version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Parent album
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,

            -- Multi-tenant isolation (denormalized for query performance)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Version info
            version_number INTEGER NOT NULL,
            label VARCHAR(255),

            -- Complete album state snapshot
            snapshot_data JSONB NOT NULL,

            -- Creator tracking
            created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Timestamp (immutable after creation)
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Constraints
            CONSTRAINT album_versions_unique_number UNIQUE (album_id, version_number),
            CONSTRAINT album_versions_positive_number CHECK (version_number > 0)
        );
        """
    )

    # =========================================================================
    # 10. Create album_comments table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_comments (
            -- Primary key
            comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Parent album and spread
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,
            spread_id UUID NOT NULL REFERENCES album_spreads(spread_id) ON DELETE CASCADE,

            -- Multi-tenant isolation (denormalized for query performance)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Author info (authenticated user or guest)
            author_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            author_name VARCHAR(255) NOT NULL,
            author_email VARCHAR(255),

            -- Comment content
            body TEXT NOT NULL,

            -- Position as percentage (0-100)
            position_x DECIMAL(5,2) NOT NULL,
            position_y DECIMAL(5,2) NOT NULL,

            -- Status
            status album_comment_status NOT NULL DEFAULT 'open',

            -- Threading support
            parent_comment_id UUID REFERENCES album_comments(comment_id) ON DELETE CASCADE,

            -- Resolution tracking
            resolved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            resolved_at TIMESTAMPTZ,

            -- Internal flag (photographer-only notes)
            is_internal BOOLEAN NOT NULL DEFAULT FALSE,

            -- Soft delete
            deleted BOOLEAN NOT NULL DEFAULT FALSE,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Constraints
            CONSTRAINT album_comments_position_x_range CHECK (position_x >= 0 AND position_x <= 100),
            CONSTRAINT album_comments_position_y_range CHECK (position_y >= 0 AND position_y <= 100),
            CONSTRAINT album_comments_body_not_empty CHECK (length(body) > 0)
        );
        """
    )

    # =========================================================================
    # 11. Create album_renders table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_renders (
            -- Primary key
            render_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Parent album
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,

            -- Multi-tenant isolation (denormalized for query performance)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Render configuration
            render_type album_render_type NOT NULL,
            status album_render_status NOT NULL DEFAULT 'queued',

            -- Output info (populated on completion)
            storage_path VARCHAR(500),
            file_size_bytes BIGINT,
            page_count INTEGER,
            resolution_dpi INTEGER,
            watermarked BOOLEAN DEFAULT FALSE,

            -- Error handling
            error_message TEXT,

            -- Requester tracking
            requested_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ,

            -- Constraints
            CONSTRAINT album_renders_positive_size CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
            CONSTRAINT album_renders_positive_pages CHECK (page_count IS NULL OR page_count > 0)
        );
        """
    )

    # =========================================================================
    # 12. Create indexes
    # =========================================================================

    # Albums indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_albums_workspace
        ON albums(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_albums_workspace_status
        ON albums(workspace_id, status);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_albums_workspace_gallery
        ON albums(workspace_id, gallery_id)
        WHERE gallery_id IS NOT NULL;
        """
    )

    # Album spreads indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_spreads_album
        ON album_spreads(album_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_spreads_album_page
        ON album_spreads(album_id, page_number);
        """
    )

    # Album elements indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_elements_spread
        ON album_elements(spread_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_elements_spread_zindex
        ON album_elements(spread_id, z_index);
        """
    )

    # Album versions indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_versions_album
        ON album_versions(album_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_versions_album_number
        ON album_versions(album_id, version_number);
        """
    )

    # Album comments indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_comments_album
        ON album_comments(album_id)
        WHERE deleted = FALSE;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_comments_spread
        ON album_comments(spread_id)
        WHERE deleted = FALSE;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_comments_album_status
        ON album_comments(album_id, status)
        WHERE deleted = FALSE;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_comments_parent
        ON album_comments(parent_comment_id)
        WHERE parent_comment_id IS NOT NULL;
        """
    )

    # Album renders indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_renders_album
        ON album_renders(album_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_renders_album_type
        ON album_renders(album_id, render_type);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_album_renders_expires
        ON album_renders(expires_at)
        WHERE status = 'ready';
        """
    )

    # =========================================================================
    # 13. Create updated_at triggers
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_albums_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    for table in ["albums", "album_spreads", "album_elements", "album_comments"]:
        op.execute(
            f"""
            DROP TRIGGER IF EXISTS trigger_{table}_updated_at ON {table};
            CREATE TRIGGER trigger_{table}_updated_at
                BEFORE UPDATE ON {table}
                FOR EACH ROW
                EXECUTE FUNCTION update_albums_updated_at();
            """
        )

    # =========================================================================
    # 14. Add table comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE albums IS
        'Album design projects for client proofing with status lifecycle (draft -> approved -> exported)';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE album_spreads IS
        'Individual spreads (page pairs) within an album, ordered by page_number';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE album_elements IS
        'Design elements (photos, text, shapes) placed on album spreads';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE album_versions IS
        'Point-in-time snapshots of album state for version control and rollback';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE album_comments IS
        'Position-aware comments on album spreads. Position stored as percentage (0-100) for responsiveness';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE album_renders IS
        'PDF and image render jobs for albums. Tracked async with Celery workers';
        """
    )


def downgrade() -> None:
    """Remove album proofing tables.

    WARNING: This will permanently delete all album data.
    """
    # Drop triggers
    for table in ["albums", "album_spreads", "album_elements", "album_comments"]:
        op.execute(f"DROP TRIGGER IF EXISTS trigger_{table}_updated_at ON {table};")

    op.execute("DROP FUNCTION IF EXISTS update_albums_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_album_renders_expires;")
    op.execute("DROP INDEX IF EXISTS idx_album_renders_album_type;")
    op.execute("DROP INDEX IF EXISTS idx_album_renders_album;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_parent;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_album_status;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_spread;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_album;")
    op.execute("DROP INDEX IF EXISTS idx_album_versions_album_number;")
    op.execute("DROP INDEX IF EXISTS idx_album_versions_album;")
    op.execute("DROP INDEX IF EXISTS idx_album_elements_spread_zindex;")
    op.execute("DROP INDEX IF EXISTS idx_album_elements_spread;")
    op.execute("DROP INDEX IF EXISTS idx_album_spreads_album_page;")
    op.execute("DROP INDEX IF EXISTS idx_album_spreads_album;")
    op.execute("DROP INDEX IF EXISTS idx_albums_workspace_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_albums_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_albums_workspace;")

    # Drop tables (order matters due to foreign keys)
    op.execute("DROP TABLE IF EXISTS album_renders;")
    op.execute("DROP TABLE IF EXISTS album_comments;")
    op.execute("DROP TABLE IF EXISTS album_versions;")
    op.execute("DROP TABLE IF EXISTS album_elements;")
    op.execute("DROP TABLE IF EXISTS album_spreads;")
    op.execute("DROP TABLE IF EXISTS albums;")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS album_render_status;")
    op.execute("DROP TYPE IF EXISTS album_render_type;")
    op.execute("DROP TYPE IF EXISTS album_element_type;")
    op.execute("DROP TYPE IF EXISTS album_comment_status;")
    op.execute("DROP TYPE IF EXISTS album_status;")
