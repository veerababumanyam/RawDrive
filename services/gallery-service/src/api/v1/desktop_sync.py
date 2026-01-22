"""
Desktop Sync API Endpoints
Authentication, gallery listing, and file sync for desktop applications.
Feature: 029-pro-review-xmp-sync
Tasks: T059, T060, T074, T075, T076, T077, T078

These endpoints are authenticated via sync API keys (not JWT) and provide
functionality for the desktop sync application to authenticate, discover
galleries, and sync files.

Endpoints:
- POST /sync/auth/validate - Validate an API key (T059)
- GET /sync/galleries - List accessible galleries (T060)
- GET /sync/galleries/{gallery_id}/files - List files in gallery (T074)
- POST /sync/galleries/{gallery_id}/files/check - Check files to sync (T075)
- POST /sync/galleries/{gallery_id}/upload - Upload a file (T076)
- POST /sync/galleries/{gallery_id}/upload/tus - TUS upload init (T077)
- PATCH /sync/galleries/{gallery_id}/files/{asset_id} - Update file metadata (T078)
"""

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request, Query, UploadFile, File, Form
from pydantic import BaseModel, Field

from src.middleware.sync_auth import (
    get_sync_context,
    require_read_permission,
    require_write_permission,
)
from src.services.sync_key_service import (
    get_sync_key_service,
    SyncKeyService,
    SyncKeyInvalidError,
    SyncKeyRevokedError,
    SyncKeyExpiredError,
    SyncKeyError,
)
from src.schemas.sync_api_key import (
    SyncApiKeyValidateRequest,
    SyncApiKeyValidateResponse,
    SyncKeyPermission,
)
from src.database import get_connection
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()
router = APIRouter()


# =============================================================================
# Response Schemas
# =============================================================================


class GallerySummary(BaseModel):
    """Summary of a gallery accessible via sync API."""

    gallery_id: str
    workspace_id: str
    title: str
    slug: Optional[str] = None
    asset_count: int = 0
    cover_asset_url: Optional[str] = None
    created_at: str
    updated_at: str
    status: str = "draft"


class GalleryListResponse(BaseModel):
    """Response for gallery list endpoint."""

    data: List[GallerySummary]
    total: int
    has_more: bool = False
    page: int = 1
    limit: int = 50


class SyncConnectionInfo(BaseModel):
    """Information about the sync connection."""

    connected: bool = True
    key_id: str
    workspace_id: str
    user_id: str
    permissions: List[str]
    scoped_gallery_ids: List[str] = Field(
        default_factory=list,
        description="Gallery IDs this key can access. Empty = all galleries.",
    )
    galleries_accessible: int


# =============================================================================
# Endpoints
# =============================================================================


@router.post(
    "/sync/auth/validate",
    response_model=SyncApiKeyValidateResponse,
    summary="Validate sync API key",
    description="""
    Validates a sync API key and returns its permissions and scope.

    This endpoint is used by the desktop application to verify credentials
    before establishing a sync connection.

    Note: This endpoint does NOT require authentication headers since
    the API key is passed in the request body.
    """,
    tags=["desktop-sync"],
)
async def validate_sync_key(
    request: SyncApiKeyValidateRequest,
) -> SyncApiKeyValidateResponse:
    """Validate a sync API key (T059)."""
    service = get_sync_key_service()

    try:
        result = await service.validate_key(request.api_key)

        logger.info(
            "Sync API key validated successfully",
            extra={
                "key_id": result["key_id"],
                "workspace_id": result["workspace_id"],
            },
        )

        return SyncApiKeyValidateResponse(
            valid=True,
            key_id=result["key_id"],
            workspace_id=result["workspace_id"],
            user_id=result["user_id"],
            permissions=[SyncKeyPermission(p) for p in result["permissions"]],
            scoped_gallery_ids=result["scoped_gallery_ids"],
        )

    except SyncKeyInvalidError:
        return SyncApiKeyValidateResponse(
            valid=False,
            error="Invalid API key",
        )
    except SyncKeyRevokedError:
        return SyncApiKeyValidateResponse(
            valid=False,
            error="This API key has been revoked",
        )
    except SyncKeyExpiredError:
        return SyncApiKeyValidateResponse(
            valid=False,
            error="This API key has expired",
        )
    except SyncKeyError as e:
        return SyncApiKeyValidateResponse(
            valid=False,
            error=str(e),
        )
    except Exception as e:
        logger.error(f"Unexpected error validating sync key: {e}")
        return SyncApiKeyValidateResponse(
            valid=False,
            error="Validation failed",
        )


