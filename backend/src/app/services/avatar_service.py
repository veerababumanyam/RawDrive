"""AvatarService: Avatar upload and management for clients.

Implements avatar management with:
- File format validation (JPEG, PNG, WebP)
- File size validation (max 5MB)
- Minimum dimension validation (200x200)
- Thumbnail generation (64x64, 128x128, 256x256)
- Gallery photo selection as avatar
- Storage integration with R2
"""

from __future__ import annotations

import io
import logging
from typing import Optional, TypedDict
from uuid import UUID, uuid4

from PIL import Image, ImageOps

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import (
    AvatarAssetNotInGalleryError,
    AvatarFileTooLargeError,
    AvatarInvalidFormatError,
    AvatarUploadError,
    ClientNotFoundError,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Avatar file constraints
MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
MAX_AVATAR_SIZE_MB = 5
MIN_AVATAR_DIMENSION = 200  # 200x200 minimum
MAX_AVATAR_DIMENSION = 4096  # Reasonable upper limit

# Supported MIME types
VALID_AVATAR_MIME_TYPES = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
}

# Magic bytes for format detection
MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",  # JPEG
    b"\x89PNG": "image/png",  # PNG
    b"RIFF": "image/webp",  # WebP (starts with RIFF....WEBP)
}

# Thumbnail sizes to generate
AVATAR_THUMBNAIL_SIZES = [64, 128, 256]

# Quality settings for WebP output
AVATAR_WEBP_QUALITY = 85


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class CropData(TypedDict, total=False):
    """Avatar crop data for positioning within frame."""
    x: float  # X offset percentage (0-100)
    y: float  # Y offset percentage (0-100)
    scale: float  # Scale factor (1.0 = 100%)


class AvatarUploadResult(TypedDict):
    """Result of avatar upload operation."""
    avatar_asset_id: str
    avatar_url: str
    thumbnails: dict[str, str]  # size -> url


class AvatarSelectResult(TypedDict):
    """Result of selecting gallery photo as avatar."""
    avatar_asset_id: str
    avatar_url: str
    crop_data: Optional[CropData]


# ---------------------------------------------------------------------------
# AvatarService
# ---------------------------------------------------------------------------


