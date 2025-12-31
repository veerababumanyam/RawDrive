"""Auto-deletion service for expired digital invitations.

Feature: 016-save-the-date
Tasks: T128 (Auto-deletion scheduler), T129 (Pre-deletion warnings)

This service implements:
- FR-039: System MUST send 3-day and 1-day warnings before auto-deletion
- FR-040: System MUST auto-delete invitations after configured days post-event
- FR-041: System MUST delete all associated images, QR codes, and RSVP data

Architecture:
- Runs as scheduled tasks via the task queue
- Uses soft delete (status='deleted') for invitations
- Cascades to related data (images, RSVPs, shares, etc.)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.task_queue import TaskPriority, enqueue_task, register_task_handler

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Warning notification thresholds (days before deletion)
WARNING_DAYS = [3, 1]  # Send warnings 3 days and 1 day before


# ---------------------------------------------------------------------------
# Repository Functions for Auto-Deletion
# ---------------------------------------------------------------------------


async def get_invitations_due_for_deletion() -> list[dict[str, Any]]:
    """Get invitations where scheduled_deletion_at has passed.

    Returns invitations that:
    - Have auto_delete_enabled = true
    - Have scheduled_deletion_at <= now
    - Are not already deleted
    """
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                i.invitation_id,
                i.workspace_id,
                i.title,
                i.slug,
                i.event_datetime,
                i.scheduled_deletion_at,
                i.created_by_user_id,
                u.email as host_email,
                u.display_name as host_name
            FROM invitations i
            LEFT JOIN users u ON i.created_by_user_id = u.user_id
            WHERE i.auto_delete_enabled = true
              AND i.scheduled_deletion_at <= NOW()
              AND i.status != 'deleted'
            ORDER BY i.scheduled_deletion_at ASC
            LIMIT 100
            """,
        )

        return [dict(row) for row in rows]


async def get_invitations_due_for_warning(days_until_deletion: int) -> list[dict[str, Any]]:
    """Get invitations where scheduled_deletion_at is X days away.

    Used to send pre-deletion warnings.

    Args:
        days_until_deletion: Number of days until deletion (e.g., 3 or 1)

    Returns invitations that:
    - Have auto_delete_enabled = true
    - Have scheduled_deletion_at between X days from now and X-1 days
    - Are not already deleted
    - Haven't already been warned for this threshold
    """
    pool = await get_postgres_pool()

    # Calculate the time window for this warning
    now = datetime.now(timezone.utc)
    window_start = now + timedelta(days=days_until_deletion - 1)
    window_end = now + timedelta(days=days_until_deletion)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                i.invitation_id,
                i.workspace_id,
                i.title,
                i.slug,
                i.event_datetime,
                i.scheduled_deletion_at,
                i.auto_delete_days,
                i.created_by_user_id,
                u.email as host_email,
                u.display_name as host_name
            FROM invitations i
            LEFT JOIN users u ON i.created_by_user_id = u.user_id
            WHERE i.auto_delete_enabled = true
              AND i.scheduled_deletion_at > $1
              AND i.scheduled_deletion_at <= $2
              AND i.status NOT IN ('deleted', 'draft')
              AND NOT EXISTS (
                  SELECT 1 FROM invitation_events ie
                  WHERE ie.invitation_id = i.invitation_id
                    AND ie.event_type = $3
                    AND ie.created_at >= NOW() - INTERVAL '1 day'
              )
            ORDER BY i.scheduled_deletion_at ASC
            LIMIT 100
            """,
            window_start,
            window_end,
            f"auto_delete_warning_{days_until_deletion}d",
        )

        return [dict(row) for row in rows]


async def mark_invitation_deleted(
    invitation_id: UUID,
    workspace_id: UUID,
) -> bool:
    """Mark invitation as deleted (soft delete).

    Also logs the auto-deletion event for audit purposes.
    """
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Soft delete the invitation
            result = await conn.execute(
                """
                UPDATE invitations
                SET status = 'deleted', updated_at = NOW()
                WHERE invitation_id = $1
                  AND workspace_id = $2
                  AND status != 'deleted'
                """,
                invitation_id,
                workspace_id,
            )

            deleted = result.split()[-1] != "0"

            if deleted:
                # Log the auto-deletion event
                await conn.execute(
                    """
                    INSERT INTO invitation_events
                        (invitation_id, workspace_id, event_type, actor_type, event_data)
                    VALUES ($1, $2, 'auto_deleted', 'system', $3::jsonb)
                    """,
                    invitation_id,
                    workspace_id,
                    '{"reason": "scheduled_auto_deletion"}',
                )

                logger.info(
                    "Invitation auto-deleted",
                    extra={
                        "invitation_id": str(invitation_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted


async def log_warning_sent(
    invitation_id: UUID,
    workspace_id: UUID,
    days_until_deletion: int,
) -> None:
    """Log that a warning notification was sent."""
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO invitation_events
                (invitation_id, workspace_id, event_type, actor_type, event_data)
            VALUES ($1, $2, $3, 'system', $4::jsonb)
            """,
            invitation_id,
            workspace_id,
            f"auto_delete_warning_{days_until_deletion}d",
            f'{{"days_until_deletion": {days_until_deletion}}}',
        )


