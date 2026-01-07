"""
Structured logging configuration with PII filtering.

Configures structured JSON logging for production with automatic PII redaction.
NEVER logs sensitive client data (emails, phone numbers, addresses, names).
"""

import logging
import sys
from typing import Any, Dict
import json

from src.middleware.correlation import get_correlation_id


# PII fields that should NEVER be logged
PII_FIELDS = {
    "email",
    "phone",
    "phone_number",
    "address",
    "address_line1",
    "address_line2",
    "full_name",
    "first_name",
    "last_name",
    "nickname",
    "password",
    "token",
    "secret",
    "api_key",
}


class PIIFilter(logging.Filter):
    """Filter to redact PII from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        """
        Redact PII fields from log record.

        Args:
            record: Log record

        Returns:
            bool: True (allow record but redacted)
        """
        # Redact from message
        if hasattr(record, "msg") and isinstance(record.msg, dict):
            record.msg = self._redact_dict(record.msg)

        # Redact from extra fields
        if hasattr(record, "__dict__"):
            for key in list(record.__dict__.keys()):
                if key.lower() in PII_FIELDS:
                    setattr(record, key, "[REDACTED]")

        return True

    def _redact_dict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively redact PII from dictionary."""
        redacted = {}
        for key, value in data.items():
            if key.lower() in PII_FIELDS:
                redacted[key] = "[REDACTED]"
            elif isinstance(value, dict):
                redacted[key] = self._redact_dict(value)
            elif isinstance(value, list):
                redacted[key] = [
                    self._redact_dict(item) if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                redacted[key] = value
        return redacted


class StructuredFormatter(logging.Formatter):
    """JSON formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        """
        Format log record as JSON.

        Args:
            record: Log record

        Returns:
            str: JSON-formatted log entry
        """
        log_data = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": get_correlation_id(),
        }

        # Add extra fields
        if hasattr(record, "extra"):
            log_data.update(record.extra)

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)


def configure_logging(
    log_level: str = "INFO",
    json_format: bool = True,
    service_name: str = "client-service",
) -> None:
    """
    Configure structured logging for the service.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_format: Use JSON formatting (True for production)
        service_name: Service name for log context
    """
    # Create root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create console handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, log_level.upper()))

    # Set formatter
    if json_format:
        formatter = StructuredFormatter()
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handler.setFormatter(formatter)

    # Add PII filter
    pii_filter = PIIFilter()
    handler.addFilter(pii_filter)

    # Add handler to root logger
    root_logger.addHandler(handler)

    # Configure uvicorn loggers
    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
        logger = logging.getLogger(logger_name)
        logger.handlers = []
        logger.propagate = True

    # Log initialization
    root_logger.info(
        f"{service_name} logging configured",
        extra={"log_level": log_level, "json_format": json_format},
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get logger for module.

    Args:
        name: Logger name (usually __name__)

    Returns:
        logging.Logger: Configured logger
    """
    return logging.getLogger(name)
