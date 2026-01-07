"""
Structured logging configuration for the Notifications Microservice.

Provides production-ready logging with:
- JSON output for log aggregation (ELK, Loki)
- PII filtering for GDPR/privacy compliance
- Correlation ID tracking for distributed tracing
- Context variables for request-scoped data
- Notification-specific field redaction

CRITICAL: This service handles sensitive user data (emails, phone numbers, names).
All log output MUST be filtered through PII processors to prevent data leakage.
"""

from __future__ import annotations

import json
import logging
import re
import sys
import traceback
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Union

# =============================================================================
# Context Variables for Request-Scoped Logging
# =============================================================================

correlation_id_ctx: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
workspace_id_ctx: ContextVar[Optional[str]] = ContextVar("workspace_id", default=None)
user_id_ctx: ContextVar[Optional[str]] = ContextVar("user_id", default=None)
notification_id_ctx: ContextVar[Optional[str]] = ContextVar("notification_id", default=None)

# =============================================================================
# PII Detection Configuration
# =============================================================================

# Keys that should ALWAYS have their values fully redacted
SENSITIVE_KEYS: Set[str] = frozenset({
    # Authentication & Secrets
    "password",
    "token",
    "secret",
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "credential",
    "private_key",
    "access_token",
    "refresh_token",
    "jwt",
    "bearer",
    "sendgrid_api_key",
    "twilio_auth_token",
    "webhook_signing_key",

    # Personal Identifiers
    "email",
    "email_address",
    "recipient_email",
    "sender_email",
    "phone",
    "phone_number",
    "mobile",
    "sms_number",
    "recipient_phone",

    # Names
    "name",
    "full_name",
    "first_name",
    "last_name",
    "nickname",
    "recipient_name",
    "sender_name",
    "guest_name",
    "client_name",

    # Address & Location
    "address",
    "address_line1",
    "address_line2",
    "street",
    "city",
    "postal_code",
    "zip_code",

    # Notification Content (may contain PII)
    "message",
    "body",
    "content",
    "html_content",
    "text_content",
    "subject",
    "personalization",
})

# Keys that should be partially masked (show first/last chars)
MASKABLE_KEYS: Set[str] = frozenset({
    "edit_token",
    "session_id",
    "tracking_id",
    "unsubscribe_token",
})

# Regex patterns for detecting PII in string values
PII_PATTERNS: List[tuple] = [
    # Email addresses
    (
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", re.IGNORECASE),
        "[EMAIL_REDACTED]",
    ),
    # Phone numbers (various formats)
    (
        re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
        "[PHONE_REDACTED]",
    ),
    # International phone numbers
    (
        re.compile(r"\b\+\d{1,3}[-.\s]?\d{1,14}\b"),
        "[PHONE_REDACTED]",
    ),
    # Credit card numbers (basic pattern)
    (
        re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
        "[CARD_REDACTED]",
    ),
    # SSN pattern
    (
        re.compile(r"\b\d{3}[-]?\d{2}[-]?\d{4}\b"),
        "[SSN_REDACTED]",
    ),
    # Password in key-value format
    (
        re.compile(r"password[\"']?\s*[:=]\s*[\"']?[^\"'\s,}]+", re.IGNORECASE),
        "password=[REDACTED]",
    ),
]

# =============================================================================
# PII Filtering Functions
# =============================================================================


def _mask_value(value: str, show_chars: int = 4) -> str:
    """
    Mask a string value, showing only first and last few characters.

    Args:
        value: String to mask
        show_chars: Number of characters to show at start and end

    Returns:
        Masked string like "abc1...xyz9"
    """
    if not value or len(value) <= show_chars * 2:
        return "[MASKED]"
    return f"{value[:show_chars]}...{value[-show_chars:]}"


def _redact_pii_in_string(value: str) -> str:
    """
    Apply PII pattern matching to a string value.

    Args:
        value: String to scan for PII patterns

    Returns:
        String with PII patterns replaced with redaction markers
    """
    for pattern, replacement in PII_PATTERNS:
        value = pattern.sub(replacement, value)
    return value


def filter_pii_from_value(value: str) -> str:
    """
    Filter PII from a string value.

    This is the public interface for PII filtering, useful for
    sanitizing individual strings outside of the log processors.

    Args:
        value: String to filter

    Returns:
        String with PII patterns replaced with redaction markers
    """
    if not isinstance(value, str):
        return value
    return _redact_pii_in_string(value)


