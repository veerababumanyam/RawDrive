"""
Log formatters and processors for structured logging.

Includes PII filtering to ensure GDPR compliance by removing
personally identifiable information from log output.
"""

import re
from typing import Any, Callable

from structlog.typing import EventDict, WrappedLogger


# PII detection patterns
PII_PATTERNS = [
    # Email addresses
    (
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", re.IGNORECASE),
        "[EMAIL REDACTED]",
    ),
    # Phone numbers (various formats)
    (
        re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
        "[PHONE REDACTED]",
    ),
    # Credit card numbers (basic pattern)
    (
        re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
        "[CARD REDACTED]",
    ),
]

# Keys that should always have their values redacted
SENSITIVE_KEYS = frozenset({
    "email",
    "phone",
    "name",
    "guest_name",
    "recipient_name",
    "recipient_email",
    "dietary_restrictions",
    "message",
    "password",
    "token",
    "secret",
    "api_key",
    "authorization",
})

# Keys that should be partially masked (show first/last few chars)
MASKABLE_KEYS = frozenset({
    "edit_token",
    "jwt",
    "bearer",
})


def _mask_value(value: str, show_chars: int = 4) -> str:
    """Mask a string value, showing only first and last few characters."""
    if len(value) <= show_chars * 2:
        return "[MASKED]"
    return f"{value[:show_chars]}...{value[-show_chars:]}"


def _redact_pii_in_string(value: str) -> str:
    """Apply PII pattern matching to a string value."""
    for pattern, replacement in PII_PATTERNS:
        value = pattern.sub(replacement, value)
    return value


# Public function for direct PII filtering (used in tests and external calls)
def filter_pii_from_value(value: str) -> str:
    """
    Filter PII from a string value.

    This is the public interface for PII filtering, useful for
    sanitizing individual strings outside of the structlog processor.

    Args:
        value: String to filter

    Returns:
        String with PII patterns replaced with redaction markers
    """
    if not isinstance(value, str):
        return value
    return _redact_pii_in_string(value)


def _process_value(key: str, value: Any) -> Any:
    """Process a single value for PII filtering."""
    key_lower = key.lower()

    # Check if key indicates sensitive data
    if key_lower in SENSITIVE_KEYS:
        return "[REDACTED]"

    # Check if key should be masked
    if key_lower in MASKABLE_KEYS and isinstance(value, str):
        return _mask_value(value)

    # Process string values for PII patterns
    if isinstance(value, str):
        return _redact_pii_in_string(value)

    # Recursively process dictionaries
    if isinstance(value, dict):
        return {k: _process_value(k, v) for k, v in value.items()}

    # Process lists
    if isinstance(value, list):
        return [_process_value(key, item) for item in value]

    return value


def filter_pii(
    logger: WrappedLogger,
    method_name: str,
    event_dict: EventDict,
) -> EventDict:
    """
    Structlog processor that filters PII from log output.

    Removes or redacts:
    - Email addresses
    - Phone numbers
    - Names and other personal identifiers
    - Sensitive authentication data

    Args:
        logger: The wrapped logger instance
        method_name: Name of the log method being called
        event_dict: Dictionary of event data to be logged

    Returns:
        Filtered event dictionary with PII removed
    """
    filtered = {}
    for key, value in event_dict.items():
        # Always preserve structural keys
        if key in ("event", "level", "timestamp", "logger", "service"):
            filtered[key] = value
        else:
            filtered[key] = _process_value(key, value)

    return filtered


def add_service_context(service_name: str) -> Callable:
    """
    Create a processor that adds service context to all log entries.

    Args:
        service_name: Name of the service to add to logs

    Returns:
        Structlog processor function
    """

    def processor(
        logger: WrappedLogger,
        method_name: str,
        event_dict: EventDict,
    ) -> EventDict:
        event_dict["service"] = service_name
        return event_dict

    return processor
