"""Repository for invitation data operations.

This module provides the InvitationRepository class that handles all CRUD
operations for digital invitations, templates, images, and guests with
proper workspace isolation for multi-tenant security.

Security considerations:
- All queries enforce workspace_id filtering
- Password/PIN hashes stored separately (never plaintext)
- Slug uniqueness enforced per workspace

Feature: 016-save-the-date
"""

from __future__ import annotations

import json
import logging
import re
import secrets
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import argon2

from app.db.postgres import get_postgres_pool


# Password hasher configuration per CLAUDE.md security requirements
_password_hasher = argon2.PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
)


logger = logging.getLogger(__name__)


class InvitationRepository:
    """Data access layer for invitation records.

    This repository handles all CRUD operations for invitations, templates,
    images, and guests, ensuring proper workspace isolation.
    """

    # =========================================================================
    # TEMPLATE OPERATIONS
    # =========================================================================

    async def create_template(
        self,
        workspace_id: Optional[UUID],
        name: str,
        slug: str,
        category: str,
        layout: dict[str, Any],
        description: Optional[str] = None,
        subcategory: Optional[str] = None,
        tags: Optional[list[str]] = None,
        content_i18n: Optional[dict] = None,
        supported_languages: Optional[list[str]] = None,
        preview_image_url: Optional[str] = None,
        thumbnail_url: Optional[str] = None,
        is_premium: bool = False,
        created_by_user_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new invitation template.

        Args:
            workspace_id: Workspace ID (NULL for system templates)
            name: Template name
            slug: URL-friendly slug
            category: Template category
            layout: Layout configuration (JSONB)
            Other params as documented

        Returns:
            Created template record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO invitation_templates (
                    workspace_id, name, slug, description, category, subcategory,
                    tags, layout, content_i18n, supported_languages,
                    preview_image_url, thumbnail_url, is_premium, created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING *
                """,
                workspace_id,
                name,
                slug,
                description,
                category,
                subcategory,
                tags or [],
                json.dumps(layout),
                json.dumps(content_i18n or {}),
                supported_languages or ["en-IN"],
                preview_image_url,
                thumbnail_url,
                is_premium,
                created_by_user_id,
            )

            logger.info(
                "Template created",
                extra={
                    "template_id": str(row["template_id"]),
                    "workspace_id": str(workspace_id) if workspace_id else "system",
                },
            )

            return self._row_to_dict(row)

    async def get_template_by_id(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Get template by ID.

        Args:
            template_id: Template ID
            workspace_id: If provided, also checks workspace ownership

        Returns:
            Template record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if workspace_id:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM invitation_templates
                    WHERE template_id = $1
                      AND (workspace_id = $2 OR workspace_id IS NULL)
                      AND is_active = true
                    """,
                    template_id,
                    workspace_id,
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM invitation_templates
                    WHERE template_id = $1 AND is_active = true
                    """,
                    template_id,
                )

            return self._row_to_dict(row) if row else None

    async def list_templates(
        self,
        workspace_id: Optional[UUID] = None,
        category: Optional[str] = None,
        include_system: bool = True,
        include_premium: bool = True,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """List templates with filtering.

        Args:
            workspace_id: Filter by workspace (also includes system templates)
            category: Filter by category
            include_system: Include system-level templates
            include_premium: Include premium templates
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Tuple of (templates list, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build WHERE clause
            conditions = ["is_active = true"]
            params: list[Any] = []
            param_idx = 1

            if workspace_id:
                if include_system:
                    conditions.append(f"(workspace_id = ${param_idx} OR workspace_id IS NULL)")
                else:
                    conditions.append(f"workspace_id = ${param_idx}")
                params.append(workspace_id)
                param_idx += 1
            elif not include_system:
                conditions.append("workspace_id IS NOT NULL")

            if category:
                conditions.append(f"category = ${param_idx}")
                params.append(category)
                param_idx += 1

            if not include_premium:
                conditions.append("is_premium = false")

            where_clause = " AND ".join(conditions)

            # Count total
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM invitation_templates WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            # Fetch page
            offset = (page - 1) * limit
            rows = await conn.fetch(
                f"""
                SELECT * FROM invitation_templates
                WHERE {where_clause}
                ORDER BY workspace_id NULLS FIRST, created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return [self._row_to_dict(r) for r in rows], total

    async def update_template(
        self,
        template_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update a template.

        Args:
            template_id: Template ID
            workspace_id: Workspace ID (must own template)
            **updates: Fields to update

        Returns:
            Updated template or None if not found/not owned
        """
        if not updates:
            return await self.get_template_by_id(template_id, workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build SET clause
            set_parts = []
            params = []
            param_idx = 1

            for key, value in updates.items():
                if key in ("layout", "content_i18n") and isinstance(value, dict):
                    value = json.dumps(value)
                set_parts.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

            set_parts.append("updated_at = NOW()")
            set_clause = ", ".join(set_parts)

            row = await conn.fetchrow(
                f"""
                UPDATE invitation_templates
                SET {set_clause}
                WHERE template_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                RETURNING *
                """,
                *params,
                template_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    # =========================================================================
    # INVITATION OPERATIONS
    # =========================================================================

    async def create_invitation(
        self,
        workspace_id: UUID,
        title: str,
        event_datetime: datetime,
        created_by_user_id: UUID,
        template_id: Optional[UUID] = None,
        slug: Optional[str] = None,
        description: Optional[str] = None,
        event_type: str = "wedding",
        event_end_datetime: Optional[datetime] = None,
        event_timezone: str = "Asia/Kolkata",
        venue_name: Optional[str] = None,
        venue_address: Optional[str] = None,
        venue_city: Optional[str] = None,
        venue_state: Optional[str] = None,
        venue_country: str = "India",
        venue_postal_code: Optional[str] = None,
        venue_latitude: Optional[float] = None,
        venue_longitude: Optional[float] = None,
        venue_map_url: Optional[str] = None,
        host_names: Optional[list[str]] = None,
        host_contact_phone: Optional[str] = None,
        host_contact_email: Optional[str] = None,
        rsvp_enabled: bool = True,
        rsvp_deadline: Optional[datetime] = None,
        rsvp_max_party_size: int = 10,
        rsvp_collect_dietary: bool = False,
        rsvp_collect_phone: bool = False,
        rsvp_custom_questions: Optional[list[dict]] = None,
        primary_language: str = "en-IN",
        secondary_language: Optional[str] = None,
        customization: Optional[dict] = None,
        content_i18n: Optional[dict] = None,
        auto_delete_enabled: bool = True,
        auto_delete_days: int = 7,
        video_object_key: Optional[str] = None,
        audio_object_key: Optional[str] = None,
        layout_density: str = "normal",
        font_heading: str = "Playfair Display",
        font_body: str = "Lora",
        ai_generated_content: Optional[dict] = None,
        has_sub_events: bool = False,
    ) -> dict[str, Any]:
        """Create a new invitation.

        Returns:
            Created invitation record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Generate slug if not provided
            if not slug:
                slug = self._generate_slug(title)

            # Ensure slug uniqueness within workspace
            slug = await self._ensure_unique_slug(conn, workspace_id, slug)

            row = await conn.fetchrow(
                """
                INSERT INTO digital_invitations (
                    workspace_id, template_id, title, slug, description,
                    event_type, event_datetime, event_end_datetime, event_timezone,
                    venue_name, venue_address, venue_city, venue_state,
                    venue_country, venue_postal_code, venue_latitude, venue_longitude,
                    venue_map_url, host_names, host_contact_phone, host_contact_email,
                    rsvp_enabled, rsvp_deadline, rsvp_max_party_size,
                    rsvp_collect_dietary, rsvp_collect_phone, rsvp_custom_questions,
                    primary_language, secondary_language, customization, content_i18n,
                    auto_delete_enabled, auto_delete_days, created_by_user_id,
                    video_object_key, audio_object_key, layout_density,
                    font_heading, font_body, ai_generated_content, has_sub_events
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                    $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
                )
                RETURNING *
                """,
                workspace_id,
                template_id,
                title,
                slug,
                description,
                event_type,
                event_datetime,
                event_end_datetime,
                event_timezone,
                venue_name,
                venue_address,
                venue_city,
                venue_state,
                venue_country,
                venue_postal_code,
                venue_latitude,
                venue_longitude,
                venue_map_url,
                host_names or [],
                host_contact_phone,
                host_contact_email,
                rsvp_enabled,
                rsvp_deadline,
                rsvp_max_party_size,
                rsvp_collect_dietary,
                rsvp_collect_phone,
                json.dumps(rsvp_custom_questions or []),
                primary_language,
                secondary_language,
                json.dumps(customization or {}),
                json.dumps(content_i18n or {}),
                auto_delete_enabled,
                auto_delete_days,
                created_by_user_id,
                video_object_key,
                audio_object_key,
                layout_density,
                font_heading,
                font_body,
                json.dumps(ai_generated_content or {}),
                has_sub_events,
            )

            logger.info(
                "Invitation created",
                extra={
                    "invitation_id": str(row["invitation_id"]),
                    "workspace_id": str(workspace_id),
                    "title": title,
                },
            )

            return self._row_to_dict(row)

    async def get_invitation_by_id(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get invitation by ID within a workspace.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Invitation record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT i.*, t.name as template_name, t.layout as template_layout
                FROM digital_invitations i
                LEFT JOIN invitation_templates t ON t.template_id = i.template_id
                WHERE i.invitation_id = $1 AND i.workspace_id = $2
                  AND i.status != 'deleted'
                """,
                invitation_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    # Alias for backward compatibility with RSVP service
    get_by_id = get_invitation_by_id

    async def increment_rsvp_count(self, invitation_id: UUID) -> None:
        """Increment the RSVP count for an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE digital_invitations
                SET rsvp_count = COALESCE(rsvp_count, 0) + 1,
                    updated_at = NOW()
                WHERE invitation_id = $1
                """,
                invitation_id,
            )

    async def decrement_rsvp_count(self, invitation_id: UUID) -> None:
        """Decrement the RSVP count for an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE digital_invitations
                SET rsvp_count = GREATEST(COALESCE(rsvp_count, 0) - 1, 0),
                    updated_at = NOW()
                WHERE invitation_id = $1
                """,
                invitation_id,
            )

    async def get_invitation_by_slug(
        self,
        slug: str,
        workspace_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Get invitation by slug.

        Args:
            slug: Invitation slug
            workspace_id: Optional workspace filter

        Returns:
            Invitation record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if workspace_id:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM digital_invitations
                    WHERE slug = $1 AND workspace_id = $2 AND status != 'deleted'
                    """,
                    slug,
                    workspace_id,
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM digital_invitations
                    WHERE slug = $1 AND status = 'published'
                    """,
                    slug,
                )

            return self._row_to_dict(row) if row else None

    async def list_invitations(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
        event_type: Optional[str] = None,
        search: Optional[str] = None,
        upcoming_only: bool = False,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """List invitations with filtering.

        Args:
            workspace_id: Workspace ID
            status: Filter by status
            event_type: Filter by event type
            search: Search in title (case-insensitive)
            upcoming_only: Only show future events
            page: Page number
            limit: Items per page

        Returns:
            Tuple of (invitations list, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            conditions = ["workspace_id = $1", "status != 'deleted'"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status:
                conditions.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if event_type:
                conditions.append(f"event_type = ${param_idx}")
                params.append(event_type)
                param_idx += 1

            if search:
                conditions.append(f"title ILIKE ${param_idx}")
                params.append(f"%{search}%")
                param_idx += 1

            if upcoming_only:
                conditions.append(f"event_datetime >= ${param_idx}")
                params.append(datetime.now(timezone.utc))
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM digital_invitations WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            # Fetch
            offset = (page - 1) * limit
            rows = await conn.fetch(
                f"""
                SELECT i.*,
                       (SELECT url FROM invitation_images
                        WHERE invitation_id = i.invitation_id AND purpose = 'cover'
                        ORDER BY position LIMIT 1) as cover_image_url
                FROM digital_invitations i
                WHERE {where_clause}
                ORDER BY event_datetime DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return [self._row_to_dict(r) for r in rows], total

    async def update_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            **updates: Fields to update

        Returns:
            Updated invitation or None
        """
        if not updates:
            return await self.get_invitation_by_id(invitation_id, workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            set_parts = []
            params = []
            param_idx = 1

            for key, value in updates.items():
                if key in ("customization", "content_i18n", "rsvp_custom_questions", "ai_generated_content"):
                    if isinstance(value, (dict, list)):
                        value = json.dumps(value)
                set_parts.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

            set_parts.append("updated_at = NOW()")
            set_clause = ", ".join(set_parts)

            row = await conn.fetchrow(
                f"""
                UPDATE digital_invitations
                SET {set_clause}
                WHERE invitation_id = ${param_idx}
                  AND workspace_id = ${param_idx + 1}
                  AND status != 'deleted'
                RETURNING *
                """,
                *params,
                invitation_id,
                workspace_id,
            )

            if row:
                logger.info(
                    "Invitation updated",
                    extra={
                        "invitation_id": str(invitation_id),
                        "fields": list(updates.keys()),
                    },
                )

            return self._row_to_dict(row) if row else None

    async def publish_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        magic_link_id: Optional[UUID] = None,
        public_url: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Publish an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            magic_link_id: Associated magic link ID
            public_url: Public access URL

        Returns:
            Updated invitation or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE digital_invitations
                SET status = 'published',
                    published_at = NOW(),
                    magic_link_id = COALESCE($3, magic_link_id),
                    public_url = COALESCE($4, public_url),
                    updated_at = NOW()
                WHERE invitation_id = $1 AND workspace_id = $2
                  AND status = 'draft'
                RETURNING *
                """,
                invitation_id,
                workspace_id,
                magic_link_id,
                public_url,
            )

            if row:
                logger.info(
                    "Invitation published",
                    extra={"invitation_id": str(invitation_id)},
                )

            return self._row_to_dict(row) if row else None

    async def unpublish_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Unpublish an invitation (back to draft)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE digital_invitations
                SET status = 'draft',
                    published_at = NULL,
                    updated_at = NOW()
                WHERE invitation_id = $1 AND workspace_id = $2
                  AND status = 'published'
                RETURNING *
                """,
                invitation_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    async def archive_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Archive an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE digital_invitations
                SET status = 'archived',
                    archived_at = NOW(),
                    updated_at = NOW()
                WHERE invitation_id = $1 AND workspace_id = $2
                  AND status IN ('draft', 'published')
                RETURNING *
                """,
                invitation_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    async def delete_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Soft delete an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE digital_invitations
                SET status = 'deleted', updated_at = NOW()
                WHERE invitation_id = $1 AND workspace_id = $2
                  AND status != 'deleted'
                """,
                invitation_id,
                workspace_id,
            )

            deleted = result.split()[-1] != "0"
            if deleted:
                logger.info(
                    "Invitation deleted",
                    extra={"invitation_id": str(invitation_id)},
                )

            return deleted

    async def increment_view_count(
        self,
        invitation_id: UUID,
        unique: bool = False,
    ) -> None:
        """Increment view counter for an invitation.

        Note: This method is called after the invitation has been fetched
        and validated (including workspace check for authenticated access,
        or public access validation). The invitation_id is already verified.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if unique:
                await conn.execute(
                    """
                    UPDATE digital_invitations
                    SET view_count = view_count + 1,
                        unique_view_count = unique_view_count + 1
                    WHERE invitation_id = $1
                      AND status = 'published'
                    """,
                    invitation_id,
                )
            else:
                await conn.execute(
                    """
                    UPDATE digital_invitations
                    SET view_count = view_count + 1
                    WHERE invitation_id = $1
                      AND status = 'published'
                    """,
                    invitation_id,
                )

    # =========================================================================
    # IMAGE OPERATIONS
    # =========================================================================

    async def add_image(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        object_key: str,
        url: str,
        filename: str,
        mime_type: str,
        size_bytes: int,
        purpose: str = "gallery",
        position: int = 0,
        thumbnail_url: Optional[str] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        uploaded_by_user_id: Optional[UUID] = None,
        og_image_url: Optional[str] = None,
        og_object_key: Optional[str] = None,
    ) -> dict[str, Any]:
        """Add an image to an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO invitation_images (
                    invitation_id, workspace_id, object_key, url, thumbnail_url,
                    filename, mime_type, size_bytes, width, height,
                    position, purpose, uploaded_by_user_id,
                    og_image_url, og_object_key
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING *
                """,
                invitation_id,
                workspace_id,
                object_key,
                url,
                thumbnail_url,
                filename,
                mime_type,
                size_bytes,
                width,
                height,
                position,
                purpose,
                uploaded_by_user_id,
                og_image_url,
                og_object_key,
            )

            return self._row_to_dict(row)

    async def update_image_og(
        self,
        image_id: UUID,
        workspace_id: UUID,
        og_image_url: str,
        og_object_key: str,
    ) -> Optional[dict[str, Any]]:
        """Update an image's OG (Open Graph) variant URLs."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE invitation_images
                SET og_image_url = $1, og_object_key = $2
                WHERE image_id = $3 AND workspace_id = $4
                RETURNING *
                """,
                og_image_url,
                og_object_key,
                image_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_images(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        purpose: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """List images for an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if purpose:
                rows = await conn.fetch(
                    """
                    SELECT * FROM invitation_images
                    WHERE invitation_id = $1 AND workspace_id = $2 AND purpose = $3
                    ORDER BY position
                    """,
                    invitation_id,
                    workspace_id,
                    purpose,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM invitation_images
                    WHERE invitation_id = $1 AND workspace_id = $2
                    ORDER BY purpose, position
                    """,
                    invitation_id,
                    workspace_id,
                )

            return [self._row_to_dict(r) for r in rows]

    async def delete_image(
        self,
        image_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Delete an image and return its info (for storage cleanup)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                DELETE FROM invitation_images
                WHERE image_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                image_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    async def reorder_images(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        image_ids: list[UUID],
    ) -> None:
        """Reorder images by updating positions."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            for position, image_id in enumerate(image_ids):
                await conn.execute(
                    """
                    UPDATE invitation_images
                    SET position = $1
                    WHERE image_id = $2
                      AND invitation_id = $3
                      AND workspace_id = $4
                    """,
                    position,
                    image_id,
                    invitation_id,
                    workspace_id,
                )

    # =========================================================================
    # GUEST OPERATIONS
    # =========================================================================

    async def add_guest(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        name: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        salutation: Optional[str] = None,
        group_name: Optional[str] = None,
        personalized_message: Optional[str] = None,
        expected_party_size: int = 1,
    ) -> dict[str, Any]:
        """Add a guest to the invitation's guest list."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Generate personal token for tracking
            personal_token = secrets.token_urlsafe(32)

            row = await conn.fetchrow(
                """
                INSERT INTO invitation_guests (
                    invitation_id, workspace_id, name, email, phone,
                    salutation, group_name, personalized_message,
                    expected_party_size, personal_token
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
                """,
                invitation_id,
                workspace_id,
                name,
                email,
                phone,
                salutation,
                group_name,
                personalized_message,
                expected_party_size,
                personal_token,
            )

            return self._row_to_dict(row)

    async def bulk_add_guests(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        guests: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Add multiple guests at once."""
        pool = await get_postgres_pool()
        results = []

        async with pool.acquire() as conn:
            async with conn.transaction():
                for guest in guests:
                    personal_token = secrets.token_urlsafe(32)

                    row = await conn.fetchrow(
                        """
                        INSERT INTO invitation_guests (
                            invitation_id, workspace_id, name, email, phone,
                            salutation, group_name, personalized_message,
                            expected_party_size, personal_token
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (invitation_id, email)
                        WHERE email IS NOT NULL
                        DO NOTHING
                        RETURNING *
                        """,
                        invitation_id,
                        workspace_id,
                        guest["name"],
                        guest.get("email"),
                        guest.get("phone"),
                        guest.get("salutation"),
                        guest.get("group_name"),
                        guest.get("personalized_message"),
                        guest.get("expected_party_size", 1),
                        personal_token,
                    )

                    if row:
                        results.append(self._row_to_dict(row))

        logger.info(
            "Bulk guests added",
            extra={
                "invitation_id": str(invitation_id),
                "count": len(results),
            },
        )

        return results

    async def get_guest_by_id(
        self,
        guest_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get guest by ID."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invitation_guests
                WHERE guest_id = $1 AND workspace_id = $2
                """,
                guest_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    async def get_guest_by_token(
        self,
        personal_token: str,
    ) -> Optional[dict[str, Any]]:
        """Get guest by personal token (for personalized links)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT g.*, i.title as invitation_title, i.status as invitation_status
                FROM invitation_guests g
                JOIN digital_invitations i ON i.invitation_id = g.invitation_id
                WHERE g.personal_token = $1
                """,
                personal_token,
            )

            return self._row_to_dict(row) if row else None

    async def list_guests(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        group_name: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        """List guests for an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            conditions = ["invitation_id = $1", "workspace_id = $2"]
            params: list[Any] = [invitation_id, workspace_id]
            param_idx = 3

            if group_name:
                conditions.append(f"group_name = ${param_idx}")
                params.append(group_name)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM invitation_guests WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            offset = (page - 1) * limit
            rows = await conn.fetch(
                f"""
                SELECT * FROM invitation_guests
                WHERE {where_clause}
                ORDER BY group_name NULLS LAST, name
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return [self._row_to_dict(r) for r in rows], total

    async def update_guest(
        self,
        guest_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update a guest."""
        if not updates:
            return await self.get_guest_by_id(guest_id, workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            set_parts = []
            params = []
            param_idx = 1

            for key, value in updates.items():
                set_parts.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

            set_parts.append("updated_at = NOW()")
            set_clause = ", ".join(set_parts)

            row = await conn.fetchrow(
                f"""
                UPDATE invitation_guests
                SET {set_clause}
                WHERE guest_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                RETURNING *
                """,
                *params,
                guest_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    async def mark_guest_invitation_sent(
        self,
        guest_id: UUID,
        workspace_id: UUID,
    ) -> None:
        """Mark that invitation was sent to guest."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE invitation_guests
                SET invitation_sent = true, invitation_sent_at = NOW(), updated_at = NOW()
                WHERE guest_id = $1 AND workspace_id = $2
                """,
                guest_id,
                workspace_id,
            )

    async def mark_guest_invitation_viewed(
        self,
        guest_id: UUID,
    ) -> None:
        """Mark that guest viewed their personalized invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE invitation_guests
                SET invitation_viewed = true,
                    invitation_viewed_at = COALESCE(invitation_viewed_at, NOW()),
                    updated_at = NOW()
                WHERE guest_id = $1 AND invitation_viewed = false
                """,
                guest_id,
            )

    async def delete_guest(
        self,
        guest_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete a guest from the list."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM invitation_guests
                WHERE guest_id = $1 AND workspace_id = $2
                """,
                guest_id,
                workspace_id,
            )

            return result.split()[-1] != "0"

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _generate_slug(self, title: str) -> str:
        """Generate URL-friendly slug from title."""
        import re

        # Convert to lowercase and replace spaces with hyphens
        slug = title.lower().strip()
        slug = re.sub(r"[^\w\s-]", "", slug)  # Remove special chars
        slug = re.sub(r"[\s_]+", "-", slug)  # Replace spaces/underscores with hyphens
        slug = re.sub(r"-+", "-", slug)  # Remove consecutive hyphens
        slug = slug.strip("-")  # Remove leading/trailing hyphens

        # Add random suffix for uniqueness
        suffix = secrets.token_hex(4)
        return f"{slug[:50]}-{suffix}" if slug else suffix

    async def _ensure_unique_slug(
        self,
        conn: Any,
        workspace_id: UUID,
        slug: str,
    ) -> str:
        """Ensure slug is unique within workspace, appending suffix if needed."""
        original_slug = slug
        counter = 1

        while True:
            existing = await conn.fetchrow(
                """
                SELECT 1 FROM digital_invitations
                WHERE workspace_id = $1 AND slug = $2 AND status != 'deleted'
                """,
                workspace_id,
                slug,
            )

            if not existing:
                return slug

            slug = f"{original_slug}-{counter}"
            counter += 1

            if counter > 100:
                # Fallback to random suffix
                return f"{original_slug}-{secrets.token_hex(4)}"

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert database row to dictionary with JSON parsing."""
        if row is None:
            return {}

        result = dict(row)

        # Parse JSONB fields
        for key in (
            "layout",
            "content_i18n",
            "customization",
            "rsvp_custom_questions",
            "qr_config",
            "gradient_config",
            "animation_config",
            "ai_generated_content",
        ):
            if key in result and isinstance(result[key], str):
                try:
                    result[key] = json.loads(result[key])
                except (json.JSONDecodeError, TypeError):
                    pass

        return result

    # =========================================================================
    # PASSWORD/PIN PROTECTION METHODS
    # =========================================================================

    async def set_password(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        password: str,
    ) -> bool:
        """Set password protection for an invitation.

        Args:
            invitation_id: Invitation UUID
            workspace_id: Workspace UUID for tenant isolation
            password: Plaintext password to hash and store

        Returns:
            True if password was set successfully
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Hash password with argon2
            password_hash = _password_hasher.hash(password)

            result = await conn.execute(
                """
                UPDATE digital_invitations
                SET password_protected = TRUE,
                    password_hash = $3,
                    updated_at = NOW()
                WHERE invitation_id = $1
                  AND workspace_id = $2
                  AND status != 'deleted'
                """,
                invitation_id,
                workspace_id,
                password_hash,
            )

            return result == "UPDATE 1"

    async def verify_password(
        self,
        invitation_id: UUID,
        password: str,
    ) -> bool:
        """Verify password for an invitation.

        Args:
            invitation_id: Invitation UUID
            password: Plaintext password to verify

        Returns:
            True if password matches

        Note:
            This method is used for public access verification,
            so it doesn't require workspace_id (the invitation
            was already fetched and validated).
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT password_hash
                FROM digital_invitations
                WHERE invitation_id = $1
                  AND password_protected = TRUE
                  AND status = 'published'
                """,
                invitation_id,
            )

            if not row or not row["password_hash"]:
                return False

            try:
                _password_hasher.verify(row["password_hash"], password)
                return True
            except argon2.exceptions.VerifyMismatchError:
                return False
            except argon2.exceptions.VerificationError:
                logger.warning(
                    "Password verification error for invitation %s",
                    invitation_id,
                )
                return False

    async def remove_password(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Remove password protection from an invitation.

        Args:
            invitation_id: Invitation UUID
            workspace_id: Workspace UUID for tenant isolation

        Returns:
            True if password was removed successfully
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE digital_invitations
                SET password_protected = FALSE,
                    password_hash = NULL,
                    updated_at = NOW()
                WHERE invitation_id = $1
                  AND workspace_id = $2
                  AND status != 'deleted'
                """,
                invitation_id,
                workspace_id,
            )

            return result == "UPDATE 1"

    async def set_pin(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        pin: str,
    ) -> bool:
        """Set PIN protection for an invitation.

        Args:
            invitation_id: Invitation UUID
            workspace_id: Workspace UUID for tenant isolation
            pin: Plaintext PIN to hash and store (typically 4-6 digits)

        Returns:
            True if PIN was set successfully
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Hash PIN with argon2 (same as password)
            pin_hash = _password_hasher.hash(pin)

            result = await conn.execute(
                """
                UPDATE digital_invitations
                SET pin_hash = $3,
                    updated_at = NOW()
                WHERE invitation_id = $1
                  AND workspace_id = $2
                  AND status != 'deleted'
                """,
                invitation_id,
                workspace_id,
                pin_hash,
            )

            return result == "UPDATE 1"

    async def verify_pin(
        self,
        invitation_id: UUID,
        pin: str,
    ) -> bool:
        """Verify PIN for an invitation.

        Args:
            invitation_id: Invitation UUID
            pin: Plaintext PIN to verify

        Returns:
            True if PIN matches

        Note:
            This method is used for public access verification,
            so it doesn't require workspace_id.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT pin_hash
                FROM digital_invitations
                WHERE invitation_id = $1
                  AND status = 'published'
                """,
                invitation_id,
            )

            if not row or not row["pin_hash"]:
                return False

            try:
                _password_hasher.verify(row["pin_hash"], pin)
                return True
            except argon2.exceptions.VerifyMismatchError:
                return False
            except argon2.exceptions.VerificationError:
                logger.warning(
                    "PIN verification error for invitation %s",
                    invitation_id,
                )
                return False

    async def remove_pin(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Remove PIN protection from an invitation.

        Args:
            invitation_id: Invitation UUID
            workspace_id: Workspace UUID for tenant isolation

        Returns:
            True if PIN was removed successfully
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE digital_invitations
                SET pin_hash = NULL,
                    updated_at = NOW()
                WHERE invitation_id = $1
                  AND workspace_id = $2
                  AND status != 'deleted'
                """,
                invitation_id,
                workspace_id,
            )

            return result == "UPDATE 1"


# Factory function for dependency injection
_invitation_repository: InvitationRepository | None = None


def get_invitation_repository() -> InvitationRepository:
    """Get or create the invitation repository singleton."""
    global _invitation_repository
    if _invitation_repository is None:
        _invitation_repository = InvitationRepository()
    return _invitation_repository
