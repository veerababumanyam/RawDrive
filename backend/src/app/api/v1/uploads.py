"""Upload API endpoints.

Handles secure file uploads with encryption and processing.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, UploadFile, File, Form, status, Request

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep, WorkspaceIdDep
from app.api.schemas import (
    CreateUploadSessionRequest,
    UploadSessionResponse,
    UploadCommitResponse,
    CheckDuplicateRequest,
    CheckDuplicateResponse,
    DuplicateAssetResponse,
    ErrorResponse,
)
from app.api.exceptions import ValidationAppError, InternalError, NotFoundError
from app.services.content_detection_service import get_content_detection_service
from app.services.upload_service import get_upload_service, UploadError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=UploadSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create upload session",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def create_upload_session(
    workspace_id: Annotated[UUID, WorkspaceAccessDep],
    current_user: CurrentUserDep,
    request: CreateUploadSessionRequest,
) -> UploadSessionResponse:
    """Create upload session for file upload."""
    upload_service = get_upload_service()

    # Log RAW file upload attempts for monitoring
    ext = request.file_name.lower().split(".")[-1] if "." in request.file_name else ""
    from app.shared.constants import SUPPORTED_RAW_EXTENSIONS
    if ext in SUPPORTED_RAW_EXTENSIONS:
        logger.info(
            f"RAW file upload session requested: {request.file_name} "
            f"(ext={ext}, mime={request.mime_type!r}, size={request.size_bytes})"
        )

    try:
        result = await upload_service.create_upload_session(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            gallery_id=request.gallery_id,
            filename=request.file_name,
            mime_type=request.mime_type,
            size_bytes=request.size_bytes,
            sub_gallery_id=request.sub_gallery_id,
            sha256=request.sha256,
        )

        return UploadSessionResponse(**result)
    except UploadError as e:
        if e.status == 400:
            raise ValidationAppError(str(e), "file")
        elif e.status == 404:
            raise NotFoundError("Gallery", request.gallery_id)
        else:
            raise InternalError(str(e))
    except Exception as e:
        logger.exception("Failed to create upload session")
        raise InternalError("Failed to create upload session")


@router.put(
    "/{upload_id}/upload",
    status_code=status.HTTP_200_OK,
    summary="Upload file data",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        404: {"model": ErrorResponse, "description": "Upload session not found"},
    },
)
async def upload_file_data(
    workspace_id: WorkspaceIdDep,
    upload_id: UUID,
    current_user: CurrentUserDep,
    request: Request,
) -> dict:
    """Upload file data to session.

    This performs the actual upload processing (encryption, R2 storage)
    and marks the session as committed.
    """
    upload_service = get_upload_service()

    try:
        # Read raw body
        file_data = await request.body()

        # Process upload immediately
        await upload_service.process_proxy_upload(
            workspace_id=workspace_id,
            upload_id=upload_id,
            file_data=file_data,
        )

        return {
            "message": "File uploaded successfully",
            "size": len(file_data),
            "upload_id": str(upload_id),
        }
    except UploadError as e:
        if e.status == 400:
            raise ValidationAppError(str(e), "file")
        elif e.status == 404:
            raise NotFoundError("Upload session", upload_id)
        else:
            raise InternalError(str(e))
    except Exception as e:
        logger.exception("Failed to upload file")
        raise InternalError("Failed to upload file")


@router.patch(
    "/{upload_id}/chunk",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Upload file chunk (TUS protocol)",
    response_model=None,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        404: {"model": ErrorResponse, "description": "Upload session not found"},
        409: {"model": ErrorResponse, "description": "Offset mismatch"},
    },
)
async def upload_chunk(
    workspace_id: Annotated[UUID, WorkspaceAccessDep],
    upload_id: UUID,
    current_user: CurrentUserDep,
    request: Request,
):
    """Upload a chunk of file data using TUS resumable protocol.

    This endpoint implements TUS (https://tus.io/protocols/resumable-upload.html):
    - Accepts PATCH requests with chunk data
    - Uses Upload-Offset header to track progress
    - Returns new Upload-Offset after successful chunk storage
    - Stores chunks in Redis with 1-hour expiry for assembly

    Client-side chunking reduces server memory usage and enables
    resume capability for large file uploads.
    """
    from fastapi.responses import Response
    from app.services.chunked_upload_service import get_chunked_upload_service, ChunkError

    chunked_service = get_chunked_upload_service()

    try:
        # Get upload offset from TUS header
        upload_offset_str = request.headers.get("Upload-Offset", "0")
        try:
            upload_offset = int(upload_offset_str)
        except ValueError:
            raise ValidationAppError("Invalid Upload-Offset header", "Upload-Offset")

        # Read chunk data
        chunk_data = await request.body()

        if not chunk_data:
            raise ValidationAppError("Empty chunk data", "body")

        # Store chunk
        new_offset = await chunked_service.store_chunk(
            workspace_id=workspace_id,
            upload_id=upload_id,
            offset=upload_offset,
            chunk_data=chunk_data,
        )

        # Return 204 with new offset (TUS protocol)
        return Response(
            status_code=204,
            headers={
                "Upload-Offset": str(new_offset),
                "Tus-Resumable": "1.0.0",
            },
        )
    except ChunkError as e:
        if "offset mismatch" in str(e).lower():
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail=str(e))
        elif e.status == 404:
            raise NotFoundError("Upload session", upload_id)
        else:
            raise ValidationAppError(str(e), "chunk")
    except Exception as e:
        logger.exception("Failed to upload chunk")
        raise InternalError("Failed to upload chunk")


@router.post(
    "/{upload_id}/commit",
    response_model=UploadCommitResponse,
    status_code=status.HTTP_200_OK,
    summary="Commit upload",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error or checksum mismatch"},
        404: {"model": ErrorResponse, "description": "Upload session not found"},
    },
)
async def commit_upload(
    workspace_id: Annotated[UUID, WorkspaceAccessDep],
    upload_id: UUID,
    current_user: CurrentUserDep,
    file: Optional[UploadFile] = File(None),
    sha256: str = Form(..., min_length=64, max_length=64, description="SHA256 checksum for verification"),
    etag: Optional[str] = Form(None, description="ETag from storage (optional)"),
    client_metadata: Optional[str] = Form(None, description="JSON string of client metadata"),  # FastAPI Form doesn't support dict directly easily without parsing
) -> UploadCommitResponse:
    """Commit upload: verify checksum, process, encrypt, and store.

    This endpoint:
    1. Checks if upload is already committed (idempotent).
    2. If not, and file provided, commits it (legacy/fallback).
    """
    upload_service = get_upload_service()

    # Parse metadata if provided
    metadata_dict = None
    if client_metadata:
        import json
        try:
            metadata_dict = json.loads(client_metadata)
        except Exception:
            pass

    try:
        # Read file data if provided
        file_data = await file.read() if file else None

        # Process or verify commit
        result = await upload_service.process_proxy_upload(
            workspace_id=workspace_id,
            upload_id=upload_id,
            file_data=file_data,
            sha256=sha256,
            client_metadata=metadata_dict,
        )

        # T039: After commit, create asset_analysis record and queue content detection job
        # This is wrapped separately so analysis failures don't fail the upload
        try:
            content_detection_service = get_content_detection_service()
            asset_id = result["asset_id"]

            # Queue content detection (handles deduplication and tag inheritance)
            job_id = await content_detection_service.queue_detection(
                asset_id=asset_id,
                workspace_id=workspace_id,
            )

            # Update response to indicate analysis was queued
            result["analysis_queued"] = job_id is not None
        except Exception as analysis_error:
            # Log but don't fail the upload - analysis can be retried later
            logger.warning(
                f"Content detection queuing failed for asset {result.get('asset_id')}: {analysis_error}"
            )
            result["analysis_queued"] = False

        return UploadCommitResponse(**result)
    except UploadError as e:
        if e.status == 400:
            raise ValidationAppError(str(e), "file")
        elif e.status == 404:
            raise NotFoundError("Upload session", upload_id)
        else:
            raise InternalError(str(e))
    except Exception as e:
        logger.exception("Failed to commit upload")
        raise InternalError("Failed to commit upload")


@router.post(
    "/{upload_id}/commit-chunked",
    response_model=UploadCommitResponse,
    status_code=status.HTTP_200_OK,
    summary="Commit chunked upload (streaming)",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        404: {"model": ErrorResponse, "description": "Upload session not found"},
    },
)
async def commit_chunked_upload(
    workspace_id: Annotated[UUID, WorkspaceAccessDep],
    upload_id: UUID,
    current_user: CurrentUserDep,
    total_size: int = Form(..., gt=0, description="Total file size in bytes"),
    sha256: str = Form(..., min_length=64, max_length=64, description="SHA256 checksum"),
    client_metadata: Optional[str] = Form(None, description="JSON string of client metadata"),
) -> UploadCommitResponse:
    """Commit a chunked upload using streaming encryption and multipart storage.

    This endpoint is used for large files (> 10MB) that were uploaded in chunks
    via PATCH /{upload_id}/chunk endpoints.

    The streaming pipeline:
    1. Streams chunks from Redis (no full file in memory)
    2. Encrypts using AES-256-CTR + HMAC (streamable)
    3. Uploads to R2 using multipart upload (5MB parts)

    Memory usage is bounded to ~15MB regardless of file size.
    """
    upload_service = get_upload_service()

    # Parse metadata if provided
    metadata_dict = None
    if client_metadata:
        import json
        try:
            metadata_dict = json.loads(client_metadata)
        except Exception:
            pass

    try:
        # Use the streaming pipeline for large files
        result = await upload_service.process_large_upload(
            workspace_id=workspace_id,
            upload_id=upload_id,
            total_size=total_size,
            client_metadata=metadata_dict,
        )

        return UploadCommitResponse(**result)
    except UploadError as e:
        if e.status == 400:
            raise ValidationAppError(str(e), "file")
        elif e.status == 404:
            raise NotFoundError("Upload session", upload_id)
        else:
            raise InternalError(str(e))
    except Exception as e:
        logger.exception("Failed to commit chunked upload")
        raise InternalError("Failed to commit chunked upload")


@router.post(
    "/check-duplicate",
    response_model=CheckDuplicateResponse,
    status_code=status.HTTP_200_OK,
    summary="Check for duplicate assets",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def check_duplicate(
    workspace_id: Annotated[UUID, WorkspaceAccessDep],
    current_user: CurrentUserDep,
    request: CheckDuplicateRequest,
) -> CheckDuplicateResponse:
    """Check if an asset with the same SHA256 checksum already exists.
    
    Returns list of duplicate assets if found.
    """
    from app.db.postgres import get_postgres_pool
    from app.services.signed_url_service import get_signed_url_service

    pool = await get_postgres_pool()
    signed_url_service = get_signed_url_service()

    try:
        async with pool.acquire() as conn:
            # Build query to find duplicates
            # Extract filename from original_object_key
            query = """
                SELECT
                    a.asset_id,
                    a.workspace_id,
                    a.original_object_key,
                    a.mime_type,
                    a.original_bytes as size_bytes,
                    a.created_at,
                    ga.gallery_id
                FROM assets a
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.workspace_id = $1
                  AND a.sha256 = $2
                  AND a.status != 'deleted'
            """
            params = [workspace_id, request.sha256]

            # Optionally filter by gallery
            if request.gallery_id:
                query += " AND ga.gallery_id = $3"
                params.append(request.gallery_id)

            query += " ORDER BY a.created_at DESC LIMIT 10"

            rows = await conn.fetch(query, *params)

            if not rows:
                return CheckDuplicateResponse(is_duplicate=False, duplicates=[])

            # Build duplicate list with signed URLs for thumbnails
            duplicates = []
            for row in rows:
                asset_id = row["asset_id"]
                
                # Extract filename from original_object_key
                original_object_key = row["original_object_key"] or ""
                file_name = original_object_key.split("/")[-1] if original_object_key else f"{asset_id}.enc"
                # Remove .enc extension if present
                if file_name.endswith(".enc"):
                    file_name = file_name[:-4]
                
                try:
                    # Generate signed URL for thumbnail
                    thumbnail_url = signed_url_service.generate_signed_url(
                        workspace_id=workspace_id,
                        asset_id=asset_id,
                        variant="thumbnail",
                        download=False,
                    )["url"]
                except Exception as e:
                    logger.warning(f"Failed to generate thumbnail URL for asset {asset_id}: {e}")
                    thumbnail_url = None

                duplicates.append(
                    DuplicateAssetResponse(
                        asset_id=asset_id,
                        workspace_id=row["workspace_id"],
                        gallery_id=row["gallery_id"],
                        file_name=file_name,
                        mime_type=row["mime_type"],
                        size_bytes=row["size_bytes"],
                        created_at=row["created_at"].isoformat() if row["created_at"] else "",
                        thumbnail_url=thumbnail_url,
                    )
                )

            return CheckDuplicateResponse(is_duplicate=True, duplicates=duplicates)

    except Exception as e:
        logger.exception("Failed to check for duplicates")
        raise InternalError("Failed to check for duplicates") from e

