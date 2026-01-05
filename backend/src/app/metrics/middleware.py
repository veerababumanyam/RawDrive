"""Prometheus middleware for HTTP request tracking.

This middleware automatically tracks:
- Request counts (by method, path, status code)
- Request duration (histogram)
- Requests in progress (gauge)
- Request/response sizes
- Error counts

Requirements: 15.1 (Request metrics), 15.2 (Error tracking)
"""

from __future__ import annotations

import logging
import time
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.metrics.registry import (
    http_requests_total,
    http_request_duration_seconds,
    http_requests_in_progress,
    http_request_size_bytes,
    http_response_size_bytes,
    http_errors_total,
    normalize_path,
)

logger = logging.getLogger(__name__)


# Paths to exclude from detailed metrics (high-cardinality or health checks)
EXCLUDED_PATHS = frozenset([
    "/health",
    "/healthz",
    "/ready",
    "/readiness",
    "/live",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/favicon.ico",
])


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware that collects Prometheus metrics for HTTP requests.

    Tracks request counts, latency, in-progress requests, and errors.
    Automatically normalizes paths to prevent label cardinality explosion.
    """

    def __init__(self, app: Callable, exclude_paths: frozenset[str] | None = None):
        """Initialize the middleware.

        Args:
            app: The ASGI application.
            exclude_paths: Paths to exclude from detailed metrics tracking.
        """
        super().__init__(app)
        self.exclude_paths = exclude_paths or EXCLUDED_PATHS

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process a request and collect metrics.

        Args:
            request: The incoming HTTP request.
            call_next: The next middleware/handler in the chain.

        Returns:
            The HTTP response.
        """
        method = request.method
        path = request.url.path

        # Skip OPTIONS requests (CORS preflight)
        if method == "OPTIONS":
            return await call_next(request)

        # For excluded paths, skip detailed metrics but still process
        if path in self.exclude_paths:
            return await call_next(request)

        # Normalize path to prevent label explosion
        normalized_path = normalize_path(path)

        # Track request size
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                http_request_size_bytes.labels(
                    method=method,
                    path=normalized_path,
                ).observe(int(content_length))
            except (ValueError, TypeError):
                pass

        # Track in-progress requests
        http_requests_in_progress.labels(
            method=method,
            path=normalized_path,
        ).inc()

        # Time the request
        start_time = time.perf_counter()
        status_code = 500  # Default in case of exception

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response

        except Exception as exc:
            # Track unhandled exceptions as 500 errors
            status_code = 500
            http_errors_total.labels(
                method=method,
                path=normalized_path,
                status_code="500",
                error_type=type(exc).__name__,
            ).inc()
            raise

        finally:
            # Calculate duration
            duration = time.perf_counter() - start_time

            # Decrement in-progress gauge
            http_requests_in_progress.labels(
                method=method,
                path=normalized_path,
            ).dec()

            # Record request metrics
            status_str = str(status_code)

            http_requests_total.labels(
                method=method,
                path=normalized_path,
                status_code=status_str,
            ).inc()

            http_request_duration_seconds.labels(
                method=method,
                path=normalized_path,
                status_code=status_str,
            ).observe(duration)

            # Track errors (4xx and 5xx)
            if status_code >= 400:
                error_type = "client_error" if status_code < 500 else "server_error"
                http_errors_total.labels(
                    method=method,
                    path=normalized_path,
                    status_code=status_str,
                    error_type=error_type,
                ).inc()

            # Track response size if available
            if 'response' in dir():
                response_length = response.headers.get("content-length")
                if response_length:
                    try:
                        http_response_size_bytes.labels(
                            method=method,
                            path=normalized_path,
                            status_code=status_str,
                        ).observe(int(response_length))
                    except (ValueError, TypeError):
                        pass
