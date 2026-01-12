"""Repository for album render data operations.

This module provides the AlbumRenderRepository class for managing
PDF generation jobs and render records.

Feature: 026-album-proofing
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class AlbumRenderRepository:
    """Data access layer for album render records.

    All methods enforce workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # CREATE
    # =========================================================================

    async def create_render(
        self,
        album_id: UUID,
        workspace_id: UUID,
        render_type: str,
        requested_by_user_id: UUID,
        resolution_dpi: int = 150,
        watermarked: bool = True,
    ) -> dict[str, Any]:
        """Create a new render job."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO album_renders (
                    album_id, workspace_id, render_type,
                    requested_by_user_id, resolution_dpi, watermarked, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, 'queued')
                RETURNING *
                """,
                album_id,
                workspace_id,
                render_type,
                requested_by_user_id,
                resolution_dpi,
                watermarked,
            )

            logger.info(
                "Album render job created",
                extra={
                    "render_id": str(row["render_id"]),
                    "album_id": str(album_id),
                    "render_type": render_type,
                },
            )

            return dict(row)

    # =========================================================================
    # READ
    # =========================================================================

    async def get_render_by_id(
        self,
        render_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get render by ID with workspace isolation."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM album_renders
                WHERE render_id = $1 AND workspace_id = $2
                """,
                render_id,
                workspace_id,
            )

            return dict(row) if row else None

    async def list_renders_by_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
        render_type: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """List renders for an album."""
        pool = await get_postgres_pool()

        conditions = ["album_id = $1", "workspace_id = $2"]
        params: list[Any] = [album_id, workspace_id]
        param_idx = 3

        if render_type:
            conditions.append(f"render_type = ${param_idx}")
            params.append(render_type)

        where_clause = " AND ".join(conditions)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT * FROM album_renders
                WHERE {where_clause}
                ORDER BY created_at DESC
                """,
                *params,
            )

            return [dict(row) for row in rows]

    async def get_latest_ready_render(
        self,
        album_id: UUID,
        workspace_id: UUID,
        render_type: str,
    ) -> Optional[dict[str, Any]]:
        """Get the latest ready render of a specific type."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM album_renders
                WHERE album_id = $1 AND workspace_id = $2
                  AND render_type = $3 AND status = 'ready'
                  AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY completed_at DESC
                LIMIT 1
                """,
                album_id,
                workspace_id,
                render_type,
            )

            return dict(row) if row else None

    async def get_pending_render(
        self,
        album_id: UUID,
        workspace_id: UUID,
        render_type: str,
    ) -> Optional[dict[str, Any]]:
        """Get any pending (queued/running) render of a specific type."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM album_renders
                WHERE album_id = $1 AND workspace_id = $2
                  AND render_type = $3 AND status IN ('queued', 'running')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                album_id,
                workspace_id,
                render_type,
            )

            return dict(row) if row else None

    # =========================================================================
    # UPDATE
    # =========================================================================

    async def update_render_status(
        self,
        render_id: UUID,
        workspace_id: UUID,
        status: str,
        error_message: Optional[str] = None,
        storage_path: Optional[str] = None,
        file_size_bytes: Optional[int] = None,
        page_count: Optional[int] = None,
        expires_at: Optional[datetime] = None,
    ) -> Optional[dict[str, Any]]:
        """Update render status and output info."""
        pool = await get_postgres_pool()

        set_parts = ["status = $3"]
        params: list[Any] = [render_id, workspace_id, status]
        param_idx = 4

        if error_message is not None:
            set_parts.append(f"error_message = ${param_idx}")
            params.append(error_message)
            param_idx += 1

        if storage_path is not None:
            set_parts.append(f"storage_path = ${param_idx}")
            params.append(storage_path)
            param_idx += 1

        if file_size_bytes is not None:
            set_parts.append(f"file_size_bytes = ${param_idx}")
            params.append(file_size_bytes)
            param_idx += 1

        if page_count is not None:
            set_parts.append(f"page_count = ${param_idx}")
            params.append(page_count)
            param_idx += 1

        if expires_at is not None:
            set_parts.append(f"expires_at = ${param_idx}")
            params.append(expires_at)
            param_idx += 1

        if status == "ready":
            set_parts.append("completed_at = NOW()")
        elif status == "running":
            # Track when processing started (if not already set)
            pass

        set_clause = ", ".join(set_parts)

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE album_renders
                SET {set_clause}
                WHERE render_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                *params,
            )

            if row and status in ("ready", "failed"):
                logger.info(
                    "Album render completed",
                    extra={
                        "render_id": str(render_id),
                        "status": status,
                        "error": error_message,
                    },
                )

            return dict(row) if row else None

    async def mark_render_running(
        self,
        render_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Mark render as running."""
        return await self.update_render_status(
            render_id=render_id,
            workspace_id=workspace_id,
            status="running",
        )

    async def mark_render_ready(
        self,
        render_id: UUID,
        workspace_id: UUID,
        storage_path: str,
        file_size_bytes: int,
        page_count: int,
        expires_at: datetime,
    ) -> Optional[dict[str, Any]]:
        """Mark render as ready with output info."""
        return await self.update_render_status(
            render_id=render_id,
            workspace_id=workspace_id,
            status="ready",
            storage_path=storage_path,
            file_size_bytes=file_size_bytes,
            page_count=page_count,
            expires_at=expires_at,
        )

    async def mark_render_failed(
        self,
        render_id: UUID,
        workspace_id: UUID,
        error_message: str,
    ) -> Optional[dict[str, Any]]:
        """Mark render as failed with error message."""
        return await self.update_render_status(
            render_id=render_id,
            workspace_id=workspace_id,
            status="failed",
            error_message=error_message,
        )

    # =========================================================================
    # CLEANUP
    # =========================================================================

    async def delete_expired_renders(
        self,
        workspace_id: Optional[UUID] = None,
    ) -> int:
        """Delete renders that have expired. Returns count of deleted."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            if workspace_id:
                result = await conn.execute(
                    """
                    DELETE FROM album_renders
                    WHERE workspace_id = $1 AND expires_at < NOW()
                    """,
                    workspace_id,
                )
            else:
                result = await conn.execute(
                    """
                    DELETE FROM album_renders
                    WHERE expires_at < NOW()
                    """,
                )

            # Parse count from "DELETE X"
            deleted_count = int(result.split()[-1])

            if deleted_count > 0:
                logger.info(
                    "Expired album renders deleted",
                    extra={
                        "count": deleted_count,
                        "workspace_id": str(workspace_id) if workspace_id else "all",
                    },
                )

            return deleted_count
