"""Add collaborative album design tables for real-time album editing.

Revision ID: 0188
Revises: 0187
Create Date: 2026-02-01

This migration adds tables for:
- albums: Master album entities for photo albums/books
- album_spreads: Individual spreads (pages) within an album
- album_spread_elements: Elements on spreads (photos, text, shapes)
- album_templates: Predefined layout templates for different album types
- album_comments: Comments and feedback on spreads with @mentions
- album_versions: Version history for rollback support
"""

from alembic import op

revision = "0188"
down_revision = "0187"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---------------------------------------------------------------------------
    # Album Templates Table - Predefined layouts for different album types
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_templates (
            template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            album_type VARCHAR(50) NOT NULL CHECK (album_type IN ('wedding', 'portrait', 'event', 'family', 'newborn', 'boudoir', 'commercial', 'custom')),
            category VARCHAR(50) NOT NULL DEFAULT 'standard' CHECK (category IN ('standard', 'premium', 'custom')),
            page_size JSONB NOT NULL DEFAULT '{"width": 12, "height": 12, "unit": "inch"}'::jsonb,
            default_spread_layout JSONB NOT NULL DEFAULT '{"type": "single", "columns": 1}'::jsonb,
            spread_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
            cover_options JSONB NOT NULL DEFAULT '{}'::jsonb,
            spine_options JSONB NOT NULL DEFAULT '{}'::jsonb,
            color_palette JSONB DEFAULT '[]'::jsonb,
            typography JSONB DEFAULT '{}'::jsonb,
            thumbnail_url TEXT,
            is_system BOOLEAN NOT NULL DEFAULT FALSE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for album_templates
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_templates_workspace ON album_templates(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_templates_type ON album_templates(album_type);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_templates_system ON album_templates(is_system, is_active);")

    # ---------------------------------------------------------------------------
    # Albums Table - Master album entity
    # ---------------------------------------------------------------------------
    # If albums table exists (from 0160), add missing columns
    op.execute("ALTER TABLE albums ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES album_templates(template_id) ON DELETE SET NULL")
    op.execute("ALTER TABLE albums ADD COLUMN IF NOT EXISTS album_type VARCHAR(50) DEFAULT 'wedding'")
    op.execute("ALTER TABLE albums ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 0")
    op.execute("ALTER TABLE albums ADD COLUMN IF NOT EXISTS cover_config JSONB DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE albums ADD COLUMN IF NOT EXISTS spine_config JSONB DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE albums ADD COLUMN IF NOT EXISTS design_config JSONB DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE albums ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1")
    op.execute("ALTER TABLE albums ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES users(user_id) ON DELETE SET NULL")
    op.execute("ALTER TABLE albums ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ")
    
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS albums (
            album_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE SET NULL,
            template_id UUID REFERENCES album_templates(template_id) ON DELETE SET NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            album_type VARCHAR(50) NOT NULL DEFAULT 'wedding' CHECK (album_type IN ('wedding', 'portrait', 'event', 'family', 'newborn', 'boudoir', 'commercial', 'custom')),
            status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'ordered', 'archived')),
            page_size JSONB NOT NULL DEFAULT '{"width": 12, "height": 12, "unit": "inch"}'::jsonb,
            page_count INTEGER NOT NULL DEFAULT 0,
            cover_config JSONB DEFAULT '{}'::jsonb,
            spine_config JSONB DEFAULT '{}'::jsonb,
            design_config JSONB NOT NULL DEFAULT '{}'::jsonb,
            metadata JSONB DEFAULT '{}'::jsonb,
            current_version INTEGER NOT NULL DEFAULT 1,
            last_edited_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            last_edited_at TIMESTAMPTZ,
            approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for albums
    op.execute("CREATE INDEX IF NOT EXISTS idx_albums_workspace ON albums(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_albums_gallery ON albums(gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_albums_template ON albums(template_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_albums_status ON albums(status);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_albums_type ON albums(album_type);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_albums_created ON albums(workspace_id, created_at DESC);")

    # ---------------------------------------------------------------------------
    # Album Spreads Table - Individual pages/spreads
    # ---------------------------------------------------------------------------
    # If album_spreads table exists (from 0160), add missing columns
    op.execute("ALTER TABLE album_spreads ADD COLUMN IF NOT EXISTS spread_number INTEGER")
    op.execute("ALTER TABLE album_spreads ADD COLUMN IF NOT EXISTS spread_type VARCHAR(50) DEFAULT 'double'")
    op.execute("ALTER TABLE album_spreads ADD COLUMN IF NOT EXISTS layout_template_id VARCHAR(100)")
    op.execute("ALTER TABLE album_spreads ADD COLUMN IF NOT EXISTS layout_config JSONB DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE album_spreads ADD COLUMN IF NOT EXISTS background_config JSONB DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE album_spreads ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE")
    op.execute("ALTER TABLE album_spreads ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES users(user_id) ON DELETE SET NULL")
    op.execute("ALTER TABLE album_spreads ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ")
    op.execute("ALTER TABLE album_spreads ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_spreads (
            spread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            spread_number INTEGER NOT NULL,
            spread_type VARCHAR(50) NOT NULL DEFAULT 'double' CHECK (spread_type IN ('cover_front', 'cover_back', 'single', 'double', 'foldout')),
            layout_template_id VARCHAR(100),
            layout_config JSONB NOT NULL DEFAULT '{}'::jsonb,
            background_config JSONB DEFAULT '{"type": "color", "value": "#ffffff"}'::jsonb,
            is_locked BOOLEAN NOT NULL DEFAULT FALSE,
            locked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            locked_at TIMESTAMPTZ,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(album_id, spread_number)
        );
        """
    )

    # Indexes for album_spreads
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_spreads_album ON album_spreads(album_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_spreads_workspace ON album_spreads(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_spreads_order ON album_spreads(album_id, spread_number);")

    # ---------------------------------------------------------------------------
    # Album Spread Elements Table - Photos, text, shapes on spreads
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_spread_elements (
            element_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            spread_id UUID NOT NULL REFERENCES album_spreads(spread_id) ON DELETE CASCADE,
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            element_type VARCHAR(50) NOT NULL CHECK (element_type IN ('photo', 'text', 'shape', 'frame', 'decoration', 'qr_code', 'page_number')),
            asset_id UUID REFERENCES assets(asset_id) ON DELETE SET NULL,
            position JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "width": 100, "height": 100, "rotation": 0, "z_index": 0}'::jsonb,
            content JSONB DEFAULT '{}'::jsonb,
            style JSONB DEFAULT '{}'::jsonb,
            effects JSONB DEFAULT '[]'::jsonb,
            crop_config JSONB DEFAULT '{"x": 0, "y": 0, "width": 100, "height": 100}'::jsonb,
            is_locked BOOLEAN NOT NULL DEFAULT FALSE,
            is_visible BOOLEAN NOT NULL DEFAULT TRUE,
            layer_name VARCHAR(255),
            group_id UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for album_spread_elements
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_spread_elements_spread ON album_spread_elements(spread_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_spread_elements_album ON album_spread_elements(album_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_spread_elements_workspace ON album_spread_elements(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_spread_elements_asset ON album_spread_elements(asset_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_spread_elements_type ON album_spread_elements(element_type);")

    # ---------------------------------------------------------------------------
    # Album Comments Table - Comments with @mentions
    # ---------------------------------------------------------------------------
    # If album_comments table exists (from 0160), add missing columns
    op.execute("ALTER TABLE album_comments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id) ON DELETE CASCADE")
    op.execute("ALTER TABLE album_comments ADD COLUMN IF NOT EXISTS element_id UUID REFERENCES album_spread_elements(element_id) ON DELETE CASCADE")
    op.execute("ALTER TABLE album_comments ADD COLUMN IF NOT EXISTS content TEXT")
    op.execute("ALTER TABLE album_comments ADD COLUMN IF NOT EXISTS mentions UUID[] DEFAULT '{}'")
    op.execute("ALTER TABLE album_comments ADD COLUMN IF NOT EXISTS position JSONB")
    op.execute("ALTER TABLE album_comments ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(user_id) ON DELETE SET NULL")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_comments (
            comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,
            spread_id UUID REFERENCES album_spreads(spread_id) ON DELETE CASCADE,
            element_id UUID REFERENCES album_spread_elements(element_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            parent_comment_id UUID REFERENCES album_comments(comment_id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            mentions UUID[] DEFAULT '{}',
            position JSONB,
            status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'archived')),
            resolved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            resolved_at TIMESTAMPTZ,
            is_internal BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes for album_comments
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_comments_album ON album_comments(album_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_comments_spread ON album_comments(spread_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_comments_element ON album_comments(element_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_comments_workspace ON album_comments(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_comments_user ON album_comments(user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_comments_parent ON album_comments(parent_comment_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_comments_status ON album_comments(album_id, status);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_comments_mentions ON album_comments USING GIN(mentions);")

    # ---------------------------------------------------------------------------
    # Album Versions Table - Full version history for rollback
    # ---------------------------------------------------------------------------
    # If album_versions table exists (from 0160), add missing columns
    op.execute("ALTER TABLE album_versions ADD COLUMN IF NOT EXISTS snapshot JSONB")
    op.execute("ALTER TABLE album_versions ADD COLUMN IF NOT EXISTS change_summary TEXT")
    op.execute("ALTER TABLE album_versions ADD COLUMN IF NOT EXISTS change_type VARCHAR(50) DEFAULT 'edit'")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_versions (
            version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            snapshot JSONB NOT NULL,
            change_summary TEXT,
            change_type VARCHAR(50) NOT NULL DEFAULT 'edit' CHECK (change_type IN ('create', 'edit', 'auto_save', 'manual_save', 'rollback', 'approve', 'publish')),
            created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(album_id, version_number)
        );
        """
    )

    # Indexes for album_versions
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_versions_album ON album_versions(album_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_versions_workspace ON album_versions(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_versions_created ON album_versions(album_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_versions_number ON album_versions(album_id, version_number DESC);")

    # ---------------------------------------------------------------------------
    # Album Collaboration Sessions - Extended from edit_sessions
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_collaboration_sessions (
            session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'expired', 'closed')),
            version INTEGER NOT NULL DEFAULT 1,
            crdt_state JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_activity TIMESTAMPTZ DEFAULT NOW(),
            closed_at TIMESTAMPTZ
        );
        """
    )

    # Indexes for album_collaboration_sessions
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_collab_sessions_album ON album_collaboration_sessions(album_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_collab_sessions_workspace ON album_collaboration_sessions(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_collab_sessions_active ON album_collaboration_sessions(album_id, status) WHERE status = 'active';")

    # ---------------------------------------------------------------------------
    # Album Collaboration Participants
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_collaboration_participants (
            participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES album_collaboration_sessions(session_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            color VARCHAR(7) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'disconnected')),
            cursor_position JSONB,
            selected_elements UUID[] DEFAULT '{}',
            current_spread_id UUID REFERENCES album_spreads(spread_id) ON DELETE SET NULL,
            joined_at TIMESTAMPTZ DEFAULT NOW(),
            last_activity TIMESTAMPTZ DEFAULT NOW(),
            left_at TIMESTAMPTZ,
            UNIQUE(session_id, user_id)
        );
        """
    )

    # Indexes for album_collaboration_participants
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_collab_participants_session ON album_collaboration_participants(session_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_collab_participants_user ON album_collaboration_participants(user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_collab_participants_active ON album_collaboration_participants(session_id, status) WHERE status = 'active';")

    # ---------------------------------------------------------------------------
    # Album Collaborative Operations - For CRDT/OT
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS album_operations (
            operation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES album_collaboration_sessions(session_id) ON DELETE CASCADE,
            album_id UUID NOT NULL REFERENCES albums(album_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,
            operation_type VARCHAR(100) NOT NULL,
            target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('album', 'spread', 'element', 'comment')),
            target_id UUID NOT NULL,
            payload JSONB NOT NULL,
            vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
            lamport_timestamp BIGINT NOT NULL DEFAULT 0,
            base_version INTEGER NOT NULL,
            result_version INTEGER,
            is_applied BOOLEAN NOT NULL DEFAULT FALSE,
            is_conflicted BOOLEAN NOT NULL DEFAULT FALSE,
            conflict_resolution JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            applied_at TIMESTAMPTZ
        );
        """
    )

    # Indexes for album_operations
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_operations_session ON album_operations(session_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_operations_album ON album_operations(album_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_operations_workspace ON album_operations(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_operations_target ON album_operations(target_type, target_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_operations_timestamp ON album_operations(session_id, lamport_timestamp);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_album_operations_created ON album_operations(album_id, created_at DESC);")

    # ---------------------------------------------------------------------------
    # Insert System Album Templates
    # ---------------------------------------------------------------------------
    op.execute(
        """
        INSERT INTO album_templates (
            name, description, album_type, category, is_system, is_active, sort_order,
            page_size, default_spread_layout, spread_templates, cover_options, color_palette, typography
        ) VALUES
        -- Wedding Templates
        (
            'Classic Wedding',
            'Traditional wedding album layout with elegant typography and classic framing',
            'wedding', 'standard', TRUE, TRUE, 1,
            '{"width": 12, "height": 12, "unit": "inch"}',
            '{"type": "double", "columns": 2}',
            '[
                {"id": "full-bleed", "name": "Full Bleed", "zones": [{"x": 0, "y": 0, "width": 100, "height": 100}]},
                {"id": "two-equal", "name": "Two Equal", "zones": [{"x": 0, "y": 0, "width": 50, "height": 100}, {"x": 50, "y": 0, "width": 50, "height": 100}]},
                {"id": "hero-left", "name": "Hero Left", "zones": [{"x": 0, "y": 0, "width": 65, "height": 100}, {"x": 65, "y": 0, "width": 35, "height": 50}, {"x": 65, "y": 50, "width": 35, "height": 50}]},
                {"id": "grid-four", "name": "Grid of Four", "zones": [{"x": 0, "y": 0, "width": 50, "height": 50}, {"x": 50, "y": 0, "width": 50, "height": 50}, {"x": 0, "y": 50, "width": 50, "height": 50}, {"x": 50, "y": 50, "width": 50, "height": 50}]},
                {"id": "panoramic", "name": "Panoramic", "zones": [{"x": 0, "y": 25, "width": 100, "height": 50}]}
            ]',
            '{"types": ["hardcover", "leather", "fabric"], "colors": ["white", "ivory", "black", "burgundy"]}',
            '["#FFFFFF", "#F5F5DC", "#000000", "#722F37", "#D4AF37"]',
            '{"heading": "Playfair Display", "body": "Lato"}'
        ),
        (
            'Modern Minimalist',
            'Clean, contemporary design with generous white space and modern typography',
            'wedding', 'premium', TRUE, TRUE, 2,
            '{"width": 14, "height": 11, "unit": "inch"}',
            '{"type": "double", "columns": 2}',
            '[
                {"id": "full-bleed", "name": "Full Bleed", "zones": [{"x": 0, "y": 0, "width": 100, "height": 100}]},
                {"id": "centered", "name": "Centered", "zones": [{"x": 15, "y": 15, "width": 70, "height": 70}]},
                {"id": "asymmetric", "name": "Asymmetric", "zones": [{"x": 5, "y": 10, "width": 60, "height": 80}]},
                {"id": "duo-offset", "name": "Duo Offset", "zones": [{"x": 5, "y": 5, "width": 45, "height": 60}, {"x": 55, "y": 35, "width": 40, "height": 55}]}
            ]',
            '{"types": ["hardcover", "linen"], "colors": ["white", "gray", "black"]}',
            '["#FFFFFF", "#F8F8F8", "#333333", "#000000"]',
            '{"heading": "Montserrat", "body": "Open Sans"}'
        ),
        -- Portrait Templates
        (
            'Portrait Studio',
            'Professional portrait album with sophisticated layouts',
            'portrait', 'standard', TRUE, TRUE, 3,
            '{"width": 10, "height": 10, "unit": "inch"}',
            '{"type": "single", "columns": 1}',
            '[
                {"id": "full-bleed", "name": "Full Bleed", "zones": [{"x": 0, "y": 0, "width": 100, "height": 100}]},
                {"id": "matted", "name": "Matted", "zones": [{"x": 10, "y": 10, "width": 80, "height": 80}]},
                {"id": "triptych", "name": "Triptych", "zones": [{"x": 5, "y": 15, "width": 28, "height": 70}, {"x": 36, "y": 15, "width": 28, "height": 70}, {"x": 67, "y": 15, "width": 28, "height": 70}]}
            ]',
            '{"types": ["hardcover", "softcover"], "colors": ["black", "charcoal", "navy"]}',
            '["#1A1A1A", "#333333", "#1E3A5F", "#FFFFFF"]',
            '{"heading": "Cormorant Garamond", "body": "Source Sans Pro"}'
        ),
        -- Event Templates
        (
            'Event Highlights',
            'Dynamic layouts perfect for capturing event energy',
            'event', 'standard', TRUE, TRUE, 4,
            '{"width": 11, "height": 8.5, "unit": "inch"}',
            '{"type": "double", "columns": 2}',
            '[
                {"id": "full-bleed", "name": "Full Bleed", "zones": [{"x": 0, "y": 0, "width": 100, "height": 100}]},
                {"id": "collage-5", "name": "Collage 5", "zones": [{"x": 0, "y": 0, "width": 60, "height": 60}, {"x": 60, "y": 0, "width": 40, "height": 30}, {"x": 60, "y": 30, "width": 40, "height": 30}, {"x": 0, "y": 60, "width": 40, "height": 40}, {"x": 40, "y": 60, "width": 60, "height": 40}]},
                {"id": "timeline", "name": "Timeline", "zones": [{"x": 0, "y": 0, "width": 33, "height": 100}, {"x": 33, "y": 0, "width": 34, "height": 100}, {"x": 67, "y": 0, "width": 33, "height": 100}]}
            ]',
            '{"types": ["hardcover", "softcover"], "colors": ["black", "white"]}',
            '["#000000", "#FFFFFF", "#FF6B6B", "#4ECDC4"]',
            '{"heading": "Bebas Neue", "body": "Roboto"}'
        ),
        -- Family Templates
        (
            'Family Memories',
            'Warm and inviting layouts for family photo books',
            'family', 'standard', TRUE, TRUE, 5,
            '{"width": 12, "height": 12, "unit": "inch"}',
            '{"type": "double", "columns": 2}',
            '[
                {"id": "full-bleed", "name": "Full Bleed", "zones": [{"x": 0, "y": 0, "width": 100, "height": 100}]},
                {"id": "polaroid-style", "name": "Polaroid Style", "zones": [{"x": 10, "y": 10, "width": 35, "height": 40}, {"x": 55, "y": 10, "width": 35, "height": 40}, {"x": 10, "y": 55, "width": 35, "height": 40}, {"x": 55, "y": 55, "width": 35, "height": 40}]},
                {"id": "story-strip", "name": "Story Strip", "zones": [{"x": 0, "y": 20, "width": 25, "height": 60}, {"x": 25, "y": 20, "width": 25, "height": 60}, {"x": 50, "y": 20, "width": 25, "height": 60}, {"x": 75, "y": 20, "width": 25, "height": 60}]}
            ]',
            '{"types": ["hardcover", "softcover", "layflat"], "colors": ["cream", "sage", "dusty_rose"]}',
            '["#FFF8DC", "#9CAF88", "#DCAE96", "#5D4037"]',
            '{"heading": "Quicksand", "body": "Nunito"}'
        ),
        -- Newborn Templates
        (
            'Newborn Bliss',
            'Soft, gentle layouts perfect for newborn photography',
            'newborn', 'premium', TRUE, TRUE, 6,
            '{"width": 8, "height": 8, "unit": "inch"}',
            '{"type": "single", "columns": 1}',
            '[
                {"id": "full-bleed", "name": "Full Bleed", "zones": [{"x": 0, "y": 0, "width": 100, "height": 100}]},
                {"id": "soft-frame", "name": "Soft Frame", "zones": [{"x": 12, "y": 12, "width": 76, "height": 76}]},
                {"id": "details-trio", "name": "Details Trio", "zones": [{"x": 5, "y": 25, "width": 28, "height": 50}, {"x": 36, "y": 25, "width": 28, "height": 50}, {"x": 67, "y": 25, "width": 28, "height": 50}]}
            ]',
            '{"types": ["hardcover", "linen"], "colors": ["blush", "cream", "sage"]}',
            '["#FFE4E1", "#FFFAF0", "#E8F5E9", "#F5F5F5"]',
            '{"heading": "Cormorant Infant", "body": "Lora"}'
        )
        ON CONFLICT DO NOTHING;
        """
    )

    # ---------------------------------------------------------------------------
    # Function to auto-update album page count
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_album_page_count()
        RETURNS TRIGGER AS $$
        BEGIN
            UPDATE albums
            SET page_count = (
                SELECT COUNT(*) FROM album_spreads
                WHERE album_id = COALESCE(NEW.album_id, OLD.album_id)
            ),
            updated_at = NOW()
            WHERE album_id = COALESCE(NEW.album_id, OLD.album_id);
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Trigger for spread changes
    op.execute(
        """
        CREATE TRIGGER trigger_update_album_page_count
        AFTER INSERT OR DELETE ON album_spreads
        FOR EACH ROW
        EXECUTE FUNCTION update_album_page_count();
        """
    )

    # ---------------------------------------------------------------------------
    # Function to create version snapshot on significant changes
    # ---------------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION create_album_version_snapshot()
        RETURNS TRIGGER AS $$
        DECLARE
            new_version INTEGER;
        BEGIN
            -- Get next version number
            SELECT COALESCE(MAX(version_number), 0) + 1 INTO new_version
            FROM album_versions
            WHERE album_id = NEW.album_id;

            -- Create snapshot
            INSERT INTO album_versions (
                album_id, workspace_id, version_number, snapshot,
                change_type, created_by
            )
            SELECT
                NEW.album_id,
                NEW.workspace_id,
                new_version,
                jsonb_build_object(
                    'album', row_to_json(NEW),
                    'spreads', (
                        SELECT jsonb_agg(row_to_json(s))
                        FROM album_spreads s
                        WHERE s.album_id = NEW.album_id
                    ),
                    'elements', (
                        SELECT jsonb_agg(row_to_json(e))
                        FROM album_spread_elements e
                        WHERE e.album_id = NEW.album_id
                    )
                ),
                'edit',
                NEW.last_edited_by;

            -- Update current version on album
            UPDATE albums SET current_version = new_version WHERE album_id = NEW.album_id;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def downgrade() -> None:
    # Drop triggers and functions
    op.execute("DROP TRIGGER IF EXISTS trigger_update_album_page_count ON album_spreads;")
    op.execute("DROP FUNCTION IF EXISTS update_album_page_count();")
    op.execute("DROP FUNCTION IF EXISTS create_album_version_snapshot();")

    # Drop indexes and tables in reverse order
    op.execute("DROP INDEX IF EXISTS idx_album_operations_created;")
    op.execute("DROP INDEX IF EXISTS idx_album_operations_timestamp;")
    op.execute("DROP INDEX IF EXISTS idx_album_operations_target;")
    op.execute("DROP INDEX IF EXISTS idx_album_operations_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_album_operations_album;")
    op.execute("DROP INDEX IF EXISTS idx_album_operations_session;")
    op.execute("DROP TABLE IF EXISTS album_operations;")

    op.execute("DROP INDEX IF EXISTS idx_album_collab_participants_active;")
    op.execute("DROP INDEX IF EXISTS idx_album_collab_participants_user;")
    op.execute("DROP INDEX IF EXISTS idx_album_collab_participants_session;")
    op.execute("DROP TABLE IF EXISTS album_collaboration_participants;")

    op.execute("DROP INDEX IF EXISTS idx_album_collab_sessions_active;")
    op.execute("DROP INDEX IF EXISTS idx_album_collab_sessions_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_album_collab_sessions_album;")
    op.execute("DROP TABLE IF EXISTS album_collaboration_sessions;")

    op.execute("DROP INDEX IF EXISTS idx_album_versions_number;")
    op.execute("DROP INDEX IF EXISTS idx_album_versions_created;")
    op.execute("DROP INDEX IF EXISTS idx_album_versions_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_album_versions_album;")
    op.execute("DROP TABLE IF EXISTS album_versions;")

    op.execute("DROP INDEX IF EXISTS idx_album_comments_mentions;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_status;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_parent;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_user;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_element;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_spread;")
    op.execute("DROP INDEX IF EXISTS idx_album_comments_album;")
    op.execute("DROP TABLE IF EXISTS album_comments;")

    op.execute("DROP INDEX IF EXISTS idx_album_spread_elements_type;")
    op.execute("DROP INDEX IF EXISTS idx_album_spread_elements_asset;")
    op.execute("DROP INDEX IF EXISTS idx_album_spread_elements_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_album_spread_elements_album;")
    op.execute("DROP INDEX IF EXISTS idx_album_spread_elements_spread;")
    op.execute("DROP TABLE IF EXISTS album_spread_elements;")

    op.execute("DROP INDEX IF EXISTS idx_album_spreads_order;")
    op.execute("DROP INDEX IF EXISTS idx_album_spreads_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_album_spreads_album;")
    op.execute("DROP TABLE IF EXISTS album_spreads;")

    op.execute("DROP INDEX IF EXISTS idx_albums_created;")
    op.execute("DROP INDEX IF EXISTS idx_albums_type;")
    op.execute("DROP INDEX IF EXISTS idx_albums_status;")
    op.execute("DROP INDEX IF EXISTS idx_albums_template;")
    op.execute("DROP INDEX IF EXISTS idx_albums_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_albums_workspace;")
    op.execute("DROP TABLE IF EXISTS albums;")

    op.execute("DROP INDEX IF EXISTS idx_album_templates_system;")
    op.execute("DROP INDEX IF EXISTS idx_album_templates_type;")
    op.execute("DROP INDEX IF EXISTS idx_album_templates_workspace;")
    op.execute("DROP TABLE IF EXISTS album_templates;")
