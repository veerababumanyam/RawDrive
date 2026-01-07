"""Analytics & Reporting System

Creates the complete analytics module schema including:
- analytics_events: Core event tracking for all user interactions
- gallery_analytics: Aggregated gallery-level metrics (views, engagement, etc.)
- client_analytics: Client engagement scores and lifetime value
- custom_reports: User-defined report configurations and schedules

Revision ID: 0109a
Revises: 0108b
Create Date: 2026-01-06
"""

from alembic import op

revision = '0109a'
down_revision = '0108b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. ANALYTICS_EVENTS TABLE - Core event tracking
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS analytics_events (
            event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Event identification
            event_type VARCHAR(50) NOT NULL,
            event_category VARCHAR(50) NOT NULL,

            -- Related entities (polymorphic references)
            gallery_id UUID REFERENCES galleries(gallery_id) ON DELETE SET NULL,
            asset_id UUID,
            client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
            share_link_id UUID,
            invitation_id UUID,

            -- Actor information
            actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('user', 'client', 'visitor', 'system')),
            actor_id UUID,
            visitor_id UUID REFERENCES visitors(visitor_id) ON DELETE SET NULL,

            -- Session and context
            session_id VARCHAR(100),
            ip_address INET,
            user_agent TEXT,
            referrer TEXT,

            -- Geographic data
            country_code VARCHAR(3),
            region VARCHAR(100),
            city VARCHAR(100),

            -- Device information
            device_type VARCHAR(20) CHECK (device_type IN ('desktop', 'tablet', 'mobile', 'other')),
            browser VARCHAR(50),
            os VARCHAR(50),

            -- Event metadata (flexible JSON for event-specific data)
            metadata JSONB NOT NULL DEFAULT '{}',

            -- Numeric values for aggregation
            numeric_value DECIMAL(15, 4),
            duration_ms INTEGER,

            -- Timestamps
            occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # Add event_type enum check
    op.execute(
        """
        ALTER TABLE analytics_events
        ADD CONSTRAINT check_event_type
        CHECK (event_type IN (
            -- Gallery events
            'gallery_view', 'gallery_download', 'gallery_share',
            -- Asset events
            'asset_view', 'asset_download', 'asset_favorite', 'asset_unfavorite',
            'asset_comment', 'asset_select', 'asset_deselect',
            -- Share link events
            'share_link_created', 'share_link_accessed', 'share_link_expired',
            -- Client portal events
            'client_login', 'client_logout', 'client_registration',
            -- Invitation events
            'invitation_viewed', 'invitation_rsvp', 'invitation_shared',
            -- Download events
            'bulk_download_started', 'bulk_download_completed',
            -- Other events
            'page_view', 'session_start', 'session_end'
        ));
        """
    )

    # Add event_category enum check
    op.execute(
        """
        ALTER TABLE analytics_events
        ADD CONSTRAINT check_event_category
        CHECK (event_category IN (
            'gallery', 'asset', 'client', 'invitation', 'download', 'share', 'session', 'page'
        ));
        """
    )

    # Analytics events indexes for efficient querying
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_time "
        "ON analytics_events(workspace_id, occurred_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_type_time "
        "ON analytics_events(workspace_id, event_type, occurred_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_category_time "
        "ON analytics_events(workspace_id, event_category, occurred_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_analytics_events_gallery_time "
        "ON analytics_events(gallery_id, occurred_at DESC) WHERE gallery_id IS NOT NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_analytics_events_client_time "
        "ON analytics_events(client_id, occurred_at DESC) WHERE client_id IS NOT NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_analytics_events_asset "
        "ON analytics_events(asset_id) WHERE asset_id IS NOT NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor "
        "ON analytics_events(visitor_id) WHERE visitor_id IS NOT NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_analytics_events_session "
        "ON analytics_events(session_id) WHERE session_id IS NOT NULL;"
    )

    # BRIN index for time-based queries (very efficient for append-only tables)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_brin "
        "ON analytics_events USING BRIN(occurred_at) WITH (pages_per_range = 128);"
    )

    # =========================================================================
    # 2. GALLERY_ANALYTICS TABLE - Aggregated gallery metrics
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS gallery_analytics (
            gallery_analytics_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,

            -- Aggregation period
            period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'all_time')),
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,

            -- View metrics
            total_views INTEGER NOT NULL DEFAULT 0,
            unique_visitors INTEGER NOT NULL DEFAULT 0,
            unique_sessions INTEGER NOT NULL DEFAULT 0,

            -- Engagement metrics
            total_favorites INTEGER NOT NULL DEFAULT 0,
            total_comments INTEGER NOT NULL DEFAULT 0,
            total_selections INTEGER NOT NULL DEFAULT 0,
            total_downloads INTEGER NOT NULL DEFAULT 0,

            -- Time metrics
            total_time_spent_ms BIGINT NOT NULL DEFAULT 0,
            avg_session_duration_ms INTEGER NOT NULL DEFAULT 0,
            bounce_rate DECIMAL(5, 2),

            -- Geographic breakdown (top countries as JSON array)
            top_countries JSONB NOT NULL DEFAULT '[]',

            -- Device breakdown
            desktop_views INTEGER NOT NULL DEFAULT 0,
            tablet_views INTEGER NOT NULL DEFAULT 0,
            mobile_views INTEGER NOT NULL DEFAULT 0,

            -- Source tracking
            direct_views INTEGER NOT NULL DEFAULT 0,
            share_link_views INTEGER NOT NULL DEFAULT 0,
            referral_views INTEGER NOT NULL DEFAULT 0,

            -- Share link metrics
            share_links_created INTEGER NOT NULL DEFAULT 0,
            share_link_accesses INTEGER NOT NULL DEFAULT 0,
            share_link_conversions INTEGER NOT NULL DEFAULT 0,

            -- Calculated metrics
            engagement_score DECIMAL(5, 2),
            conversion_rate DECIMAL(5, 2),

            -- Timestamps
            calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Unique constraint for period deduplication
            UNIQUE(gallery_id, period_type, period_start)
        );
        """
    )

    # Gallery analytics indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gallery_analytics_workspace_period "
        "ON gallery_analytics(workspace_id, period_type, period_start DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gallery_analytics_gallery_period "
        "ON gallery_analytics(gallery_id, period_type, period_start DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_gallery_analytics_workspace_views "
        "ON gallery_analytics(workspace_id, total_views DESC) WHERE period_type = 'all_time';"
    )

    # =========================================================================
    # 3. CLIENT_ANALYTICS TABLE - Client engagement metrics
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_analytics (
            client_analytics_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Aggregation period
            period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'all_time')),
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,

            -- Activity metrics
            total_gallery_views INTEGER NOT NULL DEFAULT 0,
            total_asset_views INTEGER NOT NULL DEFAULT 0,
            total_favorites INTEGER NOT NULL DEFAULT 0,
            total_comments INTEGER NOT NULL DEFAULT 0,
            total_selections INTEGER NOT NULL DEFAULT 0,
            total_downloads INTEGER NOT NULL DEFAULT 0,

            -- Session metrics
            total_sessions INTEGER NOT NULL DEFAULT 0,
            total_time_spent_ms BIGINT NOT NULL DEFAULT 0,
            avg_session_duration_ms INTEGER NOT NULL DEFAULT 0,

            -- Gallery interaction metrics
            galleries_viewed INTEGER NOT NULL DEFAULT 0,
            galleries_with_activity INTEGER NOT NULL DEFAULT 0,

            -- Engagement scoring
            engagement_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
            engagement_trend DECIMAL(5, 2),

            -- Lifetime value (in cents)
            lifetime_value_cents BIGINT NOT NULL DEFAULT 0,
            period_revenue_cents BIGINT NOT NULL DEFAULT 0,

            -- Recency metrics
            last_activity_at TIMESTAMPTZ,
            days_since_last_activity INTEGER,

            -- Frequency metrics
            visits_last_7_days INTEGER NOT NULL DEFAULT 0,
            visits_last_30_days INTEGER NOT NULL DEFAULT 0,
            visits_last_90_days INTEGER NOT NULL DEFAULT 0,

            -- Churn risk indicator (0-100)
            churn_risk_score INTEGER,

            -- Timestamps
            calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Unique constraint for period deduplication
            UNIQUE(client_id, period_type, period_start)
        );
        """
    )

    # Client analytics indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_client_analytics_workspace_period "
        "ON client_analytics(workspace_id, period_type, period_start DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_client_analytics_client_period "
        "ON client_analytics(client_id, period_type, period_start DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_client_analytics_workspace_engagement "
        "ON client_analytics(workspace_id, engagement_score DESC) WHERE period_type = 'all_time';"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_client_analytics_workspace_churn "
        "ON client_analytics(workspace_id, churn_risk_score DESC) "
        "WHERE period_type = 'all_time' AND churn_risk_score IS NOT NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_client_analytics_workspace_ltv "
        "ON client_analytics(workspace_id, lifetime_value_cents DESC) WHERE period_type = 'all_time';"
    )

    # =========================================================================
    # 4. CUSTOM_REPORTS TABLE - User-defined report configurations
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS custom_reports (
            report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Report identification
            name VARCHAR(255) NOT NULL,
            description TEXT,

            -- Report type
            report_type VARCHAR(30) NOT NULL CHECK (report_type IN (
                'dashboard_summary', 'gallery_performance', 'client_engagement',
                'revenue_report', 'download_report', 'custom'
            )),

            -- Configuration
            config JSONB NOT NULL DEFAULT '{}',
            metrics TEXT[] NOT NULL DEFAULT '{}',
            filters JSONB NOT NULL DEFAULT '{}',
            grouping TEXT[] NOT NULL DEFAULT '{}',
            sorting JSONB NOT NULL DEFAULT '{}',

            -- Date range configuration
            date_range_type VARCHAR(20) NOT NULL DEFAULT 'last_30_days' CHECK (date_range_type IN (
                'today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days',
                'this_month', 'last_month', 'this_year', 'last_year', 'custom'
            )),
            custom_start_date DATE,
            custom_end_date DATE,

            -- Export configuration
            export_format VARCHAR(10) DEFAULT 'csv' CHECK (export_format IN ('csv', 'pdf', 'xlsx')),
            export_config JSONB NOT NULL DEFAULT '{}',

            -- Scheduling
            is_scheduled BOOLEAN NOT NULL DEFAULT FALSE,
            schedule_cron VARCHAR(50),
            schedule_timezone VARCHAR(50) DEFAULT 'UTC',
            next_run_at TIMESTAMPTZ,
            last_run_at TIMESTAMPTZ,

            -- Recipients for scheduled reports
            recipients JSONB NOT NULL DEFAULT '[]',

            -- Status and metadata
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_system BOOLEAN NOT NULL DEFAULT FALSE,
            run_count INTEGER NOT NULL DEFAULT 0,
            last_run_status VARCHAR(20) CHECK (last_run_status IN ('success', 'failed', 'running')),
            last_run_error TEXT,

            -- Ownership
            created_by_user_id UUID NOT NULL REFERENCES users(user_id),
            updated_by_user_id UUID REFERENCES users(user_id),

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # Custom reports indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_custom_reports_workspace "
        "ON custom_reports(workspace_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_custom_reports_workspace_type "
        "ON custom_reports(workspace_id, report_type);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_custom_reports_workspace_active "
        "ON custom_reports(workspace_id, is_active) WHERE is_active = TRUE;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_custom_reports_scheduled_next_run "
        "ON custom_reports(next_run_at) WHERE is_scheduled = TRUE AND is_active = TRUE;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_custom_reports_created_by "
        "ON custom_reports(created_by_user_id);"
    )

    # =========================================================================
    # 5. REPORT_EXPORTS TABLE - Generated report files
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS report_exports (
            export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            report_id UUID REFERENCES custom_reports(report_id) ON DELETE SET NULL,

            -- Export details
            name VARCHAR(255) NOT NULL,
            format VARCHAR(10) NOT NULL CHECK (format IN ('csv', 'pdf', 'xlsx')),

            -- Date range used for export
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,

            -- File storage
            storage_key VARCHAR(500) NOT NULL,
            file_size_bytes BIGINT NOT NULL,
            file_hash VARCHAR(64),

            -- Status
            status VARCHAR(20) NOT NULL DEFAULT 'generating' CHECK (status IN (
                'generating', 'completed', 'failed', 'expired'
            )),
            error_message TEXT,

            -- Download tracking
            download_count INTEGER NOT NULL DEFAULT 0,
            last_downloaded_at TIMESTAMPTZ,

            -- Expiration
            expires_at TIMESTAMPTZ NOT NULL,

            -- Generation metadata
            generated_by_user_id UUID REFERENCES users(user_id),
            generation_time_ms INTEGER,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # Report exports indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_report_exports_workspace_time "
        "ON report_exports(workspace_id, created_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_report_exports_report "
        "ON report_exports(report_id) WHERE report_id IS NOT NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_report_exports_expires "
        "ON report_exports(expires_at) WHERE status = 'completed';"
    )


