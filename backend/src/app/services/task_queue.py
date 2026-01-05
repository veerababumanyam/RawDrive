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
from typing import Any, Callable, Coroutine, Optional

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
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    retries: int = 0
    max_retries: int = 3
    error: Optional[str] = None
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
# Task type constants
# ---------------------------------------------------------------------------

# Asset processing tasks
TASK_ASSET_PROCESS = "asset.process"
TASK_ASSET_CLEANUP = "asset.cleanup"
TASK_ASSET_EXTRACT_METADATA = "asset.extract_metadata"

# Face detection tasks
TASK_FACE_DETECTION = "face.detection"
TASK_FACE_CLUSTERING = "face.clustering"

# AI/Curation tasks (Feature: 023-enhanced-smart-curate)
TASK_CURATION_QUALITY_ANALYSIS = "curation.quality_analysis"
TASK_CURATION_SIMILARITY_GROUPING = "curation.similarity_grouping"
TASK_CURATION_SELECTION = "curation.selection"
TASK_CURATION_EMBEDDING_COMPUTE = "curation.embedding_compute"

# Invitation tasks
TASK_INVITATION_SEND = "invitation.send"
TASK_INVITATION_CLEANUP = "invitation.cleanup"


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


def get_handler(task_type: str) -> Optional[TaskHandler]:
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


@register_task_handler("send_rsvp_confirmation")
async def handle_rsvp_confirmation(payload: dict[str, Any]) -> dict[str, Any]:
    """Send RSVP confirmation email to guest.

    Feature: 016-save-the-date
    Task: T048 - RSVP confirmation emails

    Payload:
        - guest_email: Email address to send to
        - guest_name: Name for personalization
        - invitation_title: Title of the invitation
        - event_datetime: Event date/time for reference
        - attendance_status: attending/not_attending/maybe
        - edit_token: Token to edit RSVP
        - invitation_slug: Slug for link generation
    """
    # TODO: Implement actual email sending via SendGrid/SES/etc.
    # For now, log the email details
    logger.info(
        "RSVP confirmation email queued",
        extra={
            "to": payload.get("guest_email"),
            "guest_name": payload.get("guest_name"),
            "invitation_title": payload.get("invitation_title"),
            "attendance_status": payload.get("attendance_status"),
        },
    )

    # Simulate email content generation
    email_content = {
        "to": payload.get("guest_email"),
        "subject": f"RSVP Confirmation: {payload.get('invitation_title')}",
        "template": "rsvp_confirmation",
        "template_data": {
            "guest_name": payload.get("guest_name"),
            "invitation_title": payload.get("invitation_title"),
            "event_datetime": payload.get("event_datetime"),
            "attendance_status": payload.get("attendance_status"),
            "edit_link": f"/i/{payload.get('invitation_slug')}/rsvp/{payload.get('edit_token')}",
        },
    }

    return {"sent": True, "email": email_content}


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


@register_task_handler("refresh_tagging_stats")
async def handle_refresh_tagging_stats(payload: dict[str, Any]) -> dict[str, Any]:
    """Refresh the gallery_tagging_stats materialized view.

    Called by scheduler every 5 minutes to keep AI tagging health
    dashboard statistics up-to-date.
    """
    from app.db.postgres import get_postgres_pool

    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        # Call the CONCURRENTLY refresh function
        # This doesn't block reads on the materialized view
        await conn.execute("SELECT refresh_gallery_tagging_stats()")

    logger.info("Refreshed gallery_tagging_stats materialized view")
    return {"refreshed": True}


# ---------------------------------------------------------------------------
# RSVP Host Notification Handlers (T108-T111)
# ---------------------------------------------------------------------------


@register_task_handler("send_rsvp_host_notification")
async def handle_rsvp_host_notification(payload: dict[str, Any]) -> dict[str, Any]:
    """Send immediate RSVP notification to host.

    Feature: 016-save-the-date
    Task: T108 - RSVP host notifications (immediate mode)

    Payload:
        - invitation_id: The invitation ID
        - workspace_id: The workspace ID
        - host_email: Host's email address
        - invitation_title: Title of the invitation
        - guest_name: Name of the guest who RSVP'd
        - guest_email: Guest's email
        - attending: Whether guest is attending
        - party_size: Number of guests in party
        - rsvp_id: The RSVP ID
    """
    host_email = payload.get("host_email")
    guest_name = payload.get("guest_name")
    invitation_title = payload.get("invitation_title")
    attending = payload.get("attending", True)
    party_size = payload.get("party_size", 1)

    # Determine status text
    if attending:
        status_text = f"Yes, attending with {party_size} guest{'s' if party_size > 1 else ''}"
    else:
        status_text = "Not attending"

    # TODO: Implement actual email sending via SendGrid/SES/etc.
    logger.info(
        "Host RSVP notification sent (immediate)",
        extra={
            "to": host_email,
            "guest_name": guest_name,
            "invitation_title": invitation_title,
            "attending": attending,
            "party_size": party_size,
        },
    )

    email_content = {
        "to": host_email,
        "subject": f"New RSVP: {guest_name} - {invitation_title}",
        "template": "rsvp_host_immediate",
        "template_data": {
            "guest_name": guest_name,
            "invitation_title": invitation_title,
            "status_text": status_text,
            "party_size": party_size,
            "dashboard_link": f"/workspace/invitations/{payload.get('invitation_id')}",
        },
    }

    return {"sent": True, "email": email_content}


