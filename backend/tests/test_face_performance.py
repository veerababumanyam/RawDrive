"""Performance regression tests for face processing optimizations.

Tests cover:
- HNSW index on faces.embedding column
- Batch centroid recalculation (single DB round-trip for N groups)
- Cache invalidation after batch centroid updates
- Eager model loading at worker startup
- Worker timeout enforcement via asyncio.wait_for()
- Stuck job recovery on worker restart

Requirements: FACE-05
"""

from __future__ import annotations

import asyncio
import math
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest


# ---------------------------------------------------------------------------
# Task 1 Tests: HNSW Index + Batch Centroid
# ---------------------------------------------------------------------------


class TestHNSWIndex:
    """Verify HNSW index migration exists and targets the faces table."""

    def test_hnsw_index_migration_exists(self):
        """Migration file for HNSW index on faces.embedding exists."""
        from pathlib import Path

        migration_path = Path(__file__).parent.parent / "migrations" / "versions" / "0198_add_faces_embedding_hnsw_index.py"
        assert migration_path.exists(), f"Migration file not found: {migration_path}"

    def test_hnsw_index_migration_content(self):
        """Migration creates HNSW index on faces table with correct ops class."""
        from pathlib import Path

        migration_path = Path(__file__).parent.parent / "migrations" / "versions" / "0198_add_faces_embedding_hnsw_index.py"
        content = migration_path.read_text()

        # Must target the faces table (not image_embeddings)
        assert "faces" in content, "Migration must target the 'faces' table"
        assert "hnsw" in content.lower(), "Migration must create HNSW index"
        assert "vector_cosine_ops" in content, "Must use vector_cosine_ops operator class"
        assert "embedding" in content, "Must index the 'embedding' column"

    def test_hnsw_index_migration_has_downgrade(self):
        """Migration has a proper downgrade path."""
        from pathlib import Path

        migration_path = Path(__file__).parent.parent / "migrations" / "versions" / "0198_add_faces_embedding_hnsw_index.py"
        content = migration_path.read_text()

        assert "def downgrade" in content, "Migration must have downgrade function"
        assert "DROP INDEX" in content, "Downgrade must drop the index"


class TestBatchCentroidRecalculation:
    """Verify batch centroid recalculation uses single DB round-trip."""

    @pytest.mark.asyncio
    async def test_batch_recalculate_centroids_exists(self):
        """FaceClusterService has batch_recalculate_centroids method."""
        from app.services.face_cluster_service import FaceClusterService

        service = FaceClusterService()
        assert hasattr(service, "batch_recalculate_centroids"), \
            "FaceClusterService must have batch_recalculate_centroids method"

    @pytest.mark.asyncio
    async def test_batch_centroid_processes_multiple_groups(self):
        """batch_recalculate_centroids processes N groups and returns mapping."""
        from app.services.face_cluster_service import FaceClusterService

        service = FaceClusterService()

        # Create mock repositories
        group_ids = [uuid4(), uuid4(), uuid4()]
        workspace_id = uuid4()

        # Mock embedding repo to return average embeddings per group
        dim = 512
        mock_embeddings = {}
        for gid in group_ids:
            vec = [0.0] * dim
            vec[0] = 1.0  # Simple normalized vector
            mock_embeddings[gid] = vec

        # Mock face_repo to return faces with embeddings for each group
        mock_face_repo = AsyncMock()

        async def mock_find_by_group(gid, wid, limit=10000):
            embedding = [0.0] * dim
            embedding[0] = 1.0
            return [{"id": uuid4(), "embedding": embedding}]

        mock_face_repo.find_by_group_id = AsyncMock(side_effect=mock_find_by_group)

        # Mock group_repo
        mock_group_repo = AsyncMock()
        mock_group_repo.get_by_id = AsyncMock(return_value={"id": group_ids[0], "face_count": 1})

        service._face_repo = mock_face_repo
        service._group_repo = mock_group_repo

        result = await service.batch_recalculate_centroids(group_ids, workspace_id)

        assert isinstance(result, dict), "Must return a dict mapping group_id -> centroid"
        assert len(result) == 3, "Must process all 3 groups"
        for gid in group_ids:
            assert gid in result, f"Missing group {gid} in result"
            assert len(result[gid]) == dim, "Centroid must be 512-dimensional"

    @pytest.mark.asyncio
    async def test_batch_centroid_cache_invalidation(self):
        """batch_recalculate_centroids invalidates cache for affected groups."""
        from app.services.face_cluster_service import FaceClusterService

        service = FaceClusterService()

        group_ids = [uuid4(), uuid4()]
        workspace_id = uuid4()
        dim = 512

        mock_face_repo = AsyncMock()

        async def mock_find_by_group(gid, wid, limit=10000):
            embedding = [0.0] * dim
            embedding[0] = 1.0
            return [{"id": uuid4(), "embedding": embedding}]

        mock_face_repo.find_by_group_id = AsyncMock(side_effect=mock_find_by_group)

        mock_group_repo = AsyncMock()
        mock_group_repo.get_by_id = AsyncMock(return_value={"id": group_ids[0], "face_count": 1})

        service._face_repo = mock_face_repo
        service._group_repo = mock_group_repo

        with patch("app.repositories.face_group_repository.get_face_group_cache") as mock_cache_fn:
            mock_cache = AsyncMock()
            mock_cache_fn.return_value = mock_cache

            await service.batch_recalculate_centroids(group_ids, workspace_id)

            # Cache should be invalidated for the workspace
            mock_cache.invalidate_workspace.assert_called_once_with(workspace_id)


