"""Repository for notification events and delivery log data operations.

This module provides the NotificationRepository class that handles all CRUD
operations for notification events and delivery logs, with proper workspace
isolation for multi-tenant security.

All queries enforce workspace_id filtering to ensure data isolation
between tenants.

Feature: Notifications & Communication Microservice
Task: T018 - Create notification_repository.py
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

import asyncpg

from src.database import fetch, fetchrow, fetchval, get_connection, transaction
from src.schemas.notification import (
    DeliveryLogResponse,
    DeliveryLogSummary,
    NotificationCategory,
    NotificationChannel,
    NotificationDeliveryStatus,
    NotificationEventResponse,
    NotificationEventStatus,
    NotificationEventSummary,
    NotificationPriority,
    NotificationProvider,
    NotificationStats,
    NotificationStatsByCategory,
    PaginationMeta,
)

logger = logging.getLogger(__name__)


class NotificationRepository:
    """Data access layer for notification events and delivery log records.

    This repository handles all CRUD operations for notification data, ensuring
    proper workspace isolation for multi-tenant security.

    All methods that access data require workspace_id to enforce
    tenant isolation at the data layer.
    """

    # =========================================================================
    # NOTIFICATION EVENT - CREATE OPERATIONS
    # =========================================================================

    async def create_notification_event(
        self,
        workspace_id: UUID,
        event_type: str,
        category: NotificationCategory,
        channel: NotificationChannel,
        recipient_user_id: Optional[UUID] = None,
        recipient_email: Optional[str] = None,
        recipient_phone: Optional[str] = None,
        priority: NotificationPriority = NotificationPriority.NORMAL,
        template_id: Optional[UUID] = None,
        template_code: Optional[str] = None,
        subject: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
        scheduled_for: Optional[datetime] = None,
        idempotency_key: Optional[str] = None,
        correlation_id: Optional[UUID] = None,
        source_service: Optional[str] = None,
        max_retries: int = 3,
    ) -> NotificationEventResponse:
        """Create a new notification event record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            event_type: Specific event type (e.g., gallery.published)
            category: High-level category for preference matching
            channel: Delivery channel (email, sms, in_app, push)
            recipient_user_id: Optional user ID for registered users
            recipient_email: Optional email address
            recipient_phone: Optional phone number
            priority: Processing priority (default normal)
            template_id: Optional template UUID
            template_code: Optional template code for lookup
            subject: Optional notification subject
            payload: Template variables and additional context
            scheduled_for: Optional scheduled delivery time
            idempotency_key: Unique key to prevent duplicates
            correlation_id: Links related notifications
            source_service: Service that triggered this notification
            max_retries: Maximum retry attempts (default 3)

        Returns:
            Created notification event as NotificationEventResponse

        Raises:
            asyncpg.UniqueViolationError: If idempotency_key already exists
        """
        event_id = uuid4()
        now = datetime.now(timezone.utc)

        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO notification_events (
                    event_id, workspace_id,
                    recipient_user_id, recipient_email, recipient_phone,
                    event_type, category, channel, priority,
                    template_id, template_code, subject, payload,
                    status, retry_count, max_retries,
                    idempotency_key, correlation_id, source_service,
                    scheduled_for, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
                )
                RETURNING *
                """,
                event_id,
                workspace_id,
                recipient_user_id,
                recipient_email,
                recipient_phone,
                event_type,
                category.value,
                channel.value,
                priority.value,
                template_id,
                template_code,
                subject,
                payload or {},
                NotificationEventStatus.PENDING.value,
                0,  # retry_count
                max_retries,
                idempotency_key,
                correlation_id,
                source_service,
                scheduled_for,
                now,
                now,
            )

            return self._row_to_event_response(row)

    async def create_notification_events_batch(
        self,
        events: list[dict[str, Any]],
    ) -> list[UUID]:
        """Create multiple notification events in a batch.

        Args:
            events: List of event dictionaries with all required fields.
                    Each dict must include workspace_id, event_type, category, channel,
                    and at least one recipient field.

        Returns:
            List of created event IDs

        Note:
            This method uses executemany for efficient bulk insert.
            Events are not returned individually for performance.
        """
        if not events:
            return []

        now = datetime.now(timezone.utc)
        event_ids: list[UUID] = []

        records = []
        for event in events:
            event_id = uuid4()
            event_ids.append(event_id)
            records.append((
                event_id,
                event["workspace_id"],
                event.get("recipient_user_id"),
                event.get("recipient_email"),
                event.get("recipient_phone"),
                event["event_type"],
                event["category"].value if isinstance(event["category"], NotificationCategory) else event["category"],
                event["channel"].value if isinstance(event["channel"], NotificationChannel) else event["channel"],
                event.get("priority", NotificationPriority.NORMAL).value if isinstance(event.get("priority", NotificationPriority.NORMAL), NotificationPriority) else event.get("priority", "normal"),
                event.get("template_id"),
                event.get("template_code"),
                event.get("subject"),
                event.get("payload", {}),
                NotificationEventStatus.PENDING.value,
                0,  # retry_count
                event.get("max_retries", 3),
                event.get("idempotency_key"),
                event.get("correlation_id"),
                event.get("source_service"),
                event.get("scheduled_for"),
                now,
                now,
            ))

        async with get_connection() as conn:
            await conn.executemany(
                """
                INSERT INTO notification_events (
                    event_id, workspace_id,
                    recipient_user_id, recipient_email, recipient_phone,
                    event_type, category, channel, priority,
                    template_id, template_code, subject, payload,
                    status, retry_count, max_retries,
                    idempotency_key, correlation_id, source_service,
                    scheduled_for, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
                )
                """,
                records,
            )

        logger.info(
            f"Created {len(event_ids)} notification events in batch",
            extra={"event_count": len(event_ids)},
        )

        return event_ids

    # =========================================================================
    # NOTIFICATION EVENT - READ OPERATIONS
    # =========================================================================

    async def get_notification_event(
        self,
        workspace_id: UUID,
        event_id: UUID,
    ) -> Optional[NotificationEventResponse]:
        """Get a single notification event by ID with workspace isolation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            event_id: Event ID to retrieve

        Returns:
            Notification event as NotificationEventResponse or None if not found
        """
        row = await fetchrow(
            """
            SELECT * FROM notification_events
            WHERE event_id = $1 AND workspace_id = $2
            """,
            event_id,
            workspace_id,
            read_only=True,
        )
        return self._row_to_event_response(row) if row else None

    async def get_notification_event_by_idempotency_key(
        self,
        idempotency_key: str,
    ) -> Optional[NotificationEventResponse]:
        """Get notification event by idempotency key.

        Used to check for duplicate notifications before creating new ones.

        Args:
            idempotency_key: Unique idempotency key

        Returns:
            Notification event or None if not found
        """
        row = await fetchrow(
            """
            SELECT * FROM notification_events
            WHERE idempotency_key = $1
            """,
            idempotency_key,
            read_only=True,
        )
        return self._row_to_event_response(row) if row else None

    async def list_notification_events(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[NotificationEventStatus] = None,
        category: Optional[NotificationCategory] = None,
        channel: Optional[NotificationChannel] = None,
        event_type: Optional[str] = None,
        recipient_user_id: Optional[UUID] = None,
        recipient_email: Optional[str] = None,
        created_after: Optional[datetime] = None,
        created_before: Optional[datetime] = None,
    ) -> tuple[list[NotificationEventSummary], PaginationMeta]:
        """List notification events for a workspace with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page (max 100)
            status: Optional status filter
            category: Optional category filter
            channel: Optional channel filter
            event_type: Optional event type filter
            recipient_user_id: Optional recipient user filter
            recipient_email: Optional recipient email filter
            created_after: Optional filter for events after this time
            created_before: Optional filter for events before this time

        Returns:
            Tuple of (list of NotificationEventSummary, PaginationMeta)
        """
        offset = (page - 1) * limit

        # Build dynamic query
        conditions = ["workspace_id = $1"]
        params: list[Any] = [workspace_id]
        param_idx = 2

        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status.value)
            param_idx += 1

        if category:
            conditions.append(f"category = ${param_idx}")
            params.append(category.value)
            param_idx += 1

        if channel:
            conditions.append(f"channel = ${param_idx}")
            params.append(channel.value)
            param_idx += 1

        if event_type:
            conditions.append(f"event_type = ${param_idx}")
            params.append(event_type)
            param_idx += 1

        if recipient_user_id:
            conditions.append(f"recipient_user_id = ${param_idx}")
            params.append(recipient_user_id)
            param_idx += 1

        if recipient_email:
            conditions.append(f"recipient_email = ${param_idx}")
            params.append(recipient_email)
            param_idx += 1

        if created_after:
            conditions.append(f"created_at >= ${param_idx}")
            params.append(created_after)
            param_idx += 1

        if created_before:
            conditions.append(f"created_at <= ${param_idx}")
            params.append(created_before)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        # Get total count
        total = await fetchval(
            f"SELECT COUNT(*) FROM notification_events WHERE {where_clause}",
            *params,
            read_only=True,
        )

        # Get paginated results
        params.extend([limit, offset])
        rows = await fetch(
            f"""
            SELECT event_id, event_type, category, channel, priority, status,
                   recipient_email, subject, created_at, delivered_at
            FROM notification_events
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """,
            *params,
            read_only=True,
        )

        events = [self._row_to_event_summary(row) for row in rows]
        total_pages = (total + limit - 1) // limit if total > 0 else 0

        meta = PaginationMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
            has_more=page < total_pages,
        )

        return events, meta

    async def get_pending_events(
        self,
        limit: int = 100,
        scheduled_before: Optional[datetime] = None,
    ) -> list[NotificationEventResponse]:
        """Get pending notification events for processing.

        Returns events in priority order (urgent first, then high, normal, low)
        and by creation time within each priority level.

        Args:
            limit: Maximum number of events to return
            scheduled_before: Only include scheduled events due before this time
                              (None means include all pending events)

        Returns:
            List of pending notification events ordered by priority and created_at
        """
        now = scheduled_before or datetime.now(timezone.utc)

        rows = await fetch(
            """
            SELECT * FROM notification_events
            WHERE status = 'pending'
              AND (scheduled_for IS NULL OR scheduled_for <= $1)
            ORDER BY
                CASE priority
                    WHEN 'urgent' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'normal' THEN 3
                    WHEN 'low' THEN 4
                END,
                created_at ASC
            LIMIT $2
            """,
            now,
            limit,
        )

        return [self._row_to_event_response(row) for row in rows]

    async def get_events_for_retry(
        self,
        limit: int = 50,
    ) -> list[NotificationEventResponse]:
        """Get failed events that are eligible for retry.

        Returns events where retry_count < max_retries and status is 'failed'.

        Args:
            limit: Maximum number of events to return

        Returns:
            List of events eligible for retry
        """
        rows = await fetch(
            """
            SELECT * FROM notification_events
            WHERE status = 'failed'
              AND retry_count < max_retries
            ORDER BY
                CASE priority
                    WHEN 'urgent' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'normal' THEN 3
                    WHEN 'low' THEN 4
                END,
                updated_at ASC
            LIMIT $1
            """,
            limit,
        )

        return [self._row_to_event_response(row) for row in rows]

    async def get_events_by_correlation_id(
        self,
        workspace_id: UUID,
        correlation_id: UUID,
    ) -> list[NotificationEventResponse]:
        """Get all notification events linked by correlation ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            correlation_id: Correlation ID to search for

        Returns:
            List of related notification events
        """
        rows = await fetch(
            """
            SELECT * FROM notification_events
            WHERE workspace_id = $1 AND correlation_id = $2
            ORDER BY created_at DESC
            """,
            workspace_id,
            correlation_id,
            read_only=True,
        )

        return [self._row_to_event_response(row) for row in rows]

    async def get_user_notifications(
        self,
        workspace_id: UUID,
        user_id: UUID,
        page: int = 1,
        limit: int = 20,
        channel: Optional[NotificationChannel] = None,
        unread_only: bool = False,
    ) -> tuple[list[NotificationEventSummary], PaginationMeta]:
        """Get notifications for a specific user.

        Args:
            workspace_id: Workspace ID for tenant isolation
            user_id: User ID to get notifications for
            page: Page number (1-indexed)
            limit: Number of items per page
            channel: Optional channel filter
            unread_only: If True, only return undelivered/unread notifications

        Returns:
            Tuple of (list of NotificationEventSummary, PaginationMeta)
        """
        offset = (page - 1) * limit

        conditions = ["workspace_id = $1", "recipient_user_id = $2"]
        params: list[Any] = [workspace_id, user_id]
        param_idx = 3

        if channel:
            conditions.append(f"channel = ${param_idx}")
            params.append(channel.value)
            param_idx += 1

        if unread_only:
            conditions.append("delivered_at IS NULL")

        where_clause = " AND ".join(conditions)

        # Get total count
        total = await fetchval(
            f"SELECT COUNT(*) FROM notification_events WHERE {where_clause}",
            *params,
            read_only=True,
        )

        # Get paginated results
        params.extend([limit, offset])
        rows = await fetch(
            f"""
            SELECT event_id, event_type, category, channel, priority, status,
                   recipient_email, subject, created_at, delivered_at
            FROM notification_events
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """,
            *params,
            read_only=True,
        )

        events = [self._row_to_event_summary(row) for row in rows]
        total_pages = (total + limit - 1) // limit if total > 0 else 0

        meta = PaginationMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
            has_more=page < total_pages,
        )

        return events, meta

    # =========================================================================
    # NOTIFICATION EVENT - UPDATE OPERATIONS
    # =========================================================================

    async def update_event_status(
        self,
        event_id: UUID,
        status: NotificationEventStatus,
        error_message: Optional[str] = None,
        processed_at: Optional[datetime] = None,
        delivered_at: Optional[datetime] = None,
    ) -> Optional[NotificationEventResponse]:
        """Update notification event status.

        Args:
            event_id: Event ID to update
            status: New status value
            error_message: Optional error message (for failed status)
            processed_at: Optional processing timestamp
            delivered_at: Optional delivery timestamp

        Returns:
            Updated notification event or None if not found
        """
        row = await fetchrow(
            """
            UPDATE notification_events
            SET status = $2,
                error_message = COALESCE($3, error_message),
                processed_at = COALESCE($4, processed_at),
                delivered_at = COALESCE($5, delivered_at)
            WHERE event_id = $1
            RETURNING *
            """,
            event_id,
            status.value,
            error_message,
            processed_at,
            delivered_at,
        )
        return self._row_to_event_response(row) if row else None

    async def increment_retry_count(
        self,
        event_id: UUID,
    ) -> Optional[NotificationEventResponse]:
        """Increment retry count for a notification event.

        Args:
            event_id: Event ID to update

        Returns:
            Updated notification event or None if not found
        """
        row = await fetchrow(
            """
            UPDATE notification_events
            SET retry_count = retry_count + 1,
                status = 'pending'
            WHERE event_id = $1
              AND retry_count < max_retries
            RETURNING *
            """,
            event_id,
        )
        return self._row_to_event_response(row) if row else None

    async def cancel_event(
        self,
        workspace_id: UUID,
        event_id: UUID,
        reason: Optional[str] = None,
    ) -> Optional[NotificationEventResponse]:
        """Cancel a pending notification event.

        Only events with status 'pending' can be cancelled.

        Args:
            workspace_id: Workspace ID for tenant isolation
            event_id: Event ID to cancel
            reason: Optional cancellation reason

        Returns:
            Cancelled notification event or None if not found/not cancellable
        """
        row = await fetchrow(
            """
            UPDATE notification_events
            SET status = 'cancelled',
                error_message = $3
            WHERE event_id = $1
              AND workspace_id = $2
              AND status = 'pending'
            RETURNING *
            """,
            event_id,
            workspace_id,
            reason,
        )
        return self._row_to_event_response(row) if row else None

    async def mark_as_processing(
        self,
        event_id: UUID,
    ) -> bool:
        """Mark a notification event as processing.

        Uses atomic update to prevent concurrent processing.

        Args:
            event_id: Event ID to mark

        Returns:
            True if successfully marked, False if already processing or not found
        """
        result = await fetchval(
            """
            UPDATE notification_events
            SET status = 'processing'
            WHERE event_id = $1
              AND status = 'pending'
            RETURNING event_id
            """,
            event_id,
        )
        return result is not None

    # =========================================================================
    # DELIVERY LOG - CREATE OPERATIONS
    # =========================================================================

    async def create_delivery_log(
        self,
        workspace_id: UUID,
        event_id: UUID,
        channel: NotificationChannel,
        provider: NotificationProvider,
        recipient_email: Optional[str] = None,
        recipient_phone: Optional[str] = None,
        recipient_user_id: Optional[UUID] = None,
        recipient_device_token: Optional[str] = None,
        attempt_number: int = 1,
        correlation_id: Optional[UUID] = None,
        request_id: Optional[UUID] = None,
    ) -> DeliveryLogResponse:
        """Create a new delivery log entry.

        Args:
            workspace_id: Workspace ID for tenant isolation
            event_id: Reference to the notification event
            channel: Delivery channel used
            provider: Delivery provider used
            recipient_email: Recipient email (for email channel)
            recipient_phone: Recipient phone (for SMS channel)
            recipient_user_id: Recipient user ID (for in-app/push)
            recipient_device_token: Device token (for push)
            attempt_number: Attempt number (starts at 1)
            correlation_id: Optional correlation ID
            request_id: Optional request ID for tracing

        Returns:
            Created delivery log as DeliveryLogResponse
        """
        log_id = uuid4()
        now = datetime.now(timezone.utc)

        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO notification_delivery_log (
                    log_id, workspace_id, event_id,
                    channel, provider, status, attempt_number,
                    recipient_email, recipient_phone, recipient_user_id, recipient_device_token,
                    correlation_id, request_id, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
                )
                RETURNING *
                """,
                log_id,
                workspace_id,
                event_id,
                channel.value,
                provider.value,
                NotificationDeliveryStatus.PENDING.value,
                attempt_number,
                recipient_email,
                recipient_phone,
                recipient_user_id,
                recipient_device_token,
                correlation_id,
                request_id,
                now,
                now,
            )

            return self._row_to_delivery_response(row)

    async def create_delivery_log_with_event(
        self,
        workspace_id: UUID,
        event_id: UUID,
        channel: NotificationChannel,
        provider: NotificationProvider,
        recipient_email: Optional[str] = None,
        recipient_phone: Optional[str] = None,
        recipient_user_id: Optional[UUID] = None,
    ) -> DeliveryLogResponse:
        """Create a delivery log entry and update event status atomically.

        Uses a transaction to ensure both operations succeed or fail together.

        Args:
            workspace_id: Workspace ID for tenant isolation
            event_id: Reference to the notification event
            channel: Delivery channel used
            provider: Delivery provider used
            recipient_email: Recipient email (for email channel)
            recipient_phone: Recipient phone (for SMS channel)
            recipient_user_id: Recipient user ID (for in-app/push)

        Returns:
            Created delivery log as DeliveryLogResponse
        """
        log_id = uuid4()
        now = datetime.now(timezone.utc)

        async with transaction() as conn:
            # Get current attempt count
            attempt_row = await conn.fetchrow(
                """
                SELECT COALESCE(MAX(attempt_number), 0) + 1 as next_attempt
                FROM notification_delivery_log
                WHERE event_id = $1 AND channel = $2
                """,
                event_id,
                channel.value,
            )
            attempt_number = attempt_row["next_attempt"] if attempt_row else 1

            # Create delivery log
            row = await conn.fetchrow(
                """
                INSERT INTO notification_delivery_log (
                    log_id, workspace_id, event_id,
                    channel, provider, status, attempt_number,
                    recipient_email, recipient_phone, recipient_user_id,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
                )
                RETURNING *
                """,
                log_id,
                workspace_id,
                event_id,
                channel.value,
                provider.value,
                NotificationDeliveryStatus.PENDING.value,
                attempt_number,
                recipient_email,
                recipient_phone,
                recipient_user_id,
                now,
                now,
            )

            # Update event status to processing
            await conn.execute(
                """
                UPDATE notification_events
                SET status = 'processing'
                WHERE event_id = $1 AND status = 'pending'
                """,
                event_id,
            )

            return self._row_to_delivery_response(row)

    # =========================================================================
    # DELIVERY LOG - READ OPERATIONS
    # =========================================================================

    async def get_delivery_log(
        self,
        workspace_id: UUID,
        log_id: UUID,
    ) -> Optional[DeliveryLogResponse]:
        """Get a single delivery log entry by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            log_id: Log ID to retrieve

        Returns:
            Delivery log as DeliveryLogResponse or None if not found
        """
        row = await fetchrow(
            """
            SELECT * FROM notification_delivery_log
            WHERE log_id = $1 AND workspace_id = $2
            """,
            log_id,
            workspace_id,
            read_only=True,
        )
        return self._row_to_delivery_response(row) if row else None

    async def get_delivery_logs_for_event(
        self,
        workspace_id: UUID,
        event_id: UUID,
    ) -> list[DeliveryLogResponse]:
        """Get all delivery log entries for a notification event.

        Args:
            workspace_id: Workspace ID for tenant isolation
            event_id: Event ID to get logs for

        Returns:
            List of delivery log entries ordered by attempt number
        """
        rows = await fetch(
            """
            SELECT * FROM notification_delivery_log
            WHERE event_id = $1 AND workspace_id = $2
            ORDER BY channel, attempt_number DESC
            """,
            event_id,
            workspace_id,
            read_only=True,
        )

        return [self._row_to_delivery_response(row) for row in rows]

    async def get_delivery_log_by_provider_message_id(
        self,
        provider_message_id: str,
    ) -> Optional[DeliveryLogResponse]:
        """Get delivery log by provider message ID.

        Used for processing webhook callbacks from providers.

        Args:
            provider_message_id: External message ID from provider

        Returns:
            Delivery log or None if not found
        """
        row = await fetchrow(
            """
            SELECT * FROM notification_delivery_log
            WHERE provider_message_id = $1
            """,
            provider_message_id,
            read_only=True,
        )
        return self._row_to_delivery_response(row) if row else None

    async def list_delivery_logs(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[NotificationDeliveryStatus] = None,
        channel: Optional[NotificationChannel] = None,
        provider: Optional[NotificationProvider] = None,
        recipient_email: Optional[str] = None,
        created_after: Optional[datetime] = None,
        created_before: Optional[datetime] = None,
    ) -> tuple[list[DeliveryLogSummary], PaginationMeta]:
        """List delivery logs for a workspace with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter
            channel: Optional channel filter
            provider: Optional provider filter
            recipient_email: Optional recipient email filter
            created_after: Optional filter for logs after this time
            created_before: Optional filter for logs before this time

        Returns:
            Tuple of (list of DeliveryLogSummary, PaginationMeta)
        """
        offset = (page - 1) * limit

        conditions = ["workspace_id = $1"]
        params: list[Any] = [workspace_id]
        param_idx = 2

        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status.value)
            param_idx += 1

        if channel:
            conditions.append(f"channel = ${param_idx}")
            params.append(channel.value)
            param_idx += 1

        if provider:
            conditions.append(f"provider = ${param_idx}")
            params.append(provider.value)
            param_idx += 1

        if recipient_email:
            conditions.append(f"recipient_email = ${param_idx}")
            params.append(recipient_email)
            param_idx += 1

        if created_after:
            conditions.append(f"created_at >= ${param_idx}")
            params.append(created_after)
            param_idx += 1

        if created_before:
            conditions.append(f"created_at <= ${param_idx}")
            params.append(created_before)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        # Get total count
        total = await fetchval(
            f"SELECT COUNT(*) FROM notification_delivery_log WHERE {where_clause}",
            *params,
            read_only=True,
        )

        # Get paginated results
        params.extend([limit, offset])
        rows = await fetch(
            f"""
            SELECT log_id, event_id, channel, provider, status,
                   attempt_number, created_at, delivered_at
            FROM notification_delivery_log
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """,
            *params,
            read_only=True,
        )

        logs = [self._row_to_delivery_summary(row) for row in rows]
        total_pages = (total + limit - 1) // limit if total > 0 else 0

        meta = PaginationMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
            has_more=page < total_pages,
        )

        return logs, meta

    async def get_failed_deliveries(
        self,
        workspace_id: UUID,
        limit: int = 50,
    ) -> list[DeliveryLogResponse]:
        """Get recent failed delivery attempts.

        Args:
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum number of logs to return

        Returns:
            List of failed delivery logs
        """
        rows = await fetch(
            """
            SELECT * FROM notification_delivery_log
            WHERE workspace_id = $1
              AND status IN ('failed', 'bounced', 'rejected')
            ORDER BY created_at DESC
            LIMIT $2
            """,
            workspace_id,
            limit,
            read_only=True,
        )

        return [self._row_to_delivery_response(row) for row in rows]

    async def get_invalidated_recipients(
        self,
        workspace_id: Optional[UUID] = None,
    ) -> list[str]:
        """Get list of invalidated recipient emails.

        Used for building suppression lists.

        Args:
            workspace_id: Optional workspace ID filter (None = all workspaces)

        Returns:
            List of invalidated email addresses
        """
        if workspace_id:
            rows = await fetch(
                """
                SELECT DISTINCT recipient_email
                FROM notification_delivery_log
                WHERE workspace_id = $1
                  AND recipient_invalidated = TRUE
                  AND recipient_email IS NOT NULL
                """,
                workspace_id,
                read_only=True,
            )
        else:
            rows = await fetch(
                """
                SELECT DISTINCT recipient_email
                FROM notification_delivery_log
                WHERE recipient_invalidated = TRUE
                  AND recipient_email IS NOT NULL
                """,
                read_only=True,
            )

        return [row["recipient_email"] for row in rows]

    # =========================================================================
    # DELIVERY LOG - UPDATE OPERATIONS
    # =========================================================================

    async def update_delivery_status(
        self,
        log_id: UUID,
        status: NotificationDeliveryStatus,
        provider_message_id: Optional[str] = None,
        provider_http_status: Optional[int] = None,
        provider_response: Optional[dict] = None,
        provider_error_code: Optional[str] = None,
        provider_error_message: Optional[str] = None,
        queued_at: Optional[datetime] = None,
        sent_at: Optional[datetime] = None,
        delivered_at: Optional[datetime] = None,
        failed_at: Optional[datetime] = None,
        cost_cents: Optional[int] = None,
    ) -> Optional[DeliveryLogResponse]:
        """Update delivery log status and provider response.

        Args:
            log_id: Log ID to update
            status: New delivery status
            provider_message_id: External message ID from provider
            provider_http_status: HTTP status code from provider
            provider_response: Full response from provider API
            provider_error_code: Error code from provider
            provider_error_message: Error message from provider
            queued_at: When queued to provider
            sent_at: When sent by provider
            delivered_at: When delivered
            failed_at: When failed
            cost_cents: Cost in cents

        Returns:
            Updated delivery log or None if not found
        """
        row = await fetchrow(
            """
            UPDATE notification_delivery_log
            SET status = $2,
                provider_message_id = COALESCE($3, provider_message_id),
                provider_http_status = COALESCE($4, provider_http_status),
                provider_response = COALESCE($5, provider_response),
                provider_error_code = COALESCE($6, provider_error_code),
                provider_error_message = COALESCE($7, provider_error_message),
                queued_at = COALESCE($8, queued_at),
                sent_at = COALESCE($9, sent_at),
                delivered_at = COALESCE($10, delivered_at),
                failed_at = COALESCE($11, failed_at),
                cost_cents = COALESCE($12, cost_cents)
            WHERE log_id = $1
            RETURNING *
            """,
            log_id,
            status.value,
            provider_message_id,
            provider_http_status,
            provider_response,
            provider_error_code,
            provider_error_message,
            queued_at,
            sent_at,
            delivered_at,
            failed_at,
            cost_cents,
        )
        return self._row_to_delivery_response(row) if row else None

    async def update_delivery_from_webhook(
        self,
        provider_message_id: str,
        status: NotificationDeliveryStatus,
        webhook_event: str,
        webhook_timestamp: datetime,
        bounce_type: Optional[str] = None,
        bounce_reason: Optional[str] = None,
        clicked_url: Optional[str] = None,
    ) -> Optional[DeliveryLogResponse]:
        """Update delivery log from webhook callback.

        Args:
            provider_message_id: External message ID from provider
            status: New delivery status
            webhook_event: Type of webhook event
            webhook_timestamp: Timestamp of webhook event
            bounce_type: Type of bounce (hard, soft, block)
            bounce_reason: Reason for bounce
            clicked_url: URL that was clicked

        Returns:
            Updated delivery log or None if not found
        """
        # Handle recipient invalidation for hard bounces
        should_invalidate = bounce_type == "hard" or status == NotificationDeliveryStatus.SPAM_REPORTED

        row = await fetchrow(
            """
            UPDATE notification_delivery_log
            SET status = $2,
                last_webhook_event = $3,
                last_webhook_at = $4,
                bounce_type = COALESCE($5, bounce_type),
                bounce_reason = COALESCE($6, bounce_reason),
                recipient_invalidated = CASE WHEN $7 THEN TRUE ELSE recipient_invalidated END,
                delivered_at = CASE WHEN $2 = 'delivered' THEN $4 ELSE delivered_at END,
                failed_at = CASE WHEN $2 IN ('bounced', 'failed', 'rejected') THEN $4 ELSE failed_at END
            WHERE provider_message_id = $1
            RETURNING *
            """,
            provider_message_id,
            status.value,
            webhook_event,
            webhook_timestamp,
            bounce_type,
            bounce_reason,
            should_invalidate,
        )

        # Handle click tracking separately if URL provided
        if row and clicked_url:
            await fetchrow(
                """
                UPDATE notification_delivery_log
                SET clicked_links = clicked_links || $2::jsonb
                WHERE log_id = $1
                """,
                row["log_id"],
                f'{{"url": "{clicked_url}", "clicked_at": "{webhook_timestamp.isoformat()}"}}',
            )

        return self._row_to_delivery_response(row) if row else None

    async def mark_recipient_as_invalidated(
        self,
        recipient_email: str,
        reason: str,
    ) -> int:
        """Mark all delivery logs for a recipient as invalidated.

        Used when a hard bounce or spam complaint is received.

        Args:
            recipient_email: Email address to invalidate
            reason: Reason for invalidation

        Returns:
            Number of records updated
        """
        result = await fetchval(
            """
            WITH updated AS (
                UPDATE notification_delivery_log
                SET recipient_invalidated = TRUE,
                    bounce_reason = COALESCE(bounce_reason, $2)
                WHERE recipient_email = $1
                  AND recipient_invalidated = FALSE
                RETURNING 1
            )
            SELECT COUNT(*) FROM updated
            """,
            recipient_email,
            reason,
        )
        return result or 0

    # =========================================================================
    # STATISTICS & ANALYTICS
    # =========================================================================

    async def get_notification_stats(
        self,
        workspace_id: UUID,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
    ) -> NotificationStats:
        """Get notification statistics for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            period_start: Optional start of period
            period_end: Optional end of period

        Returns:
            NotificationStats with counts and rates
        """
        conditions = ["workspace_id = $1"]
        params: list[Any] = [workspace_id]
        param_idx = 2

        if period_start:
            conditions.append(f"created_at >= ${param_idx}")
            params.append(period_start)
            param_idx += 1

        if period_end:
            conditions.append(f"created_at <= ${param_idx}")
            params.append(period_end)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        # Get overall stats from notification_events
        event_stats = await fetchrow(
            f"""
            SELECT
                COUNT(*) FILTER (WHERE status IN ('sent', 'delivered')) as total_sent,
                COUNT(*) FILTER (WHERE status = 'delivered') as total_delivered,
                COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
                COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
                COUNT(*) FILTER (WHERE channel = 'email' AND status IN ('sent', 'delivered')) as email_sent,
                COUNT(*) FILTER (WHERE channel = 'email' AND status = 'delivered') as email_delivered,
                COUNT(*) FILTER (WHERE channel = 'sms' AND status IN ('sent', 'delivered')) as sms_sent,
                COUNT(*) FILTER (WHERE channel = 'sms' AND status = 'delivered') as sms_delivered,
                COUNT(*) FILTER (WHERE channel = 'in_app' AND status IN ('sent', 'delivered')) as in_app_sent,
                COUNT(*) FILTER (WHERE channel = 'in_app' AND status = 'delivered') as in_app_delivered,
                COUNT(*) FILTER (WHERE channel = 'push' AND status IN ('sent', 'delivered')) as push_sent,
                COUNT(*) FILTER (WHERE channel = 'push' AND status = 'delivered') as push_delivered
            FROM notification_events
            WHERE {where_clause}
            """,
            *params,
            read_only=True,
        )

        # Get engagement stats from delivery log
        delivery_stats = await fetchrow(
            f"""
            SELECT
                COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as total_opened,
                COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as total_clicked,
                COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count
            FROM notification_delivery_log
            WHERE {where_clause}
            """,
            *params,
            read_only=True,
        )

        total_sent = event_stats["total_sent"] or 0
        total_delivered = delivery_stats["delivered_count"] or 0
        total_opened = delivery_stats["total_opened"] or 0
        total_clicked = delivery_stats["total_clicked"] or 0

        open_rate = (total_opened / total_delivered * 100) if total_delivered > 0 else 0.0
        click_rate = (total_clicked / total_delivered * 100) if total_delivered > 0 else 0.0

        return NotificationStats(
            total_sent=total_sent,
            total_delivered=event_stats["total_delivered"] or 0,
            total_failed=event_stats["total_failed"] or 0,
            total_pending=event_stats["total_pending"] or 0,
            email_sent=event_stats["email_sent"] or 0,
            email_delivered=event_stats["email_delivered"] or 0,
            sms_sent=event_stats["sms_sent"] or 0,
            sms_delivered=event_stats["sms_delivered"] or 0,
            in_app_sent=event_stats["in_app_sent"] or 0,
            in_app_delivered=event_stats["in_app_delivered"] or 0,
            push_sent=event_stats["push_sent"] or 0,
            push_delivered=event_stats["push_delivered"] or 0,
            total_opened=total_opened,
            total_clicked=total_clicked,
            open_rate=round(open_rate, 2),
            click_rate=round(click_rate, 2),
            period_start=period_start,
            period_end=period_end,
        )

    async def get_stats_by_category(
        self,
        workspace_id: UUID,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
    ) -> list[NotificationStatsByCategory]:
        """Get notification statistics grouped by category.

        Args:
            workspace_id: Workspace ID for tenant isolation
            period_start: Optional start of period
            period_end: Optional end of period

        Returns:
            List of NotificationStatsByCategory
        """
        conditions = ["e.workspace_id = $1"]
        params: list[Any] = [workspace_id]
        param_idx = 2

        if period_start:
            conditions.append(f"e.created_at >= ${param_idx}")
            params.append(period_start)
            param_idx += 1

        if period_end:
            conditions.append(f"e.created_at <= ${param_idx}")
            params.append(period_end)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        rows = await fetch(
            f"""
            SELECT
                e.category,
                COUNT(*) FILTER (WHERE e.status IN ('sent', 'delivered')) as sent,
                COUNT(*) FILTER (WHERE e.status = 'delivered') as delivered,
                COUNT(*) FILTER (WHERE e.status = 'failed') as failed,
                COUNT(*) FILTER (WHERE d.opened_at IS NOT NULL) as opened,
                COUNT(*) FILTER (WHERE d.clicked_at IS NOT NULL) as clicked
            FROM notification_events e
            LEFT JOIN notification_delivery_log d ON e.event_id = d.event_id
            WHERE {where_clause}
            GROUP BY e.category
            ORDER BY sent DESC
            """,
            *params,
            read_only=True,
        )

        stats = []
        for row in rows:
            delivered = row["delivered"] or 0
            opened = row["opened"] or 0
            clicked = row["clicked"] or 0

            open_rate = (opened / delivered * 100) if delivered > 0 else 0.0
            click_rate = (clicked / delivered * 100) if delivered > 0 else 0.0

            stats.append(NotificationStatsByCategory(
                category=NotificationCategory(row["category"]),
                sent=row["sent"] or 0,
                delivered=delivered,
                failed=row["failed"] or 0,
                open_rate=round(open_rate, 2),
                click_rate=round(click_rate, 2),
            ))

        return stats

    async def count_events_by_status(
        self,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Count notification events by status.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Dictionary of status to count
        """
        rows = await fetch(
            """
            SELECT status, COUNT(*) as count
            FROM notification_events
            WHERE workspace_id = $1
            GROUP BY status
            """,
            workspace_id,
            read_only=True,
        )

        return {row["status"]: row["count"] for row in rows}

    # =========================================================================
    # CLEANUP OPERATIONS
    # =========================================================================

    async def cleanup_old_events(
        self,
        days_to_keep: int = 90,
    ) -> int:
        """Delete notification events older than specified days.

        Also cleans up related delivery logs via CASCADE.

        Args:
            days_to_keep: Number of days to retain events

        Returns:
            Number of events deleted
        """
        result = await fetchval(
            """
            WITH deleted AS (
                DELETE FROM notification_events
                WHERE created_at < NOW() - INTERVAL '1 day' * $1
                  AND status IN ('delivered', 'failed', 'cancelled', 'skipped')
                RETURNING 1
            )
            SELECT COUNT(*) FROM deleted
            """,
            days_to_keep,
        )

        count = result or 0
        if count > 0:
            logger.info(
                f"Cleaned up {count} old notification events",
                extra={"days_to_keep": days_to_keep},
            )

        return count

    async def cleanup_old_delivery_logs(
        self,
        days_to_keep: int = 90,
    ) -> int:
        """Delete delivery logs older than specified days.

        Only deletes logs for delivered/failed events.

        Args:
            days_to_keep: Number of days to retain logs

        Returns:
            Number of logs deleted
        """
        result = await fetchval(
            """
            WITH deleted AS (
                DELETE FROM notification_delivery_log
                WHERE created_at < NOW() - INTERVAL '1 day' * $1
                  AND status IN ('delivered', 'failed', 'bounced', 'rejected')
                RETURNING 1
            )
            SELECT COUNT(*) FROM deleted
            """,
            days_to_keep,
        )

        count = result or 0
        if count > 0:
            logger.info(
                f"Cleaned up {count} old delivery logs",
                extra={"days_to_keep": days_to_keep},
            )

        return count

    # =========================================================================
    # PRIVATE HELPER METHODS
    # =========================================================================

    def _row_to_event_response(self, row: asyncpg.Record) -> NotificationEventResponse:
        """Convert database row to NotificationEventResponse schema."""
        return NotificationEventResponse(
            event_id=row["event_id"],
            workspace_id=row["workspace_id"],
            recipient_user_id=row["recipient_user_id"],
            recipient_email=row["recipient_email"],
            recipient_phone=row["recipient_phone"],
            event_type=row["event_type"],
            category=NotificationCategory(row["category"]),
            channel=NotificationChannel(row["channel"]),
            priority=NotificationPriority(row["priority"]),
            template_id=row["template_id"],
            template_code=row["template_code"],
            subject=row["subject"],
            payload=row["payload"] or {},
            status=NotificationEventStatus(row["status"]),
            error_message=row["error_message"],
            retry_count=row["retry_count"],
            max_retries=row["max_retries"],
            idempotency_key=row["idempotency_key"],
            correlation_id=row["correlation_id"],
            source_service=row["source_service"],
            scheduled_for=row["scheduled_for"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            processed_at=row["processed_at"],
            delivered_at=row["delivered_at"],
        )

    def _row_to_event_summary(self, row: asyncpg.Record) -> NotificationEventSummary:
        """Convert database row to NotificationEventSummary schema."""
        return NotificationEventSummary(
            event_id=row["event_id"],
            event_type=row["event_type"],
            category=NotificationCategory(row["category"]),
            channel=NotificationChannel(row["channel"]),
            priority=NotificationPriority(row["priority"]),
            status=NotificationEventStatus(row["status"]),
            recipient_email=row["recipient_email"],
            subject=row["subject"],
            created_at=row["created_at"],
            delivered_at=row["delivered_at"],
        )

    def _row_to_delivery_response(self, row: asyncpg.Record) -> DeliveryLogResponse:
        """Convert database row to DeliveryLogResponse schema."""
        return DeliveryLogResponse(
            log_id=row["log_id"],
            workspace_id=row["workspace_id"],
            event_id=row["event_id"],
            channel=NotificationChannel(row["channel"]),
            provider=NotificationProvider(row["provider"]),
            status=NotificationDeliveryStatus(row["status"]),
            attempt_number=row["attempt_number"],
            recipient_email=row["recipient_email"],
            recipient_phone=row["recipient_phone"],
            recipient_user_id=row["recipient_user_id"],
            provider_message_id=row["provider_message_id"],
            provider_http_status=row["provider_http_status"],
            provider_error_code=row["provider_error_code"],
            provider_error_message=row["provider_error_message"],
            opened_at=row["opened_at"],
            open_count=row["open_count"] or 0,
            clicked_at=row["clicked_at"],
            click_count=row["click_count"] or 0,
            bounce_type=row["bounce_type"],
            bounce_reason=row["bounce_reason"],
            recipient_invalidated=row["recipient_invalidated"] or False,
            created_at=row["created_at"],
            queued_at=row["queued_at"],
            sent_at=row["sent_at"],
            delivered_at=row["delivered_at"],
            failed_at=row["failed_at"],
            updated_at=row["updated_at"],
            cost_cents=row["cost_cents"] or 0,
        )

    def _row_to_delivery_summary(self, row: asyncpg.Record) -> DeliveryLogSummary:
        """Convert database row to DeliveryLogSummary schema."""
        return DeliveryLogSummary(
            log_id=row["log_id"],
            event_id=row["event_id"],
            channel=NotificationChannel(row["channel"]),
            provider=NotificationProvider(row["provider"]),
            status=NotificationDeliveryStatus(row["status"]),
            attempt_number=row["attempt_number"],
            created_at=row["created_at"],
            delivered_at=row["delivered_at"],
        )


# Singleton instance for use across the application
notification_repository = NotificationRepository()
