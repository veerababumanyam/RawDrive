"""Unified email service with SMTP and SendGrid support.

This module provides a unified interface for sending emails through multiple
providers (SendGrid and SMTP). It automatically selects the appropriate provider
based on configuration and provides fallback capabilities.

Features:
- Provider abstraction (SendGrid, SMTP)
- Automatic provider selection based on configuration
- Fallback to SMTP when SendGrid is not configured
- Template-based and raw HTML email support
- Delivery tracking via database/Redis
- Comprehensive error handling with retry logic
- Rate limiting awareness

Usage:
    from app.services.email_service import get_email_service, EmailType

    service = get_email_service()
    result = await service.send_email(
        to_email="user@example.com",
        email_type=EmailType.VERIFICATION,
        template_data={"verification_url": "https://..."},
    )

Feature: Business Onboarding & Workspace Setup
Task: T003 - Create email service with SMTP/SendGrid support
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from enum import Enum
from typing import Any, Optional

from app.config.settings import get_settings
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class EmailServiceError(Exception):
    """Base email service error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class EmailNotConfiguredError(EmailServiceError):
    """Email service is not configured."""

    def __init__(self) -> None:
        super().__init__(
            "Email service is not configured. Please configure either SendGrid or SMTP.",
            "EMAIL_NOT_CONFIGURED",
            503,
        )


class EmailSendError(EmailServiceError):
    """Failed to send email."""

    def __init__(self, message: str, provider: str):
        super().__init__(
            f"Failed to send email via {provider}: {message}",
            "EMAIL_SEND_ERROR",
            500,
        )
        self.provider = provider


class EmailRateLimitError(EmailServiceError):
    """Rate limit exceeded."""

    def __init__(self, retry_after: int | None = None):
        super().__init__(
            f"Email rate limit exceeded. Retry after {retry_after or 'unknown'} seconds.",
            "EMAIL_RATE_LIMIT",
            429,
        )
        self.retry_after = retry_after


class EmailInvalidRecipientError(EmailServiceError):
    """Invalid email recipient."""

    def __init__(self, email: str, reason: str = "Invalid email address"):
        super().__init__(
            f"Invalid recipient: {email}. {reason}",
            "EMAIL_INVALID_RECIPIENT",
            400,
        )
        self.email = email


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class EmailType(str, Enum):
    """Email type for template selection and categorization."""

    VERIFICATION = "verification"
    WELCOME = "welcome"
    PASSWORD_RESET = "password_reset"
    INVITATION = "invitation"
    NOTIFICATION = "notification"
    TRANSACTIONAL = "transactional"
    MARKETING = "marketing"
    SYSTEM = "system"


class EmailProvider(str, Enum):
    """Email provider types."""

    POSTAL = "postal"
    SENDGRID = "sendgrid"
    SMTP = "smtp"
    CONSOLE = "console"  # For development/testing


class EmailStatus(str, Enum):
    """Email delivery status."""

    PENDING = "pending"
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    BOUNCED = "bounced"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class EmailRecipient:
    """Email recipient."""

    email: str
    name: str | None = None


@dataclass
class EmailAttachment:
    """Email attachment."""

    content: bytes
    filename: str
    mime_type: str
    content_id: str | None = None  # For inline attachments


@dataclass
class EmailMessage:
    """Email message configuration."""

    to: list[EmailRecipient]
    subject: str
    html_content: str | None = None
    text_content: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    reply_to: str | None = None
    cc: list[EmailRecipient] | None = None
    bcc: list[EmailRecipient] | None = None
    attachments: list[EmailAttachment] | None = None
    email_type: EmailType = EmailType.TRANSACTIONAL
    metadata: dict[str, Any] = field(default_factory=dict)
    tracking_enabled: bool = True


@dataclass
class EmailResult:
    """Result of sending an email."""

    message_id: str
    provider: EmailProvider
    status: EmailStatus
    recipients: list[str]
    sent_at: datetime
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Email Provider Interface
# ---------------------------------------------------------------------------


