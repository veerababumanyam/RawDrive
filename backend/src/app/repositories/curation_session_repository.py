"""Repository for curation session operations.

This module provides the CurationSessionRepository class that handles all CRUD
operations for curation sessions, with proper workspace isolation for
multi-tenant security.

Feature: 023-enhanced-smart-curate
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class CurationSessionRepository:
    """Data access layer for curation session records.

    This repository handles all CRUD operations for curation sessions,
    ensuring proper workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        user_id: UUID,
        *,
        name: Optional[str] = None,
        preset_id: Optional[UUID] = None,
        target_count: Optional[int] = None,
        quality_threshold: float = 0.0,
        similarity_threshold: float = 0.85,
        include_expression_analysis: bool = True,
        include_scene_detection: bool = True,
        include_diversity: bool = True,
    ) -> dict[str, Any]:
        """Create a new curation session.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery being curated
            user_id: User who created the session
            name: Optional session name
            preset_id: Optional preset to apply
            target_count: Target number of photos to select
            quality_threshold: Minimum quality score (0-100)
            similarity_threshold: Similarity threshold for grouping (0-1)
            include_expression_analysis: Enable expression analysis
            include_scene_detection: Enable scene detection
            include_diversity: Enforce selection diversity

        Returns:
            Created session record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO curation_sessions (
                    workspace_id, gallery_id, user_id, name, preset_id,
                    target_count, quality_threshold, similarity_threshold,
                    include_expression_analysis, include_scene_detection,
                    include_diversity, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
                RETURNING *
                """,
                workspace_id,
                gallery_id,
                user_id,
                name,
                preset_id,
                target_count,
                quality_threshold,
                similarity_threshold,
                include_expression_analysis,
                include_scene_detection,
                include_diversity,
            )

            result = self._row_to_dict(row)

            logger.info(
                "Curation session created",
                extra={
                    "session_id": str(result["session_id"]),
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id),
                },
            )

            return result

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_by_id(
        self,
        workspace_id: UUID,
        session_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a curation session by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID to retrieve

        Returns:
            Session record as dict, or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM curation_sessions
                WHERE workspace_id = $1 AND session_id = $2
                """,
                workspace_id,
                session_id,
            )

            return self._row_to_dict(row) if row else None

    async def list_by_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        """List curation sessions for a gallery.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery ID to filter by
            status: Optional status filter
            limit: Max results to return
            offset: Pagination offset

        Returns:
            Tuple of (sessions list, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build query with optional status filter
            where_clause = "WHERE workspace_id = $1 AND gallery_id = $2"
            params: list[Any] = [workspace_id, gallery_id]

            if status:
                where_clause += " AND status = $3"
                params.append(status)

            # Get total count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) as total FROM curation_sessions {where_clause}",
                *params,
            )
            total = count_row["total"] if count_row else 0

            # Get paginated results
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM curation_sessions
                {where_clause}
                ORDER BY created_at DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}
                """,
                *params,
            )

            return [self._row_to_dict(row) for row in rows], total

    async def get_active_session(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get any active (non-completed, non-failed) session for a gallery.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery ID

        Returns:
            Active session if exists, None otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM curation_sessions
                WHERE workspace_id = $1
                  AND gallery_id = $2
                  AND status NOT IN ('completed', 'failed')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                workspace_id,
                gallery_id,
            )

            return self._row_to_dict(row) if row else None

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        workspace_id: UUID,
        session_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update a curation session.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID to update
            **updates: Fields to update

        Returns:
            Updated session record, or None if not found
        """
        if not updates:
            return await self.get_by_id(workspace_id, session_id)

        # Build SET clause dynamically
        allowed_fields = {
            "name",
            "target_count",
            "quality_threshold",
            "similarity_threshold",
            "include_expression_analysis",
            "include_scene_detection",
            "include_diversity",
            "status",
            "progress_percent",
            "progress_stage",
            "total_photos",
            "analyzed_count",
            "groups_count",
            "selected_count",
            "error_message",
            "started_at",
            "completed_at",
        }

        set_parts = []
        params: list[Any] = []
        param_idx = 1

        for field, value in updates.items():
            if field in allowed_fields:
                set_parts.append(f"{field} = ${param_idx}")
                params.append(value)
                param_idx += 1

        if not set_parts:
            return await self.get_by_id(workspace_id, session_id)

        # Add updated_at
        set_parts.append(f"updated_at = ${param_idx}")
        params.append(datetime.now(timezone.utc))
        param_idx += 1

        # Add WHERE params
        params.extend([workspace_id, session_id])

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE curation_sessions
                SET {", ".join(set_parts)}
                WHERE workspace_id = ${param_idx} AND session_id = ${param_idx + 1}
                RETURNING *
                """,
                *params,
            )

            if row:
                logger.info(
                    "Curation session updated",
                    extra={
                        "session_id": str(session_id),
                        "updates": list(updates.keys()),
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_status(
        self,
        workspace_id: UUID,
        session_id: UUID,
        status: str,
        *,
        error_message: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update session status with appropriate timestamps.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID to update
            status: New status
            error_message: Error message if status is 'failed'

        Returns:
            Updated session record
        """
        updates: dict[str, Any] = {"status": status}

        if status == "analyzing" and not error_message:
            updates["started_at"] = datetime.now(timezone.utc)
        elif status in ("completed", "failed"):
            updates["completed_at"] = datetime.now(timezone.utc)
            if error_message:
                updates["error_message"] = error_message

        return await self.update(workspace_id, session_id, **updates)

    async def update_progress(
        self,
        workspace_id: UUID,
        session_id: UUID,
        percent: int,
        stage: str,
        analyzed_count: Optional[int] = None,
    ) -> Optional[dict[str, Any]]:
        """Update session progress.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID to update
            percent: Progress percentage (0-100)
            stage: Current processing stage
            analyzed_count: Optional number of photos analyzed

        Returns:
            Updated session record
        """
        updates: dict[str, Any] = {
            "progress_percent": percent,
            "progress_stage": stage,
        }

        if analyzed_count is not None:
            updates["analyzed_count"] = analyzed_count

        return await self.update(workspace_id, session_id, **updates)

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        workspace_id: UUID,
        session_id: UUID,
    ) -> bool:
        """Delete a curation session.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID to delete

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM curation_sessions
                WHERE workspace_id = $1 AND session_id = $2
                """,
                workspace_id,
                session_id,
            )

            deleted = result.split()[-1] != "0"

            if deleted:
                logger.info(
                    "Curation session deleted",
                    extra={"session_id": str(session_id)},
                )

            return deleted

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if row is None:
            return {}

        return {
            "session_id": row["session_id"],
            "workspace_id": row["workspace_id"],
            "gallery_id": row["gallery_id"],
            "user_id": row["user_id"],
            "preset_id": row["preset_id"],
            "name": row["name"],
            "status": row["status"],
            "target_count": row["target_count"],
            "quality_threshold": float(row["quality_threshold"]),
            "similarity_threshold": float(row["similarity_threshold"]),
            "include_expression_analysis": row["include_expression_analysis"],
            "include_scene_detection": row["include_scene_detection"],
            "include_diversity": row["include_diversity"],
            "progress_percent": row["progress_percent"],
            "progress_stage": row["progress_stage"],
            "total_photos": row["total_photos"],
            "analyzed_count": row["analyzed_count"],
            "groups_count": row["groups_count"],
            "selected_count": row["selected_count"],
            "error_message": row["error_message"],
            "started_at": row["started_at"],
            "completed_at": row["completed_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }


# Module-level singleton
_repository: Optional[CurationSessionRepository] = None


def get_curation_session_repository() -> CurationSessionRepository:
    """Get or create the curation session repository singleton."""
    global _repository
    if _repository is None:
        _repository = CurationSessionRepository()
    return _repository
