"""
Logging module for the Growth & Referrals Microservice.

Provides structured logging with PII filtering and correlation IDs.
This is a minimal implementation - see T041 for full logging configuration.
"""

import logging
import sys
from typing import Optional

import structlog
from structlog.typing import EventDict, WrappedLogger


def _filter_pii(
    logger: WrappedLogger,
    method_name: str,
    event_dict: EventDict,
) -> EventDict:
    """Basic PII filter for log entries."""
    sensitive_keys = {
        "password", "token", "secret", "api_key", "authorization",
        "email", "phone", "credit_card", "ssn", "card_number",
    }

    def redact(d):
        if not isinstance(d, dict):
            return d
        return {
            k: "[REDACTED]" if k.lower() in sensitive_keys else redact(v) if isinstance(v, dict) else v
            for k, v in d.items()
        }

    return redact(event_dict)


def _add_service_context(
    logger: WrappedLogger,
    method_name: str,
    event_dict: EventDict,
) -> EventDict:
    """Add service name to log entries."""
    event_dict["service"] = "growth-service"
    return event_dict


def configure_logging(
    log_level: str = "INFO",
    json_format: bool = True,
) -> None:
    """
    Configure structured logging.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)
        json_format: If True, output JSON logs; otherwise human-readable
    """
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper(), logging.INFO),
    )

    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        _add_service_context,
        _filter_pii,
    ]

    if json_format:
        processors.extend([
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ])
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

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
    """Bind a correlation ID to the current context."""
    structlog.contextvars.bind_contextvars(correlation_id=correlation_id)


def clear_context() -> None:
    """Clear all bound context variables."""
    structlog.contextvars.clear_contextvars()


__all__ = ["configure_logging", "get_logger", "bind_correlation_id", "clear_context"]
