"""Auto-cleanup worker for recycle bin items.

Handles automatic permanent deletion of soft-deleted items that have
exceeded their retention period. Runs on a configurable schedule.

Requirements:
- Automatically delete items older than retention period
- Process in batches to avoid overwhelming the system
- Support concurrent deletion with configurable limits
- Audit log all auto-cleanup operations
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.config.deletion import get_deletion_settings
from app.db.postgres import get_postgres_pool
from app.services.deletion_audit_service import get_deletion_audit_service
from app.services.deletion_service import get_deletion_service
from app.services.task_queue import register_task_handler

logger = logging.getLogger(__name__)


@register_task_handler("recycle_bin.auto_cleanup")
async def handle_auto_cleanup(payload: dict[str, Any]) -> dict[str, Any]:
    """Background task handler for auto-cleanup.

    Args:
        payload: {
            "workspace_id": str (UUID) - optional, if not provided cleans all workspaces
            "dry_run": bool - if True, only report what would be deleted
        }

    Returns:
        {"galleries_deleted": int, "photos_deleted": int, "errors": int}
    """
    workspace_id = UUID(payload["workspace_id"]) if payload.get("workspace_id") else None
    dry_run = payload.get("dry_run", False)

    worker = AutoCleanupWorker()
    return await worker.run_cleanup(workspace_id=workspace_id, dry_run=dry_run)


class AutoCleanupWorker:
    """Worker to permanently delete items past retention period."""

    def __init__(self) -> None:
        self.settings = get_deletion_settings()
        self.deletion_service = get_deletion_service()
        self.audit_service = get_deletion_audit_service()

    async def run_cleanup(
        self,
        workspace_id: UUID | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        """Run the auto-cleanup process.

        Args:
            workspace_id: If provided, only clean up this workspace
            dry_run: If True, only report what would be deleted

        Returns:
            Dictionary with cleanup statistics
        """
        if not self.settings.cleanup_enabled:
            logger.info("Auto-cleanup is disabled via configuration")
            return {
                "galleries_deleted": 0,
                "photos_deleted": 0,
                "errors": 0,
                "skipped": True,
                "reason": "cleanup_disabled",
            }

        start_time = datetime.now(timezone.utc)
        logger.info(
            f"Starting auto-cleanup (workspace={workspace_id}, dry_run={dry_run}, "
            f"retention_days={self.settings.retention_days})"
        )

        galleries_deleted = 0
        photos_deleted = 0
        errors = 0

        try:
            # Get items ready for permanent deletion
            expired_galleries = await self._get_expired_galleries(workspace_id)
            expired_photos = await self._get_expired_photos(workspace_id)

            logger.info(
                f"Found {len(expired_galleries)} galleries and {len(expired_photos)} photos "
                "ready for permanent deletion"
            )

            if dry_run:
                return {
                    "galleries_to_delete": len(expired_galleries),
                    "photos_to_delete": len(expired_photos),
                    "dry_run": True,
                    "galleries": [
                        {"gallery_id": str(g["gallery_id"]), "title": g["title"]}
                        for g in expired_galleries[:100]  # Limit to first 100 in response
                    ],
                    "photos": [
                        {"asset_id": str(p["asset_id"])}
                        for p in expired_photos[:100]
                    ],
                }

            # Process galleries in batches with concurrency limit
            galleries_deleted, gallery_errors = await self._process_galleries(
                expired_galleries
            )
            errors += gallery_errors

            # Process photos in batches with concurrency limit
            photos_deleted, photo_errors = await self._process_photos(expired_photos)
            errors += photo_errors

            # Log cleanup run
            duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
            duration_ms = int(duration_seconds * 1000)
            total_items_processed = len(expired_galleries) + len(expired_photos)
            total_deleted = galleries_deleted + photos_deleted

            await self.audit_service.log_cleanup_run(
                workspace_id=workspace_id,
                items_processed=total_items_processed,
                items_deleted=total_deleted,
                items_failed=errors,
                storage_freed=0,  # Storage tracking would need to be added to deletion_service
                duration_seconds=duration_seconds,
            )

            logger.info(
                f"Auto-cleanup completed: {galleries_deleted} galleries, "
                f"{photos_deleted} photos deleted, {errors} errors, "
                f"{duration_ms}ms duration"
            )

            return {
                "galleries_deleted": galleries_deleted,
                "photos_deleted": photos_deleted,
                "errors": errors,
                "duration_ms": duration_ms,
            }

        except Exception as e:
            logger.exception(f"Auto-cleanup failed with exception: {e}")
            return {
                "galleries_deleted": galleries_deleted,
                "photos_deleted": photos_deleted,
                "errors": errors + 1,
                "exception": str(e),
            }

    async def _get_expired_galleries(
        self, workspace_id: UUID | None
    ) -> list[dict[str, Any]]:
        """Get galleries ready for permanent deletion."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            query = """
                SELECT gallery_id, workspace_id, title, deleted_at
                FROM galleries
                WHERE deleted = TRUE
                AND delete_status IS NULL
                AND deleted_at < NOW() - INTERVAL '%s days'
            """
            params = [self.settings.retention_days]

            if workspace_id:
                query += " AND workspace_id = $2"
                params.append(workspace_id)

            query += f" ORDER BY deleted_at ASC LIMIT {self.settings.cleanup_batch_size}"

            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]

    async def _get_expired_photos(
        self, workspace_id: UUID | None
    ) -> list[dict[str, Any]]:
        """Get photos (assets) ready for permanent deletion."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            query = """
                SELECT asset_id, workspace_id, deleted_at
                FROM assets
                WHERE deleted = TRUE
                AND delete_status IS NULL
                AND deleted_at < NOW() - INTERVAL '%s days'
            """
            params = [self.settings.retention_days]

            if workspace_id:
                query += " AND workspace_id = $2"
                params.append(workspace_id)

            query += f" ORDER BY deleted_at ASC LIMIT {self.settings.cleanup_batch_size}"

            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]

    async def _process_galleries(
        self, galleries: list[dict[str, Any]]
    ) -> tuple[int, int]:
        """Process gallery deletions with concurrency control.

        Returns:
            Tuple of (successful_deletions, errors)
        """
        if not galleries:
            return 0, 0

        deleted = 0
        errors = 0

        # Process in batches with concurrency limit
        semaphore = asyncio.Semaphore(self.settings.cleanup_max_concurrent)

        async def delete_gallery(gallery: dict[str, Any]) -> bool:
            async with semaphore:
                try:
                    result = await self.deletion_service.permanent_delete_gallery(
                        workspace_id=gallery["workspace_id"],
                        gallery_id=gallery["gallery_id"],
                        user_id=None,  # System-initiated
                        ip_address="system",
                        user_agent="AutoCleanupWorker",
                    )
                    return result.success
                except Exception as e:
                    logger.error(
                        f"Failed to permanently delete gallery {gallery['gallery_id']}: {e}"
                    )
                    return False

        tasks = [delete_gallery(g) for g in galleries]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                errors += 1
            elif result:
                deleted += 1
            else:
                errors += 1

        return deleted, errors

    async def _process_photos(
        self, photos: list[dict[str, Any]]
    ) -> tuple[int, int]:
        """Process photo deletions with concurrency control.

        Returns:
            Tuple of (successful_deletions, errors)
        """
        if not photos:
            return 0, 0

        deleted = 0
        errors = 0

        # Process in batches with concurrency limit
        semaphore = asyncio.Semaphore(self.settings.cleanup_max_concurrent)

        async def delete_photo(photo: dict[str, Any]) -> bool:
            async with semaphore:
                try:
                    result = await self.deletion_service.permanent_delete_photo(
                        workspace_id=photo["workspace_id"],
                        asset_id=photo["asset_id"],
                        user_id=None,  # System-initiated
                        ip_address="system",
                        user_agent="AutoCleanupWorker",
                    )
                    return result.success
                except Exception as e:
                    logger.error(
                        f"Failed to permanently delete photo {photo['asset_id']}: {e}"
                    )
                    return False

        tasks = [delete_photo(p) for p in photos]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                errors += 1
            elif result:
                deleted += 1
            else:
                errors += 1

        return deleted, errors


async def schedule_auto_cleanup() -> str:
    """Schedule the auto-cleanup task.

    This should be called by a cron scheduler or startup routine.

    Returns:
        Task ID
    """
    from app.services.task_queue import enqueue_task, TaskPriority

    return await enqueue_task(
        task_type="recycle_bin.auto_cleanup",
        payload={},
        priority=TaskPriority.LOW,
        max_retries=3,
    )


async def run_cleanup_now(
    workspace_id: UUID | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Run cleanup immediately without going through task queue.

    Useful for manual cleanup or testing.

    Args:
        workspace_id: If provided, only clean up this workspace
        dry_run: If True, only report what would be deleted

    Returns:
        Cleanup statistics
    """
    worker = AutoCleanupWorker()
    return await worker.run_cleanup(workspace_id=workspace_id, dry_run=dry_run)


# ---------------------------------------------------------------------------
# Singleton instance
# ---------------------------------------------------------------------------

_worker: AutoCleanupWorker | None = None


def get_auto_cleanup_worker() -> AutoCleanupWorker:
    """Get singleton worker instance."""
    global _worker
    if _worker is None:
        _worker = AutoCleanupWorker()
    return _worker
