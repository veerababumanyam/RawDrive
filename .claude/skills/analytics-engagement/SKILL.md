---
name: analytics-engagement
description: "Analytics, engagement tracking, and churn prevention patterns for RawDrive: dashboard components, engagement metrics, client activity tracking, gallery analytics, churn prediction, intervention campaigns, and the analytics repository layer. Use this skill when building analytics dashboards, implementing engagement scoring, creating metric visualizations, working with the analytics API endpoints, building churn prevention features, or tracking user/client behavior. Also use for Posthog event tracking, funnel analysis, cohort analytics, or revenue metrics. Triggers on: analytics, dashboard, engagement, churn, metrics, tracking, funnel, cohort, Posthog, intervention campaign, client activity, gallery analytics, revenue metrics, KPI, chart, visualization, retention."
---

# Analytics & Engagement Patterns

RawDrive's analytics layer tracks photographer engagement, client interactions, and gallery performance to drive retention and growth.

## Analytics Architecture

```
Backend Analytics Layer:
├── api/v1/analytics.py              # Dashboard API endpoints
├── repositories/analytics_repository.py  # Complex SQL aggregations
├── services/
│   ├── engagement_scoring_service.py     # User engagement scores
│   └── intervention_campaign_service.py  # Churn prevention automation
└── workers/
    └── analytics_worker.py               # Background metric computation

Frontend Analytics:
├── pages/AnalyticsPage.tsx
├── components/features/analytics/
│   ├── OverviewDashboard.tsx
│   ├── GalleryAnalytics.tsx
│   ├── ClientEngagement.tsx
│   ├── RevenueMetrics.tsx
│   └── charts/                    # Reusable chart components
```

## Key Metrics

```python
class AnalyticsMetrics:
    # Photographer engagement
    GALLERIES_CREATED = "galleries_created"
    PHOTOS_UPLOADED = "photos_uploaded"
    ACTIVE_DAYS = "active_days"
    AI_FEATURES_USED = "ai_features_used"

    # Client engagement
    GALLERY_VIEWS = "gallery_views"
    FAVORITES_COUNT = "favorites_count"
    DOWNLOADS_COUNT = "downloads_count"
    COMMENTS_COUNT = "comments_count"
    SHARE_CLICKS = "share_clicks"

    # Business metrics
    STORAGE_USED_PCT = "storage_used_pct"
    ACTIVE_SUBSCRIPTIONS = "active_subscriptions"
    REVENUE_MRR = "revenue_mrr"
    CHURN_RATE = "churn_rate"
```

## Analytics Repository Pattern

```python
class AnalyticsRepository:
    async def get_dashboard_overview(
        self, workspace_id: UUID, period: str = "30d"
    ) -> dict:
        """Aggregate dashboard metrics for a workspace."""
        start_date = self._parse_period(period)
        # Use CTEs for efficient multi-metric aggregation
        query = text("""
            WITH gallery_stats AS (
                SELECT COUNT(*) as total_galleries,
                       COUNT(*) FILTER (WHERE created_at >= :start) as new_galleries
                FROM galleries WHERE workspace_id = :ws_id
            ),
            upload_stats AS (
                SELECT COUNT(*) as total_assets,
                       SUM(file_size) as total_storage
                FROM assets WHERE workspace_id = :ws_id
            ),
            view_stats AS (
                SELECT COUNT(*) as total_views
                FROM gallery_views
                WHERE workspace_id = :ws_id AND viewed_at >= :start
            )
            SELECT * FROM gallery_stats, upload_stats, view_stats
        """)
        # ALWAYS include workspace_id in analytics queries
        result = await self.db.execute(query, {
            "ws_id": workspace_id, "start": start_date
        })
        return dict(result.mappings().first())

    async def get_top_galleries(
        self, workspace_id: UUID, limit: int = 10
    ) -> list[dict]:
        """Top galleries by engagement (views + favorites + downloads)."""
        query = text("""
            SELECT g.id, g.title,
                   COUNT(DISTINCT gv.id) as views,
                   COUNT(DISTINCT f.id) as favorites,
                   COUNT(DISTINCT d.id) as downloads
            FROM galleries g
            LEFT JOIN gallery_views gv ON g.id = gv.gallery_id
            LEFT JOIN favorites f ON g.id = f.gallery_id
            LEFT JOIN downloads d ON g.id = d.gallery_id
            WHERE g.workspace_id = :ws_id
            GROUP BY g.id, g.title
            ORDER BY views + favorites + downloads DESC
            LIMIT :limit
        """)
        result = await self.db.execute(query, {
            "ws_id": workspace_id, "limit": limit
        })
        return [dict(r) for r in result.mappings().all()]
```

**Important:** The galleries table uses `g.title` (not `g.name`) — this has been a source of bugs. Always verify column names against the actual schema.

## Engagement Scoring

```python
class EngagementScoringService:
    """Score user engagement 0-100 for churn prediction."""

    WEIGHTS = {
        "login_frequency": 0.2,      # How often they log in
        "gallery_creation": 0.2,     # Creating new galleries
        "upload_activity": 0.15,     # Uploading photos
        "ai_feature_usage": 0.15,   # Using smart features
        "client_sharing": 0.15,     # Sharing with clients
        "storage_utilization": 0.15, # Using their storage quota
    }

    async def calculate_score(
        self, workspace_id: UUID, user_id: UUID, period_days: int = 30
    ) -> EngagementScore:
        metrics = await self.analytics_repo.get_user_activity(
            workspace_id, user_id, period_days
        )
        score = sum(
            self.WEIGHTS[k] * self._normalize(k, v)
            for k, v in metrics.items()
            if k in self.WEIGHTS
        )
        return EngagementScore(
            user_id=user_id,
            score=round(score * 100),
            risk_level=self._classify_risk(score),
            computed_at=datetime.utcnow(),
        )
```

## Churn Prevention (Intervention Campaigns)

```python
class InterventionCampaignService:
    """Automated campaigns triggered by low engagement scores."""

    async def evaluate_and_trigger(self, workspace_id: UUID):
        at_risk = await self.scoring_service.get_at_risk_users(workspace_id)
        for user in at_risk:
            campaign = self._select_campaign(user.risk_level, user.activity_pattern)
            await self.notification_service.send(
                workspace_id=workspace_id,
                recipient_id=user.id,
                notification_type=campaign.notification_type,
                data=campaign.personalized_data(user),
            )
```

## Frontend Dashboard Components

```typescript
// Use TanStack Query for data fetching with auto-refresh
function useAnalytics(period: string) {
  return useQuery({
    queryKey: ['analytics', 'overview', period],
    queryFn: () => api.get(`/analytics/overview?period=${period}`),
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    staleTime: 2 * 60 * 1000,
  });
}

// Chart components use Recharts with RawDrive design tokens
// Always include loading states, empty states, and error boundaries
```

## Posthog Event Tracking

```typescript
// Track key user actions for funnel/retention analysis
posthog.capture('gallery_created', { gallery_id, template_used });
posthog.capture('photo_uploaded', { count, gallery_id });
posthog.capture('ai_feature_used', { feature: 'smart_tagging' });
posthog.capture('gallery_shared', { method: 'magic_link' });
```
