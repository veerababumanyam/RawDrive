"""Repository for album comment data operations.

This module provides the AlbumCommentRepository class for managing
positioned comments on album spreads.

Feature: 026-album-proofing
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class AlbumCommentRepository:
    """Data access layer for album comment records.

    All methods enforce workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # CREATE
    # =========================================================================

    async def create_comment(
        self,
        album_id: UUID,
        spread_id: UUID,
        workspace_id: UUID,
        body: str,
        position_x: float,
        position_y: float,
        author_name: str,
        author_email: Optional[str] = None,
        author_user_id: Optional[UUID] = None,
        parent_comment_id: Optional[UUID] = None,
        is_internal: bool = False,
    ) -> dict[str, Any]:
        """Create a new positioned comment."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO album_comments (
                    album_id, spread_id, workspace_id, body,
                    position_x, position_y, author_name, author_email,
                    author_user_id, parent_comment_id, is_internal, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')
                RETURNING *
                """,
                album_id,
                spread_id,
                workspace_id,
                body,
                position_x,
                position_y,
                author_name,
                author_email,
                author_user_id,
                parent_comment_id,
                is_internal,
            )

            logger.info(
                "Album comment created",
                extra={
                    "comment_id": str(row["comment_id"]),
                    "album_id": str(album_id),
                    "spread_id": str(spread_id),
                    "author_name": author_name,
                },
            )

            return dict(row)

    # =========================================================================
    # READ
    # =========================================================================

    async def get_comment_by_id(
        self,
        comment_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get comment by ID with workspace isolation."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM album_comments
                WHERE comment_id = $1 AND workspace_id = $2 AND deleted = FALSE
                """,
                comment_id,
                workspace_id,
            )

            return dict(row) if row else None

    async def list_comments_by_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
        spread_id: Optional[UUID] = None,
        status: Optional[str] = None,
        include_resolved: bool = True,
        include_internal: bool = True,
    ) -> list[dict[str, Any]]:
        """List comments for an album with optional filtering."""
        pool = await get_postgres_pool()

        conditions = [
            "album_id = $1",
            "workspace_id = $2",
            "deleted = FALSE",
            "parent_comment_id IS NULL",  # Only top-level comments
        ]
        params: list[Any] = [album_id, workspace_id]
        param_idx = 3

        if spread_id:
            conditions.append(f"spread_id = ${param_idx}")
            params.append(spread_id)
            param_idx += 1

        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1
        elif not include_resolved:
            conditions.append("status != 'resolved'")

        if not include_internal:
            conditions.append("is_internal = FALSE")

        where_clause = " AND ".join(conditions)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT * FROM album_comments
                WHERE {where_clause}
                ORDER BY created_at DESC
                """,
                *params,
            )

            comments = [dict(row) for row in rows]

            # Load replies for each top-level comment
            for comment in comments:
                comment["replies"] = await self._get_replies(
                    conn,
                    comment["comment_id"],
                    workspace_id,
                    include_internal,
                )

            return comments

    async def _get_replies(
        self,
        conn,
        parent_comment_id: UUID,
        workspace_id: UUID,
        include_internal: bool = True,
    ) -> list[dict[str, Any]]:
        """Get replies to a comment recursively."""
        conditions = [
            "parent_comment_id = $1",
            "workspace_id = $2",
            "deleted = FALSE",
        ]
        params: list[Any] = [parent_comment_id, workspace_id]

        if not include_internal:
            conditions.append("is_internal = FALSE")

        where_clause = " AND ".join(conditions)

        rows = await conn.fetch(
            f"""
            SELECT * FROM album_comments
            WHERE {where_clause}
            ORDER BY created_at ASC
            """,
            *params,
        )

        replies = [dict(row) for row in rows]

        # Recursively load nested replies
        for reply in replies:
            reply["replies"] = await self._get_replies(
                conn,
                reply["comment_id"],
                workspace_id,
                include_internal,
            )

        return replies

    async def get_comment_summary(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Get comment statistics for an album."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'open') as open,
                    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                    COUNT(*) FILTER (WHERE status = 'resolved') as resolved
                FROM album_comments
                WHERE album_id = $1 AND workspace_id = $2 AND deleted = FALSE
                """,
                album_id,
                workspace_id,
            )

            return dict(row)

    async def count_unresolved_comments(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Count unresolved comments for approval validation."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM album_comments
                WHERE album_id = $1 AND workspace_id = $2
                  AND status != 'resolved' AND deleted = FALSE
                """,
                album_id,
                workspace_id,
            )

            return count

    # =========================================================================
    # UPDATE
    # =========================================================================

    async def update_comment(
        self,
        comment_id: UUID,
        workspace_id: UUID,
        body: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update comment body or status."""
        pool = await get_postgres_pool()

        set_parts = []
        params: list[Any] = []
        param_idx = 1

        if body is not None:
            set_parts.append(f"body = ${param_idx}")
            params.append(body)
            param_idx += 1

        if status is not None:
            set_parts.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1

        if not set_parts:
            return await self.get_comment_by_id(comment_id, workspace_id)

        params.extend([comment_id, workspace_id])
        set_clause = ", ".join(set_parts)

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE album_comments
                SET {set_clause}, updated_at = NOW()
                WHERE comment_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                  AND deleted = FALSE
                RETURNING *
                """,
                *params,
            )

            return dict(row) if row else None

    async def resolve_comment(
        self,
        comment_id: UUID,
        workspace_id: UUID,
        resolved_by_user_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Mark comment as resolved."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE album_comments
                SET status = 'resolved',
                    resolved_by_user_id = $3,
                    resolved_at = NOW(),
                    updated_at = NOW()
                WHERE comment_id = $1 AND workspace_id = $2 AND deleted = FALSE
                RETURNING *
                """,
                comment_id,
                workspace_id,
                resolved_by_user_id,
            )

            if row:
                logger.info(
                    "Album comment resolved",
                    extra={
                        "comment_id": str(comment_id),
                        "resolved_by": str(resolved_by_user_id),
                    },
                )

            return dict(row) if row else None

    async def reopen_comment(
        self,
        comment_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Reopen a resolved comment."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE album_comments
                SET status = 'open',
                    resolved_by_user_id = NULL,
                    resolved_at = NULL,
                    updated_at = NOW()
                WHERE comment_id = $1 AND workspace_id = $2 AND deleted = FALSE
                RETURNING *
                """,
                comment_id,
                workspace_id,
            )

            return dict(row) if row else None

    # =========================================================================
    # DELETE
    # =========================================================================

    async def soft_delete_comment(
        self,
        comment_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Soft delete a comment."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE album_comments
                SET deleted = TRUE, updated_at = NOW()
                WHERE comment_id = $1 AND workspace_id = $2
                """,
                comment_id,
                workspace_id,
            )

            deleted = "UPDATE 0" not in result

            if deleted:
                logger.info(
                    "Album comment soft deleted",
                    extra={"comment_id": str(comment_id)},
                )

            return deleted

    # =========================================================================
    # PUBLIC VIEW (excludes internal comments)
    # =========================================================================

    async def list_public_comments_by_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
        spread_id: Optional[UUID] = None,
    ) -> list[dict[str, Any]]:
        """List public comments (excludes internal notes)."""
        return await self.list_comments_by_album(
            album_id=album_id,
            workspace_id=workspace_id,
            spread_id=spread_id,
            include_internal=False,
        )
