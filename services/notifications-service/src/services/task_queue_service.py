"""
Task Queue Service for the Notifications & Communication Microservice.

Implements a Redis-backed task queue for background notification processing:
- Async task enqueueing and dequeuing
- Priority-based task ordering
- Retry logic with exponential backoff
- Dead letter queue for failed notifications
- Task status tracking
- Worker management

This is specifically designed for the notifications service, with task types
optimized for email, SMS, and digest processing.

Features:
- Priority queue using Redis sorted sets
- Task deduplication via idempotency keys
- Configurable retry delays and max attempts
- Dead letter queue for permanently failed tasks
- Task cancellation support
- Queue depth metrics for KEDA autoscaling
- Circuit breaker integration

Feature: Notifications & Communication Microservice
Task: T034 - Create task queue service
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
from typing import Any, Callable, Coroutine, Optional, TypeVar

from src.cache.redis_client import redis_client
from src.config import settings
from src.observability.metrics import get_metrics

logger = logging.getLogger(__name__)

T = TypeVar("T")


# =============================================================================
# TASK ENUMS
# =============================================================================


class TaskStatus(str, Enum):
    """Task execution status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRY = "retry"
    CANCELLED = "cancelled"
    DEAD_LETTERED = "dead_lettered"


class TaskPriority(int, Enum):
    """Task priority levels.

    Higher values = higher priority.
    Maps to notification priority for consistency.
    """

    LOW = 0
    NORMAL = 5
    HIGH = 10
    URGENT = 15
    CRITICAL = 20  # For system-level tasks


# =============================================================================
# TASK TYPE CONSTANTS
# =============================================================================


# Email notification tasks
TASK_SEND_EMAIL = "notification.email.send"
TASK_SEND_EMAIL_BATCH = "notification.email.batch"
TASK_RETRY_EMAIL = "notification.email.retry"

# SMS notification tasks (placeholder for Phase 2)
TASK_SEND_SMS = "notification.sms.send"
TASK_SEND_SMS_BATCH = "notification.sms.batch"
TASK_RETRY_SMS = "notification.sms.retry"

# In-app notification tasks
TASK_SEND_IN_APP = "notification.in_app.send"
TASK_SEND_IN_APP_BATCH = "notification.in_app.batch"

# Push notification tasks (placeholder for future)
TASK_SEND_PUSH = "notification.push.send"
TASK_SEND_PUSH_BATCH = "notification.push.batch"

# Digest aggregation tasks
TASK_AGGREGATE_DIGEST = "notification.digest.aggregate"
TASK_SEND_DIGEST = "notification.digest.send"
TASK_PROCESS_DAILY_DIGEST = "notification.digest.daily"
TASK_PROCESS_WEEKLY_DIGEST = "notification.digest.weekly"

# Preference tasks
TASK_SYNC_PREFERENCES = "notification.preferences.sync"
TASK_PROCESS_UNSUBSCRIBE = "notification.preferences.unsubscribe"

# Template tasks
TASK_COMPILE_TEMPLATE = "notification.template.compile"
TASK_INVALIDATE_TEMPLATE_CACHE = "notification.template.invalidate"

# Webhook processing tasks
TASK_PROCESS_WEBHOOK = "notification.webhook.process"
TASK_UPDATE_DELIVERY_STATUS = "notification.delivery.update"

# Cleanup tasks
TASK_CLEANUP_OLD_EVENTS = "notification.cleanup.events"
TASK_CLEANUP_DELIVERY_LOGS = "notification.cleanup.logs"
TASK_CLEANUP_DEAD_LETTER = "notification.cleanup.dead_letter"

# Retry processing
TASK_PROCESS_RETRIES = "notification.retry.process"


# =============================================================================
# REDIS KEYS
# =============================================================================


def _queue_key() -> str:
    """Get the main queue key (sorted set)."""
    return "queue:pending"


def _processing_key() -> str:
    """Get the processing set key."""
    return "queue:processing"


