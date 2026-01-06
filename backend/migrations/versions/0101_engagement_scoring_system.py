"""Add engagement scoring system tables.

Creates comprehensive engagement tracking and scoring system:
- engagement_events: Raw event tracking for all client interactions
- engagement_scores: Calculated engagement scores per client
- engagement_score_factors: Breakdown of score components
- predictive_scores: High-intent and churn risk predictions
- follow_up_recommendations: AI-generated follow-up recommendations
- engagement_score_history: Historical score snapshots for trend analysis

Feature: Automated Engagement Scoring System
Revision ID: 0101
Revises: 0100
Create Date: 2025-01-06
"""

from alembic import op

revision = "0101"
down_revision = "0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. ENGAGEMENT_EVENTS TABLE - Raw event tracking
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS engagement_events (
            event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Event identification
            event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
                'gallery_view', 'gallery_view_duration', 'photo_view',
                'favorite_added', 'favorite_removed', 'selection_made', 'selection_removed',
                'download_initiated', 'download_completed',
                'rsvp_submitted', 'rsvp_updated',
                'comment_added', 'share_created', 'share_accessed',
                'email_opened', 'email_clicked', 'email_bounced',
                'payment_received', 'invoice_viewed',
                'magic_link_accessed', 'qr_code_scanned'
            )),

            -- Event context
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE SET NULL,
            asset_id UUID REFERENCES assets(asset_id) ON DELETE SET NULL,
            invitation_id UUID,  -- Reference to invitations table

            -- Event metadata
            metadata JSONB DEFAULT '{}',

            -- Source tracking
            source VARCHAR(30) CHECK (source IN (
                'web', 'mobile', 'email', 'magic_link', 'qr_code', 'direct', 'api'
            )),
            device_type VARCHAR(20) CHECK (device_type IN ('desktop', 'tablet', 'mobile', 'unknown')),
            ip_address VARCHAR(45),  -- IPv6 compatible
            user_agent TEXT,

            -- Engagement value (weight for scoring)
            engagement_value DECIMAL(5, 2) DEFAULT 1.0,

            -- Timestamps
            event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Engagement events indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ee_workspace_client ON engagement_events(workspace_id, client_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ee_workspace_client_time ON engagement_events(workspace_id, client_id, event_timestamp DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ee_workspace_type_time ON engagement_events(workspace_id, event_type, event_timestamp DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ee_gallery ON engagement_events(gallery_id) WHERE gallery_id IS NOT NULL;"
    )
    # Note: Partial index with NOW() is not valid (not IMMUTABLE). Use a regular index instead.
    # The application can filter by event_timestamp at query time.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ee_recent ON engagement_events(workspace_id, event_timestamp DESC);"
    )

    # =========================================================================
    # 2. ENGAGEMENT_SCORES TABLE - Calculated engagement scores
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS engagement_scores (
            score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Overall engagement score (0-100)
            total_score DECIMAL(5, 2) NOT NULL DEFAULT 0,

            -- Score tier classification
            score_tier VARCHAR(20) NOT NULL DEFAULT 'cold' CHECK (score_tier IN (
                'champion', 'hot', 'warm', 'cool', 'cold', 'at_risk', 'churned'
            )),

            -- Component scores (0-100 each)
            activity_score DECIMAL(5, 2) DEFAULT 0,         -- Gallery views, interactions
            engagement_depth_score DECIMAL(5, 2) DEFAULT 0, -- Time spent, photos viewed
            conversion_score DECIMAL(5, 2) DEFAULT 0,       -- Favorites, selections, downloads
            responsiveness_score DECIMAL(5, 2) DEFAULT 0,   -- Response times, RSVP speed
            loyalty_score DECIMAL(5, 2) DEFAULT 0,          -- Return visits, multi-gallery

            -- Trend indicators
            score_trend VARCHAR(10) DEFAULT 'stable' CHECK (score_trend IN (
                'rising', 'stable', 'declining'
            )),
            trend_velocity DECIMAL(5, 2) DEFAULT 0,  -- Rate of change

            -- Timing metrics
            days_since_last_activity INTEGER,
            total_interactions_30d INTEGER DEFAULT 0,
            total_interactions_90d INTEGER DEFAULT 0,

            -- Calculation metadata
            last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
            calculation_version VARCHAR(10) DEFAULT 'v1.0',

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            UNIQUE(workspace_id, client_id)
        );
        """
    )

    # Engagement scores indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_es_workspace_tier ON engagement_scores(workspace_id, score_tier);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_es_workspace_score ON engagement_scores(workspace_id, total_score DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_es_workspace_trend ON engagement_scores(workspace_id, score_trend);"
    )

    # =========================================================================
    # 3. ENGAGEMENT_SCORE_FACTORS TABLE - Score breakdown details
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS engagement_score_factors (
            factor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            score_id UUID NOT NULL REFERENCES engagement_scores(score_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Factor identification
            factor_category VARCHAR(30) NOT NULL CHECK (factor_category IN (
                'activity', 'engagement_depth', 'conversion', 'responsiveness', 'loyalty'
            )),
            factor_name VARCHAR(50) NOT NULL,

            -- Factor values
            raw_value DECIMAL(12, 4),  -- Original metric value
            weighted_value DECIMAL(8, 4),  -- After weight applied
            weight DECIMAL(5, 4) DEFAULT 1.0,  -- Weight multiplier

            -- Factor metadata
            description TEXT,

            -- Timestamps
            calculated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Score factors indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_esf_score ON engagement_score_factors(score_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_esf_workspace_category ON engagement_score_factors(workspace_id, factor_category);"
    )

    # =========================================================================
    # 4. PREDICTIVE_SCORES TABLE - High-intent and churn predictions
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS predictive_scores (
            prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- High-intent prediction (0-100)
            high_intent_score DECIMAL(5, 2) DEFAULT 0,
            high_intent_signals JSONB DEFAULT '[]',  -- Array of detected signals

            -- Churn risk prediction (0-100)
            churn_risk_score DECIMAL(5, 2) DEFAULT 0,
            churn_risk_factors JSONB DEFAULT '[]',  -- Array of risk factors

            -- Predicted outcomes
            predicted_conversion_probability DECIMAL(5, 4),  -- 0.0000 - 1.0000
            predicted_ltv_tier VARCHAR(20) CHECK (predicted_ltv_tier IN (
                'premium', 'high', 'medium', 'low', 'unknown'
            )),

            -- Urgency indicators
            requires_immediate_action BOOLEAN DEFAULT FALSE,
            recommended_action_deadline TIMESTAMPTZ,

            -- Model metadata
            model_version VARCHAR(20) DEFAULT 'v1.0',
            confidence_score DECIMAL(5, 4),  -- Model confidence 0-1

            -- Timestamps
            predicted_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',

            UNIQUE(workspace_id, client_id)
        );
        """
    )

    # Predictive scores indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ps_workspace_intent ON predictive_scores(workspace_id, high_intent_score DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ps_workspace_churn ON predictive_scores(workspace_id, churn_risk_score DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ps_urgent ON predictive_scores(workspace_id, requires_immediate_action) WHERE requires_immediate_action = TRUE;"
    )

    # =========================================================================
    # 5. FOLLOW_UP_RECOMMENDATIONS TABLE - AI-generated recommendations
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS follow_up_recommendations (
            recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Recommendation details
            recommendation_type VARCHAR(30) NOT NULL CHECK (recommendation_type IN (
                'email_timing', 'photo_highlight', 'special_offer', 'check_in',
                're_engagement', 'upsell', 'feedback_request', 'referral_ask',
                'milestone_celebration', 'seasonal_promo'
            )),

            -- Priority and timing
            priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN (
                'urgent', 'high', 'medium', 'low'
            )),
            optimal_contact_time TIMESTAMPTZ,
            optimal_day_of_week VARCHAR(10),
            optimal_time_of_day VARCHAR(20),

            -- Content suggestions
            subject_suggestion TEXT,
            message_template TEXT,

            -- Context for the recommendation
            trigger_reason TEXT NOT NULL,
            supporting_data JSONB DEFAULT '{}',  -- Data points that led to this

            -- Photo highlights (for photo_highlight type)
            highlighted_asset_ids UUID[],

            -- Offer details (for special_offer type)
            offer_details JSONB,

            -- Status tracking
            status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
                'pending', 'scheduled', 'sent', 'completed', 'dismissed', 'expired'
            )),
            scheduled_for TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            dismissed_at TIMESTAMPTZ,
            dismissed_reason TEXT,

            -- Outcome tracking
            outcome VARCHAR(20) CHECK (outcome IN (
                'converted', 'responded', 'viewed', 'ignored', 'bounced', 'unsubscribed'
            )),
            outcome_recorded_at TIMESTAMPTZ,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Follow-up recommendations indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fr_workspace_client ON follow_up_recommendations(workspace_id, client_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fr_workspace_status ON follow_up_recommendations(workspace_id, status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fr_workspace_priority ON follow_up_recommendations(workspace_id, priority, created_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fr_pending ON follow_up_recommendations(workspace_id, optimal_contact_time) WHERE status = 'pending';"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_fr_type_status ON follow_up_recommendations(workspace_id, recommendation_type, status);"
    )

    # =========================================================================
    # 6. ENGAGEMENT_SCORE_HISTORY TABLE - Historical snapshots
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS engagement_score_history (
            history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Score snapshot
            total_score DECIMAL(5, 2) NOT NULL,
            score_tier VARCHAR(20) NOT NULL,
            activity_score DECIMAL(5, 2),
            engagement_depth_score DECIMAL(5, 2),
            conversion_score DECIMAL(5, 2),
            responsiveness_score DECIMAL(5, 2),
            loyalty_score DECIMAL(5, 2),

            -- Predictive scores snapshot
            high_intent_score DECIMAL(5, 2),
            churn_risk_score DECIMAL(5, 2),

            -- Period this represents
            period_start TIMESTAMPTZ NOT NULL,
            period_end TIMESTAMPTZ NOT NULL,
            snapshot_type VARCHAR(10) NOT NULL DEFAULT 'daily' CHECK (snapshot_type IN (
                'daily', 'weekly', 'monthly'
            )),

            -- Timestamps
            recorded_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Score history indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_esh_workspace_client ON engagement_score_history(workspace_id, client_id, recorded_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_esh_workspace_period ON engagement_score_history(workspace_id, period_start, period_end);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_esh_snapshot_type ON engagement_score_history(workspace_id, snapshot_type, recorded_at DESC);"
    )

    # =========================================================================
    # 7. ENGAGEMENT_WEIGHTS TABLE - Configurable scoring weights
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS engagement_weights (
            weight_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Weight configuration
            event_type VARCHAR(50) NOT NULL,
            base_weight DECIMAL(5, 2) NOT NULL DEFAULT 1.0,

            -- Time decay settings
            decay_enabled BOOLEAN DEFAULT TRUE,
            decay_half_life_days INTEGER DEFAULT 30,  -- Days for score to halve

            -- Recency bonuses
            recency_bonus_multiplier DECIMAL(5, 2) DEFAULT 1.5,  -- Bonus for events < 7 days
            recency_bonus_days INTEGER DEFAULT 7,

            -- Category assignment
            score_category VARCHAR(30) NOT NULL CHECK (score_category IN (
                'activity', 'engagement_depth', 'conversion', 'responsiveness', 'loyalty'
            )),

            -- Status
            is_active BOOLEAN DEFAULT TRUE,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            UNIQUE(workspace_id, event_type)
        );
        """
    )

    # Weight configuration index
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ew_workspace_active ON engagement_weights(workspace_id, is_active);"
    )

    # =========================================================================
    # 8. Insert default weights
    # =========================================================================
    op.execute(
        """
        INSERT INTO engagement_weights (workspace_id, event_type, base_weight, score_category, decay_half_life_days)
        SELECT
            w.workspace_id,
            e.event_type,
            e.base_weight,
            e.score_category,
            e.decay_half_life_days
        FROM workspaces w
        CROSS JOIN (VALUES
            -- Activity scores
            ('gallery_view', 2.0, 'activity', 14),
            ('photo_view', 1.0, 'activity', 14),
            ('magic_link_accessed', 3.0, 'activity', 14),
            ('qr_code_scanned', 3.0, 'activity', 14),

            -- Engagement depth scores
            ('gallery_view_duration', 5.0, 'engagement_depth', 30),
            ('comment_added', 8.0, 'engagement_depth', 60),

            -- Conversion scores
            ('favorite_added', 10.0, 'conversion', 60),
            ('selection_made', 15.0, 'conversion', 60),
            ('download_initiated', 12.0, 'conversion', 60),
            ('download_completed', 15.0, 'conversion', 60),
            ('payment_received', 50.0, 'conversion', 90),

            -- Responsiveness scores
            ('rsvp_submitted', 20.0, 'responsiveness', 60),
            ('email_opened', 3.0, 'responsiveness', 14),
            ('email_clicked', 5.0, 'responsiveness', 14),

            -- Loyalty scores
            ('share_created', 8.0, 'loyalty', 90),
            ('share_accessed', 5.0, 'loyalty', 60)
        ) AS e(event_type, base_weight, score_category, decay_half_life_days)
        ON CONFLICT (workspace_id, event_type) DO NOTHING;
        """
    )

    # =========================================================================
    # 9. Create materialized view for engagement summaries
    # =========================================================================
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS engagement_summary_mv AS
        SELECT
            es.workspace_id,
            es.client_id,
            c.full_name,
            c.status as client_status,
            es.total_score,
            es.score_tier,
            es.score_trend,
            es.days_since_last_activity,
            es.total_interactions_30d,
            ps.high_intent_score,
            ps.churn_risk_score,
            ps.requires_immediate_action,
            (
                SELECT COUNT(*)
                FROM follow_up_recommendations fr
                WHERE fr.client_id = es.client_id
                AND fr.workspace_id = es.workspace_id
                AND fr.status = 'pending'
            ) as pending_recommendations,
            es.last_calculated_at,
            es.updated_at
        FROM engagement_scores es
        JOIN clients c ON es.client_id = c.client_id AND es.workspace_id = c.workspace_id
        LEFT JOIN predictive_scores ps ON es.client_id = ps.client_id AND es.workspace_id = ps.workspace_id;
        """
    )

    # Materialized view indexes
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_esm_workspace_client ON engagement_summary_mv(workspace_id, client_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_esm_workspace_score ON engagement_summary_mv(workspace_id, total_score DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_esm_workspace_tier ON engagement_summary_mv(workspace_id, score_tier);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_esm_urgent ON engagement_summary_mv(workspace_id, requires_immediate_action) WHERE requires_immediate_action = TRUE;"
    )

    # =========================================================================
    # 10. Create function to refresh engagement summary
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_engagement_summary()
        RETURNS void AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY engagement_summary_mv;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def downgrade() -> None:
    # Drop function
    op.execute("DROP FUNCTION IF EXISTS refresh_engagement_summary();")

    # Drop materialized view
    op.execute("DROP MATERIALIZED VIEW IF EXISTS engagement_summary_mv;")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_ew_workspace_active;")
    op.execute("DROP INDEX IF EXISTS idx_esh_snapshot_type;")
    op.execute("DROP INDEX IF EXISTS idx_esh_workspace_period;")
    op.execute("DROP INDEX IF EXISTS idx_esh_workspace_client;")
    op.execute("DROP INDEX IF EXISTS idx_fr_type_status;")
    op.execute("DROP INDEX IF EXISTS idx_fr_pending;")
    op.execute("DROP INDEX IF EXISTS idx_fr_workspace_priority;")
    op.execute("DROP INDEX IF EXISTS idx_fr_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_fr_workspace_client;")
    op.execute("DROP INDEX IF EXISTS idx_ps_urgent;")
    op.execute("DROP INDEX IF EXISTS idx_ps_workspace_churn;")
    op.execute("DROP INDEX IF EXISTS idx_ps_workspace_intent;")
    op.execute("DROP INDEX IF EXISTS idx_esf_workspace_category;")
    op.execute("DROP INDEX IF EXISTS idx_esf_score;")
    op.execute("DROP INDEX IF EXISTS idx_es_workspace_trend;")
    op.execute("DROP INDEX IF EXISTS idx_es_workspace_score;")
    op.execute("DROP INDEX IF EXISTS idx_es_workspace_tier;")
    op.execute("DROP INDEX IF EXISTS idx_ee_recent;")
    op.execute("DROP INDEX IF EXISTS idx_ee_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_ee_workspace_type_time;")
    op.execute("DROP INDEX IF EXISTS idx_ee_workspace_client_time;")
    op.execute("DROP INDEX IF EXISTS idx_ee_workspace_client;")

    # Drop tables in reverse order
    op.execute("DROP TABLE IF EXISTS engagement_weights;")
    op.execute("DROP TABLE IF EXISTS engagement_score_history;")
    op.execute("DROP TABLE IF EXISTS follow_up_recommendations;")
    op.execute("DROP TABLE IF EXISTS predictive_scores;")
    op.execute("DROP TABLE IF EXISTS engagement_score_factors;")
    op.execute("DROP TABLE IF EXISTS engagement_scores;")
    op.execute("DROP TABLE IF EXISTS engagement_events;")
