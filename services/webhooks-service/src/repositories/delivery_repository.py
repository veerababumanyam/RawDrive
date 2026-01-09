"""
Repository for webhook delivery data access.
"""

import json
import logging
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, timezone

from src.database import get_pool

logger = logging.getLogger(__name__)


class DeliveryRepository:
    """Data access layer for webhook deliveries."""

    async def get_by_id(
        self,
        delivery_id: UUID,
        workspace_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """Get delivery by ID."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM webhook_deliveries
                WHERE delivery_id = $1 AND workspace_id = $2
                """,
                delivery_id,
                workspace_id,
            )

            return dict(row) if row else None

    async def list_by_event(
        self,
        event_id: UUID,
        workspace_id: UUID,
    ) -> List[Dict[str, Any]]:
        """List all deliveries for an event."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM webhook_deliveries
                WHERE event_id = $1 AND workspace_id = $2
                ORDER BY created_at DESC
                """,
                event_id,
                workspace_id,
            )

            return [dict(row) for row in rows]

    async def list_by_subscription(
        self,
        subscription_id: UUID,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 50,
        status: Optional[str] = None,
    ) -> tuple[List[Dict[str, Any]], int]:
        """List deliveries for a subscription."""
        pool = await get_pool()
        offset = (page - 1) * limit

        where_clauses = ["subscription_id = $1", "workspace_id = $2"]
        params: List[Any] = [subscription_id, workspace_id]

        if status:
            where_clauses.append(f"status = ${len(params) + 1}")
            params.append(status)

        where_sql = " AND ".join(where_clauses)

        async with pool.acquire() as conn:
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) as total FROM webhook_deliveries WHERE {where_sql}",
                *params,
            )
            total = count_row["total"]

            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM webhook_deliveries
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}
                """,
                *params,
            )

            return [dict(row) for row in rows], total

    async def get_pending_deliveries(
        self,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Get deliveries ready for processing."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT d.*, s.secret_key, s.custom_headers, s.timeout_seconds
                FROM webhook_deliveries d
                JOIN webhook_subscriptions s ON d.subscription_id = s.subscription_id
                WHERE d.status IN ('pending', 'retrying')
                  AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW())
                  AND s.is_active = true
                ORDER BY d.created_at ASC
                LIMIT $1
                """,
                limit,
            )

            return [dict(row) for row in rows]

    async def get_stats_for_subscription(
        self,
        subscription_id: UUID,
        workspace_id: UUID,
        start_time: datetime,
    ) -> Dict[str, Any]:
        """Get delivery statistics for a subscription."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_deliveries,
                    COUNT(*) FILTER (WHERE status = 'succeeded') as successful,
                    COUNT(*) FILTER (WHERE status IN ('failed', 'exhausted')) as failed,
                    COUNT(*) FILTER (WHERE status = 'retrying') as retrying,
                    COUNT(*) FILTER (WHERE status = 'exhausted') as exhausted,
                    AVG(response_duration_ms) FILTER (WHERE response_duration_ms IS NOT NULL) as avg_duration,
                    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_duration_ms)
                        FILTER (WHERE response_duration_ms IS NOT NULL) as p95_duration,
                    MAX(created_at) FILTER (WHERE status = 'succeeded') as last_success,
                    MAX(created_at) FILTER (WHERE status IN ('failed', 'exhausted')) as last_failure,
                    MAX(created_at) as last_delivery
                FROM webhook_deliveries
                WHERE subscription_id = $1
                  AND workspace_id = $2
                  AND created_at >= $3
                """,
                subscription_id,
                workspace_id,
                start_time,
            )

            return dict(row) if row else {}

    async def reset_for_retry(
        self,
        delivery_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Reset a delivery for manual retry."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE webhook_deliveries
                SET status = 'pending',
                    next_retry_at = NULL,
                    error_code = NULL,
                    error_message = NULL,
                    updated_at = NOW()
                WHERE delivery_id = $1
                  AND workspace_id = $2
                  AND status IN ('failed', 'exhausted')
                """,
                delivery_id,
                workspace_id,
            )

            return "UPDATE 1" in result

    async def get_dlq_items(
        self,
        workspace_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[List[Dict[str, Any]], int]:
        """Get items from dead letter queue (exhausted deliveries)."""
        pool = await get_pool()
        offset = (page - 1) * limit

        where_clauses = ["status = 'exhausted'"]
        params: List[Any] = []

        if workspace_id:
            where_clauses.append(f"workspace_id = ${len(params) + 1}")
            params.append(workspace_id)

        where_sql = " AND ".join(where_clauses)

        async with pool.acquire() as conn:
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) as total FROM webhook_deliveries WHERE {where_sql}",
                *params,
            )
            total = count_row["total"]

            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM webhook_deliveries
                WHERE {where_sql}
                ORDER BY completed_at DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}
                """,
                *params,
            )

            return [dict(row) for row in rows], total


# Global singleton
delivery_repository = DeliveryRepository()
