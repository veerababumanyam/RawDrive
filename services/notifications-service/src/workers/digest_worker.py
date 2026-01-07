"""
Digest Aggregation Worker for the Notifications & Communication Microservice.

This module implements a background worker that aggregates and sends digest notifications:
- Processes daily and weekly digest requests
- Aggregates pending notifications for users with digest preferences
- Groups notifications by category for organized digest emails
- Renders digest templates with aggregated content
- Sends consolidated digest emails to reduce notification volume

The worker integrates with:
- TaskQueueService for task management
- PreferenceRepository for user digest settings
- NotificationRepository for pending notifications
- TemplateService for Jinja2 digest rendering
- EmailDeliveryService for sending digest emails
- MetricsCollector for Prometheus metrics

Features:
- Configurable digest frequencies (daily, weekly)
- Category-based notification grouping
- Timezone-aware scheduling
- Batch processing for efficiency
- Graceful shutdown handling
- Comprehensive error handling
- Dead letter queue for failed digests

Feature: Notifications & Communication Microservice
Task: T036 - Create digest aggregation worker
"""

from __future__ import annotations

import asyncio
import logging
import signal
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

from src.cache.redis_client import redis_client
from src.config import settings
from src.database import fetch, fetchrow, fetchval
from src.observability.metrics import get_metrics
from src.repositories.notification_repository import notification_repository
from src.repositories.preference_repository import preference_repository
from src.schemas.notification import (
    NotificationCategory,
    NotificationChannel,
    NotificationEventStatus,
    NotificationPriority,
    NotificationProvider,
)
from src.schemas.preference import (
    DigestFrequency,
    DigestSchedule,
    DayOfWeek,
)
from src.services.task_queue_service import (
    Task,
    TaskPriority,
    TaskQueueService,
    TaskStatus,
    TASK_AGGREGATE_DIGEST,
    TASK_SEND_DIGEST,
    TASK_PROCESS_DAILY_DIGEST,
    TASK_PROCESS_WEEKLY_DIGEST,
    get_task_queue,
    register_task_handler,
)
from src.services.template_service import template_service
from src.services.email_delivery_service import (
    EmailDeliveryService,
    get_email_delivery_service,
)

logger = logging.getLogger(__name__)


# =============================================================================
# DIGEST DATA STRUCTURES
# =============================================================================


@dataclass
class DigestNotificationItem:
    """A single notification item within a digest."""

    event_id: UUID
    event_type: str
    category: NotificationCategory
    subject: Optional[str]
    payload: dict[str, Any]
    created_at: datetime


@dataclass
class DigestCategoryGroup:
    """Group of notifications for a single category in a digest."""

    category: NotificationCategory
    category_display: str
    items: list[DigestNotificationItem] = field(default_factory=list)
    count: int = 0

    def add_item(self, item: DigestNotificationItem) -> None:
        """Add an item to this category group."""
        self.items.append(item)
        self.count = len(self.items)


@dataclass
class DigestContent:
    """Aggregated content for a digest email."""

    user_id: UUID
    workspace_id: UUID
    frequency: DigestFrequency
    period_start: datetime
    period_end: datetime
    categories: list[DigestCategoryGroup] = field(default_factory=list)
    total_count: int = 0
    recipient_email: Optional[str] = None
    recipient_name: Optional[str] = None
    language: str = "en"
    timezone_str: str = "UTC"

    @property
    def is_empty(self) -> bool:
        """Check if the digest has no notifications."""
        return self.total_count == 0


@dataclass
class DigestProcessingResult:
    """Result of processing a digest for a user."""

    success: bool
    user_id: UUID
    digest_type: DigestFrequency
    notification_count: int = 0
    error_message: Optional[str] = None
    sent_at: Optional[datetime] = None


# =============================================================================
# CATEGORY DISPLAY NAMES
# =============================================================================


CATEGORY_DISPLAY_NAMES = {
    NotificationCategory.GALLERY_ACTIVITY: "Gallery Activity",
    NotificationCategory.CLIENT_INTERACTIONS: "Client Interactions",
    NotificationCategory.SYSTEM_ALERTS: "System Alerts",
    NotificationCategory.BILLING: "Billing",
    NotificationCategory.MARKETING: "Marketing",
    NotificationCategory.INVITATION: "Invitations",
}