def downgrade() -> None:
    # Drop indexes first
    op.execute("DROP INDEX IF EXISTS idx_report_exports_expires;")
    op.execute("DROP INDEX IF EXISTS idx_report_exports_report;")
    op.execute("DROP INDEX IF EXISTS idx_report_exports_workspace_time;")
    op.execute("DROP INDEX IF EXISTS idx_custom_reports_created_by;")
    op.execute("DROP INDEX IF EXISTS idx_custom_reports_scheduled_next_run;")
    op.execute("DROP INDEX IF EXISTS idx_custom_reports_workspace_active;")
    op.execute("DROP INDEX IF EXISTS idx_custom_reports_workspace_type;")
    op.execute("DROP INDEX IF EXISTS idx_custom_reports_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_client_analytics_workspace_ltv;")
    op.execute("DROP INDEX IF EXISTS idx_client_analytics_workspace_churn;")
    op.execute("DROP INDEX IF EXISTS idx_client_analytics_workspace_engagement;")
    op.execute("DROP INDEX IF EXISTS idx_client_analytics_client_period;")
    op.execute("DROP INDEX IF EXISTS idx_client_analytics_workspace_period;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_analytics_workspace_views;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_analytics_gallery_period;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_analytics_workspace_period;")
    op.execute("DROP INDEX IF EXISTS idx_analytics_events_occurred_brin;")
    op.execute("DROP INDEX IF EXISTS idx_analytics_events_session;")
    op.execute("DROP INDEX IF EXISTS idx_analytics_events_visitor;")
    op.execute("DROP INDEX IF EXISTS idx_analytics_events_asset;")
    op.execute("DROP INDEX IF EXISTS idx_analytics_events_client_time;")
    op.execute("DROP INDEX IF EXISTS idx_analytics_events_gallery_time;")
    op.execute("DROP INDEX IF EXISTS idx_analytics_events_workspace_category_time;")
    op.execute("DROP INDEX IF EXISTS idx_analytics_events_workspace_type_time;")
    op.execute("DROP INDEX IF EXISTS idx_analytics_events_workspace_time;")

    # Drop tables in reverse order (respecting foreign key constraints)
    op.execute("DROP TABLE IF EXISTS report_exports;")
    op.execute("DROP TABLE IF EXISTS custom_reports;")
    op.execute("DROP TABLE IF EXISTS client_analytics;")
    op.execute("DROP TABLE IF EXISTS gallery_analytics;")
    op.execute("DROP TABLE IF EXISTS analytics_events;")
