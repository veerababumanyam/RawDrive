"""
Webhook Repository for Gallery Service.

Handles database operations for webhook subscriptions, deliveries, and events.
Provides optimized queries for webhook management and monitoring.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy import select, update, delete, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class WebhookRepository:
    """
    Repository for webhook-related database operations.

    Provides methods for:
    - Querying webhook subscriptions
    - Managing delivery records
    - Computing webhook metrics
    - Handling retry queues
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize repository.

        Args:
            db: Database session
        """
        self.db = db

    async def get_active_subscriptions(
        self,
        workspace_id: UUID,
        event_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get active webhook subscriptions for a workspace.

        Args:
            workspace_id: Workspace to query
            event_type: Optional event type filter

        Returns:
            List of subscription dictionaries
        """
        query = """
        SELECT
            s.subscription_id,
            s.workspace_id,
            s.name,
            s.description,
            s.endpoint_url,
            s.http_method,
            s.event_types,
            s.event_filters,
            s.is_active,
            s.include_payload,
            s.payload_version,
            s.custom_headers,
            s.max_retries,
            s.timeout_seconds,
            s.rate_limit_per_minute,
            s.created_at,
            s.updated_at
        FROM webhook_subscriptions s
        WHERE s.workspace_id = :workspace_id
        AND s.is_active = true
        """

        params = {"workspace_id": workspace_id}

        if event_type:
            query += " AND :event_type = ANY(s.event_types)"
            params["event_type"] = event_type

        query += " ORDER BY s.created_at ASC"

        result = await self.db.execute(query, params)
        rows = result.fetchall()

        subscriptions = []
        for row in rows:
            subscriptions.append({
                "subscription_id": row.subscription_id,
                "workspace_id": row.workspace_id,
                "name": row.name,
                "description": row.description,
                "endpoint_url": row.endpoint_url,
                "http_method": row.http_method,
                "event_types": row.event_types,
                "event_filters": row.event_filters,
                "is_active": row.is_active,
                "include_payload": row.include_payload,
                "payload_version": row.payload_version,
                "custom_headers": row.custom_headers,
                "max_retries": row.max_retries,
                "timeout_seconds": row.timeout_seconds,
                "rate_limit_per_minute": row.rate_limit_per_minute,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            })

        return subscriptions

    async def get_subscription_by_id(
        self,
        subscription_id: UUID,
        workspace_id: UUID
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific subscription by ID.

        Args:
            subscription_id: Subscription ID
            workspace_id: Workspace for authorization

        Returns:
            Subscription dict or None
        """
        query = """
        SELECT
            s.subscription_id,
            s.workspace_id,
            s.name,
            s.description,
            s.endpoint_url,
            s.http_method,
            s.event_types,
            s.event_filters,
            s.is_active,
            s.include_payload,
            s.payload_version,
            s.custom_headers,
            s.max_retries,
            s.timeout_seconds,
            s.rate_limit_per_minute,
            s.created_at,
            s.updated_at
        FROM webhook_subscriptions s
        WHERE s.subscription_id = :subscription_id
        AND s.workspace_id = :workspace_id
        """

        result = await self.db.execute(
            query,
            {
                "subscription_id": subscription_id,
                "workspace_id": workspace_id,
            }
        )
        row = result.fetchone()

        if not row:
            return None

        return {
            "subscription_id": row.subscription_id,
            "workspace_id": row.workspace_id,
            "name": row.name,
            "description": row.description,
            "endpoint_url": row.endpoint_url,
            "http_method": row.http_method,
            "event_types": row.event_types,
            "event_filters": row.event_filters,
            "is_active": row.is_active,
            "include_payload": row.include_payload,
            "payload_version": row.payload_version,
            "custom_headers": row.custom_headers,
            "max_retries": row.max_retries,
            "timeout_seconds": row.timeout_seconds,
            "rate_limit_per_minute": row.rate_limit_per_minute,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    async def create_delivery_record(
        self,
        delivery_id: UUID,
        event_id: UUID,
        subscription_id: UUID,
        workspace_id: UUID,
        event_type: str,
        status: str = "pending",
        circuit_breaker_blocked: bool = False
    ) -> None:
        """
        Create a new delivery record.

        Args:
            delivery_id: Unique delivery ID
            event_id: Associated event ID
            subscription_id: Target subscription ID
            workspace_id: Workspace ID
            event_type: Event type being delivered
            status: Initial status
            circuit_breaker_blocked: Whether blocked by circuit breaker
        """
        query = """
        INSERT INTO webhook_deliveries (
            delivery_id, event_id, subscription_id, workspace_id,
            event_type, status, circuit_breaker_blocked,
            attempt_number, max_attempts
        ) VALUES (
            :delivery_id, :event_id, :subscription_id, :workspace_id,
            :event_type, :status, :circuit_breaker_blocked,
            1, 5
        )
        """

        await self.db.execute(
            query,
            {
                "delivery_id": delivery_id,
                "event_id": event_id,
                "subscription_id": subscription_id,
                "workspace_id": workspace_id,
                "event_type": event_type,
                "status": status,
                "circuit_breaker_blocked": circuit_breaker_blocked,
            }
        )
        await self.db.commit()

    async def update_delivery_status(
        self,
        delivery_id: UUID,
        status: str,
        attempt_number: Optional[int] = None,
        response_status_code: Optional[int] = None,
        response_duration_ms: Optional[int] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        next_retry_at: Optional[datetime] = None
    ) -> None:
        """
        Update delivery record status.

        Args:
            delivery_id: Delivery ID to update
            status: New status
            attempt_number: Current attempt number
            response_status_code: HTTP response status
            response_duration_ms: Response duration
            error_code: Error classification
            error_message: Error description
            next_retry_at: Next retry timestamp
        """
        updates = {
            "status": status,
            "updated_at": datetime.utcnow(),
        }

        if attempt_number is not None:
            updates["attempt_number"] = attempt_number

        if response_status_code is not None:
            updates["response_status_code"] = response_status_code

        if response_duration_ms is not None:
            updates["response_duration_ms"] = response_duration_ms

        if error_code is not None:
            updates["error_code"] = error_code

        if error_message is not None:
            updates["error_message"] = error_message

        if next_retry_at is not None:
            updates["next_retry_at"] = next_retry_at

        if status in ["succeeded", "failed", "exhausted"]:
            updates["completed_at"] = datetime.utcnow()

        if status == "in_progress":
            updates["request_timestamp"] = datetime.utcnow()

        if status in ["succeeded", "failed"]:
            updates["response_timestamp"] = datetime.utcnow()

        # Build dynamic UPDATE query
        set_clauses = [f"{k} = :{k}" for k in updates.keys()]
        query = f"""
        UPDATE webhook_deliveries
        SET {', '.join(set_clauses)}
        WHERE delivery_id = :delivery_id
        """

        params = {**updates, "delivery_id": delivery_id}

        await self.db.execute(query, params)
        await self.db.commit()

    async def get_pending_deliveries(
        self,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get deliveries pending retry.

        Args:
            limit: Maximum number of deliveries to return

        Returns:
            List of delivery dictionaries
        """
        query = """
        SELECT
            d.delivery_id,
            d.event_id,
            d.subscription_id,
            d.workspace_id,
            d.event_type,
            d.status,
            d.attempt_number,
            d.max_attempts,
            d.next_retry_at,
            d.error_code,
            d.error_message,
            d.created_at
        FROM webhook_deliveries d
        WHERE d.status IN ('pending', 'retrying')
        AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW())
        ORDER BY d.created_at ASC
        LIMIT :limit
        """

        result = await self.db.execute(query, {"limit": limit})
        rows = result.fetchall()

        deliveries = []
        for row in rows:
            deliveries.append({
                "delivery_id": row.delivery_id,
                "event_id": row.event_id,
                "subscription_id": row.subscription_id,
                "workspace_id": row.workspace_id,
                "event_type": row.event_type,
                "status": row.status,
                "attempt_number": row.attempt_number,
                "max_attempts": row.max_attempts,
                "next_retry_at": row.next_retry_at,
                "error_code": row.error_code,
                "error_message": row.error_message,
                "created_at": row.created_at,
            })

        return deliveries

    async def get_delivery_history(
        self,
        workspace_id: UUID,
        subscription_id: Optional[UUID] = None,
        event_id: Optional[UUID] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get delivery history with filters.

        Args:
            workspace_id: Workspace to query
            subscription_id: Optional subscription filter
            event_id: Optional event filter
            limit: Max results
            offset: Pagination offset

        Returns:
            List of delivery records
        """
        query = """
        SELECT
            d.delivery_id,
            d.event_id,
            d.subscription_id,
            d.event_type,
            d.status,
            d.attempt_number,
            d.response_status_code,
            d.response_duration_ms,
            d.error_code,
            d.error_message,
            d.created_at,
            d.completed_at
        FROM webhook_deliveries d
        WHERE d.workspace_id = :workspace_id
        """

        params = {"workspace_id": workspace_id, "limit": limit, "offset": offset}

        if subscription_id:
            query += " AND d.subscription_id = :subscription_id"
            params["subscription_id"] = subscription_id

        if event_id:
            query += " AND d.event_id = :event_id"
            params["event_id"] = event_id

        query += " ORDER BY d.created_at DESC LIMIT :limit OFFSET :offset"

        result = await self.db.execute(query, params)
        rows = result.fetchall()

        deliveries = []
        for row in rows:
            deliveries.append({
                "delivery_id": row.delivery_id,
                "event_id": row.event_id,
                "subscription_id": row.subscription_id,
                "event_type": row.event_type,
                "status": row.status,
                "attempt_number": row.attempt_number,
                "response_status_code": row.response_status_code,
                "response_duration_ms": row.response_duration_ms,
                "error_code": row.error_code,
                "error_message": row.error_message,
                "created_at": row.created_at,
                "completed_at": row.completed_at,
            })

        return deliveries

    async def get_delivery_metrics(
        self,
        workspace_id: UUID,
        subscription_id: Optional[UUID] = None,
        hours: int = 24
    ) -> Dict[str, Any]:
        """
        Get delivery metrics for monitoring.

        Args:
            workspace_id: Workspace to query
            subscription_id: Optional subscription filter
            hours: Time window in hours

        Returns:
            Metrics dictionary
        """
        since = datetime.utcnow() - timedelta(hours=hours)

        query = """
        SELECT
            COUNT(*) as total_deliveries,
            COUNT(*) FILTER (WHERE status = 'succeeded') as successful_deliveries,
            COUNT(*) FILTER (WHERE status = 'failed') as failed_deliveries,
            COUNT(*) FILTER (WHERE status = 'pending') as pending_deliveries,
            COUNT(*) FILTER (WHERE status = 'retrying') as retrying_deliveries,
            COUNT(*) FILTER (WHERE status = 'exhausted') as exhausted_deliveries,
            AVG(response_duration_ms) FILTER (WHERE status = 'succeeded') as avg_delivery_time_ms,
            MAX(created_at) FILTER (WHERE status = 'succeeded') as last_delivery_at,
            MAX(created_at) FILTER (WHERE status IN ('failed', 'exhausted')) as last_failure_at,
            SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as success_rate
        FROM webhook_deliveries
        WHERE workspace_id = :workspace_id
        AND created_at >= :since
        """

        params = {"workspace_id": workspace_id, "since": since}

        if subscription_id:
            query += " AND subscription_id = :subscription_id"
            params["subscription_id"] = subscription_id

        result = await self.db.execute(query, params)
        row = result.fetchone()

        return {
            "total_deliveries": row.total_deliveries or 0,
            "successful_deliveries": row.successful_deliveries or 0,
            "failed_deliveries": row.failed_deliveries or 0,
            "pending_deliveries": row.pending_deliveries or 0,
            "retrying_deliveries": row.retrying_deliveries or 0,
            "exhausted_deliveries": row.exhausted_deliveries or 0,
            "avg_delivery_time_ms": row.avg_delivery_time_ms,
            "last_delivery_at": row.last_delivery_at,
            "last_failure_at": row.last_failure_at,
            "success_rate": row.success_rate or 0.0,
        }

    async def get_failed_deliveries(
        self,
        workspace_id: UUID,
        hours: int = 24,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get failed deliveries for investigation.

        Args:
            workspace_id: Workspace to query
            hours: Time window in hours
            limit: Max results

        Returns:
            List of failed delivery records
        """
        since = datetime.utcnow() - timedelta(hours=hours)

        query = """
        SELECT
            d.delivery_id,
            d.subscription_id,
            d.event_id,
            d.event_type,
            d.status,
            d.attempt_number,
            d.error_code,
            d.error_message,
            d.created_at
        FROM webhook_deliveries d
        WHERE d.workspace_id = :workspace_id
        AND d.status IN ('failed', 'exhausted')
        AND d.created_at >= :since
        ORDER BY d.created_at DESC
        LIMIT :limit
        """

        result = await self.db.execute(
            query,
            {
                "workspace_id": workspace_id,
                "since": since,
                "limit": limit,
            }
        )
        rows = result.fetchall()

        deliveries = []
        for row in rows:
            deliveries.append({
                "delivery_id": row.delivery_id,
                "subscription_id": row.subscription_id,
                "event_id": row.event_id,
                "event_type": row.event_type,
                "status": row.status,
                "attempt_number": row.attempt_number,
                "error_code": row.error_code,
                "error_message": row.error_message,
                "created_at": row.created_at,
            })

        return deliveries

    async def cleanup_old_deliveries(
        self,
        days: int = 30,
        batch_size: int = 1000
    ) -> int:
        """
        Clean up old delivery records.

        Args:
            days: Delete records older than this many days
            batch_size: Batch size for deletion

        Returns:
            Number of records deleted
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        # First count
        count_query = """
        SELECT COUNT(*)
        FROM webhook_deliveries
        WHERE completed_at < :cutoff
        AND status IN ('succeeded', 'failed', 'exhausted')
        """

        result = await self.db.execute(count_query, {"cutoff": cutoff})
        count = result.scalar() or 0

        if count == 0:
            return 0

        # Delete in batches
        deleted = 0
        while deleted < count:
            delete_query = """
            DELETE FROM webhook_deliveries
            WHERE delivery_id IN (
                SELECT delivery_id
                FROM webhook_deliveries
                WHERE completed_at < :cutoff
                AND status IN ('succeeded', 'failed', 'exhausted')
                LIMIT :batch_size
            )
            """

            result = await self.db.execute(
                delete_query,
                {"cutoff": cutoff, "batch_size": batch_size}
            )
            batch_deleted = result.rowcount
            deleted += batch_deleted

            await self.db.commit()

            logger.info(f"Deleted {batch_deleted} old webhook delivery records")

            if batch_deleted < batch_size:
                break

        return deleted

    async def get_endpoint_failure_rate(
        self,
        endpoint_url: str,
        hours: int = 1
    ) -> float:
        """
        Calculate failure rate for an endpoint.

        Args:
            endpoint_url: Endpoint to check
            hours: Time window in hours

        Returns:
            Failure rate (0-1)
        """
        since = datetime.utcnow() - timedelta(hours=hours)

        query = """
        SELECT
            COUNT(*) FILTER (WHERE status IN ('failed', 'exhausted')) as failures,
            COUNT(*) as total
        FROM webhook_deliveries d
        JOIN webhook_subscriptions s ON d.subscription_id = s.subscription_id
        WHERE s.endpoint_url = :endpoint_url
        AND d.created_at >= :since
        """

        result = await self.db.execute(
            query,
            {"endpoint_url": endpoint_url, "since": since}
        )
        row = result.fetchone()

        if row.total == 0:
            return 0.0

        return row.failures / row.total


__all__ = ["WebhookRepository"]
