"""TagService: CRUD operations for tags and asset-tag associations.

Implements tag management within workspace scope.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class TagError(Exception):
    """Base tag error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class TagNotFoundError(TagError):
    """Tag not found."""

    def __init__(self, tag_id: UUID) -> None:
        super().__init__(
            f"Tag {tag_id} not found",
            "TAG_NOT_FOUND",
            404,
        )


class DuplicateTagError(TagError):
    """Tag with same name already exists."""

    def __init__(self, name: str) -> None:
        super().__init__(
            f"Tag with name '{name}' already exists",
            "DUPLICATE_TAG",
            409,
        )


# ---------------------------------------------------------------------------
# Tag Service
# ---------------------------------------------------------------------------


class TagService:
    """Service for tag operations."""

    async def create_tag(
        self,
        workspace_id: UUID,
        user_id: UUID,
        name: str,
        tag_type: str = "keyword",
        color: Optional[str] = None,
    ) -> dict:
        """Create a new tag."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check for duplicate
            existing = await conn.fetchval(
                "SELECT tag_id FROM tags WHERE workspace_id = $1 AND name = $2",
                workspace_id,
                name,
            )
            if existing:
                raise DuplicateTagError(name)

            tag_id = await conn.fetchval(
                """
                INSERT INTO tags (workspace_id, name, type, color)
                VALUES ($1, $2, $3, $4)
                RETURNING tag_id
                """,
                workspace_id,
                name,
                tag_type,
                color,
            )

            return await self.get_tag(workspace_id, tag_id)

    async def get_tag(self, workspace_id: UUID, tag_id: UUID) -> dict:
        """Get a specific tag."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT tag_id, workspace_id, name, type, color, created_at, updated_at
                FROM tags
                WHERE workspace_id = $1 AND tag_id = $2
                """,
                workspace_id,
                tag_id,
            )
            if not row:
                raise TagNotFoundError(tag_id)

            # Get usage count
            usage_count = await conn.fetchval(
                "SELECT COUNT(*) FROM asset_tags WHERE workspace_id = $1 AND tag_id = $2",
                workspace_id,
                tag_id,
            )

            return {
                "tag_id": str(row["tag_id"]),
                "workspace_id": str(row["workspace_id"]),
                "name": row["name"],
                "type": row["type"],
                "color": row["color"],
                "usage_count": usage_count or 0,
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }

    async def list_tags(
        self,
        workspace_id: UUID,
        tag_type: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """List tags for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            offset = (page - 1) * limit

            # Build WHERE clause
            where_clauses = ["workspace_id = $1"]
            params = [workspace_id]
            param_idx = 2

            if tag_type:
                where_clauses.append(f"type = ${param_idx}")
                params.append(tag_type)
                param_idx += 1

            if search:
                where_clauses.append(f"name ILIKE ${param_idx}")
                params.append(f"%{search}%")
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM tags WHERE {where_sql}",
                *params,
            )

            # Get tags with usage count
            tags = await conn.fetch(
                f"""
                SELECT
                    t.tag_id, t.name, t.type, t.color, t.created_at,
                    (SELECT COUNT(*) FROM asset_tags WHERE tag_id = t.tag_id) as usage_count
                FROM tags t
                WHERE {where_sql}
                ORDER BY t.name ASC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return {
                "data": [
                    {
                        "tag_id": str(t["tag_id"]),
                        "name": t["name"],
                        "type": t["type"],
                        "color": t["color"],
                        "usage_count": t["usage_count"] or 0,
                        "created_at": t["created_at"].isoformat(),
                    }
                    for t in tags
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": (total + limit - 1) // limit if total else 0,
                },
            }

    async def update_tag(
        self,
        workspace_id: UUID,
        tag_id: UUID,
        name: Optional[str] = None,
        tag_type: Optional[str] = None,
        color: Optional[str] = None,
    ) -> dict:
        """Update a tag."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check tag exists
            exists = await conn.fetchval(
                "SELECT 1 FROM tags WHERE workspace_id = $1 AND tag_id = $2",
                workspace_id,
                tag_id,
            )
            if not exists:
                raise TagNotFoundError(tag_id)

            # Build update query
            set_clauses = ["updated_at = NOW()"]
            params = []
            param_idx = 1

            if name is not None:
                # Check for duplicate name
                existing = await conn.fetchval(
                    "SELECT tag_id FROM tags WHERE workspace_id = $1 AND name = $2 AND tag_id != $3",
                    workspace_id,
                    name,
                    tag_id,
                )
                if existing:
                    raise DuplicateTagError(name)

                set_clauses.append(f"name = ${param_idx}")
                params.append(name)
                param_idx += 1

            if tag_type is not None:
                set_clauses.append(f"type = ${param_idx}")
                params.append(tag_type)
                param_idx += 1

            if color is not None:
                set_clauses.append(f"color = ${param_idx}")
                params.append(color)
                param_idx += 1

            params.extend([workspace_id, tag_id])

            await conn.execute(
                f"""
                UPDATE tags
                SET {', '.join(set_clauses)}
                WHERE workspace_id = ${param_idx} AND tag_id = ${param_idx + 1}
                """,
                *params,
            )

            return await self.get_tag(workspace_id, tag_id)

    async def delete_tag(self, workspace_id: UUID, tag_id: UUID) -> None:
        """Delete a tag and all its assignments."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM tags WHERE workspace_id = $1 AND tag_id = $2",
                workspace_id,
                tag_id,
            )
            if result == "DELETE 0":
                raise TagNotFoundError(tag_id)

    # -------------------------------------------------------------------------
    # Asset Tag Operations
    # -------------------------------------------------------------------------

    async def add_tag_to_asset(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        tag_id: UUID,
        user_id: UUID,
    ) -> dict:
        """Add a tag to an asset."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify tag exists
            tag_exists = await conn.fetchval(
                "SELECT 1 FROM tags WHERE workspace_id = $1 AND tag_id = $2",
                workspace_id,
                tag_id,
            )
            if not tag_exists:
                raise TagNotFoundError(tag_id)

            # Add tag (upsert)
            await conn.execute(
                """
                INSERT INTO asset_tags (workspace_id, asset_id, tag_id, created_by_user_id)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (workspace_id, asset_id, tag_id) DO NOTHING
                """,
                workspace_id,
                asset_id,
                tag_id,
                user_id,
            )

            return {"success": True}

    async def remove_tag_from_asset(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        tag_id: UUID,
    ) -> None:
        """Remove a tag from an asset."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM asset_tags WHERE workspace_id = $1 AND asset_id = $2 AND tag_id = $3",
                workspace_id,
                asset_id,
                tag_id,
            )

    async def get_asset_tags(self, workspace_id: UUID, asset_id: UUID) -> list[dict]:
        """Get all tags for an asset."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            tags = await conn.fetch(
                """
                SELECT t.tag_id, t.name, t.type, t.color
                FROM asset_tags at
                JOIN tags t ON at.tag_id = t.tag_id
                WHERE at.workspace_id = $1 AND at.asset_id = $2
                ORDER BY t.name ASC
                """,
                workspace_id,
                asset_id,
            )

            return [
                {
                    "tag_id": str(t["tag_id"]),
                    "name": t["name"],
                    "type": t["type"],
                    "color": t["color"],
                }
                for t in tags
            ]

    async def set_asset_tags(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        tag_ids: list[UUID],
        user_id: UUID,
    ) -> list[dict]:
        """Replace all tags on an asset with a new set."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Remove all existing tags
                await conn.execute(
                    "DELETE FROM asset_tags WHERE workspace_id = $1 AND asset_id = $2",
                    workspace_id,
                    asset_id,
                )

                # Add new tags
                for tag_id in tag_ids:
                    await conn.execute(
                        """
                        INSERT INTO asset_tags (workspace_id, asset_id, tag_id, created_by_user_id)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (workspace_id, asset_id, tag_id) DO NOTHING
                        """,
                        workspace_id,
                        asset_id,
                        tag_id,
                        user_id,
                    )

        return await self.get_asset_tags(workspace_id, asset_id)

    async def create_and_add_tag(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        user_id: UUID,
        name: str,
        tag_type: str = "keyword",
        color: Optional[str] = None,
    ) -> dict:
        """Create a new tag and immediately add it to an asset."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Get or create tag
                tag_id = await conn.fetchval(
                    "SELECT tag_id FROM tags WHERE workspace_id = $1 AND name = $2",
                    workspace_id,
                    name,
                )

                if not tag_id:
                    tag_id = await conn.fetchval(
                        """
                        INSERT INTO tags (workspace_id, name, type, color)
                        VALUES ($1, $2, $3, $4)
                        RETURNING tag_id
                        """,
                        workspace_id,
                        name,
                        tag_type,
                        color,
                    )

                # Add to asset
                await conn.execute(
                    """
                    INSERT INTO asset_tags (workspace_id, asset_id, tag_id, created_by_user_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (workspace_id, asset_id, tag_id) DO NOTHING
                    """,
                    workspace_id,
                    asset_id,
                    tag_id,
                    user_id,
                )

                # Get tag details
                row = await conn.fetchrow(
                    "SELECT tag_id, name, type, color FROM tags WHERE tag_id = $1",
                    tag_id,
                )

                return {
                    "tag_id": str(row["tag_id"]),
                    "name": row["name"],
                    "type": row["type"],
                    "color": row["color"],
                }


# Export singleton instance
_tag_service: Optional[TagService] = None


def get_tag_service() -> TagService:
    """Get singleton tag service instance."""
    global _tag_service
    if _tag_service is None:
        _tag_service = TagService()
    return _tag_service
