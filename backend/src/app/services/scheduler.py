"""Periodic task scheduler for background jobs.

Schedules and runs periodic maintenance tasks.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.services.task_queue import TaskPriority, enqueue_task

logger = logging.getLogger(__name__)


class SchedulerService:
    """Simple periodic task scheduler."""

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the scheduler."""
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Scheduler started")

    async def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Scheduler stopped")

    async def _run_loop(self) -> None:
        """Main scheduler loop."""
        last_cleanup = datetime.min.replace(tzinfo=timezone.utc)
        last_trial_check = datetime.min.replace(tzinfo=timezone.utc)
        last_tagging_stats_refresh = datetime.min.replace(tzinfo=timezone.utc)
        last_invitation_deletion = datetime.min.replace(tzinfo=timezone.utc)

        while self._running:
            try:
                now = datetime.now(timezone.utc)

                # Token cleanup: every hour
                if (now - last_cleanup).total_seconds() >= 3600:
                    await self._schedule_cleanup()
                    last_cleanup = now

                # Trial expiration check: every 6 hours
                if (now - last_trial_check).total_seconds() >= 21600:
                    await self._schedule_trial_expiration()
                    last_trial_check = now

                # Tagging stats refresh: every 5 minutes
                # Refreshes gallery_tagging_stats materialized view for health dashboard
                if (now - last_tagging_stats_refresh).total_seconds() >= 300:
                    await self._schedule_tagging_stats_refresh()
                    last_tagging_stats_refresh = now

                # Invitation auto-deletion: every 6 hours (T128, T129)
                # - Deletes expired invitations past scheduled_deletion_at
                # - Sends 3-day and 1-day warning notifications
                if (now - last_invitation_deletion).total_seconds() >= 21600:
                    await self._schedule_invitation_auto_deletion()
                    await self._schedule_invitation_deletion_warnings()
                    last_invitation_deletion = now

                # Sleep for 1 minute between checks
                await asyncio.sleep(60)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("Scheduler error", extra={"error": str(e)})
                await asyncio.sleep(60)

    async def _schedule_cleanup(self) -> None:
        """Schedule token cleanup task."""
        task_id = await enqueue_task(
            task_type="cleanup_expired_tokens",
            payload={},
            priority=TaskPriority.LOW,
        )
        logger.info("Scheduled token cleanup", extra={"task_id": task_id})

    async def _schedule_trial_expiration(self) -> None:
        """Schedule trial expiration task."""
        task_id = await enqueue_task(
            task_type="expire_trials",
            payload={},
            priority=TaskPriority.NORMAL,
        )
        logger.info("Scheduled trial expiration check", extra={"task_id": task_id})

    async def _schedule_tagging_stats_refresh(self) -> None:
        """Schedule gallery tagging stats refresh.

        Refreshes the gallery_tagging_stats materialized view for the
        AI tagging health dashboard. Runs concurrently to avoid blocking reads.
        """
        task_id = await enqueue_task(
            task_type="refresh_tagging_stats",
            payload={},
            priority=TaskPriority.LOW,
        )
        logger.info("Scheduled tagging stats refresh", extra={"task_id": task_id})

    async def _schedule_invitation_auto_deletion(self) -> None:
        """Schedule invitation auto-deletion task.

        Feature: 016-save-the-date
        Task: T128 - Auto-deletion scheduler

        Deletes invitations where scheduled_deletion_at has passed.
        """
        task_id = await enqueue_task(
            task_type="auto_delete_expired_invitations",
            payload={},
            priority=TaskPriority.LOW,
        )
        logger.info("Scheduled invitation auto-deletion check", extra={"task_id": task_id})

    async def _schedule_invitation_deletion_warnings(self) -> None:
        """Schedule invitation pre-deletion warning tasks.

        Feature: 016-save-the-date
        Task: T129 - Pre-deletion warning notifications

        FR-039: Sends 3-day and 1-day warnings before auto-deletion.
        """
        # 3-day warning
        task_id_3d = await enqueue_task(
            task_type="send_auto_delete_warnings",
            payload={"days_until_deletion": 3},
            priority=TaskPriority.NORMAL,
        )
        logger.info("Scheduled 3-day deletion warning check", extra={"task_id": task_id_3d})

        # 1-day warning
        task_id_1d = await enqueue_task(
            task_type="send_auto_delete_warnings",
            payload={"days_until_deletion": 1},
            priority=TaskPriority.NORMAL,
        )
        logger.info("Scheduled 1-day deletion warning check", extra={"task_id": task_id_1d})


# Global instance
_scheduler: SchedulerService | None = None


def get_scheduler() -> SchedulerService:
    """Get global scheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = SchedulerService()
    return _scheduler
