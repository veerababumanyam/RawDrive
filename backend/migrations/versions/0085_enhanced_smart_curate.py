"""Enhanced Smart Curate - AI Photo Culling System.

This migration creates the database schema for the AI-powered photo curation system:
- curation_sessions: Workflow state management
- photo_quality_analysis: AI quality scores per asset
- image_embeddings: CLIP vectors for similarity (pgvector)
- similarity_groups: Clusters of similar photos
- similarity_group_members: Photos within each group
- photo_scene_categories: Moment/scene detection
- curation_selections: Final photo selections
- curation_presets: Named preset configurations
- user_curation_preferences: Learned user preferences

Feature: 023-enhanced-smart-curate
Revision ID: 0085
Revises: 0084
Create Date: 2026-01-04
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0085"
down_revision = "0084"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create Enhanced Smart Curate schema."""

    # =========================================================================
    # 1. Enable pgvector extension if not already enabled
    # =========================================================================
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # =========================================================================
    # 2. Create enum types
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE curation_status AS ENUM (
                'pending', 'analyzing', 'grouping', 'curating', 'completed', 'failed'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE blur_severity AS ENUM (
                'none', 'slight', 'moderate', 'severe'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE noise_level AS ENUM (
                'low', 'medium', 'high'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE selection_type AS ENUM (
                'selected', 'safety_set', 'rejected'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # =========================================================================
    # 3. Create curation_presets table (no FKs to new tables)
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS curation_presets (
            preset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            target_count_ratio DECIMAL(5,4),
            target_count_fixed INTEGER,
            quality_threshold DECIMAL(5,2) NOT NULL DEFAULT 50.00,
            similarity_threshold DECIMAL(5,4) NOT NULL DEFAULT 0.85,
            prioritize_expressions BOOLEAN NOT NULL DEFAULT true,
            prioritize_composition BOOLEAN NOT NULL DEFAULT true,
            enforce_story_coverage BOOLEAN NOT NULL DEFAULT true,
            enforce_person_coverage BOOLEAN NOT NULL DEFAULT false,
            is_system BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT check_preset_target CHECK (
                (target_count_ratio IS NULL) OR (target_count_fixed IS NULL)
            )
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_presets_workspace
        ON curation_presets(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_presets_system
        ON curation_presets(is_system) WHERE is_system = true;
        """
    )

    # =========================================================================
    # 4. Create curation_sessions table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS curation_sessions (
            session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            preset_id UUID REFERENCES curation_presets(preset_id) ON DELETE SET NULL,
            name VARCHAR(200),
            status curation_status NOT NULL DEFAULT 'pending',
            target_count INTEGER,
            quality_threshold DECIMAL(5,2) NOT NULL DEFAULT 0.00,
            similarity_threshold DECIMAL(5,4) NOT NULL DEFAULT 0.85,
            include_expression_analysis BOOLEAN NOT NULL DEFAULT true,
            include_scene_detection BOOLEAN NOT NULL DEFAULT true,
            include_diversity BOOLEAN NOT NULL DEFAULT true,
            progress_percent INTEGER NOT NULL DEFAULT 0,
            progress_stage VARCHAR(50),
            total_photos INTEGER,
            analyzed_count INTEGER NOT NULL DEFAULT 0,
            groups_count INTEGER,
            selected_count INTEGER,
            error_message TEXT,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT check_session_target_count CHECK (target_count > 0 OR target_count IS NULL),
            CONSTRAINT check_session_quality CHECK (quality_threshold BETWEEN 0 AND 100),
            CONSTRAINT check_session_similarity CHECK (similarity_threshold BETWEEN 0 AND 1)
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_curation_sessions_workspace_id
        ON curation_sessions(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_curation_sessions_gallery_id
        ON curation_sessions(gallery_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_curation_sessions_user_id
        ON curation_sessions(user_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_curation_sessions_status
        ON curation_sessions(status) WHERE status != 'completed';
        """
    )

    # =========================================================================
    # 5. Create photo_quality_analysis table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS photo_quality_analysis (
            asset_id UUID PRIMARY KEY REFERENCES assets(asset_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            overall_score DECIMAL(5,2) NOT NULL,
            sharpness_score DECIMAL(5,2) NOT NULL,
            exposure_score DECIMAL(5,2) NOT NULL,
            composition_score DECIMAL(5,2) NOT NULL,
            blur_detected BOOLEAN NOT NULL DEFAULT false,
            blur_severity blur_severity,
            blur_type VARCHAR(50),
            highlights_clipped BOOLEAN NOT NULL DEFAULT false,
            shadows_blocked BOOLEAN NOT NULL DEFAULT false,
            noise_level noise_level NOT NULL DEFAULT 'low',
            horizon_tilt_degrees DECIMAL(5,2),
            crop_suggestion JSONB,
            ai_provider VARCHAR(50) NOT NULL,
            ai_model VARCHAR(100) NOT NULL,
            raw_response JSONB,
            analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT check_quality_overall CHECK (overall_score BETWEEN 0 AND 100),
            CONSTRAINT check_quality_sharpness CHECK (sharpness_score BETWEEN 0 AND 100),
            CONSTRAINT check_quality_exposure CHECK (exposure_score BETWEEN 0 AND 100),
            CONSTRAINT check_quality_composition CHECK (composition_score BETWEEN 0 AND 100)
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_photo_quality_workspace_overall
        ON photo_quality_analysis(workspace_id, overall_score DESC);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_photo_quality_blur
        ON photo_quality_analysis(workspace_id) WHERE blur_detected = true;
        """
    )

    # =========================================================================
    # 6. Create image_embeddings table (pgvector)
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS image_embeddings (
            asset_id UUID PRIMARY KEY REFERENCES assets(asset_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            embedding VECTOR(512) NOT NULL,
            model_name VARCHAR(100) NOT NULL,
            model_version VARCHAR(50) NOT NULL,
            computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_embeddings_workspace
        ON image_embeddings(workspace_id);
        """
    )

    # IVFFlat index for similarity search - created after data load for best performance
    # lists = 100 is appropriate for up to 1M vectors
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_embeddings_ivfflat
        ON image_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
        """
    )

    # =========================================================================
    # 7. Create similarity_groups table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS similarity_groups (
            group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES curation_sessions(session_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            best_asset_id UUID REFERENCES assets(asset_id) ON DELETE SET NULL,
            user_override_asset_id UUID REFERENCES assets(asset_id) ON DELETE SET NULL,
            member_count INTEGER NOT NULL DEFAULT 0,
            avg_similarity DECIMAL(5,4) NOT NULL,
            best_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_similarity_groups_session
        ON similarity_groups(session_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_similarity_groups_best_asset
        ON similarity_groups(best_asset_id);
        """
    )

    # =========================================================================
    # 8. Create similarity_group_members table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS similarity_group_members (
            group_id UUID NOT NULL REFERENCES similarity_groups(group_id) ON DELETE CASCADE,
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
            similarity_score DECIMAL(5,4) NOT NULL,
            is_best BOOLEAN NOT NULL DEFAULT false,
            is_user_selected BOOLEAN NOT NULL DEFAULT false,
            quality_rank INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (group_id, asset_id),
            CONSTRAINT check_member_similarity CHECK (similarity_score BETWEEN 0 AND 1)
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_group_members_group
        ON similarity_group_members(group_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_group_members_asset
        ON similarity_group_members(asset_id);
        """
    )

    # =========================================================================
    # 9. Create photo_scene_categories table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS photo_scene_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            scene_category VARCHAR(100) NOT NULL,
            scene_subcategory VARCHAR(100),
            confidence DECIMAL(5,4) NOT NULL,
            is_key_moment BOOLEAN NOT NULL DEFAULT false,
            detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT check_scene_confidence CHECK (confidence BETWEEN 0 AND 1)
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_scene_categories_asset
        ON photo_scene_categories(asset_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_scene_categories_workspace_scene
        ON photo_scene_categories(workspace_id, scene_category);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_scene_categories_key_moments
        ON photo_scene_categories(workspace_id) WHERE is_key_moment = true;
        """
    )

    # =========================================================================
    # 10. Create curation_selections table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS curation_selections (
            session_id UUID NOT NULL REFERENCES curation_sessions(session_id) ON DELETE CASCADE,
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
            selection_type selection_type NOT NULL DEFAULT 'selected',
            selection_reason TEXT,
            quality_rank INTEGER,
            diversity_contribution DECIMAL(5,4),
            is_user_override BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (session_id, asset_id)
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_selections_session
        ON curation_selections(session_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_selections_session_type
        ON curation_selections(session_id, selection_type);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_selections_asset
        ON curation_selections(asset_id);
        """
    )

    # =========================================================================
    # 11. Create user_curation_preferences table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_curation_preferences (
            user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
            preference_data JSONB NOT NULL DEFAULT '{}',
            sessions_analyzed INTEGER NOT NULL DEFAULT 0,
            last_learned_at TIMESTAMPTZ,
            is_active BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 12. Add table comments for documentation
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE curation_sessions IS
        'AI curation workflow sessions. Each session represents a single curation attempt on a gallery.';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE photo_quality_analysis IS
        'AI-generated quality scores per asset. Includes sharpness, exposure, composition, blur detection.';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE image_embeddings IS
        'CLIP embeddings (512-dim) for similarity search via pgvector. Model: ViT-B/32.';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE similarity_groups IS
        'Clusters of visually similar photos (burst shots). AI recommends best_asset_id.';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE curation_selections IS
        'Final photo selections per session. selection_type: selected, safety_set, or rejected.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN user_curation_preferences.preference_data IS
        'Learned weights: {"quality_weight": 0.4, "composition_weight": 0.3, "expression_weight": 0.2, "diversity_weight": 0.1}';
        """
    )

    # =========================================================================
    # 13. Insert default system presets (T006)
    # =========================================================================
    op.execute(
        """
        INSERT INTO curation_presets (
            preset_id, workspace_id, name, description,
            target_count_fixed, target_count_ratio, quality_threshold,
            similarity_threshold, is_system
        )
        VALUES
            (
                gen_random_uuid(), NULL,
                'Social Media Highlights',
                'Best 20-30 photos optimized for social media posts with high visual impact',
                25, NULL, 75.00, 0.85, true
            ),
            (
                gen_random_uuid(), NULL,
                'Print Album',
                'Story-focused selection for print albums with comprehensive coverage (50-100 photos)',
                75, NULL, 60.00, 0.85, true
            ),
            (
                gen_random_uuid(), NULL,
                'Vendor Delivery',
                'Venue and vendor showcase photos for professional partnerships',
                NULL, 0.15, 50.00, 0.80, true
            ),
            (
                gen_random_uuid(), NULL,
                'Full Documentary',
                'Comprehensive event coverage preserving the complete story (300+ photos)',
                300, NULL, 40.00, 0.90, true
            )
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    """Drop Enhanced Smart Curate schema."""

    # Drop tables in reverse dependency order
    op.execute("DROP TABLE IF EXISTS user_curation_preferences CASCADE;")
    op.execute("DROP TABLE IF EXISTS curation_selections CASCADE;")
    op.execute("DROP TABLE IF EXISTS photo_scene_categories CASCADE;")
    op.execute("DROP TABLE IF EXISTS similarity_group_members CASCADE;")
    op.execute("DROP TABLE IF EXISTS similarity_groups CASCADE;")
    op.execute("DROP TABLE IF EXISTS image_embeddings CASCADE;")
    op.execute("DROP TABLE IF EXISTS photo_quality_analysis CASCADE;")
    op.execute("DROP TABLE IF EXISTS curation_sessions CASCADE;")
    op.execute("DROP TABLE IF EXISTS curation_presets CASCADE;")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS selection_type CASCADE;")
    op.execute("DROP TYPE IF EXISTS noise_level CASCADE;")
    op.execute("DROP TYPE IF EXISTS blur_severity CASCADE;")
    op.execute("DROP TYPE IF EXISTS curation_status CASCADE;")

    # Note: We don't drop the vector extension as other features may use it
