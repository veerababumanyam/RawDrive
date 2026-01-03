"""
Logging Configuration for RawDrive Backend.

Configures structured logging with PII filtering for SOC 2 compliance.

Feature: 020-invitation-rsvp-hardening
Task: T007 - Ensure structured logging filters PII
"""

import logging
import logging.config
import os
import re
from typing import Any


# PII patterns to filter from logs (SOC 2 compliance)
PII_PATTERNS = [
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"), "[EMAIL_REDACTED]"),
    (re.compile(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"), "[PHONE_REDACTED]"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN_REDACTED]"),
]


class PIIFilter(logging.Filter):
    """Filter that redacts PII from log messages."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Filter PII from log record message and args."""
        # Filter message
        if hasattr(record, "msg") and isinstance(record.msg, str):
            for pattern, replacement in PII_PATTERNS:
                record.msg = pattern.sub(replacement, record.msg)

        # Filter args if present
        if hasattr(record, "args") and record.args:
            if isinstance(record.args, dict):
                record.args = self._filter_dict(record.args)
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    self._filter_value(arg) for arg in record.args
                )

        return True

    def _filter_value(self, value: Any) -> Any:
        """Filter a single value for PII."""
        if isinstance(value, str):
            for pattern, replacement in PII_PATTERNS:
                value = pattern.sub(replacement, value)
        elif isinstance(value, dict):
            value = self._filter_dict(value)
        return value

    def _filter_dict(self, d: dict) -> dict:
        """Filter a dictionary for PII."""
        result = {}
        for key, value in d.items():
            # Redact known PII field names (SOC 2 compliance - T052)
            pii_field_names = (
                "email", "guest_email", "phone", "guest_phone", "ssn",
                "guest_name", "name", "party_names", "dietary_preferences",
                "message", "ip_address", "user_agent",
            )
            if key.lower() in pii_field_names:
                result[key] = "[REDACTED]"
            else:
                result[key] = self._filter_value(value)
        return result


def configure_logging() -> None:
    """Configure application logging with PII filtering."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    log_format = os.getenv(
        "LOG_FORMAT",
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Configure root logger
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format=log_format,
    )

    # Add PII filter to root logger
    root_logger = logging.getLogger()
    pii_filter = PIIFilter()
    for handler in root_logger.handlers:
        handler.addFilter(pii_filter)

    # Set specific loggers
    logging.getLogger("rawdrive").setLevel(getattr(logging, log_level, logging.INFO))
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the specified name."""
    logger = logging.getLogger(name)
    pii_filter = PIIFilter()
    logger.addFilter(pii_filter)
    return logger
