"""ImageProcessingService: Generate WebP thumbnails and previews using Pillow (open-source).

Generates optimized WebP variants for gallery display.
"""

from __future__ import annotations

import io
import logging
from typing import Optional, Tuple
from uuid import UUID

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# Image processing constants
THUMBNAIL_MAX_DIMENSION = 512
THUMBNAIL_QUALITY = 80
PREVIEW_MAX_DIMENSION = 2048
PREVIEW_QUALITY = 85


class ImageProcessingError(Exception):
    """Base image processing error."""

    def __init__(self, message: str, code: str = "IMAGE_PROCESSING_ERROR"):
        super().__init__(message)
        self.code = code


class ImageProcessingService:
    """Service for image processing and variant generation."""

    def generate_thumbnail(
        self, image_data: bytes, workspace_id: UUID
    ) -> Tuple[bytes, int, int]:
        """Generate WebP thumbnail (512px max dimension, quality 80).

        Args:
            image_data: Original image bytes
            workspace_id: Workspace UUID (for logging)

        Returns:
            Tuple of (thumbnail_bytes, width, height)

        Raises:
            ImageProcessingError: If processing fails
        """
        try:
            # Open image
            image = Image.open(io.BytesIO(image_data))

            # Auto-rotate based on EXIF orientation
            image = ImageOps.exif_transpose(image)

            # Calculate thumbnail size (preserve aspect ratio)
            width, height = image.size
            if width > height:
                new_width = THUMBNAIL_MAX_DIMENSION
                new_height = int(height * (THUMBNAIL_MAX_DIMENSION / width))
            else:
                new_height = THUMBNAIL_MAX_DIMENSION
                new_width = int(width * (THUMBNAIL_MAX_DIMENSION / height))

            # Resize with high-quality resampling
            thumbnail = image.resize(
                (new_width, new_height), Image.Resampling.LANCZOS
            )

            # Convert to RGB if necessary (for WebP)
            if thumbnail.mode in ("RGBA", "LA", "P"):
                # Create white background for transparency
                rgb_image = Image.new("RGB", thumbnail.size, (255, 255, 255))
                if thumbnail.mode == "P":
                    thumbnail = thumbnail.convert("RGBA")
                rgb_image.paste(thumbnail, mask=thumbnail.split()[-1] if thumbnail.mode == "RGBA" else None)
                thumbnail = rgb_image
            elif thumbnail.mode != "RGB":
                thumbnail = thumbnail.convert("RGB")

            # Save as WebP
            output = io.BytesIO()
            thumbnail.save(
                output,
                format="WEBP",
                quality=THUMBNAIL_QUALITY,
                method=6,  # Best quality compression
            )
            thumbnail_bytes = output.getvalue()

            logger.debug(
                f"Generated thumbnail: {new_width}x{new_height} "
                f"(workspace={workspace_id}, original={width}x{height})"
            )

            return thumbnail_bytes, new_width, new_height

        except Exception as e:
            logger.error(f"Failed to generate thumbnail: {e}")
            raise ImageProcessingError(
                f"Thumbnail generation failed: {e}", "THUMBNAIL_FAILED"
            ) from e

    def generate_preview(
        self, image_data: bytes, workspace_id: UUID
    ) -> Tuple[bytes, int, int]:
        """Generate WebP preview (2048px max dimension, quality 85).

        Args:
            image_data: Original image bytes
            workspace_id: Workspace UUID (for logging)

        Returns:
            Tuple of (preview_bytes, width, height)

        Raises:
            ImageProcessingError: If processing fails
        """
        try:
            # Open image
            image = Image.open(io.BytesIO(image_data))

            # Auto-rotate based on EXIF orientation
            image = ImageOps.exif_transpose(image)

            # Calculate preview size (preserve aspect ratio)
            width, height = image.size
            if width <= PREVIEW_MAX_DIMENSION and height <= PREVIEW_MAX_DIMENSION:
                # Image is already small enough, just convert to WebP
                preview = image
                new_width, new_height = width, height
            else:
                if width > height:
                    new_width = PREVIEW_MAX_DIMENSION
                    new_height = int(height * (PREVIEW_MAX_DIMENSION / width))
                else:
                    new_height = PREVIEW_MAX_DIMENSION
                    new_width = int(width * (PREVIEW_MAX_DIMENSION / height))

                # Resize with high-quality resampling
                preview = image.resize(
                    (new_width, new_height), Image.Resampling.LANCZOS
                )

            # Convert to RGB if necessary (for WebP)
            if preview.mode in ("RGBA", "LA", "P"):
                # Create white background for transparency
                rgb_image = Image.new("RGB", preview.size, (255, 255, 255))
                if preview.mode == "P":
                    preview = preview.convert("RGBA")
                rgb_image.paste(
                    preview, mask=preview.split()[-1] if preview.mode == "RGBA" else None
                )
                preview = rgb_image
            elif preview.mode != "RGB":
                preview = preview.convert("RGB")

            # Save as WebP
            output = io.BytesIO()
            preview.save(
                output,
                format="WEBP",
                quality=PREVIEW_QUALITY,
                method=6,  # Best quality compression
            )
            preview_bytes = output.getvalue()

            logger.debug(
                f"Generated preview: {new_width}x{new_height} "
                f"(workspace={workspace_id}, original={width}x{height})"
            )

            return preview_bytes, new_width, new_height

        except Exception as e:
            logger.error(f"Failed to generate preview: {e}")
            raise ImageProcessingError(
                f"Preview generation failed: {e}", "PREVIEW_FAILED"
            ) from e

    def get_image_dimensions(self, image_data: bytes) -> Tuple[int, int]:
        """Get image dimensions without full processing.

        Args:
            image_data: Image file bytes

        Returns:
            Tuple of (width, height)

        Raises:
            ImageProcessingError: If reading fails
        """
        try:
            image = Image.open(io.BytesIO(image_data))
            # Apply EXIF orientation to get actual dimensions
            image = ImageOps.exif_transpose(image)
            return image.size
        except Exception as e:
            raise ImageProcessingError(
                f"Failed to read image dimensions: {e}", "DIMENSION_READ_FAILED"
            ) from e


# Export singleton instance
_image_processing_service: Optional[ImageProcessingService] = None


def get_image_processing_service() -> ImageProcessingService:
    """Get singleton image processing service instance."""
    global _image_processing_service
    if _image_processing_service is None:
        _image_processing_service = ImageProcessingService()
    return _image_processing_service

