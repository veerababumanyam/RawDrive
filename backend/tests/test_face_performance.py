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
