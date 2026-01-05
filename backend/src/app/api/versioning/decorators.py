"""API Versioning Decorators.

Provides decorators for marking endpoints as deprecated, version-gated,
or requiring minimum versions.

Usage:
    @router.get("/old-endpoint")
    @deprecated(since="1.1.0", removed_in="2.0.0", replacement="/api/v1/new-endpoint")
    async def old_endpoint():
        ...

    @router.get("/new-feature")
    @min_version("1.2.0")
    async def new_feature():
        ...
"""

from __future__ import annotations

import functools
import logging
import warnings
from datetime import date, datetime, timezone
from typing import Any, Callable, Optional, TypeVar, Union

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from app.api.versioning.config import APIVersion, get_version_info

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


class DeprecationInfo:
    """Stores deprecation metadata for an endpoint."""

    def __init__(
        self,
        since: str,
        removed_in: Optional[str] = None,
        replacement: Optional[str] = None,
        reason: Optional[str] = None,
        sunset_date: Optional[date] = None,
    ):
        self.since_version = APIVersion.parse(since)
        self.removed_in_version = APIVersion.parse(removed_in) if removed_in else None
        self.replacement = replacement
        self.reason = reason
        self.sunset_date = sunset_date

    def get_deprecation_message(self) -> str:
        """Build human-readable deprecation message."""
        msg_parts = [f"Deprecated since version {self.since_version}"]

        if self.removed_in_version:
            msg_parts.append(f"will be removed in {self.removed_in_version}")

        if self.sunset_date:
            msg_parts.append(f"sunset date: {self.sunset_date.isoformat()}")

        if self.reason:
            msg_parts.append(f"Reason: {self.reason}")

        if self.replacement:
            msg_parts.append(f"Use {self.replacement} instead")

        return ". ".join(msg_parts) + "."

    def to_headers(self) -> dict[str, str]:
        """Generate deprecation HTTP headers per draft-ietf-httpapi-deprecation-header."""
        headers: dict[str, str] = {}

        # Deprecation header (RFC draft)
        # Format: Deprecation: date or Deprecation: true
        if self.sunset_date:
            headers["Deprecation"] = self.sunset_date.isoformat()
        else:
            headers["Deprecation"] = "true"

        # Sunset header (RFC 8594)
        if self.sunset_date:
            # Format: Sun, 01 Jan 2025 00:00:00 GMT
            sunset_dt = datetime.combine(self.sunset_date, datetime.min.time(), tzinfo=timezone.utc)
            headers["Sunset"] = sunset_dt.strftime("%a, %d %b %Y %H:%M:%S GMT")

        # Link header for replacement (RFC 8288)
        if self.replacement:
            headers["Link"] = f'<{self.replacement}>; rel="successor-version"'

        # Custom warning header
        headers["X-API-Deprecation-Info"] = self.get_deprecation_message()

        return headers


def deprecated(
    since: str,
    removed_in: Optional[str] = None,
    replacement: Optional[str] = None,
    reason: Optional[str] = None,
    sunset_date: Optional[Union[str, date]] = None,
) -> Callable[[F], F]:
    """Mark an endpoint as deprecated.

    Adds deprecation headers to responses and logs deprecation warnings.

    Args:
        since: Version when the endpoint was deprecated (e.g., "1.1.0")
        removed_in: Version when the endpoint will be removed (e.g., "2.0.0")
        replacement: URL of the replacement endpoint
        reason: Reason for deprecation
        sunset_date: Date when the endpoint will be removed (ISO format or date)

    Example:
        @router.get("/old")
        @deprecated(
            since="1.1.0",
            removed_in="2.0.0",
            replacement="/api/v1/new",
            reason="Redesigned for better performance"
        )
        async def old_endpoint():
            ...
    """
    if isinstance(sunset_date, str):
        sunset_date = date.fromisoformat(sunset_date)

    deprecation_info = DeprecationInfo(
        since=since,
        removed_in=removed_in,
        replacement=replacement,
        reason=reason,
        sunset_date=sunset_date,
    )

    def decorator(func: F) -> F:
        # Store deprecation info on the function for introspection
        func._deprecation_info = deprecation_info  # type: ignore

        # Update docstring
        original_doc = func.__doc__ or ""
        deprecation_notice = f"\n\n.. deprecated:: {since}\n   {deprecation_info.get_deprecation_message()}"
        func.__doc__ = original_doc + deprecation_notice

        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Log deprecation warning
            logger.warning(
                "Deprecated endpoint called",
                extra={
                    "endpoint": func.__name__,
                    "deprecated_since": str(deprecation_info.since_version),
                    "removed_in": str(deprecation_info.removed_in_version) if deprecation_info.removed_in_version else None,
                    "replacement": deprecation_info.replacement,
                },
            )

            # Execute the original function
            result = await func(*args, **kwargs)

            # Add deprecation headers to response
            if isinstance(result, Response):
                for header_name, header_value in deprecation_info.to_headers().items():
                    result.headers[header_name] = header_value
            elif isinstance(result, dict):
                # If returning a dict, wrap in JSONResponse to add headers
                response = JSONResponse(content=result)
                for header_name, header_value in deprecation_info.to_headers().items():
                    response.headers[header_name] = header_value
                return response

            return result

        return wrapper  # type: ignore

    return decorator


def version_gate(
    introduced_in: str,
    removed_in: Optional[str] = None,
) -> Callable[[F], F]:
    """Gate an endpoint to specific version ranges.

    Useful for endpoints that exist only in certain version ranges.

    Args:
        introduced_in: Version when the endpoint was introduced
        removed_in: Version when the endpoint was/will be removed

    Example:
        @router.get("/temporary-feature")
        @version_gate(introduced_in="1.1.0", removed_in="1.3.0")
        async def temporary_feature():
            ...
    """
    introduced_version = APIVersion.parse(introduced_in)
    removed_version = APIVersion.parse(removed_in) if removed_in else None

    def decorator(func: F) -> F:
        func._version_gate = {  # type: ignore
            "introduced_in": introduced_version,
            "removed_in": removed_version,
        }

        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # The actual version checking would be done by middleware
            # Here we just pass through
            return await func(*args, **kwargs)

        return wrapper  # type: ignore

    return decorator


def min_version(version: str) -> Callable[[F], F]:
    """Require a minimum API version for an endpoint.

    Args:
        version: Minimum version required (e.g., "1.2.0")

    Example:
        @router.get("/new-feature")
        @min_version("1.2.0")
        async def new_feature():
            ...
    """
    min_ver = APIVersion.parse(version)

    def decorator(func: F) -> F:
        func._min_version = min_ver  # type: ignore

        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            return await func(*args, **kwargs)

        return wrapper  # type: ignore

    return decorator


def get_deprecation_info(func: Callable[..., Any]) -> Optional[DeprecationInfo]:
    """Get deprecation info from a decorated function.

    Args:
        func: The decorated function

    Returns:
        DeprecationInfo if the function is deprecated, None otherwise
    """
    return getattr(func, "_deprecation_info", None)


def is_deprecated(func: Callable[..., Any]) -> bool:
    """Check if a function is marked as deprecated.

    Args:
        func: The function to check

    Returns:
        True if the function is deprecated, False otherwise
    """
    return hasattr(func, "_deprecation_info")
