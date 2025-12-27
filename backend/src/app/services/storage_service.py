"""StorageService: Calculate, cache, and enforce workspace storage usage.

Implements Requirements: 9.1, 9.5 (Storage tracking and limits)
Implements Property 11: Tier Limit Enforcement (storage component)
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import asyncpg

from app.config.settings import AppSettings, get_settings
from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)

# Cache TTL in seconds
STORAGE_CACHE_TTL = 300  # 5 minutes - balance between freshness and performance
STORAGE_CACHE_KEY_PREFIX = "storage:workspace:"


@dataclass
class StorageUsage:
    """Storage usage data for a workspace."""

    workspace_id: uuid.UUID
    storage_used_bytes: int
    storage_limit_bytes: int
    asset_count: int
    plan_code: str
    last_updated_at: Optional[datetime] = None

    @property
    def usage_percent(self) -> float:
        """Calculate usage percentage (0-100)."""
        if self.storage_limit_bytes == 0:
            return 100.0 if self.storage_used_bytes > 0 else 0.0
        return min((self.storage_used_bytes / self.storage_limit_bytes) * 100, 100.0)

    @property
    def is_near_limit(self) -> bool:
        """True if usage > 80%."""
        return self.usage_percent >= 80.0

    @property
    def is_at_limit(self) -> bool:
        """True if usage >= 100%."""
        return self.usage_percent >= 100.0

    @property
    def storage_remaining_bytes(self) -> int:
        """Remaining storage in bytes."""
        return max(0, self.storage_limit_bytes - self.storage_used_bytes)

    def can_upload(self, file_size_bytes: int) -> bool:
        """Check if a file of given size can be uploaded."""
        return (self.storage_used_bytes + file_size_bytes) <= self.storage_limit_bytes


def format_bytes(size_bytes: int) -> str:
    """Format bytes to human-readable string (KB, MB, GB, TB)."""
    if size_bytes < 0:
        return "0 B"

    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    unit_index = 0
    size = float(size_bytes)

    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1

    # Format with appropriate precision
    if unit_index == 0:
        return f"{int(size)} {units[unit_index]}"
    elif size >= 100:
        return f"{size:.0f} {units[unit_index]}"
    elif size >= 10:
        return f"{size:.1f} {units[unit_index]}"
    else:
        return f"{size:.2f} {units[unit_index]}"


class StorageService:
    """Stateless service for storage usage calculation and caching."""

    def __init__(self, settings: AppSettings | None = None):
        self._settings = settings or get_settings()

    async def get_storage_usage(
        self,
        workspace_id: uuid.UUID,
        force_refresh: bool = False,
    ) -> StorageUsage:
        """Get storage usage for a workspace.

        Uses Redis cache for performance. Refreshes cache if stale or forced.

        Args:
            workspace_id: Workspace UUID
            force_refresh: If True, bypass cache and recalculate

        Returns:
            StorageUsage dataclass with current usage data
        """
        cache_key = f"{STORAGE_CACHE_KEY_PREFIX}{workspace_id}"

        # Try cache first (unless force_refresh)
        if not force_refresh:
            cached = await self._get_cached_usage(cache_key)
            if cached:
                return cached

        # Calculate from database
        usage = await self._calculate_storage_usage(workspace_id)

        # Update cache
        await self._set_cached_usage(cache_key, usage)

        return usage

    async def get_storage_breakdown(
        self,
        workspace_id: uuid.UUID,
    ) -> dict:
        """Get detailed storage breakdown by type and month.

        Args:
            workspace_id: Workspace UUID

        Returns:
            Dict with breakdown by file type and by month
        """
        pool = await get_postgres_pool()

        # Breakdown by file type
        type_rows = await pool.fetch(
            """
            SELECT
                type,
                COALESCE(SUM(original_bytes), 0) as storage_bytes,
                COUNT(*) as asset_count
            FROM assets
            WHERE workspace_id = $1 AND status = 'available'
            GROUP BY type
            ORDER BY storage_bytes DESC
            """,
            workspace_id,
        )

        # Breakdown by month (last 12 months)
        month_rows = await pool.fetch(
            """
            SELECT
                DATE_TRUNC('month', created_at) as month,
                COALESCE(SUM(original_bytes), 0) as storage_bytes,
                COUNT(*) as asset_count
            FROM assets
            WHERE workspace_id = $1
              AND status = 'available'
              AND created_at >= NOW() - INTERVAL '12 months'
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month DESC
            """,
            workspace_id,
        )

        # Calculate total for percentages
        total_bytes = sum(row["storage_bytes"] for row in type_rows)

        by_type = [
            {
                "name": row["type"],
                "storage_bytes": row["storage_bytes"],
                "asset_count": row["asset_count"],
                "percentage": (row["storage_bytes"] / total_bytes * 100) if total_bytes > 0 else 0,
            }
            for row in type_rows
        ]

        by_month = [
            {
                "name": row["month"].strftime("%Y-%m") if row["month"] else "Unknown",
                "storage_bytes": row["storage_bytes"],
                "asset_count": row["asset_count"],
                "percentage": (row["storage_bytes"] / total_bytes * 100) if total_bytes > 0 else 0,
            }
            for row in month_rows
        ]

        return {
            "workspace_id": workspace_id,
            "total_bytes": total_bytes,
            "by_type": by_type,
            "by_month": by_month,
        }

    async def check_upload_allowed(
        self,
        workspace_id: uuid.UUID,
        file_size_bytes: int,
    ) -> tuple[bool, str | None]:
        """Check if an upload of given size is allowed.

        Args:
            workspace_id: Workspace UUID
            file_size_bytes: Size of file to upload

        Returns:
            Tuple of (allowed: bool, error_message: str | None)
        """
        usage = await self.get_storage_usage(workspace_id)

        if usage.can_upload(file_size_bytes):
            return True, None

        # Calculate how much over limit
        needed = usage.storage_used_bytes + file_size_bytes
        over_by = needed - usage.storage_limit_bytes

        return False, (
            f"Storage limit exceeded. "
            f"Current usage: {format_bytes(usage.storage_used_bytes)} / {format_bytes(usage.storage_limit_bytes)}. "
            f"File requires: {format_bytes(file_size_bytes)}. "
            f"Over limit by: {format_bytes(over_by)}. "
            f"Please upgrade your plan or free up space."
        )

    async def invalidate_cache(self, workspace_id: uuid.UUID) -> None:
        """Invalidate storage cache for a workspace.

        Call this after asset upload/delete operations.

        Args:
            workspace_id: Workspace UUID
        """
        redis = await get_redis_client()
        cache_key = f"{STORAGE_CACHE_KEY_PREFIX}{workspace_id}"
        await redis.delete(cache_key)

        logger.debug(
            "Storage cache invalidated",
            extra={"workspace_id": str(workspace_id)},
        )

    async def refresh_cache(self, workspace_id: uuid.UUID) -> StorageUsage:
        """Force refresh the storage cache.

        Args:
            workspace_id: Workspace UUID

        Returns:
            Fresh StorageUsage data
        """
        return await self.get_storage_usage(workspace_id, force_refresh=True)

    # -------------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------------

    async def _calculate_storage_usage(
        self,
        workspace_id: uuid.UUID,
    ) -> StorageUsage:
        """Calculate storage usage from database.

        Uses the optimized partial index idx_assets_storage_usage.
        """
        pool = await get_postgres_pool()

        # Get storage used and asset count in one query
        storage_row = await pool.fetchrow(
            """
            SELECT
                COALESCE(SUM(original_bytes), 0) as storage_used,
                COUNT(*) as asset_count
            FROM assets
            WHERE workspace_id = $1 AND status = 'available'
            """,
            workspace_id,
        )

        storage_used = storage_row["storage_used"] if storage_row else 0
        asset_count = storage_row["asset_count"] if storage_row else 0

        # Get plan limits
        plan_row = await pool.fetchrow(
            """
            SELECT p.storage_bytes, p.code
            FROM workspace_subscriptions ws
            JOIN plans p ON p.plan_id = ws.plan_id
            WHERE ws.workspace_id = $1
            """,
            workspace_id,
        )

        if not plan_row:
            # Default to free tier if no subscription found
            storage_limit = 1 * 1024 * 1024 * 1024  # 1GB
            plan_code = "free"
        else:
            storage_limit = plan_row["storage_bytes"]
            plan_code = plan_row["code"]

        return StorageUsage(
            workspace_id=workspace_id,
            storage_used_bytes=storage_used,
            storage_limit_bytes=storage_limit,
            asset_count=asset_count,
            plan_code=plan_code,
            last_updated_at=datetime.now(timezone.utc),
        )

    async def _get_cached_usage(self, cache_key: str) -> StorageUsage | None:
        """Get usage from Redis cache."""
        try:
            redis = await get_redis_client()
            cached = await redis.get(cache_key)

            if cached:
                data = json.loads(cached)
                return StorageUsage(
                    workspace_id=uuid.UUID(data["workspace_id"]),
                    storage_used_bytes=data["storage_used_bytes"],
                    storage_limit_bytes=data["storage_limit_bytes"],
                    asset_count=data["asset_count"],
                    plan_code=data["plan_code"],
                    last_updated_at=datetime.fromisoformat(data["last_updated_at"]) if data.get("last_updated_at") else None,
                )
        except Exception as e:
            logger.warning(
                "Failed to get storage cache",
                extra={"cache_key": cache_key, "error": str(e)},
            )

        return None

    async def _set_cached_usage(self, cache_key: str, usage: StorageUsage) -> None:
        """Set usage in Redis cache."""
        try:
            redis = await get_redis_client()
            data = {
                "workspace_id": str(usage.workspace_id),
                "storage_used_bytes": usage.storage_used_bytes,
                "storage_limit_bytes": usage.storage_limit_bytes,
                "asset_count": usage.asset_count,
                "plan_code": usage.plan_code,
                "last_updated_at": usage.last_updated_at.isoformat() if usage.last_updated_at else None,
            }
            await redis.setex(cache_key, STORAGE_CACHE_TTL, json.dumps(data))
        except Exception as e:
            logger.warning(
                "Failed to set storage cache",
                extra={"cache_key": cache_key, "error": str(e)},
            )


# ---------------------------------------------------------------------------
# Singleton instance helper
# ---------------------------------------------------------------------------


_storage_service: StorageService | None = None


def get_storage_service() -> StorageService:
    """Get or create the storage service singleton."""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