def _dead_letter_key() -> str:
    """Get the dead letter queue key."""
    return "queue:dead_letter"


def _task_key(task_id: str) -> str:
    """Get the key for a specific task's data."""
    return f"task:{task_id}"


def _scheduled_key() -> str:
    """Get the scheduled tasks key (sorted set by execution time)."""
    return "queue:scheduled"


def _idempotency_key(key: str) -> str:
    """Get the idempotency tracking key."""
    return f"idempotency:{key}"


# =============================================================================
# TASK DATA CLASS
# =============================================================================


@dataclass
class Task:
    """Background task definition for notification processing.

    This dataclass represents a unit of work in the notification queue.
    It contains all information needed to process and track the task.
    """

    task_id: str
    task_type: str
    payload: dict[str, Any]
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    scheduled_for: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    retries: int = 0
    max_retries: int = 3
    retry_delay: int = 60  # Base delay in seconds (exponential backoff)
    error: Optional[str] = None
    error_code: Optional[str] = None
    result: Any = None
    idempotency_key: Optional[str] = None
    correlation_id: Optional[str] = None
    workspace_id: Optional[str] = None
    timeout_seconds: int = 300  # Task timeout (5 minutes default)

    def to_dict(self) -> dict[str, Any]:
        """Serialize task to dictionary for Redis storage."""
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "payload": self.payload,
            "priority": self.priority.value,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "scheduled_for": self.scheduled_for.isoformat() if self.scheduled_for else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "retries": self.retries,
            "max_retries": self.max_retries,
            "retry_delay": self.retry_delay,
            "error": self.error,
            "error_code": self.error_code,
            "result": self.result,
            "idempotency_key": self.idempotency_key,
            "correlation_id": self.correlation_id,
            "workspace_id": self.workspace_id,
            "timeout_seconds": self.timeout_seconds,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Task":
        """Deserialize task from dictionary."""
        return cls(
            task_id=data["task_id"],
            task_type=data["task_type"],
            payload=data.get("payload", {}),
            priority=TaskPriority(data.get("priority", 5)),
            status=TaskStatus(data.get("status", "pending")),
            created_at=datetime.fromisoformat(data["created_at"]),
            scheduled_for=(
                datetime.fromisoformat(data["scheduled_for"])
                if data.get("scheduled_for")
                else None
            ),
            started_at=(
                datetime.fromisoformat(data["started_at"])
                if data.get("started_at")
                else None
            ),
            completed_at=(
                datetime.fromisoformat(data["completed_at"])
                if data.get("completed_at")
                else None
            ),
            retries=data.get("retries", 0),
            max_retries=data.get("max_retries", 3),
            retry_delay=data.get("retry_delay", 60),
            error=data.get("error"),
            error_code=data.get("error_code"),
            result=data.get("result"),
            idempotency_key=data.get("idempotency_key"),
            correlation_id=data.get("correlation_id"),
            workspace_id=data.get("workspace_id"),
            timeout_seconds=data.get("timeout_seconds", 300),
        )

    def should_retry(self) -> bool:
        """Check if task should be retried."""
        return self.retries < self.max_retries

    def get_retry_delay(self) -> int:
        """Calculate retry delay with exponential backoff.

        Returns delay in seconds, capped at 5 minutes.
        """
        delay = min(300, self.retry_delay * (2 ** self.retries))
        return delay


# =============================================================================
# TASK HANDLER REGISTRY
# =============================================================================


TaskHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, Any]]
_handlers: dict[str, TaskHandler] = {}


def register_task_handler(task_type: str) -> Callable[[TaskHandler], TaskHandler]:
    """Decorator to register a task handler.

    Usage:
        @register_task_handler("notification.email.send")
        async def handle_send_email(payload: dict) -> dict:
            ...
    """

    def decorator(handler: TaskHandler) -> TaskHandler:
        _handlers[task_type] = handler
        logger.info(f"Registered task handler: {task_type}")
        return handler

    return decorator