@router.get(
    "/sync/galleries",
    response_model=GalleryListResponse,
    summary="List accessible galleries",
    description="""
    Lists galleries that the sync API key has access to.

    If the key has scoped gallery IDs, only those galleries are returned.
    If the key has no scope restrictions, all galleries in the workspace are returned.

    Requires: API key authentication via X-Api-Key header or Authorization: Bearer header
    """,
    tags=["desktop-sync"],
)
async def list_sync_galleries(
    request: Request,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    sync_context: dict = Depends(require_read_permission()),
) -> GalleryListResponse:
    """List galleries accessible via sync API key (T060)."""
    workspace_id = sync_context["workspace_id"]
    scoped_gallery_ids = sync_context.get("scoped_gallery_ids", [])

    offset = (page - 1) * limit

    try:
        with metrics.track_db_query("list_sync_galleries"):
            async with get_connection(read_only=True) as conn:
                # Build query based on whether key is scoped
                if scoped_gallery_ids:
                    # Only return scoped galleries
                    gallery_uuids = [UUID(gid) for gid in scoped_gallery_ids]
                    rows = await conn.fetch(
                        """
                        SELECT
                            g.id as gallery_id,
                            g.workspace_id,
                            g.title,
                            g.slug,
                            g.status,
                            g.created_at,
                            g.updated_at,
                            COALESCE(
                                (SELECT COUNT(*) FROM assets a WHERE a.gallery_id = g.id),
                                0
                            ) as asset_count,
                            (
                                SELECT a.thumbnail_url
                                FROM assets a
                                WHERE a.gallery_id = g.id
                                ORDER BY a.created_at DESC
                                LIMIT 1
                            ) as cover_asset_url
                        FROM galleries g
                        WHERE g.workspace_id = $1
                          AND g.id = ANY($2)
                          AND g.deleted_at IS NULL
                        ORDER BY g.updated_at DESC
                        LIMIT $3 OFFSET $4
                        """,
                        UUID(workspace_id),
                        gallery_uuids,
                        limit + 1,  # Fetch one extra to check has_more
                        offset,
                    )

                    # Get total count
                    count_row = await conn.fetchrow(
                        """
                        SELECT COUNT(*) as total
                        FROM galleries g
                        WHERE g.workspace_id = $1
                          AND g.id = ANY($2)
                          AND g.deleted_at IS NULL
                        """,
                        UUID(workspace_id),
                        gallery_uuids,
                    )
                else:
                    # Return all galleries in workspace
                    rows = await conn.fetch(
                        """
                        SELECT
                            g.id as gallery_id,
                            g.workspace_id,
                            g.title,
                            g.slug,
                            g.status,
                            g.created_at,
                            g.updated_at,
                            COALESCE(
                                (SELECT COUNT(*) FROM assets a WHERE a.gallery_id = g.id),
                                0
                            ) as asset_count,
                            (
                                SELECT a.thumbnail_url
                                FROM assets a
                                WHERE a.gallery_id = g.id
                                ORDER BY a.created_at DESC
                                LIMIT 1
                            ) as cover_asset_url
                        FROM galleries g
                        WHERE g.workspace_id = $1
                          AND g.deleted_at IS NULL
                        ORDER BY g.updated_at DESC
                        LIMIT $2 OFFSET $3
                        """,
                        UUID(workspace_id),
                        limit + 1,
                        offset,
                    )

                    # Get total count
                    count_row = await conn.fetchrow(
                        """
                        SELECT COUNT(*) as total
                        FROM galleries g
                        WHERE g.workspace_id = $1
                          AND g.deleted_at IS NULL
                        """,
                        UUID(workspace_id),
                    )

        total = count_row["total"] if count_row else 0
        has_more = len(rows) > limit
        galleries_data = rows[:limit]  # Trim the extra row

        galleries = [
            GallerySummary(
                gallery_id=str(row["gallery_id"]),
                workspace_id=str(row["workspace_id"]),
                title=row["title"],
                slug=row["slug"],
                asset_count=row["asset_count"],
                cover_asset_url=row["cover_asset_url"],
                created_at=row["created_at"].isoformat(),
                updated_at=row["updated_at"].isoformat(),
                status=row["status"] or "draft",
            )
            for row in galleries_data
        ]

        return GalleryListResponse(
            data=galleries,
            total=total,
            has_more=has_more,
            page=page,
            limit=limit,
        )

    except Exception as e:
        logger.error(f"Failed to list sync galleries: {e}")
        raise HTTPException(status_code=500, detail="Failed to list galleries")