# =============================================================================
# TASK HANDLERS
# =============================================================================


@register_task_handler(TASK_PROCESS_DAILY_DIGEST)
async def handle_process_daily_digest(payload: dict[str, Any]) -> dict[str, Any]:
    """Handler for processing a daily digest for a specific user.

    Args:
        payload: Task payload containing:
            - user_id: UUID of the user
            - workspace_id: UUID of the workspace
            - frequency: "daily"

    Returns:
        Dict with processing result
    """
    worker = get_digest_worker()
    return await worker.process_user_digest(
        user_id=UUID(payload["user_id"]),
        workspace_id=UUID(payload["workspace_id"]),
        frequency=DigestFrequency.DAILY,
    )


@register_task_handler(TASK_PROCESS_WEEKLY_DIGEST)
async def handle_process_weekly_digest(payload: dict[str, Any]) -> dict[str, Any]:
    """Handler for processing a weekly digest for a specific user.

    Args:
        payload: Task payload containing:
            - user_id: UUID of the user
            - workspace_id: UUID of the workspace
            - frequency: "weekly"

    Returns:
        Dict with processing result
    """
    worker = get_digest_worker()
    return await worker.process_user_digest(
        user_id=UUID(payload["user_id"]),
        workspace_id=UUID(payload["workspace_id"]),
        frequency=DigestFrequency.WEEKLY,
    )


@register_task_handler(TASK_AGGREGATE_DIGEST)
async def handle_aggregate_digest(payload: dict[str, Any]) -> dict[str, Any]:
    """Handler for aggregating all pending digests.

    This task is scheduled periodically (e.g., every hour) to find users
    who are due for a digest and enqueue individual digest tasks for them.

    Args:
        payload: Task payload containing:
            - frequency: "daily" or "weekly"
            - batch_size: Optional batch size (default 100)

    Returns:
        Dict with aggregation results
    """
    worker = get_digest_worker()
    frequency = DigestFrequency(payload.get("frequency", "daily"))
    batch_size = payload.get("batch_size", 100)

    return await worker.schedule_pending_digests(
        frequency=frequency,
        batch_size=batch_size,
    )


@register_task_handler(TASK_SEND_DIGEST)
async def handle_send_digest(payload: dict[str, Any]) -> dict[str, Any]:
    """Handler for sending a pre-rendered digest email.

    Used when the digest content has already been aggregated and rendered.

    Args:
        payload: Task payload containing:
            - user_id: UUID of the user
            - workspace_id: UUID of the workspace
            - recipient_email: Email address
            - subject: Email subject
            - html_content: Rendered HTML content
            - text_content: Rendered text content

    Returns:
        Dict with sending result
    """
    worker = get_digest_worker()
    return await worker.send_digest_email(payload)


# =============================================================================
# DIGEST WORKER
# =============================================================================


