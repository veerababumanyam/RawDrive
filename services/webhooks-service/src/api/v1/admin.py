"""
Admin endpoints for platform-wide webhook management.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.schemas import (
    AdminWebhookStats,
    DeadLetterQueueItem,
    WebhookDeliveryResponse,
    PaginatedResponse,
)
from src.repositories import delivery_repository
from src.cache.redis_client import redis_client
from src.middleware.auth import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin/webhooks",
    tags=["admin-webhooks"],
    dependencies=[Depends(require_admin)],
)


@router.get(
    "/stats",
    response_model=AdminWebhookStats,
    summary="Get platform webhook stats",
)
async def get_platform_stats(
    period: str = Query(default="24h", pattern="^(1h|24h|7d|30d)$"),
):
    """
    Get platform-wide webhook statistics.

    Requires admin privileges.
    """
    from src.database import get_pool

    period_map = {
        "1h": timedelta(hours=1),
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }
    delta = period_map.get(period, timedelta(hours=24))
    start_time = datetime.now(timezone.utc) - delta

    pool = await get_pool()

    async with pool.acquire() as conn:
        # Get subscription counts
        sub_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_active = true) as active
            FROM webhook_subscriptions
            """
        )

        # Get delivery stats
        delivery_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'succeeded') as succeeded,
                COUNT(*) FILTER (WHERE status IN ('failed', 'exhausted')) as failed,
                COUNT(*) FILTER (WHERE status = 'exhausted') as exhausted,
                AVG(response_duration_ms) FILTER (WHERE response_duration_ms IS NOT NULL) as avg_duration,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_duration_ms)
                    FILTER (WHERE response_duration_ms IS NOT NULL) as p95_duration
            FROM webhook_deliveries
            WHERE created_at >= $1
            """,
            start_time,
        )

        # Get event count
        event_count = await conn.fetchval(
            "SELECT COUNT(*) FROM webhook_events WHERE created_at >= $1",
            start_time,
        )

        # Get deliveries by status
        status_rows = await conn.fetch(
            """
            SELECT status, COUNT(*) as count
            FROM webhook_deliveries
            WHERE created_at >= $1
            GROUP BY status
            """,
            start_time,
        )

        # Get deliveries by event type
        type_rows = await conn.fetch(
            """
            SELECT event_type, COUNT(*) as count
            FROM webhook_deliveries
            WHERE created_at >= $1
            GROUP BY event_type
            ORDER BY count DESC
            LIMIT 10
            """,
            start_time,
        )

    # Get DLQ size from database
    dlq_items, dlq_total = await delivery_repository.get_dlq_items(limit=1)

    total = delivery_stats["total"] or 0
    succeeded = delivery_stats["succeeded"] or 0

    return AdminWebhookStats(
        period=period,
        total_subscriptions=sub_stats["total"],
        active_subscriptions=sub_stats["active"],
        total_events=event_count,
        total_deliveries=total,
        successful_deliveries=succeeded,
        failed_deliveries=delivery_stats["failed"] or 0,
        exhausted_deliveries=delivery_stats["exhausted"] or 0,
        success_rate=(succeeded / total * 100) if total > 0 else 0,
        avg_response_time_ms=float(delivery_stats["avg_duration"] or 0),
        p95_response_time_ms=float(delivery_stats["p95_duration"] or 0),
        dlq_size=dlq_total,
        deliveries_by_status=[
            {"status": row["status"], "count": row["count"]}
            for row in status_rows
        ],
        deliveries_by_event_type=[
            {"event_type": row["event_type"], "count": row["count"]}
            for row in type_rows
        ],
        circuit_breakers_open=0,  # Would need to scan Redis
    )


@router.get(
    "/dead-letter-queue",
    response_model=PaginatedResponse[DeadLetterQueueItem],
    summary="List dead letter queue",
)
async def list_dead_letter_queue(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    workspace_id: Optional[UUID] = None,
):
    """
    List items in the dead letter queue.

    These are deliveries that exhausted all retry attempts.
    Requires admin privileges.
    """
    # Support both page_size and limit for backward compatibility
    limit = page_size
    
    items, total = await delivery_repository.get_dlq_items(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
    )

    # Transform to DLQ item format
    dlq_items = [
        DeadLetterQueueItem(
            delivery_id=item["delivery_id"],
            event_id=item["event_id"],
            subscription_id=item["subscription_id"],
            workspace_id=item["workspace_id"],
            endpoint_url=item["request_url"],
            event_type=item["event_type"],
            last_error=item.get("error_message", "Unknown error"),
            attempts=item["attempt_number"],
            exhausted_at=item["completed_at"],
        )
        for item in items
    ]

    total_pages = (total + limit - 1) // limit if total > 0 else 0

    return {
        "items": dlq_items,
        "total": total,
        "page": page,
        "page_size": limit,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
    }


@router.post(
    "/dead-letter-queue/{delivery_id}/replay",
    response_model=WebhookDeliveryResponse,
    summary="Replay DLQ item",
)
async def replay_dlq_item(
    delivery_id: UUID,
):
    """
    Replay an item from the dead letter queue.

    Resets the delivery for another attempt.
    Requires admin privileges.
    """
    from src.database import get_pool

    pool = await get_pool()

    # Get delivery to find workspace
    async with pool.acquire() as conn:
        delivery = await conn.fetchrow(
            "SELECT * FROM webhook_deliveries WHERE delivery_id = $1",
            delivery_id,
        )

    if not delivery:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Delivery not found",
        )

    if delivery["status"] != "exhausted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Delivery is not in exhausted state",
        )

    # Reset for retry
    success = await delivery_repository.reset_for_retry(
        delivery_id=delivery_id,
        workspace_id=delivery["workspace_id"],
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset delivery",
        )

    # Get updated delivery
    updated = await delivery_repository.get_by_id(
        delivery_id=delivery_id,
        workspace_id=delivery["workspace_id"],
    )

    logger.info(f"Admin replayed DLQ item {delivery_id}")

    return updated
