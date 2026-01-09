"""Notifications API endpoints for the Notifications & Communication Microservice.

This module provides REST API endpoints for:
- Sending single and batch notifications
- Listing and filtering notifications
- Getting notification details and delivery logs
- Cancelling pending notifications
- Retrying failed notifications
- Getting notification statistics

All endpoints require JWT authentication and enforce workspace isolation.

Feature: Notifications & Communication Microservice
Task: T026 - Create notifications API router
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from src.log_config import get_logger
from src.middleware.auth import JWTPayload, get_current_user
from src.repositories.notification_repository import notification_repository
from src.schemas.notification import (
    DeliveryLogResponse,
    ErrorResponse,
    NotificationBatchCreateRequest,
    NotificationBatchCreateResponse,
    NotificationCancelRequest,
    NotificationCategory,
    NotificationChannel,
    NotificationCreateRequest,
    NotificationEventResponse,
    NotificationEventStatus,
    NotificationListResponse,
    NotificationRetryRequest,
    NotificationStatsResponse,
)
from src.services.notification_service import (
    DuplicateNotificationError,
    NotificationNotFoundError,
    NotificationPreferenceBlockedError,
    NotificationServiceError,
    notification_service,
)

logger = get_logger(__name__)


# =============================================================================
# Workspace Access Verification
# =============================================================================


async def verify_workspace_access(
    workspace_id: UUID,
    current_user: JWTPayload = Depends(get_current_user),
) -> UUID:
    """
    Verify user has access to the requested workspace.

    Args:
        workspace_id: Workspace ID from path
        current_user: JWT payload from auth

    Returns:
        UUID: Validated workspace ID

    Raises:
        HTTPException: 403 if user doesn't have access
    """
    if str(current_user.workspace_id) != str(workspace_id):
        logger.warning(
            "Workspace access denied",
            extra={
                "user_id": current_user.user_id,
                "requested_workspace": str(workspace_id),
                "user_workspace": current_user.workspace_id,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                error="WORKSPACE_ACCESS_DENIED",
                message="You do not have access to this workspace",
            ).model_dump(),
        )

    return workspace_id


# =============================================================================
# Router Configuration
# =============================================================================

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/notifications",
    tags=["notifications"],
)


# =============================================================================
# Send Notifications
# =============================================================================


@router.post(
    "",
    response_model=NotificationEventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a notification",
    description="Send a single notification to a recipient via the specified channel.",
)
async def send_notification(
    request: NotificationCreateRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> NotificationEventResponse:
    """
    Send a notification to a recipient.

    Creates a notification event and dispatches it through the appropriate channel
    (email, SMS, in-app, or push). Supports templates, scheduling, and idempotency.

    Args:
        request: Notification creation request with recipient, channel, and content
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        NotificationEventResponse: Created notification event

    Raises:
        HTTPException: 400 for validation errors, 409 for duplicates
    """
    try:
        event = await notification_service.send_notification(
            workspace_id=workspace_id,
            request=request,
            source_service="api",
        )

        logger.info(
            "Notification sent via API",
            extra={
                "event_id": str(event.event_id),
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
                "channel": request.channel.value,
                "category": request.category.value,
            },
        )

        return event

    except DuplicateNotificationError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )
    except NotificationPreferenceBlockedError as e:
        # Return success but with skipped status (preference blocked is not an error)
        logger.info(
            "Notification blocked by preferences",
            extra={
                "workspace_id": str(workspace_id),
                "reason": e.reason,
            },
        )
        # The service already creates a skipped event, so we should not reach here
        raise HTTPException(
            status_code=status.HTTP_200_OK,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )
    except NotificationServiceError as e:
        logger.error(
            "Notification send failed",
            extra={
                "workspace_id": str(workspace_id),
                "error_code": e.code,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )
    except Exception as e:
        logger.exception(
            "Unexpected error sending notification",
            extra={"workspace_id": str(workspace_id), "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="INTERNAL_ERROR",
                message="An unexpected error occurred",
            ).model_dump(),
        )


@router.post(
    "/batch",
    response_model=NotificationBatchCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send batch notifications",
    description="Send multiple notifications at once with optimized batch processing.",
)
async def send_batch_notifications(
    request: NotificationBatchCreateRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> NotificationBatchCreateResponse:
    """
    Send multiple notifications in a batch.

    Optimized for bulk operations like:
    - Gallery published to multiple clients
    - Marketing campaigns
    - Reminder notifications

    Args:
        request: Batch notification request with list of notifications
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        NotificationBatchCreateResponse: Results with created/failed counts
    """
    try:
        result = await notification_service.send_batch_notifications(
            workspace_id=workspace_id,
            request=request,
            source_service="api",
        )

        logger.info(
            "Batch notifications sent via API",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
                "total_requested": len(request.notifications),
                "created": result.created,
                "failed": result.failed,
            },
        )

        return result

    except Exception as e:
        logger.exception(
            "Batch notification send failed",
            extra={"workspace_id": str(workspace_id), "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="BATCH_SEND_FAILED",
                message="Failed to process batch notifications",
            ).model_dump(),
        )


# =============================================================================
# List & Get Notifications
# =============================================================================


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List notifications",
    description="List notifications with filtering and pagination.",
)
async def list_notifications(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[NotificationEventStatus] = Query(
        None, description="Filter by status"
    ),
    category: Optional[NotificationCategory] = Query(
        None, description="Filter by category"
    ),
    channel: Optional[NotificationChannel] = Query(
        None, description="Filter by channel"
    ),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    recipient_email: Optional[str] = Query(
        None, description="Filter by recipient email"
    ),
    created_after: Optional[datetime] = Query(
        None, description="Filter events created after this time"
    ),
    created_before: Optional[datetime] = Query(
        None, description="Filter events created before this time"
    ),
) -> NotificationListResponse:
    """
    List notifications for a workspace.

    Supports filtering by status, category, channel, event type, recipient,
    and time range. Results are paginated and sorted by creation time (newest first).

    Args:
        workspace_id: Workspace ID from path
        page: Page number (1-indexed)
        limit: Items per page (1-100)
        status: Optional status filter
        category: Optional category filter
        channel: Optional channel filter
        event_type: Optional event type filter
        recipient_email: Optional recipient email filter
        created_after: Optional filter for events after this time
        created_before: Optional filter for events before this time

    Returns:
        NotificationListResponse: Paginated list of notifications
    """
    events, meta = await notification_repository.list_notification_events(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        status=status,
        category=category,
        channel=channel,
        event_type=event_type,
        recipient_email=recipient_email,
        created_after=created_after,
        created_before=created_before,
    )

    logger.debug(
        "Notifications listed",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "page": page,
            "total": meta.total,
        },
    )

    return NotificationListResponse(data=events, meta=meta)


@router.get(
    "/{event_id}",
    response_model=NotificationEventResponse,
    summary="Get notification details",
    description="Get detailed information about a specific notification.",
)
async def get_notification(
    event_id: UUID = Path(..., description="Notification event ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> NotificationEventResponse:
    """
    Get notification event details.

    Args:
        event_id: Notification event ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        NotificationEventResponse: Full notification details

    Raises:
        HTTPException: 404 if notification not found
    """
    event = await notification_service.get_notification(
        workspace_id=workspace_id,
        event_id=event_id,
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="NOTIFICATION_NOT_FOUND",
                message=f"Notification {event_id} not found",
            ).model_dump(),
        )

    logger.debug(
        "Notification retrieved",
        extra={
            "event_id": str(event_id),
            "workspace_id": str(workspace_id),
        },
    )

    return event


@router.get(
    "/{event_id}/delivery-logs",
    response_model=list[DeliveryLogResponse],
    summary="Get delivery logs",
    description="Get delivery attempt logs for a notification.",
)
async def get_notification_delivery_logs(
    event_id: UUID = Path(..., description="Notification event ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> list[DeliveryLogResponse]:
    """
    Get delivery logs for a notification event.

    Returns all delivery attempts with provider responses, timestamps,
    and engagement tracking (opens, clicks).

    Args:
        event_id: Notification event ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        List of delivery log entries

    Raises:
        HTTPException: 404 if notification not found
    """
    # First verify the event exists
    event = await notification_service.get_notification(
        workspace_id=workspace_id,
        event_id=event_id,
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="NOTIFICATION_NOT_FOUND",
                message=f"Notification {event_id} not found",
            ).model_dump(),
        )

    logs = await notification_service.get_notification_delivery_logs(
        workspace_id=workspace_id,
        event_id=event_id,
    )

    logger.debug(
        "Delivery logs retrieved",
        extra={
            "event_id": str(event_id),
            "workspace_id": str(workspace_id),
            "log_count": len(logs),
        },
    )

    return logs


# =============================================================================
# Cancel & Retry Notifications
# =============================================================================


@router.post(
    "/{event_id}/cancel",
    response_model=NotificationEventResponse,
    summary="Cancel notification",
    description="Cancel a pending notification before it is sent.",
)
async def cancel_notification(
    request: NotificationCancelRequest,
    event_id: UUID = Path(..., description="Notification event ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> NotificationEventResponse:
    """
    Cancel a pending notification.

    Only notifications with status 'pending' can be cancelled.
    Already sent or processed notifications cannot be cancelled.

    Args:
        request: Cancel request with optional reason
        event_id: Notification event ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        NotificationEventResponse: Cancelled notification

    Raises:
        HTTPException: 404 if not found, 400 if not cancellable
    """
    cancelled = await notification_service.cancel_notification(
        workspace_id=workspace_id,
        event_id=event_id,
        reason=request.reason,
    )

    if not cancelled:
        # Check if event exists but is not cancellable
        event = await notification_service.get_notification(
            workspace_id=workspace_id,
            event_id=event_id,
        )

        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(
                    error="NOTIFICATION_NOT_FOUND",
                    message=f"Notification {event_id} not found",
                ).model_dump(),
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="NOTIFICATION_NOT_CANCELLABLE",
                    message=f"Notification {event_id} cannot be cancelled (status: {event.status.value})",
                ).model_dump(),
            )

    logger.info(
        "Notification cancelled",
        extra={
            "event_id": str(event_id),
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "reason": request.reason,
        },
    )

    return cancelled


@router.post(
    "/{event_id}/retry",
    response_model=NotificationEventResponse,
    summary="Retry notification",
    description="Retry sending a failed notification.",
)
async def retry_notification(
    request: NotificationRetryRequest,
    event_id: UUID = Path(..., description="Notification event ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> NotificationEventResponse:
    """
    Retry a failed notification.

    Requeues a failed notification for another delivery attempt.
    Optionally resets the retry counter.

    Args:
        request: Retry request with optional reset flag
        event_id: Notification event ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        NotificationEventResponse: Requeued notification

    Raises:
        HTTPException: 404 if not found, 400 if not retryable
    """
    # Get the notification first
    event = await notification_service.get_notification(
        workspace_id=workspace_id,
        event_id=event_id,
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="NOTIFICATION_NOT_FOUND",
                message=f"Notification {event_id} not found",
            ).model_dump(),
        )

    # Check if notification is retryable
    if event.status not in (
        NotificationEventStatus.FAILED,
        NotificationEventStatus.CANCELLED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="NOTIFICATION_NOT_RETRYABLE",
                message=f"Notification {event_id} cannot be retried (status: {event.status.value})",
            ).model_dump(),
        )

    # Increment retry count and reset to pending
    updated = await notification_repository.increment_retry_count(event_id)

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="MAX_RETRIES_EXCEEDED",
                message=f"Notification {event_id} has exceeded maximum retry attempts",
            ).model_dump(),
        )

    logger.info(
        "Notification queued for retry",
        extra={
            "event_id": str(event_id),
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "retry_count": updated.retry_count,
        },
    )

    return updated


# =============================================================================
# Statistics
# =============================================================================


@router.get(
    "/stats/overview",
    response_model=NotificationStatsResponse,
    summary="Get notification statistics",
    description="Get notification statistics and metrics for the workspace.",
)
async def get_notification_stats(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    period_start: Optional[datetime] = Query(
        None, description="Start of period for stats"
    ),
    period_end: Optional[datetime] = Query(
        None, description="End of period for stats"
    ),
) -> NotificationStatsResponse:
    """
    Get notification statistics for a workspace.

    Returns overall statistics and breakdown by category including:
    - Total sent, delivered, failed, pending counts
    - Per-channel statistics
    - Open and click rates

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user
        period_start: Optional start of reporting period
        period_end: Optional end of reporting period

    Returns:
        NotificationStatsResponse: Statistics with overall and category breakdown
    """
    overall = await notification_repository.get_notification_stats(
        workspace_id=workspace_id,
        period_start=period_start,
        period_end=period_end,
    )

    by_category = await notification_repository.get_stats_by_category(
        workspace_id=workspace_id,
        period_start=period_start,
        period_end=period_end,
    )

    logger.debug(
        "Notification stats retrieved",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "period_start": str(period_start) if period_start else None,
            "period_end": str(period_end) if period_end else None,
        },
    )

    return NotificationStatsResponse(
        overall=overall,
        by_category=by_category,
    )


# =============================================================================
# User Notifications (for current user)
# =============================================================================


@router.get(
    "/user/me",
    response_model=NotificationListResponse,
    summary="Get my notifications",
    description="Get notifications for the current authenticated user.",
)
async def get_my_notifications(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    channel: Optional[NotificationChannel] = Query(
        None, description="Filter by channel"
    ),
    unread_only: bool = Query(False, description="Only return unread notifications"),
) -> NotificationListResponse:
    """
    Get notifications for the current user.

    Returns notifications addressed to the authenticated user,
    useful for in-app notification feeds.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user
        page: Page number (1-indexed)
        limit: Items per page (1-100)
        channel: Optional channel filter
        unread_only: If true, only return unread/undelivered notifications

    Returns:
        NotificationListResponse: Paginated list of user's notifications
    """
    user_id = UUID(current_user.user_id)

    events, meta = await notification_repository.get_user_notifications(
        workspace_id=workspace_id,
        user_id=user_id,
        page=page,
        limit=limit,
        channel=channel,
        unread_only=unread_only,
    )

    logger.debug(
        "User notifications retrieved",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "page": page,
            "total": meta.total,
            "unread_only": unread_only,
        },
    )

    return NotificationListResponse(data=events, meta=meta)


# =============================================================================
# Correlated Notifications
# =============================================================================


@router.get(
    "/correlation/{correlation_id}",
    response_model=list[NotificationEventResponse],
    summary="Get correlated notifications",
    description="Get all notifications linked by a correlation ID.",
)
async def get_correlated_notifications(
    correlation_id: UUID = Path(..., description="Correlation ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> list[NotificationEventResponse]:
    """
    Get notifications linked by correlation ID.

    Useful for tracking related notifications, such as:
    - All notifications for a gallery publish event
    - All notifications in a marketing campaign
    - All reminders for an invitation

    Args:
        correlation_id: Correlation ID linking related notifications
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        List of correlated notification events
    """
    events = await notification_repository.get_events_by_correlation_id(
        workspace_id=workspace_id,
        correlation_id=correlation_id,
    )

    logger.debug(
        "Correlated notifications retrieved",
        extra={
            "workspace_id": str(workspace_id),
            "correlation_id": str(correlation_id),
            "count": len(events),
        },
    )

    return events