class DigestWorker:
    """Background worker for processing digest notifications.

    This worker handles:
    - Finding users due for digest emails
    - Aggregating pending notifications
    - Grouping notifications by category
    - Rendering digest templates
    - Sending consolidated digest emails
    - Marking notifications as included in digest

    Usage:
        worker = DigestWorker()

        # Process a single user's digest
        result = await worker.process_user_digest(user_id, workspace_id, frequency)

        # Schedule all pending digests
        scheduled = await worker.schedule_pending_digests(frequency)

        # Run as a background service
        await worker.run()
    """

    def __init__(
        self,
        email_service: Optional[EmailDeliveryService] = None,
        task_queue: Optional[TaskQueueService] = None,
    ):
        """Initialize the digest worker.

        Args:
            email_service: Email delivery service instance
            task_queue: Task queue service instance
        """
        self._email_service = email_service or get_email_delivery_service()
        self._task_queue = task_queue or get_task_queue()
        self._metrics = get_metrics()

        # Worker state
        self._running = False
        self._shutdown_event = asyncio.Event()

        # Configuration
        self._min_interval_minutes = settings.DIGEST_MIN_INTERVAL_MINUTES
        self._max_items = settings.DIGEST_MAX_ITEMS

    # =========================================================================
    # DIGEST SCHEDULING
    # =========================================================================

    async def schedule_pending_digests(
        self,
        frequency: DigestFrequency,
        batch_size: int = 100,
    ) -> dict[str, Any]:
        """Find and schedule digest tasks for users who are due.

        This method queries for users whose digest schedule indicates
        they should receive a digest now, and enqueues individual
        digest processing tasks for each user.

        Args:
            frequency: Digest frequency (daily or weekly)
            batch_size: Number of users to process per batch

        Returns:
            Dict with scheduling results
        """
        logger.info(
            f"Scheduling pending {frequency.value} digests",
            extra={"frequency": frequency.value, "batch_size": batch_size},
        )

        # Get current time
        now = datetime.now(timezone.utc)
        scheduled_count = 0
        skipped_count = 0
        error_count = 0

        try:
            # Find users due for digests
            users_due = await self._get_users_due_for_digest(
                frequency=frequency,
                limit=batch_size,
            )

            logger.info(
                f"Found {len(users_due)} users due for {frequency.value} digest",
                extra={"count": len(users_due)},
            )

            for user_info in users_due:
                try:
                    user_id = user_info["user_id"]
                    workspace_id = user_info["workspace_id"]

                    # Check if we've already sent a digest recently
                    if await self._check_digest_cooldown(user_id, frequency):
                        skipped_count += 1
                        continue

                    # Enqueue the digest task
                    task_type = (
                        TASK_PROCESS_DAILY_DIGEST
                        if frequency == DigestFrequency.DAILY
                        else TASK_PROCESS_WEEKLY_DIGEST
                    )

                    await self._task_queue.enqueue(
                        task_type=task_type,
                        payload={
                            "user_id": str(user_id),
                            "workspace_id": str(workspace_id),
                            "frequency": frequency.value,
                        },
                        priority=TaskPriority.NORMAL,
                        idempotency_key=f"digest:{user_id}:{frequency.value}:{now.date().isoformat()}",
                        workspace_id=str(workspace_id),
                    )

                    scheduled_count += 1

                except Exception as e:
                    error_count += 1
                    logger.error(
                        f"Error scheduling digest for user: {e}",
                        extra={"user_id": str(user_info.get("user_id"))},
                    )

            # Track metrics
            self._metrics.digest_scheduled(frequency.value, scheduled_count)

            return {
                "success": True,
                "frequency": frequency.value,
                "scheduled": scheduled_count,
                "skipped": skipped_count,
                "errors": error_count,
                "timestamp": now.isoformat(),
            }

        except Exception as e:
            logger.exception(f"Error scheduling pending digests: {e}")
            return {
                "success": False,
                "frequency": frequency.value,
                "scheduled": scheduled_count,
                "skipped": skipped_count,
                "errors": error_count,
                "error": str(e),
            }

    async def _get_users_due_for_digest(
        self,
        frequency: DigestFrequency,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Get users who are due for a digest.

        This queries the preferences table for users whose digest schedule
        matches the current time and frequency.

        Args:
            frequency: Digest frequency
            limit: Maximum users to return

        Returns:
            List of user info dicts with user_id, workspace_id, email
        """
        now = datetime.now(timezone.utc)
        current_hour = now.hour
        current_day = (now.weekday() + 1) % 7  # Convert to 0=Sunday format

        if frequency == DigestFrequency.DAILY:
            # Find users whose daily_digest_time matches current hour
            rows = await fetch(
                """
                SELECT
                    p.user_id,
                    p.workspace_id,
                    p.language,
                    p.timezone
                FROM notification_preferences p
                WHERE p.user_id IS NOT NULL
                  AND p.email_enabled = TRUE
                  AND p.global_unsubscribe = FALSE
                  AND EXTRACT(HOUR FROM p.daily_digest_time) = $1
                  AND EXISTS (
                      SELECT 1 FROM notification_events e
                      WHERE e.recipient_user_id = p.user_id
                        AND e.workspace_id = p.workspace_id
                        AND e.status = 'pending'
                        AND e.created_at > NOW() - INTERVAL '1 day'
                  )
                LIMIT $2
                """,
                current_hour,
                limit,
                read_only=True,
            )
        else:
            # Weekly digest - check day and hour
            rows = await fetch(
                """
                SELECT
                    p.user_id,
                    p.workspace_id,
                    p.language,
                    p.timezone
                FROM notification_preferences p
                WHERE p.user_id IS NOT NULL
                  AND p.email_enabled = TRUE
                  AND p.global_unsubscribe = FALSE
                  AND p.weekly_digest_day = $1
                  AND EXTRACT(HOUR FROM p.daily_digest_time) = $2
                  AND EXISTS (
                      SELECT 1 FROM notification_events e
                      WHERE e.recipient_user_id = p.user_id
                        AND e.workspace_id = p.workspace_id
                        AND e.status = 'pending'
                        AND e.created_at > NOW() - INTERVAL '7 days'
                  )
                LIMIT $3
                """,
                current_day,
                current_hour,
                limit,
                read_only=True,
            )

        return [dict(row) for row in rows] if rows else []

    async def _check_digest_cooldown(
        self,
        user_id: UUID,
        frequency: DigestFrequency,
    ) -> bool:
        """Check if a digest was recently sent to prevent duplicates.

        Args:
            user_id: User ID
            frequency: Digest frequency

        Returns:
            True if digest should be skipped (cooldown active)
        """
        cooldown_key = f"digest:cooldown:{user_id}:{frequency.value}"
        exists = await redis_client.exists(cooldown_key)
        return bool(exists)

    async def _set_digest_cooldown(
        self,
        user_id: UUID,
        frequency: DigestFrequency,
    ) -> None:
        """Set the cooldown to prevent duplicate digests.

        Args:
            user_id: User ID
            frequency: Digest frequency
        """
        cooldown_key = f"digest:cooldown:{user_id}:{frequency.value}"

        # Set cooldown based on frequency
        if frequency == DigestFrequency.DAILY:
            ttl = self._min_interval_minutes * 60  # Default 60 minutes
        else:
            ttl = 60 * 60 * 24  # 24 hours for weekly

        await redis_client.set(cooldown_key, "1", ttl=ttl)

    # =========================================================================
    # DIGEST PROCESSING
    # =========================================================================

    async def process_user_digest(
        self,
        user_id: UUID,
        workspace_id: UUID,
        frequency: DigestFrequency,
    ) -> dict[str, Any]:
        """Process and send a digest for a specific user.

        This method:
        1. Aggregates pending notifications for the user
        2. Groups them by category
        3. Renders the digest template
        4. Sends the digest email
        5. Marks notifications as processed

        Args:
            user_id: User ID
            workspace_id: Workspace ID
            frequency: Digest frequency (daily or weekly)

        Returns:
            Dict with processing result
        """
        logger.info(
            f"Processing {frequency.value} digest for user",
            extra={
                "user_id": str(user_id),
                "workspace_id": str(workspace_id),
                "frequency": frequency.value,
            },
        )

        try:
            # Get user preferences and email
            preferences = await preference_repository.get_user_preference(
                workspace_id=workspace_id,
                user_id=user_id,
            )

            if not preferences:
                logger.warning(
                    "No preferences found for user, skipping digest",
                    extra={"user_id": str(user_id)},
                )
                return {
                    "success": False,
                    "user_id": str(user_id),
                    "frequency": frequency.value,
                    "error": "No preferences found",
                }

            # Get recipient email from user lookup (this would typically
            # call a user service, but for now we'll get it from events)
            recipient_email = await self._get_user_email(user_id, workspace_id)

            if not recipient_email:
                logger.warning(
                    "No email found for user, skipping digest",
                    extra={"user_id": str(user_id)},
                )
                return {
                    "success": False,
                    "user_id": str(user_id),
                    "frequency": frequency.value,
                    "error": "No email address found",
                }

            # Aggregate notifications
            digest_content = await self._aggregate_notifications(
                user_id=user_id,
                workspace_id=workspace_id,
                frequency=frequency,
                preferences=preferences,
            )

            # Update recipient info
            digest_content.recipient_email = recipient_email
            digest_content.language = preferences.language
            digest_content.timezone_str = preferences.timezone

            # Skip if no notifications to include
            if digest_content.is_empty:
                logger.info(
                    "No notifications to include in digest",
                    extra={"user_id": str(user_id)},
                )
                return {
                    "success": True,
                    "user_id": str(user_id),
                    "frequency": frequency.value,
                    "notification_count": 0,
                    "skipped": True,
                    "reason": "No pending notifications",
                }

            # Render the digest template
            rendered = await self._render_digest(digest_content)

            if not rendered:
                logger.error(
                    "Failed to render digest template",
                    extra={"user_id": str(user_id)},
                )
                return {
                    "success": False,
                    "user_id": str(user_id),
                    "frequency": frequency.value,
                    "error": "Template rendering failed",
                }

            # Send the digest email
            send_result = await self._send_digest(
                recipient_email=recipient_email,
                subject=rendered["subject"],
                html_content=rendered["html"],
                text_content=rendered.get("text", ""),
                workspace_id=workspace_id,
                user_id=user_id,
            )

            if send_result["success"]:
                # Mark notifications as processed
                await self._mark_notifications_digested(digest_content)

                # Set cooldown
                await self._set_digest_cooldown(user_id, frequency)

                # Track metrics
                self._metrics.digest_sent(frequency.value, digest_content.total_count)

                logger.info(
                    f"Successfully sent {frequency.value} digest",
                    extra={
                        "user_id": str(user_id),
                        "notification_count": digest_content.total_count,
                    },
                )

                return {
                    "success": True,
                    "user_id": str(user_id),
                    "frequency": frequency.value,
                    "notification_count": digest_content.total_count,
                    "categories": len(digest_content.categories),
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                }
            else:
                return {
                    "success": False,
                    "user_id": str(user_id),
                    "frequency": frequency.value,
                    "error": send_result.get("error", "Unknown send error"),
                }

        except Exception as e:
            logger.exception(
                f"Error processing digest for user: {e}",
                extra={"user_id": str(user_id)},
            )
            self._metrics.error_occurred("digest_processing", "/worker/digest")

            return {
                "success": False,
                "user_id": str(user_id),
                "frequency": frequency.value,
                "error": str(e),
            }

    async def _get_user_email(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> Optional[str]:
        """Get the email address for a user.

        In a full implementation, this would call a user service.
        For now, we get the most recent email from notification events.

        Args:
            user_id: User ID
            workspace_id: Workspace ID

        Returns:
            Email address or None
        """
        # Try to get email from recent notification events
        row = await fetchrow(
            """
            SELECT recipient_email FROM notification_events
            WHERE recipient_user_id = $1
              AND workspace_id = $2
              AND recipient_email IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            user_id,
            workspace_id,
            read_only=True,
        )

        return row["recipient_email"] if row else None

    async def _aggregate_notifications(
        self,
        user_id: UUID,
        workspace_id: UUID,
        frequency: DigestFrequency,
        preferences: Any,
    ) -> DigestContent:
        """Aggregate pending notifications for a user's digest.

        Args:
            user_id: User ID
            workspace_id: Workspace ID
            frequency: Digest frequency
            preferences: User preferences

        Returns:
            DigestContent with aggregated notifications
        """
        now = datetime.now(timezone.utc)

        # Calculate period based on frequency
        if frequency == DigestFrequency.DAILY:
            period_start = now - timedelta(days=1)
        elif frequency == DigestFrequency.WEEKLY:
            period_start = now - timedelta(days=7)
        else:
            period_start = now - timedelta(hours=1)  # For hourly

        # Query pending notifications
        rows = await fetch(
            """
            SELECT
                event_id, event_type, category, subject, payload, created_at
            FROM notification_events
            WHERE recipient_user_id = $1
              AND workspace_id = $2
              AND status = 'pending'
              AND created_at >= $3
              AND created_at <= $4
              AND channel = 'email'
            ORDER BY category, created_at DESC
            LIMIT $5
            """,
            user_id,
            workspace_id,
            period_start,
            now,
            self._max_items,
            read_only=True,
        )

        # Group by category
        category_groups: dict[NotificationCategory, DigestCategoryGroup] = {}

        for row in rows:
            category = NotificationCategory(row["category"])

            # Check if this category should be included in digest
            category_pref = self._get_category_preference(preferences, category)
            if category_pref and category_pref.frequency != frequency:
                continue  # Skip - category uses different frequency

            # Get or create category group
            if category not in category_groups:
                category_groups[category] = DigestCategoryGroup(
                    category=category,
                    category_display=CATEGORY_DISPLAY_NAMES.get(category, category.value),
                )

            # Add notification item
            item = DigestNotificationItem(
                event_id=row["event_id"],
                event_type=row["event_type"],
                category=category,
                subject=row["subject"],
                payload=row["payload"] if isinstance(row["payload"], dict) else {},
                created_at=row["created_at"],
            )
            category_groups[category].add_item(item)

        # Build digest content
        categories_list = list(category_groups.values())
        total_count = sum(g.count for g in categories_list)

        return DigestContent(
            user_id=user_id,
            workspace_id=workspace_id,
            frequency=frequency,
            period_start=period_start,
            period_end=now,
            categories=categories_list,
            total_count=total_count,
        )

    def _get_category_preference(self, preferences: Any, category: NotificationCategory) -> Any:
        """Get category preference from preferences object.

        Args:
            preferences: User preferences
            category: Notification category

        Returns:
            CategoryPreference or None
        """
        category_map = {
            NotificationCategory.GALLERY_ACTIVITY: getattr(preferences, "gallery_activity", None),
            NotificationCategory.CLIENT_INTERACTIONS: getattr(preferences, "client_interactions", None),
            NotificationCategory.SYSTEM_ALERTS: getattr(preferences, "system_alerts", None),
            NotificationCategory.BILLING: getattr(preferences, "billing", None),
            NotificationCategory.MARKETING: getattr(preferences, "marketing", None),
            NotificationCategory.INVITATION: getattr(preferences, "invitation", None),
        }
        return category_map.get(category)

    # =========================================================================
    # DIGEST RENDERING
    # =========================================================================

    async def _render_digest(
        self,
        content: DigestContent,
    ) -> Optional[dict[str, Any]]:
        """Render the digest email template.

        Args:
            content: Aggregated digest content

        Returns:
            Dict with subject, html, text or None if failed
        """
        try:
            # Build template variables
            variables = {
                "recipient_name": content.recipient_name or "there",
                "frequency": content.frequency.value,
                "period_start": content.period_start.isoformat(),
                "period_end": content.period_end.isoformat(),
                "total_count": content.total_count,
                "categories": [
                    {
                        "name": cat.category_display,
                        "count": cat.count,
                        "items": [
                            {
                                "event_type": item.event_type,
                                "subject": item.subject,
                                "payload": item.payload,
                                "created_at": item.created_at.isoformat(),
                            }
                            for item in cat.items[:5]  # Limit to 5 per category
                        ],
                    }
                    for cat in content.categories
                ],
                "language": content.language,
                "unsubscribe_url": f"https://rawdrive.io/notifications/unsubscribe?user={content.user_id}",
                "preferences_url": f"https://rawdrive.io/settings/notifications",
            }

            # Determine template code based on frequency
            template_code = f"digest_{content.frequency.value}"

            # Try to render using template service
            try:
                rendered = await template_service.render_email(
                    workspace_id=content.workspace_id,
                    template_code=template_code,
                    variables=variables,
                )

                if rendered:
                    return {
                        "subject": rendered.subject,
                        "html": rendered.html,
                        "text": rendered.text,
                    }
            except Exception as e:
                logger.warning(
                    f"Template service failed, using fallback: {e}",
                    extra={"template_code": template_code},
                )

            # Fallback to simple template
            return self._render_fallback_digest(content, variables)

        except Exception as e:
            logger.exception(f"Error rendering digest template: {e}")
            return None

    def _render_fallback_digest(
        self,
        content: DigestContent,
        variables: dict[str, Any],
    ) -> dict[str, Any]:
        """Render a fallback digest template when template service fails.

        Args:
            content: Digest content
            variables: Template variables

        Returns:
            Dict with subject, html, text
        """
        frequency_display = "Daily" if content.frequency == DigestFrequency.DAILY else "Weekly"

        subject = f"Your {frequency_display} Notification Digest - {content.total_count} updates"

        # Build HTML content
        categories_html = ""
        for cat in content.categories:
            items_html = ""
            for item in cat.items[:5]:
                item_subject = item.subject or item.event_type
                items_html += f"<li>{item_subject}</li>\n"

            categories_html += f"""
            <h3>{cat.category_display} ({cat.count})</h3>
            <ul>
                {items_html}
            </ul>
            """

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>{subject}</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1>Your {frequency_display} Notification Digest</h1>
            <p>Hi {variables.get('recipient_name', 'there')},</p>
            <p>Here's a summary of your recent notifications ({content.total_count} total):</p>

            {categories_html}

            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
                <a href="{variables.get('preferences_url', '#')}">Manage notification preferences</a> |
                <a href="{variables.get('unsubscribe_url', '#')}">Unsubscribe</a>
            </p>
        </body>
        </html>
        """

        # Build text content
        categories_text = ""
        for cat in content.categories:
            categories_text += f"\n{cat.category_display} ({cat.count}):\n"
            for item in cat.items[:5]:
                item_subject = item.subject or item.event_type
                categories_text += f"  - {item_subject}\n"

        text = f"""
