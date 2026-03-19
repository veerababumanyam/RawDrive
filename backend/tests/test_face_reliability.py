"""Face reliability regression tests.

Tests for:
- Worker consent enforcement before processing
- Cascade delete on consent withdrawal
- Audit trail for consent withdrawal
- Merge deadlock prevention via sorted lock ordering
- Cache coherence across L1/L2/L3 layers

Requirements: FACE-01, FACE-04
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Optional
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.models.workspace_biometric_settings import BiometricConsentStatus


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def workspace_id() -> UUID:
    return uuid4()


@pytest.fixture
def user_id() -> UUID:
    return uuid4()


@pytest.fixture
def make_job(workspace_id):
    """Factory for creating fake detection job dicts."""
    def _make(
        status: str = "pending",
        consent_status: BiometricConsentStatus = BiometricConsentStatus.GRANTED,
        **overrides,
    ) -> dict[str, Any]:
        return {
            "id": overrides.get("id", uuid4()),
            "workspace_id": overrides.get("workspace_id", workspace_id),
            "photo_id": overrides.get("photo_id", uuid4()),
            "status": status,
            "priority": 0,
            "retry_count": 0,
            **overrides,
        }
    return _make


# =============================================================================
# TASK 1: WORKER CONSENT ENFORCEMENT
# =============================================================================


class TestWorkerConsentEnforcement:
    """Workers must check biometric consent before processing any face job."""

    @pytest.mark.asyncio
    async def test_worker_skips_job_without_consent(self, workspace_id, make_job):
        """Worker skips job when workspace consent status is NOT_SET."""
        from app.services.face_detection_worker import FaceDetectionWorker

        worker = FaceDetectionWorker()
        job = make_job(consent_status=BiometricConsentStatus.NOT_GRANTED)

        # Mock the consent service to return NOT_SET
        mock_consent_svc = AsyncMock()
        mock_consent_svc.check_consent_status.return_value = BiometricConsentStatus.NOT_GRANTED

        with patch(
            "app.services.face_detection_worker.get_biometric_consent_service",
            return_value=mock_consent_svc,
        ):
            # _process_job should skip — not raise, not proceed to detection
            with patch.object(worker, "_get_photo", new_callable=AsyncMock) as mock_get_photo, \
                 patch.object(worker, "_update_job_status", new_callable=AsyncMock) as mock_update:
                await worker._process_job(job)

                # Photo fetch should NOT be called — skipped before reaching it
                mock_get_photo.assert_not_called()

    @pytest.mark.asyncio
    async def test_worker_skips_job_withdrawn_consent(self, workspace_id, make_job):
        """Worker skips job when workspace consent is WITHDRAWN."""
        from app.services.face_detection_worker import FaceDetectionWorker

        worker = FaceDetectionWorker()
        job = make_job(consent_status=BiometricConsentStatus.WITHDRAWN)

        mock_consent_svc = AsyncMock()
        mock_consent_svc.check_consent_status.return_value = BiometricConsentStatus.WITHDRAWN

        with patch(
            "app.services.face_detection_worker.get_biometric_consent_service",
            return_value=mock_consent_svc,
        ):
            with patch.object(worker, "_get_photo", new_callable=AsyncMock) as mock_get_photo:
                await worker._process_job(job)
                mock_get_photo.assert_not_called()

    @pytest.mark.asyncio
    async def test_worker_skips_job_pending_deletion(self, workspace_id, make_job):
        """Worker skips job when workspace consent is PENDING_DELETION."""
        from app.services.face_detection_worker import FaceDetectionWorker

        worker = FaceDetectionWorker()
        job = make_job(consent_status=BiometricConsentStatus.PENDING_DELETION)

        mock_consent_svc = AsyncMock()
        mock_consent_svc.check_consent_status.return_value = BiometricConsentStatus.PENDING_DELETION

        with patch(
            "app.services.face_detection_worker.get_biometric_consent_service",
            return_value=mock_consent_svc,
        ):
            with patch.object(worker, "_get_photo", new_callable=AsyncMock) as mock_get_photo:
                await worker._process_job(job)
                mock_get_photo.assert_not_called()

    @pytest.mark.asyncio
    async def test_worker_processes_job_with_granted_consent(self, workspace_id, make_job):
        """Worker proceeds normally when consent is GRANTED."""
        from app.services.face_detection_worker import FaceDetectionWorker

        worker = FaceDetectionWorker()
        job = make_job(consent_status=BiometricConsentStatus.GRANTED)

        mock_consent_svc = AsyncMock()
        mock_consent_svc.check_consent_status.return_value = BiometricConsentStatus.GRANTED

        with patch(
            "app.services.face_detection_worker.get_biometric_consent_service",
            return_value=mock_consent_svc,
        ):
            with patch.object(worker, "_get_photo", new_callable=AsyncMock, return_value=None) as mock_get_photo, \
                 patch.object(worker, "_update_job_status", new_callable=AsyncMock):
                await worker._process_job(job)
                # Should reach photo fetch (consent passed)
                mock_get_photo.assert_called_once()


# =============================================================================
# TASK 1: CASCADE DELETE
# =============================================================================


class TestCascadeDelete:
    """Consent withdrawal with cascade_delete triggers complete data removal."""

    @staticmethod
    def _make_pool_mock(conn_mock):
        """Create a properly structured asyncpg pool mock.

        asyncpg's pool.acquire() returns an async context manager (not a
        coroutine). We use MagicMock for the pool so that .acquire() is
        synchronous, returning an object with __aenter__/__aexit__.
        """
        cm = AsyncMock()
        cm.__aenter__ = AsyncMock(return_value=conn_mock)
        cm.__aexit__ = AsyncMock(return_value=False)
        mock_pool = MagicMock()
        mock_pool.acquire.return_value = cm
        return mock_pool

    def _make_withdraw_row(self, workspace_id, user_id, status_value):
        """Create a fake RETURNING * row for withdraw_consent."""
        now = datetime.now(timezone.utc)
        return {
            "id": uuid4(),
            "workspace_id": workspace_id,
            "face_detection_enabled": False,
            "consent_status": status_value,
            "consented_by": user_id,
            "consented_at": now,
            "consent_ip_address": "127.0.0.1",
            "consent_user_agent": None,
            "consent_policy_version": "1.0",
            "withdrawn_by": user_id,
            "withdrawn_at": now,
            "withdrawal_ip_address": "127.0.0.1",
            "withdrawal_reason": "Test withdrawal",
            "public_face_search_enabled": False,
            "auto_clustering_enabled": True,
            "ai_processing_consent": False,
            "created_at": now,
            "updated_at": now,
        }

    @pytest.mark.asyncio
    async def test_cascade_delete_creates_retention_job(self, workspace_id, user_id):
        """withdraw_consent with cascade_delete=True creates a retention job."""
        from app.services.biometric_consent_service import BiometricConsentService
        from app.models.workspace_biometric_settings import BiometricConsentWithdraw

        service = BiometricConsentService()
        withdraw_data = BiometricConsentWithdraw(
            ip_address="127.0.0.1",
            reason="Test withdrawal",
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow.side_effect = [
            {"consent_status": BiometricConsentStatus.GRANTED.value},
            self._make_withdraw_row(workspace_id, user_id, BiometricConsentStatus.PENDING_DELETION.value),
        ]
        mock_pool = self._make_pool_mock(mock_conn)

        with patch("app.services.biometric_consent_service.get_postgres_pool", AsyncMock(return_value=mock_pool)), \
             patch.object(service, "_invalidate_consent_cache", new_callable=AsyncMock), \
             patch.object(service, "_create_consent_withdrawal_job", new_callable=AsyncMock) as mock_create_job:
            await service.withdraw_consent(
                workspace_id=workspace_id,
                user_id=user_id,
                withdraw_data=withdraw_data,
                cascade_delete=True,
            )
            mock_create_job.assert_called_once_with(workspace_id, user_id)

    @pytest.mark.asyncio
    async def test_cascade_delete_sets_pending_deletion_status(self, workspace_id, user_id):
        """withdraw_consent with cascade_delete=True sets status to PENDING_DELETION."""
        from app.services.biometric_consent_service import BiometricConsentService
        from app.models.workspace_biometric_settings import BiometricConsentWithdraw

        service = BiometricConsentService()
        withdraw_data = BiometricConsentWithdraw(
            ip_address="127.0.0.1",
            reason="Test",
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow.side_effect = [
            {"consent_status": BiometricConsentStatus.GRANTED.value},
            self._make_withdraw_row(workspace_id, user_id, BiometricConsentStatus.PENDING_DELETION.value),
        ]
        mock_pool = self._make_pool_mock(mock_conn)

        with patch("app.services.biometric_consent_service.get_postgres_pool", AsyncMock(return_value=mock_pool)), \
             patch.object(service, "_invalidate_consent_cache", new_callable=AsyncMock), \
             patch.object(service, "_create_consent_withdrawal_job", new_callable=AsyncMock):
            result = await service.withdraw_consent(
                workspace_id=workspace_id,
                user_id=user_id,
                withdraw_data=withdraw_data,
                cascade_delete=True,
            )
            assert result.consent_status == BiometricConsentStatus.PENDING_DELETION


# =============================================================================
# TASK 1: AUDIT TRAIL
# =============================================================================


class TestAuditTrail:
    """Consent audit trail records withdrawn_by_user_id."""

    @pytest.mark.asyncio
    async def test_audit_trail_records_withdrawn_by(self, workspace_id, user_id):
        """Withdrawal records the user_id who withdrew consent."""
        from app.services.biometric_consent_service import BiometricConsentService
        from app.models.workspace_biometric_settings import BiometricConsentWithdraw

        service = BiometricConsentService()
        withdraw_data = BiometricConsentWithdraw(
            ip_address="10.0.0.1",
            reason="GDPR request",
        )

        mock_conn = AsyncMock()
        now = datetime.now(timezone.utc)
        mock_conn.fetchrow.side_effect = [
            {"consent_status": BiometricConsentStatus.GRANTED.value},
            {
                "id": uuid4(),
                "workspace_id": workspace_id,
                "face_detection_enabled": False,
                "consent_status": BiometricConsentStatus.WITHDRAWN.value,
                "consented_by": user_id,
                "consented_at": now,
                "consent_ip_address": "10.0.0.1",
                "consent_user_agent": None,
                "consent_policy_version": "1.0",
                "withdrawn_by": user_id,
                "withdrawn_at": now,
                "withdrawal_ip_address": "10.0.0.1",
                "withdrawal_reason": "GDPR request",
                "public_face_search_enabled": False,
                "auto_clustering_enabled": True,
                "ai_processing_consent": False,
                "created_at": now,
                "updated_at": now,
            },
        ]

        # Build proper async context manager mock
        cm = AsyncMock()
        cm.__aenter__ = AsyncMock(return_value=mock_conn)
        cm.__aexit__ = AsyncMock(return_value=False)
        mock_pool = MagicMock()
        mock_pool.acquire.return_value = cm

        with patch("app.services.biometric_consent_service.get_postgres_pool", AsyncMock(return_value=mock_pool)), \
             patch.object(service, "_invalidate_consent_cache", new_callable=AsyncMock):
            result = await service.withdraw_consent(
                workspace_id=workspace_id,
                user_id=user_id,
                withdraw_data=withdraw_data,
                cascade_delete=False,
            )
            assert result.withdrawn_by == user_id
            assert result.withdrawal_reason == "GDPR request"
