"""Repository for workspace biometric settings.

Provides database operations for GDPR Article 9 compliant biometric consent tracking.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-001 - Biometric Consent Management

Tasks: T017-T020
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.models.workspace_biometric_settings import (
    BiometricConsentStatus,
    WorkspaceBiometricSettings,
    WorkspaceBiometricSettingsCreate,
    WorkspaceBiometricSettingsUpdate,
    WorkspaceBiometricSettingsSummary,
    BiometricConsentGrant,
    BiometricConsentWithdraw,
)

logger = logging.getLogger(__name__)


class BiometricSettingsRepository:
    """Repository for workspace biometric settings.

    Provides CRUD operations for biometric consent and face detection settings
    stored in the workspace_biometric_settings table.

    All operations enforce workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_by_workspace(
        self,
        workspace_id: UUID,
    ) -> Optional[WorkspaceBiometricSettings]:
        """Get biometric settings for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            WorkspaceBiometricSettings or None if not configured
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    id,
                    workspace_id,
                    face_detection_enabled,
                    consent_status,
                    consented_by,
                    consented_at,
                    consent_ip_address::text as consent_ip_address,
                    consent_user_agent,
                    consent_policy_version,
                    withdrawn_by,
                    withdrawn_at,
                    withdrawal_ip_address::text as withdrawal_ip_address,
                    withdrawal_reason,
                    public_face_search_enabled,
                    auto_clustering_enabled,
                    ai_processing_consent,
                    created_at,
                    updated_at
                FROM workspace_biometric_settings
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if not row:
                return None

            return WorkspaceBiometricSettings(**dict(row))

    async def get_or_create(
        self,
        workspace_id: UUID,
    ) -> WorkspaceBiometricSettings:
        """Get biometric settings for workspace, creating defaults if not exists.

        Args:
            workspace_id: Workspace ID

        Returns:
            WorkspaceBiometricSettings with either existing or default values
        """
        existing = await self.get_by_workspace(workspace_id)
        if existing:
            return existing

        # Create with defaults (consent not granted)
        return await self.create(WorkspaceBiometricSettingsCreate(
            workspace_id=workspace_id,
            face_detection_enabled=False,
            consent_status=BiometricConsentStatus.NOT_GRANTED,
            public_face_search_enabled=False,
            auto_clustering_enabled=True,
            ai_processing_consent=False,
        ))

    async def check_consent(
        self,
        workspace_id: UUID,
    ) -> tuple[bool, BiometricConsentStatus]:
        """Check if workspace has active biometric consent.

        Fast path for checking consent before face operations.

        Args:
            workspace_id: Workspace ID

        Returns:
            Tuple of (has_consent, consent_status)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT face_detection_enabled, consent_status
                FROM workspace_biometric_settings
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if not row:
                return (False, BiometricConsentStatus.NOT_GRANTED)

            is_enabled = row["face_detection_enabled"]
            status = BiometricConsentStatus(row["consent_status"])

            # Consent is valid if enabled AND status is granted
            has_consent = is_enabled and status == BiometricConsentStatus.GRANTED

            return (has_consent, status)

    async def is_public_face_search_enabled(
        self,
        workspace_id: UUID,
    ) -> bool:
        """Check if public face search is enabled for workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            True if public face search is enabled and consent is granted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT public_face_search_enabled, face_detection_enabled, consent_status
                FROM workspace_biometric_settings
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if not row:
                return False

            return (
                row["public_face_search_enabled"]
                and row["face_detection_enabled"]
                and row["consent_status"] == BiometricConsentStatus.GRANTED.value
            )

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        settings: WorkspaceBiometricSettingsCreate,
    ) -> WorkspaceBiometricSettings:
        """Create biometric settings for a workspace.

        Args:
            settings: Creation data

        Returns:
            Created WorkspaceBiometricSettings
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO workspace_biometric_settings (
                    workspace_id,
                    face_detection_enabled,
                    consent_status,
                    public_face_search_enabled,
                    auto_clustering_enabled,
                    ai_processing_consent
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (workspace_id) DO UPDATE SET
                    updated_at = NOW()
                RETURNING
                    id,
                    workspace_id,
                    face_detection_enabled,
                    consent_status,
                    consented_by,
                    consented_at,
                    consent_ip_address::text as consent_ip_address,
                    consent_user_agent,
                    consent_policy_version,
                    withdrawn_by,
                    withdrawn_at,
                    withdrawal_ip_address::text as withdrawal_ip_address,
                    withdrawal_reason,
                    public_face_search_enabled,
                    auto_clustering_enabled,
                    ai_processing_consent,
                    created_at,
                    updated_at
                """,
                settings.workspace_id,
                settings.face_detection_enabled,
                settings.consent_status.value,
                settings.public_face_search_enabled,
                settings.auto_clustering_enabled,
                settings.ai_processing_consent,
            )

            logger.info(
                "Biometric settings created",
                extra={
                    "workspace_id": str(settings.workspace_id),
                    "face_detection_enabled": settings.face_detection_enabled,
                },
            )

            return WorkspaceBiometricSettings(**dict(row))

    # =========================================================================
    # CONSENT OPERATIONS
    # =========================================================================

    async def grant_consent(
        self,
        workspace_id: UUID,
        user_id: UUID,
        consent_data: BiometricConsentGrant,
    ) -> WorkspaceBiometricSettings:
        """Grant biometric consent for a workspace.

        Records GDPR Article 9 compliant consent with full audit trail.

        Args:
            workspace_id: Workspace ID
            user_id: User granting consent
            consent_data: Consent details (policy version, IP, user agent)

        Returns:
            Updated WorkspaceBiometricSettings
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Use upsert to handle case where settings don't exist
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
                    consent_policy_version,
                    -- Clear withdrawal fields
                    withdrawn_by,
                    withdrawn_at,
                    withdrawal_ip_address,
                    withdrawal_reason
                ) VALUES (
                    $1, TRUE, 'granted', $2, NOW(),
                    $3::inet, $4, $5,
                    NULL, NULL, NULL, NULL
                )
                ON CONFLICT (workspace_id) DO UPDATE SET
                    face_detection_enabled = TRUE,
                    consent_status = 'granted',
                    consented_by = $2,
                    consented_at = NOW(),
                    consent_ip_address = $3::inet,
                    consent_user_agent = $4,
                    consent_policy_version = $5,
                    -- Clear withdrawal fields
                    withdrawn_by = NULL,
                    withdrawn_at = NULL,
                    withdrawal_ip_address = NULL,
                    withdrawal_reason = NULL,
                    updated_at = NOW()
                RETURNING
                    id,
                    workspace_id,
                    face_detection_enabled,
                    consent_status,
                    consented_by,
                    consented_at,
                    consent_ip_address::text as consent_ip_address,
                    consent_user_agent,
                    consent_policy_version,
                    withdrawn_by,
                    withdrawn_at,
                    withdrawal_ip_address::text as withdrawal_ip_address,
                    withdrawal_reason,
                    public_face_search_enabled,
                    auto_clustering_enabled,
                    ai_processing_consent,
                    created_at,
                    updated_at
                """,
                workspace_id,
                user_id,
                consent_data.ip_address,
                consent_data.user_agent,
                consent_data.policy_version,
            )

            logger.info(
                "Biometric consent granted",
                extra={
                    "workspace_id": str(workspace_id),
                    "consented_by": str(user_id),
                    "policy_version": consent_data.policy_version,
                },
            )

            return WorkspaceBiometricSettings(**dict(row))

    async def withdraw_consent(
        self,
        workspace_id: UUID,
        user_id: UUID,
        withdrawal_data: BiometricConsentWithdraw,
    ) -> WorkspaceBiometricSettings:
        """Withdraw biometric consent for a workspace.

        Disables face detection and marks consent as withdrawn.
        Triggers cascade deletion of face embeddings via retention jobs.

        Args:
            workspace_id: Workspace ID
            user_id: User withdrawing consent
            withdrawal_data: Withdrawal details (reason, IP)

        Returns:
            Updated WorkspaceBiometricSettings
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE workspace_biometric_settings
                SET face_detection_enabled = FALSE,
                    consent_status = 'withdrawn',
                    withdrawn_by = $2,
                    withdrawn_at = NOW(),
                    withdrawal_ip_address = $3::inet,
                    withdrawal_reason = $4,
                    -- Also disable related features
                    public_face_search_enabled = FALSE,
                    ai_processing_consent = FALSE,
                    updated_at = NOW()
                WHERE workspace_id = $1
                RETURNING
                    id,
                    workspace_id,
                    face_detection_enabled,
                    consent_status,
                    consented_by,
                    consented_at,
                    consent_ip_address::text as consent_ip_address,
                    consent_user_agent,
                    consent_policy_version,
                    withdrawn_by,
                    withdrawn_at,
                    withdrawal_ip_address::text as withdrawal_ip_address,
                    withdrawal_reason,
                    public_face_search_enabled,
                    auto_clustering_enabled,
                    ai_processing_consent,
                    created_at,
                    updated_at
                """,
                workspace_id,
                user_id,
                withdrawal_data.ip_address,
                withdrawal_data.reason,
            )

            if not row:
                # Settings don't exist - create in withdrawn state
                return await self.create(WorkspaceBiometricSettingsCreate(
                    workspace_id=workspace_id,
                    face_detection_enabled=False,
                    consent_status=BiometricConsentStatus.WITHDRAWN,
                    public_face_search_enabled=False,
                    auto_clustering_enabled=True,
                    ai_processing_consent=False,
                ))

            logger.info(
                "Biometric consent withdrawn",
                extra={
                    "workspace_id": str(workspace_id),
                    "withdrawn_by": str(user_id),
                    "reason": withdrawal_data.reason,
                },
            )

            return WorkspaceBiometricSettings(**dict(row))

    async def set_pending_deletion(
        self,
        workspace_id: UUID,
    ) -> bool:
        """Mark workspace as pending deletion of biometric data.

        Called after consent withdrawal to indicate cascade delete in progress.

        Args:
            workspace_id: Workspace ID

        Returns:
            True if updated, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE workspace_biometric_settings
                SET consent_status = 'pending_deletion',
                    updated_at = NOW()
                WHERE workspace_id = $1
                AND consent_status = 'withdrawn'
                """,
                workspace_id,
            )

            return result and int(result.split()[-1]) > 0

    async def complete_deletion(
        self,
        workspace_id: UUID,
    ) -> bool:
        """Mark biometric data deletion as complete.

        Resets consent status to not_granted after all data is deleted.

        Args:
            workspace_id: Workspace ID

        Returns:
            True if updated, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE workspace_biometric_settings
                SET consent_status = 'not_granted',
                    updated_at = NOW()
                WHERE workspace_id = $1
                AND consent_status = 'pending_deletion'
                """,
                workspace_id,
            )

            return result and int(result.split()[-1]) > 0

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        workspace_id: UUID,
        update_data: WorkspaceBiometricSettingsUpdate,
    ) -> Optional[WorkspaceBiometricSettings]:
        """Update biometric settings for a workspace.

        Only updates feature toggles, not consent status.
        Use grant_consent/withdraw_consent for consent changes.

        Args:
            workspace_id: Workspace ID
            update_data: Fields to update

        Returns:
            Updated settings or None if not found
        """
        # Build dynamic UPDATE clause
        updates = []
        values = [workspace_id]
        param_idx = 2

        if update_data.face_detection_enabled is not None:
            updates.append(f"face_detection_enabled = ${param_idx}")
            values.append(update_data.face_detection_enabled)
            param_idx += 1

        if update_data.public_face_search_enabled is not None:
            updates.append(f"public_face_search_enabled = ${param_idx}")
            values.append(update_data.public_face_search_enabled)
            param_idx += 1

        if update_data.auto_clustering_enabled is not None:
            updates.append(f"auto_clustering_enabled = ${param_idx}")
            values.append(update_data.auto_clustering_enabled)
            param_idx += 1

        if update_data.ai_processing_consent is not None:
            updates.append(f"ai_processing_consent = ${param_idx}")
            values.append(update_data.ai_processing_consent)
            param_idx += 1

        if not updates:
            return await self.get_by_workspace(workspace_id)

        updates.append("updated_at = NOW()")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE workspace_biometric_settings
                SET {", ".join(updates)}
                WHERE workspace_id = $1
                RETURNING
                    id,
                    workspace_id,
                    face_detection_enabled,
                    consent_status,
                    consented_by,
                    consented_at,
                    consent_ip_address::text as consent_ip_address,
                    consent_user_agent,
                    consent_policy_version,
                    withdrawn_by,
                    withdrawn_at,
                    withdrawal_ip_address::text as withdrawal_ip_address,
                    withdrawal_reason,
                    public_face_search_enabled,
                    auto_clustering_enabled,
                    ai_processing_consent,
                    created_at,
                    updated_at
                """,
                *values,
            )

            if not row:
                return None

            logger.info(
                "Biometric settings updated",
                extra={
                    "workspace_id": str(workspace_id),
                    "updates": list(update_data.model_dump(exclude_unset=True).keys()),
                },
            )

            return WorkspaceBiometricSettings(**dict(row))

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        workspace_id: UUID,
    ) -> bool:
        """Delete biometric settings for a workspace.

        Typically called when workspace is deleted.

        Args:
            workspace_id: Workspace ID

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM workspace_biometric_settings
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            return result and int(result.split()[-1]) > 0

    # =========================================================================
    # SUMMARY
    # =========================================================================

    async def get_summary(
        self,
        workspace_id: UUID,
    ) -> Optional[WorkspaceBiometricSettingsSummary]:
        """Get summary view of biometric settings.

        Args:
            workspace_id: Workspace ID

        Returns:
            WorkspaceBiometricSettingsSummary or None if not found
        """
        settings = await self.get_by_workspace(workspace_id)
        if not settings:
            return None

        return WorkspaceBiometricSettingsSummary(
            workspace_id=settings.workspace_id,
            face_detection_enabled=settings.face_detection_enabled,
            consent_status=settings.consent_status,
            consented_at=settings.consented_at,
            public_face_search_enabled=settings.public_face_search_enabled,
            auto_clustering_enabled=settings.auto_clustering_enabled,
        )


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_repository: Optional[BiometricSettingsRepository] = None


def get_biometric_settings_repository() -> BiometricSettingsRepository:
    """Get singleton repository instance."""
    global _repository
    if _repository is None:
        _repository = BiometricSettingsRepository()
    return _repository
