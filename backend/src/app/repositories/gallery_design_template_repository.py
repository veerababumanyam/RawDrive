"""Repository for Gallery Design Template data operations.

Provides data access layer for CRUD operations on gallery_design_templates table.
Enforces workspace isolation for multi-tenant security.

Feature: Enhancement 3 - Custom Templates
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class GalleryDesignTemplateRepository:
    """Data access layer for gallery design template records.

    Handles:
    - CRUD operations on gallery_design_templates
    - Workspace isolation and permissions
    - Filtering and search
    - Pagination
    """

    # =========================================================================
    # CREATE
    # =========================================================================

    async def create_template(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID],
        name: str,
        design_config: dict[str, Any],
        category: str,
        description: Optional[str] = None,
        tags: Optional[list[str]] = None,
        thumbnail_url: Optional[str] = None,
        thumbnail_asset_id: Optional[UUID] = None,
        is_system: bool = False,
        is_active: bool = True,
        created_by_user_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new template.

        Args:
            template_id: Unique template ID
            workspace_id: Workspace association (None for system templates)
            name: Template name
            design_config: GalleryDesignConfig as dict
            category: Template category
            description: Optional description
            tags: Optional list of tags
            thumbnail_url: Optional thumbnail URL
            thumbnail_asset_id: Optional thumbnail asset reference
            is_system: Whether this is a system template
            is_active: Whether template is active
            created_by_user_id: User who created template

        Returns:
            Created template record as dict
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO gallery_design_templates (
                    template_id,
                    workspace_id,
                    name,
                    description,
                    category,
                    tags,
                    design_config,
                    thumbnail_url,
                    thumbnail_asset_id,
                    is_active,
                    is_system,
                    created_by_user_id,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING *
                """,
                template_id,
                workspace_id,
                name,
                description,
                category,
                tags or [],
                json.dumps(design_config),
                thumbnail_url,
                thumbnail_asset_id,
                is_active,
                is_system,
                created_by_user_id,
                datetime.now(timezone.utc),
                datetime.now(timezone.utc),
            )

            logger.info(
                "Template created",
                extra={
                    "template_id": str(template_id),
                    "workspace_id": str(workspace_id) if workspace_id else "system",
                    "name": name,
                    "category": category,
                },
            )

            return self._parse_row(row)

    # =========================================================================
    # READ
    # =========================================================================

    async def get_by_id(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Get template by ID with workspace isolation.

        Args:
            template_id: Template ID
            workspace_id: Workspace ID (None = system templates)

        Returns:
            Template record or None if not found
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # Allow access to:
            # 1. System templates (workspace_id IS NULL)
            # 2. Templates in the user's workspace
            row = await conn.fetchrow(
                """
                SELECT * FROM gallery_design_templates
                WHERE template_id = $1
                AND (workspace_id = $2 OR workspace_id IS NULL)
                AND is_active = TRUE
                """,
                template_id,
                workspace_id,
            )

            return self._parse_row(row) if row else None

    async def get_by_name(
        self,
        name: str,
        workspace_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Get template by name and workspace.

        Args:
            name: Template name
            workspace_id: Workspace ID

        Returns:
            Template record or None
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM gallery_design_templates
                WHERE name = $1
                AND workspace_id IS NOT DISTINCT FROM $2
                AND is_active = TRUE
                """,
                name,
                workspace_id,
            )

            return self._parse_row(row) if row else None

    # =========================================================================
    # UPDATE
    # =========================================================================

    async def update(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID],
        updates: dict[str, Any],
    ) -> dict[str, Any]:
        """Update template fields.

        Args:
            template_id: Template ID
            workspace_id: Workspace ID for permission check
            updates: Fields to update

        Returns:
            Updated template record

        Raises:
            Exception: If template not found
        """
        if not updates:
            return await self.get_by_id(template_id, workspace_id)

        pool = await get_postgres_pool()

        # Build dynamic UPDATE clause
        set_clauses = []
        values = []
        param_count = 1

        for key, value in updates.items():
            # Handle JSON fields
            if key == "design_config":
                set_clauses.append(f"design_config = ${param_count}::JSONB")
                values.append(json.dumps(value))
            elif key == "tags":
                set_clauses.append(f"tags = ${param_count}::TEXT[]")
                values.append(value or [])
            else:
                set_clauses.append(f"{key} = ${param_count}")
                values.append(value)
            param_count += 1

        # Add template_id and workspace_id for WHERE clause
        values.append(template_id)
        values.append(workspace_id)

        query = f"""
            UPDATE gallery_design_templates
            SET {', '.join(set_clauses)}
            WHERE template_id = ${param_count}
            AND (workspace_id = ${param_count + 1} OR workspace_id IS NULL AND ${param_count + 1} IS NULL)
            RETURNING *
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *values)

            if not row:
                raise Exception(f"Template not found: {template_id}")

            logger.info(
                "Template updated",
                extra={
                    "template_id": str(template_id),
                    "updated_fields": list(updates.keys()),
                },
            )

            return self._parse_row(row)

    # =========================================================================
    # DELETE
    # =========================================================================

    async def delete_hard(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID] = None,
    ) -> None:
        """Permanently delete a template.

        Args:
            template_id: Template ID
            workspace_id: Workspace ID for permission check
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM gallery_design_templates
                WHERE template_id = $1
                AND (workspace_id = $2 OR workspace_id IS NULL AND $2 IS NULL)
                """,
                template_id,
                workspace_id,
            )

            logger.info(
                "Template hard-deleted",
                extra={"template_id": str(template_id)},
            )

    # =========================================================================
    # LIST & FILTER
    # =========================================================================

    async def list_with_filters(
        self,
        workspace_id: Optional[UUID] = None,
        category: Optional[str] = None,
        search: Optional[str] = None,
        tags: Optional[list[str]] = None,
        page: int = 1,
        limit: int = 20,
        include_system: bool = True,
        only_active: bool = True,
    ) -> dict[str, Any]:
        """List templates with optional filtering.

        Args:
            workspace_id: Filter by workspace
            category: Filter by category
            search: Search by name or description
            tags: Filter by tags (AND logic)
            page: Page number (1-indexed)
            limit: Results per page
            include_system: Include system templates
            only_active: Only return active templates

        Returns:
            Paginated results with metadata
        """
        pool = await get_postgres_pool()

        # Build WHERE conditions
        conditions = []
        params = []

        # Workspace filter
        if include_system:
            conditions.append("(workspace_id = $1 OR workspace_id IS NULL)")
            params.append(workspace_id)
        else:
            conditions.append("workspace_id = $1")
            params.append(workspace_id)

        # Active filter
        if only_active:
            param_idx = len(params) + 1
            conditions.append(f"is_active = ${param_idx}")
            params.append(True)

        # Category filter
        if category:
            param_idx = len(params) + 1
            conditions.append(f"category = ${param_idx}")
            params.append(category)

        # Search filter (name or description)
        if search:
            param_idx = len(params) + 1
            search_pattern = f"%{search}%"
            conditions.append(
                f"(name ILIKE ${param_idx} OR description ILIKE ${param_idx})"
            )
            params.append(search_pattern)

        # Tags filter (AND logic - all tags must be present)
        if tags:
            param_idx = len(params) + 1
            conditions.append(f"tags @> ${param_idx}::TEXT[]")
            params.append(tags)

        where_clause = " AND ".join(conditions) if conditions else "TRUE"

        # Calculate offset
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            # Get total count
            count_query = f"SELECT COUNT(*) FROM gallery_design_templates WHERE {where_clause}"
            total = await conn.fetchval(count_query, *params)

            # Get paginated results
            query = f"""
                SELECT * FROM gallery_design_templates
                WHERE {where_clause}
                ORDER BY created_at DESC, name ASC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """

            rows = await conn.fetch(query, *params, limit, offset)

            templates = [self._parse_row(row) for row in rows]

            return {
                "data": templates,
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "pages": (total + limit - 1) // limit,
                    "has_next": offset + limit < total,
                },
            }

    # =========================================================================
    # SEARCH
    # =========================================================================

    async def search(
        self,
        workspace_id: Optional[UUID],
        query: str,
        limit: int = 10,
        only_active: bool = True,
    ) -> list[dict[str, Any]]:
        """Quick search templates by name and tags.

        Args:
            workspace_id: Workspace ID
            query: Search query
            limit: Max results
            only_active: Only return active templates

        Returns:
            List of matching templates
        """
        pool = await get_postgres_pool()
        search_pattern = f"%{query}%"

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM gallery_design_templates
                WHERE (workspace_id = $1 OR workspace_id IS NULL)
                AND (name ILIKE $2 OR description ILIKE $2 OR $3 <@ tags)
                AND is_active = $4
                ORDER BY name ASC
                LIMIT $5
                """,
                workspace_id,
                search_pattern,
                [query],  # Tag search
                only_active,
                limit,
            )

            return [self._parse_row(row) for row in rows]

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _parse_row(self, row: Any) -> Optional[dict[str, Any]]:
        """Parse database row to dict with proper type handling.

        Args:
            row: Database row

        Returns:
            Parsed dict or None
        """
        if not row:
            return None

        data = dict(row)

        # Parse JSONB fields
        if "design_config" in data and isinstance(data["design_config"], str):
            data["design_config"] = json.loads(data["design_config"])

        # Convert UUID to string for JSON serialization
        for key in ["template_id", "workspace_id", "thumbnail_asset_id", "created_by_user_id"]:
            if key in data and data[key]:
                data[key] = str(data[key])

        return data


# ---------------------------------------------------------------------------
# Repository Factory
# ---------------------------------------------------------------------------


def get_gallery_design_template_repository() -> GalleryDesignTemplateRepository:
    """Get or create repository instance.

    Returns:
        GalleryDesignTemplateRepository instance
    """
    return GalleryDesignTemplateRepository()
