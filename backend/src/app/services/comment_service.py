"""CommentService: CRUD operations for comments on assets and galleries.

Implements comment management within workspace scope.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.workspace_activity_service import record_comment_added

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class CommentError(Exception):
    """Base comment error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class CommentNotFoundError(CommentError):
    """Comment not found."""

    def __init__(self, comment_id: UUID) -> None:
        super().__init__(
            f"Comment {comment_id} not found",
            "COMMENT_NOT_FOUND",
            404,
        )


class CommentForbiddenError(CommentError):
    """User cannot modify this comment."""

    def __init__(self) -> None:
        super().__init__(
            "You do not have permission to modify this comment",
            "COMMENT_FORBIDDEN",
            403,
        )


# ---------------------------------------------------------------------------
# Comment Service
# ---------------------------------------------------------------------------


class CommentService:
    """Service for comment operations."""

    async def create_comment(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        body: str,
        author_user_id: Optional[UUID] = None,
        author_name: Optional[str] = None,
        author_email: Optional[str] = None,
        asset_id: Optional[UUID] = None,
        annotations: Optional[dict] = None,
        is_internal: bool = False,
    ) -> dict:
        """Create a new comment."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            comment_id = await conn.fetchval(
                """
                INSERT INTO comments (
                    workspace_id, gallery_id, asset_id,
                    author_user_id, author_name, author_email,
                    body, annotations, is_internal
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING comment_id
                """,
                workspace_id,
                gallery_id,
                asset_id,
                author_user_id,
                author_name,
                author_email,
                body,
                annotations,
                is_internal,
            )

            # Record comment activity (only for non-internal comments)
            if not is_internal:
                try:
                    # Get gallery name for activity
                    gallery_name = await conn.fetchval(
                        "SELECT title FROM galleries WHERE gallery_id = $1 AND workspace_id = $2",
                        gallery_id,
                        workspace_id,
                    )
                    await record_comment_added(
                        workspace_id=workspace_id,
                        gallery_id=gallery_id,
                        gallery_name=gallery_name or "Unknown Gallery",
                        comment_id=comment_id,
                        author_name=author_name or "Unknown",
                        author_email=author_email,
                        user_id=author_user_id,
                    )
                except Exception as e:
                    # Don't fail comment creation if activity recording fails
                    logger.warning(f"Failed to record comment activity: {e}")

            return await self.get_comment(workspace_id, comment_id)

    async def get_comment(self, workspace_id: UUID, comment_id: UUID) -> dict:
        """Get a specific comment."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    c.comment_id, c.workspace_id, c.gallery_id, c.asset_id,
                    c.author_user_id, c.author_name, c.author_email,
                    c.body, c.annotations, c.is_internal,
                    c.status, c.resolved_by_user_id, c.resolved_at,
                    c.moderation_state, c.created_at, c.updated_at,
                    u.display_name as author_display_name
                FROM comments c
                LEFT JOIN users u ON c.author_user_id = u.user_id
                WHERE c.workspace_id = $1 AND c.comment_id = $2 AND c.deleted = FALSE
                """,
                workspace_id,
                comment_id,
            )
            if not row:
                raise CommentNotFoundError(comment_id)

            return self._format_comment(row)

    def _format_comment(self, row) -> dict:
        """Format a comment row into a response dict."""
        # Determine author display name
        author_display = row["author_display_name"] or row["author_name"] or "Anonymous"

        return {
            "comment_id": str(row["comment_id"]),
            "workspace_id": str(row["workspace_id"]),
            "gallery_id": str(row["gallery_id"]),
            "asset_id": str(row["asset_id"]) if row["asset_id"] else None,
            "author": {
                "user_id": str(row["author_user_id"]) if row["author_user_id"] else None,
                "name": author_display,
                "email": row["author_email"],
            },
            "body": row["body"],
            "annotations": row["annotations"],
            "is_internal": row["is_internal"],
            "status": row["status"],
            "resolved_by_user_id": str(row["resolved_by_user_id"]) if row["resolved_by_user_id"] else None,
            "resolved_at": row["resolved_at"].isoformat() if row["resolved_at"] else None,
            "moderation_state": row["moderation_state"],
            "created_at": row["created_at"].isoformat(),
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }

    async def list_comments(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID] = None,
        asset_id: Optional[UUID] = None,
        include_internal: bool = True,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """List comments for a gallery or asset."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            offset = (page - 1) * limit

            # Build WHERE clause
            where_clauses = ["c.workspace_id = $1", "c.deleted = FALSE"]
            params = [workspace_id]
            param_idx = 2

            if gallery_id:
                where_clauses.append(f"c.gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if asset_id:
                where_clauses.append(f"c.asset_id = ${param_idx}")
                params.append(asset_id)
                param_idx += 1

            if not include_internal:
                where_clauses.append("c.is_internal = FALSE")

            if status:
                where_clauses.append(f"c.status = ${param_idx}")
                params.append(status)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM comments c WHERE {where_sql}",
                *params,
            )

            # Get comments
            comments = await conn.fetch(
                f"""
                SELECT
                    c.comment_id, c.workspace_id, c.gallery_id, c.asset_id,
                    c.author_user_id, c.author_name, c.author_email,
                    c.body, c.annotations, c.is_internal,
                    c.status, c.resolved_by_user_id, c.resolved_at,
                    c.moderation_state, c.created_at, c.updated_at,
                    u.display_name as author_display_name
                FROM comments c
                LEFT JOIN users u ON c.author_user_id = u.user_id
                WHERE {where_sql}
                ORDER BY c.created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return {
                "data": [self._format_comment(c) for c in comments],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": (total + limit - 1) // limit if total else 0,
                },
            }

    async def update_comment(
        self,
        workspace_id: UUID,
        comment_id: UUID,
        user_id: UUID,
        body: Optional[str] = None,
        annotations: Optional[dict] = None,
    ) -> dict:
        """Update a comment. User must be the author."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check comment exists and user is author
            row = await conn.fetchrow(
                "SELECT author_user_id FROM comments WHERE workspace_id = $1 AND comment_id = $2 AND deleted = FALSE",
                workspace_id,
                comment_id,
            )
            if not row:
                raise CommentNotFoundError(comment_id)
            if row["author_user_id"] != user_id:
                raise CommentForbiddenError()

            # Build update query
            set_clauses = ["updated_at = NOW()"]
            params = []
            param_idx = 1

            if body is not None:
                set_clauses.append(f"body = ${param_idx}")
                params.append(body)
                param_idx += 1

            if annotations is not None:
                set_clauses.append(f"annotations = ${param_idx}")
                params.append(annotations)
                param_idx += 1

            params.extend([workspace_id, comment_id])

            await conn.execute(
                f"""
                UPDATE comments
                SET {', '.join(set_clauses)}
                WHERE workspace_id = ${param_idx} AND comment_id = ${param_idx + 1}
                """,
                *params,
            )

            return await self.get_comment(workspace_id, comment_id)

    async def delete_comment(
        self,
        workspace_id: UUID,
        comment_id: UUID,
        user_id: UUID,
        is_admin: bool = False,
    ) -> None:
        """Soft delete a comment. User must be author or admin."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check comment exists and user can delete
            row = await conn.fetchrow(
                "SELECT author_user_id FROM comments WHERE workspace_id = $1 AND comment_id = $2 AND deleted = FALSE",
                workspace_id,
                comment_id,
            )
            if not row:
                raise CommentNotFoundError(comment_id)
            if row["author_user_id"] != user_id and not is_admin:
                raise CommentForbiddenError()

            await conn.execute(
                """
                UPDATE comments
                SET deleted = TRUE, deleted_at = NOW()
                WHERE workspace_id = $1 AND comment_id = $2
                """,
                workspace_id,
                comment_id,
            )

    async def resolve_comment(
        self,
        workspace_id: UUID,
        comment_id: UUID,
        user_id: UUID,
        resolved: bool = True,
    ) -> dict:
        """Mark a comment as resolved or reopen it."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check comment exists
            exists = await conn.fetchval(
                "SELECT 1 FROM comments WHERE workspace_id = $1 AND comment_id = $2 AND deleted = FALSE",
                workspace_id,
                comment_id,
            )
            if not exists:
                raise CommentNotFoundError(comment_id)

            if resolved:
                await conn.execute(
                    """
                    UPDATE comments
                    SET status = 'resolved', resolved_by_user_id = $3, resolved_at = NOW(), updated_at = NOW()
                    WHERE workspace_id = $1 AND comment_id = $2
                    """,
                    workspace_id,
                    comment_id,
                    user_id,
                )
            else:
                await conn.execute(
                    """
                    UPDATE comments
                    SET status = 'open', resolved_by_user_id = NULL, resolved_at = NULL, updated_at = NOW()
                    WHERE workspace_id = $1 AND comment_id = $2
                    """,
                    workspace_id,
                    comment_id,
                )

            return await self.get_comment(workspace_id, comment_id)

    async def get_comment_count(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID] = None,
        asset_id: Optional[UUID] = None,
    ) -> int:
        """Get comment count for a gallery or asset."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            where_clauses = ["workspace_id = $1", "deleted = FALSE"]
            params = [workspace_id]
            param_idx = 2

            if gallery_id:
                where_clauses.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if asset_id:
                where_clauses.append(f"asset_id = ${param_idx}")
                params.append(asset_id)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            count = await conn.fetchval(
                f"SELECT COUNT(*) FROM comments WHERE {where_sql}",
                *params,
            )
            return count or 0


# Export singleton instance
_comment_service: Optional[CommentService] = None


def get_comment_service() -> CommentService:
    """Get singleton comment service instance."""
    global _comment_service
    if _comment_service is None:
        _comment_service = CommentService()
    return _comment_service
