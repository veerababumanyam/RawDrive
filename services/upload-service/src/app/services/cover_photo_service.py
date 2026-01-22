"""CoverPhotoService: Gallery cover photo processing and variant generation.

Handles cover photo upload, validation, compression, variant generation,
and secure R2 storage with AES-256 encryption.

Processing Pipeline:
1. Validate: 15MB max, JPEG/PNG/WebP, 1920×1080 to 8192×8192 resolution
2. Compress: If > 4000px longest dimension → resize to 4000px (LANCZOS)
3. Generate Variants: 1920px, 1280px, 640px WebP (quality 85)
4. Encrypt: AES-256 encryption for all variants
5. Upload to R2: workspaces/{workspace_id}/galleries/{gallery_id}/cover/{asset_id}/
6. Return: asset_id + variant metadata with signed URLs
"""

from __future__ import annotations

import io
import logging
from typing import Optional, Tuple, Dict, Any
from uuid import UUID, uuid4

from PIL import Image, ImageOps

# Register HEIC/HEIF support with Pillow
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

logger = logging.getLogger(__name__)

# =============================================================================
# Cover Photo Validation Constants
# =============================================================================

# File size constraint: 15MB max
COVER_MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB

# Supported MIME types for cover photos
SUPPORTED_COVER_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
]

# Resolution constraints
COVER_MIN_WIDTH = 1920
COVER_MIN_HEIGHT = 1080
COVER_MAX_WIDTH = 8192
COVER_MAX_HEIGHT = 8192

# Compression threshold: if longest dimension > 4000px, resize
COVER_COMPRESSION_THRESHOLD = 4000
COVER_COMPRESSION_TARGET = 4000

# Variant generation sizes (longest dimension)
COVER_VARIANT_SIZES = [1920, 1280, 640]
COVER_VARIANT_QUALITY = 85
COVER_VARIANT_METHOD = 6  # Best quality WebP compression


# =============================================================================
# Exceptions
# =============================================================================


