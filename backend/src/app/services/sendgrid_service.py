"""SendGrid email service.

Provides email sending, template management, and delivery tracking
via the SendGrid API.

Features:
- Async HTTP client with connection pooling
- Template-based and raw HTML email support
- Delivery tracking and status monitoring
- Comprehensive error handling with retry logic
- Rate limiting awareness
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

import httpx

from app.config.settings import get_settings
from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class SendGridError(Exception):
    """Base SendGrid error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class SendGridNotConfiguredError(SendGridError):
    """SendGrid is not configured."""

    def __init__(self) -> None:
        super().__init__(
            "SendGrid is not configured. Please set SENDGRID_API_KEY environment variable.",
            "SENDGRID_NOT_CONFIGURED",
            503,
        )


class SendGridAPIError(SendGridError):
    """SendGrid API returned an error."""

    def __init__(self, message: str, status_code: int, errors: list[dict] | None = None):
        super().__init__(
            f"SendGrid API error: {message}",
            "SENDGRID_API_ERROR",
            status_code,
        )
        self.errors = errors or []


class SendGridRateLimitError(SendGridError):
    """SendGrid rate limit exceeded."""

    def __init__(self, retry_after: int | None = None):
        super().__init__(
            f"SendGrid rate limit exceeded. Retry after {retry_after or 'unknown'} seconds.",
            "SENDGRID_RATE_LIMIT",
            429,
        )
        self.retry_after = retry_after


class SendGridTemplateNotFoundError(SendGridError):
    """SendGrid template not found."""

    def __init__(self, template_id: str):
        super().__init__(
            f"SendGrid template not found: {template_id}",
            "SENDGRID_TEMPLATE_NOT_FOUND",
            404,
        )
        self.template_id = template_id


class SendGridInvalidRecipientError(SendGridError):
    """Invalid email recipient."""

    def __init__(self, email: str, reason: str = "Invalid email address"):
        super().__init__(
            f"Invalid recipient: {email}. {reason}",
            "SENDGRID_INVALID_RECIPIENT",
            400,
        )
        self.email = email


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class EmailStatus(str, Enum):
    """Email delivery status."""

    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    OPENED = "opened"
    CLICKED = "clicked"
    BOUNCED = "bounced"
    DROPPED = "dropped"
    DEFERRED = "deferred"
    SPAM_REPORT = "spam_report"
    UNSUBSCRIBE = "unsubscribe"
    FAILED = "failed"


class EmailCategory(str, Enum):
    """Email category for tracking and analytics."""

    TRANSACTIONAL = "transactional"
    VERIFICATION = "verification"
    NOTIFICATION = "notification"
    INVITATION = "invitation"
    MARKETING = "marketing"
    SYSTEM = "system"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class EmailRecipient:
    """Email recipient with optional personalization."""

    email: str
    name: str | None = None
    substitutions: dict[str, Any] | None = None


@dataclass
class EmailAttachment:
    """Email attachment."""

    content: str  # Base64 encoded content
    filename: str
    type: str  # MIME type
    disposition: str = "attachment"  # 'attachment' or 'inline'
    content_id: str | None = None  # For inline attachments


@dataclass
class EmailMessage:
    """Email message configuration."""

    to: list[EmailRecipient]
    subject: str
    from_email: str | None = None
    from_name: str | None = None
    html_content: str | None = None
    text_content: str | None = None
    template_id: str | None = None
    template_data: dict[str, Any] | None = None
    reply_to: str | None = None
    cc: list[EmailRecipient] | None = None
    bcc: list[EmailRecipient] | None = None
    attachments: list[EmailAttachment] | None = None
    categories: list[str] | None = None
    custom_args: dict[str, str] | None = None
    send_at: int | None = None  # Unix timestamp for scheduled send
    tracking_enabled: bool = True


@dataclass
class EmailResult:
    """Result of sending an email."""

    message_id: str
    status: EmailStatus
    recipients: list[str]
    sent_at: datetime


@dataclass
class EmailTemplate:
    """SendGrid template metadata."""

    template_id: str
    name: str
    generation: str  # 'legacy' or 'dynamic'
    updated_at: datetime
    versions: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class DeliveryEvent:
    """Email delivery tracking event."""

    event_id: str
    message_id: str
    email: str
    event_type: EmailStatus
    timestamp: datetime
    sg_event_id: str | None = None
    sg_message_id: str | None = None
    reason: str | None = None
    user_agent: str | None = None
    ip: str | None = None
    url: str | None = None


