"""Add portfolio recommendation engine tables.

Creates AI-powered portfolio recommendation system with:
- portfolio_recommendations: Core recommendation entries with CLIP similarity
- portfolio_recommendation_items: Individual asset recommendations
- portfolio_recommendation_feedback: User feedback on recommendations
- portfolio_recommendation_ab_tests: A/B testing for recommendation algorithms
- portfolio_asset_embeddings: CLIP embeddings storage with pgvector
- portfolio_engagement_scores: Asset-level engagement metrics
- portfolio_client_preferences: Learned client preferences

Feature: AI Portfolio Recommendation Engine
Revision ID: 0185
Revises: 0184
Create Date: 2026-02-01
"""

from alembic import op

revision = "0185"
down_revision = "0184"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. PORTFOLIO_ASSET_EMBEDDINGS - CLIP embeddings for similarity search
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_asset_embeddings (
            embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE SET NULL,

            -- CLIP embedding (512-dimensional)
            clip_embedding vector(512) NOT NULL,

            -- Text-derived embedding for semantic search
            text_embedding vector(512),

            -- Scene/category classification from CLIP
            scene_category VARCHAR(50),  -- wedding, portrait, landscape, event, product, etc.
            scene_confidence DECIMAL(5, 4),
            scene_tags VARCHAR(50)[] DEFAULT '{}',

            -- Visual characteristics
            dominant_colors JSONB DEFAULT '[]',
            color_palette VARCHAR(20),  -- warm, cool, neutral, vibrant, muted
            brightness_level VARCHAR(20),  -- dark, medium, bright
            composition_type VARCHAR(30),  -- portrait, landscape, square, panorama
            aesthetic_score DECIMAL(5, 2),  -- 0-100 aesthetic quality

            -- Technical quality metrics
            sharpness_score DECIMAL(5, 2),
            exposure_score DECIMAL(5, 2),
            noise_score DECIMAL(5, 2),
            overall_quality_score DECIMAL(5, 2),

            -- Content metadata from AI analysis
            detected_objects JSONB DEFAULT '[]',
            detected_faces_count INTEGER DEFAULT 0,
            detected_emotions JSONB DEFAULT '[]',
            has_people BOOLEAN DEFAULT FALSE,

            -- Embedding metadata
            model_version VARCHAR(20) DEFAULT 'clip-vit-base-patch32',
            processed_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            UNIQUE(workspace_id, asset_id)
        );
        """
    )

    # Asset embeddings indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pae_workspace ON portfolio_asset_embeddings(workspace_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pae_gallery ON portfolio_asset_embeddings(workspace_id, gallery_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pae_scene ON portfolio_asset_embeddings(workspace_id, scene_category);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pae_quality ON portfolio_asset_embeddings(workspace_id, overall_quality_score DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pae_aesthetic ON portfolio_asset_embeddings(workspace_id, aesthetic_score DESC);"
    )

    # HNSW index for vector similarity search (using pgvectorscale)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_pae_clip_hnsw ON portfolio_asset_embeddings
        USING hnsw (clip_embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 200);
        """
    )

    # =========================================================================
    # 2. PORTFOLIO_ENGAGEMENT_SCORES - Asset-level engagement metrics
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_engagement_scores (
            score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE SET NULL,

            -- View metrics
            total_views INTEGER DEFAULT 0,
            unique_viewers INTEGER DEFAULT 0,
            avg_view_duration_ms INTEGER DEFAULT 0,
            bounce_rate DECIMAL(5, 4) DEFAULT 0,

            -- Engagement actions
            total_favorites INTEGER DEFAULT 0,
            total_selections INTEGER DEFAULT 0,
            total_downloads INTEGER DEFAULT 0,
            total_shares INTEGER DEFAULT 0,
            total_comments INTEGER DEFAULT 0,

            -- Conversion metrics
            conversion_rate DECIMAL(5, 4) DEFAULT 0,  -- selections / views
            selection_to_download_rate DECIMAL(5, 4) DEFAULT 0,

            -- Time-based engagement
            views_last_7d INTEGER DEFAULT 0,
            views_last_30d INTEGER DEFAULT 0,
            favorites_last_7d INTEGER DEFAULT 0,
            favorites_last_30d INTEGER DEFAULT 0,

            -- Trend indicators
            engagement_trend VARCHAR(20) DEFAULT 'stable' CHECK (engagement_trend IN (
                'growing', 'stable', 'declining', 'spike', 'dormant'
            )),
            trend_change_pct DECIMAL(6, 2) DEFAULT 0,

            -- Composite score (0-100)
            engagement_score DECIMAL(5, 2) DEFAULT 0,
            score_percentile DECIMAL(5, 2),  -- Percentile within workspace

            -- Score components
            view_score DECIMAL(5, 2) DEFAULT 0,
            action_score DECIMAL(5, 2) DEFAULT 0,
            recency_score DECIMAL(5, 2) DEFAULT 0,
            conversion_score DECIMAL(5, 2) DEFAULT 0,

            -- Seasonal patterns
            best_performing_season VARCHAR(20),  -- spring, summer, fall, winter
            best_performing_month INTEGER,
            best_performing_day_of_week INTEGER,

            -- Timestamps
            last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            UNIQUE(workspace_id, asset_id)
        );
        """
    )

    # Engagement scores indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pes_workspace_score ON portfolio_engagement_scores(workspace_id, engagement_score DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pes_workspace_gallery ON portfolio_engagement_scores(workspace_id, gallery_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pes_high_engagement ON portfolio_engagement_scores(workspace_id) WHERE engagement_score >= 70;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pes_conversions ON portfolio_engagement_scores(workspace_id, conversion_rate DESC);"
    )

    # =========================================================================
    # 3. PORTFOLIO_CLIENT_PREFERENCES - Learned client preferences
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_client_preferences (
            preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Client profile type
            client_type VARCHAR(30) DEFAULT 'general' CHECK (client_type IN (
                'wedding_client', 'portrait_client', 'corporate_client',
                'event_client', 'family_client', 'commercial_client', 'general'
            )),
            occasion_type VARCHAR(30),  -- wedding, engagement, birthday, corporate_event, etc.

            -- Visual preferences (learned from interactions)
            preferred_styles JSONB DEFAULT '[]',  -- ["candid", "posed", "artistic", "documentary"]
            preferred_colors JSONB DEFAULT '[]',  -- ["warm", "vibrant", "muted"]
            preferred_compositions JSONB DEFAULT '[]',  -- ["portrait", "wide", "detail"]
            preferred_scenes JSONB DEFAULT '[]',  -- ["outdoor", "indoor", "reception", "ceremony"]

            -- Preference embedding (derived from favorite/selected assets)
            preference_embedding vector(512),
            embedding_confidence DECIMAL(5, 4),
            embedding_sample_size INTEGER DEFAULT 0,

            -- Behavioral signals
            avg_selection_time_ms INTEGER,
            selection_pattern VARCHAR(20),  -- quick_decisive, thorough_browser, collaborative
            preferred_gallery_size INTEGER,
            avg_favorites_per_gallery INTEGER,

            -- Historical conversion data
            total_galleries_viewed INTEGER DEFAULT 0,
            total_selections_made INTEGER DEFAULT 0,
            total_downloads_completed INTEGER DEFAULT 0,
            conversion_history JSONB DEFAULT '[]',

            -- Season/timing preferences
            preferred_season VARCHAR(20),
            preferred_time_of_day VARCHAR(20),  -- morning, golden_hour, night

            -- Model confidence
            preference_confidence DECIMAL(5, 4) DEFAULT 0,
            last_interaction_at TIMESTAMPTZ,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            UNIQUE(workspace_id, client_id)
        );
        """
    )

    # Client preferences indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pcp_workspace_client ON portfolio_client_preferences(workspace_id, client_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pcp_client_type ON portfolio_client_preferences(workspace_id, client_type);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pcp_occasion ON portfolio_client_preferences(workspace_id, occasion_type);"
    )

    # =========================================================================
    # 4. PORTFOLIO_RECOMMENDATIONS - Core recommendation entries
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_recommendations (
            recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Target context
            client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE SET NULL,

            -- Recommendation type
            recommendation_type VARCHAR(30) NOT NULL CHECK (recommendation_type IN (
                'portfolio_selection',    -- For client viewing/selection
                'hero_shots',             -- Best shots for marketing
                'similar_style',          -- Similar to a reference image
                'seasonal_picks',         -- Season-appropriate selections
                'trending_shots',         -- Currently popular in workspace
                'personalized',           -- Based on client preferences
                'quick_delivery',         -- Fast turnaround selections
                'print_worthy',           -- High-quality print candidates
                'social_media',           -- Optimized for social sharing
                'album_cover'             -- Cover photo candidates
            )),

            -- Recommendation context
            occasion_type VARCHAR(30),  -- wedding, portrait, corporate, etc.
            target_season VARCHAR(20),  -- spring, summer, fall, winter
            target_theme VARCHAR(50),   -- romantic, modern, classic, artistic

            -- Source criteria
            source_gallery_ids UUID[] DEFAULT '{}',
            source_asset_count INTEGER DEFAULT 0,
            filter_criteria JSONB DEFAULT '{}',

            -- Algorithm info
            algorithm_version VARCHAR(20) DEFAULT 'v1.0',
            algorithm_config JSONB DEFAULT '{}',
            scoring_weights JSONB DEFAULT '{}',

            -- A/B test assignment
            ab_test_id UUID,
            ab_variant VARCHAR(50),

            -- Results summary
            total_candidates INTEGER DEFAULT 0,
            total_recommended INTEGER DEFAULT 0,
            avg_similarity_score DECIMAL(5, 4),
            avg_engagement_score DECIMAL(5, 2),
            avg_quality_score DECIMAL(5, 2),

            -- Status
            status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
                'pending', 'processing', 'completed', 'failed', 'expired'
            )),
            processing_time_ms INTEGER,
            error_message TEXT,

            -- User interaction tracking
            viewed_at TIMESTAMPTZ,
            items_viewed INTEGER DEFAULT 0,
            items_selected INTEGER DEFAULT 0,
            items_downloaded INTEGER DEFAULT 0,

            -- Feedback
            user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
            user_feedback TEXT,

            -- Timestamps
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Recommendations indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pr_workspace_type ON portfolio_recommendations(workspace_id, recommendation_type);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pr_workspace_client ON portfolio_recommendations(workspace_id, client_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pr_workspace_gallery ON portfolio_recommendations(workspace_id, gallery_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pr_workspace_status ON portfolio_recommendations(workspace_id, status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pr_ab_test ON portfolio_recommendations(ab_test_id, ab_variant);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pr_recent ON portfolio_recommendations(workspace_id, requested_at DESC);"
    )

    # =========================================================================
    # 5. PORTFOLIO_RECOMMENDATION_ITEMS - Individual asset recommendations
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_recommendation_items (
            item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            recommendation_id UUID NOT NULL REFERENCES portfolio_recommendations(recommendation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,

            -- Ranking
            rank_position INTEGER NOT NULL,
            display_position INTEGER,  -- May differ from rank if user reorders

            -- Scoring breakdown
            final_score DECIMAL(6, 4) NOT NULL,
            similarity_score DECIMAL(5, 4),      -- CLIP similarity to target
            engagement_score DECIMAL(5, 2),       -- Historical engagement
            quality_score DECIMAL(5, 2),          -- Technical quality
            relevance_score DECIMAL(5, 4),        -- Context relevance
            recency_score DECIMAL(5, 4),          -- Time-based scoring
            diversity_score DECIMAL(5, 4),        -- Contribution to diversity

            -- Score components detail
            score_breakdown JSONB DEFAULT '{}',

            -- Match reasons (explainable AI)
            match_reasons JSONB DEFAULT '[]',
            -- Example: [{"reason": "high_engagement", "detail": "Top 10% favorites"}, {"reason": "style_match", "detail": "Candid wedding style"}]

            -- Asset context
            scene_category VARCHAR(50),
            visual_tags VARCHAR(50)[] DEFAULT '{}',

            -- User interaction
            was_viewed BOOLEAN DEFAULT FALSE,
            was_selected BOOLEAN DEFAULT FALSE,
            was_downloaded BOOLEAN DEFAULT FALSE,
            was_rejected BOOLEAN DEFAULT FALSE,
            view_duration_ms INTEGER,
            interaction_at TIMESTAMPTZ,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Recommendation items indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pri_recommendation ON portfolio_recommendation_items(recommendation_id, rank_position);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pri_workspace_asset ON portfolio_recommendation_items(workspace_id, asset_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pri_selected ON portfolio_recommendation_items(recommendation_id) WHERE was_selected = TRUE;"
    )

    # =========================================================================
    # 6. PORTFOLIO_RECOMMENDATION_FEEDBACK - User feedback tracking
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_recommendation_feedback (
            feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            recommendation_id UUID NOT NULL REFERENCES portfolio_recommendations(recommendation_id) ON DELETE CASCADE,

            -- Feedback source
            feedback_source VARCHAR(20) NOT NULL CHECK (feedback_source IN (
                'user', 'client', 'system', 'implicit'
            )),
            user_id UUID,
            client_id UUID,

            -- Feedback type
            feedback_type VARCHAR(30) NOT NULL CHECK (feedback_type IN (
                'rating', 'selection', 'rejection', 'reorder', 'comment',
                'helpful', 'not_helpful', 'too_few', 'too_many', 'wrong_style'
            )),

            -- Feedback content
            rating INTEGER CHECK (rating BETWEEN 1 AND 5),
            comment TEXT,
            selected_count INTEGER,
            rejected_count INTEGER,

            -- For implicit feedback
            session_duration_ms INTEGER,
            scroll_depth_pct DECIMAL(5, 2),
            items_viewed INTEGER,

            -- Improvement signals
            improvement_suggestions JSONB DEFAULT '[]',

            -- Processing
            processed_for_training BOOLEAN DEFAULT FALSE,
            processed_at TIMESTAMPTZ,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Feedback indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prf_recommendation ON portfolio_recommendation_feedback(recommendation_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prf_workspace_type ON portfolio_recommendation_feedback(workspace_id, feedback_type);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prf_unprocessed ON portfolio_recommendation_feedback(workspace_id) WHERE processed_for_training = FALSE;"
    )

    # =========================================================================
    # 7. PORTFOLIO_RECOMMENDATION_AB_TESTS - A/B testing for algorithms
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_recommendation_ab_tests (
            test_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Test identification
            test_name VARCHAR(100) NOT NULL,
            test_description TEXT,
            hypothesis TEXT,

            -- Test configuration
            test_type VARCHAR(30) NOT NULL CHECK (test_type IN (
                'algorithm', 'scoring_weights', 'ui_presentation',
                'recommendation_count', 'diversity_factor', 'personalization_level'
            )),

            -- Variants
            control_config JSONB NOT NULL DEFAULT '{}',
            variants JSONB NOT NULL DEFAULT '[]',
            -- Example: [{"name": "variant_a", "config": {...}, "weight": 50}]

            -- Targeting
            target_recommendation_types VARCHAR(30)[] DEFAULT '{}',
            target_client_types VARCHAR(30)[] DEFAULT '{}',
            traffic_percentage DECIMAL(5, 2) DEFAULT 100,

            -- Duration
            start_date TIMESTAMPTZ NOT NULL,
            end_date TIMESTAMPTZ,
            min_sample_size INTEGER DEFAULT 100,

            -- Statistical settings
            significance_level DECIMAL(5, 4) DEFAULT 0.05,
            minimum_detectable_effect DECIMAL(5, 4) DEFAULT 0.10,

            -- Primary metric
            primary_metric VARCHAR(50) DEFAULT 'selection_rate' CHECK (primary_metric IN (
                'selection_rate', 'download_rate', 'time_to_selection',
                'user_rating', 'items_viewed', 'engagement_rate'
            )),
            secondary_metrics VARCHAR(50)[] DEFAULT '{}',

            -- Results
            status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
                'draft', 'active', 'paused', 'concluded', 'archived'
            )),
            current_results JSONB DEFAULT '{}',
            winner_variant VARCHAR(50),
            statistical_significance_reached BOOLEAN DEFAULT FALSE,
            significance_reached_at TIMESTAMPTZ,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            concluded_at TIMESTAMPTZ
        );
        """
    )

    # A/B test indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prat_workspace_status ON portfolio_recommendation_ab_tests(workspace_id, status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prat_active ON portfolio_recommendation_ab_tests(workspace_id) WHERE status = 'active';"
    )

    # =========================================================================
    # 8. PORTFOLIO_RECOMMENDATION_METRICS - Aggregated performance metrics
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_recommendation_metrics (
            metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Period
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),

            -- Volume metrics
            total_recommendations INTEGER DEFAULT 0,
            total_items_recommended INTEGER DEFAULT 0,
            total_items_viewed INTEGER DEFAULT 0,
            total_items_selected INTEGER DEFAULT 0,
            total_items_downloaded INTEGER DEFAULT 0,

            -- By recommendation type
            recommendations_by_type JSONB DEFAULT '{}',

            -- Performance metrics
            avg_selection_rate DECIMAL(5, 4),
            avg_download_rate DECIMAL(5, 4),
            avg_time_to_selection_ms INTEGER,
            avg_items_per_recommendation INTEGER,

            -- Quality metrics
            avg_user_rating DECIMAL(3, 2),
            positive_feedback_rate DECIMAL(5, 4),
            negative_feedback_rate DECIMAL(5, 4),

            -- Algorithm performance
            avg_similarity_score DECIMAL(5, 4),
            avg_engagement_score DECIMAL(5, 2),
            avg_quality_score DECIMAL(5, 2),

            -- A/B test metrics
            active_tests INTEGER DEFAULT 0,
            tests_concluded INTEGER DEFAULT 0,

            -- Comparison metrics
            selection_rate_vs_baseline DECIMAL(6, 4),  -- Lift vs random selection
            engagement_lift DECIMAL(6, 4),

            -- Timestamps
            calculated_at TIMESTAMPTZ DEFAULT NOW(),

            UNIQUE(workspace_id, period_start, period_end, period_type)
        );
        """
    )

    # Metrics indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prm_workspace_period ON portfolio_recommendation_metrics(workspace_id, period_start DESC);"
    )

    # =========================================================================
    # 9. Create function to calculate engagement score
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION calculate_asset_engagement_score(
            p_views INTEGER,
            p_favorites INTEGER,
            p_selections INTEGER,
            p_downloads INTEGER,
            p_shares INTEGER,
            p_views_7d INTEGER,
            p_favorites_7d INTEGER
        )
        RETURNS DECIMAL(5, 2) AS $$
        DECLARE
            view_score DECIMAL(5, 2);
            action_score DECIMAL(5, 2);
            recency_score DECIMAL(5, 2);
            conversion_score DECIMAL(5, 2);
            final_score DECIMAL(5, 2);
        BEGIN
            -- View score (log scale, max 25 points)
            view_score := LEAST(25, LOG(GREATEST(p_views, 1) + 1) * 8);

            -- Action score (weighted, max 35 points)
            action_score := LEAST(35, (
                p_favorites * 2 +
                p_selections * 5 +
                p_downloads * 3 +
                p_shares * 4
            ));

            -- Recency score (max 25 points)
            recency_score := LEAST(25, (p_views_7d * 2 + p_favorites_7d * 5));

            -- Conversion score (max 15 points)
            IF p_views > 0 THEN
                conversion_score := LEAST(15, (p_selections::DECIMAL / p_views) * 100);
            ELSE
                conversion_score := 0;
            END IF;

            -- Final score
            final_score := view_score + action_score + recency_score + conversion_score;

            RETURN LEAST(100, GREATEST(0, final_score));
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
        """
    )

    # =========================================================================
    # 10. Create function to refresh engagement scores
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_portfolio_engagement_scores(p_workspace_id UUID)
        RETURNS INTEGER AS $$
        DECLARE
            updated_count INTEGER;
        BEGIN
            INSERT INTO portfolio_engagement_scores (
                workspace_id, asset_id, gallery_id,
                total_views, unique_viewers, total_favorites, total_selections,
                total_downloads, total_shares, views_last_7d, views_last_30d,
                favorites_last_7d, favorites_last_30d,
                engagement_score, view_score, action_score, recency_score, conversion_score,
                conversion_rate, last_calculated_at
            )
            SELECT
                a.workspace_id,
                a.asset_id,
                a.gallery_id,
                COALESCE(ev.total_views, 0),
                COALESCE(ev.unique_viewers, 0),
                COALESCE(fav.total_favorites, 0),
                COALESCE(sel.total_selections, 0),
                COALESCE(dl.total_downloads, 0),
                COALESCE(sh.total_shares, 0),
                COALESCE(ev7.views_7d, 0),
                COALESCE(ev30.views_30d, 0),
                COALESCE(fav7.favorites_7d, 0),
                COALESCE(fav30.favorites_30d, 0),
                calculate_asset_engagement_score(
                    COALESCE(ev.total_views, 0),
                    COALESCE(fav.total_favorites, 0),
                    COALESCE(sel.total_selections, 0),
                    COALESCE(dl.total_downloads, 0),
                    COALESCE(sh.total_shares, 0),
                    COALESCE(ev7.views_7d, 0),
                    COALESCE(fav7.favorites_7d, 0)
                ),
                LEAST(25, LOG(GREATEST(COALESCE(ev.total_views, 0), 1) + 1) * 8),
                LEAST(35, (COALESCE(fav.total_favorites, 0) * 2 + COALESCE(sel.total_selections, 0) * 5 + COALESCE(dl.total_downloads, 0) * 3 + COALESCE(sh.total_shares, 0) * 4)),
                LEAST(25, (COALESCE(ev7.views_7d, 0) * 2 + COALESCE(fav7.favorites_7d, 0) * 5)),
                CASE WHEN COALESCE(ev.total_views, 0) > 0 THEN LEAST(15, (COALESCE(sel.total_selections, 0)::DECIMAL / ev.total_views) * 100) ELSE 0 END,
                CASE WHEN COALESCE(ev.total_views, 0) > 0 THEN COALESCE(sel.total_selections, 0)::DECIMAL / ev.total_views ELSE 0 END,
                NOW()
            FROM assets a
            LEFT JOIN (
                SELECT asset_id, COUNT(*) as total_views, COUNT(DISTINCT visitor_id) as unique_viewers
                FROM analytics_events
                WHERE event_type = 'asset_view' AND workspace_id = p_workspace_id
                GROUP BY asset_id
            ) ev ON a.asset_id = ev.asset_id
            LEFT JOIN (
                SELECT asset_id, COUNT(*) as total_favorites
                FROM analytics_events
                WHERE event_type = 'asset_favorite' AND workspace_id = p_workspace_id
                GROUP BY asset_id
            ) fav ON a.asset_id = fav.asset_id
            LEFT JOIN (
                SELECT asset_id, COUNT(*) as total_selections
                FROM analytics_events
                WHERE event_type = 'asset_selection' AND workspace_id = p_workspace_id
                GROUP BY asset_id
            ) sel ON a.asset_id = sel.asset_id
            LEFT JOIN (
                SELECT asset_id, COUNT(*) as total_downloads
                FROM analytics_events
                WHERE event_type = 'asset_download' AND workspace_id = p_workspace_id
                GROUP BY asset_id
            ) dl ON a.asset_id = dl.asset_id
            LEFT JOIN (
                SELECT asset_id, COUNT(*) as total_shares
                FROM analytics_events
                WHERE event_type = 'asset_share' AND workspace_id = p_workspace_id
                GROUP BY asset_id
            ) sh ON a.asset_id = sh.asset_id
            LEFT JOIN (
                SELECT asset_id, COUNT(*) as views_7d
                FROM analytics_events
                WHERE event_type = 'asset_view' AND workspace_id = p_workspace_id
                AND occurred_at >= NOW() - INTERVAL '7 days'
                GROUP BY asset_id
            ) ev7 ON a.asset_id = ev7.asset_id
            LEFT JOIN (
                SELECT asset_id, COUNT(*) as views_30d
                FROM analytics_events
                WHERE event_type = 'asset_view' AND workspace_id = p_workspace_id
                AND occurred_at >= NOW() - INTERVAL '30 days'
                GROUP BY asset_id
            ) ev30 ON a.asset_id = ev30.asset_id
            LEFT JOIN (
                SELECT asset_id, COUNT(*) as favorites_7d
                FROM analytics_events
                WHERE event_type = 'asset_favorite' AND workspace_id = p_workspace_id
                AND occurred_at >= NOW() - INTERVAL '7 days'
                GROUP BY asset_id
            ) fav7 ON a.asset_id = fav7.asset_id
            LEFT JOIN (
                SELECT asset_id, COUNT(*) as favorites_30d
                FROM analytics_events
                WHERE event_type = 'asset_favorite' AND workspace_id = p_workspace_id
                AND occurred_at >= NOW() - INTERVAL '30 days'
                GROUP BY asset_id
            ) fav30 ON a.asset_id = fav30.asset_id
            WHERE a.workspace_id = p_workspace_id AND a.deleted_at IS NULL
            ON CONFLICT (workspace_id, asset_id)
            DO UPDATE SET
                gallery_id = EXCLUDED.gallery_id,
                total_views = EXCLUDED.total_views,
                unique_viewers = EXCLUDED.unique_viewers,
                total_favorites = EXCLUDED.total_favorites,
                total_selections = EXCLUDED.total_selections,
                total_downloads = EXCLUDED.total_downloads,
                total_shares = EXCLUDED.total_shares,
                views_last_7d = EXCLUDED.views_last_7d,
                views_last_30d = EXCLUDED.views_last_30d,
                favorites_last_7d = EXCLUDED.favorites_last_7d,
                favorites_last_30d = EXCLUDED.favorites_last_30d,
                engagement_score = EXCLUDED.engagement_score,
                view_score = EXCLUDED.view_score,
                action_score = EXCLUDED.action_score,
                recency_score = EXCLUDED.recency_score,
                conversion_score = EXCLUDED.conversion_score,
                conversion_rate = EXCLUDED.conversion_rate,
                last_calculated_at = NOW(),
                updated_at = NOW();

            GET DIAGNOSTICS updated_count = ROW_COUNT;
            RETURN updated_count;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # =========================================================================
    # 11. Create materialized view for top performing assets
    # =========================================================================
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS portfolio_top_assets_mv AS
        SELECT
            pes.workspace_id,
            pes.asset_id,
            pes.gallery_id,
            pes.engagement_score,
            pes.total_views,
            pes.total_favorites,
            pes.total_selections,
            pes.total_downloads,
            pes.conversion_rate,
            pae.scene_category,
            pae.aesthetic_score,
            pae.overall_quality_score,
            pae.color_palette,
            ROW_NUMBER() OVER (PARTITION BY pes.workspace_id ORDER BY pes.engagement_score DESC) as rank_in_workspace,
            ROW_NUMBER() OVER (PARTITION BY pes.workspace_id, pae.scene_category ORDER BY pes.engagement_score DESC) as rank_in_category,
            PERCENT_RANK() OVER (PARTITION BY pes.workspace_id ORDER BY pes.engagement_score) as percentile
        FROM portfolio_engagement_scores pes
        LEFT JOIN portfolio_asset_embeddings pae ON pes.asset_id = pae.asset_id AND pes.workspace_id = pae.workspace_id
        WHERE pes.engagement_score > 0;
        """
    )

    # Top assets materialized view indexes
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_ptam_workspace_asset ON portfolio_top_assets_mv(workspace_id, asset_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ptam_workspace_rank ON portfolio_top_assets_mv(workspace_id, rank_in_workspace);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ptam_category_rank ON portfolio_top_assets_mv(workspace_id, scene_category, rank_in_category);"
    )

    # =========================================================================
    # 12. Create refresh function for top assets
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_portfolio_top_assets()
        RETURNS void AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY portfolio_top_assets_mv;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def downgrade() -> None:
    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS refresh_portfolio_top_assets();")
    op.execute("DROP FUNCTION IF EXISTS refresh_portfolio_engagement_scores(UUID);")
    op.execute("DROP FUNCTION IF EXISTS calculate_asset_engagement_score(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);")

    # Drop materialized view
    op.execute("DROP MATERIALIZED VIEW IF EXISTS portfolio_top_assets_mv;")

    # Drop indexes and tables in reverse order
    op.execute("DROP INDEX IF EXISTS idx_prm_workspace_period;")
    op.execute("DROP TABLE IF EXISTS portfolio_recommendation_metrics;")

    op.execute("DROP INDEX IF EXISTS idx_prat_active;")
    op.execute("DROP INDEX IF EXISTS idx_prat_workspace_status;")
    op.execute("DROP TABLE IF EXISTS portfolio_recommendation_ab_tests;")

    op.execute("DROP INDEX IF EXISTS idx_prf_unprocessed;")
    op.execute("DROP INDEX IF EXISTS idx_prf_workspace_type;")
    op.execute("DROP INDEX IF EXISTS idx_prf_recommendation;")
    op.execute("DROP TABLE IF EXISTS portfolio_recommendation_feedback;")

    op.execute("DROP INDEX IF EXISTS idx_pri_selected;")
    op.execute("DROP INDEX IF EXISTS idx_pri_workspace_asset;")
    op.execute("DROP INDEX IF EXISTS idx_pri_recommendation;")
    op.execute("DROP TABLE IF EXISTS portfolio_recommendation_items;")

    op.execute("DROP INDEX IF EXISTS idx_pr_recent;")
    op.execute("DROP INDEX IF EXISTS idx_pr_ab_test;")
    op.execute("DROP INDEX IF EXISTS idx_pr_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_pr_workspace_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_pr_workspace_client;")
    op.execute("DROP INDEX IF EXISTS idx_pr_workspace_type;")
    op.execute("DROP TABLE IF EXISTS portfolio_recommendations;")

    op.execute("DROP INDEX IF EXISTS idx_pcp_occasion;")
    op.execute("DROP INDEX IF EXISTS idx_pcp_client_type;")
    op.execute("DROP INDEX IF EXISTS idx_pcp_workspace_client;")
    op.execute("DROP TABLE IF EXISTS portfolio_client_preferences;")

    op.execute("DROP INDEX IF EXISTS idx_pes_conversions;")
    op.execute("DROP INDEX IF EXISTS idx_pes_high_engagement;")
    op.execute("DROP INDEX IF EXISTS idx_pes_workspace_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_pes_workspace_score;")
    op.execute("DROP TABLE IF EXISTS portfolio_engagement_scores;")

    op.execute("DROP INDEX IF EXISTS idx_pae_clip_hnsw;")
    op.execute("DROP INDEX IF EXISTS idx_pae_aesthetic;")
    op.execute("DROP INDEX IF EXISTS idx_pae_quality;")
    op.execute("DROP INDEX IF EXISTS idx_pae_scene;")
    op.execute("DROP INDEX IF EXISTS idx_pae_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_pae_workspace;")
    op.execute("DROP TABLE IF EXISTS portfolio_asset_embeddings;")