class EmailProviderInterface(ABC):
    """Abstract base class for email providers."""

    @property
    @abstractmethod
    def name(self) -> EmailProvider:
        """Get provider name."""
        pass

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """Check if provider is configured."""
        pass

    @abstractmethod
    async def send(self, message: EmailMessage) -> EmailResult:
        """Send an email message.

        Args:
            message: Email message to send

        Returns:
            EmailResult with delivery information

        Raises:
            EmailSendError: If sending fails
        """
        pass


# ---------------------------------------------------------------------------
# SendGrid Provider
# ---------------------------------------------------------------------------


class SendGridProvider(EmailProviderInterface):
    """SendGrid email provider using the existing SendGridService."""

    def __init__(self) -> None:
        """Initialize SendGrid provider."""
        self._settings = get_settings()
        self._sendgrid_service = None

    @property
    def name(self) -> EmailProvider:
        return EmailProvider.SENDGRID

    @property
    def is_configured(self) -> bool:
        return self._settings.sendgrid_api_key is not None

    def _get_sendgrid_service(self):
        """Lazy load SendGrid service."""
        if self._sendgrid_service is None:
            from app.services.sendgrid_service import get_sendgrid_service

            self._sendgrid_service = get_sendgrid_service()
        return self._sendgrid_service

    async def send(self, message: EmailMessage) -> EmailResult:
        """Send email via SendGrid."""
        from app.services.sendgrid_service import (
            EmailMessage as SGEmailMessage,
            EmailRecipient as SGEmailRecipient,
            EmailAttachment as SGEmailAttachment,
            SendGridAPIError,
            SendGridRateLimitError,
            SendGridNotConfiguredError,
        )

        service = self._get_sendgrid_service()

        try:
            # Convert to SendGrid format
            sg_recipients = [
                SGEmailRecipient(email=r.email, name=r.name)
                for r in message.to
            ]

            sg_attachments = None
            if message.attachments:
                import base64
                sg_attachments = [
                    SGEmailAttachment(
                        content=base64.b64encode(att.content).decode(),
                        filename=att.filename,
                        type=att.mime_type,
                        content_id=att.content_id,
                    )
                    for att in message.attachments
                ]

            sg_message = SGEmailMessage(
                to=sg_recipients,
                subject=message.subject,
                html_content=message.html_content,
                text_content=message.text_content,
                from_email=message.from_email,
                from_name=message.from_name,
                reply_to=message.reply_to,
                cc=[SGEmailRecipient(email=r.email, name=r.name) for r in message.cc] if message.cc else None,
                bcc=[SGEmailRecipient(email=r.email, name=r.name) for r in message.bcc] if message.bcc else None,
                attachments=sg_attachments,
                categories=[message.email_type.value],
                custom_args=message.metadata if message.metadata else None,
                tracking_enabled=message.tracking_enabled,
            )

            result = await service.send_email(sg_message)

            return EmailResult(
                message_id=result.message_id,
                provider=EmailProvider.SENDGRID,
                status=EmailStatus.SENT,
                recipients=[r.email for r in message.to],
                sent_at=result.sent_at,
                metadata={"sendgrid_status": result.status.value},
            )

        except SendGridNotConfiguredError:
            raise EmailNotConfiguredError()
        except SendGridRateLimitError as e:
            raise EmailRateLimitError(retry_after=e.retry_after)
        except SendGridAPIError as e:
            raise EmailSendError(str(e), "sendgrid")


# ---------------------------------------------------------------------------
# Postal Provider
# ---------------------------------------------------------------------------


