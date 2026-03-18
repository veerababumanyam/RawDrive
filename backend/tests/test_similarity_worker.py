"""Tests for similarity_worker with EmbeddingClient HTTP integration.

Verifies that:
- EmbeddingClient sends POST to ai-processing-service
- EmbeddingClient returns 512-dim float arrays
- similarity_worker uses EmbeddingClient (not local torch/CLIP)
- similarity_worker passes object_keys from photo dicts
- _ensure_clip_model creates EmbeddingClient (no local torch)
- Duplicate detection calls find_similar_by_embedding

Feature: 06-ai-ml-pipeline
"""

from __future__ import annotations

import asyncio
import inspect
import importlib
import textwrap
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def workspace_id():
    return uuid4()


@pytest.fixture
def session_id():
    return uuid4()


@pytest.fixture
def sample_photos():
    """Sample photo dicts as returned by _get_gallery_photos."""
    return [
        {
            "asset_id": uuid4(),
            "processed_object_key": "ws/photos/img1_processed.jpg",
            "thumbnail_object_key": "ws/photos/img1_thumb.jpg",
        },
        {
            "asset_id": uuid4(),
            "processed_object_key": "ws/photos/img2_processed.jpg",
            "thumbnail_object_key": "ws/photos/img2_thumb.jpg",
        },
    ]


@pytest.fixture
def fake_embedding_response(sample_photos):
    """Fake response from EmbeddingClient.embed_images."""
    return [
        {
            "url": photo["processed_object_key"],
            "embedding": [float(i) * 0.01 for i in range(512)],
        }
        for photo in sample_photos
    ]


# ---------------------------------------------------------------------------
# Test 1: EmbeddingClient sends POST to ai-processing-service
# ---------------------------------------------------------------------------

class TestEmbeddingClient:
    """Tests for the EmbeddingClient HTTP client."""

    @pytest.mark.asyncio
    async def test_embed_images_sends_post(self):
        """EmbeddingClient.embed_images sends POST to /api/v1/embed/images."""
        from app.services.embedding_client import EmbeddingClient

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "embeddings": [
                {"url": "key1.jpg", "embedding": [0.1] * 512, "dimensions": 512},
            ],
            "processing_time_ms": 100.0,
        }
        mock_response.raise_for_status = MagicMock()

        with patch("app.services.embedding_client.httpx.AsyncClient") as MockClient:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client_instance

            client = EmbeddingClient(base_url="http://test-ai:8012")
            result = await client.embed_images(["key1.jpg"], "ws-123")

            mock_client_instance.post.assert_called_once()
            call_args = mock_client_instance.post.call_args
            assert "/api/v1/embed/images" in call_args[0][0] or "/api/v1/embed/images" in str(call_args)

    @pytest.mark.asyncio
    async def test_embed_images_returns_512_dim(self):
        """EmbeddingClient returns list of 512-dim float arrays."""
        from app.services.embedding_client import EmbeddingClient

        fake_emb = [0.5] * 512
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "embeddings": [
                {"url": "key1.jpg", "embedding": fake_emb, "dimensions": 512},
            ],
            "processing_time_ms": 50.0,
        }
        mock_response.raise_for_status = MagicMock()

        with patch("app.services.embedding_client.httpx.AsyncClient") as MockClient:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client_instance

            client = EmbeddingClient(base_url="http://test-ai:8012")
            result = await client.embed_images(["key1.jpg"], "ws-123")

            assert len(result) == 1
            assert len(result[0]["embedding"]) == 512
            assert all(isinstance(v, float) for v in result[0]["embedding"])


# ---------------------------------------------------------------------------
# Test 3-5: similarity_worker uses EmbeddingClient, not local model
# ---------------------------------------------------------------------------

class TestSimilarityWorkerEmbeddingClient:
    """Tests that similarity_worker uses HTTP-based EmbeddingClient."""

    @pytest.mark.asyncio
    async def test_compute_batch_embeddings_calls_embedding_client(
        self, sample_photos, workspace_id, fake_embedding_response
    ):
        """_compute_batch_embeddings calls EmbeddingClient, not local model."""
        from app.workers.similarity_worker import SimilarityWorker

        worker = SimilarityWorker()

        mock_client = AsyncMock()
        mock_client.embed_images.return_value = fake_embedding_response
        worker._embedding_client = mock_client
        worker._workspace_id = workspace_id

        result = await worker._compute_batch_embeddings(sample_photos)

        mock_client.embed_images.assert_called_once()
        assert len(result) == len(sample_photos)

    @pytest.mark.asyncio
    async def test_compute_batch_embeddings_passes_object_keys(
        self, sample_photos, workspace_id, fake_embedding_response
    ):
        """_compute_batch_embeddings passes object_key from photo dicts."""
        from app.workers.similarity_worker import SimilarityWorker

        worker = SimilarityWorker()

        mock_client = AsyncMock()
        mock_client.embed_images.return_value = fake_embedding_response
        worker._embedding_client = mock_client
        worker._workspace_id = workspace_id

        await worker._compute_batch_embeddings(sample_photos)

        call_args = mock_client.embed_images.call_args
        image_urls = call_args[0][0] if call_args[0] else call_args[1].get("image_urls", [])

        # Should pass processed_object_key or thumbnail_object_key
        for photo in sample_photos:
            assert (
                photo["processed_object_key"] in image_urls
                or photo["thumbnail_object_key"] in image_urls
            )

    def test_ensure_clip_model_creates_embedding_client(self):
        """_ensure_clip_model creates EmbeddingClient (no local torch import)."""
        from app.workers.similarity_worker import SimilarityWorker

        worker = SimilarityWorker()

        with patch("app.workers.similarity_worker.get_embedding_client") as mock_get:
            mock_get.return_value = MagicMock()
            asyncio.get_event_loop().run_until_complete(worker._ensure_clip_model())

            mock_get.assert_called_once()
            assert worker._embedding_client is not None

    def test_no_torch_import_in_similarity_worker(self):
        """similarity_worker.py must not import torch."""
        import app.workers.similarity_worker as mod

        source = inspect.getsource(mod)
        assert "import torch" not in source, (
            "similarity_worker.py should not import torch - "
            "ML inference is offloaded to ai-processing-service"
        )


# ---------------------------------------------------------------------------
# Test 6: Duplicate detection via find_similar_by_embedding
# ---------------------------------------------------------------------------

class TestDuplicateDetection:
    """Tests for embedding-based duplicate detection."""

    @pytest.mark.asyncio
    async def test_store_embeddings_calls_find_similar(
        self, workspace_id, session_id
    ):
        """After storing embeddings, find_similar_by_embedding is called per asset."""
        from app.workers.similarity_worker import SimilarityWorker

        worker = SimilarityWorker()

        embeddings = [
            {"asset_id": uuid4(), "embedding": [0.1] * 512},
            {"asset_id": uuid4(), "embedding": [0.2] * 512},
        ]

        mock_emb_repo = AsyncMock()
        mock_emb_repo.batch_store_embeddings.return_value = 2
        mock_emb_repo.find_similar_by_embedding.return_value = []

        with patch(
            "app.workers.similarity_worker.get_embedding_repository",
            return_value=mock_emb_repo,
        ):
            await worker._store_embeddings(workspace_id, session_id, embeddings)

            # find_similar_by_embedding should be called for each embedding
            assert mock_emb_repo.find_similar_by_embedding.call_count == len(embeddings)
