"""Repository for magic link data operations.

This module provides the MagicLinkRepository class that handles all CRUD
operations for magic links, with proper workspace isolation for multi-tenant
security.

Security considerations:
- Token hashes stored via SHA-256 (never plaintext)
- All queries enforce workspace_id filtering
- Constant-time token comparison for security
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class MagicLinkRepository:
    """Data access layer for magic link records.

    This repository handles all CRUD operations for magic links, ensuring
    proper workspace isolation for multi-tenant security.

    All methods that access link data require workspace_id to enforce
    tenant isolation at the data layer.
    """

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        token_hash: str,
        target_type: str = "gallery",
        target_id: Optional[UUID] = None,
        label: Optional[str] = None,
        expires_at: Optional[datetime] = None,
        max_accesses: Optional[int] = None,
        qr_config: Optional[dict[str, Any]] = None,
        created_by_user_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new magic link record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: ID of the gallery this link provides access to
            token_hash: SHA-256 hash of the access token
            target_type: What the link targets ('gallery', 'sub_gallery', 'photo')
            target_id: ID of sub_gallery or photo (NULL for gallery-level)
            label: User-friendly label for management
            expires_at: Optional expiration datetime (UTC)
            max_accesses: Optional maximum number of accesses
            qr_config: QR code generation configuration
            created_by_user_id: User who created this link

        Returns:
            Created magic link record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build QR config with defaults
            final_qr_config = {
                "size": 1024,
                "color": None,
                "logo_enabled": True,
                "error_correction": "H",
            }
            if qr_config:
                final_qr_config.update(qr_config)

            row = await conn.fetchrow(
                """
                INSERT INTO magic_links (
                    workspace_id, gallery_id, token_hash, target_type, target_id,
                    label, expires_at, max_accesses, qr_config, created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
                """,
                workspace_id,
                gallery_id,
                token_hash,
                target_type,
                target_id,
                label,
                expires_at,
                max_accesses,
                final_qr_config,
                created_by_user_id,
            )

            result = self._row_to_dict(row)

            logger.info(
                "Magic link created",
                extra={
                    "link_id": str(result["link_id"]),
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id),
                    "target_type": target_type,
                },
            )

            return result

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_by_id(
        self,
        link_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a magic link by ID within a workspace.

        Args:
            link_id: The magic link ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Magic link record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT ml.*, g.title as gallery_title, g.sharing_enabled
                FROM magic_links ml
                JOIN galleries g ON g.gallery_id = ml.gallery_id
                WHERE ml.link_id = $1 AND ml.workspace_id = $2
                """,
                link_id,
                workspace_id,
            )

            if not row:
                return None

            return self._row_to_dict(row)

    async def get_by_hash(self, token_hash: str) -> Optional[dict[str, Any]]:
        """Get a magic link by token hash (for public validation).

        This method does NOT require workspace_id as it's used for public
        token validation. The workspace_id is returned in the result.

        Args:
            token_hash: SHA-256 hash of the access token

        Returns:
            Magic link record with gallery details, or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    ml.*,
                    g.title as gallery_title,
                    g.description as gallery_description,
                    g.sharing_enabled,
                    g.pin_hash,
                    g.email_registration_required,
                    g.cover_asset_id,
                    g.primary_color,
                    g.font_family,
                    g.custom_links,
                    g.status as gallery_status,
                    cp.name as company_name,
                    cp.logo_url as company_logo_url,
                    cp.website as company_website,
                    cp.brand_color as company_brand_color
                FROM magic_links ml
                JOIN galleries g ON g.gallery_id = ml.gallery_id
                LEFT JOIN company_profiles cp ON cp.workspace_id = ml.workspace_id
                WHERE ml.token_hash = $1
                """,
                token_hash,
            )

            if not row:
                return None

            return self._row_to_dict(row)

    async def list_by_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """List magic links for a gallery with pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery to list links for
            limit: Maximum results to return
            offset: Offset for pagination
            status: Optional status filter ('active', 'expired', 'revoked')

        Returns:
            Tuple of (list of magic links, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build query with optional status filter
            where_clause = "WHERE ml.workspace_id = $1 AND ml.gallery_id = $2"
            params: list[Any] = [workspace_id, gallery_id]

            if status:
                where_clause += " AND ml.status = $3"
                params.append(status)

            # Get total count
            count_query = f"""
                SELECT COUNT(*) FROM magic_links ml {where_clause}
            """
            total = await conn.fetchval(count_query, *params)

            # Get paginated results
            params.extend([limit, offset])
            list_query = f"""
                SELECT ml.*, g.title as gallery_title
                FROM magic_links ml
                JOIN galleries g ON g.gallery_id = ml.gallery_id
                {where_clause}
                ORDER BY ml.created_at DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}
            """
            rows = await conn.fetch(list_query, *params)

            return [self._row_to_dict(row) for row in rows], total or 0

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update_status(
        self,
        link_id: UUID,
        workspace_id: UUID,
        status: str,
    ) -> Optional[dict[str, Any]]:
        """Update the status of a magic link.

        Args:
            link_id: The magic link ID
            workspace_id: Workspace ID for tenant isolation
            status: New status ('active', 'expired', 'revoked')

        Returns:
            Updated magic link record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE magic_links
                SET status = $3
                WHERE link_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                link_id,
                workspace_id,
                status,
            )

            if not row:
                return None

            result = self._row_to_dict(row)

            logger.info(
                "Magic link status updated",
                extra={
                    "link_id": str(link_id),
                    "workspace_id": str(workspace_id),
                    "new_status": status,
                },
            )

            return result

    async def increment_access_count(self, link_id: UUID) -> int:
        """Increment the access count for a magic link.

        This is called on every successful link access.

        Args:
            link_id: The magic link ID

        Returns:
            New access count
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            new_count = await conn.fetchval(
                """
                UPDATE magic_links
                SET access_count = access_count + 1
                WHERE link_id = $1
                RETURNING access_count
                """,
                link_id,
            )

            return new_count or 0

    async def update_qr_config(
        self,
        link_id: UUID,
        workspace_id: UUID,
        qr_config: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        """Update QR configuration for a magic link.

        Args:
            link_id: The magic link ID
            workspace_id: Workspace ID for tenant isolation
            qr_config: New QR configuration

        Returns:
            Updated magic link record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE magic_links
                SET qr_config = $3
                WHERE link_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                link_id,
                workspace_id,
                qr_config,
            )

            if not row:
                return None

            return self._row_to_dict(row)

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete(self, link_id: UUID, workspace_id: UUID) -> bool:
        """Delete a magic link.

        Args:
            link_id: The magic link ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM magic_links
                WHERE link_id = $1 AND workspace_id = $2
                """,
                link_id,
                workspace_id,
            )

            deleted = result == "DELETE 1"

            if deleted:
                logger.info(
                    "Magic link deleted",
                    extra={
                        "link_id": str(link_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    # =========================================================================
    # ACCESS LOGGING
    # =========================================================================

    async def log_access(
        self,
        link_id: UUID,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referer: Optional[str] = None,
        visitor_id: Optional[UUID] = None,
        email_gate_passed: bool = False,
        pin_gate_passed: bool = False,
        device_type: Optional[str] = None,
        browser: Optional[str] = None,
        os: Optional[str] = None,
    ) -> UUID:
        """Log an access to a magic link.

        Args:
            link_id: The magic link ID
            ip_address: Client IP address
            user_agent: Client user agent string
            referer: HTTP referer header
            visitor_id: Visitor ID if email registration completed
            email_gate_passed: Whether email gate was completed
            pin_gate_passed: Whether PIN gate was completed
            device_type: Parsed device type (desktop, mobile, tablet)
            browser: Parsed browser name
            os: Parsed operating system

        Returns:
            Created access log ID
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            access_id = await conn.fetchval(
                """
                INSERT INTO magic_link_accesses (
                    link_id, ip_address, user_agent, referer, visitor_id,
                    email_gate_passed, pin_gate_passed,
                    device_type, browser, os
                )
                VALUES ($1, $2::inet, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING access_id
                """,
                link_id,
                ip_address,
                user_agent,
                referer,
                visitor_id,
                email_gate_passed,
                pin_gate_passed,
                device_type,
                browser,
                os,
            )

            return access_id

    async def get_access_stats(
        self,
        link_id: UUID,
        workspace_id: UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get access statistics for a magic link.

        Args:
            link_id: The magic link ID
            workspace_id: Workspace ID for tenant isolation
            days: Number of days to include in stats

        Returns:
            Statistics including total accesses, unique visitors, etc.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify link belongs to workspace
            link_exists = await conn.fetchval(
                """
                SELECT 1 FROM magic_links
                WHERE link_id = $1 AND workspace_id = $2
                """,
                link_id,
                workspace_id,
            )

            if not link_exists:
                return {}

            # Get aggregated stats
            stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_accesses,
                    COUNT(DISTINCT ip_address) as unique_ips,
                    COUNT(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL) as registered_visitors,
                    COUNT(*) FILTER (WHERE email_gate_passed = TRUE) as email_completions,
                    COUNT(*) FILTER (WHERE pin_gate_passed = TRUE) as pin_completions,
                    COUNT(*) FILTER (WHERE device_type = 'mobile') as mobile_accesses,
                    COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_accesses,
                    COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet_accesses
                FROM magic_link_accesses
                WHERE link_id = $1
                    AND accessed_at >= NOW() - INTERVAL '%s days'
                """ % days,
                link_id,
            )

            # Get daily access counts
            daily = await conn.fetch(
                """
                SELECT
                    DATE(accessed_at) as date,
                    COUNT(*) as count
                FROM magic_link_accesses
                WHERE link_id = $1
                    AND accessed_at >= NOW() - INTERVAL '%s days'
                GROUP BY DATE(accessed_at)
                ORDER BY date DESC
                """ % days,
                link_id,
            )

            # Get top countries
            countries = await conn.fetch(
                """
                SELECT
                    COALESCE(country_code, 'Unknown') as country,
                    COUNT(*) as count
                FROM magic_link_accesses
                WHERE link_id = $1
                    AND accessed_at >= NOW() - INTERVAL '%s days'
                GROUP BY country_code
                ORDER BY count DESC
                LIMIT 10
                """ % days,
                link_id,
            )

            return {
                "total_accesses": stats["total_accesses"] or 0,
                "unique_ips": stats["unique_ips"] or 0,
                "registered_visitors": stats["registered_visitors"] or 0,
                "gate_conversion": {
                    "email_completions": stats["email_completions"] or 0,
                    "pin_completions": stats["pin_completions"] or 0,
                },
                "devices": {
                    "mobile": stats["mobile_accesses"] or 0,
                    "desktop": stats["desktop_accesses"] or 0,
                    "tablet": stats["tablet_accesses"] or 0,
                },
                "accesses_by_day": {
                    str(row["date"]): row["count"] for row in daily
                },
                "top_countries": [
                    {"country": row["country"], "count": row["count"]}
                    for row in countries
                ],
            }

    # =========================================================================
    # MAINTENANCE OPERATIONS
    # =========================================================================

    async def expire_outdated_links(self) -> int:
        """Mark expired links as 'expired' status.

        This should be run periodically (e.g., every hour) to update
        the status of links that have passed their expiration date.

        Returns:
            Number of links marked as expired
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE magic_links
                SET status = 'expired'
                WHERE status = 'active'
                    AND expires_at IS NOT NULL
                    AND expires_at < NOW()
                """
            )

            # Parse "UPDATE N" to get count
            count = int(result.split(" ")[1]) if result else 0

            if count > 0:
                logger.info(
                    "Expired outdated magic links",
                    extra={"count": count},
                )

            return count

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary.

        Args:
            row: asyncpg Record

        Returns:
            Dictionary with row data, UUIDs and datetimes converted to strings
        """
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
        datetime_fields = ["created_at", "updated_at", "expires_at", "accessed_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_magic_link_repository: Optional[MagicLinkRepository] = None


def get_magic_link_repository() -> MagicLinkRepository:
    """Get singleton magic link repository instance."""
    global _magic_link_repository
    if _magic_link_repository is None:
        _magic_link_repository = MagicLinkRepository()
    return _magic_link_repository
