"""Download Quota Service for daily download limit enforcement.

Implements Redis-based quota tracking with automatic midnight UTC reset
to enforce photographer-set download limits per gallery.

Feature: 027-gallery-feature-completion
User Story: US2 - Daily Download Limits
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from app.db.redis import get_redis_client
from app.metrics.registry import (
    download_quota_checks_total,
    download_quota_consumed_total,
    download_quota_limit_reached_total,
)

logger = logging.getLogger(__name__)


@dataclass
class DownloadQuotaResult:
    """Result of download quota check."""

    allowed: bool
    current_count: int
    daily_limit: Optional[int]  # None = unlimited
    remaining: int
    reset_at: datetime
    error_message: Optional[str] = None


def _quota_key(gallery_id: UUID, client_identifier: str, date_utc: str) -> str:
    """Generate Redis key for download quota tracking.

    Key pattern: download_quota:{gallery_id}:{client_identifier}:{date_utc}
    """
    return f"download_quota:{gallery_id}:{client_identifier}:{date_utc}"


def _get_today_utc() -> str:
    """Get today's date in UTC as ISO format string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _get_seconds_until_midnight_utc() -> int:
    """Calculate seconds until midnight UTC for TTL."""
    now = datetime.now(timezone.utc)
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int((midnight - now).total_seconds())


def _get_midnight_utc() -> datetime:
    """Get the next midnight UTC timestamp."""
    now = datetime.now(timezone.utc)
    return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


