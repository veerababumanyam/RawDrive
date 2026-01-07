"""
Middleware module for the Notifications & Communication Microservice.

Provides middleware and FastAPI dependencies for:
- JWT authentication and authorization
- Rate limiting with Redis sliding window
- Correlation ID propagation for distributed tracing

Feature: Notifications & Communication Microservice
"""

from src.middleware.auth import (
    # Models
    JWTPayload,
    # Core functions
    decode_jwt,
    decode_jwt_optional,
    # FastAPI dependencies
    get_current_user,
    get_optional_user,
    get_workspace_id,
    verify_workspace_access,
    create_workspace_verifier,
    # Access control
    require_role,
    require_permission,
    # Utilities
    create_jwt,
    extract_user_id,
    extract_workspace_id,
)

from src.middleware.rate_limiter import (
    # Configuration
    RATE_LIMITS,
    parse_rate_limit,
    match_endpoint,
    get_client_identifier,
    # Exceptions
    RateLimitExceeded,
    # Middleware
    RateLimiterMiddleware,
    # Dependencies
    check_rate_limit,
    create_rate_limit_dependency,
    # Decorator
    rate_limit,
    # Utilities
    get_rate_limit_status,
    reset_rate_limit,
)

from src.middleware.correlation import (
    # Constants
    CORRELATION_ID_HEADER,
    REQUEST_ID_HEADER,
    TRACE_ID_HEADER,
    # Middleware
    CorrelationMiddleware,
    # Context functions
    get_correlation_id,
    set_correlation_id,
    get_request_id,
    set_request_id,
    generate_id,
    # FastAPI dependencies
    correlation_id_dependency,
    request_id_dependency,
    # Helper functions
    propagate_correlation_headers,
    with_correlation,
    # Context manager
    CorrelationContext,
)

__all__ = [
    # ==========================================================================
    # Authentication (auth.py)
    # ==========================================================================
    # Models
    "JWTPayload",
    # Core functions
    "decode_jwt",
    "decode_jwt_optional",
    # FastAPI dependencies
    "get_current_user",
    "get_optional_user",
    "get_workspace_id",
    "verify_workspace_access",
    "create_workspace_verifier",
    # Access control
    "require_role",
    "require_permission",
    # Utilities
    "create_jwt",
    "extract_user_id",
    "extract_workspace_id",
    # ==========================================================================
    # Rate Limiting (rate_limiter.py)
    # ==========================================================================
    # Configuration
    "RATE_LIMITS",
    "parse_rate_limit",
    "match_endpoint",
    "get_client_identifier",
    # Exceptions
    "RateLimitExceeded",
    # Middleware
    "RateLimiterMiddleware",
    # Dependencies
    "check_rate_limit",
    "create_rate_limit_dependency",
    # Decorator
    "rate_limit",
    # Utilities
    "get_rate_limit_status",
    "reset_rate_limit",
    # ==========================================================================
    # Correlation ID (correlation.py)
    # ==========================================================================
    # Constants
    "CORRELATION_ID_HEADER",
    "REQUEST_ID_HEADER",
    "TRACE_ID_HEADER",
    # Middleware
    "CorrelationMiddleware",
    # Context functions
    "get_correlation_id",
    "set_correlation_id",
    "get_request_id",
    "set_request_id",
    "generate_id",
    # FastAPI dependencies
    "correlation_id_dependency",
    "request_id_dependency",
    # Helper functions
    "propagate_correlation_headers",
    "with_correlation",
    # Context manager
    "CorrelationContext",
]
