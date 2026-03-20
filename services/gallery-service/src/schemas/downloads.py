"""
Download request/response schemas for Gallery Service.

Defines models for single/batch downloads, job tracking, and download logs.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# Request Schemas
# =============================================================================


class SingleDownloadRequest(BaseModel):
    """Request to download a single asset."""

    asset_id: UUID = Field(..., description="Asset UUID to download")
    size: str = Field(
        default="web",
        description="Download size: 'web' (1920px), 'print' (4000px), or 'original'",
        pattern="^(web|print|original)$",
    )
    format: str = Field(
        default="jpeg",
        description="Output format: 'jpeg', 'png', or 'webp'",
        pattern="^(jpeg|png|webp)$",
    )


class BatchDownloadRequest(BaseModel):
    """Request to download multiple assets as ZIP."""

    asset_ids: List[UUID] = Field(
        default_factory=list,
        max_length=500,
        description="List of asset UUIDs to download (max 500)",
    )
    size: str = Field(
        default="web",
        description="Download size for all assets",
        pattern="^(web|print|original)$",
    )
    include_favorites: bool = Field(
        default=False,
        description="Include all favorited assets for this visitor",
    )
    include_selections: bool = Field(
        default=False,
        description="Include all selected assets for this visitor",
    )


# =============================================================================
# Response Schemas
# =============================================================================


class DownloadJobResponse(BaseModel):
    """Response for batch download job status."""

    job_id: str = Field(..., description="Unique job identifier")
    status: str = Field(
        ...,
        description="Job status: 'pending', 'processing', 'complete', 'failed'",
    )
    progress: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Completion percentage 0-100",
    )
    download_url: Optional[str] = Field(
        default=None,
        description="Presigned download URL (available when status='complete')",
    )
    expires_in: int = Field(
        default=0,
        description="Seconds until download URL expires",
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message if status='failed'",
    )


class DownloadLogEntry(BaseModel):
    """Single entry in the download tracking log."""

    id: UUID = Field(..., description="Download log entry ID")
    asset_id: UUID = Field(..., description="Downloaded asset ID")
    visitor_token: str = Field(..., description="Visitor who downloaded")
    size: str = Field(..., description="Download size requested")
    file_size_bytes: Optional[int] = Field(
        default=None,
        description="File size in bytes",
    )
    created_at: datetime = Field(..., description="Download timestamp")


class DownloadTrackingResponse(BaseModel):
    """Paginated download tracking response."""

    downloads: List[DownloadLogEntry] = Field(
        default_factory=list,
        description="List of download log entries",
    )
    total_count: int = Field(
        default=0,
        description="Total number of download entries",
    )
    total_bytes: int = Field(
        default=0,
        description="Total bytes downloaded",
    )


class SingleDownloadResponse(BaseModel):
    """Response for single asset download."""

    download_url: str = Field(..., description="Presigned download URL")
    expires_in: int = Field(
        default=14400,
        description="Seconds until URL expires",
    )


class BatchDownloadStartResponse(BaseModel):
    """Response when batch download job is started."""

    job_id: str = Field(..., description="Job ID for tracking progress")
    status: str = Field(default="pending", description="Initial job status")
    estimated_files: int = Field(
        default=0,
        description="Number of files to be included",
    )