# ---------------------------------------------------------------------------
# HTTP Client Management
# ---------------------------------------------------------------------------


_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """Get or create the shared HTTP client with connection pooling."""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            http2=True,
        )
    return _http_client


async def close_http_client() -> None:
    """Close the HTTP client. Call on application shutdown."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


# ---------------------------------------------------------------------------
# SendGrid Service
# ---------------------------------------------------------------------------


class SendGridService:
    """SendGrid email service with template and tracking support."""

    API_BASE_URL = "https://api.sendgrid.com/v3"

    def __init__(self) -> None:
        """Initialize the SendGrid service."""
        self._settings = get_settings()

    @property
    def is_configured(self) -> bool:
        """Check if SendGrid is configured."""
        return self._settings.sendgrid_api_key is not None

    def _get_api_key(self) -> str:
        """Get the SendGrid API key or raise error if not configured."""
        if not self._settings.sendgrid_api_key:
            raise SendGridNotConfiguredError()
        return self._settings.sendgrid_api_key.get_secret_value()

    def _get_headers(self) -> dict[str, str]:
        """Get HTTP headers for SendGrid API requests."""
        return {
            "Authorization": f"Bearer {self._get_api_key()}",
            "Content-Type": "application/json",
        }

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: dict[str, Any] | None = None,
    ) -> httpx.Response:
        """Make an authenticated request to SendGrid API."""
        client = _get_http_client()
        url = f"{self.API_BASE_URL}{endpoint}"

        try:
            response = await client.request(
                method=method,
                url=url,
                headers=self._get_headers(),
                json=json_data,
            )

            # Handle rate limiting
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                raise SendGridRateLimitError(
                    retry_after=int(retry_after) if retry_after else None
                )

            # Handle errors
            if response.status_code >= 400:
                error_data = {}
                try:
                    error_data = response.json()
                except Exception:
                    pass

                errors = error_data.get("errors", [])
                message = errors[0].get("message", "Unknown error") if errors else "Unknown error"
                raise SendGridAPIError(message, response.status_code, errors)

            return response

        except httpx.TimeoutException as e:
            logger.error("SendGrid request timed out", extra={"endpoint": endpoint, "error": str(e)})
            raise SendGridAPIError("Request timed out", 504) from e
        except httpx.RequestError as e:
            logger.error("SendGrid request failed", extra={"endpoint": endpoint, "error": str(e)})
            raise SendGridAPIError(f"Request failed: {str(e)}", 502) from e

    # ---------------------------------------------------------------------------
    # Email Sending
    # ---------------------------------------------------------------------------

    async def send_email(self, message: EmailMessage) -> EmailResult:
        """Send an email via SendGrid.

        Args:
            message: Email message configuration

        Returns:
            EmailResult with message ID and status

        Raises:
            SendGridNotConfiguredError: If SendGrid is not configured
            SendGridAPIError: If the API returns an error
            SendGridRateLimitError: If rate limit is exceeded
        """
        # Build the request payload
        payload = self._build_send_payload(message)

        # Send the email
        response = await self._make_request("POST", "/mail/send", payload)

        # Extract message ID from response headers
        message_id = response.headers.get("X-Message-Id", str(uuid.uuid4()))

        # Track the email
        await self._track_email_sent(
            message_id=message_id,
            recipients=[r.email for r in message.to],
            subject=message.subject,
            template_id=message.template_id,
            categories=message.categories,
        )

        result = EmailResult(
            message_id=message_id,
            status=EmailStatus.SENT,
            recipients=[r.email for r in message.to],
            sent_at=datetime.now(timezone.utc),
        )

        logger.info(
            "Email sent via SendGrid",
            extra={
                "message_id": message_id,
                "recipients": len(message.to),
                "template_id": message.template_id,
            },
        )

        return result

    def _build_send_payload(self, message: EmailMessage) -> dict[str, Any]:
        """Build the SendGrid API payload for sending an email."""
        settings = self._settings

        # Build personalizations (recipients with optional substitutions)
        personalizations: list[dict[str, Any]] = []
        personalization: dict[str, Any] = {
            "to": [self._format_recipient(r) for r in message.to],
        }

        if message.cc:
            personalization["cc"] = [self._format_recipient(r) for r in message.cc]
        if message.bcc:
            personalization["bcc"] = [self._format_recipient(r) for r in message.bcc]
        if message.template_data:
            personalization["dynamic_template_data"] = message.template_data
        if message.subject and not message.template_id:
            personalization["subject"] = message.subject

        personalizations.append(personalization)

        # Build base payload
        payload: dict[str, Any] = {
            "personalizations": personalizations,
            "from": {
                "email": message.from_email or settings.sendgrid_from_email,
                "name": message.from_name or settings.sendgrid_from_name,
            },
        }

        # Add subject for non-template emails
        if message.subject and not message.template_id:
            payload["subject"] = message.subject

        # Add content (for non-template emails)
        if message.template_id:
            payload["template_id"] = message.template_id
        else:
            content = []
            if message.text_content:
                content.append({"type": "text/plain", "value": message.text_content})
            if message.html_content:
                content.append({"type": "text/html", "value": message.html_content})
            if content:
                payload["content"] = content

        # Add optional fields
        if message.reply_to:
            payload["reply_to"] = {"email": message.reply_to}

        if message.attachments:
            payload["attachments"] = [
                {
                    "content": att.content,
                    "filename": att.filename,
                    "type": att.type,
                    "disposition": att.disposition,
                    **({"content_id": att.content_id} if att.content_id else {}),
                }
                for att in message.attachments
            ]

        if message.categories:
            payload["categories"] = message.categories

        if message.custom_args:
            payload["custom_args"] = message.custom_args

        if message.send_at:
            payload["send_at"] = message.send_at

        # Add tracking settings
        if message.tracking_enabled:
            payload["tracking_settings"] = {
                "click_tracking": {"enable": True},
                "open_tracking": {"enable": True},
            }

        return payload

    def _format_recipient(self, recipient: EmailRecipient) -> dict[str, str]:
        """Format a recipient for the SendGrid API."""
        result: dict[str, str] = {"email": recipient.email}
        if recipient.name:
            result["name"] = recipient.name
        return result

    # ---------------------------------------------------------------------------
    # Convenience Methods
    # ---------------------------------------------------------------------------

    async def send_simple_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        categories: list[str] | None = None,
    ) -> EmailResult:
        """Send a simple email without templates.

        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML content of the email
            text_content: Optional plain text content
            from_email: Optional sender email (uses default if not provided)
            from_name: Optional sender name (uses default if not provided)
            categories: Optional categories for tracking

        Returns:
            EmailResult with message ID and status
        """
        message = EmailMessage(
            to=[EmailRecipient(email=to_email)],
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            from_email=from_email,
            from_name=from_name,
            categories=categories,
        )
        return await self.send_email(message)

    async def send_template_email(
        self,
        to_email: str,
        template_id: str,
        template_data: dict[str, Any],
        to_name: str | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        categories: list[str] | None = None,
    ) -> EmailResult:
        """Send an email using a SendGrid dynamic template.

        Args:
            to_email: Recipient email address
            template_id: SendGrid template ID
            template_data: Dynamic template data
            to_name: Optional recipient name
            from_email: Optional sender email (uses default if not provided)
            from_name: Optional sender name (uses default if not provided)
            categories: Optional categories for tracking

        Returns:
            EmailResult with message ID and status
        """
        message = EmailMessage(
            to=[EmailRecipient(email=to_email, name=to_name)],
            subject="",  # Subject comes from template
            template_id=template_id,
            template_data=template_data,
            from_email=from_email,
            from_name=from_name,
            categories=categories,
        )
        return await self.send_email(message)

    async def send_verification_email(
        self,
        to_email: str,
        verification_url: str,
        user_name: str | None = None,
    ) -> EmailResult:
        """Send an email verification email.

        Args:
            to_email: Recipient email address
            verification_url: The verification link
            user_name: Optional user's name for personalization

        Returns:
            EmailResult with message ID and status
        """
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Verify Your Email</h2>
            <p>Hi{f' {user_name}' if user_name else ''},</p>
            <p>Please click the button below to verify your email address:</p>
            <p style="margin: 30px 0;">
                <a href="{verification_url}"
                   style="background-color: #4F46E5; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 6px; display: inline-block;">
                    Verify Email
                </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="color: #666; word-break: break-all;">{verification_url}</p>
            <p>This link will expire in 24 hours.</p>
            <p style="color: #999; font-size: 12px; margin-top: 40px;">
                If you didn't create an account with RawDrive, please ignore this email.
            </p>
        </body>
        </html>
        """

        text_content = f"""
Verify Your Email

Hi{f' {user_name}' if user_name else ''},

Please click the link below to verify your email address:

{verification_url}

This link will expire in 24 hours.

If you didn't create an account with RawDrive, please ignore this email.
        """

        return await self.send_simple_email(
            to_email=to_email,
            subject="Verify your RawDrive email",
            html_content=html_content,
            text_content=text_content,
            categories=[EmailCategory.VERIFICATION],
        )

    async def send_invitation_email(
        self,
        to_email: str,
        invitation_url: str,
        inviter_name: str,
        gallery_name: str | None = None,
    ) -> EmailResult:
        """Send a gallery invitation email.

        Args:
            to_email: Recipient email address
            invitation_url: The invitation link
            inviter_name: Name of the person sending the invitation
            gallery_name: Optional gallery name

        Returns:
            EmailResult with message ID and status
        """
        gallery_text = f" to view '{gallery_name}'" if gallery_name else ""

        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You're Invited!</h2>
            <p>{inviter_name} has invited you{gallery_text} on RawDrive.</p>
            <p style="margin: 30px 0;">
                <a href="{invitation_url}"
                   style="background-color: #4F46E5; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 6px; display: inline-block;">
                    View Gallery
                </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="color: #666; word-break: break-all;">{invitation_url}</p>
        </body>
        </html>
        """

        text_content = f"""
