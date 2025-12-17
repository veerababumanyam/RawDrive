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


# Global instance
_scheduler: SchedulerService | None = None


def get_scheduler() -> SchedulerService:
    """Get global scheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = SchedulerService()
    return _scheduler
