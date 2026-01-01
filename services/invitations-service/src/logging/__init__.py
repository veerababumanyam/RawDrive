"""
Structured logging configuration for the Invitations Microservice.

Uses structlog for JSON-formatted logs with PII filtering and correlation IDs.
"""

import logging
import sys
from typing import Optional

import structlog
from structlog.typing import EventDict

from src.logging.formatters import filter_pii, add_service_context


def configure_logging(
    log_level: str = "INFO",
    json_format: bool = True,
    service_name: str = "invitations-service",
) -> None:
    """
    Configure structured logging with PII filtering.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)
        json_format: If True, output JSON logs; otherwise human-readable
        service_name: Name of the service for log context
    """
    # Set up standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper(), logging.INFO),
    )

    # Configure structlog processors
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        add_service_context(service_name),
        filter_pii,
    ]

    if json_format:
        # JSON output for production
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    else:
        # Human-readable output for development
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: Optional[str] = None) -> structlog.stdlib.BoundLogger:
    """
    Get a structured logger instance.

    Args:
        name: Optional logger name. If None, uses the calling module's name.

    Returns:
        Configured structlog logger
    """
    return structlog.get_logger(name)


def bind_correlation_id(correlation_id: str) -> None:
    """
    Bind a correlation ID to the current context for all subsequent log calls.

    Args:
        correlation_id: Unique identifier for request tracing
    """
    structlog.contextvars.bind_contextvars(correlation_id=correlation_id)


def clear_context() -> None:
    """Clear all bound context variables."""
    structlog.contextvars.clear_contextvars()
