"""Personal Profile Service.

Manages personal profile digital visiting cards for photographers.
Each user can have one personal profile per workspace.
"""

from __future__ import annotations

import io
import json
import logging
from typing import Any, Optional
from uuid import UUID

from PIL import Image, ImageOps

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.api.personal_profile_schemas import (
    CreatePersonalProfileRequest,
    UpdatePersonalProfileRequest,
    PersonalVisibilityConfig,
)
from app.repositories.personal_profile_repository import (
    PersonalProfileRepository,
    get_personal_profile_repository,
)
from app.config.settings import get_settings
from app.services.r2_storage import R2Client

logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================


class PersonalProfileError(Exception):
    """Base personal profile error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class ProfileNotFoundError(PersonalProfileError):
    """Profile not found."""

    def __init__(self, user_id: UUID, workspace_id: UUID):
        super().__init__(
            f"Personal profile not found for user {user_id} in workspace {workspace_id}",
            "PROFILE_NOT_FOUND",
            404,
        )


class ProfileAlreadyExistsError(PersonalProfileError):
    """Profile already exists."""

    def __init__(self, user_id: UUID, workspace_id: UUID):
        super().__init__(
            f"Personal profile already exists for user {user_id} in workspace {workspace_id}",
            "PROFILE_EXISTS",
            409,
        )


class SlugAlreadyExistsError(PersonalProfileError):
    """Slug is already taken."""

    def __init__(self, slug: str):
        super().__init__(f"Slug '{slug}' is already taken", "SLUG_TAKEN", 409)


class AvatarUploadError(PersonalProfileError):
    """Avatar upload failed."""

    def __init__(self, message: str):
        super().__init__(message, "AVATAR_UPLOAD_ERROR", 400)


class PublicProfileNotFoundError(PersonalProfileError):
    """Public profile not found (either doesn't exist or not public)."""

    def __init__(self, slug: str):
        super().__init__(f"Profile '{slug}' not found", "NOT_FOUND", 404)


# =============================================================================
# CONSTANTS
# =============================================================================

MAX_AVATAR_SIZE_BYTES = 50 * 1024 * 1024  # 50MB
VALID_AVATAR_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
AVATAR_THUMBNAIL_SIZES = [64, 128, 256, 512]
AVATAR_WEBP_QUALITY = 90

# Default visibility config
DEFAULT_VISIBILITY = PersonalVisibilityConfig().model_dump()


# =============================================================================
# SERVICE
# =============================================================================


class PersonalProfileService:
    """Service for managing personal profile digital visiting cards."""

    def __init__(self, repository: Optional[PersonalProfileRepository] = None):
        self.repository = repository or get_personal_profile_repository()

    # =========================================================================
    # CREATE
    # =========================================================================

    async def create_profile(
        self,
        workspace_id: UUID,
        user_id: UUID,
        request: CreatePersonalProfileRequest,
    ) -> dict[str, Any]:
        """Create a new personal profile.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            request: Create request data

        Returns:
            Created profile data

        Raises:
            ProfileAlreadyExistsError: If user already has a profile in workspace
            SlugAlreadyExistsError: If slug is taken
        """
        # Check if profile already exists
        existing = await self.repository.get_by_workspace_and_user(workspace_id, user_id)
        if existing:
            raise ProfileAlreadyExistsError(user_id, workspace_id)

        # Check slug availability
        if not await self.repository.check_slug_availability(request.slug):
            raise SlugAlreadyExistsError(request.slug)

        # Prepare data
        visibility = request.visibility_config or DEFAULT_VISIBILITY
        seo_metadata = request.seo_metadata.model_dump() if request.seo_metadata else None
        embedded_media = request.embedded_media.model_dump() if request.embedded_media else None
        address = request.address_structured.model_dump() if request.address_structured else None
        secondary_emails = (
            [c.model_dump() for c in request.secondary_emails]
            if request.secondary_emails
            else None
        )
        secondary_phones = (
            [c.model_dump() for c in request.secondary_phones]
            if request.secondary_phones
            else None
        )
        custom_links = (
            [l.model_dump() for l in request.custom_links] if request.custom_links else None
        )

        # Create profile
        profile = await self.repository.create(
            workspace_id=workspace_id,
            user_id=user_id,
            display_name=request.display_name,
            slug=request.slug,
            email=request.email,
            profile_title=request.profile_title,
            bio=request.bio,
            location=request.location,
            phone=request.phone,
            website=request.website,
            secondary_emails=secondary_emails,
            secondary_phones=secondary_phones,
            address_structured=address,
            service_areas=request.service_areas,
            socials=request.socials,
            custom_links=custom_links,
            embedded_media=embedded_media,
            featured_gallery_id=request.featured_gallery_id,
            categories=request.categories,
            brand_color=request.brand_color,
            background_theme=request.background_theme,
            visibility_config=visibility,
            is_public=request.is_public,
            seo_metadata=seo_metadata,
            booking_calendar_url=request.booking_calendar_url,
        )

        logger.info(
            "Personal profile created",
            extra={
                "profile_id": profile["profile_id"],
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "slug": request.slug,
            },
        )

        return profile

    # =========================================================================
    # READ
    # =========================================================================

    async def get_profile(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> dict[str, Any]:
        """Get a user's personal profile.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            Profile data

        Raises:
            ProfileNotFoundError: If profile not found
        """
        profile = await self.repository.get_by_workspace_and_user(workspace_id, user_id)
        if not profile:
            raise ProfileNotFoundError(user_id, workspace_id)
        return profile

    async def get_profile_optional(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a user's personal profile if exists.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            Profile data or None
        """
        return await self.repository.get_by_workspace_and_user(workspace_id, user_id)

    async def get_public_profile(
        self,
        slug: str,
    ) -> dict[str, Any]:
        """Get public profile by slug.

        Returns filtered profile data based on visibility settings.

        Args:
            slug: Profile slug

        Returns:
            Public profile data with visibility filtering applied

        Raises:
            PublicProfileNotFoundError: If profile not found or not public
        """
        # Try cache first
        redis = await get_redis_client()
        cache_key = f"personal_profile:{slug}"

        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

        # Get profile from database
        profile = await self.repository.get_public_by_slug(slug)
        if not profile:
            raise PublicProfileNotFoundError(slug)

        # Apply visibility filtering
        visibility = profile.get("visibility_config", {})
        filtered = self._filter_by_visibility(profile, visibility)

        # Add public URL
        filtered["public_url"] = self.generate_public_url(slug)

        # Add visibility flags for QR code and vCard buttons
        filtered["show_qr_code"] = visibility.get("qr_code", True)
        filtered["show_vcard"] = visibility.get("vcard", True)

        # Cache for 15 minutes
        await redis.set(cache_key, json.dumps(filtered, default=str), ex=900)

        return filtered

    async def check_slug_availability(
        self,
        slug: str,
        current_profile_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Check if a slug is available.

        Args:
            slug: Slug to check
            current_profile_id: Current profile ID to exclude (for updates)

        Returns:
            dict with 'available' and 'slug' keys
        """
        available = await self.repository.check_slug_availability(slug, current_profile_id)
        return {"available": available, "slug": slug}

    # =========================================================================
    # UPDATE
    # =========================================================================

    async def update_profile(
        self,
        workspace_id: UUID,
        user_id: UUID,
        request: UpdatePersonalProfileRequest,
    ) -> dict[str, Any]:
        """Update a personal profile.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            request: Update request data

        Returns:
            Updated profile data

        Raises:
            ProfileNotFoundError: If profile not found
            SlugAlreadyExistsError: If new slug is taken
        """
        # Get current profile
        current = await self.repository.get_by_workspace_and_user(workspace_id, user_id)
        if not current:
            raise ProfileNotFoundError(user_id, workspace_id)

        profile_id = UUID(current["profile_id"])

        # Check slug availability if changing
        if request.slug and request.slug != current["slug"]:
            if not await self.repository.check_slug_availability(request.slug, profile_id):
                raise SlugAlreadyExistsError(request.slug)

        # Prepare update data
        update_data: dict[str, Any] = {}

        # Simple fields
        simple_fields = [
            "display_name",
            "profile_title",
            "slug",
            "avatar_url",
            "bio",
            "location",
            "email",
            "phone",
            "website",
            "service_areas",
            "featured_gallery_id",
            "categories",
            "brand_color",
            "background_theme",
            "is_public",
            "booking_calendar_url",
        ]
        for field in simple_fields:
            value = getattr(request, field, None)
            if value is not None:
                update_data[field] = value

        # Dict/List fields
        if request.socials is not None:
            update_data["socials"] = request.socials
        if request.visibility_config is not None:
            update_data["visibility_config"] = request.visibility_config

        # Nested model fields
        if request.address_structured is not None:
            update_data["address_structured"] = request.address_structured.model_dump()
        if request.seo_metadata is not None:
            update_data["seo_metadata"] = request.seo_metadata.model_dump()
        if request.embedded_media is not None:
            update_data["embedded_media"] = request.embedded_media.model_dump()
        if request.secondary_emails is not None:
            update_data["secondary_emails"] = [c.model_dump() for c in request.secondary_emails]
        if request.secondary_phones is not None:
            update_data["secondary_phones"] = [c.model_dump() for c in request.secondary_phones]
        if request.custom_links is not None:
            update_data["custom_links"] = [l.model_dump() for l in request.custom_links]

        if not update_data:
            return current

        # Update profile
        updated = await self.repository.update(profile_id, workspace_id, **update_data)

        # Invalidate cache
        redis = await get_redis_client()
        old_slug = current["slug"]
        new_slug = request.slug if request.slug else old_slug

        try:
            await redis.delete(f"personal_profile:{old_slug}")
            if new_slug != old_slug:
                await redis.delete(f"personal_profile:{new_slug}")
        except Exception:
            logger.warning("Failed to invalidate personal profile cache", exc_info=True)

        logger.info(
            "Personal profile updated",
            extra={
                "profile_id": str(profile_id),
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "updated_fields": list(update_data.keys()),
            },
        )

        return updated or current

    # =========================================================================
    # AVATAR
    # =========================================================================

    async def upload_avatar(
        self,
        workspace_id: UUID,
        user_id: UUID,
        file_data: bytes,
        content_type: Optional[str] = None,
        crop_data: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Upload and process avatar image.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            file_data: Raw image bytes
            content_type: Optional MIME type hint
            crop_data: Optional crop positioning

        Returns:
            dict with avatar_url

        Raises:
            ProfileNotFoundError: If profile not found
            AvatarUploadError: If upload/processing fails
        """
        # Validate profile exists
        profile = await self.repository.get_by_workspace_and_user(workspace_id, user_id)
        if not profile:
            raise ProfileNotFoundError(user_id, workspace_id)

        profile_id = UUID(profile["profile_id"])
        slug = profile["slug"]

        # Validate file size
        if len(file_data) > MAX_AVATAR_SIZE_BYTES:
            raise AvatarUploadError(
                f"Avatar must be less than {MAX_AVATAR_SIZE_BYTES // (1024 * 1024)}MB"
            )

        # Detect format
        detected_format = self._detect_image_format(file_data)
        if not detected_format or detected_format not in VALID_AVATAR_MIME_TYPES:
            raise AvatarUploadError("Invalid image format. Supported: JPEG, PNG, WebP, GIF")

        try:
            # Open and validate image
            image = Image.open(io.BytesIO(file_data))
            image = ImageOps.exif_transpose(image)

            width, height = image.size
            if width < 50 or height < 50:
                raise AvatarUploadError("Avatar must be at least 50x50 pixels")

            # Apply crop
            image = self._apply_crop(image, crop_data)

            # Generate thumbnails
            thumbnails = {}
            for size in AVATAR_THUMBNAIL_SIZES:
                thumbnails[size] = self._generate_thumbnail(image, size)

            # Upload to R2 for each size
            r2_keys: dict[int, str] = {}
            try:
                r2_client = R2Client()
                for size in AVATAR_THUMBNAIL_SIZES:
                    key = f"avatars/{workspace_id}/{profile_id}/{size}.webp"
                    await r2_client.upload_bytes(key, thumbnails[size], "image/webp")
                    r2_keys[size] = key
                logger.info(
                    "Avatar uploaded to R2",
                    extra={
                        "profile_id": str(profile_id),
                        "workspace_id": str(workspace_id),
                        "keys": list(r2_keys.values()),
                    },
                )
            except Exception as e:
                # R2 upload failure is non-fatal; PG blob is the fallback
                logger.warning(
                    "R2 avatar upload failed, falling back to PG only: %s",
                    e,
                    exc_info=True,
                )

            # Save to database (PG blobs + R2 keys)
            await self.repository.save_avatar_images(
                workspace_id=workspace_id,
                profile_id=profile_id,
                image_64=thumbnails[64],
                image_128=thumbnails[128],
                image_256=thumbnails[256],
                image_512=thumbnails[512],
                content_type="image/webp",
                r2_key_64=r2_keys.get(64),
                r2_key_128=r2_keys.get(128),
                r2_key_256=r2_keys.get(256),
                r2_key_512=r2_keys.get(512),
            )

            # Build avatar URL using public endpoint with cache-busting
            import time as _time
            cache_buster = int(_time.time())
            avatar_url = f"/api/v1/public/personal-profiles/{slug}/avatar/256?v={cache_buster}"

            # Update profile with avatar URL
            await self.repository.update(
                profile_id,
                workspace_id,
                avatar_url=avatar_url,
            )

            # Invalidate cache
            redis = await get_redis_client()
            try:
                await redis.delete(f"personal_profile:{slug}")
            except Exception:
                pass

            logger.info(
                "Personal profile avatar uploaded",
                extra={
                    "profile_id": str(profile_id),
                    "workspace_id": str(workspace_id),
                    "user_id": str(user_id),
                },
            )

            return {"avatar_url": avatar_url}

        except AvatarUploadError:
            raise
        except Exception as e:
            logger.error(f"Avatar processing failed: {e}", exc_info=True)
            raise AvatarUploadError(f"Image processing failed: {str(e)}") from e

    async def get_avatar_image(
        self,
        workspace_id: UUID,
        user_id: UUID,
        size: int = 256,
    ) -> Optional[tuple[bytes, str]]:
        """Get avatar image bytes.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            size: Image size

        Returns:
            Tuple of (image_bytes, content_type) or None
        """
        profile = await self.repository.get_by_workspace_and_user(workspace_id, user_id)
        if not profile:
            return None

        profile_id = UUID(profile["profile_id"])
        return await self.repository.get_avatar_image(workspace_id, profile_id, size)

    async def get_avatar_image_by_slug(
        self,
        slug: str,
        size: int = 256,
    ) -> Optional[dict | tuple[bytes, str]]:
        """Get public avatar image by slug.

        If the avatar has an R2 key, returns a dict with redirect_url.
        Otherwise falls back to PG blob as tuple(bytes, content_type).

        Args:
            slug: Profile slug
            size: Image size

        Returns:
            dict with redirect_url (R2 path), or
            tuple of (image_bytes, content_type) (PG fallback), or
            None if no avatar found
        """
        result = await self.repository.get_avatar_image_by_slug(slug, size)
        if result is None:
            return None

        r2_key = result.get("r2_key")
        if r2_key:
            # Redirect to R2 presigned URL
            try:
                r2_client = R2Client()
                redirect_url = r2_client.get_public_url(r2_key)
                return {"redirect_url": redirect_url}
            except Exception:
                logger.warning(
                    "Failed to generate R2 URL for avatar, falling back to PG",
                    exc_info=True,
                )

        # Fallback to PG blob (legacy data or R2 URL generation failure)
        image_data = result.get("image_data")
        content_type = result.get("content_type", "image/webp")
        if image_data:
            return (image_data, content_type)
        return None

    # =========================================================================
    # DELETE
    # =========================================================================

    async def delete_profile(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> dict[str, Any]:
        """Delete a user's personal profile (GDPR right to erasure).

        This soft-deletes by returning profile data for audit trail purposes,
        then permanently removes the profile and all associated data.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            dict with deleted profile metadata for audit trail

        Raises:
            ProfileNotFoundError: If profile not found
        """
        profile = await self.repository.get_by_workspace_and_user(workspace_id, user_id)
        if not profile:
            raise ProfileNotFoundError(user_id, workspace_id)

        profile_id = UUID(profile["profile_id"])
        slug = profile["slug"]

        # Capture metadata for audit trail (no PII)
        deleted_metadata = {
            "profile_id": str(profile_id),
            "workspace_id": str(workspace_id),
            "user_id": str(user_id),
            "slug": slug,
            "was_public": profile.get("is_public", False),
        }

        # Delete avatar images first
        try:
            await self.repository.delete_avatar(workspace_id, profile_id)
        except Exception:
            logger.warning("Failed to delete avatar during profile deletion", exc_info=True)

        # Delete the profile
        deleted = await self.repository.delete(profile_id, workspace_id)

        if not deleted:
            raise ProfileNotFoundError(user_id, workspace_id)

        # Invalidate cache
        redis = await get_redis_client()
        try:
            await redis.delete(f"personal_profile:{slug}")
        except Exception:
            pass

        logger.info(
            "Personal profile deleted",
            extra={
                "profile_id": str(profile_id),
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "slug": slug,
            },
        )

        return deleted_metadata

    async def delete_avatar(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Delete avatar for a profile.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            True if deleted

        Raises:
            ProfileNotFoundError: If profile not found
        """
        profile = await self.repository.get_by_workspace_and_user(workspace_id, user_id)
        if not profile:
            raise ProfileNotFoundError(user_id, workspace_id)

        profile_id = UUID(profile["profile_id"])
        slug = profile["slug"]

        # Delete avatar images
        await self.repository.delete_avatar(workspace_id, profile_id)

        # Clear avatar URL from profile
        await self.repository.update(profile_id, workspace_id, avatar_url=None)

        # Invalidate cache
        redis = await get_redis_client()
        try:
            await redis.delete(f"personal_profile:{slug}")
        except Exception:
            pass

        return True

    # =========================================================================
    # HELPERS
    # =========================================================================

    @staticmethod
    def generate_public_url(slug: str) -> str:
        """Generate public profile URL.

        Uses PUBLIC_URL from settings, defaults to https://rawdrive.ai
        """
        settings = get_settings()
        base_url = settings.public_url.rstrip("/")
        return f"{base_url}/u/{slug}"

    def _filter_by_visibility(
        self,
        profile: dict[str, Any],
        visibility: dict[str, bool],
    ) -> dict[str, Any]:
        """Filter profile data based on visibility settings.

        Args:
            profile: Full profile data
            visibility: Visibility config

        Returns:
            Filtered profile data
        """
        result = {
            "slug": profile["slug"],
            "brand_color": profile.get("brand_color"),
            "background_theme": profile.get("background_theme"),
            "is_verified": profile.get("is_verified", False),
            "badges": profile.get("badges", []),
        }

        # Map visibility keys to profile fields
        visibility_map = {
            "display_name": "display_name",
            "profile_title": "profile_title",
            "avatar_url": "avatar_url",
            "bio": "bio",
            "location": "location",
            "email": "email",
            "phone": "phone",
            "website": "website",
            "address": "address_structured",
            "custom_links": "custom_links",
            "embedded_media": "embedded_media",
            "featured_gallery": "featured_gallery_id",
            "categories": "categories",
            "service_areas": "service_areas",
            "booking_calendar": "booking_calendar_url",
        }

        for vis_key, profile_key in visibility_map.items():
            if visibility.get(vis_key, True):
                result[profile_key] = profile.get(profile_key)

        # Handle socials individually
        socials = profile.get("socials", {})
        filtered_socials = {}
        social_platforms = [
            "instagram",
            "facebook",
            "twitter",
            "linkedin",
            "youtube",
            "tiktok",
            "pinterest",
            "behance",
            "dribbble",
            "spotify",
            "whatsapp",
        ]
        for platform in social_platforms:
            vis_key = f"socials_{platform}"
            if visibility.get(vis_key, True) and platform in socials:
                filtered_socials[platform] = socials[platform]
        result["socials"] = filtered_socials

        # Handle secondary contacts
        if visibility.get("secondary_email_1", True):
            emails = profile.get("secondary_emails", [])
            if emails and len(emails) > 0:
                result.setdefault("secondary_emails", []).append(emails[0])
        if visibility.get("secondary_email_2", True):
            emails = profile.get("secondary_emails", [])
            if emails and len(emails) > 1:
                result.setdefault("secondary_emails", []).append(emails[1])

        if visibility.get("secondary_phone_1", True):
            phones = profile.get("secondary_phones", [])
            if phones and len(phones) > 0:
                result.setdefault("secondary_phones", []).append(phones[0])
        if visibility.get("secondary_phone_2", True):
            phones = profile.get("secondary_phones", [])
            if phones and len(phones) > 1:
                result.setdefault("secondary_phones", []).append(phones[1])

        return result

    def _detect_image_format(self, file_data: bytes) -> Optional[str]:
        """Detect image format from magic bytes."""
        if len(file_data) < 12:
            return None

        if file_data[:3] == b"\xff\xd8\xff":
            return "image/jpeg"
        if file_data[:4] == b"\x89PNG":
            return "image/png"
        if file_data[:4] == b"RIFF" and file_data[8:12] == b"WEBP":
            return "image/webp"
        if file_data[:6] in (b"GIF87a", b"GIF89a"):
            return "image/gif"

        return None

    def _apply_crop(
        self,
        image: Image.Image,
        crop_data: Optional[dict],
    ) -> Image.Image:
        """Apply crop to image.

        Args:
            image: PIL Image
            crop_data: Optional crop positioning

        Returns:
            Cropped square image
        """
        width, height = image.size

        if crop_data:
            scale = crop_data.get("crop_scale", 1.0)
            x_offset = crop_data.get("crop_x", 50.0)
            y_offset = crop_data.get("crop_y", 50.0)

            min_dim = min(width, height)
            crop_size = int(min_dim / scale)
            crop_size = min(crop_size, min_dim)

            max_x_offset = width - crop_size
            max_y_offset = height - crop_size
            left = int((x_offset / 100.0) * max_x_offset)
            top = int((y_offset / 100.0) * max_y_offset)

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

    def _generate_thumbnail(self, image: Image.Image, size: int) -> bytes:
        """Generate square thumbnail at specified size.

        Args:
            image: PIL Image (should be square)
            size: Target size in pixels

        Returns:
            WebP image bytes
        """
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

        output = io.BytesIO()
        thumb.save(output, format="WEBP", quality=AVATAR_WEBP_QUALITY, method=6)
        return output.getvalue()

    async def pre_populate_from_user(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> dict[str, Any]:
        """Get pre-population data from user profile.

        Used to suggest initial values when creating a new personal profile.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            dict with suggested values from user profile
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                """
                SELECT display_name, email, phone, bio, job_title, avatar_url
                FROM users
                WHERE user_id = $1
                """,
                user_id,
            )

            if not user:
                return {}

            return {
                "display_name": user["display_name"],
                "email": user["email"],
                "phone": user.get("phone"),
                "bio": user.get("bio"),
                "profile_title": user.get("job_title"),
                "avatar_url": user.get("avatar_url"),
            }


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_service: Optional[PersonalProfileService] = None


def get_personal_profile_service() -> PersonalProfileService:
    """Get the singleton PersonalProfileService instance."""
    global _service
    if _service is None:
        _service = PersonalProfileService()
    return _service
