"""Company Profile Service.

Manages the single source of truth for company branding.
"""

from __future__ import annotations

import logging
import json
import io
from uuid import UUID, uuid4
from typing import Optional

from PIL import Image, ImageOps

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.api.company_profile_schemas import (
    CreateCompanyProfileRequest,
    UpdateCompanyProfileRequest,
    CompanyAddress
)
from app.services.visibility_service import VisibilityFilterService
from app.config.settings import get_settings

logger = logging.getLogger(__name__)

class CompanyProfileError(Exception):
    """Base company profile error."""
    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status

class ProfileNotFoundError(CompanyProfileError):
    def __init__(self, workspace_id: UUID):
        super().__init__(f"Company profile not found for workspace {workspace_id}", "PROFILE_NOT_FOUND", 404)

class SlugAlreadyExistsError(CompanyProfileError):
    def __init__(self, slug: str):
        super().__init__(f"Slug '{slug}' is already taken", "SLUG_TAKEN", 409)

class LogoUploadError(CompanyProfileError):
    """Logo upload failed."""
    def __init__(self, message: str):
        super().__init__(message, "LOGO_UPLOAD_ERROR", 400)

# Logo constraints
MAX_LOGO_SIZE_BYTES = 50 * 1024 * 1024  # 50MB - generous limit for high-res logos
VALID_LOGO_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
LOGO_THUMBNAIL_SIZES = [64, 128, 256, 512]  # Generate multiple sizes
LOGO_WEBP_QUALITY = 90

