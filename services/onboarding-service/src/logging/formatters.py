"""Structured logging configuration with PII filtering."""

import logging
import sys
from typing import Any, Dict

import structlog


def configure_logging(
    log_level: str = "INFO",
    json_format: bool = False,
    service_name: str = "onboarding-service",
) -> None:
    """Configure structured logging for the service."""
    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )

    # Configure structlog processors
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        add_service_name(service_name),
        filter_pii,
    ]

    if json_format:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def add_service_name(service_name: str):
    """Add service name to all log entries."""

    def processor(logger, method_name, event_dict):
        event_dict["service"] = service_name
        return event_dict

    return processor


def filter_pii(logger, method_name, event_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Filter PII (Personally Identifiable Information) from logs."""
    sensitive_keys = {
        "password",
        "password_hash",
        "token",
        "secret",
        "api_key",
        "access_token",
        "refresh_token",
        "jwt",
        "session_token",
        "credit_card",
        "card_number",
        "cvv",
        "ssn",
    }

    def redact_dict(d: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively redact sensitive data."""
        result = {}
        for key, value in d.items():
            if key.lower() in sensitive_keys:
                result[key] = "***REDACTED***"
            elif isinstance(value, dict):
                result[key] = redact_dict(value)
            elif isinstance(value, list):
                result[key] = [
                    redact_dict(item) if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                result[key] = value
        return result

    # Redact the event dict
    return redact_dict(event_dict)


def get_logger(name: str = None):
    """Get a structured logger instance."""
    return structlog.get_logger(name)
