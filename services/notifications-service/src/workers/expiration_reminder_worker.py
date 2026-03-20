"""
Expiration Reminder Worker for the Notifications & Communication Microservice.

Scans for galleries approaching expiration and enqueues reminder emails
to photographers at 7-day, 1-day, and 0-day (expired) milestones.

Uses Redis-based deduplication to prevent duplicate sends for the same
gallery/milestone combination.

Features:
- Daily scan for expiring galleries
- Three milestone notifications: 7d, 1d, expired
- Redis deduplication keys with appropriate TTLs
- Graceful error handling per gallery
- Integrates with existing TaskQueueService for email delivery
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from src.cache.redis_client import redis_client
from src.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Milestone constants
# ---------------------------------------------------------------------------

MILESTONE_7D = "7d"
MILESTONE_1D = "1d"
MILESTONE_EXPIRED = "expired"

# TTLs for deduplication keys (seconds)
DEDUP_TTL = {
    MILESTONE_7D: 8 * 86400,      # 8 days
    MILESTONE_1D: 2 * 86400,      # 2 days
    MILESTONE_EXPIRED: 30 * 86400, # 30 days
}

# Template codes for each milestone
TEMPLATE_CODES = {
    MILESTONE_7D: "gallery_expiring_7d",
    MILESTONE_1D: "gallery_expiring_1d",
    MILESTONE_EXPIRED: "gallery_expired",
}

# Scan interval (24 hours)
SCAN_INTERVAL_SECONDS = 86400


# ---------------------------------------------------------------------------
# SQL query to find galleries with upcoming or past expiration
# ---------------------------------------------------------------------------

EXPIRING_GALLERIES_SQL = """
    SELECT
        g.gallery_id::text AS gallery_id,
        g.workspace_id::text AS workspace_id,
        g.title,
        g.expires_at,
        u.email AS owner_email,
        COALESCE(stats.photo_count, 0) AS photo_count
    FROM galleries g
    JOIN users u ON g.created_by_user_id = u.user_id
    LEFT JOIN (
        SELECT gallery_id, COUNT(*) AS photo_count
        FROM gallery_assets
        WHERE visible = TRUE
        GROUP BY gallery_id
    ) stats ON g.gallery_id = stats.gallery_id
    WHERE g.expires_at IS NOT NULL
      AND g.deleted = FALSE
      AND g.status = 'published'
      AND g.expires_at BETWEEN $1 AND $2
"""


class ExpirationReminderWorker:
    """Scans for expiring galleries and enqueues reminder emails."""

    def __init__(self) -> None:
        self._running = False

    # ------------------------------------------------------------------
    # Dependency injection points (overridden in tests)
    # ------------------------------------------------------------------

    async def _db_fetch(self, *args, **kwargs) -> list[dict]:
        """Fetch rows from the database. Overridden in tests."""
        from src.database import fetch
        return await fetch(*args, **kwargs)

    async def _redis_get(self, key: str) -> Optional[str]:
        """Get a Redis key value. Overridden in tests."""
        return await redis_client.get(key)

    async def _redis_setex(self, key: str, ttl: int, value: str) -> None:
        """Set a Redis key with TTL. Overridden in tests."""
        await redis_client.setex(key, ttl, value)

    async def _enqueue_email(
        self,
        *,
        workspace_id: str,
        recipient_email: str,
        template_code: str,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> None:
        """Enqueue an email task. Overridden in tests."""
        from src.services.task_queue_service import enqueue_email_task, TaskPriority
        from uuid import uuid4

        priority = TaskPriority.HIGH if template_code == "gallery_expiring_1d" else TaskPriority.NORMAL
        await enqueue_email_task(
            event_id=str(uuid4()),
            workspace_id=workspace_id,
            recipient_email=recipient_email,
            template_code=template_code,
            payload=payload,
            priority=priority,
            idempotency_key=idempotency_key,
        )

    # ------------------------------------------------------------------
    # Core scan logic
    # ------------------------------------------------------------------

    def _determine_milestone(self, expires_at: datetime) -> Optional[str]:
        """Determine which milestone a gallery is at based on expires_at."""
        now = datetime.now(timezone.utc)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        delta = expires_at - now
        days = delta.days

        if days < 0 or (days == 0 and delta.total_seconds() < 0):
            return MILESTONE_EXPIRED
        if days == 0:
            # Expiring today but still in the future — treat as 1d if within 24h
            return MILESTONE_1D if delta.total_seconds() < 86400 else None
        if days == 1:
            return MILESTONE_1D
        if days >= 6 and days <= 7:
            return MILESTONE_7D
        return None

    async def scan_expiring_galleries(self) -> None:
        """Scan for galleries at expiration milestones and enqueue emails."""
        now = datetime.now(timezone.utc)

        # Window: from 2 days ago to 8 days in the future
        window_start = now - timedelta(days=2)
        window_end = now + timedelta(days=8)

        try:
            galleries = await self._db_fetch(
                EXPIRING_GALLERIES_SQL,
                window_start,
                window_end,
            )
        except Exception:
            logger.exception("Failed to fetch expiring galleries")
            return

        for gallery in galleries:
            try:
                await self._process_gallery(gallery)
            except Exception:
                logger.exception(
                    "Failed to process gallery %s", gallery.get("gallery_id")
                )

    async def _process_gallery(self, gallery: dict) -> None:
        """Process a single gallery for expiration milestone notification."""
        expires_at = gallery.get("expires_at")
        if not expires_at:
            return

        milestone = self._determine_milestone(expires_at)
        if not milestone:
            return

        gallery_id = gallery["gallery_id"]
        dedup_key = f"expiration:notified:{gallery_id}:{milestone}"

        # Check deduplication
        already_sent = await self._redis_get(dedup_key)
        if already_sent:
            logger.debug(
                "Skipping %s notification for gallery %s (already sent)",
                milestone,
                gallery_id,
            )
            return

        template_code = TEMPLATE_CODES[milestone]
        expires_at_str = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime)
            else str(expires_at)
        )

        payload = {
            "gallery_name": gallery.get("title", "Untitled Gallery"),
            "expires_at": expires_at_str,
            "photo_count": gallery.get("photo_count", 0),
            "gallery_id": gallery_id,
        }

        await self._enqueue_email(
            workspace_id=gallery["workspace_id"],
            recipient_email=gallery["owner_email"],
            template_code=template_code,
            payload=payload,
            idempotency_key=f"expiration:{gallery_id}:{milestone}",
        )

        # Set deduplication key
        ttl = DEDUP_TTL.get(milestone, 86400)
        await self._redis_setex(dedup_key, ttl, "1")

        logger.info(
            "Enqueued %s email for gallery %s to %s",
            template_code,
            gallery_id,
            gallery["owner_email"],
        )

    # ------------------------------------------------------------------
    # Worker lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the worker loop (runs scan once per day)."""
        self._running = True
        logger.info("ExpirationReminderWorker started")

        while self._running:
            try:
                await self.scan_expiring_galleries()
            except Exception:
                logger.exception("Unhandled error in expiration scan")

            # Sleep until next scan
            await asyncio.sleep(SCAN_INTERVAL_SECONDS)

    def stop(self) -> None:
        """Signal the worker to stop."""
        self._running = False
        logger.info("ExpirationReminderWorker stopping")
