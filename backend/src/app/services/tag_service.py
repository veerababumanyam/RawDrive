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

    async def get_asset_tags(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        source: Optional[str] = None,
    ) -> list[dict]:
        """Get all tags for an asset.

        Args:
            workspace_id: Workspace ID
            asset_id: Asset ID
            source: Optional filter - 'manual', 'ai_vision', 'ai_gemini', 'ai_local',
                   'ai' (all AI sources), or None/all (no filter)

        Returns:
            List of tag dicts with source and confidence fields
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build source filter clause
            if source == "manual":
                source_filter = "AND at.source = 'manual'"
            elif source == "ai":
                source_filter = "AND at.source != 'manual'"
            elif source in ("ai_vision", "ai_gemini", "ai_local"):
                source_filter = f"AND at.source = '{source}'"
            else:
                source_filter = ""

            tags = await conn.fetch(
                f"""
                SELECT t.tag_id, t.name, t.type, t.color, at.source, at.confidence
                FROM asset_tags at
                JOIN tags t ON at.tag_id = t.tag_id
                WHERE at.workspace_id = $1 AND at.asset_id = $2
                {source_filter}
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
                    "source": t["source"],
                    "confidence": float(t["confidence"]) if t["confidence"] else None,
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

    # -------------------------------------------------------------------------
    # AI Tag Operations
    # -------------------------------------------------------------------------

    async def add_ai_tags(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        tags: list[dict],
        source: str,
    ) -> list[dict]:
        """Add AI-generated tags to an asset.

        For each tag:
        1. Get or create the tag in the tags table
        2. Add to asset_tags with source, confidence, and metadata

        Args:
            workspace_id: Workspace ID
            asset_id: Asset to tag
            tags: List of tag dicts with:
                - name (str, required)
                - confidence (float, 0.0-1.0)
                - type (str, optional, default 'keyword')
                - color (str, optional)
                - metadata (dict, optional, provider-specific)
            source: Tag source ('ai_vision', 'ai_gemini', 'ai_local')

        Returns:
            List of created tag associations
        """
        if source not in ("ai_vision", "ai_gemini", "ai_local"):
            raise TagError(f"Invalid source: {source}", "INVALID_SOURCE", 400)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            import json

            created_tags = []

            async with conn.transaction():
                for tag_data in tags:
                    name = tag_data["name"].strip().lower()
                    confidence = tag_data.get("confidence")
                    tag_type = tag_data.get("type", "keyword")
                    color = tag_data.get("color")
                    metadata = tag_data.get("metadata", {})

                    # Get or create the tag
                    tag_id = await conn.fetchval(
                        """
                        INSERT INTO tags (workspace_id, name, type, color)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (workspace_id, name) DO UPDATE
                            SET updated_at = NOW()
                        RETURNING tag_id
                        """,
                        workspace_id,
                        name,
                        tag_type,
                        color,
                    )

                    # Add to asset with AI metadata
                    # Use ON CONFLICT to update if already exists with lower confidence
                    await conn.execute(
                        """
                        INSERT INTO asset_tags (
                            workspace_id, asset_id, tag_id,
                            source, confidence, ai_metadata
                        )
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (workspace_id, asset_id, tag_id)
                        DO UPDATE SET
                            source = EXCLUDED.source,
                            confidence = GREATEST(
                                COALESCE(asset_tags.confidence, 0),
                                COALESCE(EXCLUDED.confidence, 0)
                            ),
                            ai_metadata = COALESCE(EXCLUDED.ai_metadata, asset_tags.ai_metadata)
                        WHERE asset_tags.source != 'manual'
                        """,
                        workspace_id,
                        asset_id,
                        tag_id,
                        source,
                        confidence,
                        json.dumps(metadata) if metadata else None,
                    )

                    created_tags.append({
                        "tag_id": str(tag_id),
                        "name": name,
                        "type": tag_type,
                        "source": source,
                        "confidence": confidence,
                    })

            logger.info(
                "AI tags added to asset",
                extra={
                    "asset_id": str(asset_id),
                    "tag_count": len(created_tags),
                    "source": source,
                },
            )

            return created_tags

    async def remove_ai_tags(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> int:
        """Remove all AI-generated tags from an asset.

        Preserves manual tags (source='manual').

        Args:
            workspace_id: Workspace ID
            asset_id: Asset ID

        Returns:
            Number of tags removed
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM asset_tags
                WHERE workspace_id = $1
                  AND asset_id = $2
                  AND source != 'manual'
                """,
                workspace_id,
                asset_id,
            )

            count = int(result.split()[-1]) if result else 0

            if count > 0:
                logger.info(
                    "AI tags removed from asset",
                    extra={
                        "asset_id": str(asset_id),
                        "count": count,
                    },
                )

            return count

    async def get_asset_tags_by_source(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        source: Optional[str] = None,
    ) -> list[dict]:
        """Get tags for an asset, optionally filtered by source.

        Args:
            workspace_id: Workspace ID
            asset_id: Asset ID
            source: Optional filter - 'manual', 'ai_vision', 'ai_gemini', 'ai_local', or 'ai' (all AI)

        Returns:
            List of tag dicts with source and confidence
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build query based on source filter
            if source == "manual":
                source_filter = "AND at.source = 'manual'"
            elif source == "ai":
                source_filter = "AND at.source != 'manual'"
            elif source in ("ai_vision", "ai_gemini", "ai_local"):
                source_filter = f"AND at.source = '{source}'"
            else:
                source_filter = ""

            tags = await conn.fetch(
                f"""
                SELECT
                    t.tag_id, t.name, t.type, t.color,
                    at.source, at.confidence, at.ai_metadata, at.created_at
                FROM asset_tags at
                JOIN tags t ON at.tag_id = t.tag_id
                WHERE at.workspace_id = $1 AND at.asset_id = $2
                {source_filter}
                ORDER BY
                    CASE WHEN at.source = 'manual' THEN 0 ELSE 1 END,
                    at.confidence DESC NULLS LAST,
                    t.name ASC
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
                    "source": t["source"],
                    "confidence": float(t["confidence"]) if t["confidence"] else None,
                    "ai_metadata": t["ai_metadata"],
                    "created_at": t["created_at"].isoformat() if t["created_at"] else None,
                }
                for t in tags
            ]

    async def get_ai_tag_stats(
        self,
        workspace_id: UUID,
    ) -> dict:
        """Get AI tagging statistics for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Dict with tag counts by source
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    source,
                    COUNT(*) as count,
                    COUNT(DISTINCT asset_id) as assets,
                    COUNT(DISTINCT tag_id) as unique_tags,
                    AVG(confidence) as avg_confidence
                FROM asset_tags
                WHERE workspace_id = $1
                GROUP BY source
                """,
                workspace_id,
            )

            stats = {
                "manual": {"count": 0, "assets": 0, "unique_tags": 0, "avg_confidence": None},
                "ai_vision": {"count": 0, "assets": 0, "unique_tags": 0, "avg_confidence": None},
                "ai_gemini": {"count": 0, "assets": 0, "unique_tags": 0, "avg_confidence": None},
                "ai_local": {"count": 0, "assets": 0, "unique_tags": 0, "avg_confidence": None},
            }

            for row in rows:
                source = row["source"]
                if source in stats:
                    stats[source] = {
                        "count": row["count"],
                        "assets": row["assets"],
                        "unique_tags": row["unique_tags"],
                        "avg_confidence": float(row["avg_confidence"]) if row["avg_confidence"] else None,
                    }

            return stats


# Export singleton instance
_tag_service: Optional[TagService] = None


def get_tag_service() -> TagService:
    """Get singleton tag service instance."""
    global _tag_service
    if _tag_service is None:
        _tag_service = TagService()
    return _tag_service