def redact_sensitive(data: Any, depth: int = 0) -> Any:
    """
    Recursively redact sensitive values from log data.

    Handles nested structures (dicts, lists) up to depth 10
    to prevent infinite recursion on circular references.

    Args:
        data: Data structure to redact
        depth: Current recursion depth

    Returns:
        Data with sensitive values redacted
    """
    if depth > 10:
        return "[MAX_DEPTH_EXCEEDED]"

    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            key_lower = key.lower() if isinstance(key, str) else str(key)

            # Check if key indicates sensitive data
            if key_lower in SENSITIVE_KEYS:
                result[key] = "[REDACTED]"
            elif key_lower in MASKABLE_KEYS and isinstance(value, str):
                result[key] = _mask_value(value)
            elif isinstance(value, str):
                # Apply pattern-based PII detection
                result[key] = _redact_pii_in_string(value)
            else:
                result[key] = redact_sensitive(value, depth + 1)
        return result

    if isinstance(data, list):
        return [redact_sensitive(item, depth + 1) for item in data]

    if isinstance(data, str):
        return _redact_pii_in_string(data)

    return data


# =============================================================================
# Log Formatters
# =============================================================================


class PIIFilter(logging.Filter):
    """
    Logging filter that redacts PII from log records.

    Applied to handlers to ensure no sensitive data escapes to logs.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        """
        Process and redact PII from log record.

        Args:
            record: Log record to filter

        Returns:
            True (always allow record, but redacted)
        """
        # Redact from message if it's a dict
        if hasattr(record, "msg") and isinstance(record.msg, dict):
            record.msg = redact_sensitive(record.msg)

        # Redact sensitive fields from record attributes
        if hasattr(record, "__dict__"):
            for key in list(record.__dict__.keys()):
                if isinstance(key, str) and key.lower() in SENSITIVE_KEYS:
                    setattr(record, key, "[REDACTED]")

        return True


class JSONFormatter(logging.Formatter):
    """
    JSON log formatter for structured logging.

    Outputs logs as single-line JSON objects with:
    - ISO 8601 timestamps
    - Log level and logger name
    - Message and extra fields
    - Exception info if present
    - Request context (correlation_id, workspace_id, user_id)
    - Notification context (notification_id)
    """

    def __init__(
        self,
        service_name: str = "notifications-service",
        service_version: str = "1.0.0",
    ) -> None:
        super().__init__()
        self.service_name = service_name
        self.service_version = service_version

    def format(self, record: logging.LogRecord) -> str:
        """
        Format log record as JSON.

        Args:
            record: Log record to format

        Returns:
            JSON string representation of log record
        """
        # Build base log object
        log_obj: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": _redact_pii_in_string(record.getMessage()),
            "service": self.service_name,
            "version": self.service_version,
        }

        # Add source location for warnings and above
        if record.levelno >= logging.WARNING:
            log_obj["location"] = {
                "file": record.filename,
                "line": record.lineno,
                "function": record.funcName,
            }

        # Add context from context vars
        correlation_id = correlation_id_ctx.get()
        if correlation_id:
            log_obj["correlation_id"] = correlation_id

        request_id = request_id_ctx.get()
        if request_id:
            log_obj["request_id"] = request_id

        workspace_id = workspace_id_ctx.get()
        if workspace_id:
            log_obj["workspace_id"] = workspace_id

        user_id = user_id_ctx.get()
        if user_id:
            log_obj["user_id"] = user_id

        notification_id = notification_id_ctx.get()
        if notification_id:
            log_obj["notification_id"] = notification_id

        # Add extra fields from record (redacted)
        standard_keys = {
            "name", "msg", "args", "created", "filename", "funcName",
            "levelname", "levelno", "lineno", "module", "msecs",
            "pathname", "process", "processName", "relativeCreated",
            "stack_info", "exc_info", "exc_text", "thread", "threadName",
            "message", "taskName",
        }

        if hasattr(record, "__dict__"):
            extra_keys = set(record.__dict__.keys()) - standard_keys
            if extra_keys:
                extra = {k: record.__dict__[k] for k in extra_keys}
                log_obj["extra"] = redact_sensitive(extra)

        # Add exception info if present
        if record.exc_info:
            log_obj["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": traceback.format_exception(*record.exc_info)
                if record.exc_info[2] else None,
            }

        # Serialize to single-line JSON
        return json.dumps(log_obj, default=str, ensure_ascii=False)


class ConsoleFormatter(logging.Formatter):
    """
    Human-readable console formatter for development.

    Outputs colored log lines with timestamps, levels, and context.
    """

    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        """
        Format log record for console output.

        Args:
            record: Log record to format

        Returns:
            Formatted, colored string for console
        """
        color = self.COLORS.get(record.levelname, self.RESET)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Redact PII from message
        message = _redact_pii_in_string(record.getMessage())

        # Build context string
        context_parts = []
        correlation_id = correlation_id_ctx.get()
        if correlation_id:
            context_parts.append(f"req:{correlation_id[:8]}")
        notification_id = notification_id_ctx.get()
        if notification_id:
            context_parts.append(f"notif:{notification_id[:8]}")

        context_str = f" [{' '.join(context_parts)}]" if context_parts else ""

        formatted = (
            f"{color}{timestamp} [{record.levelname}]{context_str} "
            f"{record.name}: {message}{self.RESET}"
        )

        if record.exc_info:
            formatted += f"\n{self.formatException(record.exc_info)}"

        return formatted


# =============================================================================
# Logging Configuration
# =============================================================================


def configure_logging(
    log_level: str = "INFO",
    json_format: bool = True,
    service_name: str = "notifications-service",
    service_version: str = "1.0.0",
) -> None:
    """
    Configure application logging.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_format: Use JSON format (True for production, False for development)
        service_name: Service name for log entries
        service_version: Service version for log entries
    """
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(root_logger.level)

    # Add PII filter
    pii_filter = PIIFilter()
    handler.addFilter(pii_filter)

    # Set formatter based on output mode
    if json_format:
        formatter = JSONFormatter(service_name, service_version)
    else:
        formatter = ConsoleFormatter()

    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    # Suppress noisy third-party loggers
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    logging.getLogger("redis").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    # Log initialization
    root_logger.info(
        f"{service_name} logging configured",
        extra={"log_level": log_level, "json_format": json_format},
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger with the given name.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Logger instance
    """
    return logging.getLogger(name)


