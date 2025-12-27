"""UserAvatarService: User profile avatar upload and management.

Handles user avatar uploads with:
- File format validation (JPEG, PNG, WebP)
- File size validation (max 5MB)
- Thumbnail generation (64x64, 128x128, 256x256, 512x512)
- R2 storage integration for public access
"""

from __future__ import annotations

import asyncio
import io
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, TypedDict
from uuid import UUID

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError, BotoCoreError
from PIL import Image, ImageOps

from app.config.settings import get_settings, Environment
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum file size (5MB for user avatars)
MAX_USER_AVATAR_SIZE_BYTES = 5 * 1024 * 1024
MAX_USER_AVATAR_SIZE_MB = 5

# Minimum dimension
MIN_AVATAR_DIMENSION = 100  # 100x100 minimum

# Supported MIME types
VALID_AVATAR_MIME_TYPES = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
}

# Thumbnail sizes to generate
USER_AVATAR_SIZES = {
    "original": 512,   # Max dimension for original
    "medium": 256,     # Medium thumbnail
    "small": 128,      # Small thumbnail
    "tiny": 64,        # Tiny thumbnail for lists
}

# Quality settings for output
AVATAR_JPEG_QUALITY = 90


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class UserAvatarError(Exception):
    """Base user avatar error."""

    def __init__(self, message: str, code: str = "AVATAR_ERROR"):
        super().__init__(message)
        self.code = code


class UserAvatarFileTooLargeError(UserAvatarError):
    """Avatar file exceeds size limit."""

    def __init__(self, max_size_mb: int):
        super().__init__(
            f"Avatar file exceeds maximum size of {max_size_mb}MB",
            "FILE_TOO_LARGE",
        )


class UserAvatarInvalidFormatError(UserAvatarError):
    """Avatar file format not supported."""

    def __init__(self, format_hint: str):
        super().__init__(
            f"Unsupported avatar format: {format_hint}. Supported: JPEG, PNG, WebP",
            "INVALID_FORMAT",
        )


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class CropData(TypedDict, total=False):
    """Avatar crop data for positioning."""

    crop_x: float  # X offset (0-1 scale)
    crop_y: float  # Y offset (0-1 scale)
    crop_scale: float  # Zoom scale (1.0 = no zoom)


class UserAvatarUploadResult(TypedDict):
    """Result of user avatar upload."""

    avatar_url: str
    thumbnails: dict[str, str]  # size name -> url


# ---------------------------------------------------------------------------
# UserAvatarService
# ---------------------------------------------------------------------------