class PostalProvider(EmailProviderInterface):
    """Postal email provider using the self-hosted Postal mail server."""

    def __init__(self) -> None:
        """Initialize Postal provider."""
        self._settings = get_settings()
        self._client = None

    @property
    def name(self) -> EmailProvider:
        return EmailProvider.POSTAL

    @property
    def is_configured(self) -> bool:
        return self._settings.postal_api_key is not None

    def _get_client(self):
        """Lazy load Postal client."""
        if self._client is None:
            from app.services.postal_client import get_postal_client
            self._client = get_postal_client()
        return self._client

    async def send(self, message: EmailMessage) -> EmailResult:
        """Send email via Postal."""
        client = self._get_client()
        if client is None:
            raise EmailNotConfiguredError()

        import base64

        attachments = None
        if message.attachments:
            attachments = [
                {
                    "name": a.filename,
                    "content_type": a.mime_type,
                    "data": base64.b64encode(a.content).decode(),
                }
                for a in message.attachments
            ]

        from_name = message.from_name or self._settings.postal_from_name or "RawDrive"
        from_email = message.from_email or self._settings.postal_from_email or self._settings.sendgrid_from_email
        from_addr = f"{from_name} <{from_email}>"

        try:
            from app.services.postal_client import PostalAPIError

            result = await client.send_message(
                to=[r.email for r in message.to],
                subject=message.subject,
                from_addr=from_addr,
                html_body=message.html_content,
                plain_body=message.text_content,
                cc=[r.email for r in message.cc] if message.cc else None,
                bcc=[r.email for r in message.bcc] if message.bcc else None,
                attachments=attachments,
                tag=message.email_type.value,
                reply_to=message.reply_to,
            )
            return EmailResult(
                message_id=result["message_id"],
                provider=EmailProvider.POSTAL,
                status=EmailStatus.SENT,
                recipients=[r.email for r in message.to],
                sent_at=datetime.now(timezone.utc),
                metadata={"postal_messages": result.get("messages", {})},
            )
        except Exception as e:
            from app.services.postal_client import PostalAPIError

            if isinstance(e, PostalAPIError):
                raise EmailSendError(str(e), "postal")
            raise EmailSendError(str(e), "postal")


# ---------------------------------------------------------------------------
# SMTP Provider
# ---------------------------------------------------------------------------


