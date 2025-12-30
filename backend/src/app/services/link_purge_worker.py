"""Link purge worker for revoked magic links.

Handles automatic permanent deletion of revoked links that have exceeded
their retention period (90 days default). This supports SOC 2 compliance
by maintaining audit trail for the retention period before purging.

Note: Access logs in magic_link_accesses are preserved for compliance
even after the magic_link record is deleted.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.repositories.shared_repository import get_shared_repository
from app.services.task_queue import register_task_handler

logger = logging.getLogger(__name__)

# Default retention period (90 days) for SOC 2 compliance
DEFAULT_RETENTION_DAYS = 90


@register_task_handler("shared_links.purge_revoked")
async def handle_purge_revoked(payload: dict[str, Any]) -> dict[str, Any]:
    """Background task handler for purging old revoked links.

    Args:
        payload: {
            "retention_days": int - optional, defaults to 90
            "batch_size": int - optional, defaults to 1000
            "dry_run": bool - if True, only report what would be deleted
        }

    Returns:
        {"deleted_count": int, "remaining_count": int, "dry_run": bool}
    """
    retention_days = payload.get("retention_days", DEFAULT_RETENTION_DAYS)
    batch_size = payload.get("batch_size", 1000)
    dry_run = payload.get("dry_run", False)

    worker = LinkPurgeWorker()
    return await worker.run_purge(
        retention_days=retention_days,
        batch_size=batch_size,
        dry_run=dry_run,
    )


class LinkPurgeWorker:
    """Worker to permanently delete revoked links past retention period.

    SOC 2 Compliance Notes:
    - Default retention period is 90 days
    - Access logs are preserved in magic_link_accesses table
    - All purge operations are logged for audit
    """

    def __init__(self) -> None:
        self.repo = get_shared_repository()

    async def run_purge(
        self,
        retention_days: int = DEFAULT_RETENTION_DAYS,
        batch_size: int = 1000,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        """Run the link purge process.

        Args:
            retention_days: Days to retain revoked links (default: 90)
            batch_size: Max links to delete per batch (default: 1000)
            dry_run: If True, only report what would be deleted

        Returns:
            Dictionary with purge statistics
        """
        start_time = datetime.now(timezone.utc)
        logger.info(
            f"Starting link purge (retention_days={retention_days}, "
            f"batch_size={batch_size}, dry_run={dry_run})"
        )

        try:
            # Get stats first
            stats = await self.repo.get_purge_stats()

            if dry_run:
                duration_ms = int(
                    (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
                )
                return {
                    "dry_run": True,
                    "eligible_for_purge": stats["eligible_for_purge"],
                    "total_revoked": stats["total_revoked"],
                    "revoked_last_30_days": stats["revoked_last_30_days"],
                    "revoked_30_to_90_days": stats["revoked_30_to_90_days"],
                    "oldest_revoked_at": stats["oldest_revoked_at"],
                    "retention_days": retention_days,
                    "duration_ms": duration_ms,
                }

            # Perform the purge
            deleted_count, remaining_count = await self.repo.purge_old_revoked_links(
                retention_days=retention_days,
                batch_size=batch_size,
            )

            duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
            duration_ms = int(duration_seconds * 1000)

            logger.info(
                f"Link purge completed: {deleted_count} deleted, "
                f"{remaining_count} remaining, {duration_ms}ms duration"
            )

            return {
                "deleted_count": deleted_count,
                "remaining_count": remaining_count,
                "retention_days": retention_days,
                "duration_ms": duration_ms,
            }

        except Exception as e:
            logger.exception(f"Link purge failed with exception: {e}")
            return {
                "deleted_count": 0,
                "remaining_count": 0,
                "error": str(e),
            }


async def schedule_link_purge(
    retention_days: int = DEFAULT_RETENTION_DAYS,
) -> str:
    """Schedule the link purge task.

    This should be called by a cron scheduler or startup routine.
    Recommended: Run daily.

    Returns:
        Task ID
    """
    from app.services.task_queue import enqueue_task, TaskPriority

    return await enqueue_task(
        task_type="shared_links.purge_revoked",
        payload={"retention_days": retention_days},
        priority=TaskPriority.LOW,
        max_retries=3,
    )


async def run_purge_now(
    retention_days: int = DEFAULT_RETENTION_DAYS,
    batch_size: int = 1000,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Run purge immediately without going through task queue.

    Useful for manual cleanup or testing.

    Args:
        retention_days: Days to retain revoked links (default: 90)
        batch_size: Max links to delete per batch
        dry_run: If True, only report what would be deleted

    Returns:
        Purge statistics
    """
    worker = LinkPurgeWorker()
    return await worker.run_purge(
        retention_days=retention_days,
        batch_size=batch_size,
        dry_run=dry_run,
    )


# ---------------------------------------------------------------------------
# Singleton instance
# ---------------------------------------------------------------------------

_worker: LinkPurgeWorker | None = None


def get_link_purge_worker() -> LinkPurgeWorker:
    """Get singleton worker instance."""
    global _worker
    if _worker is None:
        _worker = LinkPurgeWorker()
    return _worker
