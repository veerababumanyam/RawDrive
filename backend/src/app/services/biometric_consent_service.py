"""Biometric Consent Service.

GDPR Article 9 compliant consent management for biometric data processing.
Handles consent granting, withdrawal, and status checks.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-001 - Biometric Consent Management
Tasks: T006-T008
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional, Any
from uuid import UUID

from fastapi import Depends
from app.api.dependencies.auth import get_workspace_id
from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.models.workspace_biometric_settings import (
    WorkspaceBiometricSettings,
    WorkspaceBiometricSettingsUpdate,
    BiometricConsentStatus,
    BiometricConsentGrant,
    BiometricConsentWithdraw,
    WorkspaceBiometricSettingsSummary,
    FaceRateLimitConfig,
    FaceRateLimitConfigCreate,
)

logger = logging.getLogger(__name__)


# Cache configuration
CONSENT_CACHE_TTL = 300  # 5 minutes (short due to consent sensitivity)
CONSENT_CACHE_PREFIX = "consent:biometric"


class BiometricConsentError(Exception):
    """Base exception for biometric consent errors."""

    def __init__(
        self,
        message: str,
        code: str = "BIOMETRIC_CONSENT_ERROR",
        status: int = 400,
    ):
        super().__init__(message)
        self.code = code
        self.status = status


class ConsentNotGrantedError(BiometricConsentError):
    """Raised when operation requires consent that hasn't been granted."""

    def __init__(self, workspace_id: UUID):
        super().__init__(
            message="Biometric consent not granted for this workspace",
            code="CONSENT_NOT_GRANTED",
            status=403,
        )
        self.workspace_id = workspace_id


class ConsentAlreadyGrantedError(BiometricConsentError):
    """Raised when trying to grant consent that's already granted."""

    def __init__(self, workspace_id: UUID):
        super().__init__(
            message="Biometric consent already granted",
            code="CONSENT_ALREADY_GRANTED",
            status=409,
        )
        self.workspace_id = workspace_id


class ConsentNotActiveError(BiometricConsentError):
    """Raised when trying to withdraw consent that's not active."""

    def __init__(self, workspace_id: UUID):
        super().__init__(
            message="No active consent to withdraw",
            code="CONSENT_NOT_ACTIVE",
            status=400,
        )
        self.workspace_id = workspace_id


