"""Integration tests for similarity_worker DBSCAN clustering delegation.

Verifies that similarity_worker._cluster_embeddings calls the
ai-processing-service /api/v1/clustering/cluster endpoint correctly
and handles the response.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_embedding(asset_id: str, dim: int = 512) -> dict:
    """Create a fake embedding dict."""
    return {
        "asset_id": asset_id,
        "embedding": [0.1] * dim,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSimilarityWorkerClustering:
    """Test that SimilarityWorker delegates clustering to ai-processing-service."""

    @pytest.fixture
    def worker(self):
        """Create a SimilarityWorker with mocked dependencies."""
        with patch("app.workers.similarity_worker.get_curation_session_service"), \
             patch("app.workers.similarity_worker.get_similarity_group_repository"), \
             patch("app.workers.similarity_worker.get_photo_quality_repository"), \
             patch("app.workers.similarity_worker.get_embedding_repository"):
            from app.workers.similarity_worker import SimilarityWorker
            w = SimilarityWorker()
            return w

    @pytest.mark.asyncio
    async def test_cluster_embeddings_calls_embedding_client(self, worker):
        """_cluster_embeddings should delegate to EmbeddingClient.cluster_embeddings."""
        mock_client = AsyncMock()
        mock_client.cluster_embeddings = AsyncMock(return_value=[
            [_make_embedding("a1"), _make_embedding("a2")],
            [_make_embedding("a3")],
        ])
        worker._embedding_client = mock_client

        embeddings = [_make_embedding("a1"), _make_embedding("a2"), _make_embedding("a3")]
        result = await worker._cluster_embeddings(embeddings, 0.85)

        mock_client.cluster_embeddings.assert_awaited_once_with(embeddings, 0.85)
        assert len(result) == 2
        assert len(result[0]) == 2
        assert len(result[1]) == 1

    @pytest.mark.asyncio
    async def test_cluster_embeddings_passes_threshold(self, worker):
        """_cluster_embeddings should forward the similarity_threshold."""
        mock_client = AsyncMock()
        mock_client.cluster_embeddings = AsyncMock(return_value=[[_make_embedding("x")]])
        worker._embedding_client = mock_client

        await worker._cluster_embeddings([_make_embedding("x")], 0.92)

        mock_client.cluster_embeddings.assert_awaited_once_with(
            [_make_embedding("x")], 0.92
        )

    @pytest.mark.asyncio
    async def test_cluster_embeddings_empty_input(self, worker):
        """_cluster_embeddings with empty list should return empty from service."""
        mock_client = AsyncMock()
        mock_client.cluster_embeddings = AsyncMock(return_value=[])
        worker._embedding_client = mock_client

        result = await worker._cluster_embeddings([], 0.85)
        assert result == []

    @pytest.mark.asyncio
    async def test_placeholder_removed(self):
        """Verify the placeholder [[emb] for emb in embeddings] no longer exists."""
        import inspect
        from app.workers.similarity_worker import SimilarityWorker

        source = inspect.getsource(SimilarityWorker._cluster_embeddings)
        assert "[[emb] for emb in embeddings]" not in source
        assert "TODO" not in source


class TestEmbeddingClientCluster:
    """Test that EmbeddingClient.cluster_embeddings sends correct HTTP payload."""

    @pytest.mark.asyncio
    async def test_sends_correct_payload(self):
        """cluster_embeddings should POST to /api/v1/clustering/cluster."""
        from app.services.embedding_client import EmbeddingClient

        client = EmbeddingClient(base_url="http://test-host:8012")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "clusters": [
                [{"asset_id": "a1", "embedding": [0.1] * 512}],
                [{"asset_id": "a2", "embedding": [0.2] * 512}],
            ],
            "num_clusters": 2,
            "num_singletons": 2,
            "processing_time_ms": 5.0,
        }

        embeddings = [
            {"asset_id": "a1", "embedding": [0.1] * 512},
            {"asset_id": "a2", "embedding": [0.2] * 512},
        ]

        with patch("app.services.embedding_client.httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.post = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_ctx)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await client.cluster_embeddings(embeddings, similarity_threshold=0.9)

            mock_ctx.post.assert_awaited_once()
            call_args = mock_ctx.post.call_args
            assert "/api/v1/clustering/cluster" in call_args[0][0]
            payload = call_args[1]["json"]
            assert len(payload["embeddings"]) == 2
            assert payload["similarity_threshold"] == 0.9

        assert len(result) == 2
