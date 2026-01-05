"""API Versioning Configuration.

Defines semantic versioning structure for the RawDrive API.
Implements semantic versioning (SemVer) with major.minor.patch format.

Version Lifecycle:
- Active: Fully supported, receives new features
- Maintenance: Supported, receives bug fixes only
- Deprecated: Deprecated, scheduled for removal
- Removed: No longer available
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from enum import Enum
from functools import total_ordering
from typing import Optional


class VersionStatus(str, Enum):
    """API version lifecycle status."""

    ACTIVE = "active"  # Fully supported
    MAINTENANCE = "maintenance"  # Bug fixes only
    DEPRECATED = "deprecated"  # Scheduled for removal
    REMOVED = "removed"  # No longer available


@total_ordering
@dataclass(frozen=True)
class APIVersion:
    """Semantic version representation.

    Follows SemVer (https://semver.org/):
    - MAJOR: incompatible API changes
    - MINOR: backward-compatible functionality additions
    - PATCH: backward-compatible bug fixes
    """

    major: int
    minor: int
    patch: int = 0

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"

    def __repr__(self) -> str:
        return f"APIVersion({self.major}, {self.minor}, {self.patch})"

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, APIVersion):
            return NotImplemented
        return (self.major, self.minor, self.patch) < (other.major, other.minor, other.patch)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, APIVersion):
            return NotImplemented
        return (self.major, self.minor, self.patch) == (other.major, other.minor, other.patch)

    def __hash__(self) -> int:
        return hash((self.major, self.minor, self.patch))

    @classmethod
    def parse(cls, version_str: str) -> "APIVersion":
        """Parse version string to APIVersion.

        Args:
            version_str: Version string like "1.0.0" or "1.0"

        Returns:
            APIVersion instance

        Raises:
            ValueError: If version string is invalid
        """
        parts = version_str.strip().lstrip("v").split(".")
        if len(parts) < 2 or len(parts) > 3:
            raise ValueError(f"Invalid version format: {version_str}")

        try:
            major = int(parts[0])
            minor = int(parts[1])
            patch = int(parts[2]) if len(parts) == 3 else 0
            return cls(major=major, minor=minor, patch=patch)
        except ValueError as e:
            raise ValueError(f"Invalid version format: {version_str}") from e

    @property
    def url_prefix(self) -> str:
        """Get URL prefix for this version (e.g., 'v1')."""
        return f"v{self.major}"

    def is_compatible_with(self, other: "APIVersion") -> bool:
        """Check if this version is backward-compatible with another.

        Per SemVer, versions within the same major version are compatible.
        """
        return self.major == other.major


@dataclass(frozen=True)
class APIVersionInfo:
    """Comprehensive information about an API version."""

    version: APIVersion
    status: VersionStatus
    release_date: date
    deprecation_date: Optional[date] = None
    sunset_date: Optional[date] = None
    changelog_url: Optional[str] = None
    migration_guide_url: Optional[str] = None

    def is_deprecated(self) -> bool:
        """Check if this version is deprecated."""
        return self.status == VersionStatus.DEPRECATED

    def is_removed(self) -> bool:
        """Check if this version has been removed."""
        return self.status == VersionStatus.REMOVED

    def is_supported(self) -> bool:
        """Check if this version is still supported."""
        return self.status in (VersionStatus.ACTIVE, VersionStatus.MAINTENANCE, VersionStatus.DEPRECATED)

    def days_until_sunset(self) -> Optional[int]:
        """Calculate days until sunset, if sunset date is set."""
        if not self.sunset_date:
            return None
        today = datetime.now(timezone.utc).date()
        delta = self.sunset_date - today
        return max(0, delta.days)


# =============================================================================
# Version Registry
# =============================================================================

# Current API version (the latest stable version)
CURRENT_VERSION = APIVersion(1, 0, 0)

# Minimum supported version (oldest version still supported)
MIN_SUPPORTED_VERSION = APIVersion(1, 0, 0)

# All supported versions with their metadata
SUPPORTED_VERSIONS: dict[APIVersion, APIVersionInfo] = {
    APIVersion(1, 0, 0): APIVersionInfo(
        version=APIVersion(1, 0, 0),
        status=VersionStatus.ACTIVE,
        release_date=date(2024, 1, 1),
        changelog_url="/docs/changelog/v1.0.0",
    ),
}

# Future version placeholders (for planning)
# PLANNED_VERSIONS = {
#     APIVersion(1, 1, 0): APIVersionInfo(
#         version=APIVersion(1, 1, 0),
#         status=VersionStatus.ACTIVE,
#         release_date=date(2024, 6, 1),
#         changelog_url="/docs/changelog/v1.1.0",
#     ),
#     APIVersion(2, 0, 0): APIVersionInfo(
#         version=APIVersion(2, 0, 0),
#         status=VersionStatus.ACTIVE,
#         release_date=date(2025, 1, 1),
#         changelog_url="/docs/changelog/v2.0.0",
#         migration_guide_url="/docs/migration/v1-to-v2",
#     ),
# }


def get_version_info(version: APIVersion | str) -> Optional[APIVersionInfo]:
    """Get version info for a specific version.

    Args:
        version: APIVersion instance or version string

    Returns:
        APIVersionInfo if version exists, None otherwise
    """
    if isinstance(version, str):
        try:
            version = APIVersion.parse(version)
        except ValueError:
            return None
    return SUPPORTED_VERSIONS.get(version)


def is_version_supported(version: APIVersion | str) -> bool:
    """Check if a version is currently supported.

    Args:
        version: APIVersion instance or version string

    Returns:
        True if version is supported, False otherwise
    """
    info = get_version_info(version)
    return info is not None and info.is_supported()


def get_deprecation_date(version: APIVersion | str) -> Optional[date]:
    """Get deprecation date for a version.

    Args:
        version: APIVersion instance or version string

    Returns:
        Deprecation date if set, None otherwise
    """
    info = get_version_info(version)
    return info.deprecation_date if info else None


def get_latest_version() -> APIVersion:
    """Get the latest active API version."""
    active_versions = [
        info.version for info in SUPPORTED_VERSIONS.values()
        if info.status == VersionStatus.ACTIVE
    ]
    return max(active_versions) if active_versions else CURRENT_VERSION


def get_all_supported_versions() -> list[APIVersion]:
    """Get all currently supported versions, sorted oldest to newest."""
    return sorted([
        info.version for info in SUPPORTED_VERSIONS.values()
        if info.is_supported()
    ])
