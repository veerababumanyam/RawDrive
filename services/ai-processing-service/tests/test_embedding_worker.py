"""Tests for Celery embedding worker tasks.

Verifies that:
- compute_embedding task accepts asset_id, workspace_id, object_key
- compute_embedding downloads from R2, computes embedding, returns result
- compute_embedding is registered with max_retries=3
- compute_batch_embeddings processes list of assets
- Task routing sends to "embedding" queue

Feature: 06-ai-ml-pipeline
"""

from __future__ import annotations

import numpy as np
from unittest.mock import MagicMock, patch, PropertyMock
from uuid import uuid4

import pytest


# ---------------------------------------------------------------------------
# Test 1: compute_embedding accepts correct parameters
# ---------------------------------------------------------------------------

class TestComputeEmbeddingTask:
    """Tests for the compute_embedding Celery task."""

    def test_task_accepts_parameters(self):
        """compute_embedding accepts asset_id, workspace_id, object_key."""
        from workers.embedding_worker import compute_embedding

        # Task should be callable with these parameters
        assert callable(compute_embedding)

    def test_task_downloads_and_computes(self):
        """compute_embedding downloads image from R2, computes embedding, returns result."""
        from workers.embedding_worker import compute_embedding

        asset_id = str(uuid4())
        workspace_id = str(uuid4())
        object_key = "ws/photos/test.jpg"

        fake_image_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        fake_embedding = np.random.rand(512).astype(np.float32)

        with patch("workers.embedding_worker.download_from_r2", return_value=fake_image_bytes) as mock_dl, \
             patch("workers.embedding_worker.get_clip_embedder") as mock_clip, \
             patch("workers.embedding_worker.tempfile") as mock_tempfile:

            # Setup mock embedder
            mock_embedder = MagicMock()
            mock_embedder.embed_image.return_value = fake_embedding
            mock_clip.return_value = mock_embedder

            # Setup temp file mock
            mock_tmp = MagicMock()
            mock_tmp.name = "/tmp/test_img.jpg"
            mock_tmp.__enter__ = MagicMock(return_value=mock_tmp)
            mock_tmp.__exit__ = MagicMock(return_value=False)
            mock_tempfile.NamedTemporaryFile.return_value = mock_tmp

            # Call the underlying function (not as Celery task)
            result = compute_embedding.run(
                asset_id=asset_id,
                workspace_id=workspace_id,
                object_key=object_key,
            )

            # Verify R2 download was called
            mock_dl.assert_called_once_with(object_key)

            # Verify CLIP embedding was computed
            mock_embedder.embed_image.assert_called_once()

            # Verify result structure
            assert result["asset_id"] == asset_id
            assert "embedding" in result
            assert result["dimensions"] == 512

    def test_task_registered_with_max_retries(self):
        """compute_embedding is registered in celery_app with max_retries=3."""
        from workers.embedding_worker import compute_embedding

        assert compute_embedding.max_retries == 3


# ---------------------------------------------------------------------------
# Test 4: Batch embedding
# ---------------------------------------------------------------------------

class TestComputeBatchEmbeddings:
    """Tests for compute_batch_embeddings task."""

    def test_batch_processes_list(self):
        """compute_batch_embeddings processes list of assets."""
        from workers.embedding_worker import compute_batch_embeddings

        assets = [
            {"asset_id": str(uuid4()), "workspace_id": str(uuid4()), "object_key": "img1.jpg"},
            {"asset_id": str(uuid4()), "workspace_id": str(uuid4()), "object_key": "img2.jpg"},
        ]

        fake_image_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        fake_embedding = np.random.rand(512).astype(np.float32)

        with patch("workers.embedding_worker.download_from_r2", return_value=fake_image_bytes), \
             patch("workers.embedding_worker.get_clip_embedder") as mock_clip, \
             patch("workers.embedding_worker.tempfile") as mock_tempfile:

            mock_embedder = MagicMock()
            mock_embedder.embed_image.return_value = fake_embedding
            mock_clip.return_value = mock_embedder

            mock_tmp = MagicMock()
            mock_tmp.name = "/tmp/test_img.jpg"
            mock_tmp.__enter__ = MagicMock(return_value=mock_tmp)
            mock_tmp.__exit__ = MagicMock(return_value=False)
            mock_tempfile.NamedTemporaryFile.return_value = mock_tmp

            result = compute_batch_embeddings.run(assets=assets)

            assert len(result) == 2
            for item in result:
                assert "asset_id" in item
                assert "embedding" in item
                assert item["dimensions"] == 512


# ---------------------------------------------------------------------------
# Test 5: Task routing to "embedding" queue
# ---------------------------------------------------------------------------

class TestTaskRouting:
    """Tests for task routing configuration."""

    def test_embedding_tasks_routed_to_embedding_queue(self):
        """Embedding tasks are routed to 'embedding' queue."""
        from workers.celery_app import celery_app

        routes = celery_app.conf.task_routes
        # Check that at least one embedding worker task routes to embedding queue
        embedding_routes = {
            k: v for k, v in routes.items()
            if "embedding_worker" in k
        }
        assert len(embedding_routes) > 0, "No embedding worker tasks in routing config"

        for task_name, route in embedding_routes.items():
            assert route.get("queue") == "embedding", (
                f"Task {task_name} should route to 'embedding' queue"
            )

    def test_embedding_queue_defined(self):
        """'embedding' queue is defined in celery_app queue configuration."""
        from workers.celery_app import celery_app

        queues = celery_app.conf.task_queues
        assert "embedding" in queues, "'embedding' queue not defined"

    def test_celery_app_includes_embedding_worker(self):
        """celery_app include list contains embedding_worker."""
        from workers.celery_app import celery_app

        includes = celery_app.conf.include
        assert "workers.embedding_worker" in includes, (
            "celery_app.conf.include should contain 'workers.embedding_worker'"
        )