class SMTPProvider(EmailProviderInterface):
    """SMTP email provider for direct email sending."""

    def __init__(self) -> None:
        """Initialize SMTP provider."""
        self._settings = get_settings()

    @property
    def name(self) -> EmailProvider:
        return EmailProvider.SMTP

    @property
    def is_configured(self) -> bool:
        """Check if SMTP is configured via settings."""
        return self._settings.smtp_host is not None

    def _get_smtp_config(self) -> dict[str, Any]:
        """Get SMTP configuration from settings."""
        settings = self._settings
        return {
            "host": settings.smtp_host or "localhost",
            "port": settings.smtp_port,
            "username": settings.smtp_username,
            "password": settings.smtp_password.get_secret_value() if settings.smtp_password else None,
            "use_tls": settings.smtp_use_tls,
            "use_ssl": settings.smtp_use_ssl,
            "from_email": settings.smtp_from_email or settings.sendgrid_from_email,
            "from_name": settings.smtp_from_name or settings.sendgrid_from_name,
            "timeout": settings.smtp_timeout,
        }

    async def send(self, message: EmailMessage) -> EmailResult:
        """Send email via SMTP.

        Uses asyncio.to_thread to run SMTP operations without blocking.
        """
        config = self._get_smtp_config()
        message_id = str(uuid.uuid4())

        try:
            # Run SMTP in thread pool to avoid blocking
            await asyncio.to_thread(
                self._send_smtp_sync,
                message,
                config,
                message_id,
            )

            return EmailResult(
                message_id=message_id,
                provider=EmailProvider.SMTP,
                status=EmailStatus.SENT,
                recipients=[r.email for r in message.to],
                sent_at=datetime.now(timezone.utc),
                metadata={"smtp_host": config["host"]},
            )

        except smtplib.SMTPAuthenticationError as e:
            logger.error("SMTP authentication failed", extra={"error": str(e)})
            raise EmailSendError("Authentication failed", "smtp")
        except smtplib.SMTPRecipientsRefused as e:
            logger.error("SMTP recipients refused", extra={"error": str(e)})
            recipients = list(e.recipients.keys())
            raise EmailInvalidRecipientError(
                recipients[0] if recipients else "unknown",
                "Recipient refused by server",
            )
        except smtplib.SMTPException as e:
            logger.error("SMTP error", extra={"error": str(e)})
            raise EmailSendError(str(e), "smtp")
        except (ConnectionRefusedError, TimeoutError, OSError) as e:
            logger.error("SMTP connection failed", extra={"error": str(e)})
            raise EmailSendError(f"Connection failed: {str(e)}", "smtp")

    def _send_smtp_sync(
        self,
        message: EmailMessage,
        config: dict[str, Any],
        message_id: str,
    ) -> None:
        """Synchronous SMTP send operation."""
        # Build MIME message
        msg = MIMEMultipart("alternative")
        msg["Message-ID"] = f"<{message_id}@rawdrive.in>"
        msg["Subject"] = message.subject
        msg["From"] = f"{message.from_name or config['from_name']} <{message.from_email or config['from_email']}>"
        msg["To"] = ", ".join(
            f"{r.name} <{r.email}>" if r.name else r.email
            for r in message.to
        )

        if message.reply_to:
            msg["Reply-To"] = message.reply_to

        if message.cc:
            msg["Cc"] = ", ".join(
                f"{r.name} <{r.email}>" if r.name else r.email
                for r in message.cc
            )

        # Add text content
        if message.text_content:
            msg.attach(MIMEText(message.text_content, "plain", "utf-8"))

        # Add HTML content
        if message.html_content:
            msg.attach(MIMEText(message.html_content, "html", "utf-8"))

        # Add attachments
        if message.attachments:
            from email.mime.base import MIMEBase
            from email import encoders

            for att in message.attachments:
                maintype, subtype = att.mime_type.split("/", 1)
                part = MIMEBase(maintype, subtype)
                part.set_payload(att.content)
                encoders.encode_base64(part)
                part.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=att.filename,
                )
                if att.content_id:
                    part.add_header("Content-ID", f"<{att.content_id}>")
                msg.attach(part)

        # Collect all recipients
        all_recipients = [r.email for r in message.to]
        if message.cc:
            all_recipients.extend(r.email for r in message.cc)
        if message.bcc:
            all_recipients.extend(r.email for r in message.bcc)

        # Send via SMTP
        context = ssl.create_default_context()

        if config["use_ssl"]:
            # Use SMTP_SSL for port 465
            with smtplib.SMTP_SSL(
                config["host"],
                config["port"],
                timeout=config["timeout"],
                context=context,
            ) as server:
                if config["username"] and config["password"]:
                    server.login(config["username"], config["password"])
                server.sendmail(
                    message.from_email or config["from_email"],
                    all_recipients,
                    msg.as_string(),
                )
        else:
            # Use SMTP with optional STARTTLS for port 587
            with smtplib.SMTP(
                config["host"],
                config["port"],
                timeout=config["timeout"],
            ) as server:
                if config["use_tls"]:
                    server.starttls(context=context)
                if config["username"] and config["password"]:
                    server.login(config["username"], config["password"])
                server.sendmail(
                    message.from_email or config["from_email"],
                    all_recipients,
                    msg.as_string(),
                )

        logger.info(
            "Email sent via SMTP",
            extra={
                "message_id": message_id,
                "recipients": len(all_recipients),
                "host": config["host"],
            },
        )


# ---------------------------------------------------------------------------
# Console Provider (Development)
# ---------------------------------------------------------------------------


class ConsoleProvider(EmailProviderInterface):
    """Console email provider for development/testing.

    Logs emails to console instead of sending them.
    """

    @property
    def name(self) -> EmailProvider:
        return EmailProvider.CONSOLE

    @property
    def is_configured(self) -> bool:
        return True  # Always available

    async def send(self, message: EmailMessage) -> EmailResult:
        """Log email to console instead of sending."""
        message_id = str(uuid.uuid4())

        logger.info(
            "=" * 60 + "\n"
            "CONSOLE EMAIL (not actually sent)\n"
            "=" * 60 + "\n"
            f"To: {', '.join(r.email for r in message.to)}\n"
            f"Subject: {message.subject}\n"
            f"Type: {message.email_type.value}\n"
            "=" * 60 + "\n"
            f"{message.text_content or message.html_content or '(no content)'}\n"
            "=" * 60
        )

        return EmailResult(
            message_id=message_id,
            provider=EmailProvider.CONSOLE,
            status=EmailStatus.SENT,
            recipients=[r.email for r in message.to],
            sent_at=datetime.now(timezone.utc),
            metadata={"console": True},
        )


