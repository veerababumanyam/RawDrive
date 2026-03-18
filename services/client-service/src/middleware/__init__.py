"""Middleware modules for request processing.

Security middleware includes:
- RateLimiterMiddleware: Secure rate limiting (no header spoofing, fail-closed)
- TimeoutMiddleware: Request timeout enforcement (prevents resource exhaustion)
- RBAC: Role-based access control (fixed permission matrix)

Auth middleware includes:
- get_current_user: Extract authenticated user from JWT
- get_workspace_id: Extract workspace from JWT (secure multi-tenancy)
"""

from src.middleware.correlation import CorrelationMiddleware
# Note: rate_limiter imported lazily where needed to avoid circular imports with log_config
from src.middleware.timeout import TimeoutMiddleware, TimeoutConfig, with_timeout
from src.middleware.auth import get_current_user, get_workspace_id, GENERIC_AUTH_ERROR
# Note: workspace_auth is imported directly where needed to avoid circular imports
# Note: rbac is imported directly where needed: from src.middleware.rbac import require_permission


def __getattr__(name):
    """Lazy import for RateLimiterMiddleware to break circular dependency."""
    if name == "RateLimiterMiddleware":
        from src.middleware.rate_limiter import RateLimiterMiddleware
        return RateLimiterMiddleware
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    # Middleware classes
    "CorrelationMiddleware",
    "RateLimiterMiddleware",
    "TimeoutMiddleware",
    "TimeoutConfig",
    "with_timeout",
    # Auth dependencies
    "get_current_user",
    "get_workspace_id",
    "GENERIC_AUTH_ERROR",
    # RBAC: import from src.middleware.rbac import require_permission
]