@register_task_handler("queue_rsvp_for_digest")
async def handle_queue_rsvp_for_digest(payload: dict[str, Any]) -> dict[str, Any]:
    """Queue RSVP for daily digest aggregation.

    Feature: 016-save-the-date
    Task: T109 - Daily digest aggregation

    Stores the RSVP data in Redis for batch processing.
    The scheduler will collect all RSVPs at 9 AM and send digest emails.

    Payload:
        - invitation_id: The invitation ID
        - workspace_id: The workspace ID
        - host_email: Host's email address
        - invitation_title: Title of the invitation
        - guest_name: Name of the guest who RSVP'd
        - guest_email: Guest's email
        - attending: Whether guest is attending
        - party_size: Number of guests in party
        - rsvp_id: The RSVP ID
    """
    from app.db.redis import get_redis_client
    import json

    redis = await get_redis_client()
    invitation_id = payload.get("invitation_id")

    # Store RSVP in a list keyed by invitation for batch processing
    digest_key = f"rsvp_digest:{invitation_id}"

    rsvp_data = {
        "guest_name": payload.get("guest_name"),
        "guest_email": payload.get("guest_email"),
        "attending": payload.get("attending"),
        "party_size": payload.get("party_size"),
        "rsvp_id": payload.get("rsvp_id"),
        "host_email": payload.get("host_email"),
        "invitation_title": payload.get("invitation_title"),
        "workspace_id": payload.get("workspace_id"),
    }

    await redis.rpush(digest_key, json.dumps(rsvp_data))
    # Set expiry to 48 hours (in case digest job fails, data persists)
    await redis.expire(digest_key, 172800)

    logger.info(
        "RSVP queued for daily digest",
        extra={
            "invitation_id": invitation_id,
            "guest_name": payload.get("guest_name"),
        },
    )

    return {"queued": True, "digest_key": digest_key}


@register_task_handler("send_rsvp_digest")
async def handle_send_rsvp_digest(payload: dict[str, Any]) -> dict[str, Any]:
    """Send daily RSVP digest email to host.

    Feature: 016-save-the-date
    Task: T109 - Daily digest email

    Called by the scheduler at 9 AM to process all queued RSVPs.

    Payload:
        - invitation_id: The invitation ID to process
    """
    from app.db.redis import get_redis_client
    import json

    redis = await get_redis_client()
    invitation_id = payload.get("invitation_id")
    digest_key = f"rsvp_digest:{invitation_id}"

    # Get all queued RSVPs
    rsvps_raw = await redis.lrange(digest_key, 0, -1)
    if not rsvps_raw:
        logger.debug(f"No RSVPs to digest for invitation {invitation_id}")
        return {"sent": False, "reason": "no_rsvps"}

    rsvps = [json.loads(r) for r in rsvps_raw]

    # Group by host email (should be same, but safety check)
    host_email = rsvps[0].get("host_email") if rsvps else None
    invitation_title = rsvps[0].get("invitation_title") if rsvps else "Your Event"

    if not host_email:
        logger.warning(f"No host email in digest data for invitation {invitation_id}")
        return {"sent": False, "reason": "no_host_email"}

    # Calculate summary stats
    attending_count = sum(1 for r in rsvps if r.get("attending"))
    not_attending_count = len(rsvps) - attending_count
    total_party_size = sum(r.get("party_size", 1) for r in rsvps if r.get("attending"))

    # TODO: Implement actual email sending via SendGrid/SES/etc.
    logger.info(
        "Daily RSVP digest sent",
        extra={
            "to": host_email,
            "invitation_title": invitation_title,
            "rsvp_count": len(rsvps),
            "attending": attending_count,
            "not_attending": not_attending_count,
        },
    )

    email_content = {
        "to": host_email,
        "subject": f"Daily RSVP Summary: {len(rsvps)} new response{'s' if len(rsvps) > 1 else ''} - {invitation_title}",
        "template": "rsvp_host_digest",
        "template_data": {
            "invitation_title": invitation_title,
            "rsvp_count": len(rsvps),
            "attending_count": attending_count,
            "not_attending_count": not_attending_count,
            "total_party_size": total_party_size,
            "rsvps": rsvps,
            "dashboard_link": f"/workspace/invitations/{invitation_id}",
        },
    }

    # Clear the digest queue after sending
    await redis.delete(digest_key)

    return {"sent": True, "email": email_content, "rsvp_count": len(rsvps)}


