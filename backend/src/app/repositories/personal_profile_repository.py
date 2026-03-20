"""Repository for personal profile data operations.

This module provides the PersonalProfileRepository class that handles all CRUD
operations for personal profiles (digital visiting cards for photographers).

Personal profiles are workspace-scoped AND user-specific, meaning each user
can have one personal profile per workspace.

Feature: Personal Profile Digital Visiting Card
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class PersonalProfileRepository:
    """Data access layer for personal profile records.

    This repository handles all CRUD operations for personal profiles,
    which are the digital visiting cards for photographers.

    Profiles are workspace-scoped AND user-specific:
    - Each user can have ONE profile per workspace
    - Slugs are GLOBALLY unique across all profiles
    """

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_by_id(
        self,
        profile_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a personal profile by ID.

        Args:
            profile_id: Profile ID to retrieve
            workspace_id: Workspace ID for access control

        Returns:
            Profile record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM personal_profiles
                WHERE profile_id = $1 AND workspace_id = $2
                """,
                profile_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_workspace_and_user(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a user's personal profile in a workspace.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            Profile record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM personal_profiles
                WHERE workspace_id = $1 AND user_id = $2
                """,
                workspace_id,
                user_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_slug(
        self,
        slug: str,
    ) -> Optional[dict[str, Any]]:
        """Get a personal profile by slug.

        Slugs are globally unique across all profiles.

        Args:
            slug: Profile slug

        Returns:
            Profile record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM personal_profiles
                WHERE slug = $1
                """,
                slug.lower(),
            )
            return self._row_to_dict(row) if row else None

    async def get_public_by_slug(
        self,
        slug: str,
    ) -> Optional[dict[str, Any]]:
        """Get a public personal profile by slug.

        Only returns profiles where is_public = TRUE.

        Args:
            slug: Profile slug

        Returns:
            Profile record as dict or None if not found/not public
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM personal_profiles
                WHERE slug = $1 AND is_public = TRUE
                """,
                slug.lower(),
            )
            return self._row_to_dict(row) if row else None

    async def check_slug_availability(
        self,
        slug: str,
        exclude_profile_id: Optional[UUID] = None,
    ) -> bool:
        """Check if a slug is available.

        Args:
            slug: Slug to check
            exclude_profile_id: Optional profile ID to exclude (for updates)

        Returns:
            True if available, False if taken
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if exclude_profile_id:
                row = await conn.fetchrow(
                    """
                    SELECT 1 FROM personal_profiles
                    WHERE slug = $1 AND profile_id != $2
                    """,
                    slug.lower(),
                    exclude_profile_id,
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT 1 FROM personal_profiles
                    WHERE slug = $1
                    """,
                    slug.lower(),
                )
            return row is None

    async def list_by_workspace(
        self,
        workspace_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List all personal profiles in a workspace.

        Args:
            workspace_id: Workspace ID
            limit: Max records to return
            offset: Records to skip

        Returns:
            List of profile records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM personal_profiles
                WHERE workspace_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                workspace_id,
                limit,
                offset,
            )
            return [self._row_to_dict(row) for row in rows]

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        workspace_id: UUID,
        user_id: UUID,
        display_name: str,
        slug: str,
        email: str,
        profile_title: Optional[str] = None,
        avatar_url: Optional[str] = None,
        bio: Optional[str] = None,
        location: Optional[str] = None,
        phone: Optional[str] = None,
        website: Optional[str] = None,
        secondary_emails: Optional[list[dict]] = None,
        secondary_phones: Optional[list[dict]] = None,
        address_structured: Optional[dict] = None,
        service_areas: Optional[list[str]] = None,
        socials: Optional[dict[str, str]] = None,
        custom_links: Optional[list[dict]] = None,
        embedded_media: Optional[dict] = None,
        featured_gallery_id: Optional[UUID] = None,
        categories: Optional[list[str]] = None,
        brand_color: Optional[str] = None,
        background_theme: Optional[str] = None,
        visibility_config: Optional[dict[str, bool]] = None,
        is_public: bool = False,
        seo_metadata: Optional[dict] = None,
        booking_calendar_url: Optional[str] = None,
        testimonials: Optional[list[dict]] = None,
    ) -> dict[str, Any]:
        """Create a new personal profile.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            display_name: Display name (required)
            slug: URL slug (required, globally unique)
            email: Primary email (required)
            (other args): Optional profile fields

        Returns:
            Created profile record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            profile_id = uuid4()
            row = await conn.fetchrow(
                """
                INSERT INTO personal_profiles (
                    profile_id, workspace_id, user_id,
                    display_name, profile_title, slug, avatar_url,
                    bio, location,
                    email, phone, website,
                    secondary_emails, secondary_phones,
                    address_structured, service_areas,
                    socials, custom_links, embedded_media,
                    featured_gallery_id, categories,
                    brand_color, background_theme,
                    visibility_config, is_public,
                    seo_metadata, booking_calendar_url,
                    testimonials
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19,
                    $20, $21, $22, $23, $24, $25, $26, $27, $28
                )
                RETURNING *
                """,
                profile_id,
                workspace_id,
                user_id,
                display_name,
                profile_title,
                slug.lower(),
                avatar_url,
                bio,
                location,
                email,
                phone,
                website,
                json.dumps(secondary_emails or []),
                json.dumps(secondary_phones or []),
                json.dumps(address_structured or {}),
                service_areas or [],
                json.dumps(socials or {}),
                json.dumps(custom_links or []),
                json.dumps(embedded_media or {}),
                featured_gallery_id,
                categories or [],
                brand_color,
                background_theme,
                json.dumps(visibility_config or {}),
                is_public,
                json.dumps(seo_metadata or {}),
                booking_calendar_url,
                json.dumps(testimonials or []),
            )

            logger.info(
                "Personal profile created",
                extra={
                    "profile_id": str(profile_id),
                    "workspace_id": str(workspace_id),
                    "user_id": str(user_id),
                    "slug": slug,
                },
            )

            return self._row_to_dict(row)

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        **kwargs: Any,
    ) -> Optional[dict[str, Any]]:
        """Update a personal profile.

        Only updates fields that are explicitly provided.

        Args:
            profile_id: Profile ID to update
            workspace_id: Workspace ID for access control
            **kwargs: Fields to update

        Returns:
            Updated profile record or None if not found
        """
        # Define which fields can be updated
        allowed_fields = {
            "display_name", "profile_title", "slug", "avatar_url",
            "bio", "location", "email", "phone", "website",
            "secondary_emails", "secondary_phones",
            "address_structured", "service_areas",
            "socials", "custom_links", "embedded_media",
            "featured_gallery_id", "categories",
            "brand_color", "background_theme",
            "visibility_config", "is_public",
            "seo_metadata", "booking_calendar_url",
            "section_order", "testimonials",
        }

        # JSONB fields that need serialization
        jsonb_fields = {
            "secondary_emails", "secondary_phones",
            "address_structured", "socials", "custom_links",
            "embedded_media", "visibility_config", "seo_metadata",
            "section_order", "testimonials",
        }

        # Build dynamic update query
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        for field, value in kwargs.items():
            if field in allowed_fields and value is not None:
                # Serialize JSONB fields
                if field in jsonb_fields:
                    value = json.dumps(value)
                # Handle slug lowercase
                elif field == "slug":
                    value = value.lower()

                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            # No fields to update
            return await self.get_by_id(profile_id, workspace_id)

        # Add profile_id and workspace_id as final parameters
        params.append(profile_id)
        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE personal_profiles
                SET {", ".join(updates)}
                WHERE profile_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Personal profile updated",
                    extra={
                        "profile_id": str(profile_id),
                        "workspace_id": str(workspace_id),
                        "updated_fields": list(kwargs.keys()),
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_public_status(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        is_public: bool,
    ) -> Optional[dict[str, Any]]:
        """Update the public status of a profile.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            is_public: New public status

        Returns:
            Updated profile or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE personal_profiles
                SET is_public = $3
                WHERE profile_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                profile_id,
                workspace_id,
                is_public,
            )
            return self._row_to_dict(row) if row else None

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        profile_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete a personal profile.

        Args:
            profile_id: Profile ID to delete
            workspace_id: Workspace ID for access control

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM personal_profiles
                WHERE profile_id = $1 AND workspace_id = $2
                """,
                profile_id,
                workspace_id,
            )

            deleted = result == "DELETE 1"
            if deleted:
                logger.info(
                    "Personal profile deleted",
                    extra={
                        "profile_id": str(profile_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    # =========================================================================
    # AVATAR OPERATIONS
    # =========================================================================

    async def save_avatar_images(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        image_64: bytes,
        image_128: bytes,
        image_256: bytes,
        image_512: bytes,
        content_type: str = "image/webp",
        r2_key_64: Optional[str] = None,
        r2_key_128: Optional[str] = None,
        r2_key_256: Optional[str] = None,
        r2_key_512: Optional[str] = None,
    ) -> bool:
        """Save avatar images at multiple sizes.

        Uses UPSERT to replace existing avatar if present.
        Optionally stores R2 object keys alongside PG blobs for lazy migration.

        Args:
            workspace_id: Workspace ID
            profile_id: Profile ID
            image_64: 64x64 thumbnail bytes
            image_128: 128x128 thumbnail bytes
            image_256: 256x256 thumbnail bytes
            image_512: 512x512 high-res bytes
            content_type: Image MIME type
            r2_key_64: Optional R2 object key for 64px avatar
            r2_key_128: Optional R2 object key for 128px avatar
            r2_key_256: Optional R2 object key for 256px avatar
            r2_key_512: Optional R2 object key for 512px avatar

        Returns:
            True if saved successfully
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO personal_profile_avatars (
                    avatar_id, workspace_id, profile_id,
                    image_64, image_128, image_256, image_512,
                    content_type,
                    r2_key_64, r2_key_128, r2_key_256, r2_key_512
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11
                )
                ON CONFLICT (workspace_id, profile_id)
                DO UPDATE SET
                    image_64 = $3,
                    image_128 = $4,
                    image_256 = $5,
                    image_512 = $6,
                    content_type = $7,
                    r2_key_64 = $8,
                    r2_key_128 = $9,
                    r2_key_256 = $10,
                    r2_key_512 = $11,
                    updated_at = NOW()
                """,
                workspace_id,
                profile_id,
                image_64,
                image_128,
                image_256,
                image_512,
                content_type,
                r2_key_64,
                r2_key_128,
                r2_key_256,
                r2_key_512,
            )

            logger.info(
                "Personal profile avatar saved",
                extra={
                    "profile_id": str(profile_id),
                    "workspace_id": str(workspace_id),
                    "has_r2_keys": r2_key_64 is not None,
                },
            )

            return True

    # Safe column mapping for avatar sizes (prevents SQL injection)
    AVATAR_SIZE_COLUMNS = {
        64: "image_64",
        128: "image_128",
        256: "image_256",
        512: "image_512",
    }

    # R2 key column mapping by size
    R2_KEY_COLUMNS = {
        64: "r2_key_64",
        128: "r2_key_128",
        256: "r2_key_256",
        512: "r2_key_512",
    }

    async def get_avatar_image(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        size: int = 256,
    ) -> Optional[tuple[bytes, str]]:
        """Get avatar image at specified size.

        Args:
            workspace_id: Workspace ID
            profile_id: Profile ID
            size: Image size (64, 128, 256, or 512)

        Returns:
            Tuple of (image_bytes, content_type) or None
        """
        # Use explicit column mapping instead of f-string to prevent SQL injection
        size_column = self.AVATAR_SIZE_COLUMNS.get(size, "image_256")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                SELECT {size_column}, content_type
                FROM personal_profile_avatars
                WHERE workspace_id = $1 AND profile_id = $2
                """,
                workspace_id,
                profile_id,
            )

            if row and row[size_column]:
                return (row[size_column], row["content_type"])
            return None

    async def get_avatar_image_by_slug(
        self,
        slug: str,
        size: int = 256,
    ) -> Optional[dict[str, Any]]:
        """Get public avatar image by profile slug.

        Only returns avatar if profile is public.
        Returns a dict with image_data, content_type, and r2_key so the
        service layer can decide whether to redirect to R2 or serve the PG blob.

        Args:
            slug: Profile slug
            size: Image size (64, 128, 256, or 512)

        Returns:
            Dict with image_data (bytes|None), content_type, r2_key (str|None)
            or None if no avatar found
        """
        # Use explicit column mapping instead of f-string to prevent SQL injection
        size_column = self.AVATAR_SIZE_COLUMNS.get(size, "image_256")
        r2_key_column = self.R2_KEY_COLUMNS.get(size, "r2_key_256")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                SELECT a.{size_column}, a.content_type, a.{r2_key_column}
                FROM personal_profile_avatars a
                JOIN personal_profiles p ON a.profile_id = p.profile_id
                WHERE p.slug = $1 AND p.is_public = TRUE
                """,
                slug.lower(),
            )

            if row and (row[size_column] or row[r2_key_column]):
                return {
                    "image_data": row[size_column],
                    "content_type": row["content_type"],
                    "r2_key": row[r2_key_column],
                }
            return None

    async def delete_avatar(
        self,
        workspace_id: UUID,
        profile_id: UUID,
    ) -> bool:
        """Delete avatar images for a profile.

        Args:
            workspace_id: Workspace ID
            profile_id: Profile ID

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM personal_profile_avatars
                WHERE workspace_id = $1 AND profile_id = $2
                """,
                workspace_id,
                profile_id,
            )

            deleted = result == "DELETE 1"
            if deleted:
                logger.info(
                    "Personal profile avatar deleted",
                    extra={
                        "profile_id": str(profile_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary.

        Handles type conversions for UUIDs, datetimes, and JSONB.

        Args:
            row: asyncpg Record object

        Returns:
            Dictionary representation of the row
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = ["profile_id", "workspace_id", "user_id", "featured_gallery_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert datetimes to ISO format strings
        datetime_fields = ["created_at", "updated_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Parse JSONB fields that may be returned as strings
        jsonb_fields = [
            "secondary_emails", "secondary_phones", "address_structured",
            "socials", "custom_links", "embedded_media", "visibility_config",
            "seo_metadata", "section_order", "testimonials"
        ]
        for field in jsonb_fields:
            if field in result and result[field] is not None:
                if isinstance(result[field], str):
                    try:
                        result[field] = json.loads(result[field])
                    except (json.JSONDecodeError, TypeError):
                        pass  # Keep as-is if parsing fails

        # Ensure array fields are never None (default to empty list)
        array_fields = ["service_areas", "categories", "badges"]
        for field in array_fields:
            if field in result and result[field] is None:
                result[field] = []

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_personal_profile_repository: Optional[PersonalProfileRepository] = None


def get_personal_profile_repository() -> PersonalProfileRepository:
    """Get the singleton PersonalProfileRepository instance.

    Returns:
        PersonalProfileRepository singleton instance
    """
    global _personal_profile_repository
    if _personal_profile_repository is None:
        _personal_profile_repository = PersonalProfileRepository()
    return _personal_profile_repository
