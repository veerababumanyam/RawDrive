"""Face Rate Limit Dependencies.

FastAPI dependencies for enforcing face operation rate limits.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: SEC-001 - Rate Limiting for Face Detection

Tasks: T012-T016
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status

from app.api.dependencies.auth import get_workspace_id
from app.repositories.face_rate_limit_repository import (
    get_face_rate_limit_repository,
    FaceRateLimitConfigRepository,
)
from app.services.rate_limit_service import (
    RateLimitConfig,
    RateLimitService,
    RateLimitType,
)
from app.services.audit_service import AuditEventType, get_audit_service

logger = logging.getLogger(__name__)


class FaceRateLimitError(HTTPException):
    """Rate limit exceeded error with metadata."""

    def __init__(
        self,
        operation: str,
        limit: int,
        retry_after: int,
        is_daily_quota: bool = False,
    ):
        detail = {
            "error": "face_rate_limit_exceeded",
            "message": f"Face {operation} rate limit exceeded. Please try again later.",
            "limit": limit,
            "retry_after": retry_after,
            "is_daily_quota": is_daily_quota,
        }
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )


async def _check_face_rate_limit(
    workspace_id: UUID,
    limit_type: RateLimitType,
    operation_name: str,
    rate_limit_repo: FaceRateLimitConfigRepository,
) -> None:
    """Internal helper to check rate limits.

    Args:
        workspace_id: Workspace ID
        limit_type: Type of rate limit to check
        operation_name: Human-readable operation name for errors
        rate_limit_repo: Rate limit repository instance

    Raises:
        FaceRateLimitError: If rate limit exceeded
    """
    # Get workspace-specific limits
    limits = await rate_limit_repo.get_effective_limits(workspace_id)

    # Map limit types to config values
    limit_map = {
        RateLimitType.FACE_SEARCH: ("face_search_rpm", 60),  # requests, window_seconds
        RateLimitType.FACE_DETECT: ("face_detection_daily_quota", 86400),
        RateLimitType.FACE_BULK: ("bulk_operations_rpm", 60),
    }

    limit_key, window = limit_map.get(limit_type, ("face_search_rpm", 60))
    limit_value = limits.get(limit_key, 20)

    # Create custom config with workspace-specific limit
    custom_config = RateLimitConfig(requests=limit_value, window_seconds=window)

    # Check rate limit
    service = RateLimitService()
    identifier = f"workspace:{workspace_id}"
    result = await service.check_rate_limit(identifier, limit_type, custom_config)

    if not result.allowed:
        # Log rate limit exceeded event
        try:
            audit_service = get_audit_service()
            await audit_service.log_event(
                event_type=AuditEventType.FACE_RATE_LIMIT_EXCEEDED,
                workspace_id=workspace_id,
                details={
                    "operation": operation_name,
                    "limit_type": limit_type.value,
                    "limit": limit_value,
                    "retry_after": result.retry_after,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to log rate limit audit event: {e}")

        is_daily = limit_type == RateLimitType.FACE_DETECT
        raise FaceRateLimitError(
            operation=operation_name,
            limit=limit_value,
            retry_after=result.retry_after or window,
            is_daily_quota=is_daily,
        )


async def check_face_search_rate_limit(
    workspace_id: UUID = Depends(get_workspace_id),
    rate_limit_repo: FaceRateLimitConfigRepository = Depends(get_face_rate_limit_repository),
) -> None:
    """Dependency to check face search rate limit.

    Usage:
        @router.post("/faces/search")
        async def search_faces(
            workspace_id: UUID,
            _: None = Depends(check_face_search_rate_limit),
        ):
            ...

    Args:
        workspace_id: Workspace ID
        rate_limit_repo: Injected repository

    Raises:
        FaceRateLimitError: If rate limit exceeded
    """
    await _check_face_rate_limit(
        workspace_id=workspace_id,
        limit_type=RateLimitType.FACE_SEARCH,
        operation_name="search",
        rate_limit_repo=rate_limit_repo,
    )


async def check_face_detect_rate_limit(
    workspace_id: UUID = Depends(get_workspace_id),
    rate_limit_repo: FaceRateLimitConfigRepository = Depends(get_face_rate_limit_repository),
) -> None:
    """Dependency to check face detection rate limit (daily quota).

    Usage:
        @router.post("/photos/{photo_id}/detect-faces")
        async def detect_faces(
            photo_id: UUID,
            workspace_id: UUID,
            _: None = Depends(check_face_detect_rate_limit),
        ):
            ...

    Args:
        workspace_id: Workspace ID
        rate_limit_repo: Injected repository

    Raises:
        FaceRateLimitError: If daily quota exceeded
    """
    # Also check database-tracked daily quota
    within_quota, current, limit = await rate_limit_repo.check_daily_quota(workspace_id)

    if not within_quota:
        # Log quota exhausted event
        try:
            audit_service = get_audit_service()
            await audit_service.log_event(
                event_type=AuditEventType.FACE_QUOTA_EXHAUSTED,
                workspace_id=workspace_id,
                details={
                    "operation": "detect",
                    "current_count": current,
                    "quota_limit": limit,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to log quota exhausted audit event: {e}")

        raise FaceRateLimitError(
            operation="detection",
            limit=limit,
            retry_after=86400,  # 24 hours
            is_daily_quota=True,
        )

    # Also check minute-level rate limit
    await _check_face_rate_limit(
        workspace_id=workspace_id,
        limit_type=RateLimitType.FACE_DETECT,
        operation_name="detection",
        rate_limit_repo=rate_limit_repo,
    )


async def check_face_bulk_rate_limit(
    workspace_id: UUID = Depends(get_workspace_id),
    rate_limit_repo: FaceRateLimitConfigRepository = Depends(get_face_rate_limit_repository),
) -> None:
    """Dependency to check bulk face operations rate limit.

    Usage:
        @router.post("/faces/bulk-assign")
        async def bulk_assign_faces(
            workspace_id: UUID,
            _: None = Depends(check_face_bulk_rate_limit),
        ):
            ...

    Args:
        workspace_id: Workspace ID
        rate_limit_repo: Injected repository

    Raises:
        FaceRateLimitError: If rate limit exceeded
    """
    await _check_face_rate_limit(
        workspace_id=workspace_id,
        limit_type=RateLimitType.FACE_BULK,
        operation_name="bulk operation",
        rate_limit_repo=rate_limit_repo,
    )


async def check_face_group_merge_rate_limit(
    workspace_id: UUID = Depends(get_workspace_id),
    rate_limit_repo: FaceRateLimitConfigRepository = Depends(get_face_rate_limit_repository),
) -> None:
    """Dependency to check face group merge rate limit.

    Uses FACE_BULK rate limit type with group_merge_rpm config.

    Args:
        workspace_id: Workspace ID
        rate_limit_repo: Injected repository

    Raises:
        FaceRateLimitError: If rate limit exceeded
    """
    # Get workspace-specific limits
    limits = await rate_limit_repo.get_effective_limits(workspace_id)
    limit_value = limits.get("group_merge_rpm", 10)

    # Create custom config
    custom_config = RateLimitConfig(requests=limit_value, window_seconds=60)

    # Use a separate identifier to track merge operations separately
    service = RateLimitService()
    identifier = f"workspace:{workspace_id}:merge"
    result = await service.check_rate_limit(identifier, RateLimitType.FACE_BULK, custom_config)

    if not result.allowed:
        raise FaceRateLimitError(
            operation="group merge",
            limit=limit_value,
            retry_after=result.retry_after or 60,
            is_daily_quota=False,
        )


async def increment_face_detection_count(
    workspace_id: UUID,
    count: int = 1,
    rate_limit_repo: FaceRateLimitConfigRepository = Depends(get_face_rate_limit_repository),
) -> int:
    """Increment the daily face detection count after successful detection.

    Should be called after faces are successfully detected.

    Args:
        workspace_id: Workspace ID
        count: Number of faces detected
        rate_limit_repo: Injected repository

    Returns:
        New total daily detection count
    """
    return await rate_limit_repo.increment_daily_detections(workspace_id, count)


# ---------------------------------------------------------------------------
# Dependency Factory Functions
# ---------------------------------------------------------------------------


def get_face_search_rate_limiter(workspace_id: UUID):
    """Create a face search rate limit dependency for a specific workspace.

    Usage:
        @router.post("/faces/search")
        async def search_faces(
            workspace_id: UUID = Query(...),
        ):
            await check_face_search_rate_limit(workspace_id)
            ...
    """
    async def dependency(
        rate_limit_repo: FaceRateLimitConfigRepository = Depends(get_face_rate_limit_repository),
    ):
        await check_face_search_rate_limit(workspace_id, rate_limit_repo)

    return dependency


def get_face_detect_rate_limiter(workspace_id: UUID):
    """Create a face detection rate limit dependency for a specific workspace."""
    async def dependency(
        rate_limit_repo: FaceRateLimitConfigRepository = Depends(get_face_rate_limit_repository),
    ):
        await check_face_detect_rate_limit(workspace_id, rate_limit_repo)

    return dependency


def get_face_bulk_rate_limiter(workspace_id: UUID):
    """Create a bulk operations rate limit dependency for a specific workspace."""
    async def dependency(
        rate_limit_repo: FaceRateLimitConfigRepository = Depends(get_face_rate_limit_repository),
    ):
        await check_face_bulk_rate_limit(workspace_id, rate_limit_repo)

    return dependency
