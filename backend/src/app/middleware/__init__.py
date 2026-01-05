"""Middleware stack for RawDrive backend.

Order matters! Applied in reverse order during request processing.
1. CorrelationMiddleware - adds correlation ID for distributed tracing
2. RequestIdMiddleware - adds request ID for request-level tracing
3. AuditLoggingMiddleware - logs security events
4. RateLimitMiddleware - enforces rate limits
5. PrometheusMiddleware - tracks request metrics
"""

from app.middleware.correlation import CorrelationMiddleware, get_correlation_id
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.audit_logging import AuditLoggingMiddleware
from app.metrics.middleware import PrometheusMiddleware

__all__ = [
    "CorrelationMiddleware",
    "get_correlation_id",
    "RequestIdMiddleware",
    "RateLimitMiddleware",
    "AuditLoggingMiddleware",
    "PrometheusMiddleware",
]
