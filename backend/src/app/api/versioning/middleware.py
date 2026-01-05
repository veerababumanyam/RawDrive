"""API Versioning Middleware.

Provides middleware for:
- Adding API version headers to all responses
- Version negotiation via Accept header or query parameter
- Deprecation notices for deprecated endpoints
- Request/response logging with version context
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.api.versioning.config import (
    CURRENT_VERSION,
    MIN_SUPPORTED_VERSION,
    SUPPORTED_VERSIONS,
    APIVersion,
    get_version_info,
    is_version_supported,
)

logger = logging.getLogger(__name__)

# Regex to extract version from URL path (e.g., /api/v1/... -> v1)
VERSION_PATH_PATTERN = re.compile(r"/api/v(\d+)/")

# Header for client to request specific version
API_VERSION_HEADER = "X-API-Version"

# Response headers
RESPONSE_HEADERS = {
    "X-API-Version": str(CURRENT_VERSION),
    "X-API-Min-Version": str(MIN_SUPPORTED_VERSION),
}


class VersioningMiddleware(BaseHTTPMiddleware):
    """Middleware that adds API versioning headers and handles version negotiation.

    Features:
    - Extracts requested API version from URL path (/api/v1/)
    - Supports version negotiation via X-API-Version header
    - Adds version information to all responses
    - Logs version usage for analytics
    - Adds deprecation warnings for deprecated versions

    Response Headers Added:
    - X-API-Version: Current API version
    - X-API-Min-Version: Minimum supported version
    - X-API-Requested-Version: Version requested by client (if different)
    - Deprecation: Set if using deprecated version
    - Sunset: Date when deprecated version will be removed
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Extract version from URL path
        path_version = self._extract_path_version(request.url.path)

        # Check for version override in header
        header_version = request.headers.get(API_VERSION_HEADER)

        # Determine effective version
        requested_version = header_version or (str(path_version) if path_version else None)

        # Store version context in request state for downstream use
        request.state.api_version = path_version or CURRENT_VERSION
        request.state.api_version_str = str(request.state.api_version)

        # Process request
        response: Response = await call_next(request)

        # Add standard version headers
        response.headers["X-API-Version"] = str(CURRENT_VERSION)
        response.headers["X-API-Min-Version"] = str(MIN_SUPPORTED_VERSION)

        # Add requested version if different from current
        if requested_version and requested_version != str(CURRENT_VERSION):
            response.headers["X-API-Requested-Version"] = requested_version

        # Check if using deprecated version and add deprecation headers
        if path_version:
            version_info = get_version_info(path_version)
            if version_info and version_info.is_deprecated():
                response.headers["Deprecation"] = "true"
                if version_info.sunset_date:
                    from datetime import datetime, timezone
                    sunset_dt = datetime.combine(
                        version_info.sunset_date,
                        datetime.min.time(),
                        tzinfo=timezone.utc
                    )
                    response.headers["Sunset"] = sunset_dt.strftime("%a, %d %b %Y %H:%M:%S GMT")

                # Add warning about deprecation
                response.headers["Warning"] = (
                    f'299 - "API version {path_version} is deprecated. '
                    f'Please migrate to version {CURRENT_VERSION}"'
                )

                logger.warning(
                    "Deprecated API version used",
                    extra={
                        "path": request.url.path,
                        "deprecated_version": str(path_version),
                        "current_version": str(CURRENT_VERSION),
                    },
                )

        return response

    def _extract_path_version(self, path: str) -> Optional[APIVersion]:
        """Extract API version from URL path.

        Args:
            path: Request URL path (e.g., /api/v1/users)

        Returns:
            APIVersion if found in path, None otherwise
        """
        match = VERSION_PATH_PATTERN.search(path)
        if match:
            major = int(match.group(1))
            # Find the exact version info for this major version
            for version in SUPPORTED_VERSIONS.keys():
                if version.major == major:
                    return version
            # If no exact match, create a basic version
            return APIVersion(major=major, minor=0, patch=0)
        return None


def get_requested_version(request: Request) -> APIVersion:
    """Get the API version from request state.

    Args:
        request: The current request

    Returns:
        The API version being used for this request
    """
    return getattr(request.state, "api_version", CURRENT_VERSION)
