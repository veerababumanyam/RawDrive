"""AnalyticsService: Client CRM analytics and reporting.

Implements analytics functionality for client insights:
- Client growth trends and totals
- Engagement metrics (gallery views, selections)
- Referral analytics
- Revenue per client calculations

All operations are workspace-scoped for multi-tenant data isolation.

Requirements covered:
- Requirement 27: Analytics and insights
- Requirement 27.1: Total clients, active clients, growth rate
- Requirement 27.2: Referral sources and rates
- Requirement 27.3: Gallery views, selection rates, response times
- Requirement 27.4: Lifetime value per client
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class AnalyticsError(Exception):
    """Base exception for analytics errors."""

    def __init__(self, message: str, code: str = "ANALYTICS_ERROR"):
        self.message = message
        self.code = code
        self.status_code = 400
        self.user_message = message
        super().__init__(message)


class InvalidDateRangeError(AnalyticsError):
    """Invalid date range for analytics."""

    def __init__(self, message: str):
        super().__init__(message, code="INVALID_DATE_RANGE")


# ---------------------------------------------------------------------------
# AnalyticsService
# ---------------------------------------------------------------------------


class AnalyticsService:
    """Service for client CRM analytics and reporting."""

    # =========================================================================
    # Client Analytics (Requirement 27.1)
    # =========================================================================

    async def get_client_analytics(
        self,
        workspace_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict:
        """Get client overview analytics.

        Args:
            workspace_id: Workspace for tenant isolation
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            Analytics including totals, growth, and trends

        Raises:
            InvalidDateRangeError: If date range is invalid
        """
        # Set default date range
        now = datetime.now(timezone.utc)
        if not end_date:
            end_date = now
        if not start_date:
            start_date = end_date - timedelta(days=30)

        if start_date > end_date:
            raise InvalidDateRangeError("Start date must be before end date")

        # Calculate previous period for comparison
        period_days = (end_date - start_date).days
        prev_start = start_date - timedelta(days=period_days)
        prev_end = start_date

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Total clients
            total_clients = await conn.fetchval(
                "SELECT COUNT(*) FROM clients WHERE workspace_id = $1",
                workspace_id,
            )

            # Active clients (status = 'active')
            active_clients = await conn.fetchval(
                "SELECT COUNT(*) FROM clients WHERE workspace_id = $1 AND status = 'active'",
                workspace_id,
            )

            # New clients in period
            new_clients = await conn.fetchval(
                """
                SELECT COUNT(*) FROM clients
                WHERE workspace_id = $1 AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # New clients in previous period
            prev_new_clients = await conn.fetchval(
                """
                SELECT COUNT(*) FROM clients
                WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3
                """,
                workspace_id,
                prev_start,
                prev_end,
            )

            # Calculate growth rate
            growth_rate = 0.0
            if prev_new_clients and prev_new_clients > 0:
                growth_rate = ((new_clients - prev_new_clients) / prev_new_clients) * 100

            # Clients by status
            status_counts = await conn.fetch(
                """
                SELECT status, COUNT(*) as count
                FROM clients
                WHERE workspace_id = $1
                GROUP BY status
                """,
                workspace_id,
            )
            clients_by_status = {row["status"]: row["count"] for row in status_counts}

            # Clients with galleries
            clients_with_galleries = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT client_id)
                FROM client_gallery_links cgl
                JOIN galleries g ON cgl.gallery_id = g.gallery_id
                WHERE cgl.workspace_id = $1 AND g.deleted = FALSE
                """,
                workspace_id,
            )

            # Clients with recent activity (last 30 days)
            recently_active = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT client_id)
                FROM client_activities
                WHERE workspace_id = $1 AND created_at >= $2
                """,
                workspace_id,
                now - timedelta(days=30),
            )

            # Monthly trend (last 6 months)
            monthly_trend = await conn.fetch(
                """
                SELECT
                    DATE_TRUNC('month', created_at) as month,
                    COUNT(*) as count
                FROM clients
                WHERE workspace_id = $1
                AND created_at >= $2
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month ASC
                """,
                workspace_id,
                now - timedelta(days=180),
            )
            trend_data = [
                {
                    "month": row["month"].strftime("%Y-%m"),
                    "count": row["count"],
                }
                for row in monthly_trend
            ]

            return {
                "summary": {
                    "total_clients": total_clients or 0,
                    "active_clients": active_clients or 0,
                    "inactive_clients": (total_clients or 0) - (active_clients or 0),
                    "new_clients_period": new_clients or 0,
                    "growth_rate_percent": round(growth_rate, 2),
                    "clients_with_galleries": clients_with_galleries or 0,
                    "recently_active": recently_active or 0,
                },
                "clients_by_status": clients_by_status,
                "monthly_trend": trend_data,
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                    "days": period_days,
                },
            }

    # =========================================================================
    # Engagement Metrics (Requirement 27.3)
    # =========================================================================

    async def get_engagement_metrics(
        self,
        workspace_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict:
        """Get client engagement metrics.

        Args:
            workspace_id: Workspace for tenant isolation
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            Engagement metrics including activity counts and averages
        """
        now = datetime.now(timezone.utc)
        if not end_date:
            end_date = now
        if not start_date:
            start_date = end_date - timedelta(days=30)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Activity counts by type
            activity_counts = await conn.fetch(
                """
                SELECT activity_type, COUNT(*) as count
                FROM client_activities
                WHERE workspace_id = $1
                AND created_at >= $2 AND created_at <= $3
                GROUP BY activity_type
                ORDER BY count DESC
                """,
                workspace_id,
                start_date,
                end_date,
            )
            activities_by_type = {row["activity_type"]: row["count"] for row in activity_counts}

            # Communication counts by type
            comm_counts = await conn.fetch(
                """
                SELECT communication_type, direction, COUNT(*) as count
                FROM client_communications
                WHERE workspace_id = $1
                AND created_at >= $2 AND created_at <= $3
                GROUP BY communication_type, direction
                """,
                workspace_id,
                start_date,
                end_date,
            )
            communications_by_type = {}
            for row in comm_counts:
                key = f"{row['communication_type']}_{row['direction']}"
                communications_by_type[key] = row["count"]

            # Total communications
            total_communications = sum(communications_by_type.values())

            # Average communications per client
            clients_with_comms = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT client_id)
                FROM client_communications
                WHERE workspace_id = $1
                AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )
            avg_comms_per_client = 0.0
            if clients_with_comms and clients_with_comms > 0:
                avg_comms_per_client = total_communications / clients_with_comms

            # Gallery engagement
            gallery_links_created = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_gallery_links
                WHERE workspace_id = $1
                AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # Follow-up completion rate
            follow_ups_created = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_communications
                WHERE workspace_id = $1
                AND follow_up_required = TRUE
                AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            follow_ups_completed = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_communications
                WHERE workspace_id = $1
                AND follow_up_required = TRUE
                AND follow_up_completed = TRUE
                AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            ) or 0

            follow_up_rate = 0.0
            if follow_ups_created and follow_ups_created > 0:
                follow_up_rate = (follow_ups_completed / follow_ups_created) * 100

            # Average response time (time between inbound and outbound comms)
            response_times = await conn.fetch(
                """
                WITH comm_pairs AS (
                    SELECT
                        c1.client_id,
                        c1.created_at as inbound_time,
                        (
                            SELECT MIN(c2.created_at)
                            FROM client_communications c2
                            WHERE c2.client_id = c1.client_id
                            AND c2.workspace_id = c1.workspace_id
                            AND c2.direction = 'outbound'
                            AND c2.created_at > c1.created_at
                        ) as outbound_time
                    FROM client_communications c1
                    WHERE c1.workspace_id = $1
                    AND c1.direction = 'inbound'
                    AND c1.created_at >= $2 AND c1.created_at <= $3
                )
                SELECT AVG(EXTRACT(EPOCH FROM (outbound_time - inbound_time))) as avg_seconds
                FROM comm_pairs
                WHERE outbound_time IS NOT NULL
                """,
                workspace_id,
                start_date,
                end_date,
            )
            avg_response_seconds = response_times[0]["avg_seconds"] if response_times else None
            avg_response_hours = round(avg_response_seconds / 3600, 1) if avg_response_seconds else None

            return {
                "summary": {
                    "total_activities": sum(activities_by_type.values()),
                    "total_communications": total_communications,
                    "avg_communications_per_client": round(avg_comms_per_client, 2),
                    "gallery_links_created": gallery_links_created or 0,
                    "follow_up_completion_rate": round(follow_up_rate, 2),
                    "avg_response_time_hours": avg_response_hours,
                },
                "activities_by_type": activities_by_type,
                "communications_by_type": communications_by_type,
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                },
            }

    # =========================================================================
    # Referral Analytics (Requirement 27.2)
    # =========================================================================

    async def get_referral_analytics(
        self,
        workspace_id: UUID,
    ) -> dict:
        """Get referral source analytics.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            Referral metrics including top referrers and conversion rates
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Total clients with referrals
            total_referred = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM clients
                WHERE workspace_id = $1 AND referred_by_client_id IS NOT NULL
                """,
                workspace_id,
            )

            # Total clients
            total_clients = await conn.fetchval(
                "SELECT COUNT(*) FROM clients WHERE workspace_id = $1",
                workspace_id,
            )

            # Referral rate
            referral_rate = 0.0
            if total_clients and total_clients > 0:
                referral_rate = (total_referred / total_clients) * 100

            # Top referrers
            top_referrers = await conn.fetch(
                """
                SELECT
                    c.client_id,
                    c.full_name,
                    c.first_name,
                    c.last_name,
                    COUNT(r.client_id) as referral_count
                FROM clients c
                LEFT JOIN clients r ON r.referred_by_client_id = c.client_id AND r.workspace_id = c.workspace_id
                WHERE c.workspace_id = $1
                AND r.client_id IS NOT NULL
                GROUP BY c.client_id, c.full_name, c.first_name, c.last_name
                HAVING COUNT(r.client_id) > 0
                ORDER BY referral_count DESC
                LIMIT 10
                """,
                workspace_id,
            )

            # Clients who have made referrals
            clients_who_refer = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT referred_by_client_id)
                FROM clients
                WHERE workspace_id = $1 AND referred_by_client_id IS NOT NULL
                """,
                workspace_id,
            )

            # Average referrals per referrer
            avg_referrals = 0.0
            if clients_who_refer and clients_who_refer > 0:
                avg_referrals = total_referred / clients_who_refer

            # Referral trend (last 6 months)
            referral_trend = await conn.fetch(
                """
                SELECT
                    DATE_TRUNC('month', created_at) as month,
                    COUNT(*) as count
                FROM clients
                WHERE workspace_id = $1
                AND referred_by_client_id IS NOT NULL
                AND created_at >= NOW() - INTERVAL '180 days'
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month ASC
                """,
                workspace_id,
            )
            trend_data = [
                {
                    "month": row["month"].strftime("%Y-%m"),
                    "count": row["count"],
                }
                for row in referral_trend
            ]

            return {
                "summary": {
                    "total_referred_clients": total_referred or 0,
                    "referral_rate_percent": round(referral_rate, 2),
                    "clients_who_refer": clients_who_refer or 0,
                    "avg_referrals_per_referrer": round(avg_referrals, 2),
                },
                "top_referrers": [
                    {
                        "client_id": str(r["client_id"]),
                        "full_name": r["full_name"],
                        "referral_count": r["referral_count"],
                    }
                    for r in top_referrers
                ],
                "monthly_trend": trend_data,
            }

    # =========================================================================
    # Revenue Per Client (Requirement 27.4)
    # =========================================================================

    async def get_revenue_per_client(
        self,
        workspace_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict:
        """Get revenue metrics per client.

        Note: This requires integration with payment/invoice system.
        Currently returns placeholder data structure.

        Args:
            workspace_id: Workspace for tenant isolation
            start_date: Start of date range
            end_date: End of date range

        Returns:
            Revenue metrics (structure for future implementation)
        """
        now = datetime.now(timezone.utc)
        if not end_date:
            end_date = now
        if not start_date:
            start_date = end_date - timedelta(days=365)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get client counts for value estimation
            total_clients = await conn.fetchval(
                "SELECT COUNT(*) FROM clients WHERE workspace_id = $1",
                workspace_id,
            )

            # Clients with multiple galleries (higher value)
            high_value_clients = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT cgl.client_id)
                FROM client_gallery_links cgl
                JOIN galleries g ON cgl.gallery_id = g.gallery_id
                WHERE cgl.workspace_id = $1
                AND g.deleted = FALSE
                GROUP BY cgl.client_id
                HAVING COUNT(*) >= 2
                """,
                workspace_id,
            ) or 0

            # Returning clients (linked to multiple galleries over time)
            returning_clients = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT client_id)
                FROM (
                    SELECT
                        cgl.client_id,
                        COUNT(DISTINCT DATE_TRUNC('year', g.created_at)) as years
                    FROM client_gallery_links cgl
                    JOIN galleries g ON cgl.gallery_id = g.gallery_id
                    WHERE cgl.workspace_id = $1
                    AND g.deleted = FALSE
                    GROUP BY cgl.client_id
                    HAVING COUNT(DISTINCT DATE_TRUNC('year', g.created_at)) >= 2
                ) subq
                """,
                workspace_id,
            )

            # Top clients by gallery count
            top_clients = await conn.fetch(
                """
                SELECT
                    c.client_id,
                    c.full_name,
                    COUNT(DISTINCT cgl.gallery_id) as gallery_count,
                    MIN(cgl.created_at) as first_gallery_date
                FROM clients c
                JOIN client_gallery_links cgl ON c.client_id = cgl.client_id AND c.workspace_id = cgl.workspace_id
                JOIN galleries g ON cgl.gallery_id = g.gallery_id
                WHERE c.workspace_id = $1
                AND g.deleted = FALSE
                GROUP BY c.client_id, c.full_name
                ORDER BY gallery_count DESC
                LIMIT 10
                """,
                workspace_id,
            )

            return {
                "summary": {
                    "total_clients": total_clients or 0,
                    "high_value_clients": high_value_clients,
                    "returning_clients": returning_clients or 0,
                    "note": "Revenue data requires integration with payment system",
                },
                "top_clients_by_galleries": [
                    {
                        "client_id": str(c["client_id"]),
                        "full_name": c["full_name"],
                        "gallery_count": c["gallery_count"],
                        "first_gallery_date": c["first_gallery_date"].isoformat() if c["first_gallery_date"] else None,
                    }
                    for c in top_clients
                ],
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                },
            }

    # =========================================================================
    # Combined Dashboard Analytics
    # =========================================================================

    async def get_dashboard_analytics(
        self,
        workspace_id: UUID,
    ) -> dict:
        """Get combined dashboard analytics for the CRM.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            Combined analytics for dashboard display
        """
        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)

        # Get all analytics in parallel (using sequential calls for safety)
        client_analytics = await self.get_client_analytics(
            workspace_id=workspace_id,
            start_date=thirty_days_ago,
            end_date=now,
        )

        engagement = await self.get_engagement_metrics(
            workspace_id=workspace_id,
            start_date=thirty_days_ago,
            end_date=now,
        )

        referrals = await self.get_referral_analytics(workspace_id=workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Upcoming follow-ups
            upcoming_followups = await conn.fetch(
                """
                SELECT
                    cc.communication_id,
                    cc.client_id,
                    c.full_name,
                    cc.subject,
                    cc.follow_up_date
                FROM client_communications cc
                JOIN clients c ON cc.client_id = c.client_id AND cc.workspace_id = c.workspace_id
                WHERE cc.workspace_id = $1
                AND cc.follow_up_required = TRUE
                AND (cc.follow_up_completed IS NULL OR cc.follow_up_completed = FALSE)
                AND cc.follow_up_date >= NOW()
                AND cc.follow_up_date <= NOW() + INTERVAL '7 days'
                ORDER BY cc.follow_up_date ASC
                LIMIT 5
                """,
                workspace_id,
            )

            # Recent clients
            recent_clients = await conn.fetch(
                """
                SELECT client_id, full_name, created_at
                FROM clients
                WHERE workspace_id = $1
                ORDER BY created_at DESC
                LIMIT 5
                """,
                workspace_id,
            )

            # Recent activity
            recent_activity = await conn.fetch(
                """
                SELECT
                    ca.activity_id,
                    ca.client_id,
                    c.full_name as client_name,
                    ca.activity_type,
                    ca.description,
                    ca.created_at
                FROM client_activities ca
                JOIN clients c ON ca.client_id = c.client_id AND ca.workspace_id = c.workspace_id
                WHERE ca.workspace_id = $1
                ORDER BY ca.created_at DESC
                LIMIT 10
                """,
                workspace_id,
            )

        return {
            "overview": client_analytics["summary"],
            "engagement": engagement["summary"],
            "referrals": referrals["summary"],
            "upcoming_followups": [
                {
                    "communication_id": str(f["communication_id"]),
                    "client_id": str(f["client_id"]),
                    "client_name": f["full_name"],
                    "subject": f["subject"],
                    "follow_up_date": f["follow_up_date"].isoformat() if f["follow_up_date"] else None,
                }
                for f in upcoming_followups
            ],
            "recent_clients": [
                {
                    "client_id": str(c["client_id"]),
                    "full_name": c["full_name"],
                    "created_at": c["created_at"].isoformat() if c["created_at"] else None,
                }
                for c in recent_clients
            ],
            "recent_activity": [
                {
                    "activity_id": str(a["activity_id"]),
                    "client_id": str(a["client_id"]),
                    "client_name": a["client_name"],
                    "activity_type": a["activity_type"],
                    "description": a["description"],
                    "created_at": a["created_at"].isoformat() if a["created_at"] else None,
                }
                for a in recent_activity
            ],
            "monthly_trend": client_analytics["monthly_trend"],
            "generated_at": now.isoformat(),
        }


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_analytics_service: Optional[AnalyticsService] = None


def get_analytics_service() -> AnalyticsService:
    """Get singleton analytics service instance."""
    global _analytics_service
    if _analytics_service is None:
        _analytics_service = AnalyticsService()
    return _analytics_service
