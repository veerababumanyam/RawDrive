"""
Logging module for Sync Service.

Provides structured logging with PII filtering.
"""

import logging
import sys
from typing import Optional
import json


class PIIFilter(logging.Filter):
    """Filter to redact PII from log messages."""

    PII_PATTERNS = [
        "password",
        "token",
        "secret",
        "api_key",
        "apikey",
        "authorization",
        "email",
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        """Filter and redact PII from log records."""
        if hasattr(record, "msg") and isinstance(record.msg, str):
            for pattern in self.PII_PATTERNS:
                if pattern.lower() in record.msg.lower():
                    record.msg = record.msg.replace(
                        pattern, f"[REDACTED:{pattern.upper()}]"
                    )
        return True


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_data = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
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
    service_name: str = "sync-service",
) -> None:
    """
    Configure logging for the service.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_format: Use JSON format for logs (recommended for production)
        service_name: Service name to include in logs
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create console handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Set formatter
    if json_format:
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            f"%(asctime)s - {service_name} - %(name)s - %(levelname)s - %(message)s"
        )

    handler.setFormatter(formatter)

    # Add PII filter
    handler.addFilter(PIIFilter())

    root_logger.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance.

    Args:
        name: Logger name (typically __name__)

    Returns:
        logging.Logger: Configured logger instance
    """
    return logging.getLogger(name)


__all__ = ["configure_logging", "get_logger"]