class BiometricConsentService:
    """Service for managing biometric consent.

    Provides GDPR Article 9 compliant consent management:
    - Grant consent with full audit trail
    - Withdraw consent with cascade deletion option
    - Check consent status with caching
    - Update feature toggles
    """

    # =========================================================================
    # CONSENT STATUS
    # =========================================================================

    async def get_settings(
        self, workspace_id: UUID
    ) -> WorkspaceBiometricSettings:
        """Get biometric settings for a workspace.

        Creates default settings if none exist (consent not granted).

        Args:
            workspace_id: The workspace ID

        Returns:
            WorkspaceBiometricSettings object
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM workspace_biometric_settings
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if not row:
                # Create default settings (face detection disabled)
                return await self._create_default_settings(workspace_id)

            return self._map_settings(row)

    async def get_settings_summary(
        self, workspace_id: UUID
    ) -> WorkspaceBiometricSettingsSummary:
        """Get summary of biometric settings for API response.

        Uses caching to reduce database load.

        Args:
            workspace_id: The workspace ID

        Returns:
            WorkspaceBiometricSettingsSummary object
        """
        # Try cache first
        cached = await self._get_cached_consent(workspace_id)
        if cached:
            return WorkspaceBiometricSettingsSummary(
                workspace_id=workspace_id,
                face_detection_enabled=cached.get("face_detection_enabled", False),
                consent_status=BiometricConsentStatus(cached.get("consent_status", "not_granted")),
                consented_at=cached.get("consented_at"),
                public_face_search_enabled=cached.get("public_face_search_enabled", False),
                auto_clustering_enabled=cached.get("auto_clustering_enabled", True),
            )

        settings = await self.get_settings(workspace_id)

        # Cache the result
        await self._cache_consent(workspace_id, settings)

        return WorkspaceBiometricSettingsSummary(
            workspace_id=settings.workspace_id,
            face_detection_enabled=settings.face_detection_enabled,
            consent_status=settings.consent_status,
            consented_at=settings.consented_at,
            public_face_search_enabled=settings.public_face_search_enabled,
            auto_clustering_enabled=settings.auto_clustering_enabled,
        )

    async def is_face_detection_allowed(self, workspace_id: UUID) -> bool:
        """Check if face detection is allowed for a workspace.

        This is the primary check used before any face detection operation.
        Returns True only if consent is granted AND face detection is enabled.

        Uses caching for performance (5 minute TTL).

        Args:
            workspace_id: The workspace ID

        Returns:
            True if face detection is allowed, False otherwise
        """
        # Try cache first
        cached = await self._get_cached_consent(workspace_id)
        if cached:
            return (
                cached.get("face_detection_enabled", False)
                and cached.get("consent_status") == BiometricConsentStatus.GRANTED.value
            )

        settings = await self.get_settings(workspace_id)

        # Cache the result (non-blocking: do not fail consent check if Redis is down)
        try:
            await self._cache_consent(workspace_id, settings)
        except Exception as e:
            logger.warning(
                "Failed to cache consent after DB read; using DB result",
                extra={"workspace_id": str(workspace_id), "error": str(e)},
            )

        return (
            settings.face_detection_enabled
            and settings.consent_status == BiometricConsentStatus.GRANTED
        )

    async def check_consent_status(self, workspace_id: UUID) -> BiometricConsentStatus:
        """Return the current biometric consent status for a workspace.

        This is the lightweight status-only check used by background workers
        before processing face data. Unlike is_face_detection_allowed(), this
        returns the raw status enum instead of a bool.

        Args:
            workspace_id: The workspace ID

        Returns:
            BiometricConsentStatus enum value
        """
        settings = await self.get_settings(workspace_id)
        return settings.consent_status

    async def check_consent_or_raise(self, workspace_id: UUID) -> None:
        """Check consent and raise if not granted.

        Use this as a guard at the start of face detection operations.

        Args:
            workspace_id: The workspace ID

        Raises:
            ConsentNotGrantedError: If consent is not granted
        """
        if not await self.is_face_detection_allowed(workspace_id):
            raise ConsentNotGrantedError(workspace_id)

    # =========================================================================
    # CONSENT MANAGEMENT
    # =========================================================================

    async def grant_consent(
        self,
        workspace_id: UUID,
        user_id: UUID,
        grant_data: BiometricConsentGrant,
    ) -> WorkspaceBiometricSettings:
        """Grant biometric consent for a workspace.

        Records full audit trail per GDPR Article 9 requirements:
        - User who granted consent
        - Timestamp
        - IP address
        - User agent
        - Policy version accepted

        Args:
            workspace_id: The workspace ID
            user_id: User granting consent
            grant_data: Consent grant details

        Returns:
            Updated WorkspaceBiometricSettings

        Raises:
            ConsentAlreadyGrantedError: If consent is already active
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check current status
            existing = await conn.fetchrow(
                """
                SELECT consent_status FROM workspace_biometric_settings
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if existing and existing["consent_status"] == BiometricConsentStatus.GRANTED.value:
                raise ConsentAlreadyGrantedError(workspace_id)

            now = datetime.now(timezone.utc)

            # Upsert consent grant
            row = await conn.fetchrow(
                """
                INSERT INTO workspace_biometric_settings (
                    workspace_id,
                    face_detection_enabled,
                    consent_status,
                    consented_by,
                    consented_at,
                    consent_ip_address,
                    consent_user_agent,
                    consent_policy_version
                )
                VALUES ($1, TRUE, 'granted', $2, $3, $4, $5, $6)
                ON CONFLICT (workspace_id) DO UPDATE SET
                    face_detection_enabled = TRUE,
                    consent_status = 'granted',
                    consented_by = $2,
                    consented_at = $3,
                    consent_ip_address = $4,
                    consent_user_agent = $5,
                    consent_policy_version = $6,
                    -- Clear withdrawal fields
                    withdrawn_by = NULL,
                    withdrawn_at = NULL,
                    withdrawal_ip_address = NULL,
                    withdrawal_reason = NULL,
                    updated_at = NOW()
                RETURNING *
                """,
                workspace_id,
                user_id,
                now,
                grant_data.ip_address,
                grant_data.user_agent,
                grant_data.policy_version,
            )

            logger.info(
                "Biometric consent granted",
                extra={
                    "workspace_id": str(workspace_id),
                    "user_id": str(user_id),
                    "policy_version": grant_data.policy_version,
                },
            )

            # Invalidate cache
            await self._invalidate_consent_cache(workspace_id)

            # Create default rate limit config if not exists
            await self._ensure_rate_limit_config(workspace_id)

            return self._map_settings(row)

    async def withdraw_consent(
        self,
        workspace_id: UUID,
        user_id: UUID,
        withdraw_data: BiometricConsentWithdraw,
        cascade_delete: bool = False,
    ) -> WorkspaceBiometricSettings:
        """Withdraw biometric consent for a workspace.

        Records withdrawal audit trail:
        - User who withdrew consent
        - Timestamp
        - IP address
        - Reason (optional)

        Args:
            workspace_id: The workspace ID
            user_id: User withdrawing consent
            withdraw_data: Withdrawal details
            cascade_delete: If True, schedule deletion of all face data

        Returns:
            Updated WorkspaceBiometricSettings

        Raises:
            ConsentNotActiveError: If no active consent to withdraw
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check current status
            existing = await conn.fetchrow(
                """
                SELECT consent_status FROM workspace_biometric_settings
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if not existing or existing["consent_status"] != BiometricConsentStatus.GRANTED.value:
                raise ConsentNotActiveError(workspace_id)

            now = datetime.now(timezone.utc)
            new_status = (
                BiometricConsentStatus.PENDING_DELETION.value
                if cascade_delete
                else BiometricConsentStatus.WITHDRAWN.value
            )

            # Update consent status
            row = await conn.fetchrow(
                """
                UPDATE workspace_biometric_settings SET
                    face_detection_enabled = FALSE,
                    consent_status = $2,
                    withdrawn_by = $3,
                    withdrawn_at = $4,
                    withdrawal_ip_address = $5,
                    withdrawal_reason = $6,
                    updated_at = NOW()
                WHERE workspace_id = $1
                RETURNING *
                """,
                workspace_id,
                new_status,
                user_id,
                now,
                withdraw_data.ip_address,
                withdraw_data.reason,
            )

            logger.info(
                "Biometric consent withdrawn",
                extra={
                    "workspace_id": str(workspace_id),
                    "user_id": str(user_id),
                    "cascade_delete": cascade_delete,
                    "reason": withdraw_data.reason,
                },
            )

            # Invalidate cache
            await self._invalidate_consent_cache(workspace_id)

            # Schedule deletion job if cascade requested
            if cascade_delete:
                await self._create_consent_withdrawal_job(workspace_id, user_id)

            return self._map_settings(row)

    async def update_feature_toggles(
        self,
        workspace_id: UUID,
        public_face_search_enabled: Optional[bool] = None,
        auto_clustering_enabled: Optional[bool] = None,
        ai_processing_consent: Optional[bool] = None,
    ) -> WorkspaceBiometricSettings:
        """Update feature toggles for a workspace.

        These can be updated even if consent is not granted (they're stored
        but not active until consent is granted).

        Args:
            workspace_id: The workspace ID
            public_face_search_enabled: Allow face search in public galleries
            auto_clustering_enabled: Auto-cluster faces when detected
            ai_processing_consent: Allow AI provider to process face data

        Returns:
            Updated WorkspaceBiometricSettings
        """
        pool = await get_postgres_pool()

        updates = []
        params = [workspace_id]
        param_idx = 2

        if public_face_search_enabled is not None:
            updates.append(f"public_face_search_enabled = ${param_idx}")
            params.append(public_face_search_enabled)
            param_idx += 1

        if auto_clustering_enabled is not None:
            updates.append(f"auto_clustering_enabled = ${param_idx}")
            params.append(auto_clustering_enabled)
            param_idx += 1

        if ai_processing_consent is not None:
            updates.append(f"ai_processing_consent = ${param_idx}")
            params.append(ai_processing_consent)
            param_idx += 1

        if not updates:
            return await self.get_settings(workspace_id)

        updates.append("updated_at = NOW()")

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE workspace_biometric_settings
                SET {', '.join(updates)}
                WHERE workspace_id = $1
                RETURNING *
                """,
                *params,
            )

            if not row:
                # Create default settings first
                await self._create_default_settings(workspace_id)
                # Then retry update
                row = await conn.fetchrow(
                    f"""
                    UPDATE workspace_biometric_settings
                    SET {', '.join(updates)}
                    WHERE workspace_id = $1
                    RETURNING *
                    """,
                    *params,
                )

            # Invalidate cache
            await self._invalidate_consent_cache(workspace_id)

            return self._map_settings(row)

    async def update_settings(
        self,
        workspace_id: UUID,
        update_data: WorkspaceBiometricSettingsUpdate,
    ) -> WorkspaceBiometricSettings:
        """Update biometric settings using a Pydantic schema.

        Wrapper around update_feature_toggles for API convenience.

        Args:
            workspace_id: The workspace ID
            update_data: Update data from API request

        Returns:
            Updated WorkspaceBiometricSettings
        """
        return await self.update_feature_toggles(
            workspace_id=workspace_id,
            public_face_search_enabled=update_data.public_face_search_enabled,
            auto_clustering_enabled=update_data.auto_clustering_enabled,
            ai_processing_consent=update_data.ai_processing_consent,
        )

    # =========================================================================
    # RATE LIMIT CONFIG
    # =========================================================================

    async def get_rate_limit_config(
        self, workspace_id: UUID
    ) -> Optional[FaceRateLimitConfig]:
        """Get rate limit config for a workspace.

        Args:
            workspace_id: The workspace ID

        Returns:
            FaceRateLimitConfig or None if not configured
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM face_rate_limit_config
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if not row:
                return None

            return FaceRateLimitConfig(
                id=row["id"],
                workspace_id=row["workspace_id"],
                face_search_rpm=row["face_search_rpm"],
                face_detection_daily_quota=row["face_detection_daily_quota"],
                bulk_operations_rpm=row["bulk_operations_rpm"],
                group_merge_rpm=row["group_merge_rpm"],
                current_daily_detections=row["current_daily_detections"],
                daily_quota_reset_at=row["daily_quota_reset_at"],
                is_unlimited=row["is_unlimited"],
                rate_limit_multiplier=row["rate_limit_multiplier"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    async def _ensure_rate_limit_config(self, workspace_id: UUID) -> None:
        """Ensure rate limit config exists for workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO face_rate_limit_config (workspace_id)
                VALUES ($1)
                ON CONFLICT (workspace_id) DO NOTHING
                """,
                workspace_id,
            )

    # =========================================================================
    # CACHE MANAGEMENT
    # =========================================================================

    async def _get_cached_consent(
        self, workspace_id: UUID
    ) -> Optional[dict[str, Any]]:
        """Get cached consent status."""
        try:
            redis = await get_redis_client()
            key = f"{CONSENT_CACHE_PREFIX}:{workspace_id}"
            data = await redis.hgetall(key)
            if data:
                # Convert bytes to strings if needed
                return {
                    k.decode() if isinstance(k, bytes) else k:
                    v.decode() if isinstance(v, bytes) else v
                    for k, v in data.items()
                }
        except Exception as e:
            logger.warning(
                "Failed to get cached consent",
                extra={"workspace_id": str(workspace_id), "error": str(e)},
            )
        return None

    async def _cache_consent(
        self, workspace_id: UUID, settings: WorkspaceBiometricSettings
    ) -> None:
        """Cache consent status."""
        try:
            redis = await get_redis_client()
            key = f"{CONSENT_CACHE_PREFIX}:{workspace_id}"

            data = {
                "face_detection_enabled": str(settings.face_detection_enabled).lower(),
                "consent_status": settings.consent_status.value,
                "public_face_search_enabled": str(settings.public_face_search_enabled).lower(),
                "auto_clustering_enabled": str(settings.auto_clustering_enabled).lower(),
            }
            if settings.consented_at:
                data["consented_at"] = settings.consented_at.isoformat()

            await redis.hset(key, mapping=data)
            await redis.expire(key, CONSENT_CACHE_TTL)
        except Exception as e:
            logger.warning(
                "Failed to cache consent",
                extra={"workspace_id": str(workspace_id), "error": str(e)},
            )

    async def _invalidate_consent_cache(self, workspace_id: UUID) -> None:
        """Invalidate cached consent status."""
        try:
            redis = await get_redis_client()
            key = f"{CONSENT_CACHE_PREFIX}:{workspace_id}"
            await redis.delete(key)
        except Exception as e:
            logger.warning(
                "Failed to invalidate consent cache",
                extra={"workspace_id": str(workspace_id), "error": str(e)},
            )

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================

    async def _create_default_settings(
        self, workspace_id: UUID
    ) -> WorkspaceBiometricSettings:
        """Create default biometric settings (consent not granted)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO workspace_biometric_settings (
                    workspace_id,
                    face_detection_enabled,
                    consent_status
                )
                VALUES ($1, FALSE, 'not_granted')
                ON CONFLICT (workspace_id) DO UPDATE SET
                    updated_at = NOW()
                RETURNING *
                """,
                workspace_id,
            )
            return self._map_settings(row)

    async def _create_consent_withdrawal_job(
        self, workspace_id: UUID, user_id: UUID
    ) -> UUID:
        """Create a retention job for consent withdrawal cascade delete."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO face_embedding_retention_jobs (
                    workspace_id,
                    job_type,
                    status,
                    triggered_by,
                    trigger_reason
                )
                VALUES ($1, 'consent_withdrawal', 'pending', $2, 'Consent withdrawn - cascade delete requested')
                RETURNING id
                """,
                workspace_id,
                user_id,
            )

            logger.info(
                "Created consent withdrawal job",
                extra={
                    "workspace_id": str(workspace_id),
                    "job_id": str(row["id"]),
                },
            )

            return row["id"]

    def _map_settings(self, row) -> WorkspaceBiometricSettings:
        """Map database row to WorkspaceBiometricSettings model.

        Converts INET columns (consent_ip_address, withdrawal_ip_address) to str
        since asyncpg returns IPv4Address/IPv6Address and the model expects str.
        """
        consent_ip = row["consent_ip_address"]
        withdrawal_ip = row["withdrawal_ip_address"]
        if consent_ip is not None and not isinstance(consent_ip, str):
            consent_ip = str(consent_ip)
        if withdrawal_ip is not None and not isinstance(withdrawal_ip, str):
            withdrawal_ip = str(withdrawal_ip)
        return WorkspaceBiometricSettings(
            id=row["id"],
            workspace_id=row["workspace_id"],
            face_detection_enabled=row["face_detection_enabled"],
            consent_status=BiometricConsentStatus(row["consent_status"]),
            consented_by=row["consented_by"],
            consented_at=row["consented_at"],
            consent_ip_address=consent_ip,
            consent_user_agent=row["consent_user_agent"],
            consent_policy_version=row["consent_policy_version"],
            withdrawn_by=row["withdrawn_by"],
            withdrawn_at=row["withdrawn_at"],
            withdrawal_ip_address=withdrawal_ip,
            withdrawal_reason=row["withdrawal_reason"],
            public_face_search_enabled=row["public_face_search_enabled"],
            auto_clustering_enabled=row["auto_clustering_enabled"],
            ai_processing_consent=row["ai_processing_consent"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# Singleton instance
_service: Optional[BiometricConsentService] = None


def get_biometric_consent_service() -> BiometricConsentService:
    """Get singleton service instance."""
    global _service
    if _service is None:
        _service = BiometricConsentService()
    return _service


# ---------------------------------------------------------------------------
# FastAPI Dependencies (SEC-001, COM-001)
# ---------------------------------------------------------------------------


async def require_biometric_consent(
    workspace_id: UUID = Depends(get_workspace_id),
    service: BiometricConsentService = Depends(get_biometric_consent_service),
) -> None:
    """FastAPI dependency to require biometric consent.

    Checks if face detection is allowed for the workspace.
    Raises ConsentNotGrantedError if consent is not granted.

    Usage:
        @router.post("/faces/detect")
        async def detect_faces(
            workspace_id: UUID,
            _: None = Depends(require_biometric_consent),
        ):
            ...

    Args:
        workspace_id: Workspace ID
        service: Biometric consent service (injected)

    Raises:
        ConsentNotGrantedError: If consent is not granted
    """
    if service is None:
        service = get_biometric_consent_service()
    await service.check_consent_or_raise(workspace_id)


async def require_public_face_search_enabled(
    workspace_id: UUID = Depends(get_workspace_id),
    service: BiometricConsentService = Depends(get_biometric_consent_service),
) -> None:
    """FastAPI dependency to require public face search.

    Checks if public face search is enabled for the workspace.
    This requires both consent and the public_face_search_enabled toggle.

    Usage:
        @router.post("/public/galleries/{gallery_id}/face-search")
        async def public_face_search(
            gallery_id: UUID,
            workspace_id: UUID,
            _: None = Depends(require_public_face_search_enabled),
        ):
            ...

    Args:
        workspace_id: Workspace ID
        service: Biometric consent service (injected)

    Raises:
        ConsentNotGrantedError: If consent is not granted or public face search disabled
    """
    if service is None:
        service = get_biometric_consent_service()

    settings = await service.get_settings(workspace_id)

    if not settings.face_detection_enabled:
        raise ConsentNotGrantedError(workspace_id)

    if settings.consent_status != BiometricConsentStatus.GRANTED:
        raise ConsentNotGrantedError(workspace_id)

    if not settings.public_face_search_enabled:
        raise BiometricConsentError(
            message="Public face search is not enabled for this workspace",
            code="PUBLIC_FACE_SEARCH_DISABLED",
            status=403,
        )
