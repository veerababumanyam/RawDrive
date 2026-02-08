"""Add churn prediction and intervention campaign system.

Creates comprehensive churn prediction and automated intervention system:
- churn_predictions: ML-based churn predictions with explainable factors
- intervention_campaigns: Automated re-engagement campaigns
- intervention_actions: Individual intervention actions triggered
- intervention_experiments: A/B testing framework for interventions
- intervention_experiment_variants: Variants for A/B tests
- churn_prevention_metrics: Dashboard metrics for admin monitoring

Feature: Churn Prediction & Prevention System
Revision ID: 0176
Revises: 0175
Create Date: 2026-02-01
"""

from alembic import op

revision = "0176"
down_revision = "858a707482da"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. CHURN_PREDICTIONS TABLE - ML-based churn predictions
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS churn_predictions (
            prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Churn risk score (0-100, higher = more likely to churn)
            churn_score DECIMAL(5, 2) NOT NULL DEFAULT 0,

            -- Risk tier classification
            risk_tier VARCHAR(20) NOT NULL DEFAULT 'low' CHECK (risk_tier IN (
                'critical', 'high', 'medium', 'low', 'minimal'
            )),

            -- Explainable factors (human-readable)
            risk_factors JSONB NOT NULL DEFAULT '[]',
            -- Example: [{"factor": "no_gallery_views_30d", "description": "No gallery views in 30 days", "weight": 35}]

            -- Model inputs used for prediction
            model_inputs JSONB NOT NULL DEFAULT '{}',
            -- Example: {"days_since_activity": 32, "gallery_views_30d": 0, "engagement_trend": "declining"}

            -- Predicted churn timeframe
            predicted_churn_window_days INTEGER,  -- e.g., 7 = likely to churn within 7 days
            predicted_churn_probability DECIMAL(5, 4),  -- 0.0000 - 1.0000

            -- Recommended intervention type
            recommended_intervention VARCHAR(30) CHECK (recommended_intervention IN (
                'email_campaign', 'in_app_prompt', 'special_offer', 'gallery_highlight',
                're_engagement_gallery', 'personal_outreach', 'none'
            )),
            recommended_intervention_urgency VARCHAR(10) CHECK (recommended_intervention_urgency IN (
                'immediate', 'urgent', 'normal', 'low'
            )),

            -- Subscription signals (for subscription-based churn)
            subscription_renewal_date TIMESTAMPTZ,
            days_until_renewal INTEGER,
            subscription_at_risk BOOLEAN DEFAULT FALSE,

            -- Usage pattern signals
            usage_trend VARCHAR(20) CHECK (usage_trend IN (
                'growing', 'stable', 'declining', 'dormant', 'reactivating'
            )),
            usage_decline_pct DECIMAL(5, 2),  -- Percentage decline over 30 days

            -- Model metadata
            model_version VARCHAR(20) DEFAULT 'v1.0',
            model_confidence DECIMAL(5, 4),  -- 0.0000 - 1.0000
            training_data_cutoff TIMESTAMPTZ,

            -- Status
            prediction_status VARCHAR(20) DEFAULT 'active' CHECK (prediction_status IN (
                'active', 'intervention_triggered', 'resolved', 'churned', 'expired'
            )),

            -- Outcome tracking (for model improvement)
            actual_outcome VARCHAR(20) CHECK (actual_outcome IN (
                'retained', 'churned', 'downgraded', 'upgraded', 'pending'
            )),
            outcome_recorded_at TIMESTAMPTZ,

            -- Timestamps
            predicted_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            UNIQUE(workspace_id, client_id)
        );
        """
    )

    # Churn predictions indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cp_workspace_score ON churn_predictions(workspace_id, churn_score DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cp_workspace_tier ON churn_predictions(workspace_id, risk_tier);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cp_workspace_status ON churn_predictions(workspace_id, prediction_status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cp_critical_risk ON churn_predictions(workspace_id) WHERE risk_tier IN ('critical', 'high');"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cp_intervention_needed ON churn_predictions(workspace_id, recommended_intervention_urgency) WHERE prediction_status = 'active' AND recommended_intervention IS NOT NULL;"
    )

    # =========================================================================
    # 2. INTERVENTION_CAMPAIGNS TABLE - Automated campaign definitions
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS intervention_campaigns (
            campaign_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Campaign identification
            campaign_name VARCHAR(100) NOT NULL,
            campaign_type VARCHAR(30) NOT NULL CHECK (campaign_type IN (
                'email_sequence', 'in_app_prompt', 'special_offer', 'gallery_highlight',
                're_engagement_gallery', 'personal_outreach', 'multi_channel'
            )),

            -- Targeting criteria
            target_risk_tiers VARCHAR(30)[] DEFAULT ARRAY['critical', 'high'],
            target_min_churn_score DECIMAL(5, 2) DEFAULT 60,
            target_usage_trends VARCHAR(20)[] DEFAULT ARRAY['declining', 'dormant'],

            -- Exclusion criteria
            exclude_active_campaigns BOOLEAN DEFAULT TRUE,
            exclude_recent_intervention_days INTEGER DEFAULT 14,

            -- Campaign content
            campaign_content JSONB NOT NULL DEFAULT '{}',
            -- Example for email: {"subject": "We miss you!", "template_id": "uuid", "personalization_fields": ["first_name", "last_gallery"]}

            -- Timing configuration
            trigger_delay_hours INTEGER DEFAULT 0,  -- Delay after client qualifies
            send_time_preference VARCHAR(20) DEFAULT 'optimal',  -- 'optimal', 'morning', 'afternoon', 'evening'
            timezone_aware BOOLEAN DEFAULT TRUE,

            -- Offer configuration (if applicable)
            offer_type VARCHAR(30) CHECK (offer_type IN (
                'discount_percentage', 'discount_fixed', 'free_trial_extension',
                'feature_unlock', 'credit_bonus', 'none'
            )),
            offer_value DECIMAL(10, 2),
            offer_expires_days INTEGER DEFAULT 7,

            -- Status
            status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
                'draft', 'active', 'paused', 'completed', 'archived'
            )),
            is_default_campaign BOOLEAN DEFAULT FALSE,

            -- Performance metrics (denormalized for quick access)
            total_triggered INTEGER DEFAULT 0,
            total_delivered INTEGER DEFAULT 0,
            total_opened INTEGER DEFAULT 0,
            total_clicked INTEGER DEFAULT 0,
            total_converted INTEGER DEFAULT 0,
            conversion_rate DECIMAL(5, 4),

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            activated_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ
        );
        """
    )

    # Intervention campaigns indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ic_workspace_status ON intervention_campaigns(workspace_id, status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ic_workspace_type ON intervention_campaigns(workspace_id, campaign_type);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ic_active ON intervention_campaigns(workspace_id) WHERE status = 'active';"
    )

    # =========================================================================
    # 3. INTERVENTION_ACTIONS TABLE - Individual interventions triggered
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS intervention_actions (
            action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            campaign_id UUID REFERENCES intervention_campaigns(campaign_id) ON DELETE SET NULL,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
            prediction_id UUID REFERENCES churn_predictions(prediction_id) ON DELETE SET NULL,

            -- Experiment assignment (for A/B testing)
            experiment_id UUID,
            variant_id UUID,

            -- Action details
            action_type VARCHAR(30) NOT NULL CHECK (action_type IN (
                'email_sent', 'in_app_prompt_shown', 'offer_presented', 'gallery_created',
                'personal_call_scheduled', 'sms_sent', 'push_notification_sent'
            )),

            -- Content delivered
            content_snapshot JSONB,  -- Snapshot of what was shown/sent
            personalization_data JSONB,  -- Data used for personalization

            -- Delivery tracking
            delivery_status VARCHAR(20) DEFAULT 'pending' CHECK (delivery_status IN (
                'pending', 'scheduled', 'delivered', 'failed', 'bounced', 'blocked'
            )),
            scheduled_for TIMESTAMPTZ,
            delivered_at TIMESTAMPTZ,
            failure_reason TEXT,

            -- Engagement tracking
            opened_at TIMESTAMPTZ,
            clicked_at TIMESTAMPTZ,
            click_count INTEGER DEFAULT 0,

            -- Offer tracking (if applicable)
            offer_code VARCHAR(50),
            offer_expires_at TIMESTAMPTZ,
            offer_redeemed_at TIMESTAMPTZ,
            offer_value DECIMAL(10, 2),

            -- Outcome
            outcome VARCHAR(30) CHECK (outcome IN (
                'converted', 'reactivated', 'upgraded', 'renewed', 'downgraded',
                'churned', 'no_response', 'unsubscribed', 'pending'
            )),
            outcome_recorded_at TIMESTAMPTZ,
            outcome_revenue_impact DECIMAL(12, 2),  -- Positive = saved revenue, negative = lost

            -- Attribution
            attributed_to_intervention BOOLEAN DEFAULT FALSE,  -- Was outcome caused by this intervention?
            attribution_confidence DECIMAL(5, 4),

            -- Churn score at time of intervention
            churn_score_at_trigger DECIMAL(5, 2),
            risk_tier_at_trigger VARCHAR(20),

            -- Timestamps
            triggered_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Intervention actions indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ia_workspace_client ON intervention_actions(workspace_id, client_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ia_workspace_campaign ON intervention_actions(workspace_id, campaign_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ia_workspace_status ON intervention_actions(workspace_id, delivery_status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ia_workspace_outcome ON intervention_actions(workspace_id, outcome);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ia_experiment ON intervention_actions(experiment_id, variant_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ia_pending_delivery ON intervention_actions(scheduled_for) WHERE delivery_status = 'scheduled';"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ia_client_recent ON intervention_actions(client_id, triggered_at DESC);"
    )

    # =========================================================================
    # 4. INTERVENTION_EXPERIMENTS TABLE - A/B testing framework
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS intervention_experiments (
            experiment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Experiment identification
            experiment_name VARCHAR(100) NOT NULL,
            experiment_description TEXT,
            hypothesis TEXT,  -- What we're testing

            -- Targeting
            target_campaign_id UUID REFERENCES intervention_campaigns(campaign_id) ON DELETE SET NULL,
            target_risk_tiers VARCHAR(30)[] DEFAULT ARRAY['critical', 'high', 'medium'],
            min_sample_size INTEGER DEFAULT 100,

            -- Traffic allocation
            traffic_percentage DECIMAL(5, 2) DEFAULT 100,  -- % of qualifying clients enrolled

            -- Duration
            start_date TIMESTAMPTZ NOT NULL,
            end_date TIMESTAMPTZ,
            auto_conclude_on_significance BOOLEAN DEFAULT TRUE,

            -- Statistical settings
            significance_level DECIMAL(5, 4) DEFAULT 0.05,  -- p-value threshold (0.05 = 95% confidence)
            minimum_detectable_effect DECIMAL(5, 4) DEFAULT 0.10,  -- 10% lift

            -- Status
            status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
                'draft', 'active', 'paused', 'concluded', 'archived'
            )),

            -- Results (calculated periodically)
            current_results JSONB DEFAULT '{}',
            -- Example: {"control": {"n": 50, "converted": 5}, "variant_a": {"n": 48, "converted": 8}, "p_value": 0.12}
            winner_variant_id UUID,
            statistical_significance_reached BOOLEAN DEFAULT FALSE,
            significance_reached_at TIMESTAMPTZ,

            -- Metrics tracked
            primary_metric VARCHAR(50) DEFAULT 'conversion_rate',  -- Main success metric
            secondary_metrics VARCHAR(50)[] DEFAULT ARRAY['open_rate', 'click_rate', 'revenue_impact'],

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            concluded_at TIMESTAMPTZ
        );
        """
    )

    # Intervention experiments indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ie_workspace_status ON intervention_experiments(workspace_id, status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ie_active ON intervention_experiments(workspace_id) WHERE status = 'active';"
    )

    # =========================================================================
    # 5. INTERVENTION_EXPERIMENT_VARIANTS TABLE - Variants for A/B tests
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS intervention_experiment_variants (
            variant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            experiment_id UUID NOT NULL REFERENCES intervention_experiments(experiment_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Variant identification
            variant_name VARCHAR(50) NOT NULL,  -- e.g., "control", "variant_a", "variant_b"
            variant_description TEXT,
            is_control BOOLEAN DEFAULT FALSE,

            -- Traffic allocation
            traffic_weight INTEGER DEFAULT 50,  -- Relative weight for allocation

            -- Variant configuration
            variant_config JSONB NOT NULL DEFAULT '{}',
            -- Example: {"subject_line": "We miss you!", "offer_percent": 15, "email_template": "re_engagement_v2"}

            -- Performance metrics
            total_assigned INTEGER DEFAULT 0,
            total_delivered INTEGER DEFAULT 0,
            total_opened INTEGER DEFAULT 0,
            total_clicked INTEGER DEFAULT 0,
            total_converted INTEGER DEFAULT 0,
            total_revenue_impact DECIMAL(12, 2) DEFAULT 0,

            -- Calculated rates
            open_rate DECIMAL(5, 4),
            click_rate DECIMAL(5, 4),
            conversion_rate DECIMAL(5, 4),
            avg_revenue_per_client DECIMAL(10, 2),

            -- Statistical comparison to control
            lift_vs_control DECIMAL(6, 4),  -- e.g., 0.15 = 15% lift
            p_value DECIMAL(8, 6),
            confidence_interval_low DECIMAL(6, 4),
            confidence_interval_high DECIMAL(6, 4),

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Experiment variants indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_iev_experiment ON intervention_experiment_variants(experiment_id);"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_iev_experiment_control ON intervention_experiment_variants(experiment_id) WHERE is_control = TRUE;"
    )

    # =========================================================================
    # 6. CHURN_PREVENTION_METRICS TABLE - Dashboard metrics aggregation
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS churn_prevention_metrics (
            metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Time period
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),

            -- At-risk client counts
            total_clients INTEGER DEFAULT 0,
            at_risk_clients INTEGER DEFAULT 0,
            critical_risk_clients INTEGER DEFAULT 0,
            high_risk_clients INTEGER DEFAULT 0,
            medium_risk_clients INTEGER DEFAULT 0,

            -- Intervention activity
            interventions_triggered INTEGER DEFAULT 0,
            interventions_delivered INTEGER DEFAULT 0,
            interventions_opened INTEGER DEFAULT 0,
            interventions_clicked INTEGER DEFAULT 0,

            -- Outcomes
            clients_retained INTEGER DEFAULT 0,
            clients_churned INTEGER DEFAULT 0,
            clients_downgraded INTEGER DEFAULT 0,
            clients_upgraded INTEGER DEFAULT 0,

            -- Revenue impact
            revenue_at_risk DECIMAL(12, 2) DEFAULT 0,  -- MRR at risk from at-risk clients
            revenue_saved DECIMAL(12, 2) DEFAULT 0,  -- MRR retained through interventions
            revenue_lost DECIMAL(12, 2) DEFAULT 0,  -- MRR lost to churn

            -- Rates
            churn_rate DECIMAL(6, 4),  -- Period churn rate
            retention_rate DECIMAL(6, 4),  -- 1 - churn_rate
            intervention_success_rate DECIMAL(6, 4),  -- % of interventions that retained client
            prevention_rate DECIMAL(6, 4),  -- % of at-risk clients retained

            -- Model performance
            prediction_accuracy DECIMAL(6, 4),  -- How accurate were churn predictions
            false_positive_rate DECIMAL(6, 4),  -- Predicted churn but didn't
            false_negative_rate DECIMAL(6, 4),  -- Didn't predict churn but did

            -- Timestamps
            calculated_at TIMESTAMPTZ DEFAULT NOW(),

            UNIQUE(workspace_id, period_start, period_end, period_type)
        );
        """
    )

    # Churn prevention metrics indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cpm_workspace_period ON churn_prevention_metrics(workspace_id, period_start DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cpm_workspace_type ON churn_prevention_metrics(workspace_id, period_type, period_start DESC);"
    )

    # =========================================================================
    # 7. Create default intervention campaigns for all workspaces
    # =========================================================================
    op.execute(
        """
        INSERT INTO intervention_campaigns (
            workspace_id,
            campaign_name,
            campaign_type,
            target_risk_tiers,
            target_min_churn_score,
            target_usage_trends,
            campaign_content,
            trigger_delay_hours,
            status,
            is_default_campaign
        )
        SELECT
            w.workspace_id,
            'Default Re-engagement Email',
            'email_sequence',
            ARRAY['critical', 'high'],
            70,
            ARRAY['declining', 'dormant'],
            '{"template": "re_engagement_default", "sequence": [{"delay_hours": 0, "template": "we_miss_you"}, {"delay_hours": 72, "template": "heres_what_you_missed"}]}',
            4,
            'active',
            TRUE
        FROM workspaces w
        WHERE NOT EXISTS (
            SELECT 1 FROM intervention_campaigns ic
            WHERE ic.workspace_id = w.workspace_id AND ic.is_default_campaign = TRUE
        );
        """
    )

    # =========================================================================
    # 8. Create materialized view for churn dashboard
    # =========================================================================
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS churn_dashboard_mv AS
        SELECT
            cp.workspace_id,
            cp.client_id,
            c.full_name,
            c.status as client_status,
            cp.churn_score,
            cp.risk_tier,
            cp.risk_factors,
            cp.predicted_churn_window_days,
            cp.recommended_intervention,
            cp.recommended_intervention_urgency,
            cp.usage_trend,
            cp.subscription_at_risk,
            cp.days_until_renewal,
            cp.prediction_status,
            es.total_score as engagement_score,
            es.score_tier as engagement_tier,
            es.days_since_last_activity,
            (
                SELECT COUNT(*)
                FROM intervention_actions ia
                WHERE ia.client_id = cp.client_id
                AND ia.workspace_id = cp.workspace_id
                AND ia.triggered_at >= NOW() - INTERVAL '30 days'
            ) as recent_interventions,
            (
                SELECT MAX(ia.triggered_at)
                FROM intervention_actions ia
                WHERE ia.client_id = cp.client_id
                AND ia.workspace_id = cp.workspace_id
            ) as last_intervention_at,
            cp.predicted_at,
            cp.updated_at
        FROM churn_predictions cp
        JOIN clients c ON cp.client_id = c.client_id AND cp.workspace_id = c.workspace_id
        LEFT JOIN engagement_scores es ON cp.client_id = es.client_id AND cp.workspace_id = es.workspace_id
        WHERE cp.prediction_status = 'active';
        """
    )

    # Dashboard materialized view indexes
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_cdm_workspace_client ON churn_dashboard_mv(workspace_id, client_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cdm_workspace_score ON churn_dashboard_mv(workspace_id, churn_score DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cdm_workspace_tier ON churn_dashboard_mv(workspace_id, risk_tier);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cdm_critical ON churn_dashboard_mv(workspace_id) WHERE risk_tier IN ('critical', 'high');"
    )

    # =========================================================================
    # 9. Create function to refresh churn dashboard
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_churn_dashboard()
        RETURNS void AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY churn_dashboard_mv;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # =========================================================================
    # 10. Create function to update campaign metrics
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_campaign_metrics(p_campaign_id UUID)
        RETURNS void AS $$
        BEGIN
            UPDATE intervention_campaigns ic
            SET
                total_triggered = (SELECT COUNT(*) FROM intervention_actions ia WHERE ia.campaign_id = p_campaign_id),
                total_delivered = (SELECT COUNT(*) FROM intervention_actions ia WHERE ia.campaign_id = p_campaign_id AND ia.delivery_status = 'delivered'),
                total_opened = (SELECT COUNT(*) FROM intervention_actions ia WHERE ia.campaign_id = p_campaign_id AND ia.opened_at IS NOT NULL),
                total_clicked = (SELECT COUNT(*) FROM intervention_actions ia WHERE ia.campaign_id = p_campaign_id AND ia.clicked_at IS NOT NULL),
                total_converted = (SELECT COUNT(*) FROM intervention_actions ia WHERE ia.campaign_id = p_campaign_id AND ia.outcome IN ('converted', 'reactivated', 'upgraded', 'renewed')),
                conversion_rate = (
                    SELECT
                        CASE
                            WHEN COUNT(*) FILTER (WHERE delivery_status = 'delivered') = 0 THEN 0
                            ELSE COUNT(*) FILTER (WHERE outcome IN ('converted', 'reactivated', 'upgraded', 'renewed'))::DECIMAL / COUNT(*) FILTER (WHERE delivery_status = 'delivered')
                        END
                    FROM intervention_actions ia
                    WHERE ia.campaign_id = p_campaign_id
                ),
                updated_at = NOW()
            WHERE ic.campaign_id = p_campaign_id;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def downgrade() -> None:
    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS update_campaign_metrics(UUID);")
    op.execute("DROP FUNCTION IF EXISTS refresh_churn_dashboard();")

    # Drop materialized view
    op.execute("DROP MATERIALIZED VIEW IF EXISTS churn_dashboard_mv;")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_cpm_workspace_type;")
    op.execute("DROP INDEX IF EXISTS idx_cpm_workspace_period;")
    op.execute("DROP INDEX IF EXISTS idx_iev_experiment_control;")
    op.execute("DROP INDEX IF EXISTS idx_iev_experiment;")
    op.execute("DROP INDEX IF EXISTS idx_ie_active;")
    op.execute("DROP INDEX IF EXISTS idx_ie_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_ia_client_recent;")
    op.execute("DROP INDEX IF EXISTS idx_ia_pending_delivery;")
    op.execute("DROP INDEX IF EXISTS idx_ia_experiment;")
    op.execute("DROP INDEX IF EXISTS idx_ia_workspace_outcome;")
    op.execute("DROP INDEX IF EXISTS idx_ia_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_ia_workspace_campaign;")
    op.execute("DROP INDEX IF EXISTS idx_ia_workspace_client;")
    op.execute("DROP INDEX IF EXISTS idx_ic_active;")
    op.execute("DROP INDEX IF EXISTS idx_ic_workspace_type;")
    op.execute("DROP INDEX IF EXISTS idx_ic_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_cp_intervention_needed;")
    op.execute("DROP INDEX IF EXISTS idx_cp_critical_risk;")
    op.execute("DROP INDEX IF EXISTS idx_cp_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_cp_workspace_tier;")
    op.execute("DROP INDEX IF EXISTS idx_cp_workspace_score;")

    # Drop tables in reverse order
    op.execute("DROP TABLE IF EXISTS churn_prevention_metrics;")
    op.execute("DROP TABLE IF EXISTS intervention_experiment_variants;")
    op.execute("DROP TABLE IF EXISTS intervention_experiments;")
    op.execute("DROP TABLE IF EXISTS intervention_actions;")
    op.execute("DROP TABLE IF EXISTS intervention_campaigns;")
    op.execute("DROP TABLE IF EXISTS churn_predictions;")
