"""Task queue management API endpoints.

Provides monitoring and management for background tasks.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.dependencies.auth import require_platform_permission
from app.services.task_queue import (
    Task,
    TaskPriority,
    TaskStatus,
    get_task_queue,
)


router = APIRouter(prefix="/tasks", tags=["tasks"])

# Platform admin requirement
PlatformAdminRequired = Depends(require_platform_permission("platform:admin"))


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class QueueStatsResponse(BaseModel):
    """Queue statistics."""

    pending: int
    processing: int
    failed: int


class TaskResponse(BaseModel):
    """Task details response."""

    task_id: str
    task_type: str
    payload: dict[str, Any]
    priority: str
    status: str
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    retries: int
    max_retries: int
    error: str | None = None
    result: Any = None

    @classmethod
    def from_task(cls, task: Task) -> "TaskResponse":
        return cls(
            task_id=task.task_id,
            task_type=task.task_type,
            payload=task.payload,
            priority=task.priority.name,
            status=task.status.value,
            created_at=task.created_at,
            started_at=task.started_at,
            completed_at=task.completed_at,
            retries=task.retries,
            max_retries=task.max_retries,
            error=task.error,
            result=task.result,
        )


class EnqueueTaskRequest(BaseModel):
    """Request to enqueue a task."""

    task_type: str
    payload: dict[str, Any] = {}
    priority: str = "NORMAL"
    max_retries: int = 3
    delay_seconds: int = 0


class EnqueueTaskResponse(BaseModel):
    """Response after enqueueing a task."""

    task_id: str
    message: str


class RetryTaskResponse(BaseModel):
    """Response after retrying a failed task."""

    success: bool
    message: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/stats",
    response_model=QueueStatsResponse,
    summary="Get queue statistics",
    dependencies=[PlatformAdminRequired],
)
async def get_queue_stats() -> QueueStatsResponse:
    """Get task queue statistics.

    Requires platform admin role.
    """
    queue = get_task_queue()
    stats = await queue.get_queue_stats()
    return QueueStatsResponse(**stats)


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Get task details",
    dependencies=[PlatformAdminRequired],
)
async def get_task(task_id: str) -> TaskResponse:
    """Get task details by ID.

    Requires platform admin role.
    """
    queue = get_task_queue()
    task = await queue.get_task(task_id)

    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    return TaskResponse.from_task(task)


@router.post(
    "",
    response_model=EnqueueTaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enqueue a task",
    dependencies=[PlatformAdminRequired],
)
async def enqueue_task_endpoint(request: EnqueueTaskRequest) -> EnqueueTaskResponse:
    """Manually enqueue a task.

    Requires platform admin role.
    """
    try:
        priority = TaskPriority[request.priority.upper()]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid priority: {request.priority}. Must be one of: LOW, NORMAL, HIGH, CRITICAL",
        )

    queue = get_task_queue()
    task_id = await queue.enqueue(
        task_type=request.task_type,
        payload=request.payload,
        priority=priority,
        max_retries=request.max_retries,
        delay_seconds=request.delay_seconds,
    )

    return EnqueueTaskResponse(
        task_id=task_id,
        message=f"Task enqueued successfully",
    )


@router.post(
    "/{task_id}/retry",
    response_model=RetryTaskResponse,
    summary="Retry a failed task",
    dependencies=[PlatformAdminRequired],
)
async def retry_failed_task(task_id: str) -> RetryTaskResponse:
    """Manually retry a failed task.

    Requires platform admin role.
    """
    queue = get_task_queue()
    success = await queue.retry_failed_task(task_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task not found or not in failed state",
        )

    return RetryTaskResponse(
        success=True,
        message="Task scheduled for retry",
    )
