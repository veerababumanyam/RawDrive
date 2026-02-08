"""ClientTagService: Manages client tags and tag assignments.

Implements tag management for client categorization within workspace scope:
- Tag CRUD operations (create, read, update, delete)
- Tag assignment to clients
- Filtering clients by tags
- Tag usage statistics

All operations are workspace-scoped for multi-tenant data isolation.

Note: This service is separate from tag_service.py which manages asset tags.
Client tags are stored in client_tags table, while asset tags are in tags table.

Requirements covered:
- Requirement 5.1: Multiple tags per client (add/remove)
- Requirement 5.2: Create reusable tags across workspace
- Requirement 5.3: Filter clients by tag
- Requirement 5.6: Custom tag creation
"""

from __future__ import annotations

import logging
import math
import re
import sys
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import (
    ClientNotFoundError,
    ClientValidationError,
    TagAlreadyAssignedError,
    TagDuplicateError,
    TagNotFoundError,
)

# Import escape_like_pattern from shared database-utils package
# In production, PYTHONPATH includes the package path
_packages_path = Path(__file__).parent.parent.parent.parent.parent / "packages" / "database-utils" / "python"
if str(_packages_path) not in sys.path:
    sys.path.insert(0, str(_packages_path))

from database_utils.query_builders import escape_like_pattern

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Default colors for tags if none specified
DEFAULT_TAG_COLORS = [
    "#3B82F6",  # Blue
    "#10B981",  # Green
    "#8B5CF6",  # Purple
    "#F59E0B",  # Amber
    "#EF4444",  # Red
    "#06B6D4",  # Cyan
    "#EC4899",  # Pink
    "#6366F1",  # Indigo
]

# Maximum tags per workspace
MAX_TAGS_PER_WORKSPACE = 500

# Maximum tag name length
MAX_TAG_NAME_LENGTH = 50

# Hex color validation pattern
HEX_COLOR_PATTERN = re.compile(r"^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$")


# ---------------------------------------------------------------------------
# ClientTagService
# ---------------------------------------------------------------------------


