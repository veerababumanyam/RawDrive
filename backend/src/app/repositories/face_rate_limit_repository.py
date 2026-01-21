"""Repository for face rate limit configuration.

Provides database-backed per-workspace rate limit configurations for face operations.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: SEC-001 - Rate Limiting for Face Detection

Tasks: T012-T014
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.models.workspace_biometric_settings import (
    FaceRateLimitConfig,
    FaceRateLimitConfigCreate,
    FaceRateLimitConfigUpdate,
    FaceRateLimitConfigSummary,
    FaceRateLimitUsage,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Default Rate Limits (matching rate_limit_service.py)
# ---------------------------------------------------------------------------

DEFAULT_FACE_SEARCH_RPM = 20  # Per minute
DEFAULT_FACE_DETECT_DAILY_QUOTA = 1000  # Per day
DEFAULT_BULK_OPERATIONS_RPM = 30  # Per minute
DEFAULT_GROUP_MERGE_RPM = 10  # Per minute


class FaceRateLimitConfigRepository:
    """Repository for face rate limit configurations.

    Provides CRUD operations for per-workspace face rate limit settings
    stored in the face_rate_limit_config table.

    All operations enforce workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_by_workspace(
        self,
        workspace_id: UUID,
    ) -> Optional[FaceRateLimitConfig]:
        """Get rate limit config for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            FaceRateLimitConfig or None if not configured
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    id,
                    workspace_id,
                    face_search_rpm,
                    face_detection_daily_quota,
                    bulk_operations_rpm,
                    group_merge_rpm,
                    current_daily_detections,
                    daily_quota_reset_at,
                    is_unlimited,
                    rate_limit_multiplier,
                    created_at,
                    updated_at
                FROM face_rate_limit_config
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if not row:
                return None

            return FaceRateLimitConfig(**dict(row))

    async def get_or_create_defaults(
        self,
        workspace_id: UUID,
    ) -> FaceRateLimitConfig:
        """Get rate limit config for workspace, creating defaults if not exists.

        Args:
            workspace_id: Workspace ID

        Returns:
            FaceRateLimitConfig with either existing or default values
        """
        existing = await self.get_by_workspace(workspace_id)
        if existing:
            return existing

        # Create with defaults
        return await self.create(FaceRateLimitConfigCreate(
            workspace_id=workspace_id,
            face_search_rpm=DEFAULT_FACE_SEARCH_RPM,
            face_detection_daily_quota=DEFAULT_FACE_DETECT_DAILY_QUOTA,
            bulk_operations_rpm=DEFAULT_BULK_OPERATIONS_RPM,
            group_merge_rpm=DEFAULT_GROUP_MERGE_RPM,
            is_unlimited=False,
            rate_limit_multiplier=Decimal("1.0"),
        ))

    async def get_effective_limits(
        self,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Get effective rate limits for a workspace.

        Returns configured limits (with multiplier applied) or defaults if not configured.

        Args:
            workspace_id: Workspace ID

        Returns:
            Dict with face_search_rpm, face_detection_daily_quota, bulk_operations_rpm, group_merge_rpm
        """
        config = await self.get_by_workspace(workspace_id)

        if config:
            if config.is_unlimited:
                # Unlimited plan - return high values
                return {
                    "face_search_rpm": 10000,
                    "face_detection_daily_quota": 1000000,
                    "bulk_operations_rpm": 1000,
                    "group_merge_rpm": 500,
                }

            # Apply multiplier
            multiplier = float(config.rate_limit_multiplier)
            return {
                "face_search_rpm": int(config.face_search_rpm * multiplier),
                "face_detection_daily_quota": int(config.face_detection_daily_quota * multiplier),
                "bulk_operations_rpm": int(config.bulk_operations_rpm * multiplier),
                "group_merge_rpm": int(config.group_merge_rpm * multiplier),
            }

        # Return defaults
        return {
            "face_search_rpm": DEFAULT_FACE_SEARCH_RPM,
            "face_detection_daily_quota": DEFAULT_FACE_DETECT_DAILY_QUOTA,
            "bulk_operations_rpm": DEFAULT_BULK_OPERATIONS_RPM,
            "group_merge_rpm": DEFAULT_GROUP_MERGE_RPM,
        }

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        config: FaceRateLimitConfigCreate,
    ) -> FaceRateLimitConfig:
        """Create rate limit config for a workspace.

        Args:
            config: Creation data

        Returns:
            Created FaceRateLimitConfig
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO face_rate_limit_config (
                    workspace_id,
                    face_search_rpm,
                    face_detection_daily_quota,
                    bulk_operations_rpm,
                    group_merge_rpm,
                    is_unlimited,
                    rate_limit_multiplier
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (workspace_id) DO UPDATE SET
                    face_search_rpm = EXCLUDED.face_search_rpm,
                    face_detection_daily_quota = EXCLUDED.face_detection_daily_quota,
                    bulk_operations_rpm = EXCLUDED.bulk_operations_rpm,
                    group_merge_rpm = EXCLUDED.group_merge_rpm,
                    is_unlimited = EXCLUDED.is_unlimited,
                    rate_limit_multiplier = EXCLUDED.rate_limit_multiplier,
                    updated_at = NOW()
                RETURNING
                    id,
                    workspace_id,
                    face_search_rpm,
                    face_detection_daily_quota,
                    bulk_operations_rpm,
                    group_merge_rpm,
                    current_daily_detections,
                    daily_quota_reset_at,
                    is_unlimited,
                    rate_limit_multiplier,
                    created_at,
                    updated_at
                """,
                config.workspace_id,
                config.face_search_rpm,
                config.face_detection_daily_quota,
                config.bulk_operations_rpm,
                config.group_merge_rpm,
                config.is_unlimited,
                config.rate_limit_multiplier,
            )

            logger.info(
                "Face rate limit config created/updated",
                extra={
                    "workspace_id": str(config.workspace_id),
                    "face_search_rpm": row["face_search_rpm"],
                    "face_detection_daily_quota": row["face_detection_daily_quota"],
                },
            )

            return FaceRateLimitConfig(**dict(row))

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        workspace_id: UUID,
        update_data: FaceRateLimitConfigUpdate,
    ) -> Optional[FaceRateLimitConfig]:
        """Update rate limit config for a workspace.

        Args:
            workspace_id: Workspace ID
            update_data: Fields to update

        Returns:
            Updated FaceRateLimitConfig or None if not found
        """
        # Build dynamic UPDATE clause
        updates = []
        values = [workspace_id]
        param_idx = 2

        if update_data.face_search_rpm is not None:
            updates.append(f"face_search_rpm = ${param_idx}")
            values.append(update_data.face_search_rpm)
            param_idx += 1

        if update_data.face_detection_daily_quota is not None:
            updates.append(f"face_detection_daily_quota = ${param_idx}")
            values.append(update_data.face_detection_daily_quota)
            param_idx += 1

        if update_data.bulk_operations_rpm is not None:
            updates.append(f"bulk_operations_rpm = ${param_idx}")
            values.append(update_data.bulk_operations_rpm)
            param_idx += 1

        if update_data.group_merge_rpm is not None:
            updates.append(f"group_merge_rpm = ${param_idx}")
            values.append(update_data.group_merge_rpm)
            param_idx += 1

        if update_data.is_unlimited is not None:
            updates.append(f"is_unlimited = ${param_idx}")
            values.append(update_data.is_unlimited)
            param_idx += 1

        if update_data.rate_limit_multiplier is not None:
            updates.append(f"rate_limit_multiplier = ${param_idx}")
            values.append(update_data.rate_limit_multiplier)
            param_idx += 1

        if not updates:
            # Nothing to update
            return await self.get_by_workspace(workspace_id)

        updates.append("updated_at = NOW()")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE face_rate_limit_config
                SET {", ".join(updates)}
                WHERE workspace_id = $1
                RETURNING
                    id,
                    workspace_id,
                    face_search_rpm,
                    face_detection_daily_quota,
                    bulk_operations_rpm,
                    group_merge_rpm,
                    current_daily_detections,
                    daily_quota_reset_at,
                    is_unlimited,
                    rate_limit_multiplier,
                    created_at,
                    updated_at
                """,
                *values,
            )

            if not row:
                return None

            logger.info(
                "Face rate limit config updated",
                extra={
                    "workspace_id": str(workspace_id),
                    "updates": list(update_data.model_dump(exclude_unset=True).keys()),
                },
            )

            return FaceRateLimitConfig(**dict(row))

    # =========================================================================
    # DAILY QUOTA TRACKING
    # =========================================================================

    async def increment_daily_detections(
        self,
        workspace_id: UUID,
        count: int = 1,
    ) -> int:
        """Increment the daily detection count for a workspace.

        Also resets the counter if the reset time has passed.

        Args:
            workspace_id: Workspace ID
            count: Number of detections to add (default: 1)

        Returns:
            New total daily detections count
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Use upsert to handle case where config doesn't exist
            row = await conn.fetchrow(
                """
                INSERT INTO face_rate_limit_config (
                    workspace_id,
                    current_daily_detections,
                    daily_quota_reset_at
                ) VALUES (
                    $1,
                    $2,
                    (DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day')
                )
                ON CONFLICT (workspace_id) DO UPDATE SET
                    -- Reset counter if past reset time, otherwise increment
                    current_daily_detections = CASE
                        WHEN face_rate_limit_config.daily_quota_reset_at IS NULL
                             OR face_rate_limit_config.daily_quota_reset_at <= NOW()
                        THEN $2
                        ELSE face_rate_limit_config.current_daily_detections + $2
                    END,
                    -- Update reset time if past
                    daily_quota_reset_at = CASE
                        WHEN face_rate_limit_config.daily_quota_reset_at IS NULL
                             OR face_rate_limit_config.daily_quota_reset_at <= NOW()
                        THEN (DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day')
                        ELSE face_rate_limit_config.daily_quota_reset_at
                    END,
                    updated_at = NOW()
                RETURNING current_daily_detections
                """,
                workspace_id,
                count,
            )

            return row["current_daily_detections"] if row else count

    async def check_daily_quota(
        self,
        workspace_id: UUID,
    ) -> tuple[bool, int, int]:
        """Check if workspace is within daily detection quota.

        Args:
            workspace_id: Workspace ID

        Returns:
            Tuple of (within_quota, current_count, quota_limit)
        """
        config = await self.get_by_workspace(workspace_id)

        if not config:
            # No config - use defaults
            return (True, 0, DEFAULT_FACE_DETECT_DAILY_QUOTA)

        if config.is_unlimited:
            return (True, config.current_daily_detections, 1000000)

        # Check if reset time passed
        now = datetime.now(timezone.utc)
        current_count = config.current_daily_detections
        if config.daily_quota_reset_at and now >= config.daily_quota_reset_at:
            current_count = 0

        # Apply multiplier to quota
        effective_quota = int(config.face_detection_daily_quota * float(config.rate_limit_multiplier))

        return (current_count < effective_quota, current_count, effective_quota)

    async def reset_daily_detections(
        self,
        workspace_id: UUID,
    ) -> bool:
        """Manually reset the daily detection counter.

        Args:
            workspace_id: Workspace ID

        Returns:
            True if reset successful, False if config not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE face_rate_limit_config
                SET current_daily_detections = 0,
                    daily_quota_reset_at = (DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day'),
                    updated_at = NOW()
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            return result and int(result.split()[-1]) > 0

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        workspace_id: UUID,
    ) -> bool:
        """Delete rate limit config for a workspace.

        This will cause the workspace to use default limits.

        Args:
            workspace_id: Workspace ID

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM face_rate_limit_config
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            deleted = result and int(result.split()[-1]) > 0

            if deleted:
                logger.info(
                    "Face rate limit config deleted",
                    extra={"workspace_id": str(workspace_id)},
                )

            return deleted

    # =========================================================================
    # USAGE STATISTICS
    # =========================================================================

    async def get_usage(
        self,
        workspace_id: UUID,
    ) -> FaceRateLimitUsage:
        """Get current rate limit usage for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            FaceRateLimitUsage with current counts and limits
        """
        config = await self.get_by_workspace(workspace_id)

        if not config:
            # No config - return defaults
            return FaceRateLimitUsage(
                workspace_id=workspace_id,
                face_search_rpm_limit=DEFAULT_FACE_SEARCH_RPM,
                face_detection_daily_quota=DEFAULT_FACE_DETECT_DAILY_QUOTA,
                current_daily_detections=0,
                daily_quota_remaining=DEFAULT_FACE_DETECT_DAILY_QUOTA,
                daily_quota_reset_at=None,
                is_unlimited=False,
            )

        # Calculate remaining quota
        multiplier = float(config.rate_limit_multiplier)
        effective_quota = int(config.face_detection_daily_quota * multiplier)

        # Check if reset time passed
        now = datetime.now(timezone.utc)
        current_count = config.current_daily_detections
        if config.daily_quota_reset_at and now >= config.daily_quota_reset_at:
            current_count = 0

        remaining = max(0, effective_quota - current_count)

        return FaceRateLimitUsage(
            workspace_id=workspace_id,
            face_search_rpm_limit=int(config.face_search_rpm * multiplier),
            face_detection_daily_quota=effective_quota,
            current_daily_detections=current_count,
            daily_quota_remaining=remaining,
            daily_quota_reset_at=config.daily_quota_reset_at,
            is_unlimited=config.is_unlimited,
        )

    async def get_summary(
        self,
        workspace_id: UUID,
    ) -> Optional[FaceRateLimitConfigSummary]:
        """Get summary view of rate limit config.

        Args:
            workspace_id: Workspace ID

        Returns:
            FaceRateLimitConfigSummary or None if not found
        """
        config = await self.get_by_workspace(workspace_id)
        if not config:
            return None

        return FaceRateLimitConfigSummary(
            workspace_id=config.workspace_id,
            face_search_rpm=config.face_search_rpm,
            face_detection_daily_quota=config.face_detection_daily_quota,
            bulk_operations_rpm=config.bulk_operations_rpm,
            is_unlimited=config.is_unlimited,
        )


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_repository: Optional[FaceRateLimitConfigRepository] = None


def get_face_rate_limit_repository() -> FaceRateLimitConfigRepository:
    """Get singleton repository instance."""
    global _repository
    if _repository is None:
        _repository = FaceRateLimitConfigRepository()
    return _repository


# Alias for backward compatibility
FaceRateLimitRepository = FaceRateLimitConfigRepository