# ---------------------------------------------------------------------------
# Email Service
# ---------------------------------------------------------------------------


class EmailService:
    """Unified email service with multiple provider support.

    This service automatically selects the best available provider:
    1. SendGrid (if configured)
    2. SMTP (if configured)
    3. Console (development fallback)

    Thread-safe and suitable for concurrent use.
    """

    # Email templates by type
    TEMPLATES: dict[EmailType, dict[str, str]] = {
        EmailType.VERIFICATION: {
            "subject": "Verify your RawDrive email",
        },
        EmailType.WELCOME: {
            "subject": "Welcome to RawDrive!",
        },
        EmailType.PASSWORD_RESET: {
            "subject": "Reset your RawDrive password",
        },
        EmailType.INVITATION: {
            "subject": "You've been invited to RawDrive",
        },
    }

    def __init__(self) -> None:
        """Initialize the email service."""
        self._settings = get_settings()
        self._providers: dict[EmailProvider, EmailProviderInterface] = {}
        self._initialize_providers()

    def _initialize_providers(self) -> None:
        """Initialize available email providers."""
        # Register all providers
        self._providers[EmailProvider.POSTAL] = PostalProvider()
        self._providers[EmailProvider.SENDGRID] = SendGridProvider()
        self._providers[EmailProvider.SMTP] = SMTPProvider()
        self._providers[EmailProvider.CONSOLE] = ConsoleProvider()

    @property
    def available_providers(self) -> list[EmailProvider]:
        """Get list of configured providers."""
        return [
            provider
            for provider, impl in self._providers.items()
            if impl.is_configured
        ]

    def _get_provider(
        self,
        preferred: EmailProvider | None = None,
    ) -> EmailProviderInterface:
        """Get the best available provider.

        Args:
            preferred: Preferred provider to use if available

        Returns:
            EmailProviderInterface implementation

        Raises:
            EmailNotConfiguredError: If no provider is configured
        """
        # Use preferred provider if specified and configured
        if preferred and preferred in self._providers:
            provider = self._providers[preferred]
            if provider.is_configured:
                return provider

        # Priority order: Postal > SendGrid > SMTP > Console (dev only)
        # Postal is preferred when configured (self-hosted, no per-email cost)
        priority = [EmailProvider.POSTAL, EmailProvider.SENDGRID, EmailProvider.SMTP]

        for provider_type in priority:
            if provider_type in self._providers:
                provider = self._providers[provider_type]
                if provider.is_configured:
                    return provider

        # Fall back to console in development
        if self._settings.app_env.value in ("development", "test"):
            return self._providers[EmailProvider.CONSOLE]

        raise EmailNotConfiguredError()

    async def send_email(
        self,
        to_email: str,
        email_type: EmailType,
        subject: str | None = None,
        html_content: str | None = None,
        text_content: str | None = None,
        template_data: dict[str, Any] | None = None,
        to_name: str | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        reply_to: str | None = None,
        attachments: list[EmailAttachment] | None = None,
        metadata: dict[str, Any] | None = None,
        provider: EmailProvider | None = None,
    ) -> EmailResult:
        """Send an email with automatic provider selection.

        Args:
            to_email: Recipient email address
            email_type: Type of email for categorization
            subject: Email subject (uses default from template if not provided)
            html_content: HTML email content
            text_content: Plain text email content
            template_data: Data for template rendering
            to_name: Recipient name
            from_email: Sender email address
            from_name: Sender name
            reply_to: Reply-to email address
            attachments: List of attachments
            metadata: Additional metadata for tracking
            provider: Specific provider to use

        Returns:
            EmailResult with delivery information

        Raises:
            EmailNotConfiguredError: If no provider is configured
            EmailSendError: If sending fails
        """
        # Get subject from template if not provided
        if not subject:
            template_config = self.TEMPLATES.get(email_type, {})
            subject = template_config.get("subject", f"RawDrive {email_type.value}")

        # Build message
        message = EmailMessage(
            to=[EmailRecipient(email=to_email, name=to_name)],
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            from_email=from_email,
            from_name=from_name,
            reply_to=reply_to,
            attachments=attachments,
            email_type=email_type,
            metadata=metadata or {},
        )

        # Get provider and send
        email_provider = self._get_provider(provider)
        result = await email_provider.send(message)

        # Track email
        await self._track_email(result, message)

        return result

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
            EmailResult with delivery information
        """
        greeting = f"Hi {user_name}," if user_name else "Hi,"

        html_content = f"""
