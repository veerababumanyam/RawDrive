"""Middleware modules for request processing."""

from src.middleware.correlation import CorrelationMiddleware
from src.middleware.rate_limiter import RateLimiterMiddleware
from src.middleware.auth import get_current_user, get_workspace_id
# Note: workspace_auth is imported directly where needed to avoid circular imports
# from src.middleware.workspace_auth import verify_workspace_access, get_workspace_from_jwt

__all__ = [
    "CorrelationMiddleware",
    "RateLimiterMiddleware",
    "get_current_user",
    "get_workspace_id",
    # Direct imports for workspace auth:
    # from src.middleware.workspace_auth import verify_workspace_access, get_workspace_from_jwt
]