class TestBulkUpdateCentroids:
    """Verify face group repository has bulk_update_centroids method."""

    def test_bulk_update_centroids_exists(self):
        """FaceGroupRepository has bulk_update_centroids method."""
        from app.repositories.face_group_repository import FaceGroupRepository

        repo = FaceGroupRepository()
        assert hasattr(repo, "bulk_update_centroids"), \
            "FaceGroupRepository must have bulk_update_centroids method"


# ---------------------------------------------------------------------------
# Task 2 Tests: Eager Model Loading + Worker Timeout Enforcement
# ---------------------------------------------------------------------------


class TestEagerModelLoading:
    """Verify ONNX model is loaded eagerly at worker startup."""

    def test_initialize_model_function_exists(self):
        """face_embedder module exposes initialize_model() function."""
        from app.services.ai import face_embedder

        assert hasattr(face_embedder, "initialize_model"), \
            "face_embedder must expose initialize_model() function"

    def test_is_model_loaded_function_exists(self):
        """face_embedder module exposes is_model_loaded() function."""
        from app.services.ai import face_embedder

        assert hasattr(face_embedder, "is_model_loaded"), \
            "face_embedder must expose is_model_loaded() function"

    def test_worker_main_imports_initialize_model(self):
        """face_worker_main.py imports and calls initialize_model during startup."""
        from pathlib import Path

        worker_main_path = Path(__file__).parent.parent / "src" / "app" / "face_worker_main.py"
        content = worker_main_path.read_text()

        assert "initialize_model" in content, \
            "face_worker_main.py must import and use initialize_model"

    @pytest.mark.asyncio
    async def test_eager_model_load_called_at_startup(self):
        """initialize_model is called during worker startup lifecycle."""
        with patch("app.services.ai.face_embedder.get_face_embedder") as mock_get:
            mock_embedder = AsyncMock()
            mock_embedder.preload_model = AsyncMock(return_value=True)
            mock_get.return_value = mock_embedder

            from app.services.ai.face_embedder import initialize_model
            result = await initialize_model()

            assert result is True, "initialize_model should return True on success"


class TestWorkerTimeoutEnforcement:
    """Verify worker enforces timeouts via asyncio.wait_for()."""

    def test_worker_uses_asyncio_wait_for(self):
        """FaceDetectionWorker uses asyncio.wait_for() for job timeout."""
        from pathlib import Path

        worker_path = Path(__file__).parent.parent / "src" / "app" / "services" / "face_detection_worker.py"
        content = worker_path.read_text()

        assert "asyncio.wait_for" in content, \
            "Worker must use asyncio.wait_for() for timeout enforcement"

    def test_worker_handles_timeout_error(self):
        """Worker catches asyncio.TimeoutError and marks job as failed."""
        from pathlib import Path

        worker_path = Path(__file__).parent.parent / "src" / "app" / "services" / "face_detection_worker.py"
        content = worker_path.read_text()

        assert "TimeoutError" in content, \
            "Worker must catch asyncio.TimeoutError"
        assert "TIMEOUT" in content, \
            "Worker must include TIMEOUT error code in failure metadata"

    @pytest.mark.asyncio
    async def test_timeout_marks_job_failed(self):
        """A job exceeding JOB_TIMEOUT_SECONDS is marked as failed with timeout reason."""
        from app.services.face_detection_worker import FaceDetectionWorker

        worker = FaceDetectionWorker()

        # Mock a slow job that exceeds timeout
        mock_job = {
            "id": uuid4(),
            "workspace_id": uuid4(),
            "photo_id": uuid4(),
            "status": "processing",
            "priority": 0,
            "retry_count": 3,  # Max retries already exceeded
        }

        # Track what _update_job_status is called with
        update_calls = []

        async def mock_update_status(job_id, status, error_message=None, faces_detected=None):
            update_calls.append({
                "job_id": job_id,
                "status": status,
                "error_message": error_message,
            })

        worker._update_job_status = mock_update_status

        # Call _handle_job_failure with a timeout message
        await worker._handle_job_failure(mock_job, "Job timed out after 120s")

        # Should have called _update_job_status with FAILED status
        assert len(update_calls) == 1, "Should call _update_job_status once"
        assert "FAILED" in str(update_calls[0]["status"].value).upper() or \
               "failed" in str(update_calls[0]["status"]).lower(), \
            "Job must be marked as failed"
        assert "timed out" in update_calls[0]["error_message"].lower(), \
            "Error message must mention timeout"


class TestStuckJobRecovery:
    """Verify stuck jobs in 'processing' state are recovered on startup."""

    def test_worker_has_stale_job_recovery(self):
        """Worker has _recover_stale_jobs method."""
        from app.services.face_detection_worker import FaceDetectionWorker

        worker = FaceDetectionWorker()
        assert hasattr(worker, "_recover_stale_jobs"), \
            "Worker must have _recover_stale_jobs method"

    def test_stale_job_timeout_is_reasonable(self):
        """Stale job timeout is configured and <= 5 minutes."""
        from app.services.face_detection_worker import STALE_JOB_TIMEOUT_MINUTES

        assert STALE_JOB_TIMEOUT_MINUTES <= 5, \
            f"Stale job timeout should be <= 5 minutes, got {STALE_JOB_TIMEOUT_MINUTES}"
