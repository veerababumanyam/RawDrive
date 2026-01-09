"""Request Timeout Middleware.

Enforces request timeouts with method-based defaults:
- Read operations (GET, HEAD, OPTIONS): 30 seconds
- Write operations (POST, PUT, PATCH, DELETE): 60 seconds

Supports per-route overrides for expensive operations like:
- Face search (45s)
- AI tagging (90s)
- Smart Curate (120s)

Headers:
- X-Timeout-Limit: Maximum timeout for the request (seconds)
- X-Timeout-Remaining: Remaining time after request completes (seconds)

Usage:
    from app.middleware.timeout import TimeoutMiddleware, TimeoutConfig

    app.add_middleware(
        TimeoutMiddleware,
        config=TimeoutConfig(
            read_timeout=30.0,
            write_timeout=60.0,
        ),
    )
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# HTTP methods considered as "read" operations
READ_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Paths to skip timeout enforcement (health checks, metrics)
SKIP_TIMEOUT_PATHS = frozenset({"/health", "/ready", "/metrics"})

# Default route overrides for expensive operations
DEFAULT_ROUTE_OVERRIDES: dict[str, float] = {
    "/api/v1/faces/search": 45.0,
    "/api/v1/smart-tagging": 90.0,
    "/api/v1/curation": 120.0,
    "/api/v1/stories": 90.0,
    "/api/v1/ai/": 60.0,
    "/api/v1/workspaces/": 60.0,  # Workspace operations may include AI
}


@dataclass
class TimeoutConfig:
    """Request timeout configuration.

    Attributes:
        read_timeout: Timeout for read operations (GET, HEAD, OPTIONS) in seconds
        write_timeout: Timeout for write operations (POST, PUT, PATCH, DELETE) in seconds
        expensive_timeout: Maximum timeout for expensive operations in seconds
        route_overrides: Mapping of path prefixes to timeout overrides
        max_client_override: Maximum timeout clients can request via header
    """

    read_timeout: float = 30.0
    write_timeout: float = 60.0
    expensive_timeout: float = 120.0
    route_overrides: dict[str, float] = field(default_factory=lambda: DEFAULT_ROUTE_OVERRIDES.copy())
    max_client_override: float = 120.0  # Cap for X-Timeout-Override header


class TimeoutMiddleware(BaseHTTPMiddleware):
    """Middleware that enforces request timeouts.

    Wraps request handling in asyncio.wait_for() with configurable timeouts.
    Returns HTTP 504 Gateway Timeout when requests exceed their timeout.

    The timeout is determined by:
    1. Route-specific override (if path matches a configured prefix)
    2. Request state override (set by decorator)
    3. Client header override (X-Timeout-Override, capped)
    4. Method-based default (read_timeout or write_timeout)
    """

    def __init__(
        self,
        app: Callable,
        config: Optional[TimeoutConfig] = None,
    ):
        super().__init__(app)
        self.config = config or TimeoutConfig()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with timeout enforcement."""
        method = request.method
        path = request.url.path

        # Skip timeout for health checks and metrics
        if path in SKIP_TIMEOUT_PATHS:
            return await call_next(request)

        # Determine timeout
        timeout = self._get_timeout(method, path, request)
        timeout_type = self._get_timeout_type(method, path)

        # Store timeout in request state for downstream use
        request.state.timeout_seconds = timeout
        start_time = time.perf_counter()

        try:
            response = await asyncio.wait_for(
                call_next(request),
                timeout=timeout,
            )

            # Add timeout headers to response
            elapsed = time.perf_counter() - start_time
            response.headers["X-Timeout-Limit"] = str(int(timeout))
            response.headers["X-Timeout-Remaining"] = str(max(0, int(timeout - elapsed)))

            return response

        except asyncio.TimeoutError:
            elapsed = time.perf_counter() - start_time

            logger.warning(
                "Request timeout",
                extra={
                    "method": method,
                    "path": path,
                    "timeout_seconds": timeout,
                    "elapsed_seconds": round(elapsed, 2),
                    "timeout_type": timeout_type,
                },
            )

            # Record metrics
            self._record_timeout_metrics(method, path, timeout_type, elapsed)

            return JSONResponse(
                status_code=504,
                content={
                    "error": "request_timeout",
                    "message": "Request timed out. Please try again with a smaller request or contact support if this persists.",
                    "timeout_seconds": timeout,
                },
                headers={
                    "X-Timeout-Limit": str(int(timeout)),
                    "X-Timeout-Remaining": "0",
                },
            )

    def _get_timeout(
        self,
        method: str,
        path: str,
        request: Request,
    ) -> float:
        """Determine timeout for request.

        Priority:
        1. Request state override (from decorator)
        2. Client header override (capped)
        3. Route-specific override
        4. Method-based default
        """
        # Check for override in request state (from decorator)
        if hasattr(request.state, "timeout_override"):
            return float(request.state.timeout_override)

        # Check for client-specified override (capped)
        client_timeout = request.headers.get("X-Timeout-Override")
        if client_timeout:
            try:
                requested = float(client_timeout)
                return min(requested, self.config.max_client_override)
            except ValueError:
                pass  # Invalid header, ignore

        # Check route-specific overrides
        for prefix, timeout in self.config.route_overrides.items():
            if path.startswith(prefix):
                return timeout

        # Default based on HTTP method
        if method in READ_METHODS:
            return self.config.read_timeout
        return self.config.write_timeout

    def _get_timeout_type(self, method: str, path: str) -> str:
        """Determine timeout type for metrics."""
        for prefix in self.config.route_overrides:
            if path.startswith(prefix):
                return "expensive"
        return "read" if method in READ_METHODS else "write"

    def _record_timeout_metrics(
        self,
        method: str,
        path: str,
        timeout_type: str,
        elapsed: float,
    ) -> None:
        """Record timeout metrics to Prometheus."""
        try:
            from app.metrics.registry import (
                normalize_path,
                request_timeout_total,
                request_timeout_duration_seconds,
            )

            normalized_path = normalize_path(path)

            request_timeout_total.labels(
                method=method,
                path=normalized_path,
                timeout_type=timeout_type,
            ).inc()

            request_timeout_duration_seconds.labels(
                method=method,
                path=normalized_path,
            ).observe(elapsed)
        except ImportError:
            pass  # Metrics not available


def with_timeout(timeout_seconds: float) -> Callable:
    """Decorator to set custom timeout for a specific endpoint.

    Usage:
        @router.get("/slow-endpoint")
        @with_timeout(120.0)
        async def slow_endpoint(request: Request):
            ...

    Args:
        timeout_seconds: Timeout in seconds for this endpoint

    Note:
        The request parameter must be included in the endpoint signature
        for the timeout override to work.
    """

    def decorator(func: Callable) -> Callable:
        async def wrapper(*args, **kwargs):
            # Find the request object in args or kwargs
            request = kwargs.get("request")
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is not None:
                request.state.timeout_override = timeout_seconds

            return await func(*args, **kwargs)

        # Preserve function metadata
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper

    return decorator
