"""
Structured logging for the Gallery Microservice.

Features:
- JSON logging for production (structured)
- PII filtering for GDPR compliance
- Correlation ID tracking
- Performance metrics
"""

from __future__ import annotations

import logging
import sys
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import re


# PII patterns to filter
PII_PATTERNS = [
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"), "[EMAIL]"),
    (re.compile(r"\b\d{10,15}\b"), "[PHONE]"),
    (re.compile(r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b"), "[CARD]"),
    (re.compile(r"password[\"']?\s*[:=]\s*[\"']?[^\"'\s,}]+", re.I), "password=[REDACTED]"),
    (re.compile(r"pin[\"']?\s*[:=]\s*[\"']?\d+", re.I), "pin=[REDACTED]"),
]


def filter_pii(message: str) -> str:
    """Remove PII from log messages."""
    for pattern, replacement in PII_PATTERNS:
        message = pattern.sub(replacement, message)
    return message


class JSONFormatter(logging.Formatter):
    """JSON log formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": filter_pii(record.getMessage()),
            "service": "gallery-service",
        }

        # Add extra fields
        if hasattr(record, "correlation_id"):
            log_data["correlation_id"] = record.correlation_id
        if hasattr(record, "workspace_id"):
            log_data["workspace_id"] = record.workspace_id
        if hasattr(record, "gallery_id"):
            log_data["gallery_id"] = record.gallery_id
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms

        # Add exception info
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add any extra attributes
        if hasattr(record, "extra") and isinstance(record.extra, dict):
            for key, value in record.extra.items():
                if key not in log_data:
                    log_data[key] = value

        return json.dumps(log_data)


class ConsoleFormatter(logging.Formatter):
    """Human-readable console formatter for development."""

    COLORS = {
        "DEBUG": "\033[36m",    # Cyan
        "INFO": "\033[32m",     # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",    # Red
        "CRITICAL": "\033[35m", # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        message = filter_pii(record.getMessage())

        # Add correlation ID if present
        correlation = ""
        if hasattr(record, "correlation_id"):
            correlation = f" [{record.correlation_id[:8]}]"

        formatted = f"{color}{timestamp} [{record.levelname}]{correlation} {record.name}: {message}{self.RESET}"

        if record.exc_info:
            formatted += f"\n{self.formatException(record.exc_info)}"

        return formatted


def configure_logging(
    log_level: str = "INFO",
    json_format: bool = True,
    service_name: str = "gallery-service",
) -> None:
    """Configure application logging.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)
        json_format: Use JSON format (True) or console format (False)
        service_name: Service name for log entries
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(root_logger.level)

    # Set formatter
    if json_format:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(ConsoleFormatter())

    root_logger.addHandler(handler)

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    logging.getLogger("redis").setLevel(logging.WARNING)


class LoggerAdapter(logging.LoggerAdapter):
    """Logger adapter with context support."""

    def process(self, msg: str, kwargs: Dict[str, Any]) -> tuple:
        extra = kwargs.get("extra", {})
        extra.update(self.extra)
        kwargs["extra"] = extra
        return msg, kwargs


def get_logger(name: str, **extra: Any) -> logging.Logger:
    """Get a logger with optional context.

    Args:
        name: Logger name (usually __name__)
        **extra: Additional context fields
    """
    logger = logging.getLogger(name)
    if extra:
        return LoggerAdapter(logger, extra)
    return logger


# Default logger
logger = get_logger(__name__)
