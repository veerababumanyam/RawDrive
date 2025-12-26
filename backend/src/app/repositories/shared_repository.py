"""Repository for shared dashboard data operations.

This module provides the SharedRepository class that handles workspace-wide
queries for the Security & Sharing Dashboard, aggregating magic link data
across all galleries.

Security considerations:
- All queries enforce workspace_id filtering for multi-tenant isolation
- No raw tokens are ever returned (only link metadata)
- Access logs are sanitized to remove full IP addresses in exports
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class SharedRepository:
    """Data access layer for shared dashboard operations.

    Provides workspace-wide aggregation queries for magic links,
    enabling the Security & Sharing Dashboard to display all active
    links across galleries.
    """

    # =========================================================================
    # LIST OPERATIONS
    # =========================================================================

    async def list_workspace_links(
        self,
        workspace_id: UUID,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        gallery_id: Optional[UUID] = None,
        search: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        """List all magic links across the workspace with filtering and sorting.

        Args:
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum results (1-100)
            offset: Pagination offset
            status: Filter by status ('active', 'expired', 'revoked', or None for all)
            gallery_id: Filter by specific gallery
            search: Search term for label or gallery title
            sort_by: Column to sort by ('created_at', 'access_count', 'expires_at')
            sort_order: Sort direction ('asc' or 'desc')

        Returns:
            Tuple of (list of links with gallery info, counts by status)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build WHERE clause
            conditions = ["ml.workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status and status != "all":
                conditions.append(f"ml.status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if gallery_id:
                conditions.append(f"ml.gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if search:
                conditions.append(
                    f"(ml.label ILIKE ${param_idx} OR g.title ILIKE ${param_idx})"
                )
                params.append(f"%{search}%")
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Validate sort column
            valid_sorts = {
                "created_at": "ml.created_at",
                "access_count": "ml.access_count",
                "expires_at": "ml.expires_at",
                "last_accessed_at": "last_access.accessed_at",
            }
            sort_column = valid_sorts.get(sort_by, "ml.created_at")
            order = "DESC" if sort_order.lower() == "desc" else "ASC"

            # Get status counts (for filter badges)
            counts = await conn.fetchrow(
                f"""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE ml.status = 'active') as active_count,
                    COUNT(*) FILTER (WHERE ml.status = 'expired') as expired_count,
                    COUNT(*) FILTER (WHERE ml.status = 'revoked') as revoked_count
                FROM magic_links ml
                JOIN galleries g ON g.gallery_id = ml.gallery_id
                WHERE {where_clause}
                """,
                *params,
            )

            # Get paginated links with gallery info and recent access
            params.extend([limit, offset])
            query = f"""
                WITH last_access AS (
                    SELECT DISTINCT ON (link_id)
                        link_id,
                        accessed_at,
                        country_code,
                        device_type,
                        visitor_id
                    FROM magic_link_accesses
                    ORDER BY link_id, accessed_at DESC
                ),
                recent_visitors AS (
                    SELECT
                        link_id,
                        jsonb_agg(visitor_info ORDER BY accessed_at DESC) as visitors
                    FROM (
                        SELECT DISTINCT ON (mla.link_id, mla.ip_address)
                            mla.link_id,
                            mla.accessed_at,
                            jsonb_build_object(
                                'country_code', mla.country_code,
                                'device_type', mla.device_type,
                                'accessed_at', mla.accessed_at
                            ) as visitor_info
                        FROM magic_link_accesses mla
                        ORDER BY mla.link_id, mla.ip_address, mla.accessed_at DESC
                    ) sub
                    GROUP BY link_id
                ),
                limited_visitors AS (
                    SELECT
                        rv.link_id,
                        COALESCE(
                            (SELECT jsonb_agg(elem)
                             FROM (SELECT jsonb_array_elements(rv.visitors) as elem LIMIT 3) limited),
                            '[]'::jsonb
                        ) as visitors
                    FROM recent_visitors rv
                )
                SELECT
                    ml.link_id,
                    ml.gallery_id,
                    ml.label,
                    ml.status,
                    ml.target_type,
                    ml.target_id,
                    ml.expires_at,
                    ml.max_accesses,
                    ml.access_count,
                    ml.created_at,
                    ml.created_by_user_id,
                    g.title as gallery_title,
                    g.status as gallery_status,
                    g.password_hash IS NOT NULL as password_protected,
                    g.pin_hash IS NOT NULL as pin_protected,
                    g.email_registration_required,
                    g.download_policy,
                    la.accessed_at as last_accessed_at,
                    COALESCE(lv.visitors, '[]'::jsonb) as recent_visitors,
                    u.display_name as created_by_name
                FROM magic_links ml
                JOIN galleries g ON g.gallery_id = ml.gallery_id
                LEFT JOIN last_access la ON la.link_id = ml.link_id
                LEFT JOIN limited_visitors lv ON lv.link_id = ml.link_id
                LEFT JOIN users u ON u.user_id = ml.created_by_user_id
                WHERE {where_clause}
                ORDER BY {sort_column} {order} NULLS LAST
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """

            rows = await conn.fetch(query, *params)

            links = [self._row_to_dict(row) for row in rows]
            status_counts = {
                "total": counts["total"] or 0,
                "active_count": counts["active_count"] or 0,
                "expired_count": counts["expired_count"] or 0,
                "revoked_count": counts["revoked_count"] or 0,
            }

            return links, status_counts

    async def get_link_detail(
        self,
        workspace_id: UUID,
        link_id: UUID,
        access_limit: int = 50,
    ) -> Optional[dict[str, Any]]:
        """Get detailed information for a single link including access log.

        Args:
            workspace_id: Workspace ID for tenant isolation
            link_id: The magic link ID
            access_limit: Maximum access log entries to return

        Returns:
            Link details with gallery info and access log, or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get link with gallery details
            link_row = await conn.fetchrow(
                """
                SELECT
                    ml.*,
                    g.title as gallery_title,
                    g.status as gallery_status,
                    g.description as gallery_description,
                    g.password_hash IS NOT NULL as password_protected,
                    g.pin_hash IS NOT NULL as pin_protected,
                    g.email_registration_required,
                    g.download_policy,
                    g.cover_asset_id,
                    u.display_name as created_by_name,
                    u.email as created_by_email
                FROM magic_links ml
                JOIN galleries g ON g.gallery_id = ml.gallery_id
                LEFT JOIN users u ON u.user_id = ml.created_by_user_id
                WHERE ml.link_id = $1 AND ml.workspace_id = $2
                """,
                link_id,
                workspace_id,
            )

            if not link_row:
                return None

            # Get access log
            access_rows = await conn.fetch(
                """
                SELECT
                    mla.access_id,
                    mla.accessed_at,
                    mla.ip_address,
                    mla.country_code,
                    mla.region,
                    mla.city,
                    mla.device_type,
                    mla.browser,
                    mla.os,
                    mla.email_gate_passed,
                    mla.pin_gate_passed,
                    mla.visitor_id,
                    v.email as visitor_email,
                    v.first_name as visitor_first_name,
                    v.last_name as visitor_last_name
                FROM magic_link_accesses mla
                LEFT JOIN visitors v ON v.visitor_id = mla.visitor_id
                WHERE mla.link_id = $1
                ORDER BY mla.accessed_at DESC
                LIMIT $2
                """,
                link_id,
                access_limit,
            )

            link = self._row_to_dict(link_row)
            link["accesses"] = [self._access_to_dict(row) for row in access_rows]

            return link

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def get_workspace_stats(
        self,
        workspace_id: UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get aggregate sharing statistics for the workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            days: Number of days for trend data

        Returns:
            Aggregate statistics including totals, trends, and breakdowns
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Link counts
            link_counts = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_links,
                    COUNT(*) FILTER (WHERE status = 'active') as active_links,
                    COUNT(*) FILTER (WHERE status = 'expired') as expired_links,
                    COUNT(*) FILTER (WHERE status = 'revoked') as revoked_links
                FROM magic_links
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            # Access stats for period
            access_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_accesses,
                    COUNT(DISTINCT mla.ip_address) as unique_visitors,
                    COUNT(*) FILTER (WHERE mla.device_type = 'desktop') as desktop,
                    COUNT(*) FILTER (WHERE mla.device_type = 'mobile') as mobile,
                    COUNT(*) FILTER (WHERE mla.device_type = 'tablet') as tablet
                FROM magic_link_accesses mla
                JOIN magic_links ml ON ml.link_id = mla.link_id
                WHERE ml.workspace_id = $1
                    AND mla.accessed_at >= NOW() - INTERVAL '%s days'
                """ % days,
                workspace_id,
            )

            # Daily access trend
            daily_trend = await conn.fetch(
                """
                SELECT
                    DATE(mla.accessed_at) as date,
                    COUNT(*) as count
                FROM magic_link_accesses mla
                JOIN magic_links ml ON ml.link_id = mla.link_id
                WHERE ml.workspace_id = $1
                    AND mla.accessed_at >= NOW() - INTERVAL '%s days'
                GROUP BY DATE(mla.accessed_at)
                ORDER BY date DESC
                """ % days,
                workspace_id,
            )

            # Top galleries by access
            top_galleries = await conn.fetch(
                """
                SELECT
                    g.gallery_id,
                    g.title as gallery_title,
                    COUNT(DISTINCT ml.link_id) as link_count,
                    COALESCE(SUM(ml.access_count), 0) as total_accesses
                FROM galleries g
                JOIN magic_links ml ON ml.gallery_id = g.gallery_id
                WHERE ml.workspace_id = $1
                GROUP BY g.gallery_id, g.title
                ORDER BY total_accesses DESC
                LIMIT 5
                """,
                workspace_id,
            )

            # Top countries
            top_countries = await conn.fetch(
                """
                SELECT
                    COALESCE(mla.country_code, 'XX') as country_code,
                    COUNT(*) as count
                FROM magic_link_accesses mla
                JOIN magic_links ml ON ml.link_id = mla.link_id
                WHERE ml.workspace_id = $1
                    AND mla.accessed_at >= NOW() - INTERVAL '%s days'
                GROUP BY mla.country_code
                ORDER BY count DESC
                LIMIT 10
                """ % days,
                workspace_id,
            )

            return {
                "total_links": link_counts["total_links"] or 0,
                "active_links": link_counts["active_links"] or 0,
                "expired_links": link_counts["expired_links"] or 0,
                "revoked_links": link_counts["revoked_links"] or 0,
                "total_accesses_period": access_stats["total_accesses"] or 0,
                "unique_visitors_period": access_stats["unique_visitors"] or 0,
                "period_days": days,
                "device_breakdown": {
                    "desktop": access_stats["desktop"] or 0,
                    "mobile": access_stats["mobile"] or 0,
                    "tablet": access_stats["tablet"] or 0,
                },
                "accesses_by_day": [
                    {"date": str(row["date"]), "count": row["count"]}
                    for row in daily_trend
                ],
                "top_galleries": [
                    {
                        "gallery_id": str(row["gallery_id"]),
                        "gallery_title": row["gallery_title"],
                        "link_count": row["link_count"],
                        "access_count": row["total_accesses"],
                    }
                    for row in top_galleries
                ],
                "top_countries": [
                    {"country_code": row["country_code"], "count": row["count"]}
                    for row in top_countries
                ],
            }

    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================

    async def bulk_revoke(
        self,
        workspace_id: UUID,
        link_ids: list[UUID],
    ) -> tuple[int, list[dict[str, str]]]:
        """Revoke multiple magic links at once.

        Args:
            workspace_id: Workspace ID for tenant isolation
            link_ids: List of link IDs to revoke

        Returns:
            Tuple of (count of successfully revoked, list of failures)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify all links belong to workspace
            existing = await conn.fetch(
                """
                SELECT link_id, status
                FROM magic_links
                WHERE workspace_id = $1 AND link_id = ANY($2)
                """,
                workspace_id,
                link_ids,
            )

            existing_ids = {str(row["link_id"]) for row in existing}
            already_revoked = {
                str(row["link_id"]) for row in existing if row["status"] == "revoked"
            }

            failures = []

            # Check for non-existent links
            for lid in link_ids:
                lid_str = str(lid)
                if lid_str not in existing_ids:
                    failures.append({"link_id": lid_str, "error": "Link not found"})
                elif lid_str in already_revoked:
                    failures.append({"link_id": lid_str, "error": "Already revoked"})

            # Revoke eligible links
            ids_to_revoke = [
                lid
                for lid in link_ids
                if str(lid) in existing_ids and str(lid) not in already_revoked
            ]

            if ids_to_revoke:
                result = await conn.execute(
                    """
                    UPDATE magic_links
                    SET status = 'revoked', updated_at = NOW()
                    WHERE workspace_id = $1 AND link_id = ANY($2)
                    """,
                    workspace_id,
                    ids_to_revoke,
                )

                revoked_count = int(result.split(" ")[1]) if result else 0

                logger.info(
                    "Bulk revoked magic links",
                    extra={
                        "workspace_id": str(workspace_id),
                        "revoked_count": revoked_count,
                        "requested_count": len(link_ids),
                    },
                )

                return revoked_count, failures

            return 0, failures

    # =========================================================================
    # EXPORT
    # =========================================================================

    async def export_links(
        self,
        workspace_id: UUID,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Export all magic links for compliance/audit.

        Args:
            workspace_id: Workspace ID for tenant isolation
            date_from: Optional start date filter
            date_to: Optional end date filter

        Returns:
            List of link records with sanitized data
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            conditions = ["ml.workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if date_from:
                conditions.append(f"ml.created_at >= ${param_idx}")
                params.append(date_from)
                param_idx += 1

            if date_to:
                conditions.append(f"ml.created_at <= ${param_idx}")
                params.append(date_to)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            rows = await conn.fetch(
                f"""
                SELECT
                    ml.link_id,
                    ml.gallery_id,
                    g.title as gallery_title,
                    ml.label,
                    ml.status,
                    ml.target_type,
                    ml.expires_at,
                    ml.max_accesses,
                    ml.access_count,
                    ml.created_at,
                    ml.updated_at,
                    u.email as created_by_email,
                    g.password_hash IS NOT NULL as password_protected,
                    g.pin_hash IS NOT NULL as pin_protected,
                    g.email_registration_required,
                    g.download_policy
                FROM magic_links ml
                JOIN galleries g ON g.gallery_id = ml.gallery_id
                LEFT JOIN users u ON u.user_id = ml.created_by_user_id
                WHERE {where_clause}
                ORDER BY ml.created_at DESC
                """,
                *params,
            )

            return [self._export_row_to_dict(row) for row in rows]

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = [
            "link_id",
            "workspace_id",
            "gallery_id",
            "target_id",
            "created_by_user_id",
            "visitor_id",
            "access_id",
            "cover_asset_id",
        ]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert datetimes to ISO format
        datetime_fields = [
            "created_at",
            "updated_at",
            "expires_at",
            "accessed_at",
            "last_accessed_at",
        ]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Build access_policy object
        if "password_protected" in result:
            result["access_policy"] = {
                "password_protected": result.pop("password_protected", False),
                "pin_protected": result.pop("pin_protected", False),
                "email_required": result.pop("email_registration_required", False),
                "download_policy": result.pop("download_policy", "view_only"),
            }

        return result

    def _access_to_dict(self, row) -> dict[str, Any]:
        """Convert an access log row to a dictionary."""
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs
        if result.get("access_id"):
            result["access_id"] = str(result["access_id"])
        if result.get("visitor_id"):
            result["visitor_id"] = str(result["visitor_id"])

        # Convert datetime
        if result.get("accessed_at"):
            result["accessed_at"] = result["accessed_at"].isoformat()

        # Mask IP address for privacy (keep first octet only)
        if result.get("ip_address"):
            ip = str(result["ip_address"])
            parts = ip.split(".")
            if len(parts) == 4:
                result["ip_address"] = f"{parts[0]}.xxx.xxx.xxx"

        # Build visitor object
        if result.get("visitor_id"):
            result["visitor"] = {
                "visitor_id": result.pop("visitor_id"),
                "email": result.pop("visitor_email", None),
                "first_name": result.pop("visitor_first_name", None),
                "last_name": result.pop("visitor_last_name", None),
            }
        else:
            result.pop("visitor_email", None)
            result.pop("visitor_first_name", None)
            result.pop("visitor_last_name", None)
            result["visitor"] = None

        return result

    def _export_row_to_dict(self, row) -> dict[str, Any]:
        """Convert row to export format (sanitized for compliance)."""
        result = dict(row)

        # Convert UUIDs
        for field in ["link_id", "gallery_id"]:
            if result.get(field):
                result[field] = str(result[field])

        # Convert datetimes
        for field in ["created_at", "updated_at", "expires_at"]:
            if result.get(field):
                result[field] = result[field].isoformat()

        return result


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_shared_repository: Optional[SharedRepository] = None


def get_shared_repository() -> SharedRepository:
    """Get singleton shared repository instance."""
    global _shared_repository
    if _shared_repository is None:
        _shared_repository = SharedRepository()
    return _shared_repository
