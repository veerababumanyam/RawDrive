"""API Versioning Infrastructure.

Provides semantic versioning for API endpoints with deprecation paths
and backward compatibility support.

Usage:
    from app.api.versioning import (
        APIVersion,
        deprecated,
        get_current_version,
        SUPPORTED_VERSIONS,
    )

    # Mark an endpoint as deprecated
    @router.get("/old-endpoint")
    @deprecated(since="1.1.0", removed_in="2.0.0", replacement="/api/v1/new-endpoint")
    async def old_endpoint():
        ...

    # Check version compatibility
    version = get_current_version()
"""

from app.api.versioning.config import (
    APIVersion,
    APIVersionInfo,
    CURRENT_VERSION,
    SUPPORTED_VERSIONS,
    MIN_SUPPORTED_VERSION,
    get_version_info,
    is_version_supported,
    get_deprecation_date,
)
from app.api.versioning.decorators import deprecated, version_gate, min_version
from app.api.versioning.middleware import VersioningMiddleware
from app.api.versioning.router import VersionedAPIRouter, create_versioned_router

__all__ = [
    # Version config
    "APIVersion",
    "APIVersionInfo",
    "CURRENT_VERSION",
    "SUPPORTED_VERSIONS",
    "MIN_SUPPORTED_VERSION",
    "get_version_info",
    "is_version_supported",
    "get_deprecation_date",
    # Decorators
    "deprecated",
    "version_gate",
    "min_version",
    # Middleware
    "VersioningMiddleware",
    # Versioned Router
    "VersionedAPIRouter",
    "create_versioned_router",
]
