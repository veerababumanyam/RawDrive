"""Enhanced error logger utility.

Provides structured logging for errors with full context.
Requirements: 7.1, 7.3, 7.4
"""

import logging
from typing import Any, Dict, Optional


class ErrorLogger:
    """Enhanced error logger with structured context."""

    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or logging.getLogger(__name__)

    def log_error(
        self,
        error: Exception,
        request_id: Optional[str] = None,
        user_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        extra_context: Optional[Dict[str, Any]] = None,
        log_level: str = "error"
    ) -> None:
        """Log an error with full context.

        Args:
            error: The exception to log
            request_id: Request ID for tracing
            user_id: User ID for context
            workspace_id: Workspace ID for tenant isolation
            extra_context: Additional context to include
            log_level: Logging level ('debug', 'info', 'warning', 'error', 'critical')
        """
        # Build structured log context
        log_context = {
            "exception_type": type(error).__name__,
            "exception_message": str(error),
            "request_id": request_id or "unknown",
        }

        if user_id:
            log_context["user_id"] = user_id
        if workspace_id:
            log_context["workspace_id"] = workspace_id

        if extra_context:
            log_context.update(extra_context)

        # Get the appropriate log method
        log_method = getattr(self.logger, log_level.lower(), self.logger.error)

        # Log with full context
        log_method(
            f"Error occurred: {type(error).__name__}",
            extra=log_context,
            exc_info=True  # Include stack trace
        )

    def log_app_error(
        self,
        app_error: Any,  # AppError instance
        request_id: Optional[str] = None,
        user_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> None:
        """Log an AppError with appropriate level based on error type.

        Args:
            app_error: AppError instance
            request_id: Request ID
            user_id: User ID
            workspace_id: Workspace ID
        """
        # Determine log level based on error type
        log_level = getattr(app_error, 'log_level', 'error')

        # For certain error types, use different levels
        if app_error.status_code >= 500:
            log_level = 'error'
        elif app_error.status_code >= 400:
            log_level = 'warning'
        else:
            log_level = 'info'

        self.log_error(
            app_error,
            request_id=request_id,
            user_id=user_id,
            workspace_id=workspace_id,
            extra_context={
                "error_code": getattr(app_error, 'code', 'UNKNOWN'),
                "status_code": getattr(app_error, 'status_code', 500),
            },
            log_level=log_level
        )