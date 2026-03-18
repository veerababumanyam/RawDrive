"""
Email worker for sending invitation emails via Postal.

Migrated from SendGrid to Postal (self-hosted) as part of the unified
email infrastructure. Uses PostalClient for all outbound emails.

Security: All user-provided content is HTML-escaped before inclusion
in email templates to prevent XSS attacks.

Tracking: Email delivery status is tracked in email_send_log table
for bulk invite operations.
"""

import asyncio
from typing import List, Optional

from .celery_app import celery_app
from src.config import settings
from src.logging import get_logger
from src.services.postal_client import PostalClient, get_postal_client
from src.utils.security import (
    safe_html_escape,
    safe_url,
    sanitize_email_template_data,
)

logger = get_logger(__name__)

# Retry configuration
MAX_RETRIES = 3
BASE_RETRY_DELAY = 60  # seconds


def _run_async(coro):
    """Helper to run async code from sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


async def _update_send_log_status(
    send_log_id: Optional[str],
    status: str,
    error_message: Optional[str] = None,
) -> None:
    """Update email_send_log entry status."""
    if not send_log_id:
        return

    try:
        from src.services.bulk_invite_service import BulkInviteService, SendStatus
        service = BulkInviteService()
        await service.update_send_status(
            entry_id=send_log_id,
            status=SendStatus(status),
            error_message=error_message,
        )
    except Exception as e:
        logger.warning(
            "send_log_update_failed",
            send_log_id=send_log_id,
            error=str(e),
        )


def _build_invitation_html(safe_name: str, safe_invitation_url: str) -> str:
    """Build the invitation email HTML template with inline CSS."""
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
    <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0; font-size: 28px;">RawDrive</h1>
        </div>
        <h2 style="color: #1f2937; margin-bottom: 20px;">You're Invited!</h2>
        <p style="color: #4b5563; line-height: 1.6;">
            Hello {safe_name}! You've been invited to a special event.
        </p>
        <div style="text-align: center; margin: 40px 0;">
            <a href="{safe_invitation_url}"
               style="background-color: #4F46E5; color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: 600; font-size: 16px;">
                View Invitation
            </a>
        </div>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            If you weren't expecting this invitation, you can safely ignore this email.
        </p>
    </div>
</body>
</html>"""


def _build_reminder_html(
    safe_name: str, safe_invitation_url: str, safe_days: str,
) -> str:
    """Build the reminder email HTML template with inline CSS."""
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
    <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0; font-size: 28px;">RawDrive</h1>
        </div>
        <h2 style="color: #1f2937; margin-bottom: 20px;">Reminder: We're waiting for your RSVP!</h2>
        <p style="color: #4b5563; line-height: 1.6;">
            Hello {safe_name}! This is a friendly reminder that we haven't received your RSVP yet.
            The event is in {safe_days} days.
        </p>
        <div style="text-align: center; margin: 40px 0;">
            <a href="{safe_invitation_url}"
               style="background-color: #4F46E5; color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: 600; font-size: 16px;">
                View Invitation &amp; RSVP
            </a>
        </div>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            If you've already responded, please disregard this email.
        </p>
    </div>