# ---------------------------------------------------------------------------
# Asset Metadata Extraction Handler (Phase 3.2 - Upload Performance)
# ---------------------------------------------------------------------------


@register_task_handler("asset.extract_metadata")
async def handle_extract_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    """Extract and store asset metadata in background.

    This handler is queued during upload to defer heavy metadata extraction
    from the upload response path, improving perceived upload speed.

    Extracts:
    - EXIF data (camera, settings, date taken, GPS)
    - Image dimensions (width, height)
    - Additional metadata (color profile, orientation)

    Payload:
        - asset_id: The asset UUID
        - workspace_id: The workspace UUID
        - original_object_key: R2 object key for the original file
        - mime_type: File MIME type
    """
    from uuid import UUID
    from app.db.postgres import get_postgres_pool
    from app.services.encryption_service import get_encryption_service
    from app.services.metadata_service import get_metadata_service
    from app.services.image_processing_service import get_image_processing_service
    from app.services.r2_storage_service import get_r2_storage_service

    asset_id = UUID(payload["asset_id"])
    workspace_id = UUID(payload["workspace_id"])
    original_object_key = payload["original_object_key"]
    mime_type = payload.get("mime_type", "image/jpeg")

    logger.info(
        "Extracting metadata for asset",
        extra={"asset_id": str(asset_id), "workspace_id": str(workspace_id)},
    )

    # Services
    r2_service = get_r2_storage_service()
    encryption_service = get_encryption_service()
    metadata_service = get_metadata_service()
    image_service = get_image_processing_service()

    try:
        # Download encrypted original from R2
        encrypted_data = await r2_service.download_file(original_object_key)

        if not encrypted_data:
            logger.error(f"Failed to download file for metadata extraction: {original_object_key}")
            return {"success": False, "error": "file_not_found"}

        # Decrypt file
        file_data = await encryption_service.decrypt_file(
            encrypted_data, workspace_id, asset_id, variant="original"
        )

        # Extract EXIF metadata
        metadata = None
        try:
            metadata = metadata_service.extract_metadata(
                file_data, workspace_id, strip_gps=False
            )
        except Exception as e:
            logger.warning(f"Failed to extract EXIF metadata for {asset_id}: {e}")

        # Get image dimensions
        width, height = None, None
        try:
            width, height = image_service.get_image_dimensions(file_data)
        except Exception as e:
            logger.warning(f"Failed to get dimensions for {asset_id}: {e}")

        # Update asset record with extracted metadata
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build update query dynamically based on what was extracted
            updates = []
            params = []
            param_idx = 1

            if metadata is not None:
                updates.append(f"exif = ${param_idx}")
                params.append(metadata)
                param_idx += 1

            if width is not None and height is not None:
                updates.append(f"width = ${param_idx}")
                params.append(width)
                param_idx += 1
                updates.append(f"height = ${param_idx}")
                params.append(height)
                param_idx += 1

            if updates:
                updates.append(f"updated_at = NOW()")
                query = f"""
                    UPDATE assets
                    SET {', '.join(updates)}
                    WHERE asset_id = ${param_idx}
                """
                params.append(asset_id)
                await conn.execute(query, *params)

        logger.info(
            "Metadata extraction complete",
            extra={
                "asset_id": str(asset_id),
                "has_exif": metadata is not None,
                "dimensions": f"{width}x{height}" if width else None,
            },
        )

        # Emit WebSocket event to notify frontend that metadata is ready
        try:
            from app.services.websocket_service import emit_asset_updated
            await emit_asset_updated(workspace_id, asset_id, {
                "metadata_extracted": True,
                "width": width,
                "height": height,
            })
        except Exception as e:
            logger.debug(f"Failed to emit metadata update event: {e}")

        return {
            "success": True,
            "has_metadata": metadata is not None,
            "width": width,
            "height": height,
        }

    except Exception as e:
        logger.exception(f"Metadata extraction failed for {asset_id}")
        return {"success": False, "error": str(e)}
