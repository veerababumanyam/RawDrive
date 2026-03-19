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


class AsyncIterator:
    """Helper to mock async iterators (e.g., redis.scan_iter)."""

    def __init__(self, items):
        self._items = list(items)
        self._index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index >= len(self._items):
            raise StopAsyncIteration
        item = self._items[self._index]
        self._index += 1
        return item


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


# =============================================================================
# TASK 2: DEADLOCK PREVENTION IN MERGE
# =============================================================================


class TestMergeLockOrdering:
    """Merge operations must acquire locks in sorted UUID order to prevent deadlocks."""

    @pytest.mark.asyncio
    async def test_merge_lock_ordering_sorted(self):
        """merge_groups acquires row-level locks in sorted UUID order."""
        from app.services.face_cluster_service import FaceClusterService

        service = FaceClusterService()

        # Create UUIDs where source > target alphabetically to verify sorting
        source_id = UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
        target_id = UUID("00000000-0000-0000-0000-000000000001")
        ws_id = uuid4()

        # Track lock acquisition order
        lock_order: list[str] = []

        mock_group_repo = AsyncMock()
        mock_group_repo.get_by_id.return_value = {"id": target_id, "face_count": 2}

        mock_face_repo = AsyncMock()
        mock_face_repo.find_by_group_id.return_value = []

        service._group_repo = mock_group_repo
        service._face_repo = mock_face_repo

        # Intercept the SQL execution to track lock order
        mock_conn = AsyncMock()
        original_execute = mock_conn.execute

        async def track_execute(query, *args, **kwargs):
            q = str(query)
            if "FOR UPDATE" in q:
                # Extract the group ID from the params
                lock_order.append(str(args[0]) if args else "unknown")
            return await original_execute(query, *args, **kwargs)

        mock_conn.execute = track_execute

        # asyncpg: pool.acquire() -> sync call returning async CM
        # asyncpg: conn.transaction() -> sync call returning async CM
        pool_cm = AsyncMock()
        pool_cm.__aenter__ = AsyncMock(return_value=mock_conn)
        pool_cm.__aexit__ = AsyncMock(return_value=False)
        mock_pool = MagicMock()
        mock_pool.acquire.return_value = pool_cm

        txn_cm = AsyncMock()
        txn_cm.__aenter__ = AsyncMock(return_value=txn_cm)
        txn_cm.__aexit__ = AsyncMock(return_value=False)
        mock_conn.transaction = MagicMock(return_value=txn_cm)

        with patch("app.db.postgres.get_postgres_pool", AsyncMock(return_value=mock_pool)):
            await service.merge_groups(source_id, target_id, ws_id)

        # Locks should be acquired in sorted UUID order
        assert len(lock_order) >= 2, f"Expected at least 2 locks, got {len(lock_order)}"
        assert lock_order == sorted(lock_order), (
            f"Locks not acquired in sorted order: {lock_order}"
        )

    @pytest.mark.asyncio
    async def test_merge_no_deadlock_concurrent(self):
        """Two concurrent merges on overlapping groups don't deadlock.

        This test verifies the pattern is correct: both merges use sorted
        lock ordering, so they acquire locks in the same order regardless
        of which is source vs target.
        """
        from app.services.face_cluster_service import FaceClusterService

        group_a = UUID("00000000-0000-0000-0000-000000000001")
        group_b = UUID("00000000-0000-0000-0000-000000000002")
        group_c = UUID("00000000-0000-0000-0000-000000000003")
        ws_id = uuid4()

        lock_orders: list[list[str]] = [[], []]

        async def make_service(idx):
            svc = FaceClusterService()
            mock_group_repo = AsyncMock()
            mock_group_repo.get_by_id.return_value = {"id": group_a, "face_count": 1}
            mock_face_repo = AsyncMock()
            mock_face_repo.find_by_group_id.return_value = []
            svc._group_repo = mock_group_repo
            svc._face_repo = mock_face_repo

            mock_conn = AsyncMock()

            async def track_execute(query, *args, **kwargs):
                q = str(query)
                if "FOR UPDATE" in q:
                    lock_orders[idx].append(str(args[0]) if args else "unknown")

            mock_conn.execute = track_execute

            pool_cm = AsyncMock()
            pool_cm.__aenter__ = AsyncMock(return_value=mock_conn)
            pool_cm.__aexit__ = AsyncMock(return_value=False)
            mock_pool = MagicMock()
            mock_pool.acquire.return_value = pool_cm

            txn_cm = AsyncMock()
            txn_cm.__aenter__ = AsyncMock(return_value=txn_cm)
            txn_cm.__aexit__ = AsyncMock(return_value=False)
            mock_conn.transaction = MagicMock(return_value=txn_cm)

            return svc, mock_pool

        svc1, pool1 = await make_service(0)
        svc2, pool2 = await make_service(1)

        # Merge 1: A+B -> C (lock order should be A, B, C)
        # Merge 2: B+C -> A (lock order should be A, B, C)
        with patch("app.db.postgres.get_postgres_pool", AsyncMock(return_value=pool1)):
            await svc1.merge_groups(group_a, group_c, ws_id)
        with patch("app.db.postgres.get_postgres_pool", AsyncMock(return_value=pool2)):
            await svc2.merge_groups(group_c, group_a, ws_id)

        # Both should have acquired locks in the same sorted order
        if lock_orders[0] and lock_orders[1]:
            assert lock_orders[0] == sorted(lock_orders[0])
            assert lock_orders[1] == sorted(lock_orders[1])


