"""
Webhook events and deliveries endpoints.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.schemas import (
    WebhookEventResponse,
    WebhookEventDetailResponse,
    WebhookDeliveryResponse,
    WebhookDeliveryDetailResponse,
    WebhookSubscriptionStats,
    PaginatedResponse,
)
from src.repositories import event_repository, delivery_repository
from src.middleware.auth import get_workspace_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get(
    "/events",
    response_model=PaginatedResponse[WebhookEventResponse],
    summary="List webhook events",
)
async def list_events(
    workspace_id: UUID = Depends(get_workspace_id),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    event_type: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
):
    """List webhook events with optional filtering."""
    # Support both page_size and limit for backward compatibility
    limit = page_size
    
    events, total = await event_repository.list_by_workspace(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        event_type=event_type,
        status=status,
        start_date=start_date,
        end_date=end_date,
    )

    total_pages = (total + limit - 1) // limit if total > 0 else 0

    return {
        "items": events,
        "total": total,
        "page": page,
        "page_size": limit,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
    }


@router.get(
    "/events/{event_id}",
    response_model=WebhookEventDetailResponse,
    summary="Get webhook event",
)
async def get_event(
    event_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """Get webhook event details including payload."""
    event = await event_repository.get_by_id(
        event_id=event_id,
        workspace_id=workspace_id,
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook event not found",
        )

    return event


@router.get(
    "/events/{event_id}/deliveries",
    response_model=PaginatedResponse[WebhookDeliveryResponse],
    summary="List event deliveries",
)
async def list_event_deliveries(
    event_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    """List all delivery attempts for an event with pagination."""
    # Support both page_size and limit for backward compatibility
    limit = page_size
    
    # Check if repository supports pagination
    # If not, we'll need to implement it or fetch all and paginate in memory
    deliveries = await delivery_repository.list_by_event(
        event_id=event_id,
        workspace_id=workspace_id,
    )
    
    # Paginate in memory if repository doesn't support it
    total = len(deliveries)
    start = (page - 1) * limit
    end = start + limit
    paginated_deliveries = deliveries[start:end]
    
    total_pages = (total + limit - 1) // limit if total > 0 else 0

    return {
        "items": paginated_deliveries,
        "total": total,
        "page": page,
        "page_size": limit,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
    }


@router.get(
    "/deliveries/{delivery_id}",
    response_model=WebhookDeliveryDetailResponse,
    summary="Get delivery details",
)
async def get_delivery(
    delivery_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """Get detailed delivery information including request/response."""
    delivery = await delivery_repository.get_by_id(
        delivery_id=delivery_id,
        workspace_id=workspace_id,
    )

    if not delivery:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook delivery not found",
        )

    return delivery


@router.post(
    "/deliveries/{delivery_id}/retry",
    response_model=WebhookDeliveryResponse,
    summary="Retry delivery",
)
async def retry_delivery(
    delivery_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """
    Manually retry a failed delivery.

    Only failed or exhausted deliveries can be retried.
    """
    success = await delivery_repository.reset_for_retry(
        delivery_id=delivery_id,
        workspace_id=workspace_id,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Delivery cannot be retried (may not exist or is not in failed state)",
        )

    # Get updated delivery
    delivery = await delivery_repository.get_by_id(
        delivery_id=delivery_id,
        workspace_id=workspace_id,
    )

    logger.info(f"Manually retrying delivery {delivery_id}")

    return delivery


@router.get(
    "/subscriptions/{subscription_id}/stats",
    response_model=WebhookSubscriptionStats,
    summary="Get subscription stats",
)
async def get_subscription_stats(
    subscription_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
    period: str = Query(default="24h", pattern="^(1h|24h|7d|30d)$"),
):
    """Get delivery statistics for a subscription."""
    # Parse period
    period_map = {
        "1h": timedelta(hours=1),
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }
    delta = period_map.get(period, timedelta(hours=24))
    start_time = datetime.now(timezone.utc) - delta

    stats = await delivery_repository.get_stats_for_subscription(
        subscription_id=subscription_id,
        workspace_id=workspace_id,
        start_time=start_time,
    )

    total = stats.get("total_deliveries", 0) or 0
    successful = stats.get("successful", 0) or 0

    return WebhookSubscriptionStats(
        subscription_id=subscription_id,
        period=period,
        total_events=total,  # Approximate
        total_deliveries=total,
        successful_deliveries=successful,
        failed_deliveries=stats.get("failed", 0) or 0,
        retried_deliveries=stats.get("retrying", 0) or 0,
        exhausted_deliveries=stats.get("exhausted", 0) or 0,
        success_rate=(successful / total * 100) if total > 0 else 0,
        avg_response_time_ms=stats.get("avg_duration", 0) or 0,
        p95_response_time_ms=stats.get("p95_duration", 0) or 0,
        last_delivery_at=stats.get("last_delivery"),
        last_success_at=stats.get("last_success"),
        last_failure_at=stats.get("last_failure"),
    )
