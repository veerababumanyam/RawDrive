"""Repository for album data operations.

This module provides the AlbumRepository class that handles all CRUD
operations for albums, spreads, and elements with proper workspace isolation.

Feature: 026-album-proofing
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool, transaction

logger = logging.getLogger(__name__)


class AlbumRepository:
    """Data access layer for album records.

    All methods enforce workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # ALBUM CRUD
    # =========================================================================

    async def create_album(
        self,
        workspace_id: UUID,
        title: str,
        created_by_user_id: UUID,
        description: Optional[str] = None,
        gallery_id: Optional[UUID] = None,
        page_size: Optional[str] = None,
        lab_preset_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new album."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO albums (
                    workspace_id, title, description, gallery_id,
                    page_size, lab_preset_id, created_by_user_id, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
                RETURNING *
                """,
                workspace_id,
                title,
                description,
                gallery_id,
                page_size,
                lab_preset_id,
                created_by_user_id,
            )

            logger.info(
                "Album created",
                extra={
                    "album_id": str(row["album_id"]),
                    "workspace_id": str(workspace_id),
                },
            )

            return dict(row)

    async def get_album_by_id(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get album by ID with workspace isolation."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT a.*,
                       (SELECT COUNT(*) FROM album_spreads WHERE album_id = a.album_id) as spread_count
                FROM albums a
                WHERE a.album_id = $1 AND a.workspace_id = $2
                """,
                album_id,
                workspace_id,
            )

            return dict(row) if row else None

    async def list_albums(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
        gallery_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """List albums with pagination and filtering."""
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            # Build conditions
            conditions = ["a.workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status:
                conditions.append(f"a.status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if gallery_id:
                conditions.append(f"a.gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Get total count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM albums a WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            # Get paginated results
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT a.*,
                       (SELECT COUNT(*) FROM album_spreads WHERE album_id = a.album_id) as spread_count,
                       (SELECT COUNT(*) FROM album_comments
                        WHERE album_id = a.album_id AND status = 'open' AND deleted = FALSE) as unresolved_comments
                FROM albums a
                WHERE {where_clause}
                ORDER BY a.updated_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            return [dict(row) for row in rows], total

    async def update_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update album fields."""
        if not updates:
            return await self.get_album_by_id(album_id, workspace_id)

        pool = await get_postgres_pool()

        # Build SET clause dynamically
        set_parts = []
        params: list[Any] = []
        param_idx = 1

        allowed_fields = {
            "title", "description", "status", "page_size", "width_mm",
            "height_mm", "bleed_mm", "safe_margin_mm", "lab_preset_id",
            "cover_spread_id", "approved_by_email", "approved_at",
            "proof_sent_at", "version_number",
        }

        for field, value in updates.items():
            if field in allowed_fields:
                set_parts.append(f"{field} = ${param_idx}")
                params.append(value)
                param_idx += 1

        if not set_parts:
            return await self.get_album_by_id(album_id, workspace_id)

        params.extend([album_id, workspace_id])
        set_clause = ", ".join(set_parts)

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE albums
                SET {set_clause}, updated_at = NOW()
                WHERE album_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                RETURNING *
                """,
                *params,
            )

            if row:
                logger.info(
                    "Album updated",
                    extra={
                        "album_id": str(album_id),
                        "fields": list(updates.keys()),
                    },
                )

            return dict(row) if row else None

    async def delete_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete album and all related records (CASCADE)."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM albums
                WHERE album_id = $1 AND workspace_id = $2
                """,
                album_id,
                workspace_id,
            )

            deleted = result.split()[-1] != "0"

            if deleted:
                logger.info(
                    "Album deleted",
                    extra={
                        "album_id": str(album_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    # =========================================================================
    # SPREAD CRUD
    # =========================================================================

    async def create_spread(
        self,
        album_id: UUID,
        workspace_id: UUID,
        page_number: int,
        template_id: Optional[str] = None,
        background_color: Optional[str] = None,
        background_image_asset_id: Optional[UUID] = None,
        left_page_config: Optional[dict] = None,
        right_page_config: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Create a new album spread."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO album_spreads (
                    album_id, workspace_id, page_number, template_id,
                    background_color, background_image_asset_id,
                    left_page_config, right_page_config
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
                """,
                album_id,
                workspace_id,
                page_number,
                template_id,
                background_color,
                background_image_asset_id,
                left_page_config or {},
                right_page_config or {},
            )

            return dict(row)

    async def get_spread_by_id(
        self,
        spread_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get spread by ID with workspace isolation."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM album_spreads
                WHERE spread_id = $1 AND workspace_id = $2
                """,
                spread_id,
                workspace_id,
            )

            return dict(row) if row else None

    async def list_spreads_by_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """List all spreads for an album ordered by page number."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM album_spreads
                WHERE album_id = $1 AND workspace_id = $2
                ORDER BY page_number
                """,
                album_id,
                workspace_id,
            )

            return [dict(row) for row in rows]

    async def update_spread(
        self,
        spread_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update spread fields."""
        if not updates:
            return await self.get_spread_by_id(spread_id, workspace_id)

        pool = await get_postgres_pool()

        set_parts = []
        params: list[Any] = []
        param_idx = 1

        allowed_fields = {
            "template_id", "background_color", "background_image_asset_id",
            "left_page_config", "right_page_config",
        }

        for field, value in updates.items():
            if field in allowed_fields:
                set_parts.append(f"{field} = ${param_idx}")
                params.append(value)
                param_idx += 1

        if not set_parts:
            return await self.get_spread_by_id(spread_id, workspace_id)

        params.extend([spread_id, workspace_id])
        set_clause = ", ".join(set_parts)

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE album_spreads
                SET {set_clause}, updated_at = NOW()
                WHERE spread_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                RETURNING *
                """,
                *params,
            )

            return dict(row) if row else None

    async def delete_spread(
        self,
        spread_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete spread and all related elements (CASCADE)."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM album_spreads
                WHERE spread_id = $1 AND workspace_id = $2
                """,
                spread_id,
                workspace_id,
            )

            return result.split()[-1] != "0"

    async def reorder_spreads(
        self,
        album_id: UUID,
        workspace_id: UUID,
        spread_ids: list[UUID],
    ) -> bool:
        """Reorder spreads by updating page numbers."""
        pool = await get_postgres_pool()

        async with transaction() as conn:
            for page_number, spread_id in enumerate(spread_ids, start=1):
                await conn.execute(
                    """
                    UPDATE album_spreads
                    SET page_number = $1
                    WHERE spread_id = $2 AND album_id = $3 AND workspace_id = $4
                    """,
                    page_number,
                    spread_id,
                    album_id,
                    workspace_id,
                )

            return True

    # =========================================================================
    # ELEMENT CRUD
    # =========================================================================

    async def create_element(
        self,
        spread_id: UUID,
        workspace_id: UUID,
        element_type: str,
        position_x: float,
        position_y: float,
        width: float,
        height: float,
        z_index: int,
        asset_id: Optional[UUID] = None,
        text_content: Optional[str] = None,
        rotation: float = 0,
        opacity: float = 1.0,
        crop: Optional[dict] = None,
        styling: Optional[dict] = None,
        locked: bool = False,
    ) -> dict[str, Any]:
        """Create a new album element."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO album_elements (
                    spread_id, workspace_id, type, asset_id, text_content,
                    position_x, position_y, width, height, rotation,
                    opacity, z_index, crop, styling, locked
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING *
                """,
                spread_id,
                workspace_id,
                element_type,
                asset_id,
                text_content,
                position_x,
                position_y,
                width,
                height,
                rotation,
                opacity,
                z_index,
                crop,
                styling or {},
                locked,
            )

            return dict(row)

    async def list_elements_by_spread(
        self,
        spread_id: UUID,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """List all elements for a spread ordered by z_index."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM album_elements
                WHERE spread_id = $1 AND workspace_id = $2
                ORDER BY z_index
                """,
                spread_id,
                workspace_id,
            )

            return [dict(row) for row in rows]

    async def update_element(
        self,
        element_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update element fields."""
        if not updates:
            return None

        pool = await get_postgres_pool()

        set_parts = []
        params: list[Any] = []
        param_idx = 1

        allowed_fields = {
            "position_x", "position_y", "width", "height",
            "rotation", "opacity", "z_index", "text_content",
            "crop", "styling", "locked",
        }

        for field, value in updates.items():
            if field in allowed_fields:
                set_parts.append(f"{field} = ${param_idx}")
                params.append(value)
                param_idx += 1

        if not set_parts:
            return None

        params.extend([element_id, workspace_id])
        set_clause = ", ".join(set_parts)

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE album_elements
                SET {set_clause}, updated_at = NOW()
                WHERE element_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                RETURNING *
                """,
                *params,
            )

            return dict(row) if row else None

    async def delete_element(
        self,
        element_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete an element."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM album_elements
                WHERE element_id = $1 AND workspace_id = $2
                """,
                element_id,
                workspace_id,
            )

            return result.split()[-1] != "0"

    # =========================================================================
    # ALBUM WITH FULL DETAIL
    # =========================================================================

    async def get_album_detail(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get album with all spreads and elements."""
        album = await self.get_album_by_id(album_id, workspace_id)
        if not album:
            return None

        spreads = await self.list_spreads_by_album(album_id, workspace_id)

        # Load elements for each spread
        for spread in spreads:
            spread["elements"] = await self.list_elements_by_spread(
                spread["spread_id"],
                workspace_id,
            )

        album["spreads"] = spreads

        # Get comment summary
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            comment_stats = await conn.fetchrow(
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

            album["comment_summary"] = dict(comment_stats)

        return album
