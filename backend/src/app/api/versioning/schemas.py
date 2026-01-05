"""API Versioning Schemas.

Pydantic models for version-related API responses.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class VersionInfoResponse(BaseModel):
    """Response model for version information endpoint."""

    version: str = Field(..., description="Current API version", examples=["1.0.0"])
    status: str = Field(..., description="Version lifecycle status", examples=["active"])
    release_date: date = Field(..., description="Version release date")
    deprecation_date: Optional[date] = Field(None, description="Date when version was deprecated")
    sunset_date: Optional[date] = Field(None, description="Date when version will be removed")
    changelog_url: Optional[str] = Field(None, description="URL to version changelog")
    migration_guide_url: Optional[str] = Field(None, description="URL to migration guide")


class AllVersionsResponse(BaseModel):
    """Response model for listing all API versions."""

    current_version: str = Field(..., description="Current active API version")
    min_supported_version: str = Field(..., description="Minimum supported version")
    versions: list[VersionInfoResponse] = Field(..., description="All supported versions")


class DeprecationWarning(BaseModel):
    """Model for deprecation warning in responses."""

    deprecated: bool = Field(True, description="Whether this endpoint is deprecated")
    since_version: str = Field(..., description="Version when deprecated")
    removed_in_version: Optional[str] = Field(None, description="Version when will be removed")
    sunset_date: Optional[date] = Field(None, description="Date when endpoint will be removed")
    replacement: Optional[str] = Field(None, description="Replacement endpoint URL")
    message: str = Field(..., description="Human-readable deprecation message")


class VersionNegotiationResponse(BaseModel):
    """Response when version negotiation fails."""

    error: str = Field("UNSUPPORTED_VERSION", description="Error code")
    message: str = Field(..., description="Human-readable error message")
    requested_version: str = Field(..., description="Version that was requested")
    supported_versions: list[str] = Field(..., description="List of supported versions")
    current_version: str = Field(..., description="Current API version")
    min_supported_version: str = Field(..., description="Minimum supported version")