</body>
</html>"""


@celery_app.task(bind=True, max_retries=MAX_RETRIES)
def send_invitation_email(
    self,
    guest_id: str,
    invitation_id: str,
    workspace_id: str,
    recipient_email: str,
    recipient_name: str,
    invitation_url: str,
    template_id: Optional[str] = None,
    send_log_id: Optional[str] = None,
):
    """
    Send an invitation email to a guest via Postal.

    Args:
        guest_id: UUID of the guest
        invitation_id: UUID of the invitation
        workspace_id: UUID of the workspace
        recipient_email: Email address to send to
        recipient_name: Name of the recipient
        invitation_url: URL to view the invitation
        template_id: Optional template ID (reserved for future use)
        send_log_id: Optional email_send_log entry ID for tracking
    """
    postal = get_postal_client()
    if postal is None:
        logger.warning("Postal not configured, skipping email")
        if send_log_id:
            _run_async(_update_send_log_status(send_log_id, "failed", "Postal not configured"))
        return {"status": "skipped", "reason": "Postal not configured"}

    try:
        # Escape all user-provided content before HTML interpolation
        safe_name = safe_html_escape(recipient_name)
        safe_invitation_url = safe_url(invitation_url)

        html_content = _build_invitation_html(safe_name, safe_invitation_url)
        text_content = (
            f"Hello {recipient_name}!\n\n"
            f"You've been invited to a special event.\n\n"
            f"View your invitation: {invitation_url}\n\n"
            f"If you weren't expecting this invitation, you can safely ignore this email."
        )

        from_addr = f"{settings.POSTAL_FROM_NAME} <{settings.POSTAL_FROM_EMAIL}>"

        result = _run_async(postal.send_message(
            to=[recipient_email],
            subject="You're Invited!",
            from_addr=from_addr,
            html_body=html_content,
            plain_body=text_content,
            tag="invitation",
        ))

        # Update send log status to sent
        if send_log_id:
            _run_async(_update_send_log_status(send_log_id, "sent"))

        # Log without PII - use guest_id instead of email
        logger.info(
            "invitation_email_sent",
            guest_id=guest_id,
            invitation_id=invitation_id,
            message_id=result.get("message_id"),
        )

        return {
            "status": "sent",
            "guest_id": guest_id,
            "message_id": result.get("message_id"),
        }

    except Exception as e:
        # Log without PII - use guest_id instead of email
        logger.error(
            "invitation_email_failed",
            guest_id=guest_id,
            invitation_id=invitation_id,
            error_type=type(e).__name__,
            retry_count=self.request.retries if self else 0,
        )

        # Check if we've exhausted retries
        retries = self.request.retries if self else MAX_RETRIES
        if retries >= MAX_RETRIES:
            if send_log_id:
                _run_async(_update_send_log_status(
                    send_log_id,
                    "failed",
                    f"Max retries exceeded: {type(e).__name__}",
                ))
            return {"status": "failed", "guest_id": guest_id, "error": str(e)}

        # Retry with exponential backoff (60s, 120s, 240s)
        countdown = BASE_RETRY_DELAY * (2 ** retries)
        raise self.retry(exc=e, countdown=countdown)


@celery_app.task(bind=True)
def send_bulk_invitations(
    self,
    invitation_id: str,
    workspace_id: str,
    guest_ids: List[str],
    invitation_url_template: str,
    template_id: Optional[str] = None,
):
    """
    Send invitations to multiple guests.

    Args:
        invitation_id: UUID of the invitation
        workspace_id: UUID of the workspace
        guest_ids: List of guest UUIDs to send to
        invitation_url_template: URL template with {guest_id} placeholder
        template_id: Optional template ID (reserved for future use)
    """
    sent = 0
    failed = 0
    errors = []

    for guest_id in guest_ids:
        try:
            # Queue individual email task
            invitation_url = invitation_url_template.format(guest_id=guest_id)
            send_invitation_email.delay(
                guest_id=guest_id,
                invitation_id=invitation_id,
                workspace_id=workspace_id,
                recipient_email="",  # Would be fetched from DB
                recipient_name="",   # Would be fetched from DB
                invitation_url=invitation_url,
                template_id=template_id,
            )
            sent += 1
        except Exception as e:
            failed += 1
            errors.append({"guest_id": guest_id, "error": str(e)})

    return {
        "total_queued": sent,
        "failed": failed,
        "errors": errors[:10],  # Limit errors returned
    }


@celery_app.task
def send_reminder_email(
    guest_id: str,
    invitation_id: str,
    workspace_id: str,
    recipient_email: str,
    recipient_name: str,
    invitation_url: str,
    days_until_event: int,
):
    """
    Send a reminder email to a guest who hasn't responded.
    """
    postal = get_postal_client()
    if postal is None:
        return {"status": "skipped", "reason": "Postal not configured"}

    try:
        # Escape all user-provided content before HTML interpolation
        safe_name = safe_html_escape(recipient_name)
        safe_invitation_url = safe_url(invitation_url)
        safe_days = safe_html_escape(str(days_until_event))

        html_content = _build_reminder_html(safe_name, safe_invitation_url, safe_days)
        text_content = (
            f"Hello {recipient_name}!\n\n"
            f"This is a friendly reminder that we haven't received your RSVP yet.\n"
            f"The event is in {days_until_event} days.\n\n"
            f"View your invitation: {invitation_url}\n\n"
            f"If you've already responded, please disregard this email."
        )

        from_addr = f"{settings.POSTAL_FROM_NAME} <{settings.POSTAL_FROM_EMAIL}>"

        result = _run_async(postal.send_message(
            to=[recipient_email],
            subject="Reminder: We're waiting for your RSVP!",
            from_addr=from_addr,
            html_body=html_content,
            plain_body=text_content,
            tag="reminder",
        ))

        logger.info(
            "reminder_email_sent",
            guest_id=guest_id,
            invitation_id=invitation_id,
            message_id=result.get("message_id"),
        )

        return {"status": "sent", "guest_id": guest_id}

    except Exception as e:
        logger.error(
            "reminder_email_failed",
            guest_id=guest_id,
            invitation_id=invitation_id,
            error_type=type(e).__name__,
        )
        return {"status": "failed", "error": "Email delivery failed"}
