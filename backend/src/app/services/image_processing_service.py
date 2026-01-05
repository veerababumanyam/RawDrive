"""ImageProcessingService: Generate WebP thumbnails and previews using Pillow (open-source).

Generates optimized WebP variants for gallery display.
"""

from __future__ import annotations

import io
import logging
from typing import Optional, Tuple
from uuid import UUID

from PIL import Image, ImageOps

# Register HEIC/HEIF support with Pillow
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    logger_init = logging.getLogger(__name__)
    logger_init.debug("HEIC/HEIF support enabled via pillow-heif")
except ImportError:
    logger_init = logging.getLogger(__name__)
    logger_init.warning("pillow-heif not installed - HEIC/HEIF images will not be supported")

logger = logging.getLogger(__name__)

# Image processing constants
THUMBNAIL_MAX_DIMENSION = 512
THUMBNAIL_QUALITY = 80
PREVIEW_MAX_DIMENSION = 2048
PREVIEW_QUALITY = 85

# Open Graph (OG) image constants - optimized for social sharing
OG_IMAGE_WIDTH = 1200
OG_IMAGE_HEIGHT = 630
OG_IMAGE_QUALITY = 85
OG_IMAGE_ASPECT_RATIO = OG_IMAGE_WIDTH / OG_IMAGE_HEIGHT  # 1.905


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

    def generate_og_image(
        self,
        image_data: bytes,
        workspace_id: UUID,
        output_format: str = "JPEG",
    ) -> Tuple[bytes, int, int]:
        """Generate Open Graph optimized image (1200x630px) for social sharing.

        This creates an image optimized for WhatsApp, Facebook, Twitter, etc.
        The image is cropped and scaled to exactly 1200x630 (1.91:1 aspect ratio)
        using center-crop to preserve the most important part of the image.

        Args:
            image_data: Original image bytes
            workspace_id: Workspace UUID (for logging)
            output_format: Output format - "JPEG" or "WEBP" (default: JPEG for compatibility)

        Returns:
            Tuple of (og_image_bytes, width, height)
            Width and height will always be (1200, 630)

        Raises:
            ImageProcessingError: If processing fails
        """
        try:
            # Open image
            image = Image.open(io.BytesIO(image_data))

            # Auto-rotate based on EXIF orientation
            image = ImageOps.exif_transpose(image)

            original_width, original_height = image.size
            original_aspect = original_width / original_height

            # Calculate crop box for center-crop to target aspect ratio
            if original_aspect > OG_IMAGE_ASPECT_RATIO:
                # Image is wider than target - crop sides
                new_width = int(original_height * OG_IMAGE_ASPECT_RATIO)
                left = (original_width - new_width) // 2
                crop_box = (left, 0, left + new_width, original_height)
            else:
                # Image is taller than target - crop top/bottom
                new_height = int(original_width / OG_IMAGE_ASPECT_RATIO)
                top = (original_height - new_height) // 2
                crop_box = (0, top, original_width, top + new_height)

            # Crop to target aspect ratio
            cropped = image.crop(crop_box)

            # Resize to exact OG dimensions
            og_image = cropped.resize(
                (OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT), Image.Resampling.LANCZOS
            )

            # Convert to RGB for output (required for JPEG and better for OG images)
            if og_image.mode in ("RGBA", "LA", "P"):
                # Create white background for transparency
                rgb_image = Image.new("RGB", og_image.size, (255, 255, 255))
                if og_image.mode == "P":
                    og_image = og_image.convert("RGBA")
                rgb_image.paste(
                    og_image, mask=og_image.split()[-1] if og_image.mode == "RGBA" else None
                )
                og_image = rgb_image
            elif og_image.mode != "RGB":
                og_image = og_image.convert("RGB")

            # Save in the specified format
            output = io.BytesIO()
            if output_format.upper() == "WEBP":
                og_image.save(
                    output,
                    format="WEBP",
                    quality=OG_IMAGE_QUALITY,
                    method=6,
                )
            else:
                # Default to JPEG for maximum social media compatibility
                og_image.save(
                    output,
                    format="JPEG",
                    quality=OG_IMAGE_QUALITY,
                    progressive=True,  # Better loading on slow connections
                    optimize=True,
                )
            og_bytes = output.getvalue()

            logger.debug(
                f"Generated OG image: {OG_IMAGE_WIDTH}x{OG_IMAGE_HEIGHT} "
                f"(workspace={workspace_id}, original={original_width}x{original_height}, "
                f"format={output_format})"
            )

            return og_bytes, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT

        except Exception as e:
            logger.error(f"Failed to generate OG image: {e}")
            raise ImageProcessingError(
                f"OG image generation failed: {e}", "OG_IMAGE_FAILED"
            ) from e


# Export singleton instance
_image_processing_service: Optional[ImageProcessingService] = None


def get_image_processing_service() -> ImageProcessingService:
    """Get singleton image processing service instance."""
    global _image_processing_service
    if _image_processing_service is None:
        _image_processing_service = ImageProcessingService()
    return _image_processing_service

