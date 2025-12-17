"""Background task processing with Redis queue.

Implements a simple task queue with:
- Task enqueueing and dequeuing
- Retry logic with exponential backoff
- Task status tracking

Requirements: 20.1, 20.3, 20.4, 20.5
Property 22: Background Task Retry
"""

from __future__ import annotations

import asyncio
import json
import logging
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Coroutine

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Task types and status
# ---------------------------------------------------------------------------


class TaskStatus(str, Enum):
    """Task execution status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRY = "retry"


class TaskPriority(int, Enum):
    """Task priority levels."""

    LOW = 0
    NORMAL = 5
    HIGH = 10
    CRITICAL = 15


@dataclass
class Task:
    """Background task definition."""

    task_id: str
    task_type: str
    payload: dict[str, Any]
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: datetime | None = None
    completed_at: datetime | None = None
    retries: int = 0
    max_retries: int = 3
    error: str | None = None
    result: Any = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "payload": self.payload,
            "priority": self.priority.value,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "retries": self.retries,
            "max_retries": self.max_retries,
            "error": self.error,
            "result": self.result,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Task":
        return cls(
            task_id=data["task_id"],
            task_type=data["task_type"],
            payload=data["payload"],
            priority=TaskPriority(data.get("priority", 5)),
            status=TaskStatus(data.get("status", "pending")),
            created_at=datetime.fromisoformat(data["created_at"]),
            started_at=datetime.fromisoformat(data["started_at"]) if data.get("started_at") else None,
            completed_at=datetime.fromisoformat(data["completed_at"]) if data.get("completed_at") else None,
            retries=data.get("retries", 0),
            max_retries=data.get("max_retries", 3),
            error=data.get("error"),
            result=data.get("result"),
        )


# ---------------------------------------------------------------------------
# Redis keys
# ---------------------------------------------------------------------------

QUEUE_KEY = "task_queue"
TASK_PREFIX = "task:"
PROCESSING_SET = "task_processing"
DEAD_LETTER_QUEUE = "task_dlq"


def _task_key(task_id: str) -> str:
    return f"{TASK_PREFIX}{task_id}"


# ---------------------------------------------------------------------------
# Task handlers registry
# ---------------------------------------------------------------------------

TaskHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, Any]]
_handlers: dict[str, TaskHandler] = {}


def register_task_handler(task_type: str) -> Callable[[TaskHandler], TaskHandler]:
    """Decorator to register a task handler."""

    def decorator(handler: TaskHandler) -> TaskHandler:
        _handlers[task_type] = handler
        logger.info(f"Registered task handler: {task_type}")
        return handler

    return decorator


def get_handler(task_type: str) -> TaskHandler | None:
    """Get handler for task type."""
    return _handlers.get(task_type)


# ---------------------------------------------------------------------------
# Task Queue Service
# ---------------------------------------------------------------------------


class TaskQueueService:
    """Redis-backed task queue with retry logic."""

    def __init__(self):
        self._running = False
        self._worker_task: asyncio.Task | None = None

    async def enqueue(
        self,
        task_type: str,
        payload: dict[str, Any],
        priority: TaskPriority = TaskPriority.NORMAL,
        max_retries: int = 3,
        delay_seconds: int = 0,
    ) -> str:
        """Add task to queue.

        Args:
            task_type: Type of task (must have registered handler)
            payload: Task data
            priority: Task priority
            max_retries: Max retry attempts
            delay_seconds: Delay before processing

        Returns:
            Task ID
        """
        redis = await get_redis_client()

        task_id = str(uuid.uuid4())
        task = Task(
            task_id=task_id,
            task_type=task_type,
            payload=payload,
            priority=priority,
            max_retries=max_retries,
        )

        # Store task data
        await redis.setex(
            _task_key(task_id),
            86400 * 7,  # 7 days TTL
            json.dumps(task.to_dict()),
        )

        # Add to priority queue (sorted set, score = -priority for high-first)
        if delay_seconds > 0:
            # Delayed task: score = timestamp when to execute
            execute_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
            score = execute_at.timestamp()
        else:
            # Immediate: score = -priority (so high priority = lower score = first)
            score = -priority.value

        await redis.zadd(QUEUE_KEY, {task_id: score})

        logger.info(
            "Task enqueued",
            extra={"task_id": task_id, "task_type": task_type, "priority": priority.name},
        )

        return task_id

    async def get_task(self, task_id: str) -> Task | None:
        """Get task by ID."""
        redis = await get_redis_client()
        data = await redis.get(_task_key(task_id))

        if data is None:
            return None

        return Task.from_dict(json.loads(data))

    async def get_task_status(self, task_id: str) -> TaskStatus | None:
        """Get task status."""
        task = await self.get_task(task_id)
        return task.status if task else None

    async def _dequeue(self) -> Task | None:
        """Dequeue next task for processing."""
        redis = await get_redis_client()

        # Get tasks ready to execute
        now = datetime.now(timezone.utc).timestamp()

        # Get task with lowest score (highest priority or ready delayed task)
        results = await redis.zrangebyscore(QUEUE_KEY, "-inf", now, start=0, num=1)

        if not results:
            # Check for any immediate tasks (negative scores)
            results = await redis.zrangebyscore(QUEUE_KEY, "-inf", 0, start=0, num=1)

        if not results:
            return None

        task_id = results[0].decode() if isinstance(results[0], bytes) else results[0]

        # Atomic move from queue to processing set
        removed = await redis.zrem(QUEUE_KEY, task_id)
        if not removed:
            return None  # Another worker got it

        await redis.sadd(PROCESSING_SET, task_id)

        task = await self.get_task(task_id)
        if task:
            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.now(timezone.utc)
            await redis.setex(
                _task_key(task_id),
                86400 * 7,
                json.dumps(task.to_dict()),
            )

        return task

    async def _complete_task(self, task: Task, result: Any = None) -> None:
        """Mark task as completed."""
        redis = await get_redis_client()

        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now(timezone.utc)
        task.result = result

        await redis.setex(
            _task_key(task.task_id),
            86400 * 7,
            json.dumps(task.to_dict()),
        )
        await redis.srem(PROCESSING_SET, task.task_id)

        logger.info(
            "Task completed",
            extra={
                "task_id": task.task_id,
                "task_type": task.task_type,
                "duration_ms": (task.completed_at - task.started_at).total_seconds() * 1000
                if task.started_at
                else 0,
            },
        )

    async def _fail_task(self, task: Task, error: str) -> None:
        """Handle task failure with retry logic.

        Property 22: Background Task Retry
        """
        redis = await get_redis_client()

        task.retries += 1
        task.error = error

        if task.retries < task.max_retries:
            # Retry with exponential backoff
            delay = min(300, 2 ** task.retries * 10)  # Max 5 minutes
            task.status = TaskStatus.RETRY

            await redis.setex(
                _task_key(task.task_id),
                86400 * 7,
                json.dumps(task.to_dict()),
            )

            # Re-enqueue with delay
            execute_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
            await redis.zadd(QUEUE_KEY, {task.task_id: execute_at.timestamp()})
            await redis.srem(PROCESSING_SET, task.task_id)

            logger.warning(
                "Task scheduled for retry",
                extra={
                    "task_id": task.task_id,
                    "retry": task.retries,
                    "delay_seconds": delay,
                    "error": error,
                },
            )
        else:
            # Move to dead letter queue
            task.status = TaskStatus.FAILED
            task.completed_at = datetime.now(timezone.utc)

            await redis.setex(
                _task_key(task.task_id),
                86400 * 30,  # Keep failed tasks longer
                json.dumps(task.to_dict()),
            )
            await redis.srem(PROCESSING_SET, task.task_id)
            await redis.lpush(DEAD_LETTER_QUEUE, task.task_id)

            logger.error(
                "Task failed permanently",
                extra={
                    "task_id": task.task_id,
                    "task_type": task.task_type,
                    "retries": task.retries,
                    "error": error,
                },
            )

    async def _process_task(self, task: Task) -> None:
        """Process a single task."""
        handler = get_handler(task.task_type)

        if handler is None:
            await self._fail_task(task, f"No handler registered for task type: {task.task_type}")
            return

        try:
            result = await handler(task.payload)
            await self._complete_task(task, result)
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
            await self._fail_task(task, error_msg)

    async def start_worker(self, concurrency: int = 5) -> None:
        """Start background worker to process tasks.

        Args:
            concurrency: Number of concurrent task processors
        """
        self._running = True
        logger.info(f"Starting task worker with concurrency={concurrency}")

        semaphore = asyncio.Semaphore(concurrency)

        async def process_with_semaphore(task: Task) -> None:
            async with semaphore:
                await self._process_task(task)

        while self._running:
            try:
                task = await self._dequeue()

                if task:
                    # Process without blocking the loop
                    asyncio.create_task(process_with_semaphore(task))
                else:
                    # No tasks, wait a bit
                    await asyncio.sleep(0.5)

            except Exception as e:
                logger.exception("Worker error", extra={"error": str(e)})
                await asyncio.sleep(1)

    def stop_worker(self) -> None:
        """Signal worker to stop."""
        self._running = False
        logger.info("Task worker stopping")

    async def get_queue_stats(self) -> dict[str, int]:
        """Get queue statistics."""
        redis = await get_redis_client()

        pending = await redis.zcard(QUEUE_KEY)
        processing = await redis.scard(PROCESSING_SET)
        failed = await redis.llen(DEAD_LETTER_QUEUE)

        return {
            "pending": pending,
            "processing": processing,
            "failed": failed,
        }

    async def retry_failed_task(self, task_id: str) -> bool:
        """Manually retry a failed task."""
        redis = await get_redis_client()

        task = await self.get_task(task_id)
        if not task or task.status != TaskStatus.FAILED:
            return False

        task.status = TaskStatus.PENDING
        task.retries = 0
        task.error = None

        await redis.setex(
            _task_key(task_id),
            86400 * 7,
            json.dumps(task.to_dict()),
        )
        await redis.zadd(QUEUE_KEY, {task_id: -task.priority.value})
        await redis.lrem(DEAD_LETTER_QUEUE, 1, task_id)

        logger.info("Task manually retried", extra={"task_id": task_id})
        return True


# ---------------------------------------------------------------------------
# Global instance and helpers
# ---------------------------------------------------------------------------

_task_queue: TaskQueueService | None = None


def get_task_queue() -> TaskQueueService:
    """Get global task queue instance."""
    global _task_queue
    if _task_queue is None:
        _task_queue = TaskQueueService()
    return _task_queue


async def enqueue_task(
    task_type: str,
    payload: dict[str, Any],
    priority: TaskPriority = TaskPriority.NORMAL,
    max_retries: int = 3,
    delay_seconds: int = 0,
) -> str:
    """Convenience function to enqueue a task."""
    queue = get_task_queue()
    return await queue.enqueue(task_type, payload, priority, max_retries, delay_seconds)


# ---------------------------------------------------------------------------
# Built-in task handlers
# ---------------------------------------------------------------------------


@register_task_handler("send_email")
async def handle_send_email(payload: dict[str, Any]) -> dict[str, Any]:
    """Send email task handler."""
    # TODO: Implement actual email sending
    logger.info(
        "Email task processed (stub)",
        extra={"to": payload.get("to"), "subject": payload.get("subject")},
    )
    return {"sent": True}


@register_task_handler("cleanup_expired_tokens")
async def handle_cleanup_tokens(payload: dict[str, Any]) -> dict[str, Any]:
    """Cleanup expired tokens."""
    from app.services.email_verification_service import cleanup_verification_tokens_job
    from app.services.invitation_service import expire_invitations_job

    verification_count = await cleanup_verification_tokens_job()
    invitation_count = await expire_invitations_job()

    return {
        "verification_tokens_cleaned": verification_count,
        "invitations_expired": invitation_count,
    }


@register_task_handler("expire_trials")
async def handle_expire_trials(payload: dict[str, Any]) -> dict[str, Any]:
    """Expire trial subscriptions."""
    from app.services.subscription_service import expire_trials_job

    count = await expire_trials_job()
    return {"trials_expired": count}
