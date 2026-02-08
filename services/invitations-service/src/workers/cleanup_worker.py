"""Auto-deletion cleanup worker for GDPR/DPDP compliance.

This worker handles automatic deletion of expired invitations based on:
- Event date + retention period (default: 7 days after event)
- User-configured extension (up to 30 days for paid plans)

Runs daily at 2:00 AM IST via Celery Beat scheduler.

Tasks:
- T028: Create daily cleanup scheduler (2:00 AM IST)
- T029: Implement 3-day and 1-day pre-deletion email notifications
- T030: Add user-configurable retention extension
- T031: Create RSVP data export before deletion
- T032: Add deletion cascade for images, QR codes, calendar files

Feature: Digital Invitation Service - Auto-Deletion System (GDPR/DPDP Compliance)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from celery import shared_task
from celery.schedules import crontab
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from src.workers.celery_app import celery_app
from src.database import get_db_session

logger = logging.getLogger(__name__)

# Retention periods (in days)
DEFAULT_RETENTION_DAYS = 7
EXTENDED_RETENTION_DAYS = 30
WARNING_DAYS_BEFORE_DELETION = [3, 1]  # Send warnings 3 days and 1 day before

# IST timezone offset (UTC+5:30)
IST_OFFSET_HOURS = 5
IST_OFFSET_MINUTES = 30


# -----------------------------------------------------------------------------
# Celery Beat Schedule (2:00 AM IST daily)
# -----------------------------------------------------------------------------

# 2:00 AM IST = 20:30 UTC (previous day)
celery_app.conf.beat_schedule = {
    "cleanup-expired-invitations": {
        "task": "src.workers.cleanup_worker.cleanup_expired_invitations",
        "schedule": crontab(hour=20, minute=30),  # 2:00 AM IST
        "options": {"queue": "cleanup"},
    },
    "send-deletion-warnings": {
        "task": "src.workers.cleanup_worker.send_deletion_warnings",
        "schedule": crontab(hour=8, minute=0),  # 1:30 PM IST (reasonable notification time)
        "options": {"queue": "cleanup"},
    },
}


# Add cleanup queue to task routes
celery_app.conf.task_routes.update({
    "src.workers.cleanup_worker.*": {"queue": "cleanup"},
})


# -----------------------------------------------------------------------------
# Main Cleanup Task (T028)
# -----------------------------------------------------------------------------

@shared_task(
    name="src.workers.cleanup_worker.cleanup_expired_invitations",
    bind=True,
    max_retries=3,
    default_retry_delay=300,  # 5 minutes
)
def cleanup_expired_invitations(self) -> dict:
    """Delete invitations that have passed their auto-delete date.

    This task runs daily at 2:00 AM IST and:
    1. Queries for invitations where auto_delete_at <= now()
    2. Exports RSVP data if configured (T031)
    3. Deletes associated media from storage (T032)
    4. Marks invitation as deleted in database
    5. Publishes InvitationDeleted event for cleanup cascade

    Returns:
        dict with statistics: {deleted: int, errors: int, skipped: int}
    """
    import asyncio

    try:
        result = asyncio.get_event_loop().run_until_complete(
            _cleanup_expired_invitations_async()
        )
        logger.info(
            "Cleanup completed",
            extra={
                "deleted": result["deleted"],
                "errors": result["errors"],
                "skipped": result["skipped"],
            },
        )
        return result
    except Exception as exc:
        logger.error(f"Cleanup task failed: {exc}")
        raise self.retry(exc=exc)


async def _cleanup_expired_invitations_async() -> dict:
    """Async implementation of the cleanup logic."""
    from src.db.postgres import async_session_factory

    stats = {"deleted": 0, "errors": 0, "skipped": 0}
    now = datetime.utcnow()

    async with async_session_factory() as session:
        # Query invitations due for deletion
        # Using raw SQL for efficiency
        result = await session.execute(
            """
            SELECT
                id,
                workspace_id,
                title,
                slug,
                event_datetime,
                auto_delete_at,
                owner_email,
                export_rsvp_before_delete
            FROM digital_invitations
            WHERE
                auto_delete_at <= :now
                AND status != 'deleted'
                AND status != 'archived'
            ORDER BY auto_delete_at ASC
            LIMIT 100
            """,
            {"now": now},
        )
        invitations = result.fetchall()

        if not invitations:
            logger.info("No invitations due for deletion")
            return stats

        logger.info(f"Found {len(invitations)} invitations due for deletion")

        for inv in invitations:
            inv_id = inv.id
            workspace_id = inv.workspace_id

            try:
                # T031: Export RSVP data if configured
                if inv.export_rsvp_before_delete:
                    await _export_rsvp_data(session, inv_id, workspace_id, inv.owner_email)

                # T032: Delete associated media (images, QR codes, calendar files)
                await _delete_invitation_media(session, inv_id, workspace_id)

                # Mark invitation as deleted
                await session.execute(
                    """
                    UPDATE digital_invitations
                    SET
                        status = 'deleted',
                        deleted_at = :now,
                        updated_at = :now
                    WHERE id = :invitation_id
                    """,
                    {"invitation_id": inv_id, "now": now},
                )

                # Publish deletion event for any listeners
                await _publish_deletion_event(inv_id, workspace_id, inv.slug)

                await session.commit()
                stats["deleted"] += 1

                logger.info(
                    f"Deleted invitation",
                    extra={
                        "invitation_id": str(inv_id),
                        "title": inv.title,
                        "event_date": str(inv.event_datetime),
                    },
                )

            except Exception as e:
                logger.error(
                    f"Failed to delete invitation {inv_id}: {e}",
                    exc_info=True,
                )
                stats["errors"] += 1
                await session.rollback()

    return stats


# -----------------------------------------------------------------------------
# Pre-Deletion Warnings (T029)
# -----------------------------------------------------------------------------

@shared_task(
    name="src.workers.cleanup_worker.send_deletion_warnings",
    bind=True,
    max_retries=2,
)
def send_deletion_warnings(self) -> dict:
    """Send email warnings for invitations approaching deletion.

    Sends notifications at 3 days and 1 day before scheduled deletion.

    Returns:
        dict with statistics: {sent_3day: int, sent_1day: int, errors: int}
    """
    import asyncio

    try:
        result = asyncio.get_event_loop().run_until_complete(
            _send_deletion_warnings_async()
        )
        return result
    except Exception as exc:
        logger.error(f"Deletion warning task failed: {exc}")
        raise self.retry(exc=exc)


async def _send_deletion_warnings_async() -> dict:
    """Async implementation of warning notifications."""
    from src.db.postgres import async_session_factory
    from src.workers.email_worker import send_email

    stats = {"sent_3day": 0, "sent_1day": 0, "errors": 0}
    now = datetime.utcnow()

    async with async_session_factory() as session:
        for days_before in WARNING_DAYS_BEFORE_DELETION:
            warning_date = now + timedelta(days=days_before)
            warning_date_start = warning_date.replace(hour=0, minute=0, second=0)
            warning_date_end = warning_date.replace(hour=23, minute=59, second=59)

            # Find invitations being deleted on warning_date
            result = await session.execute(
                """
                SELECT
                    id,
                    workspace_id,
                    title,
                    slug,
                    owner_email,
                    auto_delete_at
                FROM digital_invitations
                WHERE
                    auto_delete_at BETWEEN :start AND :end
                    AND status NOT IN ('deleted', 'archived')
                    AND deletion_warning_sent_at IS NULL
                    OR (deletion_warning_sent_at < :cutoff AND :days = 1)
                """,
                {
                    "start": warning_date_start,
                    "end": warning_date_end,
                    "cutoff": now - timedelta(days=2),  # Only send 1-day if 3-day was sent
                    "days": days_before,
                },
            )
            invitations = result.fetchall()

            for inv in invitations:
                try:
                    # Send warning email
                    await _send_deletion_warning_email(
                        owner_email=inv.owner_email,
                        invitation_title=inv.title,
                        slug=inv.slug,
                        delete_date=inv.auto_delete_at,
                        days_remaining=days_before,
                    )

                    # Mark warning as sent
                    await session.execute(
                        """
                        UPDATE digital_invitations
                        SET deletion_warning_sent_at = :now
                        WHERE id = :invitation_id
                        """,
                        {"invitation_id": inv.id, "now": now},
                    )
                    await session.commit()

                    if days_before == 3:
                        stats["sent_3day"] += 1
                    else:
                        stats["sent_1day"] += 1

                except Exception as e:
                    logger.error(f"Failed to send deletion warning for {inv.id}: {e}")
                    stats["errors"] += 1
                    await session.rollback()

    return stats


async def _send_deletion_warning_email(
    owner_email: str,
    invitation_title: str,
    slug: str,
    delete_date: datetime,
    days_remaining: int,
) -> None:
    """Send deletion warning email to invitation owner."""
    from src.workers.email_worker import send_email_async

    subject = f"Your invitation will be deleted in {days_remaining} day(s)"

    # Format delete date for display (IST)
    delete_date_ist = delete_date + timedelta(hours=IST_OFFSET_HOURS, minutes=IST_OFFSET_MINUTES)
    formatted_date = delete_date_ist.strftime("%B %d, %Y at %I:%M %p IST")

    body_html = f"""
    <h2>Invitation Deletion Notice</h2>
    <p>Your invitation <strong>{invitation_title}</strong> is scheduled for automatic deletion.</p>

    <p><strong>Deletion Date:</strong> {formatted_date}</p>
    <p><strong>Time Remaining:</strong> {days_remaining} day(s)</p>

    <h3>What will be deleted:</h3>
    <ul>
        <li>All invitation images and media</li>
        <li>QR codes and calendar files</li>
        <li>RSVP responses (unless exported)</li>
        <li>View analytics</li>
    </ul>

    <h3>Actions you can take:</h3>
    <ul>
        <li><a href="https://rawdrive.in/invitations/{slug}/export">Export RSVP data</a></li>
        <li><a href="https://rawdrive.in/invitations/{slug}/settings">Extend retention period</a> (paid plans)</li>
    </ul>

    <p style="color: #666; font-size: 12px;">
        This automatic deletion helps us comply with data protection regulations (GDPR/DPDP).
        If you have questions, please contact support@rawdrive.in.
    </p>
    """

    await send_email_async(
        to_email=owner_email,
        subject=subject,
        body_html=body_html,
        template="deletion_warning",
    )


# -----------------------------------------------------------------------------
# RSVP Export (T031)
# -----------------------------------------------------------------------------

async def _export_rsvp_data(
    session: AsyncSession,
    invitation_id: UUID,
    workspace_id: UUID,
    owner_email: str,
) -> Optional[str]:
    """Export RSVP data to CSV and email to owner.

    Args:
        session: Database session
        invitation_id: Invitation UUID
        workspace_id: Workspace UUID
        owner_email: Email to send export to

    Returns:
        Object key of exported CSV file, or None if no RSVPs
    """
    import csv
    import io

    from src.services.r2_storage_service import get_storage_service
    from src.workers.email_worker import send_email_with_attachment_async

    # Fetch all RSVPs for this invitation
    result = await session.execute(
        """
        SELECT
            g.name AS guest_name,
            g.email AS guest_email,
            g.phone AS guest_phone,
            r.status AS rsvp_status,
            r.party_size,
            r.dietary_preferences,
            r.message,
            r.created_at AS responded_at
        FROM invitation_rsvps r
        JOIN invitation_guests g ON r.guest_id = g.id
        WHERE r.invitation_id = :invitation_id
        ORDER BY r.created_at DESC
        """,
        {"invitation_id": invitation_id},
    )
    rsvps = result.fetchall()

    if not rsvps:
        logger.info(f"No RSVPs to export for invitation {invitation_id}")
        return None

    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Guest Name",
        "Email",
        "Phone",
        "Status",
        "Party Size",
        "Dietary Preferences",
        "Message",
        "Response Date",
    ])

    for rsvp in rsvps:
        writer.writerow([
            rsvp.guest_name,
            rsvp.guest_email or "",
            rsvp.guest_phone or "",
            rsvp.rsvp_status,
            rsvp.party_size or 1,
            rsvp.dietary_preferences or "",
            rsvp.message or "",
            rsvp.responded_at.isoformat() if rsvp.responded_at else "",
        ])

    csv_content = output.getvalue()

    # Upload to storage
    storage = get_storage_service()
    object_key = f"exports/invitations/{invitation_id}/rsvps-export.csv"
    await storage.upload_bytes(
        object_key=object_key,
        content=csv_content.encode("utf-8"),
        content_type="text/csv",
    )

    # Email export to owner
    await send_email_with_attachment_async(
        to_email=owner_email,
        subject="Your RSVP Export - Invitation Data Backup",
        body_html=f"""
        <h2>RSVP Data Export</h2>
        <p>As requested, here is your RSVP data export before automatic deletion.</p>
        <p><strong>Total Responses:</strong> {len(rsvps)}</p>
        <p>Please save this file for your records.</p>
        """,
        attachment_name="rsvps-export.csv",
        attachment_content=csv_content.encode("utf-8"),
        attachment_type="text/csv",
    )

    logger.info(
        f"Exported RSVP data for invitation {invitation_id}",
        extra={"rsvp_count": len(rsvps), "object_key": object_key},
    )

    return object_key


# -----------------------------------------------------------------------------
# Media Deletion Cascade (T032)
# -----------------------------------------------------------------------------

async def _delete_invitation_media(
    session: AsyncSession,
    invitation_id: UUID,
    workspace_id: UUID,
) -> int:
    """Delete all media associated with an invitation.

    Deletes from R2 storage:
    - Invitation images (original, thumbnails, optimized)
    - QR codes (PNG, SVG, PDF)
    - Calendar files (.ics)
    - Cover images and video thumbnails

    Args:
        session: Database session
        invitation_id: Invitation UUID
        workspace_id: Workspace UUID

    Returns:
        Count of deleted objects
    """
    from src.services.r2_storage_service import get_storage_service

    storage = get_storage_service()
    deleted_count = 0

    # Get all media records
    result = await session.execute(
        """
        SELECT object_key, media_type
        FROM invitation_media
        WHERE invitation_id = :invitation_id
        """,
        {"invitation_id": invitation_id},
    )
    media_records = result.fetchall()

    # Delete each media file from storage
    for record in media_records:
        try:
            await storage.delete(record.object_key)
            deleted_count += 1

            # Also delete derived files (thumbnails, optimized versions)
            for suffix in ["_thumb", "_medium", "_large", "_webp"]:
                derived_key = record.object_key.rsplit(".", 1)[0] + suffix
                try:
                    await storage.delete(derived_key)
                except Exception:
                    pass  # Derived file may not exist

        except Exception as e:
            logger.warning(f"Failed to delete media {record.object_key}: {e}")

    # Delete media records from database
    await session.execute(
        """
        DELETE FROM invitation_media
        WHERE invitation_id = :invitation_id
        """,
        {"invitation_id": invitation_id},
    )

    # Delete image records
    await session.execute(
        """
        DELETE FROM invitation_images
        WHERE invitation_id = :invitation_id
        """,
        {"invitation_id": invitation_id},
    )

    # Delete QR code records and files
    result = await session.execute(
        """
        SELECT qr_code_url
        FROM digital_invitations
        WHERE id = :invitation_id
        """,
        {"invitation_id": invitation_id},
    )
    inv = result.fetchone()
    if inv and inv.qr_code_url:
        try:
            # Extract object key from URL
            qr_key = inv.qr_code_url.split("/")[-1] if "/" in inv.qr_code_url else inv.qr_code_url
            await storage.delete(f"qrcodes/{invitation_id}/{qr_key}")
            deleted_count += 1
        except Exception as e:
            logger.warning(f"Failed to delete QR code: {e}")

    # Delete calendar files
    try:
        await storage.delete(f"calendars/{invitation_id}/event.ics")
        deleted_count += 1
    except Exception:
        pass  # Calendar file may not exist

    logger.info(
        f"Deleted {deleted_count} media files for invitation {invitation_id}"
    )

    return deleted_count


# -----------------------------------------------------------------------------
# Event Publishing
# -----------------------------------------------------------------------------

async def _publish_deletion_event(
    invitation_id: UUID,
    workspace_id: UUID,
    slug: str,
) -> None:
    """Publish InvitationDeleted event for downstream cleanup.

    Other services can listen for this event to clean up related data.
    """
    from src.cache.redis_client import get_redis

    redis = await get_redis()

    event = {
        "event_type": "invitation.deleted",
        "invitation_id": str(invitation_id),
        "workspace_id": str(workspace_id),
        "slug": slug,
        "timestamp": datetime.utcnow().isoformat(),
    }

    await redis.publish("invitation_events", str(event))
    logger.debug(f"Published deletion event for invitation {invitation_id}")


# -----------------------------------------------------------------------------
# Retention Extension (T030)
# -----------------------------------------------------------------------------

async def extend_retention(
    invitation_id: UUID,
    workspace_id: UUID,
    additional_days: int,
    max_days: int = EXTENDED_RETENTION_DAYS,
) -> datetime:
    """Extend the retention period for an invitation.

    Args:
        invitation_id: Invitation UUID
        workspace_id: Workspace UUID
        additional_days: Days to extend by
        max_days: Maximum total retention from event date

    Returns:
        New auto_delete_at datetime

    Raises:
        ValueError: If extension exceeds maximum allowed
    """
    from src.db.postgres import async_session_factory

    async with async_session_factory() as session:
        result = await session.execute(
            """
            SELECT event_datetime, auto_delete_at
            FROM digital_invitations
            WHERE id = :invitation_id AND workspace_id = :workspace_id
            """,
            {"invitation_id": invitation_id, "workspace_id": workspace_id},
        )
        inv = result.fetchone()

        if not inv:
            raise ValueError("Invitation not found")

        # Calculate new delete date
        current_delete = inv.auto_delete_at or (inv.event_datetime + timedelta(days=DEFAULT_RETENTION_DAYS))
        new_delete = current_delete + timedelta(days=additional_days)

        # Check maximum
        max_delete = inv.event_datetime + timedelta(days=max_days)
        if new_delete > max_delete:
            raise ValueError(f"Cannot extend beyond {max_days} days after event date")

        # Update
        await session.execute(
            """
            UPDATE digital_invitations
            SET auto_delete_at = :new_delete, updated_at = :now
            WHERE id = :invitation_id
            """,
            {
                "invitation_id": invitation_id,
                "new_delete": new_delete,
                "now": datetime.utcnow(),
            },
        )
        await session.commit()

        logger.info(
            f"Extended retention for invitation {invitation_id} to {new_delete}"
        )

        return new_delete
