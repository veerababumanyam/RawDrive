"""Company Profile Service.

Manages the single source of truth for company branding.
"""

from __future__ import annotations

import logging
import json
from uuid import UUID
from typing import Optional

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.api.company_profile_schemas import (
    CreateCompanyProfileRequest,
    UpdateCompanyProfileRequest,
    CompanyAddress
)
from app.services.visibility_service import VisibilityFilterService

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
            # Check slug uniqueness globally
            slug_exists = await conn.fetchval(
                "SELECT 1 FROM company_profiles WHERE slug = $1",
                request.slug
            )
            if slug_exists:
                raise SlugAlreadyExistsError(request.slug)
                
            # Check if profile already exists for workspace (1:1 relationship)
            exists = await conn.fetchval(
                "SELECT 1 FROM company_profiles WHERE workspace_id = $1",
                workspace_id
            )
            if exists:
                raise CompanyProfileError("Profile already exists for this workspace", "PROFILE_EXISTS", 409)

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
                "SELECT * FROM company_profiles WHERE workspace_id = $1",
                workspace_id
            )
            if not row:
                raise ProfileNotFoundError(workspace_id)
            
            return self._map_row(row)

    @staticmethod
    def generate_public_url(slug: str) -> str:
        """Generate public profile URL for a slug.
        
        TODO: Use configured base URL from settings (Requirement 4.1).
        Currently hardcoded to lumina.co per spec.
        """
        return f"https://lumina.co/p/{slug}"
            
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
                "SELECT * FROM company_profiles WHERE slug = $1",
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
            
            row = await conn.fetchrow(
                f"""
                UPDATE company_profiles
                SET {', '.join(updates)}
                WHERE workspace_id = ${param_idx}
                RETURNING *
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
        
        return {
            "profile_id": str(row["profile_id"]),
            "workspace_id": str(row["workspace_id"]),
            "name": row["name"],
            "tagline": row["tagline"],
            "slug": row["slug"],
            "logo_url": row["logo_url"],
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