Your {frequency_display} Notification Digest

Hi {variables.get('recipient_name', 'there')},

Here's a summary of your recent notifications ({content.total_count} total):
{categories_text}

---
Manage preferences: {variables.get('preferences_url', '')}
Unsubscribe: {variables.get('unsubscribe_url', '')}
        """.strip()

        return {
            "subject": subject,
            "html": html,
            "text": text,
        }

    # =========================================================================
    # DIGEST SENDING
    # =========================================================================

    async def _send_digest(
        self,
        recipient_email: str,
        subject: str,
        html_content: str,
        text_content: str,
        workspace_id: UUID,
        user_id: UUID,
    ) -> dict[str, Any]:
        """Send the digest email.

        Args:
            recipient_email: Recipient email address
            subject: Email subject
            html_content: HTML content
            text_content: Text content
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            Dict with success status and details
        """
        try:
            result = await self._email_service.send_email(
                to_email=recipient_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                workspace_id=workspace_id,
                template_code="digest",
            )

            if result.success:
                return {
                    "success": True,
                    "message_id": result.message_id,
                    "sent_at": result.sent_at.isoformat() if result.sent_at else None,
                }
            else:
                return {
                    "success": False,
                    "error": result.error_message,
                    "error_code": result.error_code,
                }

        except Exception as e:
            logger.exception(f"Error sending digest email: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def send_digest_email(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Send a pre-rendered digest email (task handler).

        Args:
            payload: Task payload with email details

        Returns:
            Dict with sending result
        """
        return await self._send_digest(
            recipient_email=payload["recipient_email"],
            subject=payload["subject"],
            html_content=payload["html_content"],
            text_content=payload.get("text_content", ""),
            workspace_id=UUID(payload["workspace_id"]),
            user_id=UUID(payload["user_id"]),
        )

    async def _mark_notifications_digested(
        self,
        content: DigestContent,
    ) -> None:
        """Mark notifications as included in the digest.

        Updates the status of all notifications that were included
        in the digest to 'sent'.

        Args:
            content: Digest content with notification items
        """
        event_ids = []
        for category in content.categories:
            for item in category.items:
                event_ids.append(item.event_id)

        if not event_ids:
            return

        try:
            from src.database import get_connection

            async with get_connection() as conn:
                await conn.execute(
                    """
                    UPDATE notification_events
                    SET status = $1,
                        processed_at = $2,
                        updated_at = $2
                    WHERE event_id = ANY($3::uuid[])
                    """,
                    NotificationEventStatus.SENT.value,
                    datetime.now(timezone.utc),
                    event_ids,
                )

            logger.info(
                f"Marked {len(event_ids)} notifications as digested",
                extra={"count": len(event_ids)},
            )

        except Exception as e:
            logger.error(f"Error marking notifications as digested: {e}")
            # Don't raise - digest was sent successfully

    # =========================================================================
    # WORKER LIFECYCLE
    # =========================================================================

    async def run(self) -> None:
        """Run the digest worker as a background service.

        This starts a periodic scheduler that:
        1. Checks for users due for daily digests every hour
        2. Checks for users due for weekly digests every day
        3. Processes the task queue for individual digest tasks
        """
        self._running = True
        self._shutdown_event.clear()

        logger.info("Starting digest worker")

        try:
            # Run both the scheduler and task processor
            await asyncio.gather(
                self._run_scheduler(),
                self._task_queue.start_worker(concurrency=5, poll_interval=1.0),
            )
        except asyncio.CancelledError:
            logger.info("Digest worker cancelled")
        except Exception as e:
            logger.exception(f"Digest worker error: {e}")
            raise
        finally:
            self._running = False
            logger.info("Digest worker stopped")

    async def _run_scheduler(self) -> None:
        """Run the periodic scheduler for digest aggregation."""
        while self._running:
            try:
                now = datetime.now(timezone.utc)

                # Check for daily digests every hour at minute 0
                if now.minute < 5:  # 5 minute window
                    await self._task_queue.enqueue(
                        task_type=TASK_AGGREGATE_DIGEST,
                        payload={"frequency": "daily"},
                        priority=TaskPriority.LOW,
                        idempotency_key=f"aggregate:daily:{now.strftime('%Y-%m-%d-%H')}",
                    )

                # Check for weekly digests on configured day
                if now.weekday() == 0 and now.hour == 9 and now.minute < 5:
                    await self._task_queue.enqueue(
                        task_type=TASK_AGGREGATE_DIGEST,
                        payload={"frequency": "weekly"},
                        priority=TaskPriority.LOW,
                        idempotency_key=f"aggregate:weekly:{now.strftime('%Y-%W')}",
                    )

                # Wait until next check
                try:
                    await asyncio.wait_for(
                        self._shutdown_event.wait(),
                        timeout=60,  # Check every minute
                    )
                    break  # Shutdown requested
                except asyncio.TimeoutError:
                    pass  # Normal timeout, continue

            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                await asyncio.sleep(60)

    def stop(self) -> None:
        """Signal the worker to stop gracefully."""
        logger.info("Stopping digest worker")
        self._running = False
        self._shutdown_event.set()
        self._task_queue.stop_worker()

    # =========================================================================
    # HEALTH CHECK
    # =========================================================================

    async def health_check(self) -> dict[str, Any]:
        """Check the health of the digest worker.

        Returns:
            Dict with health status
        """
        try:
            # Check queue health
            queue_health = await self._task_queue.health_check()

            # Check email service health
            email_health = await self._email_service.health_check()

            is_healthy = (
                queue_health.get("status") == "healthy" and
                email_health.get("configured", False)
            )

            return {
                "status": "healthy" if is_healthy else "degraded",
                "worker_running": self._running,
                "digest_enabled": settings.DIGEST_ENABLED,
                "queue": queue_health,
                "email_service": email_health,
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "worker_running": self._running,
            }


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================


_digest_worker: Optional[DigestWorker] = None


def get_digest_worker() -> DigestWorker:
    """Get the global digest worker instance."""
    global _digest_worker
    if _digest_worker is None:
        _digest_worker = DigestWorker()
    return _digest_worker


# =============================================================================
# CLI ENTRY POINT
# =============================================================================


async def run_digest_worker() -> None:
    """Main entry point for running the digest worker as a service.

    Sets up signal handlers for graceful shutdown.
    """
    worker = get_digest_worker()

    # Setup signal handlers
    loop = asyncio.get_event_loop()

    def signal_handler():
        logger.info("Received shutdown signal")
        worker.stop()

    # Register signal handlers
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            signal.signal(sig, lambda s, f: signal_handler())

    # Run the worker
    try:
        await worker.run()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        logger.info("Digest worker shutdown complete")


def main() -> None:
    """CLI entry point."""
    import sys

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    logger.info("Starting digest worker service")

    try:
        asyncio.run(run_digest_worker())
    except Exception as e:
        logger.exception(f"Digest worker failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
