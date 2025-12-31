"""InvitationImageService: Handle invitation image processing and OG optimization.

This service provides:
- Cover image OG variant generation (1200x630px)
- Image upload and variant management
- Integration with R2 storage service

Open Graph images are optimized for social sharing on WhatsApp, Facebook, Twitter, etc.

Feature: 016-save-the-date (Phase 8: WhatsApp-Optimized Sharing)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional, Tuple
from uuid import UUID

from app.services.image_processing_service import (
    ImageProcessingService,
    get_image_processing_service,
)
from app.services.r2_storage_service import (
    R2StorageService,
    StorageError,
    get_r2_storage_service,
)

logger = logging.getLogger(__name__)


# Storage path patterns
OG_IMAGE_PATH = "workspaces/{workspace_id}/invitations/{invitation_id}/images/og/{filename}"
THUMBNAIL_PATH = "workspaces/{workspace_id}/invitations/{invitation_id}/images/thumbnail/{filename}"


class InvitationImageService:
    """Service for invitation image processing and OG optimization.

    This service handles:
    - Generating OG-optimized images (1200x630px) for social sharing
    - Uploading image variants to R2 storage
    - Generating presigned URLs for image access
    """

    def __init__(
        self,
        storage_service: Optional[R2StorageService] = None,
        image_processor: Optional[ImageProcessingService] = None,
    ):
        """Initialize the invitation image service.

        Args:
            storage_service: R2 storage service (lazy-loaded if not provided)
            image_processor: Image processing service (lazy-loaded if not provided)
        """
        self._storage_service = storage_service
        self._image_processor = image_processor

    @property
    def storage_service(self) -> R2StorageService:
        """Lazy load storage service."""
        if self._storage_service is None:
            self._storage_service = get_r2_storage_service()
        return self._storage_service

    @property
    def image_processor(self) -> ImageProcessingService:
        """Lazy load image processing service."""
        if self._image_processor is None:
            self._image_processor = get_image_processing_service()
        return self._image_processor

    # =========================================================================
    # OG IMAGE GENERATION
    # =========================================================================

    async def generate_og_image(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        image_data: bytes,
        filename: str,
    ) -> Tuple[str, str]:
        """Generate OG-optimized image (1200x630px) for social sharing.

        Creates a center-cropped, 1200x630px JPEG image optimized for
        Open Graph and Twitter Card meta tags.

        Args:
            workspace_id: Workspace UUID for storage path
            invitation_id: Invitation UUID for storage path
            image_data: Source image bytes
            filename: Original filename (used to derive OG filename)

        Returns:
            Tuple of (og_object_key, og_presigned_url)

        Raises:
            StorageError: If upload fails
        """
        try:
            # Generate OG-optimized image (1200x630px)
            og_bytes, width, height = self.image_processor.generate_og_image(
                image_data=image_data,
                workspace_id=workspace_id,
                output_format="JPEG",  # JPEG for maximum compatibility
            )

            # Build storage key
            base_name = filename.rsplit(".", 1)[0] if "." in filename else filename
            og_filename = f"{base_name}_og.jpg"

            og_key = OG_IMAGE_PATH.format(
                workspace_id=str(workspace_id),
                invitation_id=str(invitation_id),
                filename=og_filename,
            )

            # Upload to R2
            await self.storage_service.upload_bytes(
                key=og_key,
                data=og_bytes,
                content_type="image/jpeg",
            )

            # Generate presigned URL (long expiry for social media crawlers)
            og_url = await self._generate_presigned_url(og_key, expiry_seconds=86400 * 7)  # 7 days

            logger.info(
                "Generated OG image for invitation",
                extra={
                    "workspace_id": str(workspace_id),
                    "invitation_id": str(invitation_id),
                    "og_key": og_key,
                    "dimensions": f"{width}x{height}",
                },
            )

            return og_key, og_url

        except Exception as e:
            logger.error(
                "Failed to generate OG image",
                extra={
                    "workspace_id": str(workspace_id),
                    "invitation_id": str(invitation_id),
                    "error": str(e),
                },
            )
            raise StorageError(f"OG image generation failed: {e}", "OG_GENERATION_FAILED") from e

    async def process_cover_image(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        image_data: bytes,
        filename: str,
    ) -> dict[str, str]:
        """Process cover image and generate all variants (OG, thumbnail).

        This is the main entry point for processing invitation cover images.
        It generates:
        - OG image (1200x630px) for social sharing
        - Thumbnail (512px max) for previews

        Args:
            workspace_id: Workspace UUID
            invitation_id: Invitation UUID
            image_data: Source image bytes
            filename: Original filename

        Returns:
            Dict with keys: og_object_key, og_url, thumbnail_object_key, thumbnail_url
        """
        result = {}

        # Generate OG image (1200x630px for social sharing)
        try:
            og_key, og_url = await self.generate_og_image(
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                image_data=image_data,
                filename=filename,
            )
            result["og_object_key"] = og_key
            result["og_url"] = og_url
        except Exception as e:
            logger.warning(
                "Failed to generate OG image, continuing without",
                extra={"error": str(e)},
            )

        # Generate thumbnail (512px max)
        try:
            thumb_bytes, width, height = self.image_processor.generate_thumbnail(
                image_data=image_data,
                workspace_id=workspace_id,
            )

            base_name = filename.rsplit(".", 1)[0] if "." in filename else filename
            thumb_filename = f"{base_name}_thumb.webp"

            thumb_key = THUMBNAIL_PATH.format(
                workspace_id=str(workspace_id),
                invitation_id=str(invitation_id),
                filename=thumb_filename,
            )

            await self.storage_service.upload_bytes(
                key=thumb_key,
                data=thumb_bytes,
                content_type="image/webp",
            )

            thumb_url = await self._generate_presigned_url(thumb_key, expiry_seconds=3600)
            result["thumbnail_object_key"] = thumb_key
            result["thumbnail_url"] = thumb_url
        except Exception as e:
            logger.warning(
                "Failed to generate thumbnail, continuing without",
                extra={"error": str(e)},
            )

        return result

    async def refresh_og_url(
        self,
        og_object_key: str,
        expiry_seconds: int = 86400 * 7,
    ) -> str:
        """Refresh the presigned URL for an OG image.

        OG URLs have long expiry (7 days by default) but may need refreshing
        for long-lived invitations.

        Args:
            og_object_key: R2 object key for the OG image
            expiry_seconds: URL expiry time in seconds (default: 7 days)

        Returns:
            New presigned URL
        """
        return await self._generate_presigned_url(og_object_key, expiry_seconds)

    async def delete_og_image(
        self,
        og_object_key: str,
    ) -> bool:
        """Delete an OG image from storage.

        Args:
            og_object_key: R2 object key to delete

        Returns:
            True if deleted, False if not found
        """
        try:
            await self.storage_service.delete_object(og_object_key)
            return True
        except Exception as e:
            logger.warning(
                "Failed to delete OG image",
                extra={"og_object_key": og_object_key, "error": str(e)},
            )
            return False

    # =========================================================================
    # PRIVATE METHODS
    # =========================================================================

    async def _generate_presigned_url(
        self,
        object_key: str,
        expiry_seconds: int = 3600,
    ) -> str:
        """Generate a presigned URL for an object.

        Args:
            object_key: R2 object key
            expiry_seconds: URL expiry time in seconds

        Returns:
            Presigned URL
        """
        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            self.storage_service.executor,
            lambda: self.storage_service.s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.storage_service.bucket_name,
                    "Key": object_key,
                },
                ExpiresIn=expiry_seconds,
            ),
        )
        return url


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

_invitation_image_service: Optional[InvitationImageService] = None


def get_invitation_image_service() -> InvitationImageService:
    """Get singleton invitation image service instance."""
    global _invitation_image_service
    if _invitation_image_service is None:
        _invitation_image_service = InvitationImageService()
    return _invitation_image_service