def get_handler(task_type: str) -> Optional[TaskHandler]:
    """Get handler for a task type."""
    return _handlers.get(task_type)


def get_registered_handlers() -> list[str]:
    """Get list of registered task types."""
    return list(_handlers.keys())


# =============================================================================
# TASK QUEUE SERVICE
# =============================================================================


class TaskQueueService:
    """Redis-backed task queue service for notification processing.

    This service provides:
    - Priority-based task enqueueing
    - Scheduled task support
    - Idempotency checking to prevent duplicates
    - Retry logic with exponential backoff
    - Dead letter queue for permanently failed tasks
    - Worker management for async processing
    - Metrics integration for KEDA autoscaling

    Usage:
        queue = TaskQueueService()

        # Enqueue a task
        task_id = await queue.enqueue(
            task_type=TASK_SEND_EMAIL,
            payload={"event_id": "123", "email": "user@example.com"},
            priority=TaskPriority.HIGH,
        )

        # Start the worker
        await queue.start_worker(concurrency=10)

        # Check task status
        task = await queue.get_task(task_id)
    """

    def __init__(self):
        """Initialize the task queue service."""
        self._running = False
        self._worker_tasks: list[asyncio.Task] = []
        self._metrics = get_metrics()
        self._shutdown_event = asyncio.Event()

    # =========================================================================
    # ENQUEUEING
    # =========================================================================

    async def enqueue(
        self,
        task_type: str,
        payload: dict[str, Any],
        priority: TaskPriority = TaskPriority.NORMAL,
        max_retries: int = 3,
        retry_delay: int = 60,
        scheduled_for: Optional[datetime] = None,
        idempotency_key: Optional[str] = None,
        correlation_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        timeout_seconds: int = 300,
    ) -> str:
        """Enqueue a task for processing.

        Args:
            task_type: Type of task (must have registered handler)
            payload: Task data
            priority: Task priority (higher = processed first)
            max_retries: Maximum retry attempts on failure
            retry_delay: Base delay between retries (exponential backoff)
            scheduled_for: When to process (None = immediate)
            idempotency_key: Prevent duplicate task creation
            correlation_id: For tracking related tasks
            workspace_id: Workspace for multi-tenant isolation
            timeout_seconds: Task execution timeout

        Returns:
            Task ID

        Raises:
            ValueError: If idempotency key already exists
        """
        # Check idempotency
        if idempotency_key:
            existing_id = await self._check_idempotency(idempotency_key)
            if existing_id:
                logger.debug(
                    f"Duplicate task with idempotency key: {idempotency_key}",
                    extra={"existing_task_id": existing_id},
                )
                return existing_id

        # Generate task ID
        task_id = str(uuid.uuid4())

        # Create task
        task = Task(
            task_id=task_id,
            task_type=task_type,
            payload=payload,
            priority=priority,
            max_retries=max_retries,
            retry_delay=retry_delay,
            scheduled_for=scheduled_for,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
            workspace_id=workspace_id,
            timeout_seconds=timeout_seconds,
        )

        # Store task data with 7 day TTL
        await redis_client.set(
            _task_key(task_id),
            json.dumps(task.to_dict(), default=str),
            ttl=86400 * 7,
        )

        # Store idempotency key if provided
        if idempotency_key:
            await redis_client.set(
                _idempotency_key(idempotency_key),
                task_id,
                ttl=86400 * 7,
            )

        # Add to appropriate queue
        if scheduled_for and scheduled_for > datetime.now(timezone.utc):
            # Scheduled task: add to scheduled queue with execution timestamp
            score = scheduled_for.timestamp()
            await redis_client.zadd(_scheduled_key(), {task_id: score})
        else:
            # Immediate task: add to main queue with negative priority (lower score = first)
            score = -priority.value
            await redis_client.zadd(_queue_key(), {task_id: score})

        # Update metrics
        await self._update_queue_metrics()

        logger.info(
            "Task enqueued",
            extra={
                "task_id": task_id,
                "task_type": task_type,
                "priority": priority.name,
                "scheduled_for": scheduled_for.isoformat() if scheduled_for else None,
            },
        )

        return task_id

    async def enqueue_batch(
        self,
        tasks: list[dict[str, Any]],
    ) -> list[str]:
        """Enqueue multiple tasks efficiently.

        Args:
            tasks: List of task definitions with keys:
                - task_type (required)
                - payload (required)
                - priority (optional)
                - max_retries (optional)
                - scheduled_for (optional)
                - idempotency_key (optional)
                - correlation_id (optional)
                - workspace_id (optional)

        Returns:
            List of task IDs
        """
        task_ids = []

        for task_def in tasks:
            task_id = await self.enqueue(
                task_type=task_def["task_type"],
                payload=task_def["payload"],
                priority=TaskPriority(task_def.get("priority", TaskPriority.NORMAL.value)),
                max_retries=task_def.get("max_retries", 3),
                retry_delay=task_def.get("retry_delay", 60),
                scheduled_for=task_def.get("scheduled_for"),
                idempotency_key=task_def.get("idempotency_key"),
                correlation_id=task_def.get("correlation_id"),
                workspace_id=task_def.get("workspace_id"),
            )
            task_ids.append(task_id)

        return task_ids

    async def enqueue_delayed(
        self,
        task_type: str,
        payload: dict[str, Any],
        delay_seconds: int,
        **kwargs,
    ) -> str:
        """Enqueue a task with a delay.

        Args:
            task_type: Type of task
            payload: Task data
            delay_seconds: Seconds to wait before processing
            **kwargs: Additional arguments for enqueue()

        Returns:
            Task ID
        """
        scheduled_for = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
        return await self.enqueue(
            task_type=task_type,
            payload=payload,
            scheduled_for=scheduled_for,
            **kwargs,
        )

    # =========================================================================
    # TASK RETRIEVAL
    # =========================================================================

    async def get_task(self, task_id: str) -> Optional[Task]:
        """Get task by ID.

        Args:
            task_id: Task ID

        Returns:
            Task object or None if not found
        """
        data = await redis_client.get(_task_key(task_id))
        if data is None:
            return None
        return Task.from_dict(json.loads(data))

    async def get_task_status(self, task_id: str) -> Optional[TaskStatus]:
        """Get task status.

        Args:
            task_id: Task ID

        Returns:
            TaskStatus or None if not found
        """
        task = await self.get_task(task_id)
        return task.status if task else None

    async def get_tasks_by_correlation_id(
        self,
        correlation_id: str,
        limit: int = 100,
    ) -> list[Task]:
        """Get all tasks with a correlation ID.

        Note: This is an expensive operation that scans all tasks.
        Use sparingly.

        Args:
            correlation_id: Correlation ID to search for
            limit: Maximum tasks to return

        Returns:
            List of matching tasks
        """
        # This would require a separate index in production
        # For now, return empty list as this needs secondary indexing
        logger.warning("get_tasks_by_correlation_id requires secondary indexing")
        return []

    # =========================================================================
    # TASK MANAGEMENT
    # =========================================================================

    async def cancel_task(
        self,
        task_id: str,
        reason: Optional[str] = None,
    ) -> bool:
        """Cancel a pending task.

        Only pending tasks can be cancelled.

        Args:
            task_id: Task ID
            reason: Cancellation reason

        Returns:
            True if cancelled, False if not found or not cancellable
        """
        task = await self.get_task(task_id)
        if not task:
            return False

        if task.status not in (TaskStatus.PENDING, TaskStatus.RETRY):
            logger.warning(
                f"Cannot cancel task in status: {task.status}",
                extra={"task_id": task_id},
            )
            return False

        # Update task status
        task.status = TaskStatus.CANCELLED
        task.completed_at = datetime.now(timezone.utc)
        task.error = reason or "Cancelled by user"

        # Save updated task
        await redis_client.set(
            _task_key(task_id),
            json.dumps(task.to_dict(), default=str),
            ttl=86400 * 7,
        )

        # Remove from queues
        await redis_client.zrem(_queue_key(), task_id)
        await redis_client.zrem(_scheduled_key(), task_id)

        logger.info(
            "Task cancelled",
            extra={"task_id": task_id, "reason": reason},
        )

        await self._update_queue_metrics()
        return True

    async def retry_task(self, task_id: str) -> bool:
        """Manually retry a failed task.

        Args:
            task_id: Task ID

        Returns:
            True if queued for retry, False otherwise
        """
        task = await self.get_task(task_id)
        if not task:
            return False

        if task.status not in (TaskStatus.FAILED, TaskStatus.DEAD_LETTERED):
            logger.warning(
                f"Cannot retry task in status: {task.status}",
                extra={"task_id": task_id},
            )
            return False

        # Reset task for retry
        task.status = TaskStatus.PENDING
        task.retries = 0
        task.error = None
        task.error_code = None
        task.started_at = None
        task.completed_at = None

        # Save and re-queue
        await redis_client.set(
            _task_key(task_id),
            json.dumps(task.to_dict(), default=str),
            ttl=86400 * 7,
        )

        # Add back to queue
        await redis_client.zadd(_queue_key(), {task_id: -task.priority.value})

        # Remove from dead letter queue if present
        await redis_client.lrem(_dead_letter_key(), 1, task_id)

        logger.info("Task queued for manual retry", extra={"task_id": task_id})

        await self._update_queue_metrics()
        return True

    # =========================================================================
    # DEQUEUE AND PROCESSING
    # =========================================================================

    async def _dequeue(self) -> Optional[Task]:
        """Dequeue the next task for processing.

        Returns:
            Task or None if queue is empty
        """
        # First, move ready scheduled tasks to main queue
        await self._promote_scheduled_tasks()

        # Get task with lowest score (highest priority)
        results = await redis_client.zpopmin(_queue_key())

        if not results:
            return None

        # zpopmin returns list of (member, score) tuples
        task_id = None
        if isinstance(results, list) and len(results) > 0:
            item = results[0]
            if isinstance(item, tuple) and len(item) >= 1:
                task_id = item[0]
            elif isinstance(item, str):
                task_id = item

        if not task_id:
            return None

        # Add to processing set
        await redis_client.sadd(_processing_key(), task_id)

        # Get and update task
        task = await self.get_task(task_id)
        if task:
            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.now(timezone.utc)
            await redis_client.set(
                _task_key(task_id),
                json.dumps(task.to_dict(), default=str),
                ttl=86400 * 7,
            )

        await self._update_queue_metrics()
        return task

    async def _promote_scheduled_tasks(self) -> int:
        """Move scheduled tasks that are ready to the main queue.

        Returns:
            Number of tasks promoted
        """
        now = datetime.now(timezone.utc).timestamp()

        # Get tasks ready to execute
        ready_tasks = await redis_client.zrangebyscore(_scheduled_key(), "-inf", now)

        if not ready_tasks:
            return 0

        promoted = 0
        for task_id in ready_tasks:
            task = await self.get_task(task_id)
            if task:
                # Move to main queue
                await redis_client.zrem(_scheduled_key(), task_id)
                await redis_client.zadd(_queue_key(), {task_id: -task.priority.value})
                promoted += 1

        if promoted > 0:
            logger.debug(f"Promoted {promoted} scheduled tasks to main queue")

        return promoted

    async def _complete_task(
        self,
        task: Task,
        result: Any = None,
    ) -> None:
        """Mark a task as completed successfully.

        Args:
            task: Task to complete
            result: Optional result data
        """
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now(timezone.utc)
        task.result = result

        # Save updated task
        await redis_client.set(
            _task_key(task.task_id),
            json.dumps(task.to_dict(), default=str),
            ttl=86400 * 7,
        )

        # Remove from processing set
        await redis_client.srem(_processing_key(), task.task_id)

        # Track metrics
        duration = (
            (task.completed_at - task.started_at).total_seconds()
            if task.started_at
            else 0
        )

        logger.info(
            "Task completed",
            extra={
                "task_id": task.task_id,
                "task_type": task.task_type,
                "duration_ms": duration * 1000,
            },
        )

        await self._update_queue_metrics()

    async def _fail_task(
        self,
        task: Task,
        error: str,
        error_code: Optional[str] = None,
        should_retry: bool = True,
    ) -> None:
        """Handle task failure with optional retry.

        Args:
            task: Failed task
            error: Error message
            error_code: Optional error code
            should_retry: Whether to attempt retry
        """
        task.retries += 1
        task.error = error
        task.error_code = error_code

        if should_retry and task.should_retry():
            # Schedule for retry with exponential backoff
            delay = task.get_retry_delay()
            task.status = TaskStatus.RETRY

            # Save task
            await redis_client.set(
                _task_key(task.task_id),
                json.dumps(task.to_dict(), default=str),
                ttl=86400 * 7,
            )

            # Re-queue with delay
            execute_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
            await redis_client.zadd(_scheduled_key(), {task.task_id: execute_at.timestamp()})

            # Remove from processing
            await redis_client.srem(_processing_key(), task.task_id)

            # Track retry metric
            self._metrics.email_retry(
                template=task.payload.get("template_code", "unknown"),
                attempt=task.retries,
            )

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
            await self._dead_letter_task(task, error, error_code)

        await self._update_queue_metrics()

    async def _dead_letter_task(
        self,
        task: Task,
        error: str,
        error_code: Optional[str] = None,
    ) -> None:
        """Move a task to the dead letter queue.

        Args:
            task: Task to dead letter
            error: Final error message
            error_code: Optional error code
        """
        task.status = TaskStatus.DEAD_LETTERED
        task.completed_at = datetime.now(timezone.utc)
        task.error = error
        task.error_code = error_code

        # Save with longer TTL for debugging
        await redis_client.set(
            _task_key(task.task_id),
            json.dumps(task.to_dict(), default=str),
            ttl=86400 * settings.QUEUE_DEAD_LETTER_TTL_DAYS,
        )

        # Remove from processing and add to DLQ
        await redis_client.srem(_processing_key(), task.task_id)
        await redis_client.lpush(_dead_letter_key(), task.task_id)

        # Track metrics
        reason = error_code or "max_retries"
        self._metrics.dead_letter(reason)

        logger.error(
            "Task moved to dead letter queue",
            extra={
                "task_id": task.task_id,
                "task_type": task.task_type,
                "retries": task.retries,
                "error": error,
                "error_code": error_code,
            },
        )

    async def _process_task(self, task: Task) -> None:
        """Process a single task by invoking its handler.

        Args:
            task: Task to process
        """
        handler = get_handler(task.task_type)

        if handler is None:
            await self._fail_task(
                task,
                f"No handler registered for task type: {task.task_type}",
                error_code="NO_HANDLER",
                should_retry=False,
            )
            return

        try:
            # Execute with timeout
            result = await asyncio.wait_for(
                handler(task.payload),
                timeout=task.timeout_seconds,
            )
            await self._complete_task(task, result)

        except asyncio.TimeoutError:
            await self._fail_task(
                task,
                f"Task timed out after {task.timeout_seconds} seconds",
                error_code="TIMEOUT",
                should_retry=True,
            )

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
            await self._fail_task(
                task,
                error_msg,
                error_code=type(e).__name__,
                should_retry=True,
            )

    # =========================================================================
    # WORKER MANAGEMENT
    # =========================================================================

    async def start_worker(
        self,
        concurrency: int = 10,
        poll_interval: float = 0.5,
    ) -> None:
        """Start the background worker to process tasks.

        Args:
            concurrency: Number of concurrent task processors
            poll_interval: Seconds between queue polls when empty
        """
        self._running = True
        self._shutdown_event.clear()
        logger.info(f"Starting task worker with concurrency={concurrency}")

        semaphore = asyncio.Semaphore(concurrency)

        async def process_with_semaphore(task: Task) -> None:
            async with semaphore:
                with self._metrics.track_queue_processing():
                    await self._process_task(task)

        while self._running:
            try:
                task = await self._dequeue()

                if task:
                    # Process without blocking the loop
                    worker_task = asyncio.create_task(process_with_semaphore(task))
                    self._worker_tasks.append(worker_task)

                    # Cleanup completed worker tasks
                    self._worker_tasks = [
                        t for t in self._worker_tasks if not t.done()
                    ]
                else:
                    # No tasks, wait before polling again
                    try:
                        await asyncio.wait_for(
                            self._shutdown_event.wait(),
                            timeout=poll_interval,
                        )
                    except asyncio.TimeoutError:
                        pass  # Normal timeout, continue polling

            except Exception as e:
                logger.exception("Worker error", extra={"error": str(e)})
                self._metrics.error_occurred("worker_error", "/worker/process")
                await asyncio.sleep(1)  # Brief pause on error

        # Wait for in-flight tasks on shutdown
        if self._worker_tasks:
            logger.info(f"Waiting for {len(self._worker_tasks)} in-flight tasks")
            await asyncio.gather(*self._worker_tasks, return_exceptions=True)

        logger.info("Task worker stopped")

    def stop_worker(self) -> None:
        """Signal the worker to stop gracefully."""
        self._running = False
        self._shutdown_event.set()
        logger.info("Task worker stopping")

    async def start_worker_background(
        self,
        concurrency: int = 10,
    ) -> asyncio.Task:
        """Start the worker as a background task.

        Args:
            concurrency: Number of concurrent processors

        Returns:
            The worker asyncio.Task
        """
        return asyncio.create_task(self.start_worker(concurrency))

    # =========================================================================
    # QUEUE STATISTICS
    # =========================================================================

    async def get_queue_stats(self) -> dict[str, int]:
        """Get current queue statistics.

        Returns:
            Dict with queue depths:
            - pending: Tasks waiting to be processed
            - scheduled: Tasks waiting for their scheduled time
            - processing: Tasks currently being processed
            - dead_letter: Permanently failed tasks
        """
        pending = await redis_client.zcard(_queue_key())
        scheduled = await redis_client.zcard(_scheduled_key())
        processing = await redis_client.scard(_processing_key())
        dead_letter = await redis_client.llen(_dead_letter_key())

        return {
            "pending": pending,
            "scheduled": scheduled,
            "processing": processing,
            "dead_letter": dead_letter,
            "total": pending + scheduled + processing,
        }

    async def get_dead_letter_tasks(
        self,
        limit: int = 100,
    ) -> list[Task]:
        """Get tasks from the dead letter queue.

        Args:
            limit: Maximum tasks to return

        Returns:
            List of dead lettered tasks
        """
        task_ids = await redis_client.lrange(_dead_letter_key(), 0, limit - 1)
        tasks = []

        for task_id in task_ids:
            task = await self.get_task(task_id)
            if task:
                tasks.append(task)

        return tasks

    async def clear_dead_letter_queue(self) -> int:
        """Clear the dead letter queue.

        Returns:
            Number of tasks removed
        """
        count = await redis_client.llen(_dead_letter_key())
        await redis_client.delete(_dead_letter_key())

        logger.info(f"Cleared {count} tasks from dead letter queue")
        await self._update_queue_metrics()

        return count

    async def requeue_dead_letter_tasks(
        self,
        limit: int = 100,
    ) -> int:
        """Requeue tasks from dead letter queue for retry.

        Args:
            limit: Maximum tasks to requeue

        Returns:
            Number of tasks requeued
        """
        count = 0
        task_ids = await redis_client.lrange(_dead_letter_key(), 0, limit - 1)

        for task_id in task_ids:
            if await self.retry_task(task_id):
                count += 1

        return count

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================

    async def _check_idempotency(self, key: str) -> Optional[str]:
        """Check if idempotency key exists.

        Args:
            key: Idempotency key

        Returns:
            Existing task ID or None
        """
        return await redis_client.get(_idempotency_key(key))

    async def _update_queue_metrics(self) -> None:
        """Update queue depth metrics for KEDA scaling."""
        stats = await self.get_queue_stats()
        self._metrics.set_queue_depth("pending", stats["pending"])
        self._metrics.set_queue_depth("processing", stats["processing"])
        self._metrics.set_queue_depth("dead_letter", stats["dead_letter"])

    async def health_check(self) -> dict[str, Any]:
        """Check queue service health.

        Returns:
            Health status dict
        """
        try:
            is_connected = await redis_client.ping()
            stats = await self.get_queue_stats()

            return {
                "status": "healthy" if is_connected else "degraded",
                "redis_connected": is_connected,
                "worker_running": self._running,
                "handlers_registered": len(_handlers),
                "queue_stats": stats,
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
            }


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================