# =============================================================================
# Context Setters
# =============================================================================


def set_correlation_id(value: str) -> None:
    """Set correlation ID for current context."""
    correlation_id_ctx.set(value)


def set_request_id(value: str) -> None:
    """Set request ID for current context."""
    request_id_ctx.set(value)


def set_workspace_id(value: str) -> None:
    """Set workspace ID for current context."""
    workspace_id_ctx.set(value)


def set_user_id(value: str) -> None:
    """Set user ID for current context."""
    user_id_ctx.set(value)


def set_notification_id(value: str) -> None:
    """Set notification ID for current context."""
    notification_id_ctx.set(value)


def clear_context() -> None:
    """Clear all context variables."""
    correlation_id_ctx.set(None)
    request_id_ctx.set(None)
    workspace_id_ctx.set(None)
    user_id_ctx.set(None)
    notification_id_ctx.set(None)


def bind_context(**kwargs: str) -> None:
    """
    Bind multiple context values at once.

    Args:
        **kwargs: Context key-value pairs (correlation_id, workspace_id, etc.)
    """
    if "correlation_id" in kwargs:
        set_correlation_id(kwargs["correlation_id"])
    if "request_id" in kwargs:
        set_request_id(kwargs["request_id"])
    if "workspace_id" in kwargs:
        set_workspace_id(kwargs["workspace_id"])
    if "user_id" in kwargs:
        set_user_id(kwargs["user_id"])
    if "notification_id" in kwargs:
        set_notification_id(kwargs["notification_id"])


# =============================================================================
# Request Context Manager
# =============================================================================