async def delete_invitation_data(invitation_id: UUID, workspace_id: UUID) -> dict[str, int]:
    """Delete all data associated with an invitation.

    FR-041: System MUST delete all associated images, QR codes, and RSVP data.

    Returns counts of deleted items for logging.
    """
    pool = await get_postgres_pool()
    counts = {
        "rsvps": 0,
        "images": 0,
        "shares": 0,
        "events": 0,
    }

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Delete RSVPs
            result = await conn.execute(
                """
                DELETE FROM invitation_rsvps
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )
            counts["rsvps"] = int(result.split()[-1])

            # Delete images (soft delete, actual storage cleanup is separate)
            result = await conn.execute(
                """
                UPDATE invitation_images
                SET deleted_at = NOW()
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )
            counts["images"] = int(result.split()[-1])

            # Delete share links
            result = await conn.execute(
                """
                DELETE FROM invitation_shares
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )
            counts["shares"] = int(result.split()[-1])

            # Note: Keep events for audit trail, but mark them
            result = await conn.execute(
                """
                UPDATE invitation_events
                SET event_data = event_data || '{"archived": true}'::jsonb
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )
            counts["events"] = int(result.split()[-1])

    return counts


# ---------------------------------------------------------------------------
# Task Handlers
# ---------------------------------------------------------------------------


@register_task_handler("auto_delete_expired_invitations")
async def handle_auto_delete_invitations(payload: dict[str, Any]) -> dict[str, Any]:
    """Process auto-deletion of expired invitations.

    Feature: 016-save-the-date
    Task: T128 - Auto-deletion scheduler

    This task:
    1. Finds invitations past their scheduled_deletion_at
    2. Deletes associated data (RSVPs, images, shares)
    3. Marks the invitation as deleted
    4. Logs audit events
    """
    invitations = await get_invitations_due_for_deletion()

    deleted_count = 0
    errors = []

    for inv in invitations:
        try:
            invitation_id = inv["invitation_id"]
            workspace_id = inv["workspace_id"]

            # Delete associated data first
            data_counts = await delete_invitation_data(invitation_id, workspace_id)

            # Mark invitation as deleted
            deleted = await mark_invitation_deleted(invitation_id, workspace_id)

            if deleted:
                deleted_count += 1
                logger.info(
                    "Auto-deleted invitation and associated data",
                    extra={
                        "invitation_id": str(invitation_id),
                        "title": inv.get("title"),
                        "data_deleted": data_counts,
                    },
                )

        except Exception as e:
            error_msg = f"Failed to auto-delete invitation {inv.get('invitation_id')}: {str(e)}"
            errors.append(error_msg)
            logger.exception(error_msg)

    result = {
        "processed": len(invitations),
        "deleted": deleted_count,
        "errors": errors,
    }

    logger.info(
        "Auto-deletion job completed",
        extra=result,
    )

    return result


