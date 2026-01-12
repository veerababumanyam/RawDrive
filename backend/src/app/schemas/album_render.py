"""
Album Render Pydantic Schemas
Feature: 026-album-proofing

Schemas for PDF generation and album renders.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field


class RenderType(str, Enum):
    """Types of album renders."""
    PREVIEW_PDF = "preview_pdf"      # Low-res watermarked for client review
    PRINT_PDF = "print_pdf"          # High-res print-ready
    SPREAD_IMAGES = "spread_images"  # Individual spread images


class RenderStatus(str, Enum):
    """Render job status."""
    QUEUED = "queued"
    RUNNING = "running"
    READY = "ready"
    FAILED = "failed"


class RenderOptions(BaseModel):
    """Options for render generation."""
    watermark: bool = True
    resolution_dpi: int = Field(default=150, ge=72, le=300)
    include_comments: bool = False  # Include comment markers on spreads


class AlbumRenderCreate(BaseModel):
    """Request schema for creating a render job."""
    render_type: RenderType
    options: Optional[RenderOptions] = Field(default_factory=RenderOptions)


class AlbumRenderResponse(BaseModel):
    """Response schema for album render."""
    render_id: UUID
    album_id: UUID
    workspace_id: UUID
    render_type: RenderType
    status: RenderStatus
    storage_path: Optional[str] = None
    download_url: Optional[str] = None
    file_size_bytes: Optional[int] = None
    page_count: Optional[int] = None
    resolution_dpi: Optional[int] = None
    watermarked: bool = False
    error_message: Optional[str] = None
    requested_by_user_id: UUID
    created_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AlbumRenderListResponse(BaseModel):
    """Response schema for render list."""
    data: List[AlbumRenderResponse]


class DownloadResponse(BaseModel):
    """Response schema for download URL."""
    download_url: str
    expires_at: datetime
    file_size_bytes: Optional[int] = None


class DownloadGeneratingResponse(BaseModel):
    """Response when PDF is still generating."""
    status: str = "generating"
    estimated_seconds: int = 60
    render_id: Optional[UUID] = None


class RenderProgressResponse(BaseModel):
    """Response for render progress polling."""
    render_id: UUID
    status: RenderStatus
    progress_percent: Optional[int] = Field(None, ge=0, le=100)
    current_step: Optional[str] = None
    error_message: Optional[str] = None
