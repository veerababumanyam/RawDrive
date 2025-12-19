"""Upload API endpoints.

Handles secure file uploads with encryption and processing.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Request

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import (
    CreateUploadSessionRequest,
    CommitUploadRequest,
    UploadSessionResponse,
    UploadCommitResponse,
    CheckDuplicateRequest,
    CheckDuplicateResponse,
    DuplicateAssetResponse,
    ErrorResponse,
)
from app.services.upload_service import UploadError, get_upload_service

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
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )
    except Exception as e:
        logger.exception("Failed to create upload session")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to create upload session"},
        )


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
    workspace_id: Annotated[UUID, WorkspaceAccessDep],
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
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )
    except Exception as e:
        logger.exception("Failed to upload file")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to upload file"},
        )


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
) -> UploadCommitResponse:
    """Commit upload: verify checksum, process, encrypt, and store.

    This endpoint:
    1. Checks if upload is already committed (idempotent).
    2. If not, and file provided, commits it (legacy/fallback).
    """
    upload_service = get_upload_service()

    try:
        # Read file data if provided
        file_data = await file.read() if file else None

        # Process or verify commit
        result = await upload_service.process_proxy_upload(
            workspace_id=workspace_id,
            upload_id=upload_id,
            file_data=file_data,
            sha256=sha256,
        )

        return UploadCommitResponse(**result)
    except UploadError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )
    except Exception as e:
        logger.exception("Failed to commit upload")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to commit upload"},
        )


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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to check for duplicates"},
        ) from e

