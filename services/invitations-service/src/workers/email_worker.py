"""
Email worker for sending invitation emails.

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
    Send an invitation email to a guest.

    Args:
        guest_id: UUID of the guest
        invitation_id: UUID of the invitation
        workspace_id: UUID of the workspace
        recipient_email: Email address to send to
        recipient_name: Name of the recipient
        invitation_url: URL to view the invitation
        template_id: Optional SendGrid template ID
        send_log_id: Optional email_send_log entry ID for tracking
    """
    if not settings.SENDGRID_API_KEY:
        logger.warning("SendGrid API key not configured, skipping email")
        if send_log_id:
            _run_async(_update_send_log_status(send_log_id, "failed", "SendGrid not configured"))
        return {"status": "skipped", "reason": "SendGrid not configured"}

    try:
        # Import here to avoid loading if not configured
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, To

        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)

        message = Mail(
            from_email=(settings.EMAIL_FROM_ADDRESS, settings.EMAIL_FROM_NAME),
            to_emails=To(recipient_email, recipient_name),
        )

        if template_id:
            message.template_id = template_id
            # Sanitize all template data to prevent XSS
            message.dynamic_template_data = sanitize_email_template_data({
                "name": recipient_name,
                "invitation_url": invitation_url,
            })
        else:
            # Escape all user-provided content before HTML interpolation
            safe_name = safe_html_escape(recipient_name)
            safe_invitation_url = safe_url(invitation_url)

            message.subject = "You're Invited!"
            message.html_content = f"""
            <h1>Hello {safe_name}!</h1>
            <p>You've been invited to a special event.</p>
            <p><a href="{safe_invitation_url}">View Invitation</a></p>
            """

        response = sg.send(message)

        # Update send log status to sent
        if send_log_id:
            _run_async(_update_send_log_status(send_log_id, "sent"))

        # Log without PII - use guest_id instead of email
        logger.info(
            "invitation_email_sent",
            guest_id=guest_id,
            invitation_id=invitation_id,
            status_code=response.status_code,
        )

        return {
            "status": "sent",
            "guest_id": guest_id,
            "status_code": response.status_code,
        }

    except Exception as e:
        # Log without PII - use guest_id instead of email
        logger.error(
            "invitation_email_failed",
            guest_id=guest_id,
            invitation_id=invitation_id,
            error_type=type(e).__name__,
            retry_count=self.request.retries,
        )

        # Check if we've exhausted retries
        if self.request.retries >= MAX_RETRIES:
            # Mark as permanently failed in send log
            if send_log_id:
                _run_async(_update_send_log_status(
                    send_log_id,
                    "failed",
                    f"Max retries exceeded: {type(e).__name__}",
                ))
            return {"status": "failed", "guest_id": guest_id, "error": str(e)}

        # Retry with exponential backoff (60s, 120s, 240s)
        countdown = BASE_RETRY_DELAY * (2 ** self.request.retries)
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
        template_id: Optional SendGrid template ID
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
    if not settings.SENDGRID_API_KEY:
        return {"status": "skipped", "reason": "SendGrid not configured"}

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, To

        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)

        # Escape all user-provided content before HTML interpolation
        safe_name = safe_html_escape(recipient_name)
        safe_invitation_url = safe_url(invitation_url)
        safe_days = safe_html_escape(str(days_until_event))

        message = Mail(
            from_email=(settings.EMAIL_FROM_ADDRESS, settings.EMAIL_FROM_NAME),
            to_emails=To(recipient_email, recipient_name),
            subject="Reminder: We're waiting for your RSVP!",
            html_content=f"""
            <h1>Hello {safe_name}!</h1>
            <p>This is a friendly reminder that we haven't received your RSVP yet.</p>
            <p>The event is in {safe_days} days.</p>
            <p><a href="{safe_invitation_url}">View Invitation & RSVP</a></p>
            """,
        )

        response = sg.send(message)
        # Log without PII - use guest_id instead of email
        logger.info(
            "reminder_email_sent",
            guest_id=guest_id,
            invitation_id=invitation_id,
        )

        return {"status": "sent", "guest_id": guest_id}

    except Exception as e:
        # Log without PII - use guest_id instead of email
        logger.error(
            "reminder_email_failed",
            guest_id=guest_id,
            invitation_id=invitation_id,
            error_type=type(e).__name__,
        )
        return {"status": "failed", "error": "Email delivery failed"}
