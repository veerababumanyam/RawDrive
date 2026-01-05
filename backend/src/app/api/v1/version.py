"""API Version Information Endpoints.

Provides endpoints for clients to discover API version information,
supported versions, and deprecation schedules.

Endpoints:
- GET /api/v1/version - Get current version info
- GET /api/v1/versions - List all supported versions
"""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.versioning.config import (
    CURRENT_VERSION,
    MIN_SUPPORTED_VERSION,
    SUPPORTED_VERSIONS,
    get_all_supported_versions,
)
from app.api.versioning.schemas import (
    AllVersionsResponse,
    VersionInfoResponse,
)

router = APIRouter(prefix="/api/v1/version", tags=["version"])


@router.get(
    "",
    response_model=VersionInfoResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current API version",
    description="Returns information about the current API version including release date and lifecycle status.",
)
async def get_current_version() -> VersionInfoResponse:
    """Get information about the current API version."""
    version_info = SUPPORTED_VERSIONS.get(CURRENT_VERSION)

    if not version_info:
        # Fallback if version info not found
        return VersionInfoResponse(
            version=str(CURRENT_VERSION),
            status="active",
            release_date=SUPPORTED_VERSIONS[CURRENT_VERSION].release_date if CURRENT_VERSION in SUPPORTED_VERSIONS else None,
        )

    return VersionInfoResponse(
        version=str(version_info.version),
        status=version_info.status.value,
        release_date=version_info.release_date,
        deprecation_date=version_info.deprecation_date,
        sunset_date=version_info.sunset_date,
        changelog_url=version_info.changelog_url,
        migration_guide_url=version_info.migration_guide_url,
    )


@router.get(
    "/all",
    response_model=AllVersionsResponse,
    status_code=status.HTTP_200_OK,
    summary="List all API versions",
    description="Returns a list of all supported API versions with their lifecycle status.",
)
async def list_all_versions() -> AllVersionsResponse:
    """List all supported API versions."""
    versions = []

    for version in get_all_supported_versions():
        version_info = SUPPORTED_VERSIONS.get(version)
        if version_info:
            versions.append(
                VersionInfoResponse(
                    version=str(version_info.version),
                    status=version_info.status.value,
                    release_date=version_info.release_date,
                    deprecation_date=version_info.deprecation_date,
                    sunset_date=version_info.sunset_date,
                    changelog_url=version_info.changelog_url,
                    migration_guide_url=version_info.migration_guide_url,
                )
            )

    return AllVersionsResponse(
        current_version=str(CURRENT_VERSION),
        min_supported_version=str(MIN_SUPPORTED_VERSION),
        versions=versions,
    )


@router.get(
    "/compatibility",
    status_code=status.HTTP_200_OK,
    summary="Check version compatibility",
    description="Check if a specific version is supported and get compatibility information.",
)
async def check_compatibility(version: str) -> dict:
    """Check version compatibility.

    Args:
        version: Version string to check (e.g., "1.0.0")

    Returns:
        Compatibility information including whether the version is supported
    """
    from app.api.versioning.config import APIVersion, is_version_supported, get_version_info

    try:
        parsed_version = APIVersion.parse(version)
    except ValueError:
        return {
            "supported": False,
            "requested_version": version,
            "error": "Invalid version format",
            "current_version": str(CURRENT_VERSION),
            "min_supported_version": str(MIN_SUPPORTED_VERSION),
        }

    is_supported = is_version_supported(parsed_version)
    version_info = get_version_info(parsed_version)

    response = {
        "supported": is_supported,
        "requested_version": str(parsed_version),
        "current_version": str(CURRENT_VERSION),
        "min_supported_version": str(MIN_SUPPORTED_VERSION),
        "is_latest": parsed_version == CURRENT_VERSION,
        "is_deprecated": version_info.is_deprecated() if version_info else False,
    }

    if version_info:
        response["version_info"] = {
            "status": version_info.status.value,
            "release_date": version_info.release_date.isoformat() if version_info.release_date else None,
            "deprecation_date": version_info.deprecation_date.isoformat() if version_info.deprecation_date else None,
            "sunset_date": version_info.sunset_date.isoformat() if version_info.sunset_date else None,
        }

    if not is_supported:
        response["supported_versions"] = [str(v) for v in get_all_supported_versions()]

    return response