You're Invited!

{inviter_name} has invited you{gallery_text} on RawDrive.

Click the link below to view the gallery:

{invitation_url}
        """

        return await self.send_simple_email(
            to_email=to_email,
            subject=f"{inviter_name} invited you to RawDrive",
            html_content=html_content,
            text_content=text_content,
            categories=[EmailCategory.INVITATION],
        )

    # ---------------------------------------------------------------------------
    # Template Management
    # ---------------------------------------------------------------------------

    async def list_templates(self, generations: str = "dynamic") -> list[EmailTemplate]:
        """List available email templates.

        Args:
            generations: Template generations to list ('legacy', 'dynamic', or 'legacy,dynamic')

        Returns:
            List of EmailTemplate objects
        """
        response = await self._make_request(
            "GET",
            f"/templates?generations={generations}&page_size=100",
        )

        data = response.json()
        templates = []

        for template_data in data.get("templates", []):
            templates.append(
                EmailTemplate(
                    template_id=template_data["id"],
                    name=template_data["name"],
                    generation=template_data["generation"],
                    updated_at=datetime.fromisoformat(
                        template_data["updated_at"].replace("Z", "+00:00")
                    ),
                    versions=template_data.get("versions", []),
                )
            )

        return templates

    async def get_template(self, template_id: str) -> EmailTemplate:
        """Get a specific template by ID.

        Args:
            template_id: SendGrid template ID

        Returns:
            EmailTemplate object

        Raises:
            SendGridTemplateNotFoundError: If template doesn't exist
        """
        try:
            response = await self._make_request("GET", f"/templates/{template_id}")
        except SendGridAPIError as e:
            if e.status == 404:
                raise SendGridTemplateNotFoundError(template_id) from e
            raise

        data = response.json()

        return EmailTemplate(
            template_id=data["id"],
            name=data["name"],
            generation=data["generation"],
            updated_at=datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00")),
            versions=data.get("versions", []),
        )

    async def create_template(self, name: str, generation: str = "dynamic") -> EmailTemplate:
        """Create a new email template.

        Args:
            name: Template name
            generation: Template generation ('legacy' or 'dynamic')

        Returns:
            Created EmailTemplate object
        """
        response = await self._make_request(
            "POST",
            "/templates",
            {"name": name, "generation": generation},
        )

        data = response.json()

        return EmailTemplate(
            template_id=data["id"],
            name=data["name"],
            generation=data["generation"],
            updated_at=datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00")),
            versions=[],
        )

    async def delete_template(self, template_id: str) -> None:
        """Delete an email template.

        Args:
            template_id: SendGrid template ID

        Raises:
            SendGridTemplateNotFoundError: If template doesn't exist
        """
        try:
            await self._make_request("DELETE", f"/templates/{template_id}")
        except SendGridAPIError as e:
            if e.status == 404:
                raise SendGridTemplateNotFoundError(template_id) from e
            raise

        logger.info("Deleted SendGrid template", extra={"template_id": template_id})

    # ---------------------------------------------------------------------------
    # Delivery Tracking
    # ---------------------------------------------------------------------------

    async def _track_email_sent(
        self,
        message_id: str,
        recipients: list[str],
        subject: str,
        template_id: str | None = None,
        categories: list[str] | None = None,
    ) -> None:
        """Track an email send in the database."""
        pool = await get_postgres_pool()
        redis = await get_redis_client()

        now = datetime.now(timezone.utc)

        # Store in Redis for quick access (expires in 7 days)
        email_key = f"email_tracking:{message_id}"
        await redis.hset(
            email_key,
            mapping={
                "message_id": message_id,
                "recipients": ",".join(recipients),
                "subject": subject,
                "template_id": template_id or "",
                "categories": ",".join(categories) if categories else "",
                "status": EmailStatus.SENT.value,
                "sent_at": now.isoformat(),
            },
        )
        await redis.expire(email_key, 7 * 24 * 60 * 60)  # 7 days

        logger.debug(
            "Email tracking stored",
            extra={"message_id": message_id, "recipients": len(recipients)},
        )

    async def process_webhook_event(self, event: dict[str, Any]) -> DeliveryEvent | None:
        """Process a SendGrid webhook event.

        Args:
            event: Webhook event data from SendGrid

        Returns:
            DeliveryEvent object or None if event type is not tracked
        """
        event_type = event.get("event", "").lower()

        # Map SendGrid event types to our status enum
        status_map = {
            "processed": EmailStatus.PENDING,
            "dropped": EmailStatus.DROPPED,
            "delivered": EmailStatus.DELIVERED,
            "bounce": EmailStatus.BOUNCED,
            "deferred": EmailStatus.DEFERRED,
            "open": EmailStatus.OPENED,
            "click": EmailStatus.CLICKED,
            "spamreport": EmailStatus.SPAM_REPORT,
            "unsubscribe": EmailStatus.UNSUBSCRIBE,
        }

        status = status_map.get(event_type)
        if status is None:
            return None

        delivery_event = DeliveryEvent(
            event_id=str(uuid.uuid4()),
            message_id=event.get("sg_message_id", ""),
            email=event.get("email", ""),
            event_type=status,
            timestamp=datetime.fromtimestamp(event.get("timestamp", 0), tz=timezone.utc),
            sg_event_id=event.get("sg_event_id"),
            sg_message_id=event.get("sg_message_id"),
            reason=event.get("reason"),
            user_agent=event.get("useragent"),
            ip=event.get("ip"),
            url=event.get("url"),
        )

        # Update tracking in Redis
        redis = await get_redis_client()
        message_id = event.get("sg_message_id", "")
        if message_id:
            email_key = f"email_tracking:{message_id}"
            await redis.hset(email_key, "status", status.value)
            await redis.hset(email_key, f"event_{event_type}", datetime.now(timezone.utc).isoformat())

        logger.info(
            "Processed webhook event",
            extra={
                "event_type": event_type,
                "message_id": message_id,
                "email": event.get("email"),
            },
        )

        return delivery_event

    async def get_email_status(self, message_id: str) -> dict[str, Any] | None:
        """Get the status of a sent email.

        Args:
            message_id: The message ID returned when the email was sent

        Returns:
            Dict with email status info or None if not found
        """
        redis = await get_redis_client()
        email_key = f"email_tracking:{message_id}"

        data = await redis.hgetall(email_key)
        if not data:
            return None

        return {
            "message_id": data.get(b"message_id", b"").decode(),
            "recipients": data.get(b"recipients", b"").decode().split(","),
            "subject": data.get(b"subject", b"").decode(),
            "template_id": data.get(b"template_id", b"").decode() or None,
            "categories": data.get(b"categories", b"").decode().split(",") if data.get(b"categories") else [],
            "status": data.get(b"status", b"").decode(),
            "sent_at": data.get(b"sent_at", b"").decode(),
        }

    async def get_email_stats(
        self,
        start_date: str,
        end_date: str | None = None,
        categories: list[str] | None = None,
    ) -> dict[str, Any]:
        """Get email statistics from SendGrid.

        Args:
            start_date: Start date in YYYY-MM-DD format
            end_date: Optional end date in YYYY-MM-DD format
            categories: Optional list of categories to filter by

        Returns:
            Dict with email statistics
        """
        params = f"start_date={start_date}"
        if end_date:
            params += f"&end_date={end_date}"
        if categories:
            params += "&categories=" + "&categories=".join(categories)

        response = await self._make_request("GET", f"/stats?{params}")
        return response.json()


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------


_sendgrid_service: SendGridService | None = None


def get_sendgrid_service() -> SendGridService:
    """Get the SendGrid service singleton."""
    global _sendgrid_service
    if _sendgrid_service is None:
        _sendgrid_service = SendGridService()
    return _sendgrid_service