class UserAvatarService:
    """Service for user profile avatar management."""

    def __init__(self):
        """Initialize user avatar service."""
        settings = get_settings()
        self.settings = settings
        self._s3_client = None
        self.bucket_name = settings.r2_bucket_name
        self.executor = ThreadPoolExecutor(max_workers=5)

        # CDN base URL for avatars (public access)
        self.avatar_base_url = getattr(settings, "r2_public_url", "") or ""

        if settings.app_env != Environment.DEVELOPMENT:
            self._initialize_client()

    def _initialize_client(self):
        """Initialize boto3 S3 client for R2."""
        if self._s3_client is not None:
            return

        settings = self.settings
        endpoint_url = settings.r2_endpoint_url
        if endpoint_url and "{account_id}" in endpoint_url:
            if settings.r2_account_id:
                endpoint_url = endpoint_url.replace("{account_id}", settings.r2_account_id)

        self._s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key.get_secret_value() if settings.r2_secret_access_key else None,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )

    @property
    def s3_client(self):
        """Lazy-initialize and return S3 client."""
        if self._s3_client is None:
            self._initialize_client()
        return self._s3_client

    def _detect_format(self, file_data: bytes) -> Optional[str]:
        """Detect image format from magic bytes."""
        if len(file_data) < 12:
            return None

        # Check JPEG
        if file_data[:3] == b"\xff\xd8\xff":
            return "image/jpeg"

        # Check PNG
        if file_data[:4] == b"\x89PNG":
            return "image/png"

        # Check WebP (RIFF....WEBP)
        if file_data[:4] == b"RIFF" and file_data[8:12] == b"WEBP":
            return "image/webp"

        return None

    def _build_avatar_key(self, user_id: UUID, size: str) -> str:
        """Build object key for user avatar storage.

        Format: user-avatars/{user_id}/{size}.jpg
        """
        return f"user-avatars/{user_id}/{size}.jpg"

    async def upload_avatar(
        self,
        user_id: UUID,
        file_data: bytes,
        content_type: Optional[str] = None,
        crop_x: Optional[float] = None,
        crop_y: Optional[float] = None,
        crop_scale: Optional[float] = None,
    ) -> UserAvatarUploadResult:
        """Upload and process user avatar.

        Args:
            user_id: User UUID
            file_data: Raw image bytes
            content_type: Optional MIME type hint
            crop_x: X offset for crop (0-1 scale)
            crop_y: Y offset for crop (0-1 scale)
            crop_scale: Zoom scale for crop (1.0 = no zoom)

        Returns:
            Upload result with avatar URLs

        Raises:
            UserAvatarFileTooLargeError: If file exceeds 5MB
            UserAvatarInvalidFormatError: If format not supported
            UserAvatarError: If processing fails
        """
        # Validate file size
        if len(file_data) > MAX_USER_AVATAR_SIZE_BYTES:
            raise UserAvatarFileTooLargeError(MAX_USER_AVATAR_SIZE_MB)

        # Detect format from magic bytes
        detected_format = self._detect_format(file_data)
        if not detected_format or detected_format not in VALID_AVATAR_MIME_TYPES:
            format_hint = content_type if content_type else "unknown"
            raise UserAvatarInvalidFormatError(format_hint)

        try:
            # Process image in thread pool
            loop = asyncio.get_event_loop()
            processed_images = await loop.run_in_executor(
                self.executor,
                lambda: self._process_image(file_data, crop_x, crop_y, crop_scale),
            )

            # Upload all variants to R2
            urls = {}
            for size_name, image_bytes in processed_images.items():
                object_key = self._build_avatar_key(user_id, size_name)

                await loop.run_in_executor(
                    self.executor,
                    lambda key=object_key, data=image_bytes: self.s3_client.put_object(
                        Bucket=self.bucket_name,
                        Key=key,
                        Body=data,
                        ContentType="image/jpeg",
                        CacheControl="public, max-age=31536000",  # 1 year cache
                    ),
                )

                # Build public URL
                if self.avatar_base_url:
                    urls[size_name] = f"{self.avatar_base_url}/{object_key}"
                else:
                    # Fallback to API route
                    urls[size_name] = f"/api/v1/users/me/avatar/{size_name}"

            # Update user's avatar_url in database
            await self._update_user_avatar(user_id, urls.get("original", urls.get("medium", "")))

            logger.info(
                "User avatar uploaded",
                extra={"user_id": str(user_id), "sizes": list(urls.keys())},
            )

            return UserAvatarUploadResult(
                avatar_url=urls.get("original", urls.get("medium", "")),
                thumbnails=urls,
            )

        except (UserAvatarFileTooLargeError, UserAvatarInvalidFormatError):
            raise
        except (ClientError, BotoCoreError) as e:
            logger.error(f"R2 upload failed: {e}")
            raise UserAvatarError(f"Upload failed: {e}", "UPLOAD_FAILED") from e
        except Exception as e:
            logger.error(f"Avatar processing failed: {e}")
            raise UserAvatarError(f"Processing failed: {e}", "PROCESSING_FAILED") from e

    def _process_image(
        self,
        file_data: bytes,
        crop_x: Optional[float],
        crop_y: Optional[float],
        crop_scale: Optional[float],
    ) -> dict[str, bytes]:
        """Process image into multiple sizes.

        Args:
            file_data: Raw image bytes
            crop_x: X offset (0-1)
            crop_y: Y offset (0-1)
            crop_scale: Zoom scale

        Returns:
            Dict mapping size name to processed JPEG bytes
        """
        # Open image
        img = Image.open(io.BytesIO(file_data))

        # Auto-rotate based on EXIF
        img = ImageOps.exif_transpose(img)

        # Validate minimum dimensions
        width, height = img.size
        if width < MIN_AVATAR_DIMENSION or height < MIN_AVATAR_DIMENSION:
            raise UserAvatarError(
                f"Image must be at least {MIN_AVATAR_DIMENSION}x{MIN_AVATAR_DIMENSION} pixels",
                "IMAGE_TOO_SMALL",
            )

        # Convert to RGB if necessary
        if img.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            if "A" in img.mode:
                background.paste(img, mask=img.split()[-1])
            else:
                background.paste(img)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Apply crop if specified
        if crop_x is not None and crop_y is not None:
            img = self._apply_crop(img, crop_x, crop_y, crop_scale or 1.0)

        # Make square (center crop)
        img = self._make_square(img)

        # Generate all sizes
        processed = {}
        for size_name, max_dimension in USER_AVATAR_SIZES.items():
            resized = img.copy()

            # Resize if larger than max dimension
            if resized.width > max_dimension or resized.height > max_dimension:
                resized.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

            # Convert to JPEG bytes
            buffer = io.BytesIO()
            resized.save(buffer, format="JPEG", quality=AVATAR_JPEG_QUALITY, optimize=True)
            processed[size_name] = buffer.getvalue()

        return processed

    def _apply_crop(
        self,
        img: Image.Image,
        crop_x: float,
        crop_y: float,
        crop_scale: float,
    ) -> Image.Image:
        """Apply crop parameters to image.

        Args:
            img: PIL Image
            crop_x: X offset (0-1), center of crop area
            crop_y: Y offset (0-1), center of crop area
            crop_scale: Zoom scale (1.0 = full image visible)

        Returns:
            Cropped image
        """
        width, height = img.size

        # Calculate crop dimensions based on scale
        crop_size = min(width, height) / max(crop_scale, 0.1)
        crop_size = min(crop_size, width, height)

        # Calculate crop box
        center_x = width * crop_x
        center_y = height * crop_y

        left = max(0, center_x - crop_size / 2)
        top = max(0, center_y - crop_size / 2)
        right = min(width, left + crop_size)
        bottom = min(height, top + crop_size)

        # Adjust if we hit edges
        if right - left < crop_size:
            left = max(0, right - crop_size)
        if bottom - top < crop_size:
            top = max(0, bottom - crop_size)

        return img.crop((int(left), int(top), int(right), int(bottom)))

    def _make_square(self, img: Image.Image) -> Image.Image:
        """Center-crop image to square."""
        width, height = img.size

        if width == height:
            return img

        size = min(width, height)
        left = (width - size) // 2
        top = (height - size) // 2

        return img.crop((left, top, left + size, top + size))

    async def delete_avatar(self, user_id: UUID) -> None:
        """Delete user's avatar from storage.

        Args:
            user_id: User UUID
        """
        try:
            loop = asyncio.get_event_loop()

            # Delete all variants
            for size_name in USER_AVATAR_SIZES.keys():
                object_key = self._build_avatar_key(user_id, size_name)

                try:
                    await loop.run_in_executor(
                        self.executor,
                        lambda key=object_key: self.s3_client.delete_object(
                            Bucket=self.bucket_name,
                            Key=key,
                        ),
                    )
                except ClientError:
                    # Ignore if file doesn't exist
                    pass

            # Clear avatar_url in database
            await self._update_user_avatar(user_id, None)

            logger.info(
                "User avatar deleted",
                extra={"user_id": str(user_id)},
            )

        except Exception as e:
            logger.error(f"Avatar deletion failed: {e}")
            raise UserAvatarError(f"Deletion failed: {e}", "DELETE_FAILED") from e

    async def _update_user_avatar(self, user_id: UUID, avatar_url: Optional[str]) -> None:
        """Update user's avatar_url in database."""
        pool = await get_postgres_pool()

        await pool.execute(
            """
            UPDATE users SET avatar_url = $2, updated_at = NOW()
            WHERE user_id = $1
            """,
            user_id,
            avatar_url,
        )


# ---------------------------------------------------------------------------
# Singleton instance helper
# ---------------------------------------------------------------------------

_user_avatar_service: UserAvatarService | None = None


def get_user_avatar_service() -> UserAvatarService:
    """Get or create the user avatar service singleton."""
    global _user_avatar_service
    if _user_avatar_service is None:
        _user_avatar_service = UserAvatarService()
    return _user_avatar_service