class CompanyProfileService:
    """Service for managing company branding profiles."""

    async def create_profile(
        self,
        workspace_id: UUID,
        request: CreateCompanyProfileRequest
    ) -> dict:
        """Create a new company profile."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check if profile already exists for workspace (1:1 relationship) FIRST
            # This ensures we return 409 Conflict for existing profiles before
            # checking slug uniqueness (which would fail if same slug is reused)
            exists = await conn.fetchval(
                "SELECT 1 FROM company_profiles WHERE workspace_id = $1",
                workspace_id
            )
            if exists:
                raise CompanyProfileError("Profile already exists for this workspace", "PROFILE_EXISTS", 409)

            # Check slug uniqueness globally (only for new profiles)
            slug_exists = await conn.fetchval(
                "SELECT 1 FROM company_profiles WHERE slug = $1",
                request.slug
            )
            if slug_exists:
                raise SlugAlreadyExistsError(request.slug)

            # JSONB serializations
            address_json = request.address_structured.model_dump_json() if request.address_structured else '{}'
            socials_json = json.dumps(request.socials) if request.socials else '{}'
            custom_links_json = json.dumps([l.model_dump() for l in request.custom_links]) if request.custom_links else '[]'
            
            # Use provided visibility or default
            visibility = request.company_visibility or VisibilityFilterService.get_default_visibility()
            visibility_json = json.dumps(visibility)

            row = await conn.fetchrow(
                """
                INSERT INTO company_profiles (
                    workspace_id, name, tagline, slug, logo_url, favicon_url, 
                    brand_color, brand_font, email, phone, website,
                    address_structured, socials, custom_links, company_visibility
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb)
                RETURNING *
                """,
                workspace_id,
                request.name,
                request.tagline,
                request.slug,
                request.logo_url,
                request.favicon_url,
                request.brand_color,
                request.brand_font,
                request.email,
                request.phone,
                request.website,
                address_json,
                socials_json,
                custom_links_json,
                visibility_json
            )
            
            return self._map_row(row)

    async def get_profile(self, workspace_id: UUID) -> dict:
        """Get company profile for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT cp.*,
                       CASE WHEN cli.logo_id IS NOT NULL THEN true ELSE false END as has_logo_data
                FROM company_profiles cp
                LEFT JOIN company_logo_images cli ON cp.profile_id = cli.profile_id
                WHERE cp.workspace_id = $1
                """,
                workspace_id
            )
            if not row:
                raise ProfileNotFoundError(workspace_id)

            return self._map_row(row)

    async def check_slug_availability(
        self,
        slug: str,
        current_workspace_id: Optional[UUID] = None
    ) -> dict:
        """Check if a slug is available for use.
        
        Args:
            slug: The slug to check
            current_workspace_id: If provided, excludes the current workspace's own slug
        
        Returns:
            dict with 'available' boolean
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if current_workspace_id:
                # Allow the current workspace to keep its own slug
                slug_owner = await conn.fetchval(
                    "SELECT workspace_id FROM company_profiles WHERE slug = $1",
                    slug
                )
                available = slug_owner is None or str(slug_owner) == str(current_workspace_id)
            else:
                # Check if any profile has this slug
                exists = await conn.fetchval(
                    "SELECT 1 FROM company_profiles WHERE slug = $1",
                    slug
                )
                available = not exists
            
            return {"available": available, "slug": slug}

    def _generate_thumbnail(self, image: Image.Image, size: int) -> bytes:
        """Generate a square thumbnail at specified size.

        Args:
            image: PIL Image (should already be square)
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
        thumb.save(output, format="WEBP", quality=LOGO_WEBP_QUALITY, method=6)
        return output.getvalue()

    async def upload_logo(
        self,
        workspace_id: UUID,
        file_data: bytes,
        content_type: Optional[str] = None,
        crop_data: Optional[dict] = None
    ) -> dict:
        """Upload and process a company logo.

        Args:
            workspace_id: Workspace for tenant isolation
            file_data: Raw image bytes
            content_type: Optional MIME type hint
            crop_data: Optional crop positioning (crop_x, crop_y, crop_scale)

        Returns:
            dict with logo_url and logo_id

        Raises:
            LogoUploadError: If upload/processing fails
        """
        # Validate file size
        if len(file_data) > MAX_LOGO_SIZE_BYTES:
            raise LogoUploadError(f"Logo must be less than {MAX_LOGO_SIZE_BYTES // (1024 * 1024)}MB")

        # Detect format from magic bytes
        detected_format = self._detect_image_format(file_data)
        if not detected_format or detected_format not in VALID_LOGO_MIME_TYPES:
            raise LogoUploadError("Invalid image format. Supported: JPEG, PNG, WebP, GIF")

        try:
            # Open and validate image
            image = Image.open(io.BytesIO(file_data))

            # Auto-rotate based on EXIF
            image = ImageOps.exif_transpose(image)

            # Validate minimum dimensions
            width, height = image.size
            if width < 50 or height < 50:
                raise LogoUploadError("Logo must be at least 50x50 pixels")

            # Apply crop based on crop_data or default to centered square
            if crop_data:
                scale = crop_data.get("crop_scale", 1.0)
                x_offset = crop_data.get("crop_x", 50.0)  # Center by default
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

            image = image.crop((left, top, right, bottom))

            # Generate thumbnails for each size
            thumbnails: dict[str, bytes] = {}
            for size in LOGO_THUMBNAIL_SIZES:
                thumbnails[str(size)] = self._generate_thumbnail(image, size)

            # Generate unique logo ID
            logo_id = uuid4()

            pool = await get_postgres_pool()
            async with pool.acquire() as conn:
                # Get profile_id and slug
                profile = await conn.fetchrow(
                    "SELECT profile_id, slug FROM company_profiles WHERE workspace_id = $1",
                    workspace_id
                )
                if not profile:
                    raise LogoUploadError("Company profile not found. Please create a profile first.")

                profile_id = profile["profile_id"]
                slug = profile["slug"]

                # Build logo URL - use public endpoint so it works for both authenticated and public views
                logo_url = f"/api/v1/public/profiles/{slug}/logo/256"

                # Store logo thumbnails in company_logo_images table
                await conn.execute(
                    """
                    INSERT INTO company_logo_images (
                        logo_id, workspace_id, profile_id,
                        image_64, image_128, image_256, image_512,
                        content_type
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'image/webp')
                    ON CONFLICT (workspace_id, profile_id)
                    DO UPDATE SET
                        logo_id = EXCLUDED.logo_id,
                        image_64 = EXCLUDED.image_64,
                        image_128 = EXCLUDED.image_128,
                        image_256 = EXCLUDED.image_256,
                        image_512 = EXCLUDED.image_512,
                        updated_at = NOW()
                    """,
                    logo_id,
                    workspace_id,
                    profile_id,
                    thumbnails.get("64"),
                    thumbnails.get("128"),
                    thumbnails.get("256"),
                    thumbnails.get("512"),
                )

                # Update profile with logo URL
                await conn.execute(
                    """
                    UPDATE company_profiles
                    SET logo_url = $1, updated_at = NOW()
                    WHERE workspace_id = $2
                    """,
                    logo_url,
                    workspace_id
                )

                logger.info(
                    "Logo uploaded",
                    extra={
                        "workspace_id": str(workspace_id),
                        "logo_id": str(logo_id),
                        "sizes_generated": list(thumbnails.keys()),
                    }
                )

            return {"logo_url": logo_url, "logo_id": str(logo_id)}

        except LogoUploadError:
            raise
        except Exception as e:
            logger.error(f"Logo processing failed: {e}", exc_info=True)
            raise LogoUploadError(f"Image processing failed: {str(e)}") from e

    async def get_logo_image(
        self,
        workspace_id: UUID,
        size: int = 256
    ) -> Optional[bytes]:
        """Get the logo image bytes for a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            size: Requested thumbnail size (64, 128, 256, or 512)

        Returns:
            Image bytes (WebP format) or None if no logo
        """
        if size not in LOGO_THUMBNAIL_SIZES:
            size = 256  # Default to medium size

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            column = f"image_{size}"
            row = await conn.fetchrow(
                f"""
                SELECT {column} as image_data
                FROM company_logo_images cli
                JOIN company_profiles cp ON cli.profile_id = cp.profile_id
                WHERE cli.workspace_id = $1
                """,
                workspace_id,
            )

            if row and row["image_data"]:
                return bytes(row["image_data"])

            return None

    async def get_logo_image_by_slug(
        self,
        slug: str,
        size: int = 256
    ) -> Optional[bytes]:
        """Get the logo image bytes for a profile by slug (public access).

        Args:
            slug: Profile slug
            size: Requested thumbnail size (64, 128, 256, or 512)

        Returns:
            Image bytes (WebP format) or None if no logo
        """
        if size not in LOGO_THUMBNAIL_SIZES:
            size = 256  # Default to medium size

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            column = f"image_{size}"
            row = await conn.fetchrow(
                f"""
                SELECT {column} as image_data
                FROM company_logo_images cli
                JOIN company_profiles cp ON cli.profile_id = cp.profile_id
                WHERE cp.slug = $1
                """,
                slug,
            )

            if row and row["image_data"]:
                return bytes(row["image_data"])

            return None

    def _detect_image_format(self, file_data: bytes) -> Optional[str]:
        """Detect image format from magic bytes."""
        if len(file_data) < 12:
            return None
        
        # JPEG
        if file_data[:3] == b"\xff\xd8\xff":
            return "image/jpeg"
        # PNG
        if file_data[:4] == b"\x89PNG":
            return "image/png"
        # WebP (RIFF....WEBP)
        if file_data[:4] == b"RIFF" and file_data[8:12] == b"WEBP":
            return "image/webp"
        # GIF
        if file_data[:6] in (b"GIF87a", b"GIF89a"):
            return "image/gif"
        
        return None

    @staticmethod
    def generate_public_url(slug: str) -> str:
        """Generate public profile URL for a slug.

        Uses the PUBLIC_URL environment variable from settings.
        Defaults to https://rawdrive.ai if not configured.
        """
        settings = get_settings()
        # Ensure base URL doesn't have trailing slash
        base_url = settings.public_url.rstrip('/')
        return f"{base_url}/p/{slug}"
            
    async def get_public_profile(self, slug: str) -> dict:
        """Get public view of a profile by slug."""
        # Try cache first
        redis = await get_redis_client()
        cache_key = f"public_profile:{slug}"
        
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT cp.*,
                       CASE WHEN cli.logo_id IS NOT NULL THEN true ELSE false END as has_logo_data
                FROM company_profiles cp
                LEFT JOIN company_logo_images cli ON cp.profile_id = cli.profile_id
                WHERE cp.slug = $1
                """,
                slug
            )
            if not row:
                raise CompanyProfileError(f"Profile {slug} not found", "NOT_FOUND", 404)

            data = self._map_row(row)
            
            # Apply visibility filter for public view
            visibility = json.loads(row["company_visibility"])
            filtered = VisibilityFilterService.filter_visible(data, visibility)
            
            # Cache result (1 hour TTL)
            await redis.set(cache_key, json.dumps(filtered, default=str), ex=3600)
            
            return filtered

    async def update_profile(
        self,
        workspace_id: UUID,
        request: UpdateCompanyProfileRequest
    ) -> dict:
        """Update existing company profile."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify existence
            current = await conn.fetchrow(
                "SELECT profile_id, slug FROM company_profiles WHERE workspace_id = $1",
                workspace_id
            )
            if not current:
                raise ProfileNotFoundError(workspace_id)
                
            # Check slug uniqueness if changing
            if request.slug:
                slug_owner = await conn.fetchval(
                    "SELECT workspace_id FROM company_profiles WHERE slug = $1",
                    request.slug
                )
                if slug_owner and str(slug_owner) != str(workspace_id):
                    raise SlugAlreadyExistsError(request.slug)

            # Build update query dynamically
            updates = []
            params = []
            param_idx = 1
            
            fields_map = {
                "name": request.name,
                "tagline": request.tagline,
                "slug": request.slug,
                "logo_url": request.logo_url,
                "favicon_url": request.favicon_url,
                "brand_color": request.brand_color,
                "brand_font": request.brand_font,
                "email": request.email,
                "phone": request.phone,
                "website": request.website
            }
            
            for field, value in fields_map.items():
                if value is not None:
                    updates.append(f"{field} = ${param_idx}")
                    params.append(value)
                    param_idx += 1
            
            # JSONB fields
            if request.address_structured is not None:
                updates.append(f"address_structured = ${param_idx}::jsonb")
                params.append(request.address_structured.model_dump_json())
                param_idx += 1
                
            if request.socials is not None:
                updates.append(f"socials = ${param_idx}::jsonb")
                params.append(json.dumps(request.socials))
                param_idx += 1
                
            if request.custom_links is not None:
                updates.append(f"custom_links = ${param_idx}::jsonb")
                params.append(json.dumps([l.model_dump() for l in request.custom_links]))
                param_idx += 1
                
            if request.company_visibility is not None:
                updates.append(f"company_visibility = ${param_idx}::jsonb")
                params.append(json.dumps(request.company_visibility))
                param_idx += 1
            
            if not updates:
                return await self.get_profile(workspace_id)
                
            updates.append("updated_at = NOW()")
            params.append(workspace_id)

            # Use a CTE to update and then join with logo data
            row = await conn.fetchrow(
                f"""
                WITH updated AS (
                    UPDATE company_profiles
                    SET {', '.join(updates)}
                    WHERE workspace_id = ${param_idx}
                    RETURNING *
                )
                SELECT updated.*,
                       CASE WHEN cli.logo_id IS NOT NULL THEN true ELSE false END as has_logo_data
                FROM updated
                LEFT JOIN company_logo_images cli ON updated.profile_id = cli.profile_id
                """,
                *params
            )
            
            # Invalidate cache
            redis = await get_redis_client()
            
            # Invalidate old slug
            if current and current["slug"]:
                try:
                    await redis.delete(f"public_profile:{current['slug']}")
                except Exception:
                    logger.warning("Failed to invalidate cache for old slug", exc_info=True)
                
            # Invalidate new slug if different
            if request.slug and request.slug != current["slug"]:
                try:
                     await redis.delete(f"public_profile:{request.slug}")
                except Exception:
                    logger.warning("Failed to invalidate cache for new slug", exc_info=True)

            return self._map_row(row)

    async def get_profile_optional(self, workspace_id: UUID) -> Optional[dict]:
        """Get company profile if exists, else None."""
        try:
            return await self.get_profile(workspace_id)
        except ProfileNotFoundError:
            return None

    def _map_row(self, row) -> dict:
        address_data = json.loads(row["address_structured"]) if isinstance(row["address_structured"], str) else row["address_structured"]
        socials = json.loads(row["socials"]) if isinstance(row["socials"], str) else row["socials"]
        custom_links = json.loads(row["custom_links"]) if isinstance(row["custom_links"], str) else row["custom_links"]
        company_visibility = json.loads(row["company_visibility"]) if isinstance(row["company_visibility"], str) else row["company_visibility"]

        # Compute logo_url dynamically based on whether logo data exists in company_logo_images
        # This mirrors how client avatars work - only show URL if actual data exists
        slug = row["slug"]
        has_logo_data = row.get("has_logo_data", False)
        logo_url = None
        if has_logo_data and slug:
            logo_url = f"/api/v1/public/profiles/{slug}/logo/256"

        return {
            "profile_id": str(row["profile_id"]),
            "workspace_id": str(row["workspace_id"]),
            "name": row["name"],
            "tagline": row["tagline"],
            "slug": slug,
            "logo_url": logo_url,
            "favicon_url": row["favicon_url"],
            "brand_color": row["brand_color"],
            "brand_font": row["brand_font"],
            "email": row["email"],
            "phone": row["phone"],
            "website": row["website"],
            "address_structured": address_data if address_data else None,
            "socials": socials,
            "custom_links": custom_links,
            "company_visibility": company_visibility,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }

_service = None

def get_company_profile_service() -> CompanyProfileService:
    global _service
    if not _service:
        _service = CompanyProfileService()
    return _service