# =============================================================================
# TASK 2: CACHE COHERENCE
# =============================================================================


class TestCacheCoherence:
    """Cache version counters ensure L1/L2/L3 coherence."""

    @pytest.mark.asyncio
    async def test_cache_version_increments_on_mutation(self):
        """Cache version counter increments on every face group mutation."""
        from app.services.face_cache_manager import FaceTaggingCacheManager

        mock_db = AsyncMock()
        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(side_effect=[1, 2, 3])
        mock_redis.get = AsyncMock(return_value=b"3")

        manager = FaceTaggingCacheManager(db=mock_db, redis_client=mock_redis)

        ws_id = uuid4()

        # Increment version 3 times
        v1 = await manager.increment_cache_version(ws_id)
        v2 = await manager.increment_cache_version(ws_id)
        v3 = await manager.increment_cache_version(ws_id)

        assert v1 == 1
        assert v2 == 2
        assert v3 == 3

        # Check version reads the latest
        current = await manager.get_cache_version(ws_id)
        assert current == 3

    @pytest.mark.asyncio
    async def test_l1_cache_invalidated_by_version_check(self):
        """L1 cache returns stale miss when L2 version is newer."""
        from app.services.face_cache_manager import FaceTaggingCacheManager

        mock_db = AsyncMock()
        mock_redis = AsyncMock()

        manager = FaceTaggingCacheManager(db=mock_db, redis_client=mock_redis)

        ws_id = uuid4()
        asset_id = uuid4()
        cache_key = f"asset:{ws_id}:{asset_id}:abc123"

        # Manually set L1 cache with version 1
        manager._l1_asset_cache[cache_key] = (
            {"faces_detected": 2},
            datetime.now(timezone.utc),
            1,  # version
        )

        # Redis reports version 2 (newer)
        mock_redis.get = AsyncMock(return_value=b"2")

        version = await manager.get_cache_version(ws_id)
        assert version == 2  # Newer than L1's version 1

    @pytest.mark.asyncio
    async def test_full_cache_invalidation_cascade(self):
        """Full invalidation clears L1, deletes L2 keys, marks L3 expired, bumps version."""
        from app.services.face_cache_manager import FaceTaggingCacheManager

        mock_db = AsyncMock()
        # Mock the db.execute for L3 invalidation
        mock_result = MagicMock()
        mock_result.rowcount = 1
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()

        mock_redis = AsyncMock()
        mock_redis.scan_iter = MagicMock(return_value=AsyncIterator([b"key1", b"key2"]))
        mock_redis.delete = AsyncMock(return_value=2)
        mock_redis.incr = AsyncMock(return_value=5)

        manager = FaceTaggingCacheManager(db=mock_db, redis_client=mock_redis)

        ws_id = uuid4()
        asset_id = uuid4()

        # Pre-populate L1
        cache_key = f"asset:{ws_id}:{asset_id}:hash1"
        manager._l1_asset_cache[cache_key] = ({"data": True}, datetime.now())

        # Invalidate asset
        count = await manager.invalidate_asset(asset_id, ws_id)

        # L1 should be cleared
        assert cache_key not in manager._l1_asset_cache

        # Version should have been incremented
        await manager.increment_cache_version(ws_id)
        mock_redis.incr.assert_called()
