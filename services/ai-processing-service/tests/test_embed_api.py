"""Tests for the CLIP embedding REST API endpoint.

Uses mocked CLIPEmbedder and R2 download to avoid real model/network calls.
"""

from __future__ import annotations

import io
import sys
from unittest.mock import MagicMock, patch, AsyncMock

import numpy as np
import pytest
from PIL import Image


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_tiny_png_bytes() -> bytes:
    """Create a minimal valid PNG image as bytes."""
    img = Image.new("RGB", (4, 4), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _fake_embedding(dim: int = 512) -> np.ndarray:
    vec = np.random.randn(dim).astype(np.float32)
    return vec / np.linalg.norm(vec)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _mock_settings(monkeypatch):
    """Provide minimal Settings mock."""
    mock_settings = MagicMock()
    mock_settings.CLIP_MODEL_NAME = "openai/clip-vit-base-patch32"
    mock_settings.R2_ENDPOINT_URL = "https://fake.r2.cloudflarestorage.com"
    mock_settings.R2_ACCESS_KEY_ID = "fake-key"
    mock_settings.R2_SECRET_ACCESS_KEY = "fake-secret"
    mock_settings.R2_BUCKET_NAME = "test-bucket"
    mock_settings.DEBUG = False
    mock_settings.is_development = True
    mock_settings.is_test = True
    mock_settings.ENVIRONMENT = MagicMock()
    mock_settings.ENVIRONMENT.value = "test"
    mock_settings.SERVICE_NAME = "ai-processing-service"
    mock_settings.METRICS_ENABLED = False
    mock_settings.MCP_ENABLED = False
    mock_settings.MILVUS_ENABLED = False
    monkeypatch.setattr("config.get_settings", lambda: mock_settings)
    monkeypatch.setattr("config._settings", mock_settings)


@pytest.fixture()
def mock_embedder():
    """Mock CLIPEmbedder singleton."""
    embedder = MagicMock()
    embedder.embed_images.return_value = [_fake_embedding(512) for _ in range(3)]
    embedder.embedding_to_list = lambda emb: emb.tolist()
    return embedder


@pytest.fixture()
def mock_r2():
    """Mock download_from_r2."""
    return MagicMock(return_value=_make_tiny_png_bytes())


@pytest.fixture()
def client(mock_embedder, mock_r2):
    """Create FastAPI test client with mocks."""
    with patch("models.clip_embedder.get_clip_embedder", return_value=mock_embedder), \
         patch("services.r2_download.download_from_r2", mock_r2):
        # Import app after patching to avoid side-effects
        from fastapi.testclient import TestClient
        from api.v1.embeddings import router
        from fastapi import FastAPI

        test_app = FastAPI()
        test_app.include_router(router, prefix="/api/v1/embed")
        yield TestClient(test_app), mock_embedder, mock_r2


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestEmbedImagesEndpoint:
    """Tests for POST /api/v1/embed/images."""

    def test_happy_path_returns_embeddings(self, client):
        """Test 1: POST with image_urls returns embeddings list with 512 floats each."""
        tc, mock_emb, mock_r2 = client

        response = tc.post("/api/v1/embed/images", json={
            "image_urls": ["photos/img1.jpg", "photos/img2.jpg", "photos/img3.jpg"],
            "workspace_id": "ws-123",
        })

        assert response.status_code == 200
        data = response.json()
        assert len(data["embeddings"]) == 3
        for emb_result in data["embeddings"]:
            assert emb_result["embedding"] is not None
            assert len(emb_result["embedding"]) == 512
            assert emb_result["error"] is None
            assert emb_result["dimensions"] == 512

    def test_empty_list_returns_empty(self, client):
        """Test 2: POST with empty list returns empty embeddings list."""
        tc, _, _ = client

        response = tc.post("/api/v1/embed/images", json={
            "image_urls": [],
            "workspace_id": "ws-123",
        })

        assert response.status_code == 200
        data = response.json()
        assert data["embeddings"] == []
        assert data["processing_time_ms"] == 0.0

    def test_invalid_url_returns_partial_results(self, client):
        """Test 3: POST with one failing URL returns partial results."""
        tc, mock_emb, mock_r2 = client

        # Make the second call fail
        call_count = [0]
        def side_effect(key):
            call_count[0] += 1
            if call_count[0] == 2:
                raise RuntimeError("Download failed")
            return _make_tiny_png_bytes()

        mock_r2.side_effect = side_effect
        mock_emb.embed_images.return_value = [_fake_embedding(512), _fake_embedding(512)]

        response = tc.post("/api/v1/embed/images", json={
            "image_urls": ["good1.jpg", "bad.jpg", "good2.jpg"],
            "workspace_id": "ws-123",
        })

        assert response.status_code == 200
        data = response.json()
        assert len(data["embeddings"]) == 3

        # Check the failed one has error
        failed = [e for e in data["embeddings"] if e["error"] is not None]
        assert len(failed) == 1
        assert failed[0]["url"] == "bad.jpg"
        assert failed[0]["embedding"] is None

        # Check the successful ones have embeddings
        succeeded = [e for e in data["embeddings"] if e["embedding"] is not None]
        assert len(succeeded) == 2

    def test_response_includes_processing_time(self, client):
        """Test 5: Response includes processing_time_ms field."""
        tc, _, _ = client

        response = tc.post("/api/v1/embed/images", json={
            "image_urls": ["test.jpg"],
            "workspace_id": "ws-123",
        })

        assert response.status_code == 200
        data = response.json()
        assert "processing_time_ms" in data
        assert isinstance(data["processing_time_ms"], float)
        assert data["processing_time_ms"] >= 0


class TestR2Download:
    """Test 4: download_from_r2 calls boto3 with correct R2 credentials."""

    def test_download_calls_boto3_correctly(self, _mock_settings):
        """download_from_r2 should use settings credentials to call S3."""
        mock_body = MagicMock()
        mock_body.read.return_value = b"fake image data"

        mock_client = MagicMock()
        mock_client.get_object.return_value = {"Body": mock_body}

        with patch("services.r2_download.boto3") as mock_boto3, \
             patch("services.r2_download._s3_client", None):
            mock_boto3.client.return_value = mock_client

            from services.r2_download import download_from_r2

            # Reset singleton
            import services.r2_download as r2_mod
            r2_mod._s3_client = None

            result = download_from_r2("workspaces/ws-123/photos/img.jpg")

            # Verify boto3.client was called with R2 settings
            mock_boto3.client.assert_called_once_with(
                "s3",
                endpoint_url="https://fake.r2.cloudflarestorage.com",
                aws_access_key_id="fake-key",
                aws_secret_access_key="fake-secret",
                region_name="auto",
            )

            # Verify get_object was called with correct bucket/key
            mock_client.get_object.assert_called_once_with(
                Bucket="test-bucket",
                Key="workspaces/ws-123/photos/img.jpg",
            )

            assert result == b"fake image data"