<!DOCTYPE html>
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
        <h2 style="color: #1f2937; margin-bottom: 20px;">Verify Your Email</h2>
        <p style="color: #4b5563; line-height: 1.6;">{greeting}</p>
        <p style="color: #4b5563; line-height: 1.6;">
            Thanks for signing up! Please click the button below to verify your email address
            and complete your registration.
        </p>
        <div style="text-align: center; margin: 40px 0;">
            <a href="{verification_url}"
               style="background-color: #4F46E5; color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: 600; font-size: 16px;">
                Verify Email Address
            </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Or copy and paste this link into your browser:
        </p>
        <p style="color: #4F46E5; font-size: 14px; word-break: break-all; background-color: #f3f4f6; padding: 12px; border-radius: 4px;">
            {verification_url}
        </p>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            This link will expire in 24 hours. If you didn't create an account with RawDrive,
            please ignore this email.
        </p>
    </div>
</body>
</html>
        """

        text_content = f"""
Verify Your Email

{greeting}

Thanks for signing up! Please click the link below to verify your email address
and complete your registration.

{verification_url}

This link will expire in 24 hours.

If you didn't create an account with RawDrive, please ignore this email.
        """

        return await self.send_email(
            to_email=to_email,
            email_type=EmailType.VERIFICATION,
            html_content=html_content,
            text_content=text_content,
            to_name=user_name,
            metadata={"verification_url": verification_url},
        )

    async def send_welcome_email(
        self,
        to_email: str,
        user_name: str,
        workspace_name: str | None = None,
        login_url: str | None = None,
    ) -> EmailResult:
        """Send a welcome email after successful registration.

        Args:
            to_email: Recipient email address
            user_name: User's name
            workspace_name: Optional workspace name
            login_url: Optional login URL

        Returns:
            EmailResult with delivery information
        """
        login_url = login_url or "https://app.rawdrive.in/login"
        workspace_text = f" Your workspace '{workspace_name}' is ready to go!" if workspace_name else ""

        html_content = f"""
<!DOCTYPE html>
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
        <h2 style="color: #1f2937; margin-bottom: 20px;">Welcome to RawDrive!</h2>
        <p style="color: #4b5563; line-height: 1.6;">Hi {user_name},</p>
        <p style="color: #4b5563; line-height: 1.6;">
            Welcome to RawDrive! We're excited to have you on board.{workspace_text}
        </p>
        <p style="color: #4b5563; line-height: 1.6;">
            Here are some things you can do to get started:
        </p>
        <ul style="color: #4b5563; line-height: 2;">
            <li>Create your first gallery</li>
            <li>Upload your logo and brand colors</li>
            <li>Invite team members to collaborate</li>
            <li>Set up your payment gateway</li>
        </ul>
        <div style="text-align: center; margin: 40px 0;">
            <a href="{login_url}"
               style="background-color: #4F46E5; color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: 600; font-size: 16px;">
                Get Started
            </a>
        </div>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Need help? Check out our <a href="https://help.rawdrive.in" style="color: #4F46E5;">Help Center</a>
            or reply to this email.
        </p>
    </div>
</body>
</html>
        """

        text_content = f"""