@router.get(
    "/sync/connection",
    response_model=SyncConnectionInfo,
    summary="Get sync connection info",
    description="""
    Returns information about the current sync connection including
    permissions and the number of accessible galleries.

    Use this endpoint to verify connectivity and key capabilities.
    """,
    tags=["desktop-sync"],
)
async def get_sync_connection_info(
    request: Request,
    sync_context: dict = Depends(require_read_permission()),
) -> SyncConnectionInfo:
    """Get information about the current sync connection."""
    workspace_id = sync_context["workspace_id"]
    scoped_gallery_ids = sync_context.get("scoped_gallery_ids", [])

    try:
        # Count accessible galleries
        with metrics.track_db_query("count_sync_galleries"):
            async with get_connection(read_only=True) as conn:
                if scoped_gallery_ids:
                    gallery_uuids = [UUID(gid) for gid in scoped_gallery_ids]
                    count_row = await conn.fetchrow(
                        """
                        SELECT COUNT(*) as total
                        FROM galleries g
                        WHERE g.workspace_id = $1
                          AND g.id = ANY($2)
                          AND g.deleted_at IS NULL
                        """,
                        UUID(workspace_id),
                        gallery_uuids,
                    )
                else:
                    count_row = await conn.fetchrow(
                        """
                        SELECT COUNT(*) as total
                        FROM galleries g
                        WHERE g.workspace_id = $1
                          AND g.deleted_at IS NULL
                        """,
                        UUID(workspace_id),
                    )

        galleries_count = count_row["total"] if count_row else 0

        return SyncConnectionInfo(
            connected=True,
            key_id=sync_context["key_id"],
            workspace_id=workspace_id,
            user_id=sync_context["user_id"],
            permissions=sync_context.get("permissions", []),
            scoped_gallery_ids=scoped_gallery_ids,
            galleries_accessible=galleries_count,
        )

    except Exception as e:
        logger.error(f"Failed to get connection info: {e}")
        raise HTTPException(status_code=500, detail="Failed to get connection info")


# =============================================================================
# File Sync Schemas (T074-T078)
# =============================================================================


class SyncFileInfo(BaseModel):
    """Information about a file/asset for sync purposes."""

    asset_id: str
    filename: str
    original_filename: str
    file_size: int
    content_hash: Optional[str] = None
    mime_type: str
    rating: Optional[int] = None
    flag: Optional[str] = None
    color_label: Optional[str] = None
    created_at: str
    updated_at: str
    sync_version: int = 1


class SyncFileListResponse(BaseModel):
    """Response for file list endpoint."""

    data: List[SyncFileInfo]
    total: int
    has_more: bool = False
    page: int = 1
    limit: int = 100
    sync_cursor: Optional[str] = None


class FileCheckRequest(BaseModel):
    """Request to check which files need syncing."""

    files: List[Dict[str, Any]] = Field(
        ...,
        description="List of files to check. Each file should have 'filename' and optionally 'content_hash', 'file_size', 'modified_at'.",
    )


class FileCheckResult(BaseModel):
    """Result for a single file check."""

    filename: str
    status: str = Field(
        ...,
        description="One of: 'new' (upload needed), 'exists' (already synced), 'updated' (re-upload needed), 'conflict' (manual resolution needed)",
    )
    asset_id: Optional[str] = None
    message: Optional[str] = None


class FileCheckResponse(BaseModel):
    """Response for file check endpoint."""

    results: List[FileCheckResult]
    to_upload: int
    already_synced: int
    conflicts: int


class FileUploadResponse(BaseModel):
    """Response for file upload endpoint."""

    asset_id: str
    filename: str
    file_size: int
    status: str = "uploaded"
    message: Optional[str] = None


class TusUploadInitRequest(BaseModel):
    """Request to initialize TUS upload."""

    filename: str
    file_size: int
    content_type: str
    content_hash: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class TusUploadInitResponse(BaseModel):
    """Response for TUS upload initialization."""

    upload_url: str
    upload_id: str
    expires_at: str