class RequestLogContext:
    """
    Context manager for request-scoped logging.

    Automatically sets and clears context variables for the duration
    of a request, ensuring proper correlation in distributed tracing.

    Usage:
        async with RequestLogContext(
            correlation_id="abc-123",
            workspace_id="ws-456",
        ):
            logger.info("Processing request")
    """

    def __init__(
        self,
        correlation_id: Optional[str] = None,
        request_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        user_id: Optional[str] = None,
        notification_id: Optional[str] = None,
    ) -> None:
        self.correlation_id = correlation_id
        self.request_id = request_id
        self.workspace_id = workspace_id
        self.user_id = user_id
        self.notification_id = notification_id
        self._tokens: Dict[str, Any] = {}

    def __enter__(self) -> "RequestLogContext":
        if self.correlation_id:
            self._tokens["correlation_id"] = correlation_id_ctx.set(self.correlation_id)
        if self.request_id:
            self._tokens["request_id"] = request_id_ctx.set(self.request_id)
        if self.workspace_id:
            self._tokens["workspace_id"] = workspace_id_ctx.set(self.workspace_id)
        if self.user_id:
            self._tokens["user_id"] = user_id_ctx.set(self.user_id)
        if self.notification_id:
            self._tokens["notification_id"] = notification_id_ctx.set(self.notification_id)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        # Reset context vars to previous values
        if "correlation_id" in self._tokens:
            correlation_id_ctx.reset(self._tokens["correlation_id"])
        if "request_id" in self._tokens:
            request_id_ctx.reset(self._tokens["request_id"])
        if "workspace_id" in self._tokens:
            workspace_id_ctx.reset(self._tokens["workspace_id"])
        if "user_id" in self._tokens:
            user_id_ctx.reset(self._tokens["user_id"])
        if "notification_id" in self._tokens:
            notification_id_ctx.reset(self._tokens["notification_id"])

    async def __aenter__(self) -> "RequestLogContext":
        return self.__enter__()

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        self.__exit__(exc_type, exc_val, exc_tb)


# =============================================================================
# Notification-Specific Logging Helpers
# =============================================================================


def log_notification_event(
    logger: logging.Logger,
    event_type: str,
    notification_id: str,
    channel: str,
    status: str,
    **extra: Any,
) -> None:
    """
    Log a notification event with standardized structure.

    Use this for consistent notification lifecycle logging.

    Args:
        logger: Logger instance
        event_type: Event type (created, queued, sent, delivered, failed, etc.)
        notification_id: Unique notification identifier
        channel: Delivery channel (email, sms, push, in_app)
        status: Status of the notification
        **extra: Additional context (redacted automatically)
    """
    logger.info(
        f"Notification {event_type}: {notification_id}",
        extra={
            "notification_event": event_type,
            "notification_id": notification_id,
            "channel": channel,
            "status": status,
            **redact_sensitive(extra),
        },
    )


def log_delivery_attempt(
    logger: logging.Logger,
    notification_id: str,
    channel: str,
    attempt: int,
    success: bool,
    duration_ms: float,
    provider: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    """
    Log a delivery attempt with timing and result.

    Args:
        logger: Logger instance
        notification_id: Unique notification identifier
        channel: Delivery channel
        attempt: Attempt number (1-based)
        success: Whether delivery succeeded
        duration_ms: Time taken in milliseconds
        provider: Provider name (sendgrid, twilio, etc.)
        error: Error message if failed
    """
    level = logging.INFO if success else logging.WARNING
    status = "success" if success else "failed"

    logger.log(
        level,
        f"Delivery attempt {attempt} {status}: {notification_id}",
        extra={
            "delivery_attempt": {
                "notification_id": notification_id,
                "channel": channel,
                "attempt": attempt,
                "success": success,
                "duration_ms": duration_ms,
                "provider": provider,
                "error": error,
            },
        },
    )


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Configuration
    "configure_logging",
    "get_logger",

    # Context management
    "set_correlation_id",
    "set_request_id",
    "set_workspace_id",
    "set_user_id",
    "set_notification_id",
    "clear_context",
    "bind_context",
    "RequestLogContext",

    # Context vars (for advanced use)
    "correlation_id_ctx",
    "request_id_ctx",
    "workspace_id_ctx",
    "user_id_ctx",
    "notification_id_ctx",

    # PII filtering
    "redact_sensitive",
    "filter_pii_from_value",
    "SENSITIVE_KEYS",
    "PII_PATTERNS",

    # Formatters (for customization)
    "JSONFormatter",
    "ConsoleFormatter",
    "PIIFilter",

    # Notification helpers
    "log_notification_event",
    "log_delivery_attempt",
]