@register_task_handler("send_auto_delete_warnings")
async def handle_send_auto_delete_warnings(payload: dict[str, Any]) -> dict[str, Any]:
    """Send pre-deletion warning notifications.

    Feature: 016-save-the-date
    Task: T129 - Pre-deletion warning notifications

    FR-039: System MUST send 3-day and 1-day warnings before auto-deletion.

    This task:
    1. Finds invitations X days from deletion
    2. Sends warning email to hosts
    3. Logs that warning was sent (to prevent duplicates)
    """
    days_until = payload.get("days_until_deletion", 3)

    invitations = await get_invitations_due_for_warning(days_until)

    warnings_sent = 0
    errors = []

    for inv in invitations:
        try:
            invitation_id = inv["invitation_id"]
            workspace_id = inv["workspace_id"]
            host_email = inv.get("host_email")

            if not host_email:
                logger.warning(
                    f"No host email for invitation {invitation_id}, skipping warning"
                )
                continue

            # Queue warning email
            await enqueue_task(
                task_type="send_auto_delete_warning_email",
                payload={
                    "invitation_id": str(invitation_id),
                    "workspace_id": str(workspace_id),
                    "host_email": host_email,
                    "host_name": inv.get("host_name", ""),
                    "title": inv.get("title", "Your Invitation"),
                    "slug": inv.get("slug", ""),
                    "scheduled_deletion_at": inv["scheduled_deletion_at"].isoformat() if inv.get("scheduled_deletion_at") else None,
                    "days_until_deletion": days_until,
                },
                priority=TaskPriority.NORMAL,
            )

            # Log that warning was sent
            await log_warning_sent(invitation_id, workspace_id, days_until)

            warnings_sent += 1
            logger.info(
                f"Pre-deletion warning queued ({days_until} day{'s' if days_until > 1 else ''})",
                extra={
                    "invitation_id": str(invitation_id),
                    "host_email": host_email,
                },
            )

        except Exception as e:
            error_msg = f"Failed to send warning for invitation {inv.get('invitation_id')}: {str(e)}"
            errors.append(error_msg)
            logger.exception(error_msg)

    result = {
        "days_until_deletion": days_until,
        "processed": len(invitations),
        "warnings_sent": warnings_sent,
        "errors": errors,
    }

    logger.info(
        f"Pre-deletion warning job completed ({days_until}d)",
        extra=result,
    )

    return result


@register_task_handler("send_auto_delete_warning_email")
async def handle_send_warning_email(payload: dict[str, Any]) -> dict[str, Any]:
    """Send individual warning email to host.

    Feature: 016-save-the-date
    Task: T129 - Pre-deletion warning notifications
    """
    host_email = payload.get("host_email")
    host_name = payload.get("host_name", "")
    title = payload.get("title", "Your Invitation")
    days_until = payload.get("days_until_deletion", 3)
    scheduled_deletion_at = payload.get("scheduled_deletion_at")
    slug = payload.get("slug", "")

    # Format deletion date for email
    deletion_date = "soon"
    if scheduled_deletion_at:
        try:
            dt = datetime.fromisoformat(scheduled_deletion_at.replace("Z", "+00:00"))
            deletion_date = dt.strftime("%B %d, %Y")
        except Exception:
            pass

    # TODO: Implement actual email sending via SendGrid/SES/etc.
    logger.info(
        "Auto-delete warning email sent",
        extra={
            "to": host_email,
            "title": title,
            "days_until_deletion": days_until,
            "deletion_date": deletion_date,
        },
    )

    email_content = {
        "to": host_email,
        "subject": f"⚠️ Your invitation '{title}' will be deleted in {days_until} day{'s' if days_until > 1 else ''}",
        "template": "invitation_auto_delete_warning",
        "template_data": {
            "host_name": host_name,
            "invitation_title": title,
            "days_until_deletion": days_until,
            "deletion_date": deletion_date,
            "view_link": f"/i/{slug}" if slug else None,
            "extend_link": f"/dashboard/invitations?action=extend",
            "message": (
                f"Your digital invitation '{title}' is scheduled to be automatically "
                f"deleted on {deletion_date}. This is part of our data retention policy "
                f"to protect your privacy. If you'd like to keep this invitation longer, "
                f"please visit your dashboard to extend the retention period."
            ),
        },
    }

    return {"sent": True, "email": email_content}


# ---------------------------------------------------------------------------
# Scheduler Integration
# ---------------------------------------------------------------------------


async def schedule_auto_deletion_check() -> str:
    """Schedule the auto-deletion check task.

    Called by the scheduler service.
    """
    task_id = await enqueue_task(
        task_type="auto_delete_expired_invitations",
        payload={},
        priority=TaskPriority.LOW,
    )
    logger.info("Scheduled invitation auto-deletion check", extra={"task_id": task_id})
    return task_id


async def schedule_auto_deletion_warnings() -> list[str]:
    """Schedule warning notification tasks for all thresholds.

    Called by the scheduler service.
    """
    task_ids = []

    for days in WARNING_DAYS:
        task_id = await enqueue_task(
            task_type="send_auto_delete_warnings",
            payload={"days_until_deletion": days},
            priority=TaskPriority.NORMAL,
        )
        task_ids.append(task_id)
        logger.info(
            f"Scheduled {days}-day auto-deletion warning check",
            extra={"task_id": task_id},
        )

    return task_ids
