"""
Structured Logging Configuration for RawDrive Backend.

Implements Structlog with JSON output format, PII filtering for SOC 2 compliance,
correlation ID injection, and configurable log levels.

Feature: core-structured-logging
"""

from __future__ import annotations

import logging
import logging.config
import os
import re
import sys
from typing import Any, MutableMapping, Optional

import structlog
from structlog.types import EventDict, WrappedLogger


# =============================================================================
# PII Patterns for SOC 2 Compliance
# =============================================================================

PII_PATTERNS = [
    # Email addresses
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"), "[EMAIL_REDACTED]"),
    # Phone numbers (various formats)
    (re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[PHONE_REDACTED]"),
    # SSN
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN_REDACTED]"),
    # Names in common patterns (e.g., "name: John Doe" or "Name=John Doe")
    (re.compile(r"(?i)(?:name[=:\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)"), "name: [NAME_REDACTED]"),
]

# Known PII field names that should always be redacted
PII_FIELD_NAMES = frozenset({
    "email", "guest_email", "user_email", "customer_email",
    "phone", "guest_phone", "phone_number", "mobile",
    "ssn", "social_security",
    "name", "guest_name", "full_name", "first_name", "last_name", "user_name",
    "party_names", "dietary_preferences", "address",
    "message", "personal_message",
    "ip_address", "user_agent", "ip",
    "password", "secret", "token", "api_key", "auth_token",
    "credit_card", "card_number", "cvv", "expiry",
})


# =============================================================================
# Structlog Processors
# =============================================================================

def _get_correlation_id_safe() -> str:
    """Safely get correlation ID, avoiding circular imports."""
    try:
        from app.middleware.correlation import get_correlation_id
        return get_correlation_id()
    except ImportError:
        return ""


def _get_request_id_safe() -> str:
    """Safely get request ID, avoiding circular imports."""
    try:
        from app.middleware.request_id import get_request_id
        return get_request_id()
    except ImportError:
        return ""


def add_correlation_id(
    logger: WrappedLogger, method_name: str, event_dict: EventDict
) -> EventDict:
    """
    Processor that injects the correlation ID and request ID into every log entry.

    Uses context variables from CorrelationMiddleware and RequestIdMiddleware
    for consistent distributed tracing across the request lifecycle.

    - correlation_id: Tracks a logical operation across multiple services
    - request_id: Unique identifier for this specific HTTP request
    """
    # Get correlation ID from CorrelationMiddleware
    correlation_id = _get_correlation_id_safe()
    if correlation_id:
        event_dict["correlation_id"] = correlation_id

    # Get request ID from RequestIdMiddleware (for backward compatibility)
    request_id = _get_request_id_safe()
    if request_id:
        event_dict["request_id"] = request_id

    return event_dict


def filter_pii_in_value(value: Any) -> Any:
    """Recursively filter PII from a value."""
    if isinstance(value, str):
        result = value
        for pattern, replacement in PII_PATTERNS:
            result = pattern.sub(replacement, result)
        return result
    elif isinstance(value, dict):
        return filter_pii_dict(value)
    elif isinstance(value, (list, tuple)):
        return type(value)(filter_pii_in_value(v) for v in value)
    return value


def filter_pii_dict(d: MutableMapping[str, Any]) -> dict[str, Any]:
    """Filter PII from a dictionary, handling nested structures."""
    result: dict[str, Any] = {}
    for key, value in d.items():
        key_lower = key.lower()
        # Check if this is a known PII field
        if key_lower in PII_FIELD_NAMES:
            result[key] = "[REDACTED]"
        else:
            result[key] = filter_pii_in_value(value)
    return result


def filter_pii(
    logger: WrappedLogger, method_name: str, event_dict: EventDict
) -> EventDict:
    """
    Processor that filters PII from log entries for SOC 2 compliance.

    Handles:
    - Email addresses (pattern-based)
    - Phone numbers (pattern-based)
    - SSN (pattern-based)
    - Names (pattern-based and field-based)
    - Known PII field names (field-based redaction)
    """
    return filter_pii_dict(event_dict)


def add_log_level(
    logger: WrappedLogger, method_name: str, event_dict: EventDict
) -> EventDict:
    """Add log level to the event dict."""
    event_dict["level"] = method_name.upper()
    return event_dict


def add_service_context(
    logger: WrappedLogger, method_name: str, event_dict: EventDict
) -> EventDict:
    """Add service context information to logs."""
    event_dict["service"] = os.getenv("APP_NAME", "rawdrive-backend")
    event_dict["environment"] = os.getenv("APP_ENV", "development")
    return event_dict


# =============================================================================
# Legacy Filter for Standard Library Logging Compatibility
# =============================================================================