class CoverPhotoError(Exception):
    """Base cover photo error."""

    def __init__(self, message: str, code: str = "COVER_PHOTO_ERROR", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class CoverPhotoValidationError(CoverPhotoError):
    """Cover photo validation failed."""

    def __init__(self, message: str):
        super().__init__(message, "COVER_PHOTO_VALIDATION_ERROR", 400)


class CoverPhotoProcessingError(CoverPhotoError):
    """Cover photo processing failed."""

    def __init__(self, message: str):
        super().__init__(message, "COVER_PHOTO_PROCESSING_ERROR", 500)


# =============================================================================
# Cover Photo Service
# =============================================================================


class CoverPhotoService:
    """Service for cover photo processing and variant generation."""

    def validate_cover_photo(
        self,
        file_data: bytes,
        mime_type: str,
        filename: str,
    ) -> Tuple[int, int, str]:
        """Validate cover photo file and dimensions.

        Args:
            file_data: Raw file bytes
            mime_type: File MIME type
            filename: Original filename

        Returns:
            Tuple of (width, height, validated_mime_type)

        Raises:
            CoverPhotoValidationError: If validation fails
        """
        # Validate file size
        if len(file_data) > COVER_MAX_FILE_SIZE:
            raise CoverPhotoValidationError(
                f"Cover photo exceeds maximum size of {COVER_MAX_FILE_SIZE / 1024 / 1024:.1f}MB"
            )

        # Validate MIME type
        if mime_type not in SUPPORTED_COVER_MIME_TYPES:
            raise CoverPhotoValidationError(
                f"Unsupported cover photo format: {mime_type}. "
                f"Supported formats: {', '.join(SUPPORTED_COVER_MIME_TYPES)}"
            )

        try:
            # Open and validate image
            image = Image.open(io.BytesIO(file_data))

            # Handle animated images - extract first frame
            if getattr(image, 'is_animated', False):
                image.seek(0)
                image = image.copy()

            width, height = image.size

            # Validate resolution
            if width < COVER_MIN_WIDTH or height < COVER_MIN_HEIGHT:
                raise CoverPhotoValidationError(
                    f"Cover photo resolution too small: {width}x{height}. "
                    f"Minimum: {COVER_MIN_WIDTH}x{COVER_MIN_HEIGHT}"
                )

            if width > COVER_MAX_WIDTH or height > COVER_MAX_HEIGHT:
                raise CoverPhotoValidationError(
                    f"Cover photo resolution too large: {width}x{height}. "
                    f"Maximum: {COVER_MAX_WIDTH}x{COVER_MAX_HEIGHT}"
                )

            logger.debug(f"Cover photo validated: {width}x{height}, {mime_type}")
            return width, height, mime_type

        except CoverPhotoValidationError:
            raise
        except Exception as e:
            logger.error(f"Cover photo validation error: {e}")
            raise CoverPhotoValidationError(f"Failed to validate cover photo: {str(e)}")

    def _resize_image_to_size(
        self,
        image: Image.Image,
        target_size: int,
    ) -> Tuple[bytes, int, int]:
        """Resize image to target longest dimension and save as WebP.

        Args:
            image: PIL Image object
            target_size: Target longest dimension in pixels

        Returns:
            Tuple of (webp_bytes, width, height)
        """
        width, height = image.size

        # Calculate new dimensions preserving aspect ratio
        if width >= height:
            new_width = target_size
            new_height = int(height * (target_size / width))
        else:
            new_height = target_size
            new_width = int(width * (target_size / height))

        # Resize with high-quality LANCZOS resampling
        resized = image.resize(
            (new_width, new_height),
            Image.Resampling.LANCZOS
        )

        # Convert to RGB if necessary (for WebP)
        if resized.mode in ("RGBA", "LA", "P"):
            rgb_image = Image.new("RGB", resized.size, (255, 255, 255))
            if resized.mode == "P":
                resized = resized.convert("RGBA")
            rgb_image.paste(
                resized,
                mask=resized.split()[-1] if resized.mode == "RGBA" else None
            )
            resized = rgb_image
        elif resized.mode != "RGB":
            resized = resized.convert("RGB")

        # Save as WebP
        output = io.BytesIO()
        resized.save(
            output,
            format="WEBP",
            quality=COVER_VARIANT_QUALITY,
            method=COVER_VARIANT_METHOD,
        )
        webp_bytes = output.getvalue()

        logger.debug(f"Generated cover variant: {new_width}x{new_height}")
        return webp_bytes, new_width, new_height

    def generate_cover_variants(
        self,
        file_data: bytes,
        workspace_id: UUID,
    ) -> Dict[str, Dict[str, Any]]:
        """Generate cover photo variants (1920, 1280, 640px) as WebP.

        Includes compression if original image > 4000px longest dimension.

        Args:
            file_data: Original image bytes
            workspace_id: Workspace UUID (for logging)

        Returns:
            Dictionary with variant data:
            {
                "original": {"bytes": ..., "width": ..., "height": ...},
                "1920": {"bytes": ..., "width": ..., "height": ...},
                "1280": {"bytes": ..., "width": ..., "height": ...},
                "640": {"bytes": ..., "width": ..., "height": ...},
            }

        Raises:
            CoverPhotoProcessingError: If processing fails
        """
        try:
            # Open original image
            image = Image.open(io.BytesIO(file_data))

            # Handle animated images
            if getattr(image, 'is_animated', False):
                image.seek(0)
                image = image.copy()

            # Auto-rotate based on EXIF
            image = ImageOps.exif_transpose(image)

            original_width, original_height = image.size
            longest_dim = max(original_width, original_height)

            # Compress if > 4000px
            if longest_dim > COVER_COMPRESSION_THRESHOLD:
                logger.info(
                    f"Compressing cover photo from {longest_dim}px to {COVER_COMPRESSION_TARGET}px"
                )
                compress_bytes, compress_width, compress_height = self._resize_image_to_size(
                    image,
                    COVER_COMPRESSION_TARGET
                )
                # Re-open the compressed image for variant generation
                image = Image.open(io.BytesIO(compress_bytes))
            else:
                compress_bytes = None
                compress_width = original_width
                compress_height = original_height

            # Generate variants
            variants: Dict[str, Dict[str, Any]] = {}

            # Original (or compressed if needed)
            if compress_bytes:
                variants["original"] = {
                    "bytes": compress_bytes,
                    "width": compress_width,
                    "height": compress_height,
                }
            else:
                # Save original as WebP for consistency
                original_webp, orig_w, orig_h = self._resize_image_to_size(
                    image,
                    max(original_width, original_height)
                )
                variants["original"] = {
                    "bytes": original_webp,
                    "width": orig_w,
                    "height": orig_h,
                }

            # Generate size variants
            for size in COVER_VARIANT_SIZES:
                if max(compress_width, compress_height) >= size:
                    variant_bytes, variant_width, variant_height = self._resize_image_to_size(
                        image,
                        size
                    )
                    variants[str(size)] = {
                        "bytes": variant_bytes,
                        "width": variant_width,
                        "height": variant_height,
                    }

            logger.info(
                f"Generated cover photo variants: "
                f"original={original_width}x{original_height} "
                f"(workspace={workspace_id})"
            )

            return variants

        except CoverPhotoProcessingError:
            raise
        except Exception as e:
            logger.error(f"Cover photo variant generation failed: {e}")
            raise CoverPhotoProcessingError(f"Failed to generate cover variants: {str(e)}")

    def get_r2_cover_path(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_id: UUID,
        size: str,  # "original", "1920", "1280", "640"
    ) -> str:
        """Get R2 storage path for cover photo variant.

        Path format: workspaces/{workspace_id}/galleries/{gallery_id}/cover/{asset_id}/{size}.webp.enc

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            size: Variant size identifier

        Returns:
            R2 object path
        """
        return f"workspaces/{workspace_id}/galleries/{gallery_id}/cover/{asset_id}/{size}.webp.enc"


# =============================================================================
# Service Singleton
# =============================================================================

_cover_photo_service: Optional[CoverPhotoService] = None


def get_cover_photo_service() -> CoverPhotoService:
    """Get singleton cover photo service instance."""
    global _cover_photo_service
    if _cover_photo_service is None:
        _cover_photo_service = CoverPhotoService()
    return _cover_photo_service
