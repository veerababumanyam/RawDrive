"""Face Thumbnail Service for generating face crop thumbnails.

This module provides the FaceThumbnailService class that handles:
- Cropping face regions from photos using bounding box coordinates
- Generating thumbnails at multiple sizes (64px, 128px, 256px)
- Uploading thumbnails to R2 storage
- Deleting thumbnails when faces are removed

Requirements: 11.1, 11.2, 11.3, 11.5, 11.6
"""

from __future__ import annotations

import io
import logging
from typing import Any, Optional
from uuid import UUID

from PIL import Image

from app.services.r2_storage_service import R2StorageService, get_r2_storage_service


logger = logging.getLogger(__name__)


# Thumbnail sizes (in pixels)
THUMBNAIL_SIZES = {
    "small": 64,
    "medium": 128,
    "large": 256,
}

# Padding around face as percentage of bounding box dimensions
FACE_PADDING = 0.15  # 15% padding on each side

# Output format for thumbnails
THUMBNAIL_FORMAT = "JPEG"
THUMBNAIL_QUALITY = 85


class FaceThumbnailService:
    """Service for generating and managing face thumbnails.
    
    This service handles cropping face regions from photos and generating
    thumbnails at multiple sizes for different display contexts:
    - small (64px): Compact list views, avatars
    - medium (128px): Grid views, selection UI
    - large (256px): Detail views, face comparison
    
    Thumbnails are stored in R2 storage with a consistent URL pattern
    for easy retrieval.
    """
    
    def __init__(
        self,
        storage_service: Optional[R2StorageService] = None,
    ):
        """Initialize the thumbnail service.
        
        Args:
            storage_service: R2 storage service for uploading thumbnails
        """
        self._storage_service = storage_service
    
    @property
    def storage_service(self) -> R2StorageService:
        """Lazy load storage service."""
        if self._storage_service is None:
            self._storage_service = get_r2_storage_service()
        return self._storage_service
    
    # =========================================================================
    # THUMBNAIL GENERATION
    # =========================================================================
    
    def crop_face_region(
        self,
        image_buffer: bytes,
        bounding_box: dict[str, float],
        add_padding: bool = True,
    ) -> bytes:
        """Crop the face region from an image.
        
        Args:
            image_buffer: Raw image data as bytes
            bounding_box: Face location as {x, y, width, height} percentages
            add_padding: If True, add padding around the face
            
        Returns:
            Cropped face region as JPEG bytes
        """
        # Open image
        image = Image.open(io.BytesIO(image_buffer))
        img_width, img_height = image.size
        
        # Convert percentage coordinates to pixels
        x = bounding_box["x"] / 100 * img_width
        y = bounding_box["y"] / 100 * img_height
        width = bounding_box["width"] / 100 * img_width
        height = bounding_box["height"] / 100 * img_height
        
        # Add padding if requested
        if add_padding:
            pad_x = width * FACE_PADDING
            pad_y = height * FACE_PADDING
            x = max(0, x - pad_x)
            y = max(0, y - pad_y)
            width = min(img_width - x, width + 2 * pad_x)
            height = min(img_height - y, height + 2 * pad_y)
        
        # Ensure valid crop region
        x = max(0, min(x, img_width - 1))
        y = max(0, min(y, img_height - 1))
        right = min(x + width, img_width)
        bottom = min(y + height, img_height)
        
        # Crop the face region
        face_crop = image.crop((int(x), int(y), int(right), int(bottom)))
        
        # Convert to RGB if necessary (for JPEG output)
        if face_crop.mode != "RGB":
            face_crop = face_crop.convert("RGB")
        
        # Save to bytes
        output = io.BytesIO()
        face_crop.save(output, format=THUMBNAIL_FORMAT, quality=THUMBNAIL_QUALITY)
        return output.getvalue()
    
    def generate_thumbnail(
        self,
        face_crop: bytes,
        size: int,
    ) -> bytes:
        """Generate a thumbnail at the specified size.
        
        The thumbnail is resized to fit within a square of the given size
        while maintaining aspect ratio, then centered in a square canvas.
        
        Args:
            face_crop: Cropped face image as bytes
            size: Target size in pixels
            
        Returns:
            Thumbnail image as JPEG bytes
        """
        # Open the face crop
        image = Image.open(io.BytesIO(face_crop))
        
        # Calculate resize dimensions maintaining aspect ratio
        aspect = image.width / image.height
        if aspect > 1:
            # Wider than tall
            new_width = size
            new_height = int(size / aspect)
        else:
            # Taller than wide
            new_height = size
            new_width = int(size * aspect)
        
        # Resize with high-quality resampling
        resized = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Create square canvas and paste centered image
        canvas = Image.new("RGB", (size, size), (245, 245, 245))  # Light gray bg
        paste_x = (size - new_width) // 2
        paste_y = (size - new_height) // 2
        canvas.paste(resized, (paste_x, paste_y))
        
        # Save to bytes
        output = io.BytesIO()
        canvas.save(output, format=THUMBNAIL_FORMAT, quality=THUMBNAIL_QUALITY)
        return output.getvalue()
    
    def generate_all_sizes(
        self,
        face_crop: bytes,
    ) -> dict[str, bytes]:
        """Generate thumbnails at all standard sizes.
        
        Args:
            face_crop: Cropped face image as bytes
            
        Returns:
            Dict mapping size name to thumbnail bytes
        """
        thumbnails = {}
        for name, size in THUMBNAIL_SIZES.items():
            thumbnails[name] = self.generate_thumbnail(face_crop, size)
        return thumbnails
    
    # =========================================================================
    # STORAGE OPERATIONS
    # =========================================================================
    
    async def create_and_upload_thumbnails(
        self,
        face_id: UUID,
        workspace_id: UUID,
        image_buffer: bytes,
        bounding_box: dict[str, float],
    ) -> dict[str, str]:
        """Generate and upload all thumbnail sizes for a face.
        
        Args:
            face_id: Unique face identifier
            workspace_id: Workspace for storage path
            image_buffer: Source photo as bytes
            bounding_box: Face location as percentages
            
        Returns:
            Dict mapping size name to uploaded URL
        """
        logger.debug(
            "Generating thumbnails for face",
            extra={"face_id": str(face_id)},
        )
        
        # Crop the face region
        try:
            face_crop = self.crop_face_region(image_buffer, bounding_box)
        except Exception as e:
            logger.warning(
                "Failed to crop face region",
                extra={"face_id": str(face_id), "error": str(e)},
            )
            return {}
        
        # Generate all thumbnail sizes
        thumbnails = self.generate_all_sizes(face_crop)
        
        # Upload to storage
        urls = {}
        for size_name, thumbnail_bytes in thumbnails.items():
            try:
                key = self._get_thumbnail_key(face_id, workspace_id, size_name)
                url = await self.storage_service.upload_bytes(
                    key=key,
                    data=thumbnail_bytes,
                    content_type="image/jpeg",
                )
                urls[size_name] = url
            except Exception as e:
                logger.warning(
                    "Failed to upload thumbnail",
                    extra={
                        "face_id": str(face_id),
                        "size": size_name,
                        "error": str(e),
                    },
                )
        
        logger.info(
            "Face thumbnails created",
            extra={
                "face_id": str(face_id),
                "sizes_uploaded": list(urls.keys()),
            },
        )
        
        return urls
    
    async def delete_thumbnails(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Delete all thumbnails for a face.
        
        Args:
            face_id: Face identifier
            workspace_id: Workspace for storage path
            
        Returns:
            Number of thumbnails deleted
        """
        deleted_count = 0
        for size_name in THUMBNAIL_SIZES:
            try:
                key = self._get_thumbnail_key(face_id, workspace_id, size_name)
                await self.storage_service.delete_object(key)
                deleted_count += 1
            except Exception as e:
                logger.debug(
                    "Thumbnail not found or delete failed",
                    extra={
                        "face_id": str(face_id),
                        "size": size_name,
                        "error": str(e),
                    },
                )
        
        if deleted_count > 0:
            logger.info(
                "Face thumbnails deleted",
                extra={
                    "face_id": str(face_id),
                    "deleted_count": deleted_count,
                },
            )
        
        return deleted_count
    
    async def delete_thumbnails_bulk(
        self,
        face_ids: list[UUID],
        workspace_id: UUID,
    ) -> int:
        """Delete thumbnails for multiple faces.
        
        Args:
            face_ids: List of face identifiers
            workspace_id: Workspace for storage path
            
        Returns:
            Total thumbnails deleted
        """
        total_deleted = 0
        for face_id in face_ids:
            count = await self.delete_thumbnails(face_id, workspace_id)
            total_deleted += count
        return total_deleted
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    def _get_thumbnail_key(
        self,
        face_id: UUID,
        workspace_id: UUID,
        size_name: str,
    ) -> str:
        """Generate storage key for a face thumbnail.
        
        Key format: workspaces/{workspace_id}/faces/{face_id}/{size}.jpg
        """
        return f"workspaces/{workspace_id}/faces/{face_id}/{size_name}.jpg"
    
    def get_thumbnail_url(
        self,
        face_id: UUID,
        workspace_id: UUID,
        size_name: str = "medium",
    ) -> str:
        """Get the expected URL for a face thumbnail.
        
        Args:
            face_id: Face identifier
            workspace_id: Workspace ID
            size_name: Thumbnail size (small, medium, large)
            
        Returns:
            Expected storage URL
        """
        key = self._get_thumbnail_key(face_id, workspace_id, size_name)
        return self.storage_service.get_public_url(key)


# Singleton instance
_service: Optional[FaceThumbnailService] = None


def get_face_thumbnail_service() -> FaceThumbnailService:
    """Get singleton service instance."""
    global _service
    if _service is None:
        _service = FaceThumbnailService()
    return _service
