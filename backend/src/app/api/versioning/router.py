"""Versioned API Router.

Provides a version-aware router that can be used to create versioned API routes
with automatic deprecation handling and version constraints.

Usage:
    from app.api.versioning.router import VersionedAPIRouter

    router = VersionedAPIRouter(version="1.0.0")

    @router.get("/users")
    async def get_users():
        ...
"""

from __future__ import annotations

from typing import Any, Callable, Optional, Sequence, TypeVar

from fastapi import APIRouter
from fastapi.types import DecoratedCallable

from app.api.versioning.config import APIVersion, CURRENT_VERSION, get_version_info
from app.api.versioning.decorators import deprecated, min_version

F = TypeVar("F", bound=Callable[..., Any])


class VersionedAPIRouter(APIRouter):
    """APIRouter with built-in versioning support.

    Extends FastAPI's APIRouter to provide:
    - Automatic version prefix handling
    - Built-in deprecation marking
    - Version-aware OpenAPI documentation
    - Backward compatibility routing
    """

    def __init__(
        self,
        *,
        version: Optional[str] = None,
        deprecated_in: Optional[str] = None,
        removed_in: Optional[str] = None,
        **kwargs: Any,
    ):
        """Initialize a versioned router.

        Args:
            version: The API version this router represents (e.g., "1.0.0")
            deprecated_in: Version when this router's endpoints were deprecated
            removed_in: Version when this router's endpoints will be removed
            **kwargs: Additional arguments passed to APIRouter
        """
        self._version = APIVersion.parse(version) if version else CURRENT_VERSION
        self._deprecated_in = APIVersion.parse(deprecated_in) if deprecated_in else None
        self._removed_in = APIVersion.parse(removed_in) if removed_in else None

        # Set default prefix based on version if not provided
        if "prefix" not in kwargs:
            kwargs["prefix"] = f"/api/{self._version.url_prefix}"

        super().__init__(**kwargs)

    @property
    def version(self) -> APIVersion:
        """Get the version of this router."""
        return self._version

    def deprecated_route(
        self,
        path: str,
        *,
        since: str,
        removed_in: Optional[str] = None,
        replacement: Optional[str] = None,
        reason: Optional[str] = None,
        methods: Sequence[str] = ("GET",),
        **kwargs: Any,
    ) -> Callable[[DecoratedCallable], DecoratedCallable]:
        """Register a deprecated route.

        Convenience method that combines route registration with deprecation marking.

        Args:
            path: The route path
            since: Version when the endpoint was deprecated
            removed_in: Version when the endpoint will be removed
            replacement: URL of the replacement endpoint
            reason: Reason for deprecation
            methods: HTTP methods for this route
            **kwargs: Additional arguments passed to add_api_route

        Example:
            @router.deprecated_route(
                "/old-users",
                since="1.1.0",
                removed_in="2.0.0",
                replacement="/api/v1/users",
                methods=["GET"]
            )
            async def get_old_users():
                ...
        """
        def decorator(func: DecoratedCallable) -> DecoratedCallable:
            # Apply deprecation decorator
            deprecated_func = deprecated(
                since=since,
                removed_in=removed_in,
                replacement=replacement,
                reason=reason,
            )(func)

            # Register the route
            self.add_api_route(
                path,
                deprecated_func,
                methods=list(methods),
                deprecated=True,  # Mark as deprecated in OpenAPI
                **kwargs,
            )

            return deprecated_func

        return decorator

    def add_api_route(
        self,
        path: str,
        endpoint: Callable[..., Any],
        *,
        min_api_version: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        """Add an API route with optional version constraints.

        Args:
            path: The route path
            endpoint: The endpoint function
            min_api_version: Minimum API version required for this endpoint
            **kwargs: Additional arguments passed to parent add_api_route
        """
        if min_api_version:
            endpoint = min_version(min_api_version)(endpoint)

        # If the router itself is deprecated, mark all routes
        if self._deprecated_in and not kwargs.get("deprecated"):
            kwargs["deprecated"] = True

        super().add_api_route(path, endpoint, **kwargs)


def create_versioned_router(
    version: str,
    prefix: Optional[str] = None,
    tags: Optional[list[str]] = None,
    **kwargs: Any,
) -> VersionedAPIRouter:
    """Factory function to create a versioned router.

    Args:
        version: The API version (e.g., "1.0.0")
        prefix: Optional custom prefix (defaults to /api/vX)
        tags: Optional tags for OpenAPI grouping
        **kwargs: Additional router arguments

    Returns:
        A configured VersionedAPIRouter instance

    Example:
        v1_router = create_versioned_router("1.0.0", tags=["v1"])
        v2_router = create_versioned_router("2.0.0", tags=["v2"])
    """
    if prefix is None:
        parsed_version = APIVersion.parse(version)
        prefix = f"/api/{parsed_version.url_prefix}"

    if tags is None:
        tags = [f"v{APIVersion.parse(version).major}"]

    return VersionedAPIRouter(
        version=version,
        prefix=prefix,
        tags=tags,
        **kwargs,
    )