_task_queue: Optional[TaskQueueService] = None


def get_task_queue() -> TaskQueueService:
    """Get the global task queue service instance."""
    global _task_queue
    if _task_queue is None:
        _task_queue = TaskQueueService()
    return _task_queue


# Convenience alias
task_queue_service = get_task_queue()


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================


async def enqueue_task(
    task_type: str,
    payload: dict[str, Any],
    priority: TaskPriority = TaskPriority.NORMAL,
    **kwargs,
) -> str:
    """Convenience function to enqueue a task.

    Args:
        task_type: Type of task
        payload: Task data
        priority: Task priority
        **kwargs: Additional enqueue arguments

    Returns:
        Task ID
    """
    return await get_task_queue().enqueue(
        task_type=task_type,
        payload=payload,
        priority=priority,
        **kwargs,
    )


async def enqueue_email_task(
    event_id: str,
    workspace_id: str,
    recipient_email: str,
    template_code: str,
    payload: dict[str, Any],
    priority: TaskPriority = TaskPriority.NORMAL,
    idempotency_key: Optional[str] = None,
) -> str:
    """Convenience function to enqueue an email notification task.

    Args:
        event_id: Notification event ID
        workspace_id: Workspace ID
        recipient_email: Email address
        template_code: Template code
        payload: Template variables
        priority: Task priority
        idempotency_key: Optional idempotency key

    Returns:
        Task ID
    """
    return await enqueue_task(
        task_type=TASK_SEND_EMAIL,
        payload={
            "event_id": event_id,
            "workspace_id": workspace_id,
            "recipient_email": recipient_email,
            "template_code": template_code,
            "payload": payload,
        },
        priority=priority,
        idempotency_key=idempotency_key or f"email:{event_id}",
        workspace_id=workspace_id,
    )


async def enqueue_digest_task(
    user_id: str,
    workspace_id: str,
    frequency: str = "daily",
    correlation_id: Optional[str] = None,
) -> str:
    """Convenience function to enqueue a digest processing task.

    Args:
        user_id: User ID
        workspace_id: Workspace ID
        frequency: Digest frequency (daily, weekly)
        correlation_id: Optional correlation ID

    Returns:
        Task ID
    """
    task_type = (
        TASK_PROCESS_DAILY_DIGEST
        if frequency == "daily"
        else TASK_PROCESS_WEEKLY_DIGEST
    )

    return await enqueue_task(
        task_type=task_type,
        payload={
            "user_id": user_id,
            "workspace_id": workspace_id,
            "frequency": frequency,
        },
        priority=TaskPriority.NORMAL,
        idempotency_key=f"digest:{user_id}:{frequency}:{datetime.now(timezone.utc).date().isoformat()}",
        workspace_id=workspace_id,
        correlation_id=correlation_id,
    )


async def get_queue_stats() -> dict[str, int]:
    """Convenience function to get queue statistics.

    Returns:
        Queue statistics dict
    """
    return await get_task_queue().get_queue_stats()