class ClientTagService:
    """Service for managing client tags.

    Provides methods to create, update, delete tags and manage
    tag assignments to clients. All methods enforce workspace isolation.
    """

    # =========================================================================
    # Tag CRUD Operations (Requirement 5.2, 5.6)
    # =========================================================================

    async def create_tag(
        self,
        workspace_id: UUID,
        name: str,
        color: Optional[str] = None,
    ) -> dict:
        """Create a new client tag.

        Args:
            workspace_id: Workspace for tenant isolation
            name: Tag name (unique per workspace)
            color: Optional hex color code

        Returns:
            Created tag with tag_id

        Raises:
            TagDuplicateError: If tag name already exists
            ClientValidationError: If name is invalid
        """
        # Validate name
        if not name or not name.strip():
            raise ClientValidationError("Tag name is required", "name")

        name = name.strip()
        if len(name) > MAX_TAG_NAME_LENGTH:
            raise ClientValidationError(
                f"Tag name cannot exceed {MAX_TAG_NAME_LENGTH} characters",
                "name",
            )

        # Validate color format if provided
        if color:
            color = color.strip()
            if not HEX_COLOR_PATTERN.match(color):
                raise ClientValidationError(
                    "Color must be a valid hex color (e.g., #FF5733 or #F53)",
                    "color",
                )

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check for duplicate name
            existing = await conn.fetchval(
                """
                SELECT tag_id FROM client_tags
                WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)
                """,
                workspace_id,
                name,
            )
            if existing:
                raise TagDuplicateError(name)

            # Check workspace tag limit
            tag_count = await conn.fetchval(
                "SELECT COUNT(*) FROM client_tags WHERE workspace_id = $1",
                workspace_id,
            )
            if tag_count >= MAX_TAGS_PER_WORKSPACE:
                raise ClientValidationError(
                    f"Maximum number of tags ({MAX_TAGS_PER_WORKSPACE}) reached",
                    "name",
                )

            # Create tag
            tag = await conn.fetchrow(
                """
                INSERT INTO client_tags (workspace_id, name, color)
                VALUES ($1, $2, $3)
                RETURNING tag_id, workspace_id, name, color, created_at
                """,
                workspace_id,
                name,
                color,
            )

            logger.info(
                "Client tag created",
                extra={
                    "workspace_id": str(workspace_id),
                    "tag_id": str(tag["tag_id"]),
                    "tag_name": name,
                },
            )

            return {
                "tag_id": str(tag["tag_id"]),
                "workspace_id": str(tag["workspace_id"]),
                "name": tag["name"],
                "color": tag["color"],
                "usage_count": 0,
                "created_at": tag["created_at"].isoformat(),
            }

    async def get_tag(
        self,
        workspace_id: UUID,
        tag_id: UUID,
    ) -> dict:
        """Get a specific client tag.

        Args:
            workspace_id: Workspace for tenant isolation
            tag_id: Tag to retrieve

        Returns:
            Tag details with usage count

        Raises:
            TagNotFoundError: If tag doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            tag = await conn.fetchrow(
                """
                SELECT tag_id, workspace_id, name, color, created_at
                FROM client_tags
                WHERE workspace_id = $1 AND tag_id = $2
                """,
                workspace_id,
                tag_id,
            )
            if not tag:
                raise TagNotFoundError(tag_id)

            # Get usage count
            usage_count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_tag_assignments
                WHERE workspace_id = $1 AND tag_id = $2
                """,
                workspace_id,
                tag_id,
            )

            return {
                "tag_id": str(tag["tag_id"]),
                "workspace_id": str(tag["workspace_id"]),
                "name": tag["name"],
                "color": tag["color"],
                "usage_count": usage_count or 0,
                "created_at": tag["created_at"].isoformat(),
            }

    async def list_tags(
        self,
        workspace_id: UUID,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
        include_usage_count: bool = True,
    ) -> dict:
        """List all client tags in a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            search: Optional search query for tag name
            page: Page number (1-indexed)
            limit: Items per page (max 100)
            include_usage_count: Include client count per tag

        Returns:
            Paginated list of tags with usage counts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Validate and sanitize inputs
            limit = min(max(1, limit), 100)
            page = max(1, page)
            offset = (page - 1) * limit

            # Build WHERE clause
            where_clauses = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if search:
                where_clauses.append(f"name ILIKE ${param_idx}")
                # Escape LIKE metacharacters to prevent pattern injection
                escaped_search = escape_like_pattern(search.strip())
                params.append(f"%{escaped_search}%")
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM client_tags WHERE {where_sql}",
                *params,
            )

            # Get tags with optional usage count
            if include_usage_count:
                tags = await conn.fetch(
                    f"""
                    SELECT
                        t.tag_id, t.workspace_id, t.name, t.color, t.created_at,
                        (
                            SELECT COUNT(*)
                            FROM client_tag_assignments cta
                            WHERE cta.workspace_id = t.workspace_id
                              AND cta.tag_id = t.tag_id
                        ) as usage_count
                    FROM client_tags t
                    WHERE {where_sql}
                    ORDER BY t.name ASC
                    LIMIT ${param_idx} OFFSET ${param_idx + 1}
                    """,
                    *params,
                    limit,
                    offset,
                )
            else:
                tags = await conn.fetch(
                    f"""
                    SELECT tag_id, workspace_id, name, color, created_at
                    FROM client_tags
                    WHERE {where_sql}
                    ORDER BY name ASC
                    LIMIT ${param_idx} OFFSET ${param_idx + 1}
                    """,
                    *params,
                    limit,
                    offset,
                )

            return {
                "tags": [
                    {
                        "tag_id": str(t["tag_id"]),
                        "workspace_id": str(t["workspace_id"]),
                        "name": t["name"],
                        "color": t["color"],
                        "usage_count": t.get("usage_count", 0) if include_usage_count else None,
                        "created_at": t["created_at"].isoformat(),
                    }
                    for t in tags
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": math.ceil(total / limit) if total > 0 else 0,
                },
            }

    async def update_tag(
        self,
        workspace_id: UUID,
        tag_id: UUID,
        name: Optional[str] = None,
        color: Optional[str] = None,
    ) -> dict:
        """Update a client tag.

        Args:
            workspace_id: Workspace for tenant isolation
            tag_id: Tag to update
            name: New name (optional)
            color: New color (optional)

        Returns:
            Updated tag

        Raises:
            TagNotFoundError: If tag doesn't exist
            TagDuplicateError: If name conflicts with another tag
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify tag exists
            exists = await conn.fetchval(
                "SELECT 1 FROM client_tags WHERE workspace_id = $1 AND tag_id = $2",
                workspace_id,
                tag_id,
            )
            if not exists:
                raise TagNotFoundError(tag_id)

            # Build update query
            set_clauses = []
            params: list[Any] = []
            param_idx = 1

            if name is not None:
                name = name.strip()
                if not name:
                    raise ClientValidationError("Tag name cannot be empty", "name")
                if len(name) > MAX_TAG_NAME_LENGTH:
                    raise ClientValidationError(
                        f"Tag name cannot exceed {MAX_TAG_NAME_LENGTH} characters",
                        "name",
                    )

                # Check for duplicate name
                duplicate = await conn.fetchval(
                    """
                    SELECT 1 FROM client_tags
                    WHERE workspace_id = $1 AND LOWER(name) = LOWER($2) AND tag_id != $3
                    """,
                    workspace_id,
                    name,
                    tag_id,
                )
                if duplicate:
                    raise TagDuplicateError(name)

                set_clauses.append(f"name = ${param_idx}")
                params.append(name)
                param_idx += 1

            if color is not None:
                if color:
                    color = color.strip()
                    if not HEX_COLOR_PATTERN.match(color):
                        raise ClientValidationError(
                            "Color must be a valid hex color (e.g., #FF5733 or #F53)",
                            "color",
                        )
                set_clauses.append(f"color = ${param_idx}")
                params.append(color if color else None)
                param_idx += 1

            if not set_clauses:
                return await self.get_tag(workspace_id, tag_id)

            params.extend([workspace_id, tag_id])

            await conn.execute(
                f"""
                UPDATE client_tags
                SET {', '.join(set_clauses)}
                WHERE workspace_id = ${param_idx} AND tag_id = ${param_idx + 1}
                """,
                *params,
            )

            logger.info(
                "Client tag updated",
                extra={
                    "workspace_id": str(workspace_id),
                    "tag_id": str(tag_id),
                },
            )

            return await self.get_tag(workspace_id, tag_id)

    async def delete_tag(
        self,
        workspace_id: UUID,
        tag_id: UUID,
    ) -> dict:
        """Delete a client tag and all its assignments.

        Args:
            workspace_id: Workspace for tenant isolation
            tag_id: Tag to delete

        Returns:
            Deletion confirmation with count of affected assignments

        Raises:
            TagNotFoundError: If tag doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Get tag name for response
                tag = await conn.fetchrow(
                    "SELECT name FROM client_tags WHERE workspace_id = $1 AND tag_id = $2",
                    workspace_id,
                    tag_id,
                )
                if not tag:
                    raise TagNotFoundError(tag_id)

                # Count assignments that will be removed
                assignment_count = await conn.fetchval(
                    """
                    SELECT COUNT(*)
                    FROM client_tag_assignments
                    WHERE workspace_id = $1 AND tag_id = $2
                    """,
                    workspace_id,
                    tag_id,
                )

                # Delete assignments (cascade should handle this, but be explicit)
                await conn.execute(
                    """
                    DELETE FROM client_tag_assignments
                    WHERE workspace_id = $1 AND tag_id = $2
                    """,
                    workspace_id,
                    tag_id,
                )

                # Delete tag
                await conn.execute(
                    "DELETE FROM client_tags WHERE workspace_id = $1 AND tag_id = $2",
                    workspace_id,
                    tag_id,
                )

                logger.info(
                    "Client tag deleted",
                    extra={
                        "workspace_id": str(workspace_id),
                        "tag_id": str(tag_id),
                        "tag_name": tag["name"],
                        "assignments_removed": assignment_count,
                    },
                )

                return {
                    "message": f"Tag '{tag['name']}' deleted successfully",
                    "tag_id": str(tag_id),
                    "assignments_removed": assignment_count or 0,
                }

    # =========================================================================
    # Tag Assignment Operations (Requirement 5.1)
    # =========================================================================

    async def assign_tags(
        self,
        workspace_id: UUID,
        client_id: UUID,
        tag_ids: list[UUID],
    ) -> list[dict]:
        """Assign multiple tags to a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to assign tags to
            tag_ids: List of tag IDs to assign

        Returns:
            List of assigned tags

        Raises:
            ClientNotFoundError: If client doesn't exist
            TagNotFoundError: If any tag doesn't exist
        """
        if not tag_ids:
            return []

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client_exists = await conn.fetchval(
                "SELECT 1 FROM clients WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                client_id,
            )
            if not client_exists:
                raise ClientNotFoundError(client_id)

            # Verify all tags exist
            existing_tags = await conn.fetch(
                """
                SELECT tag_id, name, color
                FROM client_tags
                WHERE workspace_id = $1 AND tag_id = ANY($2::uuid[])
                """,
                workspace_id,
                tag_ids,
            )
            existing_tag_ids = {t["tag_id"] for t in existing_tags}
            missing_tags = set(tag_ids) - existing_tag_ids
            if missing_tags:
                raise TagNotFoundError(list(missing_tags)[0])

            async with conn.transaction():
                # Assign tags (ignore duplicates via ON CONFLICT)
                for tag_id in tag_ids:
                    await conn.execute(
                        """
                        INSERT INTO client_tag_assignments (workspace_id, client_id, tag_id)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (workspace_id, client_id, tag_id) DO NOTHING
                        """,
                        workspace_id,
                        client_id,
                        tag_id,
                    )

            logger.info(
                "Tags assigned to client",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "tag_count": len(tag_ids),
                },
            )

            return [
                {
                    "tag_id": str(t["tag_id"]),
                    "name": t["name"],
                    "color": t["color"],
                }
                for t in existing_tags
            ]

    async def remove_tags(
        self,
        workspace_id: UUID,
        client_id: UUID,
        tag_ids: list[UUID],
    ) -> dict:
        """Remove multiple tags from a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to remove tags from
            tag_ids: List of tag IDs to remove

        Returns:
            Removal confirmation with count
        """
        if not tag_ids:
            return {"removed_count": 0}

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM client_tag_assignments
                WHERE workspace_id = $1 AND client_id = $2 AND tag_id = ANY($3::uuid[])
                """,
                workspace_id,
                client_id,
                tag_ids,
            )

            # Safely extract count from "DELETE N" format
            try:
                count = int(result.split(" ")[1]) if result else 0
            except (IndexError, ValueError):
                count = 0
                logger.warning(
                    "Could not parse delete result",
                    extra={"result": result, "workspace_id": str(workspace_id)},
                )

            logger.info(
                "Tags removed from client",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "removed_count": count,
                },
            )

            return {"removed_count": count}

    async def remove_tag(
        self,
        workspace_id: UUID,
        client_id: UUID,
        tag_id: UUID,
    ) -> dict:
        """Remove a single tag from a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to remove tag from
            tag_id: Tag ID to remove

        Returns:
            Removal confirmation

        Raises:
            TagNotFoundError: If assignment doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM client_tag_assignments
                WHERE workspace_id = $1 AND client_id = $2 AND tag_id = $3
                """,
                workspace_id,
                client_id,
                tag_id,
            )

            if result == "DELETE 0":
                raise TagNotFoundError(tag_id)

            logger.info(
                "Tag removed from client",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "tag_id": str(tag_id),
                },
            )

            return {"message": "Tag removed successfully"}

    async def get_client_tags(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> list[dict]:
        """Get all tags assigned to a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get tags for

        Returns:
            List of assigned tags
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            tags = await conn.fetch(
                """
                SELECT t.tag_id, t.name, t.color
                FROM client_tag_assignments cta
                JOIN client_tags t ON cta.tag_id = t.tag_id
                WHERE cta.workspace_id = $1 AND cta.client_id = $2
                ORDER BY t.name ASC
                """,
                workspace_id,
                client_id,
            )

            return [
                {
                    "tag_id": str(t["tag_id"]),
                    "name": t["name"],
                    "color": t["color"],
                }
                for t in tags
            ]

    async def set_client_tags(
        self,
        workspace_id: UUID,
        client_id: UUID,
        tag_ids: list[UUID],
    ) -> list[dict]:
        """Replace all tags on a client with a new set.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to update tags for
            tag_ids: Complete list of tag IDs (replaces existing)

        Returns:
            List of new tags

        Raises:
            ClientNotFoundError: If client doesn't exist
            TagNotFoundError: If any tag doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client_exists = await conn.fetchval(
                "SELECT 1 FROM clients WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                client_id,
            )
            if not client_exists:
                raise ClientNotFoundError(client_id)

            async with conn.transaction():
                # Remove all existing tags
                await conn.execute(
                    """
                    DELETE FROM client_tag_assignments
                    WHERE workspace_id = $1 AND client_id = $2
                    """,
                    workspace_id,
                    client_id,
                )

                if tag_ids:
                    # Verify all tags exist
                    existing_tags = await conn.fetch(
                        """
                        SELECT tag_id, name, color
                        FROM client_tags
                        WHERE workspace_id = $1 AND tag_id = ANY($2::uuid[])
                        """,
                        workspace_id,
                        tag_ids,
                    )
                    existing_tag_ids = {t["tag_id"] for t in existing_tags}
                    missing_tags = set(tag_ids) - existing_tag_ids
                    if missing_tags:
                        raise TagNotFoundError(list(missing_tags)[0])

                    # Assign new tags
                    for tag_id in tag_ids:
                        await conn.execute(
                            """
                            INSERT INTO client_tag_assignments (workspace_id, client_id, tag_id)
                            VALUES ($1, $2, $3)
                            ON CONFLICT (workspace_id, client_id, tag_id) DO NOTHING
                            """,
                            workspace_id,
                            client_id,
                            tag_id,
                        )

                    return [
                        {
                            "tag_id": str(t["tag_id"]),
                            "name": t["name"],
                            "color": t["color"],
                        }
                        for t in existing_tags
                    ]

        return []

    # =========================================================================
    # Filter Clients by Tags (Requirement 5.3)
    # =========================================================================

    async def filter_clients_by_tags(
        self,
        workspace_id: UUID,
        tag_ids: list[UUID],
        match_all: bool = False,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        """Filter clients that have specific tags.

        Args:
            workspace_id: Workspace for tenant isolation
            tag_ids: List of tag IDs to filter by
            match_all: If True, client must have ALL tags; if False, ANY tag
            page: Page number (1-indexed)
            limit: Items per page (max 100)

        Returns:
            Paginated list of client IDs matching the filter
        """
        if not tag_ids:
            return {"client_ids": [], "meta": {"page": page, "limit": limit, "total": 0, "total_pages": 0}}

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Validate and sanitize inputs
            limit = min(max(1, limit), 100)
            page = max(1, page)
            offset = (page - 1) * limit

            if match_all:
                # Client must have ALL specified tags
                total = await conn.fetchval(
                    """
                    SELECT COUNT(DISTINCT cta.client_id)
                    FROM client_tag_assignments cta
                    WHERE cta.workspace_id = $1
                      AND cta.tag_id = ANY($2::uuid[])
                    GROUP BY cta.client_id
                    HAVING COUNT(DISTINCT cta.tag_id) = $3
                    """,
                    workspace_id,
                    tag_ids,
                    len(tag_ids),
                )
                total = total or 0

                clients = await conn.fetch(
                    """
                    SELECT cta.client_id
                    FROM client_tag_assignments cta
                    WHERE cta.workspace_id = $1
                      AND cta.tag_id = ANY($2::uuid[])
                    GROUP BY cta.client_id
                    HAVING COUNT(DISTINCT cta.tag_id) = $3
                    LIMIT $4 OFFSET $5
                    """,
                    workspace_id,
                    tag_ids,
                    len(tag_ids),
                    limit,
                    offset,
                )
            else:
                # Client must have ANY of the specified tags
                total = await conn.fetchval(
                    """
                    SELECT COUNT(DISTINCT client_id)
                    FROM client_tag_assignments
                    WHERE workspace_id = $1 AND tag_id = ANY($2::uuid[])
                    """,
                    workspace_id,
                    tag_ids,
                )

                clients = await conn.fetch(
                    """
                    SELECT DISTINCT client_id
                    FROM client_tag_assignments
                    WHERE workspace_id = $1 AND tag_id = ANY($2::uuid[])
                    LIMIT $3 OFFSET $4
                    """,
                    workspace_id,
                    tag_ids,
                    limit,
                    offset,
                )

            return {
                "client_ids": [str(c["client_id"]) for c in clients],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": math.ceil(total / limit) if total > 0 else 0,
                },
            }

    async def get_tag_usage_stats(
        self,
        workspace_id: UUID,
    ) -> list[dict]:
        """Get usage statistics for all tags in a workspace.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            List of tags with usage counts, sorted by usage
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            stats = await conn.fetch(
                """
                SELECT
                    t.tag_id, t.name, t.color,
                    COUNT(cta.client_id) as usage_count
                FROM client_tags t
                LEFT JOIN client_tag_assignments cta
                    ON t.tag_id = cta.tag_id
                    AND t.workspace_id = cta.workspace_id
                WHERE t.workspace_id = $1
                GROUP BY t.tag_id, t.name, t.color
                ORDER BY usage_count DESC, t.name ASC
                """,
                workspace_id,
            )

            return [
                {
                    "tag_id": str(s["tag_id"]),
                    "name": s["name"],
                    "color": s["color"],
                    "usage_count": s["usage_count"],
                }
                for s in stats
            ]


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_client_tag_service: Optional[ClientTagService] = None


def get_client_tag_service() -> ClientTagService:
    """Get singleton client tag service instance."""
    global _client_tag_service
    if _client_tag_service is None:
        _client_tag_service = ClientTagService()
    return _client_tag_service
