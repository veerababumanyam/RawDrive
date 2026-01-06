"""Repository for asset cleanup operations.

This module provides the CleanupRepository class that handles CRUD operations
for cleanup recommendations, jobs, and settings with proper multi-tenant isolation.

Feature: Automatic Asset Cleanup
Requirements:
- Identify and flag unused/duplicate photos
- Track cleanup recommendations with confidence scores
- Integrate with billing tier storage limits
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class CleanupRepository:
    """Data access layer for asset cleanup operations.

    All methods enforce workspace_id filtering for multi-tenant security.
    """

    # =========================================================================
    # CLEANUP RECOMMENDATIONS CRUD
    # =========================================================================

    async def create_recommendation(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        recommendation_type: str,
        confidence: Decimal,
        potential_savings_bytes: int,
        related_asset_id: Optional[UUID] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new cleanup recommendation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            asset_id: Asset being recommended for cleanup
            recommendation_type: Type (duplicate, similar_face, unused, etc.)
            confidence: Confidence score (0.0-1.0)
            potential_savings_bytes: Bytes that would be freed
            related_asset_id: Reference to related asset (for duplicates)
            details: Additional recommendation details

        Returns:
            Created recommendation record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO cleanup_recommendations (
                    workspace_id, asset_id, recommendation_type, confidence,
                    potential_savings_bytes, related_asset_id, details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (asset_id, recommendation_type)
                DO UPDATE SET
                    confidence = EXCLUDED.confidence,
                    potential_savings_bytes = EXCLUDED.potential_savings_bytes,
                    related_asset_id = EXCLUDED.related_asset_id,
                    details = EXCLUDED.details,
                    status = CASE
                        WHEN cleanup_recommendations.status = 'rejected' THEN 'rejected'
                        ELSE 'pending'
                    END,
                    updated_at = NOW()
                RETURNING *
                """,
                workspace_id,
                asset_id,
                recommendation_type,
                confidence,
                potential_savings_bytes,
                related_asset_id,
                details or {},
            )

            logger.info(
                "Cleanup recommendation created/updated",
                extra={
                    "recommendation_id": str(row["id"]),
                    "workspace_id": str(workspace_id),
                    "asset_id": str(asset_id),
                    "type": recommendation_type,
                    "confidence": float(confidence),
                },
            )

            return self._row_to_dict(row)

    async def get_recommendations(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
        recommendation_type: Optional[str] = None,
        min_confidence: Optional[Decimal] = None,
        sort_by: str = "confidence",
        sort_order: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get cleanup recommendations for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            status: Filter by status (pending, approved, rejected, etc.)
            recommendation_type: Filter by type
            min_confidence: Minimum confidence threshold
            sort_by: Sort field (confidence, potential_savings_bytes, created_at)
            sort_order: Sort order (asc, desc)
            limit: Maximum results to return
            offset: Pagination offset

        Returns:
            List of recommendation records with asset details
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build WHERE clause
            conditions = ["cr.workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status:
                conditions.append(f"cr.status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if recommendation_type:
                conditions.append(f"cr.recommendation_type = ${param_idx}")
                params.append(recommendation_type)
                param_idx += 1

            if min_confidence is not None:
                conditions.append(f"cr.confidence >= ${param_idx}")
                params.append(min_confidence)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Validate sort field
            valid_sort_fields = {
                "confidence": "cr.confidence",
                "potential_savings_bytes": "cr.potential_savings_bytes",
                "created_at": "cr.created_at",
            }
            sort_field = valid_sort_fields.get(sort_by, "cr.confidence")
            order = "DESC" if sort_order.lower() == "desc" else "ASC"

            params.extend([limit, offset])

            rows = await conn.fetch(
                f"""
                SELECT
                    cr.*,
                    a.original_object_key,
                    a.mime_type,
                    a.original_bytes,
                    a.sha256,
                    a.created_at as asset_created_at,
                    ra.original_object_key as related_asset_object_key
                FROM cleanup_recommendations cr
                JOIN assets a ON cr.asset_id = a.asset_id
                LEFT JOIN assets ra ON cr.related_asset_id = ra.asset_id
                WHERE {where_clause}
                ORDER BY {sort_field} {order}
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            return [self._row_to_dict(row) for row in rows]

    async def get_recommendation_by_id(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single recommendation by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            recommendation_id: Recommendation ID

        Returns:
            Recommendation record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT cr.*, a.original_object_key, a.mime_type, a.original_bytes
                FROM cleanup_recommendations cr
                JOIN assets a ON cr.asset_id = a.asset_id
                WHERE cr.workspace_id = $1 AND cr.id = $2
                """,
                workspace_id,
                recommendation_id,
            )

            return self._row_to_dict(row) if row else None

    async def update_recommendation_status(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
        status: str,
        reviewed_by_user_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Update recommendation status (approve, reject, etc.).

        Args:
            workspace_id: Workspace ID for tenant isolation
            recommendation_id: Recommendation ID
            status: New status
            reviewed_by_user_id: User who reviewed

        Returns:
            Updated recommendation or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE cleanup_recommendations
                SET status = $3,
                    reviewed_by_user_id = $4,
                    reviewed_at = CASE WHEN $4 IS NOT NULL THEN NOW() ELSE NULL END
                WHERE workspace_id = $1 AND id = $2
                RETURNING *
                """,
                workspace_id,
                recommendation_id,
                status,
                reviewed_by_user_id,
            )

            if row:
                logger.info(
                    "Cleanup recommendation status updated",
                    extra={
                        "recommendation_id": str(recommendation_id),
                        "workspace_id": str(workspace_id),
                        "status": status,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def bulk_update_status(
        self,
        workspace_id: UUID,
        recommendation_ids: list[UUID],
        status: str,
        reviewed_by_user_id: Optional[UUID] = None,
    ) -> int:
        """Bulk update recommendation statuses.

        Args:
            workspace_id: Workspace ID for tenant isolation
            recommendation_ids: List of recommendation IDs
            status: New status
            reviewed_by_user_id: User who reviewed

        Returns:
            Number of updated records
        """
        if not recommendation_ids:
            return 0

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE cleanup_recommendations
                SET status = $3,
                    reviewed_by_user_id = $4,
                    reviewed_at = CASE WHEN $4 IS NOT NULL THEN NOW() ELSE NULL END
                WHERE workspace_id = $1 AND id = ANY($2)
                """,
                workspace_id,
                recommendation_ids,
                status,
                reviewed_by_user_id,
            )

            count = int(result.split()[-1])
            logger.info(
                "Bulk cleanup recommendation status update",
                extra={
                    "workspace_id": str(workspace_id),
                    "count": count,
                    "status": status,
                },
            )

            return count

    async def get_summary(self, workspace_id: UUID) -> dict[str, Any]:
        """Get cleanup summary for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Summary statistics
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM get_cleanup_summary($1)",
                workspace_id,
            )

            if row:
                return {
                    "total_recommendations": row["total_recommendations"],
                    "pending_recommendations": row["pending_recommendations"],
                    "potential_savings_bytes": row["potential_savings_bytes"],
                    "duplicates_count": row["duplicates_count"],
                    "similar_faces_count": row["similar_faces_count"],
                    "unused_count": row["unused_count"],
                }

            return {
                "total_recommendations": 0,
                "pending_recommendations": 0,
                "potential_savings_bytes": 0,
                "duplicates_count": 0,
                "similar_faces_count": 0,
                "unused_count": 0,
            }

    async def delete_recommendation(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
    ) -> bool:
        """Delete a recommendation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            recommendation_id: Recommendation ID

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM cleanup_recommendations
                WHERE workspace_id = $1 AND id = $2
                """,
                workspace_id,
                recommendation_id,
            )

            return result == "DELETE 1"

    # =========================================================================
    # CLEANUP JOBS CRUD
    # =========================================================================

    async def create_job(
        self,
        workspace_id: UUID,
        job_type: str = "full_scan",
        initiated_by_user_id: Optional[UUID] = None,
        scheduled_at: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Create a new cleanup analysis job.

        Args:
            workspace_id: Workspace ID for tenant isolation
            job_type: Type of analysis (full_scan, incremental, etc.)
            initiated_by_user_id: User who initiated (NULL for scheduled)
            scheduled_at: When job should run

        Returns:
            Created job record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            job_id = uuid4()
            row = await conn.fetchrow(
                """
                INSERT INTO cleanup_jobs (
                    id, workspace_id, job_type, initiated_by_user_id, scheduled_at
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *
                """,
                job_id,
                workspace_id,
                job_type,
                initiated_by_user_id,
                scheduled_at,
            )

            logger.info(
                "Cleanup job created",
                extra={
                    "job_id": str(job_id),
                    "workspace_id": str(workspace_id),
                    "job_type": job_type,
                },
            )

            return self._row_to_dict(row)

    async def get_job(
        self,
        workspace_id: UUID,
        job_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a cleanup job by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            job_id: Job ID

        Returns:
            Job record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM cleanup_jobs
                WHERE workspace_id = $1 AND id = $2
                """,
                workspace_id,
                job_id,
            )

            return self._row_to_dict(row) if row else None

    async def get_jobs(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get cleanup jobs for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            status: Filter by status
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of job records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if status:
                rows = await conn.fetch(
                    """
                    SELECT * FROM cleanup_jobs
                    WHERE workspace_id = $1 AND status = $2
                    ORDER BY created_at DESC
                    LIMIT $3 OFFSET $4
                    """,
                    workspace_id,
                    status,
                    limit,
                    offset,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM cleanup_jobs
                    WHERE workspace_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    """,
                    workspace_id,
                    limit,
                    offset,
                )

            return [self._row_to_dict(row) for row in rows]

    async def update_job_status(
        self,
        job_id: UUID,
        status: str,
        error_message: Optional[str] = None,
        error_details: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        """Update job status.

        Args:
            job_id: Job ID (no workspace_id since this is called from worker)
            status: New status
            error_message: Error message if failed
            error_details: Error details if failed

        Returns:
            Updated job record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Set timestamps based on status
            started_at_clause = "started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN NOW() ELSE started_at END"
            completed_at_clause = "completed_at = CASE WHEN $2 IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE completed_at END"

            row = await conn.fetchrow(
                f"""
                UPDATE cleanup_jobs
                SET status = $2,
                    error_message = $3,
                    error_details = $4,
                    {started_at_clause},
                    {completed_at_clause}
                WHERE id = $1
                RETURNING *
                """,
                job_id,
                status,
                error_message,
                error_details,
            )

            return self._row_to_dict(row) if row else None

    async def update_job_progress(
        self,
        job_id: UUID,
        processed_assets: int,
        recommendations_created: int,
        potential_savings_bytes: int,
    ) -> None:
        """Update job progress counters.

        Args:
            job_id: Job ID
            processed_assets: Number of assets processed
            recommendations_created: Number of recommendations created
            potential_savings_bytes: Total potential savings found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE cleanup_jobs
                SET processed_assets = $2,
                    recommendations_created = $3,
                    potential_savings_bytes = $4
                WHERE id = $1
                """,
                job_id,
                processed_assets,
                recommendations_created,
                potential_savings_bytes,
            )

    async def set_job_total_assets(
        self,
        job_id: UUID,
        total_assets: int,
    ) -> None:
        """Set total assets count for job progress tracking.

        Args:
            job_id: Job ID
            total_assets: Total assets to process
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE cleanup_jobs
                SET total_assets = $2
                WHERE id = $1
                """,
                job_id,
                total_assets,
            )

    async def set_job_celery_task_id(
        self,
        job_id: UUID,
        celery_task_id: str,
    ) -> None:
        """Set Celery task ID for job management.

        Args:
            job_id: Job ID
            celery_task_id: Celery task ID
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE cleanup_jobs
                SET celery_task_id = $2
                WHERE id = $1
                """,
                job_id,
                celery_task_id,
            )

    async def get_running_job(
        self,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get currently running cleanup job for workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Running job or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM cleanup_jobs
                WHERE workspace_id = $1 AND status IN ('pending', 'running')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    # =========================================================================
    # CLEANUP SETTINGS CRUD
    # =========================================================================

    async def get_settings(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get cleanup settings for workspace, creating defaults if needed.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Settings record (creates defaults if not exist)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO cleanup_settings (workspace_id)
                VALUES ($1)
                ON CONFLICT (workspace_id) DO NOTHING
                RETURNING *
                """,
                workspace_id,
            )

            if row is None:
                row = await conn.fetchrow(
                    "SELECT * FROM cleanup_settings WHERE workspace_id = $1",
                    workspace_id,
                )

            return self._row_to_dict(row) if row else {}

    async def update_settings(
        self,
        workspace_id: UUID,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Update cleanup settings.

        Args:
            workspace_id: Workspace ID for tenant isolation
            **kwargs: Settings to update

        Returns:
            Updated settings record
        """
        # Whitelist of allowed settings to update
        allowed_fields = {
            "auto_analysis_enabled",
            "auto_analysis_interval_days",
            "auto_approve_threshold",
            "duplicate_confidence_threshold",
            "face_similarity_threshold",
            "unused_days_threshold",
            "include_gallery_assets",
            "storage_alert_threshold_percent",
            "email_notifications_enabled",
            "notify_on_high_confidence",
            "notify_on_storage_critical",
        }

        # Filter to allowed fields
        updates = {k: v for k, v in kwargs.items() if k in allowed_fields}

        if not updates:
            return await self.get_settings(workspace_id)

        # Build SET clause
        set_parts = []
        params: list[Any] = [workspace_id]
        for i, (key, value) in enumerate(updates.items(), start=2):
            set_parts.append(f"{key} = ${i}")
            params.append(value)

        set_clause = ", ".join(set_parts)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Ensure settings exist
            await conn.execute(
                """
                INSERT INTO cleanup_settings (workspace_id)
                VALUES ($1)
                ON CONFLICT (workspace_id) DO NOTHING
                """,
                workspace_id,
            )

            row = await conn.fetchrow(
                f"""
                UPDATE cleanup_settings
                SET {set_clause}
                WHERE workspace_id = $1
                RETURNING *
                """,
                *params,
            )

            logger.info(
                "Cleanup settings updated",
                extra={
                    "workspace_id": str(workspace_id),
                    "updated_fields": list(updates.keys()),
                },
            )

            return self._row_to_dict(row) if row else {}

    # =========================================================================
    # ASSET QUERY HELPERS
    # =========================================================================

    async def find_duplicate_assets(
        self,
        workspace_id: UUID,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        """Find assets with duplicate sha256 hashes.

        Args:
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum results

        Returns:
            List of duplicate asset groups
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                WITH duplicate_hashes AS (
                    SELECT sha256, COUNT(*) as count
                    FROM assets
                    WHERE workspace_id = $1 AND status = 'available'
                    GROUP BY sha256
                    HAVING COUNT(*) > 1
                )
                SELECT
                    a.asset_id,
                    a.sha256,
                    a.original_object_key,
                    a.original_bytes,
                    a.created_at,
                    a.view_count,
                    dh.count as duplicate_count
                FROM assets a
                JOIN duplicate_hashes dh ON a.sha256 = dh.sha256
                WHERE a.workspace_id = $1 AND a.status = 'available'
                ORDER BY a.sha256, a.created_at
                LIMIT $2
                """,
                workspace_id,
                limit,
            )

            return [self._row_to_dict(row) for row in rows]

    async def find_unused_assets(
        self,
        workspace_id: UUID,
        days_threshold: int,
        include_gallery_assets: bool = False,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        """Find assets with no views/downloads within threshold.

        Args:
            workspace_id: Workspace ID for tenant isolation
            days_threshold: Days since upload with no activity
            include_gallery_assets: Include assets in galleries
            limit: Maximum results

        Returns:
            List of unused assets
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            gallery_filter = ""
            if not include_gallery_assets:
                gallery_filter = """
                    AND NOT EXISTS (
                        SELECT 1 FROM gallery_assets ga
                        WHERE ga.asset_id = a.asset_id
                    )
                """

            rows = await conn.fetch(
                f"""
                SELECT
                    a.asset_id,
                    a.original_object_key,
                    a.original_bytes,
                    a.created_at,
                    a.view_count,
                    a.last_viewed_at,
                    a.download_count,
                    EXTRACT(DAY FROM NOW() - a.created_at) as days_since_upload
                FROM assets a
                WHERE a.workspace_id = $1
                  AND a.status = 'available'
                  AND a.view_count = 0
                  AND a.download_count = 0
                  AND a.created_at < NOW() - INTERVAL '{days_threshold} days'
                  {gallery_filter}
                ORDER BY a.original_bytes DESC
                LIMIT $2
                """,
                workspace_id,
                limit,
            )

            return [self._row_to_dict(row) for row in rows]

    async def find_similar_face_assets(
        self,
        workspace_id: UUID,
        similarity_threshold: Decimal,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        """Find assets with very similar face embeddings.

        Args:
            workspace_id: Workspace ID for tenant isolation
            similarity_threshold: Minimum similarity (0.0-1.0)
            limit: Maximum results

        Returns:
            List of similar face pairs
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Use cosine distance for face similarity
            # 1 - cosine_distance = similarity score
            distance_threshold = 1 - float(similarity_threshold)

            rows = await conn.fetch(
                """
                WITH face_pairs AS (
                    SELECT
                        f1.photo_id as asset_id_1,
                        f2.photo_id as asset_id_2,
                        f1.id as face_id_1,
                        f2.id as face_id_2,
                        1 - (f1.embedding <=> f2.embedding) as similarity,
                        f1.face_group_id
                    FROM faces f1
                    JOIN faces f2 ON f1.workspace_id = f2.workspace_id
                        AND f1.id < f2.id
                        AND f1.photo_id != f2.photo_id
                        AND f1.embedding IS NOT NULL
                        AND f2.embedding IS NOT NULL
                    WHERE f1.workspace_id = $1
                      AND (f1.embedding <=> f2.embedding) < $2
                )
                SELECT
                    fp.*,
                    a1.original_object_key as asset_1_key,
                    a1.original_bytes as asset_1_bytes,
                    a1.created_at as asset_1_created_at,
                    a2.original_object_key as asset_2_key,
                    a2.original_bytes as asset_2_bytes,
                    a2.created_at as asset_2_created_at
                FROM face_pairs fp
                JOIN assets a1 ON fp.asset_id_1 = a1.asset_id AND a1.status = 'available'
                JOIN assets a2 ON fp.asset_id_2 = a2.asset_id AND a2.status = 'available'
                ORDER BY fp.similarity DESC
                LIMIT $3
                """,
                workspace_id,
                distance_threshold,
                limit,
            )

            return [self._row_to_dict(row) for row in rows]

    async def get_storage_usage(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get storage usage and limit for workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Storage usage statistics with plan limit
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COALESCE(wsc.storage_used_bytes, 0) as storage_used_bytes,
                    COALESCE(wsc.asset_count, 0) as asset_count,
                    sp.storage_bytes as storage_limit_bytes,
                    sp.code as plan_code,
                    sp.name as plan_name,
                    CASE
                        WHEN sp.storage_bytes > 0 THEN
                            ROUND((COALESCE(wsc.storage_used_bytes, 0)::NUMERIC / sp.storage_bytes::NUMERIC) * 100, 2)
                        ELSE 0
                    END as usage_percent
                FROM workspaces w
                LEFT JOIN workspace_storage_cache wsc ON w.workspace_id = wsc.workspace_id
                LEFT JOIN workspace_subscriptions ws ON w.workspace_id = ws.workspace_id
                    AND ws.status IN ('active', 'trialing')
                LEFT JOIN subscription_plans sp ON ws.plan_id = sp.plan_id
                WHERE w.workspace_id = $1
                """,
                workspace_id,
            )

            if row:
                return {
                    "storage_used_bytes": row["storage_used_bytes"],
                    "asset_count": row["asset_count"],
                    "storage_limit_bytes": row["storage_limit_bytes"] or 0,
                    "plan_code": row["plan_code"],
                    "plan_name": row["plan_name"],
                    "usage_percent": float(row["usage_percent"] or 0),
                }

            return {
                "storage_used_bytes": 0,
                "asset_count": 0,
                "storage_limit_bytes": 0,
                "plan_code": None,
                "plan_name": None,
                "usage_percent": 0.0,
            }

    async def should_run_cleanup(self, workspace_id: UUID) -> bool:
        """Check if cleanup analysis should run based on storage usage.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            True if storage usage exceeds threshold
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval(
                "SELECT should_run_cleanup($1)",
                workspace_id,
            )

            return bool(result)

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    @staticmethod
    def _row_to_dict(row: Any) -> dict[str, Any]:
        """Convert database row to dictionary."""
        if row is None:
            return {}
        return dict(row)


# Singleton instance factory
_cleanup_repository: Optional[CleanupRepository] = None


def get_cleanup_repository() -> CleanupRepository:
    """Get or create the cleanup repository singleton."""
    global _cleanup_repository
    if _cleanup_repository is None:
        _cleanup_repository = CleanupRepository()
    return _cleanup_repository