Welcome to RawDrive!

Hi {user_name},

Welcome to RawDrive! We're excited to have you on board.{workspace_text}

Here are some things you can do to get started:
- Create your first gallery
- Upload your logo and brand colors
- Invite team members to collaborate
- Set up your payment gateway

Get started: {login_url}

Need help? Check out our Help Center at https://help.rawdrive.in or reply to this email.
        """

        return await self.send_email(
            to_email=to_email,
            email_type=EmailType.WELCOME,
            html_content=html_content,
            text_content=text_content,
            to_name=user_name,
            metadata={
                "workspace_name": workspace_name,
                "login_url": login_url,
            },
        )

    async def send_password_reset_email(
        self,
        to_email: str,
        reset_url: str,
        user_name: str | None = None,
    ) -> EmailResult:
        """Send a password reset email.

        Args:
            to_email: Recipient email address
            reset_url: The password reset link
            user_name: Optional user's name

        Returns:
            EmailResult with delivery information
        """
        greeting = f"Hi {user_name}," if user_name else "Hi,"

        html_content = f"""
<!DOCTYPE html>
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
        <h2 style="color: #1f2937; margin-bottom: 20px;">Reset Your Password</h2>
        <p style="color: #4b5563; line-height: 1.6;">{greeting}</p>
        <p style="color: #4b5563; line-height: 1.6;">
            We received a request to reset your password. Click the button below to create a new password.
        </p>
        <div style="text-align: center; margin: 40px 0;">
            <a href="{reset_url}"
               style="background-color: #4F46E5; color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: 600; font-size: 16px;">
                Reset Password
            </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Or copy and paste this link into your browser:
        </p>
        <p style="color: #4F46E5; font-size: 14px; word-break: break-all; background-color: #f3f4f6; padding: 12px; border-radius: 4px;">
            {reset_url}
        </p>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            This link will expire in 1 hour. If you didn't request a password reset,
            you can safely ignore this email.
        </p>
    </div>
</body>
</html>
        """

        text_content = f"""
Reset Your Password

{greeting}

We received a request to reset your password. Click the link below to create a new password.

{reset_url}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.
        """

        return await self.send_email(
            to_email=to_email,
            email_type=EmailType.PASSWORD_RESET,
            html_content=html_content,
            text_content=text_content,
            to_name=user_name,
            metadata={"reset_url": reset_url},
        )

    async def send_invitation_email(
        self,
        to_email: str,
        invitation_url: str,
        inviter_name: str,
        workspace_name: str | None = None,
        message: str | None = None,
    ) -> EmailResult:
        """Send a workspace invitation email.

        Args:
            to_email: Recipient email address
            invitation_url: The invitation link
            inviter_name: Name of the person sending the invitation
            workspace_name: Optional workspace name
            message: Optional personal message from inviter

        Returns:
            EmailResult with delivery information
        """
        workspace_text = f" to join {workspace_name}" if workspace_name else ""
        message_block = ""
        if message:
            message_block = f"""
            <div style="background-color: #f3f4f6; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #4b5563; margin: 0; font-style: italic;">"{message}"</p>
                <p style="color: #9ca3af; margin: 10px 0 0 0; font-size: 13px;">- {inviter_name}</p>
            </div>
            """

        html_content = f"""
<!DOCTYPE html>
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
        <h2 style="color: #1f2937; margin-bottom: 20px;">You've Been Invited!</h2>
        <p style="color: #4b5563; line-height: 1.6;">
            {inviter_name} has invited you{workspace_text} on RawDrive.
        </p>
        {message_block}
        <div style="text-align: center; margin: 40px 0;">
            <a href="{invitation_url}"
               style="background-color: #4F46E5; color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: 600; font-size: 16px;">
                Accept Invitation
            </a>
        </div>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            If you don't want to accept this invitation, you can ignore this email.
        </p>
    </div>
</body>
</html>
        """

        text_message = f'\n\n"{message}"\n- {inviter_name}' if message else ""
        text_content = f"""
You've Been Invited!