class DownloadQuotaService:
    """Service for tracking and enforcing daily download quotas per gallery."""

    async def check_quota(
        self,
        gallery_id: UUID,
        client_identifier: str,
        daily_limit: Optional[int],
    ) -> DownloadQuotaResult:
        """Check if client can download without incrementing counter.

        Args:
            gallery_id: Gallery UUID
            client_identifier: Client fingerprint, email, or IP
            daily_limit: Max downloads per day (None = unlimited)

        Returns:
            DownloadQuotaResult with current quota status
        """
        # Unlimited downloads if no limit set
        if daily_limit is None:
            return DownloadQuotaResult(
                allowed=True,
                current_count=0,
                daily_limit=None,
                remaining=-1,  # -1 indicates unlimited
                reset_at=_get_midnight_utc(),
            )

        date_utc = _get_today_utc()
        quota_key = _quota_key(gallery_id, client_identifier, date_utc)

        try:
            redis = await get_redis_client()
        except RuntimeError:
            logger.warning(
                "Redis not available; allowing download without quota tracking",
                extra={"gallery_id": str(gallery_id)},
            )
            return DownloadQuotaResult(
                allowed=True,
                current_count=0,
                daily_limit=daily_limit,
                remaining=daily_limit,
                reset_at=_get_midnight_utc(),
            )

        # Get current download count
        current_count_str = await redis.get(quota_key)
        current_count = int(current_count_str) if current_count_str else 0

        remaining = max(0, daily_limit - current_count)
        allowed = current_count < daily_limit

        return DownloadQuotaResult(
            allowed=allowed,
            current_count=current_count,
            daily_limit=daily_limit,
            remaining=remaining,
            reset_at=_get_midnight_utc(),
            error_message=None if allowed else "Daily download limit reached.",
        )

    async def increment_and_check(
        self,
        gallery_id: UUID,
        client_identifier: str,
        daily_limit: Optional[int],
    ) -> DownloadQuotaResult:
        """Increment download counter and check if allowed.

        Use this method when a download is actually being performed.
        Atomically increments the counter and checks the limit.

        Args:
            gallery_id: Gallery UUID
            client_identifier: Client fingerprint, email, or IP
            daily_limit: Max downloads per day (None = unlimited)

        Returns:
            DownloadQuotaResult with updated quota status
        """
        # Unlimited downloads if no limit set
        if daily_limit is None:
            logger.debug(
                "Unlimited downloads for gallery",
                extra={"gallery_id": str(gallery_id)},
            )
            return DownloadQuotaResult(
                allowed=True,
                current_count=0,
                daily_limit=None,
                remaining=-1,
                reset_at=_get_midnight_utc(),
            )

        date_utc = _get_today_utc()
        quota_key = _quota_key(gallery_id, client_identifier, date_utc)
        ttl = _get_seconds_until_midnight_utc()

        try:
            redis = await get_redis_client()
        except RuntimeError:
            logger.warning(
                "Redis not available; allowing download without quota tracking",
                extra={"gallery_id": str(gallery_id)},
            )
            return DownloadQuotaResult(
                allowed=True,
                current_count=0,
                daily_limit=daily_limit,
                remaining=daily_limit,
                reset_at=_get_midnight_utc(),
            )

        # Atomically increment and get new value
        pipe = redis.pipeline()
        pipe.incr(quota_key)
        pipe.expire(quota_key, ttl)
        results = await pipe.execute()

        new_count = results[0]

        gallery_id_str = str(gallery_id)

        # Check if this download exceeded the limit
        if new_count > daily_limit:
            # Download was over limit - decrement back
            await redis.decr(quota_key)

            # Record metrics
            download_quota_checks_total.labels(result="denied", gallery_id=gallery_id_str).inc()
            download_quota_limit_reached_total.labels(gallery_id=gallery_id_str).inc()

            logger.warning(
                "Download quota exceeded",
                extra={
                    "gallery_id": gallery_id_str,
                    "client": client_identifier,
                    "count": new_count - 1,
                    "limit": daily_limit,
                },
            )

            return DownloadQuotaResult(
                allowed=False,
                current_count=new_count - 1,
                daily_limit=daily_limit,
                remaining=0,
                reset_at=_get_midnight_utc(),
                error_message="Daily download limit reached.",
            )

        remaining = max(0, daily_limit - new_count)

        # Record metrics
        download_quota_checks_total.labels(result="allowed", gallery_id=gallery_id_str).inc()
        download_quota_consumed_total.labels(gallery_id=gallery_id_str).inc()

        logger.info(
            "Download quota updated",
            extra={
                "gallery_id": gallery_id_str,
                "client": client_identifier,
                "count": new_count,
                "remaining": remaining,
                "limit": daily_limit,
            },
        )

        return DownloadQuotaResult(
            allowed=True,
            current_count=new_count,
            daily_limit=daily_limit,
            remaining=remaining,
            reset_at=_get_midnight_utc(),
        )

    async def get_quota_usage(
        self,
        gallery_id: UUID,
        client_identifier: str,
        daily_limit: Optional[int],
    ) -> DownloadQuotaResult:
        """Get current quota usage without modifying it.

        Args:
            gallery_id: Gallery UUID
            client_identifier: Client fingerprint, email, or IP
            daily_limit: Max downloads per day (None = unlimited)

        Returns:
            DownloadQuotaResult with current usage
        """
        return await self.check_quota(gallery_id, client_identifier, daily_limit)

    async def reset_quota(
        self,
        gallery_id: UUID,
        client_identifier: str,
    ) -> None:
        """Reset quota for a specific client (admin action).

        Args:
            gallery_id: Gallery UUID
            client_identifier: Client fingerprint, email, or IP
        """
        date_utc = _get_today_utc()
        quota_key = _quota_key(gallery_id, client_identifier, date_utc)

        try:
            redis = await get_redis_client()
            await redis.delete(quota_key)
            logger.info(
                "Download quota reset",
                extra={
                    "gallery_id": str(gallery_id),
                    "client": client_identifier,
                },
            )
        except RuntimeError:
            logger.warning("Redis not available; could not reset quota")

    async def get_all_client_usage(
        self,
        gallery_id: UUID,
    ) -> dict[str, int]:
        """Get download counts for all clients of a gallery (admin view).

        Args:
            gallery_id: Gallery UUID

        Returns:
            Dict mapping client identifiers to download counts
        """
        date_utc = _get_today_utc()
        pattern = f"download_quota:{gallery_id}:*:{date_utc}"

        try:
            redis = await get_redis_client()
        except RuntimeError:
            return {}

        # Scan for matching keys
        cursor = 0
        client_counts: dict[str, int] = {}

        while True:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)

            for key in keys:
                # Extract client identifier from key
                # Format: download_quota:{gallery_id}:{client}:{date}
                parts = key.split(":")
                if len(parts) >= 4:
                    client = parts[2]
                    count_str = await redis.get(key)
                    if count_str:
                        client_counts[client] = int(count_str)

            if cursor == 0:
                break

        return client_counts
