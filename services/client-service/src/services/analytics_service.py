"""
Business logic for client analytics and reporting.

Provides:
- Engagement metrics calculation
- Time-series data aggregation
- Client health scoring
- Tag and communication analytics
"""

from typing import List, Dict, Optional, Any
from uuid import UUID
from datetime import datetime, date, timedelta

from src.repositories.client_repository import ClientRepository
from src.cache.redis_client import RedisClient
from src.log_config import get_logger

logger = get_logger(__name__)


class AnalyticsService:
    """Service for client analytics and reporting."""

    def __init__(self):
        self.client_repo = ClientRepository()
        self.redis_client = RedisClient()

    async def get_workspace_analytics(
        self,
        workspace_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_time_series: bool = False,
        include_top_clients: bool = True,
        include_tag_analytics: bool = True,
        include_communication_analytics: bool = True,
        top_limit: int = 10,
    ) -> Dict[str, Any]:
        """
        Get comprehensive workspace analytics.

        Metrics:
        - Client counts (total, active, new, converted)
        - Engagement metrics (galleries, activities, communications)
        - Health distribution (active, at_risk, inactive)
        - Top segments (tags, clients)
        - Time series trends (if requested)

        Args:
            workspace_id: Workspace ID
            start_date: Start date (defaults to 30 days ago)
            end_date: End date (defaults to today)
            include_time_series: Include time series data
            include_top_clients: Include top engaged clients
            include_tag_analytics: Include tag analytics
            include_communication_analytics: Include communication analytics
            top_limit: Limit for top lists

        Returns:
            Comprehensive analytics summary
        """
        from src.database import get_pool

        pool = await get_pool()

        # Default date range: last 30 days
        if not end_date:
            end_date = date.today()
        if not start_date:
            start_date = end_date - timedelta(days=30)

        # Cache key
        cache_key = f"analytics:workspace:{workspace_id}:{start_date}:{end_date}"
        cached_data = await self.redis_client.get_json(cache_key)
        if cached_data:
            logger.debug(
                "Analytics cache hit",
                extra={"workspace_id": workspace_id},
            )
            return cached_data

        # 1. Client metrics
        total_clients_row = await pool.fetchrow(
            """
            SELECT COUNT(*) AS total
            FROM clients
            WHERE workspace_id = $1 AND status != 'merged'
            """,
            UUID(workspace_id),
        )
        total_clients = total_clients_row["total"]

        active_clients_row = await pool.fetchrow(
            """
            SELECT COUNT(*) AS total
            FROM clients
            WHERE workspace_id = $1 AND status = 'active'
            """,
            UUID(workspace_id),
        )
        active_clients = active_clients_row["total"]

        new_clients_row = await pool.fetchrow(
            """
            SELECT COUNT(*) AS total
            FROM clients
            WHERE workspace_id = $1
              AND created_at >= $2
              AND created_at <= $3
            """,
            UUID(workspace_id),
            datetime.combine(start_date, datetime.min.time()),
            datetime.combine(end_date, datetime.max.time()),
        )
        new_clients = new_clients_row["total"]

        # converted_to_client_id column not yet in visitors schema;
        # default to 0 until visitor-to-client conversion tracking is implemented
        converted_visitors = 0

        # 2. Engagement metrics
        gallery_links_row = await pool.fetchrow(
            """
            SELECT COUNT(*) AS total
            FROM client_gallery_links
            WHERE workspace_id = $1
            """,
            UUID(workspace_id),
        )
        total_gallery_links = gallery_links_row["total"]

        activities_row = await pool.fetchrow(
            """
            SELECT COUNT(*) AS total
            FROM client_activities
            WHERE workspace_id = $1
              AND created_at >= $2
              AND created_at <= $3
            """,
            UUID(workspace_id),
            datetime.combine(start_date, datetime.min.time()),
            datetime.combine(end_date, datetime.max.time()),
        )
        total_activities = activities_row["total"]

        communications_row = await pool.fetchrow(
            """
            SELECT COUNT(*) AS total
            FROM client_communications
            WHERE workspace_id = $1
              AND created_at >= $2
              AND created_at <= $3
            """,
            UUID(workspace_id),
            datetime.combine(start_date, datetime.min.time()),
            datetime.combine(end_date, datetime.max.time()),
        )
        total_communications = communications_row["total"]

        overdue_follow_ups_row = await pool.fetchrow(
            """
            SELECT COUNT(*) AS total
            FROM client_communications
            WHERE workspace_id = $1
              AND follow_up_required = TRUE
              AND follow_up_date IS NOT NULL
              AND follow_up_date < NOW()
            """,
            UUID(workspace_id),
        )
        overdue_follow_ups = overdue_follow_ups_row["total"]

        # 3. Health distribution
        # Calculate engagement scores for all clients
        client_scores = await self._calculate_client_health_scores(
            workspace_id, start_date, end_date
        )

        active_count = sum(1 for s in client_scores if s["health_status"] == "active")
        at_risk_count = sum(1 for s in client_scores if s["health_status"] == "at_risk")
        inactive_count = sum(1 for s in client_scores if s["health_status"] == "inactive")

        # 4. Top segments
        top_tags = []
        if include_tag_analytics:
            top_tags_rows = await pool.fetch(
                """
                SELECT t.tag_id, t.name, t.color, COUNT(cta.client_id) AS client_count
                FROM client_tags t
                LEFT JOIN client_tag_assignments cta ON t.workspace_id = cta.workspace_id AND t.tag_id = cta.tag_id
                WHERE t.workspace_id = $1
                GROUP BY t.tag_id, t.name, t.color
                ORDER BY client_count DESC
                LIMIT $2
                """,
                UUID(workspace_id),
                top_limit,
            )

            for row in top_tags_rows:
                top_tags.append({
                    "tag_id": str(row["tag_id"]),
                    "tag_name": row["name"],
                    "tag_color": row["color"],
                    "client_count": row["client_count"],
                })

        # 5. Top engaged clients
        top_engaged_clients = []
        if include_top_clients:
            # Sort by engagement score
            sorted_scores = sorted(
                client_scores, key=lambda x: x["engagement_score"], reverse=True
            )
            top_engaged_clients = sorted_scores[:top_limit]

        result = {
            "workspace_id": UUID(workspace_id),
            "time_range": {
                "start_date": start_date,
                "end_date": end_date,
            },
            "total_clients": total_clients,
            "active_clients": active_clients,
            "new_clients": new_clients,
            "converted_visitors": converted_visitors,
            "total_gallery_links": total_gallery_links,
            "total_activities": total_activities,
            "total_communications": total_communications,
            "overdue_follow_ups": overdue_follow_ups,
            "active_count": active_count,
            "at_risk_count": at_risk_count,
            "inactive_count": inactive_count,
            "top_tags": top_tags,
            "top_engaged_clients": top_engaged_clients,
        }

        # Cache for 5 minutes
        await self.redis_client.set_json(cache_key, result, ex=300)

        logger.info(
            "Workspace analytics generated",
            extra={
                "workspace_id": workspace_id,
                "total_clients": total_clients,
                "active_clients": active_clients,
            },
        )

        return result

    async def get_client_engagement_metrics(
        self,
        workspace_id: str,
        client_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> Dict[str, Any]:
        """
        Get detailed engagement metrics for a specific client.

        Metrics:
        - Gallery access (count, favorites, selections, comments)
        - Activity count
        - Communication count
        - Engagement score (0-100)
        - Health status (active, at_risk, inactive)

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            start_date: Start date (defaults to 30 days ago)
            end_date: End date (defaults to today)

        Returns:
            Client engagement metrics
        """
        from src.database import get_pool

        pool = await get_pool()

        # Default date range: last 30 days
        if not end_date:
            end_date = date.today()
        if not start_date:
            start_date = end_date - timedelta(days=30)

        # Get client info
        client = await self.client_repo.get_by_id(workspace_id, client_id)

        # Gallery engagement
        gallery_metrics = await pool.fetchrow(
            """
            SELECT
                COUNT(DISTINCT cgl.gallery_id) AS galleries_accessed,
                COUNT(CASE WHEN ae.event_type = 'favorite_added' THEN 1 END)::int AS total_favorites,
                COUNT(CASE WHEN ae.event_type = 'selection_added' THEN 1 END)::int AS total_selections,
                COUNT(CASE WHEN ae.event_type = 'comment_added' THEN 1 END)::int AS total_comments,
                COUNT(CASE WHEN ae.event_type = 'gallery_viewed' THEN 1 END)::int AS total_views
            FROM client_gallery_links cgl
            LEFT JOIN analytics_events ae ON cgl.workspace_id = ae.workspace_id
                AND cgl.gallery_id = ae.related_entity_id
                AND ae.client_id = $2
                AND ae.occurred_at >= $3
                AND ae.occurred_at <= $4
            WHERE cgl.workspace_id = $1 AND cgl.client_id = $2
            """,
            UUID(workspace_id),
            UUID(client_id),
            datetime.combine(start_date, datetime.min.time()),
            datetime.combine(end_date, datetime.max.time()),
        )

        # Last activity
        last_activity_row = await pool.fetchrow(
            """
            SELECT MAX(occurred_at) AS last_activity
            FROM analytics_events
            WHERE workspace_id = $1 AND client_id = $2
            """,
            UUID(workspace_id),
            UUID(client_id),
        )

        # Calculate engagement score
        galleries_accessed = gallery_metrics["galleries_accessed"] or 0
        total_favorites = gallery_metrics["total_favorites"] or 0
        total_selections = gallery_metrics["total_selections"] or 0
        total_comments = gallery_metrics["total_comments"] or 0
        total_views = gallery_metrics["total_views"] or 0

        engagement_score = self._calculate_engagement_score(
            galleries_accessed=galleries_accessed,
            total_favorites=total_favorites,
            total_selections=total_selections,
            total_comments=total_comments,
            total_views=total_views,
            last_activity=last_activity_row["last_activity"] if last_activity_row else None,
        )

        # Determine health status
        health_status = self._determine_health_status(
            engagement_score, last_activity_row["last_activity"] if last_activity_row else None
        )

        return {
            "client_id": UUID(client_id),
            "full_name": client["full_name"],
            "total_galleries_accessed": galleries_accessed,
            "total_favorites": total_favorites,
            "total_selections": total_selections,
            "total_comments": total_comments,
            "total_gallery_views": total_views,
            "last_activity_at": last_activity_row["last_activity"] if last_activity_row else None,
            "engagement_score": engagement_score,
            "health_status": health_status,
        }

    async def _calculate_client_health_scores(
        self,
        workspace_id: str,
        start_date: date,
        end_date: date,
    ) -> List[Dict[str, Any]]:
        """Calculate engagement scores for all clients in workspace."""
        from src.database import get_pool

        pool = await get_pool()

        # Get all active clients
        clients = await self.client_repo.list_by_workspace(
            workspace_id=workspace_id, status="active", limit=10000, offset=0
        )

        scores = []
        for client in clients:
            client_id = str(client["client_id"])

            # Calculate metrics
            metrics = await self.get_client_engagement_metrics(
                workspace_id, client_id, start_date, end_date
            )

            scores.append(metrics)

        return scores

    def _calculate_engagement_score(
        self,
        galleries_accessed: int,
        total_favorites: int,
        total_selections: int,
        total_comments: int,
        total_views: int,
        last_activity: Optional[datetime],
    ) -> float:
        """
        Calculate engagement score (0-100).

        Scoring:
        - Galleries accessed: 10 points per gallery (max 30)
        - Favorites: 2 points each (max 20)
        - Selections: 3 points each (max 30)
        - Comments: 5 points each (max 10)
        - Recent activity: 10 points if within 7 days
        """
        score = 0.0

        # Galleries (max 30 points)
        score += min(galleries_accessed * 10, 30)

        # Favorites (max 20 points)
        score += min(total_favorites * 2, 20)

        # Selections (max 30 points)
        score += min(total_selections * 3, 30)

        # Comments (max 10 points)
        score += min(total_comments * 5, 10)

        # Recency (10 points)
        if last_activity:
            days_since_activity = (datetime.utcnow() - last_activity).days
            if days_since_activity <= 7:
                score += 10

        return round(score, 2)

    def _determine_health_status(
        self, engagement_score: float, last_activity: Optional[datetime]
    ) -> str:
        """
        Determine client health status.

        Classification:
        - Active: score >= 50 OR activity within 14 days
        - At Risk: score 20-49 OR activity 15-30 days ago
        - Inactive: score < 20 OR no activity in 30+ days
        """
        if not last_activity:
            return "inactive"

        days_since_activity = (datetime.utcnow() - last_activity).days

        if engagement_score >= 50 or days_since_activity <= 14:
            return "active"
        elif engagement_score >= 20 or days_since_activity <= 30:
            return "at_risk"
        else:
            return "inactive"


# Singleton instance
_analytics_service: Optional[AnalyticsService] = None


def get_analytics_service() -> AnalyticsService:
    """Get or create AnalyticsService singleton instance."""
    global _analytics_service
    if _analytics_service is None:
        _analytics_service = AnalyticsService()
    return _analytics_service