class FileMetadataUpdateRequest(BaseModel):
    """Request to update file metadata."""

    rating: Optional[int] = Field(None, ge=0, le=5)
    flag: Optional[str] = Field(None, pattern="^(pick|unflagged|reject)$")
    color_label: Optional[str] = None


class FileMetadataUpdateResponse(BaseModel):
    """Response for file metadata update."""

    asset_id: str
    rating: Optional[int] = None
    flag: Optional[str] = None
    color_label: Optional[str] = None
    updated_at: str


# =============================================================================
# File Sync Endpoints (T074-T078)
# =============================================================================


@router.get(
    "/sync/galleries/{gallery_id}/files",
    response_model=SyncFileListResponse,
    summary="List files in gallery",
    description="""
    Lists all files/assets in a gallery for sync purposes.
    Returns file metadata including content hash for change detection.

    Supports pagination and cursor-based sync for efficient incremental updates.
    """,
    tags=["desktop-sync"],
)
async def list_gallery_files(
    gallery_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(100, ge=1, le=500, description="Items per page"),
    since: Optional[str] = Query(None, description="ISO timestamp - only return files updated after this time"),
    sync_context: dict = Depends(require_read_permission()),
) -> SyncFileListResponse:
    """List files in a gallery for sync (T074)."""
    workspace_id = sync_context["workspace_id"]
    scoped_gallery_ids = sync_context.get("scoped_gallery_ids", [])

    # Verify gallery access
    if scoped_gallery_ids and gallery_id not in scoped_gallery_ids:
        raise HTTPException(status_code=403, detail="Access denied to this gallery")

    offset = (page - 1) * limit

    try:
        with metrics.track_db_query("list_gallery_files"):
            async with get_connection(read_only=True) as conn:
                # Verify gallery belongs to workspace
                gallery_row = await conn.fetchrow(
                    """
                    SELECT id FROM galleries
                    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
                    """,
                    UUID(gallery_id),
                    UUID(workspace_id),
                )

                if not gallery_row:
                    raise HTTPException(status_code=404, detail="Gallery not found")

                # Build query with optional since filter
                if since:
                    since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
                    rows = await conn.fetch(
                        """
                        SELECT
                            a.id as asset_id,
                            a.filename,
                            a.original_filename,
                            a.file_size,
                            a.content_hash,
                            a.mime_type,
                            a.rating,
                            a.flag,
                            a.color_label,
                            a.created_at,
                            a.updated_at,
                            COALESCE(a.sync_version, 1) as sync_version
                        FROM assets a
                        WHERE a.gallery_id = $1
                          AND a.deleted_at IS NULL
                          AND a.updated_at > $2
                        ORDER BY a.updated_at ASC
                        LIMIT $3 OFFSET $4
                        """,
                        UUID(gallery_id),
                        since_dt,
                        limit + 1,
                        offset,
                    )

                    count_row = await conn.fetchrow(
                        """
                        SELECT COUNT(*) as total FROM assets
                        WHERE gallery_id = $1 AND deleted_at IS NULL AND updated_at > $2
                        """,
                        UUID(gallery_id),
                        since_dt,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT
                            a.id as asset_id,
                            a.filename,
                            a.original_filename,
                            a.file_size,
                            a.content_hash,
                            a.mime_type,
                            a.rating,
                            a.flag,
                            a.color_label,
                            a.created_at,
                            a.updated_at,
                            COALESCE(a.sync_version, 1) as sync_version
                        FROM assets a
                        WHERE a.gallery_id = $1 AND a.deleted_at IS NULL
                        ORDER BY a.created_at ASC
                        LIMIT $2 OFFSET $3
                        """,
                        UUID(gallery_id),
                        limit + 1,
                        offset,
                    )

                    count_row = await conn.fetchrow(
                        """
                        SELECT COUNT(*) as total FROM assets
                        WHERE gallery_id = $1 AND deleted_at IS NULL
                        """,
                        UUID(gallery_id),
                    )

        total = count_row["total"] if count_row else 0
        has_more = len(rows) > limit
        files_data = rows[:limit]

        # Generate sync cursor from last item
        sync_cursor = None
        if files_data:
            last_updated = files_data[-1]["updated_at"]
            sync_cursor = last_updated.isoformat()

        files = [
            SyncFileInfo(
                asset_id=str(row["asset_id"]),
                filename=row["filename"],
                original_filename=row["original_filename"] or row["filename"],
                file_size=row["file_size"] or 0,
                content_hash=row["content_hash"],
                mime_type=row["mime_type"] or "application/octet-stream",
                rating=row["rating"],
                flag=row["flag"],
                color_label=row["color_label"],
                created_at=row["created_at"].isoformat(),
                updated_at=row["updated_at"].isoformat(),
                sync_version=row["sync_version"],
            )
            for row in files_data
        ]

        return SyncFileListResponse(
            data=files,
            total=total,
            has_more=has_more,
            page=page,
            limit=limit,
            sync_cursor=sync_cursor,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list gallery files: {e}")
        raise HTTPException(status_code=500, detail="Failed to list files")


@router.post(
    "/sync/galleries/{gallery_id}/files/check",
    response_model=FileCheckResponse,
    summary="Check files for sync",
    description="""
    Checks a list of local files against the gallery to determine which
    files need to be uploaded, are already synced, or have conflicts.

    This is an efficient way to determine sync status before uploading.
    """,
    tags=["desktop-sync"],
)
async def check_files_for_sync(
    gallery_id: str,
    request: FileCheckRequest,
    sync_context: dict = Depends(require_read_permission()),
) -> FileCheckResponse:
    """Check which files need syncing (T075)."""
    workspace_id = sync_context["workspace_id"]
    scoped_gallery_ids = sync_context.get("scoped_gallery_ids", [])

    if scoped_gallery_ids and gallery_id not in scoped_gallery_ids:
        raise HTTPException(status_code=403, detail="Access denied to this gallery")

    try:
        with metrics.track_db_query("check_files_for_sync"):
            async with get_connection(read_only=True) as conn:
                # Verify gallery
                gallery_row = await conn.fetchrow(
                    """
                    SELECT id FROM galleries
                    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
                    """,
                    UUID(gallery_id),
                    UUID(workspace_id),
                )

                if not gallery_row:
                    raise HTTPException(status_code=404, detail="Gallery not found")

                # Get all assets in gallery indexed by original filename
                assets = await conn.fetch(
                    """
                    SELECT id, original_filename, filename, content_hash, file_size, updated_at
                    FROM assets
                    WHERE gallery_id = $1 AND deleted_at IS NULL
                    """,
                    UUID(gallery_id),
                )

                # Build lookup by filename
                asset_lookup = {}
                for asset in assets:
                    key = asset["original_filename"] or asset["filename"]
                    asset_lookup[key.lower()] = asset

        results = []
        to_upload = 0
        already_synced = 0
        conflicts = 0

        for file_info in request.files:
            filename = file_info.get("filename", "")
            content_hash = file_info.get("content_hash")
            file_size = file_info.get("file_size")

            lookup_key = filename.lower()
            existing = asset_lookup.get(lookup_key)

            if not existing:
                # New file - needs upload
                results.append(FileCheckResult(
                    filename=filename,
                    status="new",
                    message="File not found in gallery",
                ))
                to_upload += 1
            elif content_hash and existing["content_hash"]:
                # Compare by content hash
                if content_hash == existing["content_hash"]:
                    results.append(FileCheckResult(
                        filename=filename,
                        status="exists",
                        asset_id=str(existing["id"]),
                        message="File already synced (hash match)",
                    ))
                    already_synced += 1
                else:
                    results.append(FileCheckResult(
                        filename=filename,
                        status="updated",
                        asset_id=str(existing["id"]),
                        message="File content changed - re-upload needed",
                    ))
                    to_upload += 1
            elif file_size and existing["file_size"]:
                # Compare by file size as fallback
                if file_size == existing["file_size"]:
                    results.append(FileCheckResult(
                        filename=filename,
                        status="exists",
                        asset_id=str(existing["id"]),
                        message="File already synced (size match)",
                    ))
                    already_synced += 1
                else:
                    results.append(FileCheckResult(
                        filename=filename,
                        status="conflict",
                        asset_id=str(existing["id"]),
                        message="File size differs - manual resolution may be needed",
                    ))
                    conflicts += 1
            else:
                # Can't determine - assume exists
                results.append(FileCheckResult(
                    filename=filename,
                    status="exists",
                    asset_id=str(existing["id"]),
                    message="File exists (no hash available for comparison)",
                ))
                already_synced += 1

        return FileCheckResponse(
            results=results,
            to_upload=to_upload,
            already_synced=already_synced,
            conflicts=conflicts,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to check files: {e}")
        raise HTTPException(status_code=500, detail="Failed to check files")


@router.post(
    "/sync/galleries/{gallery_id}/upload",
    response_model=FileUploadResponse,
    summary="Upload file to gallery",
    description="""
    Upload a single file to the gallery. For large files, use the TUS
    resumable upload endpoint instead.

    Maximum file size: 100MB (use TUS for larger files).
    """,
    tags=["desktop-sync"],
)
async def upload_file(
    gallery_id: str,
    file: UploadFile = File(...),
    original_filename: Optional[str] = Form(None),
    content_hash: Optional[str] = Form(None),
    sync_context: dict = Depends(require_write_permission()),
) -> FileUploadResponse:
    """Upload a file to gallery (T076)."""
    workspace_id = sync_context["workspace_id"]
    user_id = sync_context["user_id"]
    scoped_gallery_ids = sync_context.get("scoped_gallery_ids", [])

    if scoped_gallery_ids and gallery_id not in scoped_gallery_ids:
        raise HTTPException(status_code=403, detail="Access denied to this gallery")

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Limit to 100MB for direct upload
    if file_size > 100 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="File too large. Use TUS upload for files over 100MB.",
        )

    # Calculate content hash if not provided
    if not content_hash:
        content_hash = hashlib.sha256(content).hexdigest()

    filename = original_filename or file.filename or "unnamed"

    try:
        with metrics.track_db_query("upload_sync_file"):
            async with get_connection() as conn:
                # Verify gallery
                gallery_row = await conn.fetchrow(
                    """
                    SELECT id FROM galleries
                    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
                    """,
                    UUID(gallery_id),
                    UUID(workspace_id),
                )

                if not gallery_row:
                    raise HTTPException(status_code=404, detail="Gallery not found")

                # Check if file with same hash already exists
                existing = await conn.fetchrow(
                    """
                    SELECT id FROM assets
                    WHERE gallery_id = $1 AND content_hash = $2 AND deleted_at IS NULL
                    """,
                    UUID(gallery_id),
                    content_hash,
                )

                if existing:
                    return FileUploadResponse(
                        asset_id=str(existing["id"]),
                        filename=filename,
                        file_size=file_size,
                        status="exists",
                        message="File with same content already exists",
                    )

                # TODO: Actually upload to storage and create asset record
                # For now, create a placeholder asset record
                import uuid as uuid_module
                asset_id = uuid_module.uuid4()

                await conn.execute(
                    """
                    INSERT INTO assets (
                        id, gallery_id, workspace_id, filename, original_filename,
                        file_size, content_hash, mime_type, status, uploaded_by,
                        created_at, updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, 'uploaded', $9,
                        NOW(), NOW()
                    )
                    """,
                    asset_id,
                    UUID(gallery_id),
                    UUID(workspace_id),
                    filename,
                    filename,
                    file_size,
                    content_hash,
                    file.content_type or "application/octet-stream",
                    UUID(user_id),
                )

        logger.info(
            f"File uploaded via sync: {filename}",
            extra={
                "asset_id": str(asset_id),
                "gallery_id": gallery_id,
                "file_size": file_size,
            },
        )

        return FileUploadResponse(
            asset_id=str(asset_id),
            filename=filename,
            file_size=file_size,
            status="uploaded",
            message="File uploaded successfully",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload file: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload file")


@router.post(
    "/sync/galleries/{gallery_id}/upload/tus",
    response_model=TusUploadInitResponse,
    summary="Initialize TUS resumable upload",
    description="""
    Initialize a TUS resumable upload for large files. Returns an upload URL
    that the desktop app can use to upload the file in chunks.

    The upload URL is valid for 24 hours.
    """,
    tags=["desktop-sync"],
)
async def init_tus_upload(
    gallery_id: str,
    request: TusUploadInitRequest,
    sync_context: dict = Depends(require_write_permission()),
) -> TusUploadInitResponse:
    """Initialize TUS upload (T077)."""
    workspace_id = sync_context["workspace_id"]
    scoped_gallery_ids = sync_context.get("scoped_gallery_ids", [])

    if scoped_gallery_ids and gallery_id not in scoped_gallery_ids:
        raise HTTPException(status_code=403, detail="Access denied to this gallery")

    try:
        with metrics.track_db_query("init_tus_upload"):
            async with get_connection(read_only=True) as conn:
                # Verify gallery
                gallery_row = await conn.fetchrow(
                    """
                    SELECT id FROM galleries
                    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
                    """,
                    UUID(gallery_id),
                    UUID(workspace_id),
                )

                if not gallery_row:
                    raise HTTPException(status_code=404, detail="Gallery not found")

        # Generate upload ID and URL
        import uuid as uuid_module
        upload_id = str(uuid_module.uuid4())

        # Calculate expiry (24 hours from now)
        expires_at = datetime.utcnow().replace(microsecond=0)
        expires_at = expires_at.replace(hour=expires_at.hour + 24)

        # TODO: Actually create TUS upload session with upload service
        # For now, return placeholder URL
        upload_url = f"/api/v1/uploads/tus/{upload_id}"

        logger.info(
            f"TUS upload initialized: {request.filename}",
            extra={
                "upload_id": upload_id,
                "gallery_id": gallery_id,
                "file_size": request.file_size,
            },
        )

        return TusUploadInitResponse(
            upload_url=upload_url,
            upload_id=upload_id,
            expires_at=expires_at.isoformat() + "Z",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to init TUS upload: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize upload")


@router.patch(
    "/sync/galleries/{gallery_id}/files/{asset_id}",
    response_model=FileMetadataUpdateResponse,
    summary="Update file metadata",
    description="""
    Update metadata (rating, flag, color label) for a synced file.

    This is used to sync metadata changes from the desktop app to RawDrive.
    """,
    tags=["desktop-sync"],
)
async def update_file_metadata(
    gallery_id: str,
    asset_id: str,
    request: FileMetadataUpdateRequest,
    sync_context: dict = Depends(require_write_permission()),
) -> FileMetadataUpdateResponse:
    """Update file metadata (T078)."""
    workspace_id = sync_context["workspace_id"]
    scoped_gallery_ids = sync_context.get("scoped_gallery_ids", [])

    if scoped_gallery_ids and gallery_id not in scoped_gallery_ids:
        raise HTTPException(status_code=403, detail="Access denied to this gallery")

    try:
        with metrics.track_db_query("update_file_metadata"):
            async with get_connection() as conn:
                # Verify asset exists and belongs to gallery/workspace
                asset_row = await conn.fetchrow(
                    """
                    SELECT a.id, a.rating, a.flag, a.color_label
                    FROM assets a
                    JOIN galleries g ON a.gallery_id = g.id
                    WHERE a.id = $1
                      AND a.gallery_id = $2
                      AND g.workspace_id = $3
                      AND a.deleted_at IS NULL
                    """,
                    UUID(asset_id),
                    UUID(gallery_id),
                    UUID(workspace_id),
                )

                if not asset_row:
                    raise HTTPException(status_code=404, detail="Asset not found")

                # Build update query
                updates = []
                params = []
                param_idx = 1

                if request.rating is not None:
                    updates.append(f"rating = ${param_idx}")
                    params.append(request.rating)
                    param_idx += 1

                if request.flag is not None:
                    updates.append(f"flag = ${param_idx}")
                    params.append(request.flag)
                    param_idx += 1

                if request.color_label is not None:
                    updates.append(f"color_label = ${param_idx}")
                    params.append(request.color_label)
                    param_idx += 1

                if not updates:
                    # No updates - return current values
                    return FileMetadataUpdateResponse(
                        asset_id=asset_id,
                        rating=asset_row["rating"],
                        flag=asset_row["flag"],
                        color_label=asset_row["color_label"],
                        updated_at=datetime.utcnow().isoformat() + "Z",
                    )

                # Add updated_at and sync_version increment
                updates.append("updated_at = NOW()")
                updates.append("sync_version = COALESCE(sync_version, 1) + 1")

                # Add asset_id param
                params.append(UUID(asset_id))

                query = f"""
                    UPDATE assets
                    SET {', '.join(updates)}
                    WHERE id = ${param_idx}
                    RETURNING rating, flag, color_label, updated_at
                """

                result = await conn.fetchrow(query, *params)

        logger.info(
            f"File metadata updated via sync: {asset_id}",
            extra={
                "asset_id": asset_id,
                "gallery_id": gallery_id,
                "updates": request.dict(exclude_none=True),
            },
        )

        return FileMetadataUpdateResponse(
            asset_id=asset_id,
            rating=result["rating"],
            flag=result["flag"],
            color_label=result["color_label"],
            updated_at=result["updated_at"].isoformat() + "Z",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update file metadata: {e}")
        raise HTTPException(status_code=500, detail="Failed to update metadata")
