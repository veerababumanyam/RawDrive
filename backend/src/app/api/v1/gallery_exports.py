"""Gallery Export API Endpoints.

Multi-format gallery export functionality:
- ZIP archives with configurable resolution
- Print-ready PDF albums with layouts
- Animated slideshows (MP4/WebM)
- Cloud sync to Google Photos/Amazon Photos/Dropbox
- Batch export scheduling

Feature: Gallery Multi-Format Export
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import (
    get_current_user,
    get_workspace_id,
    WorkspaceAccessDep,
)
from app.services.gallery_export_service import (
    ExportFormat,
    ExportStatus,
    ExportError,
    ExportNotFoundError,
    ExportRateLimitError,
    ExportLimitExceededError,
    TooManyAssetsError,
    CloudProviderNotConnectedError,
    get_gallery_export_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gallery-exports", tags=["gallery-exports"])


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class ZipExportConfigRequest(BaseModel):
    """ZIP export configuration."""
    resolution: str = Field(
        default="original",
        description="Image resolution: original, high, web, preview, thumbnail",
    )
    includeMetadata: bool = Field(default=False, description="Include metadata JSON file")
    preserveOriginalFilenames: bool = Field(default=True, description="Preserve original filenames")
    flattenStructure: bool = Field(default=False, description="Flatten folder structure")
    includeSubGalleryFolders: bool = Field(default=True, description="Create folders for sub-galleries")


class PDFExportConfigRequest(BaseModel):
    """PDF album export configuration."""
    layoutStyle: str = Field(default="classic", description="Layout: single_photo, two_column, three_column, collage, magazine, classic")
    pageSize: str = Field(default="a4", description="Page size: a4, a3, letter, legal, square_8x8, square_10x10, square_12x12")
    orientation: str = Field(default="portrait", description="portrait or landscape")
    includeTitle: bool = Field(default=True)
    includeCover: bool = Field(default=True)
    includeTableOfContents: bool = Field(default=False)
    includePageNumbers: bool = Field(default=True)
    includeExifData: bool = Field(default=False)
    includeDateTaken: bool = Field(default=False)
    photoBorder: bool = Field(default=False)
    photoBorderWidth: int = Field(default=2)
    backgroundColor: str = Field(default="#ffffff")
    fontFamily: str = Field(default="Helvetica")
    coverTitle: Optional[str] = None
    coverSubtitle: Optional[str] = None
    quality: str = Field(default="print", description="print, web, or screen")


class SlideshowExportConfigRequest(BaseModel):
    """Slideshow video export configuration."""
    transition: str = Field(default="fade", description="Transition effect")
    transitionDuration: int = Field(default=500, description="Transition duration in ms")
    displayDuration: int = Field(default=3000, description="Display duration per photo in ms")
    quality: str = Field(default="1080p", description="480p, 720p, 1080p, 4k")
    aspectRatio: str = Field(default="16:9", description="16:9, 4:3, 1:1, 9:16")
    includeAudio: bool = Field(default=False)
    audioTrackUrl: Optional[str] = None
    audioFadeIn: bool = Field(default=True)
    audioFadeOut: bool = Field(default=True)
    loopAudio: bool = Field(default=True)
    includeTitleSlide: bool = Field(default=True)
    includeEndSlide: bool = Field(default=True)
    titleSlideText: Optional[str] = None
    endSlideText: Optional[str] = None
    backgroundColor: str = Field(default="#000000")


class CloudSyncConfigRequest(BaseModel):
    """Cloud sync configuration."""
    createAlbum: bool = Field(default=True, description="Create album in cloud provider")
    albumName: Optional[str] = None
    resolution: str = Field(default="high", description="Image resolution for sync")
    syncSubGalleries: bool = Field(default=True)
    overwriteExisting: bool = Field(default=False)


class CreateExportRequest(BaseModel):
    """Request to create a new export job."""
    format: str = Field(..., description="Export format: zip, pdf_album, slideshow_mp4, slideshow_webm, cloud_google_photos, cloud_amazon_photos, cloud_dropbox")
    config: dict = Field(default_factory=dict, description="Format-specific configuration")
    subGalleryIds: Optional[list[str]] = Field(default=None, description="Optional subset of sub-galleries")
    assetIds: Optional[list[str]] = Field(default=None, description="Optional subset of assets")
    scheduledAt: Optional[datetime] = Field(default=None, description="Schedule export for later")


class CancelExportRequest(BaseModel):
    """Request to cancel an export."""
    reason: Optional[str] = None


class RetryExportRequest(BaseModel):
    """Request to retry a failed export."""
    modifiedConfig: Optional[dict] = None


class BatchExportRequest(BaseModel):
    """Request to create batch exports."""
    galleryIds: list[str] = Field(..., description="List of gallery IDs to export")
    format: str = Field(..., description="Export format")
    config: dict = Field(default_factory=dict)
    scheduledAt: Optional[datetime] = None


class ConnectCloudProviderRequest(BaseModel):
    """Request to initiate cloud provider OAuth."""
    provider: str = Field(..., description="google_photos, amazon_photos, or dropbox")
    redirectUri: str = Field(..., description="OAuth callback URI")


class CloudProviderCallbackRequest(BaseModel):
    """OAuth callback request."""
    provider: str
    code: str
    state: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/galleries/{gallery_id}")
async def create_export(
    gallery_id: UUID,
    request: CreateExportRequest,
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
    user = Depends(get_current_user),
):
    """Create a new gallery export job.

    Supports multiple formats:
    - ZIP: Downloadable archive with configurable resolution
    - PDF Album: Print-ready album with layouts
    - Slideshow: MP4 or WebM video
    - Cloud Sync: Sync to Google Photos, Amazon Photos, or Dropbox
    """
    export_service = get_gallery_export_service()

    try:
        # Validate format
        try:
            export_format = ExportFormat(request.format)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid export format: {request.format}",
            )

        # Parse UUIDs
        sub_gallery_ids = [UUID(x) for x in request.subGalleryIds] if request.subGalleryIds else None
        asset_ids = [UUID(x) for x in request.assetIds] if request.assetIds else None

        # Create export
        export = await export_service.create_export(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            user_id=user.user_id,
            format=export_format,
            config=request.config,
            sub_gallery_ids=sub_gallery_ids,
            asset_ids=asset_ids,
            scheduled_at=request.scheduledAt,
        )

        return {
            "export": export.to_dict(),
            "message": "Export job created successfully",
        }

    except ExportRateLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=e.args[0],
            headers={"Retry-After": str(e.retry_after_seconds)},
        )
    except ExportLimitExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=e.args[0],
        )
    except TooManyAssetsError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.args[0],
        )
    except CloudProviderNotConnectedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.args[0],
        )
    except ExportError as e:
        raise HTTPException(
            status_code=e.status,
            detail=e.args[0],
        )


@router.get("/galleries/{gallery_id}")
async def list_gallery_exports(
    gallery_id: UUID,
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
    format: Optional[str] = Query(default=None, description="Filter by format"),
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    """List exports for a specific gallery."""
    export_service = get_gallery_export_service()

    # Validate filters
    export_format = None
    if format:
        try:
            export_format = ExportFormat(format)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid format: {format}",
            )

    export_status = None
    if status_filter:
        try:
            export_status = ExportStatus(status_filter)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}",
            )

    return await export_service.list_exports(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        format=export_format,
        status=export_status,
        page=page,
        limit=limit,
    )


@router.get("")
async def list_all_exports(
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
    gallery_id: Optional[UUID] = Query(default=None),
    format: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    """List all exports for the workspace."""
    export_service = get_gallery_export_service()

    # Validate filters
    export_format = None
    if format:
        try:
            export_format = ExportFormat(format)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid format: {format}",
            )

    export_status = None
    if status_filter:
        try:
            export_status = ExportStatus(status_filter)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}",
            )

    return await export_service.list_exports(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        format=export_format,
        status=export_status,
        page=page,
        limit=limit,
    )


@router.get("/{export_id}")
async def get_export(
    export_id: UUID,
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """Get export details by ID."""
    export_service = get_gallery_export_service()

    try:
        export = await export_service.get_export(
            workspace_id=workspace_id,
            export_id=export_id,
        )
        return {"export": export.to_dict()}

    except ExportNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Export {export_id} not found",
        )


@router.post("/{export_id}/cancel")
async def cancel_export(
    export_id: UUID,
    request: CancelExportRequest,
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """Cancel a pending or processing export."""
    export_service = get_gallery_export_service()

    try:
        export = await export_service.cancel_export(
            workspace_id=workspace_id,
            export_id=export_id,
            reason=request.reason,
        )
        return {
            "export": export.to_dict(),
            "message": "Export cancelled successfully",
        }

    except ExportNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Export {export_id} not found",
        )
    except ExportError as e:
        raise HTTPException(
            status_code=e.status,
            detail=e.args[0],
        )


@router.post("/{export_id}/retry")
async def retry_export(
    export_id: UUID,
    request: RetryExportRequest,
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """Retry a failed export."""
    export_service = get_gallery_export_service()

    try:
        export = await export_service.retry_export(
            workspace_id=workspace_id,
            export_id=export_id,
            modified_config=request.modifiedConfig,
        )
        return {
            "export": export.to_dict(),
            "message": "Export retry queued successfully",
        }

    except ExportNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Export {export_id} not found",
        )
    except ExportError as e:
        raise HTTPException(
            status_code=e.status,
            detail=e.args[0],
        )


@router.post("/batch")
async def create_batch_export(
    request: BatchExportRequest,
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
    user = Depends(get_current_user),
):
    """Create batch exports for multiple galleries.

    Useful for exporting large catalogs with scheduling support.
    """
    export_service = get_gallery_export_service()

    try:
        # Validate format
        try:
            export_format = ExportFormat(request.format)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid export format: {request.format}",
            )

        exports = []
        for gallery_id_str in request.galleryIds:
            try:
                gallery_id = UUID(gallery_id_str)
                export = await export_service.create_export(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    user_id=user.user_id,
                    format=export_format,
                    config=request.config,
                    scheduled_at=request.scheduledAt,
                )
                exports.append(export.to_dict())
            except Exception as e:
                logger.warning(f"Failed to create export for gallery {gallery_id_str}: {e}")
                continue

        return {
            "exports": exports,
            "totalQueued": len(exports),
            "message": f"Created {len(exports)} export jobs",
        }

    except ExportError as e:
        raise HTTPException(
            status_code=e.status,
            detail=e.args[0],
        )


@router.get("/stats")
async def get_export_stats(
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """Get export statistics for the workspace."""
    export_service = get_gallery_export_service()
    return await export_service.get_export_stats(workspace_id)


# ---------------------------------------------------------------------------
# Cloud Provider Connection Endpoints
# ---------------------------------------------------------------------------


@router.get("/cloud/connections")
async def list_cloud_connections(
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
    user = Depends(get_current_user),
):
    """List connected cloud providers."""
    export_service = get_gallery_export_service()

    connections = await export_service.get_cloud_connections(
        workspace_id=workspace_id,
        user_id=user.user_id,
    )

    return {
        "connections": [conn.to_dict() for conn in connections],
    }


@router.post("/cloud/connect")
async def connect_cloud_provider(
    request: ConnectCloudProviderRequest,
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
    user = Depends(get_current_user),
):
    """Initiate OAuth flow to connect a cloud provider.

    Returns the OAuth authorization URL to redirect the user to.
    """
    # Validate provider
    valid_providers = {"google_photos", "amazon_photos", "dropbox"}
    if request.provider not in valid_providers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider: {request.provider}. Valid providers: {', '.join(valid_providers)}",
        )

    # TODO: Implement OAuth flow for each provider
    # This would return the OAuth authorization URL

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Cloud provider OAuth for {request.provider} not yet implemented",
    )


@router.post("/cloud/callback")
async def cloud_provider_callback(
    request: CloudProviderCallbackRequest,
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
    user = Depends(get_current_user),
):
    """Handle OAuth callback from cloud provider."""
    # TODO: Implement OAuth callback handling

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Cloud provider callback for {request.provider} not yet implemented",
    )


@router.delete("/cloud/connections/{provider}")
async def disconnect_cloud_provider(
    provider: str,
    _access: WorkspaceAccessDep,
    workspace_id: UUID = Depends(get_workspace_id),
    user = Depends(get_current_user),
):
    """Disconnect a cloud provider."""
    export_service = get_gallery_export_service()

    valid_providers = {"google_photos", "amazon_photos", "dropbox"}
    if provider not in valid_providers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider: {provider}",
        )

    await export_service.disconnect_cloud_provider(
        workspace_id=workspace_id,
        user_id=user.user_id,
        provider=provider,
    )

    return {"message": f"Disconnected from {provider.replace('_', ' ').title()}"}
