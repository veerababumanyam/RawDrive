"""Structured JSON logging for the Upload Service.

Provides production-ready logging with:
- JSON output for log aggregation (ELK, Loki)
- Correlation IDs for distributed tracing
- Request context enrichment
- Sensitive data filtering

Author: Claude Code Migration
"""

from __future__ import annotations

import json
import logging
import sys
import traceback
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Optional

# Context variables for request-scoped data
correlation_id_ctx: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
workspace_id_ctx: ContextVar[Optional[str]] = ContextVar("workspace_id", default=None)
user_id_ctx: ContextVar[Optional[str]] = ContextVar("user_id", default=None)


# =============================================================================
# Sensitive Data Filtering
# =============================================================================

# Keys that should be redacted in logs
SENSITIVE_KEYS = {
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
}


def redact_sensitive(data: Any, depth: int = 0) -> Any:
    """Redact sensitive values from log data.

    Recursively processes dictionaries and lists to find and
    redact sensitive keys. Handles nested structures up to
    depth 10 to prevent infinite recursion.

    Args:
        data: Data to redact
        depth: Current recursion depth

    Returns:
        Data with sensitive values redacted
    """
    if depth > 10:
        return "[MAX_DEPTH_EXCEEDED]"

    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            key_lower = key.lower()
            if any(s in key_lower for s in SENSITIVE_KEYS):
                result[key] = "[REDACTED]"
            else:
                result[key] = redact_sensitive(value, depth + 1)
        return result

    if isinstance(data, list):
        return [redact_sensitive(item, depth + 1) for item in data]

    return data


# =============================================================================
# JSON Log Formatter
# =============================================================================


class JSONLogFormatter(logging.Formatter):
    """JSON log formatter for structured logging.

    Outputs logs as single-line JSON objects with:
    - ISO 8601 timestamps
    - Log level and logger name
    - Message and extra fields
    - Exception info if present
    - Request context (correlation_id, workspace_id, user_id)
    """

    def __init__(
        self,
        service_name: str = "upload-service",
        service_version: str = "1.0.0",
    ) -> None:
        super().__init__()
        self.service_name = service_name
        self.service_version = service_version

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON.

        Args:
            record: Log record to format

        Returns:
            JSON string representation of log record
        """
        # Build base log object
        log_obj: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": self.service_name,
            "version": self.service_version,
        }

        # Add source location for errors
        if record.levelno >= logging.WARNING:
            log_obj["location"] = {
                "file": record.filename,
                "line": record.lineno,
                "function": record.funcName,
            }

        # Add request context from context vars
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

        # Add extra fields from record
        if hasattr(record, "__dict__"):
            extra_keys = set(record.__dict__.keys()) - {
                "name", "msg", "args", "created", "filename", "funcName",
                "levelname", "levelno", "lineno", "module", "msecs",
                "pathname", "process", "processName", "relativeCreated",
                "stack_info", "exc_info", "exc_text", "thread", "threadName",
                "message", "taskName",
            }
            if extra_keys:
                extra = {k: record.__dict__[k] for k in extra_keys}
                # Redact sensitive data
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


# =============================================================================
# Log Configuration
# =============================================================================


def configure_logging(
    level: str = "INFO",
    service_name: str = "upload-service",
    service_version: str = "1.0.0",
    json_output: bool = True,
) -> None:
    """Configure logging for the upload service.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        service_name: Service name for log entries
        service_version: Service version for log entries
        json_output: Whether to output JSON format (False for dev readable)
    """
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(level.upper())

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level.upper())

    # Set formatter based on output mode
    if json_output:
        formatter = JSONLogFormatter(service_name, service_version)
    else:
        # Human-readable format for development
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    # Suppress noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("aiobotocore").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name.

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


def clear_context() -> None:
    """Clear all context variables."""
    correlation_id_ctx.set(None)
    request_id_ctx.set(None)
    workspace_id_ctx.set(None)
    user_id_ctx.set(None)


# =============================================================================
# Request Logging Helper
# =============================================================================


class RequestLogContext:
    """Context manager for request-scoped logging.

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
    ) -> None:
        self.correlation_id = correlation_id
        self.request_id = request_id
        self.workspace_id = workspace_id
        self.user_id = user_id
        self._tokens: dict[str, Any] = {}

    def __enter__(self) -> "RequestLogContext":
        if self.correlation_id:
            self._tokens["correlation_id"] = correlation_id_ctx.set(self.correlation_id)
        if self.request_id:
            self._tokens["request_id"] = request_id_ctx.set(self.request_id)
        if self.workspace_id:
            self._tokens["workspace_id"] = workspace_id_ctx.set(self.workspace_id)
        if self.user_id:
            self._tokens["user_id"] = user_id_ctx.set(self.user_id)
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

    async def __aenter__(self) -> "RequestLogContext":
        return self.__enter__()

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        self.__exit__(exc_type, exc_val, exc_tb)


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Formatter
    "JSONLogFormatter",
    # Configuration
    "configure_logging",
    "get_logger",
    # Context setters
    "set_correlation_id",
    "set_request_id",
    "set_workspace_id",
    "set_user_id",
    "clear_context",
    # Context vars
    "correlation_id_ctx",
    "request_id_ctx",
    "workspace_id_ctx",
    "user_id_ctx",
    # Context manager
    "RequestLogContext",
    # Helpers
    "redact_sensitive",
]