class PIIFilter(logging.Filter):
    """
    Filter that redacts PII from log messages.

    Maintained for backward compatibility with standard library logging.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        """Filter PII from log record message and args."""
        # Filter message
        if hasattr(record, "msg") and isinstance(record.msg, str):
            for pattern, replacement in PII_PATTERNS:
                record.msg = pattern.sub(replacement, record.msg)

        # Filter args if present
        if hasattr(record, "args") and record.args:
            if isinstance(record.args, dict):
                record.args = filter_pii_dict(record.args)
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    filter_pii_in_value(arg) for arg in record.args
                )

        return True


# =============================================================================
# Log Format Configurations
# =============================================================================

def get_json_processors() -> list:
    """Get processors for JSON output format."""
    return [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        add_correlation_id,
        add_service_context,
        filter_pii,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ]


def get_console_processors() -> list:
    """Get processors for human-readable console output."""
    return [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        add_correlation_id,
        add_service_context,
        filter_pii,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.dev.ConsoleRenderer(colors=True),
    ]


def get_plain_processors() -> list:
    """Get processors for plain text output (no colors)."""
    return [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        add_correlation_id,
        add_service_context,
        filter_pii,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.dev.ConsoleRenderer(colors=False),
    ]


# =============================================================================
# Main Configuration Functions
# =============================================================================

def configure_logging() -> None:
    """
    Configure application logging with structlog and PII filtering.

    Environment Variables:
    - LOG_LEVEL: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL). Default: INFO
    - LOG_FORMAT: Output format (json, console, plain). Default: json in production, console in development
    - APP_ENV: Application environment (development, staging, production, test)

    Features:
    - JSON output format for production (structured logs for Loki/ELK)
    - Colored console output for development
    - PII filtering for SOC 2 compliance
    - Correlation ID injection for distributed tracing
    - Service context (service name, environment)
    """
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    app_env = os.getenv("APP_ENV", "development").lower()

    # Determine log format based on environment or explicit setting
    default_format = "json" if app_env in ("production", "staging") else "console"
    log_format = os.getenv("LOG_FORMAT", default_format).lower()

    # Get numeric log level
    numeric_level = getattr(logging, log_level, logging.INFO)

    # Select processors based on format
    if log_format == "json":
        processors = get_json_processors()
    elif log_format == "plain":
        processors = get_plain_processors()
    else:  # console (default for development)
        processors = get_console_processors()

    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(numeric_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Also configure standard library logging for compatibility
    # This ensures libraries using standard logging also get PII filtering
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=numeric_level,
    )

    # Add PII filter to root logger for stdlib compatibility
    root_logger = logging.getLogger()
    pii_filter = PIIFilter()
    for handler in root_logger.handlers:
        handler.addFilter(pii_filter)

    # Set log levels for noisy libraries
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def get_logger(name: Optional[str] = None) -> structlog.BoundLogger:
    """
    Get a structlog logger instance.

    Args:
        name: Optional logger name. If not provided, uses the calling module's name.

    Returns:
        A bound structlog logger with PII filtering and correlation ID injection.

    Usage:
        logger = get_logger(__name__)
        logger.info("User logged in", user_id="123")

        # With additional context binding
        logger = get_logger(__name__).bind(workspace_id="ws-123")
        logger.info("Asset uploaded", asset_id="asset-456")
    """
    logger = structlog.get_logger(name)
    return logger


def bind_contextvars(**kwargs: Any) -> None:
    """
    Bind context variables that will be included in all subsequent log entries.

    Useful for adding request-scoped context at the middleware level.

    Args:
        **kwargs: Key-value pairs to bind to the context.

    Usage:
        bind_contextvars(user_id="123", workspace_id="ws-456")
        logger.info("Operation completed")  # Will include user_id and workspace_id
    """
    structlog.contextvars.bind_contextvars(**kwargs)


def clear_contextvars() -> None:
    """
    Clear all bound context variables.

    Should be called at the end of request processing to prevent context leaking.
    """
    structlog.contextvars.clear_contextvars()


def unbind_contextvars(*keys: str) -> None:
    """
    Remove specific keys from the context.

    Args:
        *keys: Keys to remove from the context.
    """
    structlog.contextvars.unbind_contextvars(*keys)


# =============================================================================
# Convenience Logging Functions
# =============================================================================

_default_logger: Optional[structlog.BoundLogger] = None


def _get_default_logger() -> structlog.BoundLogger:
    """Get or create the default logger."""
    global _default_logger
    if _default_logger is None:
        _default_logger = get_logger("rawdrive")
    return _default_logger


def log_info(message: str, **kwargs: Any) -> None:
    """Log an info message with optional context."""
    _get_default_logger().info(message, **kwargs)


def log_warning(message: str, **kwargs: Any) -> None:
    """Log a warning message with optional context."""
    _get_default_logger().warning(message, **kwargs)


def log_error(message: str, **kwargs: Any) -> None:
    """Log an error message with optional context."""
    _get_default_logger().error(message, **kwargs)


def log_debug(message: str, **kwargs: Any) -> None:
    """Log a debug message with optional context."""
    _get_default_logger().debug(message, **kwargs)


def log_exception(message: str, **kwargs: Any) -> None:
    """Log an exception with traceback."""
    _get_default_logger().exception(message, **kwargs)
