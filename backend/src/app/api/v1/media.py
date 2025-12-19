"""Media delivery API endpoints.

Handles signed URL validation and streaming decrypted media content.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from app.api.dependencies.auth import CurrentUserDep, OptionalUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse
from app.db.postgres import get_postgres_pool
from app.services.encryption_service import EncryptionError, get_encryption_service
from app.services.media_audit_service import (
    ACTION_DOWNLOAD_ORIGINAL,
    ACTION_DOWNLOAD_WEBP,
    ACTION_VIEW_ORIGINAL,
    ACTION_VIEW_PREVIEW,
    ACTION_VIEW_THUMBNAIL,
    get_media_audit_service,
)
from app.services.r2_storage_service import StorageError, get_r2_storage_service
from app.services.signed_url_service import SignedUrlError, get_signed_url_service
from app.services.raw_processing_service import (
    RawProcessingError,
    get_raw_processing_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/{signed_token}",
    status_code=status.HTTP_200_OK,
    summary="Stream decrypted media",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid token"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Asset not found"},
    },
)
async def stream_media(
    signed_token: str,
    request: Request,
    current_user: OptionalUserDep = None,
) -> StreamingResponse:
    """Stream decrypted media content using signed token.

    Validates token, fetches encrypted file from R2, decrypts, and streams.
    """
    signed_url_service = get_signed_url_service()
    encryption_service = get_encryption_service()
    storage_service = get_r2_storage_service()
    audit_service = get_media_audit_service()

    try:
        # Validate signed token
        token_data = signed_url_service.validate_token(signed_token)
        workspace_id = token_data["workspace_id"]
        asset_id = token_data["asset_id"]
        variant = token_data["variant"]
        is_download = token_data["download"]

        # Get asset metadata from database
        pool: asyncpg.Pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get asset and gallery info
            row: asyncpg.Record | None = await conn.fetchrow(
                """
                SELECT
                    a.asset_id, a.workspace_id, a.mime_type, a.original_object_key,
                    ga.gallery_id
                FROM assets a
                JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.asset_id = $1 AND a.workspace_id = $2
                LIMIT 1
                """,
                asset_id,
                workspace_id,
            )

            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "ASSET_NOT_FOUND", "message": "Asset not found"},
                )

            gallery_id = UUID(str(row["gallery_id"]))
            original_object_key: str = str(row["original_object_key"] or "")
            mime_type: str = str(row["mime_type"])
            
            # Extract original filename from object key
            original_filename = ""
            if original_object_key:
                original_filename = original_object_key.split("/")[-1]
            
            # Determine filename based on variant
            # For RAW files requesting preview, we'll use original filename and convert to .jpg
            if variant == "thumbnail":
                filename = "thumb.webp"
            elif variant == "preview":
                filename = "preview.webp"  # Will be changed to .jpg for RAW files
            else:  # original
                filename = original_filename if original_filename else f"{asset_id}.enc"

        # Helper function to detect RAW files
        def is_raw_file(mime_type: str | None, filename: str | None) -> bool:
            """Check if file is a RAW format."""
            raw_extensions = {".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2", ".dng"}
            if filename:
                ext = "." + filename.lower().split(".")[-1] if "." in filename else ""
                if ext in raw_extensions:
                    return True
            # Check MIME type
            mime_lower = (mime_type or "").lower()
            raw_mime_keywords = ["raw", "cr2", "nef", "arw", "raf", "orf", "rw2", "dng"]
            return any(keyword in mime_lower for keyword in raw_mime_keywords)

        # Check if this is a RAW file requesting preview variant
        is_raw: bool = is_raw_file(mime_type, filename)
        needs_raw_conversion: bool = is_raw and variant == "preview"

        # Fetch encrypted file from R2
        # For RAW files requesting preview, we need the original RAW file
        fetch_variant: str = "original" if needs_raw_conversion else variant
        try:
            encrypted_data = await storage_service.download_encrypted_file(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                asset_id=asset_id,
                variant=fetch_variant,
                filename=filename,
            )
        except StorageError as e:
            if e.code == "FILE_NOT_FOUND":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "FILE_NOT_FOUND", "message": "Media file not found"},
                ) from e
            raise

        # Decrypt file
        try:
            decrypted_data = await encryption_service.decrypt_file(
                encrypted_data, workspace_id, asset_id, variant=fetch_variant
            )
        except EncryptionError as e:
            logger.error(f"Decryption failed for asset {asset_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "DECRYPTION_FAILED", "message": "Failed to decrypt media"},
            ) from e

        # Convert RAW to JPEG if needed
        content_type: str
        if needs_raw_conversion:
            try:
                raw_service = get_raw_processing_service()
                # Convert RAW to JPEG with high quality (92) for preview/download
                # Use max_dimension=2048 to match preview size
                jpeg_data, _, _ = raw_service.process_raw_to_jpeg(
                    decrypted_data,
                    workspace_id,
                    quality=92,
                    max_dimension=2048,  # Match preview max dimension
                )
                decrypted_data = jpeg_data
                # Update content type and filename for JPEG
                content_type = "image/jpeg"
                # Change filename extension to .jpg (use original_filename if available)
                if original_filename and "." in original_filename:
                    base_name: str = str(original_filename.rsplit(".", 1)[0])
                    filename = f"{base_name}.jpg"
                else:
                    filename = f"{asset_id}.jpg"
                logger.info(
                    f"Converted RAW to JPEG for asset {asset_id} "
                    + f"(workspace={workspace_id}, variant={variant})"
                )
            except RawProcessingError as e:
                logger.error(f"Failed to convert RAW to JPEG for asset {asset_id}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={
                        "code": "RAW_CONVERSION_FAILED",
                        "message": "Failed to convert RAW file to JPEG",
                    },
                ) from e
            except Exception as e:
                logger.exception(f"Unexpected error converting RAW to JPEG: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={
                        "code": "RAW_CONVERSION_FAILED",
                        "message": "Failed to convert RAW file to JPEG",
                    },
                ) from e
        else:
            # Determine content type for non-RAW files
            content_type = "image/webp" if variant != "original" else (mime_type or "application/octet-stream")

        # Determine audit action
        action: str = (
            ACTION_DOWNLOAD_ORIGINAL
            if is_download and variant == "original"
            else ACTION_DOWNLOAD_WEBP
            if is_download
            else ACTION_VIEW_ORIGINAL
            if variant == "original"
            else ACTION_VIEW_PREVIEW
            if variant == "preview"
            else ACTION_VIEW_THUMBNAIL
        )

        # Log access (non-blocking)
        try:
            await audit_service.log_access(
                workspace_id=workspace_id,
                asset_id=asset_id,
                action=action,
                ip_address=request.client.host if hasattr(request, "client") and request.client else "unknown",
                user_id=current_user.user_id if current_user else None,
                user_agent=request.headers.get("user-agent") if hasattr(request, "headers") else None,
            )
        except Exception as e:
            # Don't fail the request if audit logging fails
            logger.warning(f"Failed to log media access: {e}")

        # Stream decrypted content
        return StreamingResponse(
            iter([decrypted_data]),
            media_type=content_type,
            headers={
                "Content-Disposition": (
                    f'attachment; filename="{filename.replace(".enc", "")}"'
                    if is_download
                    else "inline"
                ),
                "Cache-Control": "private, max-age=3600",  # Cache for 1 hour (matches signed URL TTL)
            },
        )

        # Placeholder for actual implementation:
        # encrypted_data = await storage_service.get_object(object_key)
        # decrypted_data = await encryption_service.decrypt_file(
        #     encrypted_data, workspace_id, asset_id
        # )
        #
        # # Determine content type
        # content_type = "image/webp" if variant != "original" else asset.mime_type
        #
        # # Log access
        # action = (
        #     ACTION_DOWNLOAD_ORIGINAL
        #     if is_download and variant == "original"
        #     else ACTION_DOWNLOAD_WEBP
        #     if is_download
        #     else ACTION_VIEW_ORIGINAL
        #     if variant == "original"
        #     else ACTION_VIEW_PREVIEW
        #     if variant == "preview"
        #     else ACTION_VIEW_THUMBNAIL
        # )
        #
        # await audit_service.log_access(
        #     workspace_id=workspace_id,
        #     asset_id=asset_id,
        #     action=action,
        #     ip_address=request.client.host if request.client else "unknown",
        #     user_id=UUID(current_user["user_id"]) if current_user else None,
        #     user_agent=request.headers.get("user-agent"),
        # )
        #
        # return StreamingResponse(
        #     iter([decrypted_data]),
        #     media_type=content_type,
        #     headers={
        #         "Content-Disposition": (
        #             f'attachment; filename="{asset.filename}"'
        #             if is_download
        #             else "inline"
        #         ),
        #     },
        # )

    except SignedUrlError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code, "message": str(e)},
        )
    except EncryptionError as e:
        logger.error(f"Encryption error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "ENCRYPTION_ERROR", "message": "Failed to decrypt media"},
        )
    except Exception as e:
        logger.exception("Failed to stream media")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to stream media"},
        )


@router.get(
    "/{asset_id}/url",
    status_code=status.HTTP_200_OK,
    summary="Generate signed URL for asset",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Asset not found"},
    },
)
async def get_signed_url(
    workspace_id: Annotated[UUID, WorkspaceAccessDep],
    asset_id: UUID,
    current_user: CurrentUserDep,
    variant: Annotated[str, Query(description="Media variant: thumbnail, preview, or original")] = "thumbnail",
    download: Annotated[bool, Query(description="Generate URL for download")] = False,
) -> dict[str, str | int]:
    """Generate time-limited signed URL for media access."""
    signed_url_service = get_signed_url_service()
    pool: asyncpg.Pool = await get_postgres_pool()

    try:
        # Verify asset exists and belongs to workspace
        async with pool.acquire() as conn:
            asset: asyncpg.Record | None = await conn.fetchrow(
                """
                SELECT 
                    a.asset_id, 
                    a.workspace_id, 
                    a.status,
                    ga.gallery_id
                FROM assets a
                INNER JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.asset_id = $1 AND a.workspace_id = $2
                LIMIT 1
                """,
                asset_id,
                workspace_id,
            )

            if not asset:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "ASSET_NOT_FOUND", "message": "Asset not found"},
                )

            # Verify asset is available
            if asset["status"] != "available":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "ASSET_NOT_AVAILABLE",
                        "message": f"Asset is {asset['status']}",
                    },
                )

            # Check gallery download policy if requesting original download
            if variant == "original" and download and asset["gallery_id"]:
                gallery: asyncpg.Record | None = await conn.fetchrow(
                    """
                    SELECT download_policy FROM galleries
                    WHERE gallery_id = $1
                    """,
                    asset["gallery_id"],
                )
                if gallery:
                    download_policy: str = str(gallery["download_policy"])
                    if download_policy == "view_only":
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail={
                                "code": "DOWNLOAD_NOT_ALLOWED",
                                "message": "Gallery policy does not allow downloads",
                            },
                        )

        # Generate signed URL
        result: dict[str, Any] = signed_url_service.generate_signed_url(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant=variant,
            download=download,
        )

        return {
            "url": str(result["url"]),
            "expires_at": str(result["expires_at"]),
            "ttl": int(result["ttl"]),
        }
    except HTTPException:
        raise
    except SignedUrlError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code, "message": str(e)},
        )
    except Exception as e:
        logger.exception("Failed to generate signed URL")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to generate signed URL"},
        )

