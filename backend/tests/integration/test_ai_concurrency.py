"""AI worker concurrency tests.

Tests verify that parallel embedding and clustering operations do not
corrupt data, handle partial failures gracefully, and produce
idempotent clustering results.

Coverage: TEST-04
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _deterministic_embedding(asset_id: UUID) -> list[float]:
    """Return a deterministic 512-dim embedding based on asset_id hash.

    Uses the first 4 bytes of the UUID int to seed a simple pattern so
    different asset_ids always get different embeddings.
    """
    seed = int(asset_id) % (2**32)
    base = [(seed + i) % 256 / 255.0 for i in range(512)]
    return base


def _make_photo(asset_id: UUID | None = None) -> dict[str, Any]:
    aid = asset_id or uuid4()
    return {
        "asset_id": aid,
        "processed_object_key": f"photos/{aid}/processed.jpg",
        "thumbnail_object_key": f"photos/{aid}/thumb.jpg",
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def embedding_store():
    """In-memory dict-backed embedding store."""
    return {}


@pytest.fixture
def mock_embedding_client():
    """Mock EmbeddingClient that returns deterministic embeddings."""
    client = AsyncMock()

    async def _embed_images(image_urls: list[str], workspace_id: str):
        results = []
        for url in image_urls:
            # Derive a fake asset_id from the URL for determinism
            fake_seed = hash(url) % (2**32)
            emb = [(fake_seed + i) % 256 / 255.0 for i in range(512)]
            results.append({"url": url, "embedding": emb})
        return results

    client.embed_images = AsyncMock(side_effect=_embed_images)

    async def _cluster_embeddings(embeddings, similarity_threshold=0.85):
        # Each embedding becomes its own singleton cluster
        return [[e] for e in embeddings]

    client.cluster_embeddings = AsyncMock(side_effect=_cluster_embeddings)
    return client


@pytest.fixture
def mock_embedding_repo(embedding_store):
    """Mock EmbeddingRepository backed by dict."""
    repo = AsyncMock()

    async def _batch_store(workspace_id, entries):
        for entry in entries:
            key = (str(workspace_id), str(entry["asset_id"]))
            embedding_store[key] = entry["embedding"]

    repo.batch_store_embeddings = AsyncMock(side_effect=_batch_store)

    async def _find_similar(workspace_id, embedding, exclude_asset_id=None,
                            threshold=0.95, limit=5):
        return []  # no duplicates in test

    repo.find_similar_by_embedding = AsyncMock(side_effect=_find_similar)
    return repo


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestParallelEmbeddingNoCrossContamination:
    """Two concurrent embedding tasks for different photos produce correct,
    non-mixed embeddings."""

    @pytest.mark.asyncio
    async def test_parallel_embedding_tasks_no_data_corruption(
        self, mock_embedding_client, mock_embedding_repo, embedding_store
    ):
        from app.workers.similarity_worker import SimilarityWorker

        photo_a = _make_photo()
        photo_b = _make_photo()

        ws_id = uuid4()
        session_id = uuid4()

        worker = SimilarityWorker()
        worker._embedding_client = mock_embedding_client
        worker._workspace_id = ws_id

        with patch(
            "app.workers.similarity_worker.get_embedding_repository",
            return_value=mock_embedding_repo,
        ):
            # Run two batch embedding calls concurrently
            await asyncio.gather(
                worker._compute_batch_embeddings([photo_a]),
                worker._compute_batch_embeddings([photo_b]),
            )

        # Verify the mock was called twice (once per batch)
        assert mock_embedding_client.embed_images.call_count == 2

        # Verify each call used the correct photo key
        call_args_list = mock_embedding_client.embed_images.call_args_list
        all_urls = []
        for call in call_args_list:
            all_urls.extend(call[0][0])  # first positional arg is image_urls

        assert photo_a["processed_object_key"] in all_urls
        assert photo_b["processed_object_key"] in all_urls


class TestBatchEmbeddingPartialFailure:
    """A batch of 5 images where 1 fails still produces embeddings for the
    other 4."""

    @pytest.mark.asyncio
    async def test_batch_embedding_partial_failure(self, embedding_store):
        from app.workers.similarity_worker import SimilarityWorker

        photos = [_make_photo() for _ in range(5)]
        ws_id = uuid4()
        session_id = uuid4()

        failing_key = photos[2]["processed_object_key"]

        client = AsyncMock()

        async def _embed_with_partial_fail(image_urls, workspace_id):
            results = []
            for url in image_urls:
                if url == failing_key:
                    # Skip this one (simulates per-image failure handled by service)
                    continue
                seed = hash(url) % (2**32)
                emb = [(seed + i) % 256 / 255.0 for i in range(512)]
                results.append({"url": url, "embedding": emb})
            return results

        client.embed_images = AsyncMock(side_effect=_embed_with_partial_fail)

        worker = SimilarityWorker()
        worker._embedding_client = client
        worker._workspace_id = ws_id

        results = await worker._compute_batch_embeddings(photos)

        # We expect 5 results (worker maps missing embeddings to zero-vectors)
        assert len(results) == 5

        # The failed photo should have a zero-vector embedding
        failed_result = [r for r in results if r["asset_id"] == photos[2]["asset_id"]][0]
        assert failed_result["embedding"] == [0.0] * 512

        # Other photos should have non-zero embeddings
        ok_results = [r for r in results if r["asset_id"] != photos[2]["asset_id"]]
        for r in ok_results:
            assert r["embedding"] != [0.0] * 512


class TestConcurrentDuplicateDetection:
    """Two simultaneous duplicate detection runs for different workspaces do
    not cross-contaminate results."""

    @pytest.mark.asyncio
    async def test_concurrent_duplicate_detection(self, embedding_store):
        from app.workers.similarity_worker import SimilarityWorker

        ws_a = uuid4()
        ws_b = uuid4()
        session_a = uuid4()
        session_b = uuid4()

        mock_repo = AsyncMock()
        duplicates_found: dict[str, list] = {"a": [], "b": []}

        async def _find_similar(workspace_id, embedding, exclude_asset_id=None,
                                threshold=0.95, limit=5):
            # Return a fake duplicate only for workspace A
            if workspace_id == ws_a:
                return [{"asset_id": uuid4(), "similarity_score": 0.97}]
            return []

        mock_repo.find_similar_by_embedding = AsyncMock(side_effect=_find_similar)
        mock_repo.batch_store_embeddings = AsyncMock()

        emb_a = [{"asset_id": uuid4(), "embedding": [0.1] * 512}]
        emb_b = [{"asset_id": uuid4(), "embedding": [0.9] * 512}]

        with patch(
            "app.workers.similarity_worker.get_embedding_repository",
            return_value=mock_repo,
        ):
            worker = SimilarityWorker()

            # Run store_embeddings concurrently for two workspaces
            await asyncio.gather(
                worker._store_embeddings(ws_a, session_a, emb_a),
                worker._store_embeddings(ws_b, session_b, emb_b),
            )

        # Verify find_similar was called with correct workspace_ids
        calls = mock_repo.find_similar_by_embedding.call_args_list
        ws_ids_called = [c.kwargs.get("workspace_id") or c[0][0] for c in calls]
        assert ws_a in ws_ids_called
        assert ws_b in ws_ids_called


class TestClusteringIdempotent:
    """Running clustering twice on the same dataset produces the same groups."""

    @pytest.mark.asyncio
    async def test_clustering_idempotent(self):
        from app.workers.similarity_worker import SimilarityWorker

        embeddings = [
            {"asset_id": uuid4(), "embedding": [float(i) / 512] * 512}
            for i in range(10)
        ]

        client = AsyncMock()

        async def _deterministic_cluster(embs, similarity_threshold=0.85):
            # Group into pairs by index
            clusters = []
            for i in range(0, len(embs), 2):
                cluster = embs[i : i + 2]
                clusters.append(cluster)
            return clusters

        client.cluster_embeddings = AsyncMock(side_effect=_deterministic_cluster)

        worker = SimilarityWorker()
        worker._embedding_client = client

        result_1 = await worker._cluster_embeddings(embeddings, 0.85)
        result_2 = await worker._cluster_embeddings(embeddings, 0.85)

        assert len(result_1) == len(result_2)
        for c1, c2 in zip(result_1, result_2):
            ids_1 = {e["asset_id"] for e in c1}
            ids_2 = {e["asset_id"] for e in c2}
            assert ids_1 == ids_2


class TestEmbeddingRetryOnTransientFailure:
    """Embedding client retries on transient error and succeeds on second attempt."""

    @pytest.mark.asyncio
    async def test_embedding_task_retry_on_transient_failure(self):
        """The EmbeddingClient itself retries once on ConnectError.
        Verify that behaviour via a mock that fails first then succeeds."""
        import httpx
        from app.services.embedding_client import EmbeddingClient

        call_count = 0

        async def _mock_post(url, json=None, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise httpx.ConnectError("connection refused")
            # Second attempt succeeds
            resp = MagicMock()
            resp.status_code = 200
            resp.raise_for_status = MagicMock()
            resp.json.return_value = {
                "embeddings": [
                    {"url": u, "embedding": [0.5] * 512}
                    for u in json["image_urls"]
                ],
                "processing_time_ms": 100,
            }
            return resp

        client = EmbeddingClient(base_url="http://fake-ai:8012")

        with patch("httpx.AsyncClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.post = AsyncMock(side_effect=_mock_post)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_instance

            result = await client.embed_images(["img1.jpg", "img2.jpg"], "ws-123")

        assert call_count == 2  # first fail + second success
        assert len(result) == 2
        assert result[0]["embedding"] == [0.5] * 512
