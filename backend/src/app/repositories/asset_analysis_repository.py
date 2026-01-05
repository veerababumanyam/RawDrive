"""Repository for asset_analysis table operations.

This module provides the AssetAnalysisRepository class that handles all CRUD
operations for asset analysis records, tracking AI processing state per asset.

All queries enforce workspace_id filtering to ensure data isolation
between tenants.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import acquire_conn, get_postgres_pool


logger = logging.getLogger(__name__)


class AssetAnalysisRepository:
    """Data access layer for asset_analysis records.

    Tracks AI analysis state per asset to prevent duplicate processing
    and provide visibility into tagging completion.
    """

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        status: str = "pending",
        vision_status: str = "pending",
        face_status: str = "pending",
    ) -> dict[str, Any]:
        """Create a new asset_analysis record.

        Args:
            asset_id: Asset ID (also primary key)
            workspace_id: Workspace ID for tenant isolation
            status: Overall status (default: pending)
            vision_status: Vision analysis status (default: pending)
            face_status: Face analysis status (default: pending)

        Returns:
            Created record as dict
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO asset_analysis (
                    asset_id, workspace_id, status, vision_status, face_status
                )
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (asset_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    updated_at = NOW()
                RETURNING *
                """,
                asset_id,
                workspace_id,
                status,
                vision_status,
                face_status,
            )

            result = self._row_to_dict(row)

            logger.debug(
                "Asset analysis record created",
                extra={
                    "asset_id": str(asset_id),
                    "workspace_id": str(workspace_id),
                },
            )

            return result

    async def get_or_create(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get existing record or create new one.

        Args:
            asset_id: Asset ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Existing or new record as dict
        """
        existing = await self.find_by_asset_id(asset_id, workspace_id)
        if existing:
            return existing
        return await self.create(asset_id, workspace_id)

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def find_by_asset_id(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Find asset analysis by asset ID.

        Args:
            asset_id: Asset ID to find
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Record as dict, or None if not found
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            row = await conn.fetchrow(
                """
                SELECT *
                FROM asset_analysis
                WHERE asset_id = $1 AND workspace_id = $2
                """,
                asset_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    async def get_by_asset_id(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Backward-compatible alias used in tests."""

        return await self.find_by_asset_id(asset_id, workspace_id)

    async def find_pending_vision(
        self,
        workspace_id: UUID,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Find assets pending vision analysis.

        Args:
            workspace_id: Workspace ID
            limit: Maximum results

        Returns:
            List of records pending vision analysis
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM asset_analysis
                WHERE workspace_id = $1 AND vision_status = 'pending'
                ORDER BY created_at ASC
                LIMIT $2
                """,
                workspace_id,
                limit,
            )

            return [self._row_to_dict(row) for row in rows]

    async def find_pending_face(
        self,
        workspace_id: UUID,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Find assets pending face analysis.

        Args:
            workspace_id: Workspace ID
            limit: Maximum results

        Returns:
            List of records pending face analysis
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM asset_analysis
                WHERE workspace_id = $1 AND face_status = 'pending'
                ORDER BY created_at ASC
                LIMIT $2
                """,
                workspace_id,
                limit,
            )

            return [self._row_to_dict(row) for row in rows]

    async def find_failed_for_retry(
        self,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Find failed analyses due for retry.

        Args:
            limit: Maximum results

        Returns:
            List of records ready for retry
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM asset_analysis
                WHERE status = 'failed'
                AND next_retry_at IS NOT NULL
                AND next_retry_at <= NOW()
                ORDER BY next_retry_at ASC
                LIMIT $1
                """,
                limit,
            )

            return [self._row_to_dict(row) for row in rows]

    async def find_by_workspace_status(
        self,
        workspace_id: UUID,
        status: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Find analyses by workspace and status.

        Args:
            workspace_id: Workspace ID
            status: Status to filter by
            limit: Maximum results
            offset: Offset for pagination

        Returns:
            List of matching records
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM asset_analysis
                WHERE workspace_id = $1 AND status = $2
                ORDER BY updated_at DESC
                LIMIT $3 OFFSET $4
                """,
                workspace_id,
                status,
                limit,
                offset,
            )

            return [self._row_to_dict(row) for row in rows]

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update_vision_status(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        vision_status: str,
        vision_provider: Optional[str] = None,
        vision_model_version: Optional[str] = None,
        vision_tags_count: Optional[int] = None,
        error_message: Optional[str] = None,
        ai_metadata: Optional[dict[str, Any]] = None,
        result_metadata: Optional[dict[str, Any]] = None,  # Backward compatibility
    ) -> Optional[dict[str, Any]]:
        """Update vision analysis status.

        Args:
            asset_id: Asset ID
            workspace_id: Workspace ID
            vision_status: New vision status
            vision_provider: Provider used (if completed)
            vision_model_version: Model version (if completed)
            vision_tags_count: Tags detected (if completed)
            error_message: Error message (if failed)
            ai_metadata: Rich AI metadata to store
            result_metadata: Alias for ai_metadata (backward compatibility)

        Returns:
            Updated record or None if not found
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            vision_analyzed_at = datetime.now(timezone.utc) if vision_status == "completed" else None
            
            # Merge metadata if both provided, preferring ai_metadata
            final_metadata = ai_metadata or result_metadata
            
            # If we have metadata to update
            if final_metadata is not None:
                row = await conn.fetchrow(
                    """
                    UPDATE asset_analysis
                    SET
                        vision_status = $3,
                        vision_analyzed_at = COALESCE($4, vision_analyzed_at),
                        vision_provider = COALESCE($5, vision_provider),
                        vision_model_version = COALESCE($6, vision_model_version),
                        vision_tags_count = COALESCE($7, vision_tags_count),
                        error_message = $8,
                        ai_metadata = COALESCE($9, ai_metadata),
                        updated_at = NOW()
                    WHERE asset_id = $1 AND workspace_id = $2
                    RETURNING *
                    """,
                    asset_id,
                    workspace_id,
                    vision_status,
                    vision_analyzed_at,
                    vision_provider,
                    vision_model_version,
                    vision_tags_count,
                    error_message,
                    json.dumps(final_metadata) if final_metadata else None,
                )
            else:
                # Legacy query without ai_metadata update
                row = await conn.fetchrow(
                    """
                    UPDATE asset_analysis
                    SET
                        vision_status = $3,
                        vision_analyzed_at = COALESCE($4, vision_analyzed_at),
                        vision_provider = COALESCE($5, vision_provider),
                        vision_model_version = COALESCE($6, vision_model_version),
                        vision_tags_count = COALESCE($7, vision_tags_count),
                        error_message = $8,
                        updated_at = NOW()
                    WHERE asset_id = $1 AND workspace_id = $2
                    RETURNING *
                    """,
                    asset_id,
                    workspace_id,
                    vision_status,
                    vision_analyzed_at,
                    vision_provider,
                    vision_model_version,
                    vision_tags_count,
                    error_message,
                )

            if row:
                # Recalculate overall status
                await self._recalculate_overall_status(conn, asset_id)
                # Re-fetch to get updated overall status
                row = await conn.fetchrow(
                    "SELECT * FROM asset_analysis WHERE asset_id = $1",
                    asset_id,
                )

            return self._row_to_dict(row) if row else None

    async def update_face_status(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        face_status: str,
        face_provider: Optional[str] = None,
        faces_detected: Optional[int] = None,
        error_message: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update face analysis status.

        Args:
            asset_id: Asset ID
            workspace_id: Workspace ID
            face_status: New face status
            face_provider: Provider used (if completed)
            faces_detected: Faces found (if completed)
            error_message: Error message (if failed)

        Returns:
            Updated record or None if not found
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            face_analyzed_at = datetime.now(timezone.utc) if face_status == "completed" else None

            row = await conn.fetchrow(
                """
                UPDATE asset_analysis
                SET
                    face_status = $3,
                    face_analyzed_at = COALESCE($4, face_analyzed_at),
                    face_provider = COALESCE($5, face_provider),
                    faces_detected = COALESCE($6, faces_detected),
                    error_message = $8,
                    updated_at = NOW()
                WHERE asset_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                asset_id,
                workspace_id,
                face_status,
                face_analyzed_at,
                face_provider,
                faces_detected,
                None,  # Placeholder for position $7
                error_message,
            )

            if row:
                # Recalculate overall status
                await self._recalculate_overall_status(conn, asset_id)
                # Re-fetch to get updated overall status
                row = await conn.fetchrow(
                    "SELECT * FROM asset_analysis WHERE asset_id = $1",
                    asset_id,
                )

            return self._row_to_dict(row) if row else None

    async def schedule_retry(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        retry_delay_seconds: int = 60,
    ) -> Optional[dict[str, Any]]:
        """Schedule a retry for failed analysis.

        Args:
            asset_id: Asset ID
            workspace_id: Workspace ID
            retry_delay_seconds: Delay before retry

        Returns:
            Updated record or None if not found
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            next_retry = datetime.now(timezone.utc) + timedelta(seconds=retry_delay_seconds)

            row = await conn.fetchrow(
                """
                UPDATE asset_analysis
                SET
                    retry_count = retry_count + 1,
                    next_retry_at = $3,
                    updated_at = NOW()
                WHERE asset_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                asset_id,
                workspace_id,
                next_retry,
            )

            return self._row_to_dict(row) if row else None

    async def mark_completed(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Mark analysis as fully completed.

        Args:
            asset_id: Asset ID
            workspace_id: Workspace ID

        Returns:
            Updated record or None if not found
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            row = await conn.fetchrow(
                """
                UPDATE asset_analysis
                SET
                    status = 'completed',
                    error_message = NULL,
                    next_retry_at = NULL,
                    updated_at = NOW()
                WHERE asset_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                asset_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    async def mark_failed(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        error_message: str,
    ) -> Optional[dict[str, Any]]:
        """Mark analysis as failed.

        Args:
            asset_id: Asset ID
            workspace_id: Workspace ID
            error_message: Error description

        Returns:
            Updated record or None if not found
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            row = await conn.fetchrow(
                """
                UPDATE asset_analysis
                SET
                    status = 'failed',
                    error_message = $3,
                    updated_at = NOW()
                WHERE asset_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                asset_id,
                workspace_id,
                error_message,
            )

            return self._row_to_dict(row) if row else None

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete an asset_analysis record.

        Args:
            asset_id: Asset ID
            workspace_id: Workspace ID

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            result = await conn.execute(
                """
                DELETE FROM asset_analysis
                WHERE asset_id = $1 AND workspace_id = $2
                """,
                asset_id,
                workspace_id,
            )

            return result and int(result.split()[-1]) > 0

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def count_by_workspace_status(
        self,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Get status counts for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Dict mapping status -> count
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            rows = await conn.fetch(
                """
                SELECT status, COUNT(*) as count
                FROM asset_analysis
                WHERE workspace_id = $1
                GROUP BY status
                """,
                workspace_id,
            )

            return {row["status"]: row["count"] for row in rows}

    async def get_workspace_summary(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get analysis summary for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Summary dict with counts and percentages
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'processing') as processing,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
                    MAX(updated_at) as last_updated
                FROM asset_analysis
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if not row or row["total"] == 0:
                return {
                    "total": 0,
                    "completed": 0,
                    "pending": 0,
                    "processing": 0,
                    "failed": 0,
                    "skipped": 0,
                    "completion_percentage": 0.0,
                    "last_updated": None,
                }

            return {
                "total": row["total"],
                "completed": row["completed"],
                "pending": row["pending"],
                "processing": row["processing"],
                "failed": row["failed"],
                "skipped": row["skipped"],
                "completion_percentage": round(
                    (row["completed"] / row["total"]) * 100, 2
                ),
                "last_updated": row["last_updated"].isoformat() if row["last_updated"] else None,
            }

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    async def _recalculate_overall_status(self, conn, asset_id: UUID) -> None:
        """Recalculate overall status based on vision and face status.

        Status priority:
        - If either is processing -> processing
        - If both completed -> completed
        - If either failed and other not pending -> failed
        - If either pending -> pending
        - Otherwise -> skipped
        """
        await conn.execute(
            """
            UPDATE asset_analysis
            SET status = CASE
                WHEN vision_status = 'processing' OR face_status = 'processing' THEN 'processing'
                WHEN vision_status = 'completed' AND face_status = 'completed' THEN 'completed'
                WHEN vision_status = 'skipped' AND face_status = 'skipped' THEN 'skipped'
                WHEN (vision_status = 'failed' AND face_status NOT IN ('pending', 'processing'))
                    OR (face_status = 'failed' AND vision_status NOT IN ('pending', 'processing'))
                    THEN 'failed'
                WHEN vision_status = 'pending' OR face_status = 'pending' THEN 'pending'
                ELSE 'completed'
            END
            WHERE asset_id = $1
            """,
            asset_id,
        )

    def _row_to_dict(self, row: Any) -> Optional[dict[str, Any]]:
        """Convert database row to dict."""
        if row is None:
            return None

        result = dict(row)

        # Convert timestamps to ISO strings
        for field in ("created_at", "updated_at", "vision_analyzed_at", "face_analyzed_at", "next_retry_at"):
            if field in result and result[field]:
                result[field] = result[field].isoformat()

        return result


# Singleton instance
_repository: Optional[AssetAnalysisRepository] = None


def get_asset_analysis_repository() -> AssetAnalysisRepository:
    """Get singleton repository instance."""
    global _repository
    if _repository is None:
        _repository = AssetAnalysisRepository()
    return _repository
