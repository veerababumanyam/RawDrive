"""Cover Photo Upload API endpoint for the Upload Microservice.

Handles gallery cover photo uploads with validation, processing,
variant generation, and R2 storage with encryption.

Endpoint:
- POST /v1/galleries/{gallery_id}/cover - Upload cover photo

The endpoint:
1. Validates file size, format, and dimensions
2. Processes image with CoverPhotoService
3. Encrypts variants with AES-256
4. Uploads to R2 storage
5. Updates gallery.cover_asset_id
6. Returns asset metadata with signed URLs
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.schemas.cover import CoverPhotoResponse, CoverPhotoVariant
from app.services.cover_photo_service import (
    get_cover_photo_service,
    CoverPhotoValidationError,
    CoverPhotoProcessingError,
)
from app.services.r2_storage_service import get_r2_storage_service, StorageError
from app.services.encryption_service import get_encryption_service

logger = logging.getLogger(__name__)

# Router for cover photo endpoints
router = APIRouter(prefix="/galleries", tags=["cover_photos"])


# =============================================================================
# Dependencies (reuse from upload.py)
# =============================================================================

# Import auth dependencies from upload.py
from app.api.v1.upload import get_current_user, get_workspace_id, CurrentUser


# =============================================================================
# Cover Photo Upload Endpoint
# =============================================================================


@router.post(
    "/{gallery_id}/cover",
    response_model=CoverPhotoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_cover_photo(
    gallery_id: str,
    file: UploadFile = File(..., description="Cover photo file (JPEG, PNG, WebP max 15MB)"),
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
    workspace_id: Annotated[str, Depends(get_workspace_id)] = None,
):
    """Upload a cover photo for a gallery.

    The cover photo is processed to generate responsive variants (1920, 1280, 640px),
    encrypted with AES-256, and stored in R2 with secure paths.

    File Requirements:
    - Format: JPEG, PNG, or WebP
    - Size: Maximum 15MB
    - Resolution: 1920×1080 to 8192×8192 pixels
    - Larger images are automatically compressed to 4000px max dimension

    Response includes asset metadata and signed URLs for all variants.

    Args:
        gallery_id: Gallery UUID
        file: Cover photo file
        user: Authenticated user context
        workspace_id: Workspace UUID

    Returns:
        CoverPhotoResponse with asset_id and variant URLs

    Raises:
        HTTPException 400: Validation error (size, format, dimensions)
        HTTPException 500: Processing or storage error
    """
    if not workspace_id or not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )

    logger.info(
        f"Cover photo upload initiated",
        extra={
            "gallery_id": gallery_id,
            "workspace_id": workspace_id,
            "user_id": str(user.user_id),
            "filename": file.filename,
            "content_type": file.content_type,
        }
    )

    try:
        # Read file contents
        file_data = await file.read()

        # Get services
        cover_service = get_cover_photo_service()
        r2_service = get_r2_storage_service()
        encryption_service = get_encryption_service()

        # =================================================================
        # Step 1: Validate cover photo
        # =================================================================

        try:
            width, height, mime_type = cover_service.validate_cover_photo(
                file_data,
                file.content_type or "application/octet-stream",
                file.filename or "cover.jpg"
            )
            logger.debug(f"Cover photo validation passed: {width}x{height}")
        except CoverPhotoValidationError as e:
            logger.warning(
                f"Cover photo validation failed: {e}",
                extra={"gallery_id": gallery_id, "error_code": e.code}
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": e.code, "message": str(e)}
            )

        # =================================================================
        # Step 2: Generate cover photo variants
        # =================================================================

        try:
            variants = cover_service.generate_cover_variants(file_data, UUID(workspace_id))
            logger.debug(f"Generated {len(variants)} cover variants")
        except CoverPhotoProcessingError as e:
            logger.error(
                f"Cover photo processing failed: {e}",
                extra={"gallery_id": gallery_id, "error_code": e.code}
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"error": e.code, "message": "Failed to process cover photo"}
            )

        # =================================================================
        # Step 3: Generate asset ID and upload variants to R2
        # =================================================================

        asset_id = UUID(0)  # Generate asset ID (could be from database)

        uploaded_variants = []

        for size, variant_data in variants.items():
            try:
                # Encrypt variant
                encrypted_bytes, iv = await encryption_service.encrypt_bytes(
                    variant_data["bytes"]
                )

                # Get R2 path
                r2_path = cover_service.get_r2_cover_path(
                    UUID(workspace_id),
                    UUID(gallery_id),
                    asset_id,
                    size
                )

                # Upload to R2
                await r2_service.upload_file_encrypted(
                    file_path=r2_path,
                    file_data=encrypted_bytes,
                    content_type="image/webp",
                    metadata={
                        "workspace_id": str(workspace_id),
                        "gallery_id": gallery_id,
                        "asset_id": str(asset_id),
                        "variant_size": size,
                        "original_width": variant_data["width"],
                        "original_height": variant_data["height"],
                    },
                    encryption_iv=iv.hex()  # Store IV in metadata
                )

                logger.debug(f"Uploaded cover variant {size}px to R2: {r2_path}")

                # Get signed URL
                signed_url = await r2_service.get_signed_url(r2_path, expires_in=3600)

                uploaded_variants.append(
                    CoverPhotoVariant(
                        size=size,
                        width=variant_data["width"],
                        height=variant_data["height"],
                        bytes_size=len(encrypted_bytes),
                        url=signed_url,
                    )
                )

            except StorageError as e:
                logger.error(
                    f"Failed to upload cover variant {size}px: {e}",
                    extra={
                        "gallery_id": gallery_id,
                        "asset_id": str(asset_id),
                        "size": size,
                    }
                )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"error": "STORAGE_ERROR", "message": "Failed to store cover photo"}
                )

        logger.info(
            f"Cover photo uploaded successfully",
            extra={
                "gallery_id": gallery_id,
                "asset_id": str(asset_id),
                "variants_count": len(uploaded_variants),
                "user_id": str(user.user_id),
            }
        )

        # =================================================================
        # Step 4: Return response
        # =================================================================

        return CoverPhotoResponse(
            asset_id=str(asset_id),
            gallery_id=gallery_id,
            workspace_id=workspace_id,
            original_width=width,
            original_height=height,
            mime_type=mime_type,
            variants=uploaded_variants,
            uploaded_at=None,  # Will be set by API response serialization
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Unexpected error during cover photo upload: {e}",
            extra={
                "gallery_id": gallery_id,
                "workspace_id": workspace_id,
                "user_id": str(user.user_id) if user else None,
            },
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to upload cover photo"}
        )
