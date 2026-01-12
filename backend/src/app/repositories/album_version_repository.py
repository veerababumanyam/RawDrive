"""Repository for album version data operations.

This module provides the AlbumVersionRepository class for managing
version snapshots and comparisons.

Feature: 026-album-proofing
"""
from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class AlbumVersionRepository:
    """Data access layer for album version records.

    All methods enforce workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # CREATE
    # =========================================================================

    async def create_version(
        self,
        album_id: UUID,
        workspace_id: UUID,
        version_number: int,
        snapshot_data: dict[str, Any],
        created_by_user_id: UUID,
        label: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new version snapshot."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO album_versions (
                    album_id, workspace_id, version_number,
                    snapshot_data, created_by_user_id, label
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                """,
                album_id,
                workspace_id,
                version_number,
                snapshot_data,
                created_by_user_id,
                label,
            )

            logger.info(
                "Album version created",
                extra={
                    "version_id": str(row["version_id"]),
                    "album_id": str(album_id),
                    "version_number": version_number,
                    "label": label,
                },
            )

            return dict(row)

    # =========================================================================
    # READ
    # =========================================================================

    async def get_version_by_id(
        self,
        version_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get version by ID with workspace isolation."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT v.*, u.first_name, u.last_name
                FROM album_versions v
                LEFT JOIN users u ON v.created_by_user_id = u.user_id
                WHERE v.version_id = $1 AND v.workspace_id = $2
                """,
                version_id,
                workspace_id,
            )

            if row:
                result = dict(row)
                result["created_by_name"] = f"{row['first_name'] or ''} {row['last_name'] or ''}".strip()
                return result

            return None

    async def get_version_by_number(
        self,
        album_id: UUID,
        workspace_id: UUID,
        version_number: int,
    ) -> Optional[dict[str, Any]]:
        """Get version by album and version number."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT v.*, u.first_name, u.last_name
                FROM album_versions v
                LEFT JOIN users u ON v.created_by_user_id = u.user_id
                WHERE v.album_id = $1 AND v.workspace_id = $2 AND v.version_number = $3
                """,
                album_id,
                workspace_id,
                version_number,
            )

            if row:
                result = dict(row)
                result["created_by_name"] = f"{row['first_name'] or ''} {row['last_name'] or ''}".strip()
                return result

            return None

    async def list_versions_by_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """List all versions for an album ordered by version number."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    v.version_id,
                    v.album_id,
                    v.workspace_id,
                    v.version_number,
                    v.label,
                    v.created_by_user_id,
                    v.created_at,
                    u.first_name,
                    u.last_name,
                    (v.snapshot_data->'metadata'->>'total_spreads')::int as spread_count
                FROM album_versions v
                LEFT JOIN users u ON v.created_by_user_id = u.user_id
                WHERE v.album_id = $1 AND v.workspace_id = $2
                ORDER BY v.version_number DESC
                """,
                album_id,
                workspace_id,
            )

            return [
                {
                    **dict(row),
                    "created_by_name": f"{row['first_name'] or ''} {row['last_name'] or ''}".strip(),
                }
                for row in rows
            ]

    async def get_latest_version_number(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Get the latest version number for an album."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            version_number = await conn.fetchval(
                """
                SELECT COALESCE(MAX(version_number), 0)
                FROM album_versions
                WHERE album_id = $1 AND workspace_id = $2
                """,
                album_id,
                workspace_id,
            )

            return version_number

    # =========================================================================
    # VERSION COMPARISON
    # =========================================================================

    async def get_versions_for_comparison(
        self,
        album_id: UUID,
        workspace_id: UUID,
        version_id_a: UUID,
        version_id_b: UUID,
    ) -> tuple[Optional[dict], Optional[dict]]:
        """Get two versions for comparison."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT v.*, u.first_name, u.last_name
                FROM album_versions v
                LEFT JOIN users u ON v.created_by_user_id = u.user_id
                WHERE v.album_id = $1 AND v.workspace_id = $2
                  AND v.version_id IN ($3, $4)
                """,
                album_id,
                workspace_id,
                version_id_a,
                version_id_b,
            )

            version_a = None
            version_b = None

            for row in rows:
                result = dict(row)
                result["created_by_name"] = f"{row['first_name'] or ''} {row['last_name'] or ''}".strip()

                if row["version_id"] == version_id_a:
                    version_a = result
                elif row["version_id"] == version_id_b:
                    version_b = result

            return version_a, version_b

    # =========================================================================
    # UTILITY
    # =========================================================================

    async def count_versions(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Count total versions for an album."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM album_versions
                WHERE album_id = $1 AND workspace_id = $2
                """,
                album_id,
                workspace_id,
            )

            return count