{inviter_name} has invited you{workspace_text} on RawDrive.{text_message}

Click the link below to accept the invitation:

{invitation_url}

If you don't want to accept this invitation, you can ignore this email.
        """

        return await self.send_email(
            to_email=to_email,
            email_type=EmailType.INVITATION,
            subject=f"{inviter_name} invited you to RawDrive",
            html_content=html_content,
            text_content=text_content,
            metadata={
                "inviter_name": inviter_name,
                "workspace_name": workspace_name,
                "invitation_url": invitation_url,
            },
        )

    async def _track_email(
        self,
        result: EmailResult,
        message: EmailMessage,
    ) -> None:
        """Track email send in Redis for monitoring.

        Args:
            result: Email result
            message: Original message
        """
        try:
            redis = await get_redis_client()
            tracking_key = f"email_service:{result.message_id}"

            await redis.hset(
                tracking_key,
                mapping={
                    "message_id": result.message_id,
                    "provider": result.provider.value,
                    "status": result.status.value,
                    "recipients": ",".join(result.recipients),
                    "email_type": message.email_type.value,
                    "subject": message.subject,
                    "sent_at": result.sent_at.isoformat(),
                },
            )
            # Expire after 7 days
            await redis.expire(tracking_key, 7 * 24 * 60 * 60)

        except Exception as e:
            # Don't fail email send if tracking fails
            logger.warning(
                "Failed to track email",
                extra={"message_id": result.message_id, "error": str(e)},
            )

    async def get_email_status(self, message_id: str) -> dict[str, Any] | None:
        """Get the status of a sent email.

        Args:
            message_id: The message ID returned when the email was sent

        Returns:
            Dict with email status info or None if not found
        """
        try:
            redis = await get_redis_client()
            tracking_key = f"email_service:{message_id}"

            data = await redis.hgetall(tracking_key)
            if not data:
                return None

            return {
                "message_id": data.get(b"message_id", b"").decode(),
                "provider": data.get(b"provider", b"").decode(),
                "status": data.get(b"status", b"").decode(),
                "recipients": data.get(b"recipients", b"").decode().split(","),
                "email_type": data.get(b"email_type", b"").decode(),
                "subject": data.get(b"subject", b"").decode(),
                "sent_at": data.get(b"sent_at", b"").decode(),
            }

        except Exception as e:
            logger.warning(
                "Failed to get email status",
                extra={"message_id": message_id, "error": str(e)},
            )
            return None


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------


_email_service: EmailService | None = None


def get_email_service() -> EmailService:
    """Get the email service singleton.

    Returns:
        EmailService singleton instance
    """
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service


# ---------------------------------------------------------------------------
# Convenience functions for common operations
# ---------------------------------------------------------------------------


async def send_verification_email(
    to_email: str,
    verification_url: str,
    user_name: str | None = None,
) -> EmailResult:
    """Convenience function to send verification email.

    Args:
        to_email: Recipient email address
        verification_url: The verification link
        user_name: Optional user's name

    Returns:
        EmailResult with delivery information
    """
    service = get_email_service()
    return await service.send_verification_email(to_email, verification_url, user_name)


async def send_welcome_email(
    to_email: str,
    user_name: str,
    workspace_name: str | None = None,
    login_url: str | None = None,
) -> EmailResult:
    """Convenience function to send welcome email.

    Args:
        to_email: Recipient email address
        user_name: User's name
        workspace_name: Optional workspace name
        login_url: Optional login URL

    Returns:
        EmailResult with delivery information
    """
    service = get_email_service()
    return await service.send_welcome_email(to_email, user_name, workspace_name, login_url)


async def send_password_reset_email(
    to_email: str,
    reset_url: str,
    user_name: str | None = None,
) -> EmailResult:
    """Convenience function to send password reset email.

    Args:
        to_email: Recipient email address
        reset_url: The password reset link
        user_name: Optional user's name

    Returns:
        EmailResult with delivery information
    """
    service = get_email_service()
    return await service.send_password_reset_email(to_email, reset_url, user_name)
