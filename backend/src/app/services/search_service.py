"""SearchService: Unified search across galleries, assets, tags, comments, and people.

Implements comprehensive search within workspace scope.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from app.db.postgres import acquire_conn, get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Search Service
# ---------------------------------------------------------------------------


class SearchService:
    """Service for unified search operations."""

    def _build_tag_source_filter(self, tag_source: Optional[str]) -> str:
        """Build SQL filter clause for tag source.

        Args:
            tag_source: Filter mode - 'all', 'manual', 'ai', 'ai_vision', 'ai_gemini', 'ai_local'

        Returns:
            SQL clause to append to tag subqueries
        """
        if not tag_source or tag_source == "all":
            return ""
        elif tag_source == "manual":
            return "AND at.source = 'manual'"
        elif tag_source == "ai":
            # Match any AI source
            return "AND at.source != 'manual'"
        elif tag_source in ("ai_vision", "ai_gemini", "ai_local"):
            return f"AND at.source = '{tag_source}'"
        return ""

    async def search(
        self,
        workspace_id: UUID,
        query: str,
        entity_types: Optional[list[str]] = None,
        gallery_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 20,
        tag_source: Optional[str] = None,
    ) -> dict:
        """
        Unified search across multiple entity types.

        Args:
            workspace_id: Workspace to search in
            query: Search query string
            entity_types: List of entity types to search ('galleries', 'assets', 'tags', 'people', 'comments')
            gallery_id: Optional gallery to scope the search
            page: Page number
            limit: Results per page
            tag_source: Filter tags by source ('all', 'manual', 'ai', 'ai_vision', 'ai_gemini', 'ai_local')

        Returns:
            Dict with results grouped by entity type
        """
        if not entity_types:
            entity_types = ["galleries", "assets", "tags", "people", "comments"]

        results = {
            "query": query,
            "results": {},
            "total": 0,
        }

        # Execute searches in parallel conceptually, but sequentially for simplicity
        if "galleries" in entity_types:
            galleries = await self._search_galleries(workspace_id, query, limit)
            results["results"]["galleries"] = galleries
            results["total"] += len(galleries)

        if "assets" in entity_types:
            assets = await self._search_assets(workspace_id, query, gallery_id, limit, tag_source)
            results["results"]["assets"] = assets
            results["total"] += len(assets)

        if "tags" in entity_types:
            tags = await self._search_tags(workspace_id, query, limit)
            results["results"]["tags"] = tags
            results["total"] += len(tags)

        if "people" in entity_types:
            people = await self._search_people(workspace_id, query, limit)
            results["results"]["people"] = people
            results["total"] += len(people)

        if "comments" in entity_types:
            comments = await self._search_comments(workspace_id, query, gallery_id, limit)
            results["results"]["comments"] = comments
            results["total"] += len(comments)

        return results

    async def _search_galleries(
        self,
        workspace_id: UUID,
        query: str,
        limit: int = 10,
    ) -> list[dict]:
        """Search galleries by title, description, or client name."""
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            galleries = await conn.fetch(
                """
                SELECT
                    gallery_id, title, description, client_name, status, created_at
                FROM galleries
                WHERE workspace_id = $1
                AND deleted = FALSE
                AND (
                    title ILIKE $2
                    OR description ILIKE $2
                    OR client_name ILIKE $2
                )
                ORDER BY
                    CASE WHEN title ILIKE $2 THEN 0 ELSE 1 END,
                    created_at DESC
                LIMIT $3
                """,
                workspace_id,
                f"%{query}%",
                limit,
            )

            return [
                {
                    "gallery_id": str(g["gallery_id"]),
                    "title": g["title"],
                    "description": g["description"],
                    "client_name": g["client_name"],
                    "status": g["status"],
                    "created_at": g["created_at"].isoformat(),
                    "match_type": "gallery",
                }
                for g in galleries
            ]

    async def _search_assets(
        self,
        workspace_id: UUID,
        query: str,
        gallery_id: Optional[UUID] = None,
        limit: int = 20,
        tag_source: Optional[str] = None,
    ) -> list[dict]:
        """Search assets by filename, tags, people names, or comments.

        Args:
            workspace_id: Workspace to search in
            query: Search query string
            gallery_id: Optional gallery to scope the search
            limit: Maximum results to return
            tag_source: Filter tags by source ('all', 'manual', 'ai', 'ai_vision', 'ai_gemini', 'ai_local')

        Returns:
            List of matching assets with match_type indicator
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            # Build query to search assets by various criteria
            gallery_filter = ""
            params = [workspace_id, f"%{query}%", limit]

            if gallery_id:
                gallery_filter = "AND ga.gallery_id = $4"
                params.append(gallery_id)

            # Build tag source filter
            tag_source_filter = self._build_tag_source_filter(tag_source)

            assets = await conn.fetch(
                f"""
                SELECT DISTINCT ON (a.asset_id)
                    a.asset_id, a.file_name, a.mime_type, a.size_bytes, a.created_at,
                    ga.gallery_id,
                    CASE
                        WHEN a.file_name ILIKE $2 THEN 'filename'
                        WHEN EXISTS (
                            SELECT 1 FROM asset_tags at
                            JOIN tags t ON at.tag_id = t.tag_id
                            WHERE at.asset_id = a.asset_id AND t.name ILIKE $2
                            {tag_source_filter}
                        ) THEN 'tag'
                        WHEN EXISTS (
                            SELECT 1 FROM face_detections fd
                            LEFT JOIN people p ON fd.person_id = p.person_id
                            LEFT JOIN face_groups fg ON fd.group_id = fg.id
                            LEFT JOIN people pg ON fg.person_id = pg.person_id
                            WHERE fd.asset_id = a.asset_id
                            AND (p.display_name ILIKE $2 OR pg.display_name ILIKE $2)
                        ) THEN 'person'
                        WHEN EXISTS (
                            SELECT 1 FROM comments c
                            WHERE c.asset_id = a.asset_id AND c.body ILIKE $2 AND c.deleted = FALSE
                        ) THEN 'comment'
                        ELSE 'other'
                    END as match_type
                FROM assets a
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.workspace_id = $1
                AND a.deleted = FALSE
                AND a.status = 'available'
                {gallery_filter}
                AND (
                    a.file_name ILIKE $2
                    OR EXISTS (
                        SELECT 1 FROM asset_tags at
                        JOIN tags t ON at.tag_id = t.tag_id
                        WHERE at.asset_id = a.asset_id AND t.name ILIKE $2
                        {tag_source_filter}
                    )
                    OR EXISTS (
                        SELECT 1 FROM face_detections fd
                        LEFT JOIN people p ON fd.person_id = p.person_id
                        LEFT JOIN face_groups fg ON fd.group_id = fg.id
                        LEFT JOIN people pg ON fg.person_id = pg.person_id
                        WHERE fd.asset_id = a.asset_id
                        AND (p.display_name ILIKE $2 OR pg.display_name ILIKE $2)
                    )
                    OR EXISTS (
                        SELECT 1 FROM comments c
                        WHERE c.asset_id = a.asset_id AND c.body ILIKE $2 AND c.deleted = FALSE
                    )
                )
                ORDER BY a.asset_id, a.created_at DESC
                LIMIT $3
                """,
                *params,
            )

            return [
                {
                    "asset_id": str(a["asset_id"]),
                    "file_name": a["file_name"],
                    "mime_type": a["mime_type"],
                    "size_bytes": a["size_bytes"],
                    "gallery_id": str(a["gallery_id"]) if a["gallery_id"] else None,
                    "created_at": a["created_at"].isoformat(),
                    "match_type": a["match_type"],
                }
                for a in assets
            ]

    async def _search_tags(
        self,
        workspace_id: UUID,
        query: str,
        limit: int = 10,
    ) -> list[dict]:
        """Search tags by name."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            tags = await conn.fetch(
                """
                SELECT
                    t.tag_id, t.name, t.type, t.color,
                    (SELECT COUNT(*) FROM asset_tags WHERE tag_id = t.tag_id) as usage_count
                FROM tags t
                WHERE t.workspace_id = $1
                AND t.name ILIKE $2
                ORDER BY usage_count DESC, t.name ASC
                LIMIT $3
                """,
                workspace_id,
                f"%{query}%",
                limit,
            )

            return [
                {
                    "tag_id": str(t["tag_id"]),
                    "name": t["name"],
                    "type": t["type"],
                    "color": t["color"],
                    "usage_count": t["usage_count"] or 0,
                    "match_type": "tag",
                }
                for t in tags
            ]

    async def _search_people(
        self,
        workspace_id: UUID,
        query: str,
        limit: int = 10,
    ) -> list[dict]:
        """Search people by display name."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            people = await conn.fetch(
                """
                SELECT
                    p.person_id, p.display_name, p.status,
                    (SELECT COUNT(*) FROM face_detections WHERE person_id = p.person_id) as face_count,
                    (SELECT fd.asset_id FROM face_detections fd WHERE fd.face_id = p.cover_face_id) as cover_asset_id
                FROM people p
                WHERE p.workspace_id = $1
                AND p.status != 'deleted'
                AND p.display_name ILIKE $2
                ORDER BY face_count DESC, p.display_name ASC
                LIMIT $3
                """,
                workspace_id,
                f"%{query}%",
                limit,
            )

            return [
                {
                    "person_id": str(p["person_id"]),
                    "display_name": p["display_name"],
                    "status": p["status"],
                    "face_count": p["face_count"] or 0,
                    "cover_asset_id": str(p["cover_asset_id"]) if p["cover_asset_id"] else None,
                    "match_type": "person",
                }
                for p in people
            ]

    async def _search_comments(
        self,
        workspace_id: UUID,
        query: str,
        gallery_id: Optional[UUID] = None,
        limit: int = 10,
    ) -> list[dict]:
        """Search comments by body content."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            gallery_filter = ""
            params = [workspace_id, f"%{query}%", limit]

            if gallery_id:
                gallery_filter = "AND c.gallery_id = $4"
                params.append(gallery_id)

            comments = await conn.fetch(
                f"""
                SELECT
                    c.comment_id, c.gallery_id, c.asset_id, c.body,
                    c.author_name, c.created_at,
                    u.display_name as author_display_name
                FROM comments c
                LEFT JOIN users u ON c.author_user_id = u.user_id
                WHERE c.workspace_id = $1
                AND c.deleted = FALSE
                AND c.body ILIKE $2
                {gallery_filter}
                ORDER BY c.created_at DESC
                LIMIT $3
                """,
                *params,
            )

            return [
                {
                    "comment_id": str(c["comment_id"]),
                    "gallery_id": str(c["gallery_id"]),
                    "asset_id": str(c["asset_id"]) if c["asset_id"] else None,
                    "body": c["body"][:200] + "..." if len(c["body"]) > 200 else c["body"],
                    "author_name": c["author_display_name"] or c["author_name"] or "Anonymous",
                    "created_at": c["created_at"].isoformat(),
                    "match_type": "comment",
                }
                for c in comments
            ]

    async def search_assets_by_tag(
        self,
        workspace_id: UUID,
        tag_id: UUID,
        gallery_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 50,
        tag_source: Optional[str] = None,
    ) -> dict:
        """Get all assets with a specific tag.

        Args:
            workspace_id: Workspace to search in
            tag_id: Tag ID to filter by
            gallery_id: Optional gallery to scope the search
            page: Page number
            limit: Results per page
            tag_source: Filter by tag source ('all', 'manual', 'ai', 'ai_vision', 'ai_gemini', 'ai_local')

        Returns:
            Paginated dict with assets matching the tag
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            offset = (page - 1) * limit

            gallery_filter = ""
            params = [workspace_id, tag_id, limit, offset]

            if gallery_id:
                gallery_filter = "AND ga.gallery_id = $5"
                params.append(gallery_id)

            # Build tag source filter
            tag_source_filter = self._build_tag_source_filter(tag_source)

            # Get total count
            count_query = f"""
                SELECT COUNT(DISTINCT a.asset_id)
                FROM assets a
                JOIN asset_tags at ON a.asset_id = at.asset_id
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.workspace_id = $1
                AND at.tag_id = $2
                AND a.deleted = FALSE
                AND a.status = 'available'
                {tag_source_filter}
                {gallery_filter}
            """
            total = await conn.fetchval(count_query, *params[:2] if not gallery_id else params[:2] + [gallery_id])

            # Get assets
            assets = await conn.fetch(
                f"""
                SELECT DISTINCT ON (a.asset_id)
                    a.asset_id, a.file_name, a.mime_type, a.size_bytes, a.created_at,
                    ga.gallery_id
                FROM assets a
                JOIN asset_tags at ON a.asset_id = at.asset_id
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.workspace_id = $1
                AND at.tag_id = $2
                AND a.deleted = FALSE
                AND a.status = 'available'
                {tag_source_filter}
                {gallery_filter}
                ORDER BY a.asset_id, a.created_at DESC
                LIMIT $3 OFFSET $4
                """,
                *params,
            )

            return {
                "data": [
                    {
                        "asset_id": str(a["asset_id"]),
                        "file_name": a["file_name"],
                        "mime_type": a["mime_type"],
                        "size_bytes": a["size_bytes"],
                        "gallery_id": str(a["gallery_id"]) if a["gallery_id"] else None,
                        "created_at": a["created_at"].isoformat(),
                    }
                    for a in assets
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total or 0,
                    "totalPages": ((total or 0) + limit - 1) // limit if total else 0,
                },
            }

    async def search_assets_by_person(
        self,
        workspace_id: UUID,
        person_id: UUID,
        gallery_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """Get all assets containing a specific person.

        Searches for assets where the person appears via:
        1. Direct face_detections.person_id assignment
        2. Face group assignment (face_detections.group_id → face_groups.person_id)

        This unified search ensures all photos of a person are found regardless
        of whether faces were assigned individually or via group naming.
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            offset = (page - 1) * limit

            gallery_filter = ""
            params = [workspace_id, person_id, limit, offset]

            if gallery_id:
                gallery_filter = "AND ga.gallery_id = $5"
                params.append(gallery_id)

            # Get total count - search both direct and group-based person assignments
            total = await conn.fetchval(
                f"""
                SELECT COUNT(DISTINCT a.asset_id)
                FROM assets a
                JOIN face_detections fd ON a.asset_id = fd.asset_id
                LEFT JOIN face_groups fg ON fd.group_id = fg.id
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.workspace_id = $1
                AND (fd.person_id = $2 OR fg.person_id = $2)
                AND a.deleted = FALSE
                AND a.status = 'available'
                {gallery_filter}
                """,
                *params[:2] if not gallery_id else params[:2] + [gallery_id],
            )

            # Get assets - search both direct and group-based person assignments
            assets = await conn.fetch(
                f"""
                SELECT DISTINCT ON (a.asset_id)
                    a.asset_id, a.file_name, a.mime_type, a.size_bytes, a.created_at,
                    ga.gallery_id
                FROM assets a
                JOIN face_detections fd ON a.asset_id = fd.asset_id
                LEFT JOIN face_groups fg ON fd.group_id = fg.id
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.workspace_id = $1
                AND (fd.person_id = $2 OR fg.person_id = $2)
                AND a.deleted = FALSE
                AND a.status = 'available'
                {gallery_filter}
                ORDER BY a.asset_id, a.created_at DESC
                LIMIT $3 OFFSET $4
                """,
                *params,
            )

            return {
                "data": [
                    {
                        "asset_id": str(a["asset_id"]),
                        "file_name": a["file_name"],
                        "mime_type": a["mime_type"],
                        "size_bytes": a["size_bytes"],
                        "gallery_id": str(a["gallery_id"]) if a["gallery_id"] else None,
                        "created_at": a["created_at"].isoformat(),
                    }
                    for a in assets
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total or 0,
                    "totalPages": ((total or 0) + limit - 1) // limit if total else 0,
                },
            }


    async def filter_gallery_assets(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        filters: dict,
    ) -> dict:
        """Filter gallery assets by tags, people, and tag source.

        Args:
            workspace_id: Workspace to search in
            gallery_id: Gallery to filter assets from
            filters: Dict with optional keys: tags, people, tag_source

        Returns:
            Dict with asset_ids list and total_count
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build WHERE clauses
            where_clauses = [
                "a.workspace_id = $1",
                "ga.gallery_id = $2",
                "a.deleted = FALSE",
                "a.status = 'available'"
            ]
            params = [workspace_id, gallery_id]
            param_index = 3

            # Tag filter
            if filters.get("tags"):
                tag_names = filters["tags"]
                placeholders = ", ".join(f"${param_index + i}" for i in range(len(tag_names)))
                where_clauses.append(f"t.name = ANY(ARRAY[{placeholders}])")
                params.extend(tag_names)
                param_index += len(tag_names)

            # Person filter
            if filters.get("people"):
                person_names = filters["people"]
                placeholders = ", ".join(f"${param_index + i}" for i in range(len(person_names)))
                where_clauses.append(f"p.name = ANY(ARRAY[{placeholders}])")
                params.extend(person_names)
                param_index += len(person_names)

            # Tag source filter
            tag_source_filter = self._build_tag_source_filter(filters.get("tag_source"))
            if tag_source_filter:
                where_clauses.append(tag_source_filter.replace("at.", ""))  # Remove table prefix

            where_clause = " AND ".join(where_clauses)

            # Build the query
            query = f"""
                SELECT DISTINCT a.asset_id::text
                FROM assets a
                JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                {"LEFT JOIN asset_tags at ON a.asset_id = at.asset_id" if filters.get("tags") or tag_source_filter else ""}
                {"LEFT JOIN tags t ON at.tag_id = t.tag_id" if filters.get("tags") else ""}
                {"LEFT JOIN face_groups fg ON a.asset_id = fg.asset_id" if filters.get("people") else ""}
                {"LEFT JOIN people p ON fg.person_id = p.person_id" if filters.get("people") else ""}
                WHERE {where_clause}
                ORDER BY a.asset_id
            """

            assets = await conn.fetch(query, *params)

            return {
                "asset_ids": [a["asset_id"] for a in assets],
                "total_count": len(assets),
            }


# Export singleton instance
_search_service: Optional[SearchService] = None


def get_search_service() -> SearchService:
    """Get singleton search service instance."""
    global _search_service
    if _search_service is None:
        _search_service = SearchService()
    return _search_service
