"""Integration tests for similarity group DB + Redis persistence.

Validates that:
- similarity_worker caches groups after bulk_create_groups
- SmartCurationService reads from cache before DB
- Cache miss triggers DB query and cache population
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from uuid import uuid4


class TestSimilarityWorkerCaching:
    """Test that similarity_worker caches groups after creation."""

    @pytest.mark.asyncio
    async def test_cache_called_after_bulk_create(self):
        """After _group_similar_photos, cache_similarity_groups is called."""
        from app.workers.similarity_worker import SimilarityWorker

        worker = SimilarityWorker()

        session_id = uuid4()
        workspace_id = uuid4()

        session = {
            "session_id": session_id,
            "workspace_id": workspace_id,
            "gallery_id": uuid4(),
            "similarity_threshold": 0.85,
        }

        mock_embeddings = [
            {"asset_id": uuid4(), "embedding": [0.1] * 512},
            {"asset_id": uuid4(), "embedding": [0.2] * 512},
        ]
        mock_clusters = [mock_embeddings]  # One cluster with 2 photos
        mock_quality = {e["asset_id"]: 0.8 for e in mock_embeddings}

        # Mock all dependencies
        mock_group_repo = AsyncMock()
        mock_group_repo.bulk_create_groups.return_value = []

        mock_cache_service = AsyncMock()

        mock_session_service = AsyncMock()

        with patch.object(
            type(worker), "group_repo", new_callable=PropertyMock, return_value=mock_group_repo
        ), patch.object(
            type(worker), "cache_service", new_callable=PropertyMock, return_value=mock_cache_service
        ), patch.object(
            type(worker), "session_service", new_callable=PropertyMock, return_value=mock_session_service
        ), patch.object(
            worker, "_get_session_embeddings", return_value=mock_embeddings
        ), patch.object(
            worker, "_cluster_embeddings", return_value=mock_clusters
        ), patch.object(
            worker, "_get_quality_scores", return_value=mock_quality
        ), patch.object(
            worker, "_transition_to_curation_stage", new_callable=AsyncMock
        ):
            await worker._group_similar_photos(session)

        # Verify bulk_create_groups was called
        mock_group_repo.bulk_create_groups.assert_called_once()

        # Verify cache_similarity_groups was called with same session_id
        mock_cache_service.cache_similarity_groups.assert_called_once()
        cache_call_args = mock_cache_service.cache_similarity_groups.call_args
        assert cache_call_args[0][0] == session_id


class TestSmartCurationServiceCacheRead:
    """Test SmartCurationService cache-first reads."""

    @pytest.mark.asyncio
    async def test_reads_from_cache_before_db(self):
        """SmartCurationService reads from cache before DB."""
        from app.services.smart_curation_service import SmartCurationService

        service = SmartCurationService()

        session_id = uuid4()
        workspace_id = uuid4()

        cached_groups = [
            {
                "best_asset_id": str(uuid4()),
                "avg_similarity": 0.92,
                "members": [{"asset_id": str(uuid4()), "is_best": True}],
            }
        ]

        mock_cache = AsyncMock()
        mock_cache.get_cached_groups.return_value = cached_groups

        mock_repo = AsyncMock()

        service._cache_service = mock_cache
        service._group_repo = mock_repo

        result = await service.get_similarity_groups(workspace_id, session_id)

        assert result == cached_groups
        mock_cache.get_cached_groups.assert_called_once_with(session_id)
        # DB should NOT be queried on cache hit
        mock_repo.list_by_session.assert_not_called()

    @pytest.mark.asyncio
    async def test_cache_miss_triggers_db_and_populates_cache(self):
        """Cache miss triggers DB query and cache population."""
        from app.services.smart_curation_service import SmartCurationService

        service = SmartCurationService()

        session_id = uuid4()
        workspace_id = uuid4()

        db_groups = [
            {
                "group_id": uuid4(),
                "best_asset_id": uuid4(),
                "avg_similarity": 0.90,
                "members": [],
            }
        ]

        mock_cache = AsyncMock()
        mock_cache.get_cached_groups.return_value = None  # Cache miss

        mock_repo = AsyncMock()
        mock_repo.list_by_session.return_value = (db_groups, 1, 0)

        service._cache_service = mock_cache
        service._group_repo = mock_repo

        result = await service.get_similarity_groups(workspace_id, session_id)

        assert result == db_groups
        # DB was queried
        mock_repo.list_by_session.assert_called_once_with(
            workspace_id, session_id, include_members=True
        )
        # Cache was populated after DB read
        mock_cache.cache_similarity_groups.assert_called_once_with(
            session_id, db_groups
        )