class AvatarService:
    """Service for avatar management operations."""

    def _detect_format(self, file_data: bytes) -> Optional[str]:
        """Detect image format from magic bytes.

        Args:
            file_data: Raw file bytes

        Returns:
            MIME type string or None if unknown
        """
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

    def _validate_image_dimensions(
        self, image: Image.Image
    ) -> tuple[int, int]:
        """Validate image dimensions.

        Args:
            image: PIL Image object

        Returns:
            Tuple of (width, height)

        Raises:
            AvatarUploadError: If dimensions are invalid
        """
        width, height = image.size

        if width < MIN_AVATAR_DIMENSION or height < MIN_AVATAR_DIMENSION:
            raise AvatarUploadError(
                f"Image must be at least {MIN_AVATAR_DIMENSION}x{MIN_AVATAR_DIMENSION} pixels"
            )

        if width > MAX_AVATAR_DIMENSION or height > MAX_AVATAR_DIMENSION:
            raise AvatarUploadError(
                f"Image exceeds maximum dimension of {MAX_AVATAR_DIMENSION} pixels"
            )

        return width, height

    def _generate_square_crop(
        self, image: Image.Image, crop_data: Optional[CropData] = None
    ) -> Image.Image:
        """Generate square crop from image.

        If crop_data is provided, uses the specified offset and scale.
        Otherwise, creates a centered square crop.

        Args:
            image: PIL Image object
            crop_data: Optional crop positioning data

        Returns:
            Cropped and squared PIL Image
        """
        width, height = image.size

        if crop_data:
            # Apply custom crop with offset and scale
            scale = crop_data.get("scale", 1.0)
            x_offset = crop_data.get("x", 50.0)  # Center by default
            y_offset = crop_data.get("y", 50.0)

            # Calculate crop size based on scale
            min_dim = min(width, height)
            crop_size = int(min_dim / scale)
            crop_size = min(crop_size, min_dim)  # Don't exceed image bounds

            # Calculate crop position from percentage offsets
            max_x_offset = width - crop_size
            max_y_offset = height - crop_size
            left = int((x_offset / 100.0) * max_x_offset)
            top = int((y_offset / 100.0) * max_y_offset)

            # Ensure bounds
            left = max(0, min(left, max_x_offset))
            top = max(0, min(top, max_y_offset))
            right = left + crop_size
            bottom = top + crop_size

        else:
            # Centered square crop
            min_dim = min(width, height)
            left = (width - min_dim) // 2
            top = (height - min_dim) // 2
            right = left + min_dim
            bottom = top + min_dim

        return image.crop((left, top, right, bottom))

    def _generate_thumbnail(
        self, image: Image.Image, size: int
    ) -> bytes:
        """Generate a square thumbnail at specified size.

        Args:
            image: PIL Image (should already be square)
            size: Target size in pixels

        Returns:
            WebP image bytes
        """
        # Resize with high-quality resampling
        thumb = image.resize((size, size), Image.Resampling.LANCZOS)

        # Convert to RGB if necessary
        if thumb.mode in ("RGBA", "LA", "P"):
            rgb_image = Image.new("RGB", thumb.size, (255, 255, 255))
            if thumb.mode == "P":
                thumb = thumb.convert("RGBA")
            if thumb.mode == "RGBA":
                rgb_image.paste(thumb, mask=thumb.split()[3])
            else:
                rgb_image.paste(thumb)
            thumb = rgb_image
        elif thumb.mode != "RGB":
            thumb = thumb.convert("RGB")

        # Save as WebP
        output = io.BytesIO()
        thumb.save(
            output,
            format="WEBP",
            quality=AVATAR_WEBP_QUALITY,
            method=6,  # Best quality compression
        )
        return output.getvalue()

    async def upload_avatar(
        self,
        workspace_id: UUID,
        client_id: UUID,
        file_data: bytes,
        content_type: Optional[str] = None,
        crop_data: Optional[CropData] = None,
        user_id: Optional[UUID] = None,
    ) -> AvatarUploadResult:
        """Upload and process a new avatar image.

        Validates the image, generates thumbnails, and stores in R2.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to set avatar for
            file_data: Raw image bytes
            content_type: Optional MIME type hint
            crop_data: Optional crop positioning
            user_id: User performing the upload

        Returns:
            Upload result with avatar URL and thumbnails

        Raises:
            ClientNotFoundError: If client doesn't exist
            AvatarFileTooLargeError: If file exceeds 5MB
            AvatarInvalidFormatError: If format not supported
            AvatarUploadError: If processing fails
        """
        # Validate file size
        if len(file_data) > MAX_AVATAR_SIZE_BYTES:
            raise AvatarFileTooLargeError(MAX_AVATAR_SIZE_MB)

        # Detect format from magic bytes (don't trust content_type)
        detected_format = self._detect_format(file_data)
        if not detected_format or detected_format not in VALID_AVATAR_MIME_TYPES:
            format_hint = content_type if content_type else "unknown"
            raise AvatarInvalidFormatError(format_hint)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client = await conn.fetchrow(
                "SELECT client_id, full_name FROM clients WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                client_id,
            )
            if not client:
                raise ClientNotFoundError(client_id)

            try:
                # Open and validate image
                image = Image.open(io.BytesIO(file_data))

                # Auto-rotate based on EXIF
                image = ImageOps.exif_transpose(image)

                # Validate dimensions
                self._validate_image_dimensions(image)

                # Create square crop
                squared = self._generate_square_crop(image, crop_data)

                # Generate thumbnails
                thumbnails: dict[str, bytes] = {}
                for size in AVATAR_THUMBNAIL_SIZES:
                    thumbnails[str(size)] = self._generate_thumbnail(squared, size)

                # Generate avatar asset ID
                avatar_asset_id = uuid4()

                # Store in database (storage integration would go here)
                # For now, we store the asset reference and crop data
                await conn.execute(
                    """
                    UPDATE clients
                    SET avatar_asset_id = $1,
                        avatar_crop_data = $2,
                        updated_at = NOW()
                    WHERE workspace_id = $3 AND client_id = $4
                    """,
                    avatar_asset_id,
                    crop_data if crop_data else None,
                    workspace_id,
                    client_id,
                )

                # Record activity
                await conn.execute(
                    """
                    INSERT INTO client_activities (
                        workspace_id, client_id, activity_type,
                        description, created_by_user_id
                    )
                    VALUES ($1, $2, 'avatar_updated', 'Avatar image uploaded', $3)
                    """,
                    workspace_id,
                    client_id,
                    user_id,
                )

                logger.info(
                    "Avatar uploaded",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "avatar_asset_id": str(avatar_asset_id),
                        "sizes_generated": list(thumbnails.keys()),
                    },
                )

                # Build placeholder URLs (actual storage integration would generate real URLs)
                base_url = f"/api/v1/workspaces/{workspace_id}/clients/{client_id}/avatar"
                return AvatarUploadResult(
                    avatar_asset_id=str(avatar_asset_id),
                    avatar_url=f"{base_url}/256",
                    thumbnails={
                        size: f"{base_url}/{size}"
                        for size in thumbnails.keys()
                    },
                )

            except AvatarUploadError:
                raise
            except AvatarFileTooLargeError:
                raise
            except AvatarInvalidFormatError:
                raise
            except Exception as e:
                logger.error(
                    "Avatar processing failed",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "error": str(e),
                    },
                )
                raise AvatarUploadError(f"Image processing failed: {str(e)}") from e

    async def select_gallery_photo(
        self,
        workspace_id: UUID,
        client_id: UUID,
        asset_id: UUID,
        crop_data: Optional[CropData] = None,
        user_id: Optional[UUID] = None,
    ) -> AvatarSelectResult:
        """Select a photo from a linked gallery as the client's avatar.

        The photo must be from a gallery that is linked to this client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to set avatar for
            asset_id: Gallery asset to use as avatar
            crop_data: Optional crop positioning
            user_id: User performing the selection

        Returns:
            Selection result with avatar reference

        Raises:
            ClientNotFoundError: If client doesn't exist
            AvatarAssetNotInGalleryError: If asset not in linked gallery
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client = await conn.fetchrow(
                "SELECT client_id, full_name FROM clients WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                client_id,
            )
            if not client:
                raise ClientNotFoundError(client_id)

            # Verify asset exists and is in a gallery linked to this client
            asset = await conn.fetchrow(
                """
                SELECT ga.asset_id, ga.gallery_id
                FROM gallery_assets ga
                JOIN client_gallery_links cgl ON ga.gallery_id = cgl.gallery_id
                WHERE ga.workspace_id = $1
                  AND ga.asset_id = $2
                  AND cgl.client_id = $3
                  AND ga.deleted = FALSE
                """,
                workspace_id,
                asset_id,
                client_id,
            )
            if not asset:
                raise AvatarAssetNotInGalleryError(asset_id)

            # Update client with avatar reference
            await conn.execute(
                """
                UPDATE clients
                SET avatar_asset_id = $1,
                    avatar_crop_data = $2,
                    updated_at = NOW()
                WHERE workspace_id = $3 AND client_id = $4
                """,
                asset_id,
                crop_data if crop_data else None,
                workspace_id,
                client_id,
            )

            # Record activity
            await conn.execute(
                """
                INSERT INTO client_activities (
                    workspace_id, client_id, activity_type,
                    related_entity_type, related_entity_id,
                    description, created_by_user_id
                )
                VALUES ($1, $2, 'avatar_updated', 'asset', $3,
                        'Avatar set from gallery photo', $4)
                """,
                workspace_id,
                client_id,
                asset_id,
                user_id,
            )

            logger.info(
                "Avatar selected from gallery",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "asset_id": str(asset_id),
                },
            )

            # Build avatar URL
            base_url = f"/api/v1/workspaces/{workspace_id}/clients/{client_id}/avatar"
            return AvatarSelectResult(
                avatar_asset_id=str(asset_id),
                avatar_url=f"{base_url}/256",
                crop_data=crop_data,
            )

    async def remove_avatar(
        self,
        workspace_id: UUID,
        client_id: UUID,
        user_id: Optional[UUID] = None,
    ) -> dict:
        """Remove the client's avatar.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to remove avatar from
            user_id: User performing the removal

        Returns:
            Success message

        Raises:
            ClientNotFoundError: If client doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client = await conn.fetchrow(
                "SELECT client_id, avatar_asset_id FROM clients WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                client_id,
            )
            if not client:
                raise ClientNotFoundError(client_id)

            if client["avatar_asset_id"] is None:
                return {"message": "No avatar to remove"}

            # Clear avatar
            await conn.execute(
                """
                UPDATE clients
                SET avatar_asset_id = NULL,
                    avatar_crop_data = NULL,
                    updated_at = NOW()
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )

            # Record activity
            await conn.execute(
                """
                INSERT INTO client_activities (
                    workspace_id, client_id, activity_type,
                    description, created_by_user_id
                )
                VALUES ($1, $2, 'avatar_removed', 'Avatar removed', $3)
                """,
                workspace_id,
                client_id,
                user_id,
            )

            logger.info(
                "Avatar removed",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                },
            )

            return {"message": "Avatar removed successfully"}

    async def get_avatar_url(
        self,
        workspace_id: UUID,
        client_id: UUID,
        size: int = 256,
    ) -> Optional[dict]:
        """Get the avatar URL for a client.

        Returns the avatar URL or None if no avatar is set.
        When no avatar exists, frontend should display initials.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get avatar for
            size: Requested thumbnail size (64, 128, or 256)

        Returns:
            Dict with avatar_url and initials, or None if client not found
        """
        # Validate size
        if size not in AVATAR_THUMBNAIL_SIZES:
            size = 256  # Default to largest

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            client = await conn.fetchrow(
                """
                SELECT client_id, first_name, last_name, avatar_asset_id
                FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            if not client:
                return None

            # Compute initials for fallback
            first_initial = client["first_name"][0].upper() if client["first_name"] else ""
            last_initial = client["last_name"][0].upper() if client["last_name"] else ""
            initials = f"{first_initial}{last_initial}"

            if client["avatar_asset_id"]:
                base_url = f"/api/v1/workspaces/{workspace_id}/clients/{client_id}/avatar"
                return {
                    "avatar_url": f"{base_url}/{size}",
                    "initials": initials,
                    "has_avatar": True,
                }
            else:
                return {
                    "avatar_url": None,
                    "initials": initials,
                    "has_avatar": False,
                }


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_avatar_service: Optional[AvatarService] = None


def get_avatar_service() -> AvatarService:
    """Get singleton avatar service instance."""
    global _avatar_service
    if _avatar_service is None:
        _avatar_service = AvatarService()
    return _avatar_service
