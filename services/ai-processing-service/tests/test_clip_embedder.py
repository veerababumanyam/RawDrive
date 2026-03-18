"""Unit tests for CLIPEmbedder.

Tests CLIP embedding generation with mocked model to avoid actual model downloads in CI.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import numpy as np
import pytest


# ---------------------------------------------------------------------------
# Helpers – build lightweight mocks so we never import torch / transformers
# ---------------------------------------------------------------------------

def _fake_embedding(dim: int = 512) -> np.ndarray:
    """Return a random L2-normalised embedding."""
    vec = np.random.randn(dim).astype(np.float32)
    return vec / np.linalg.norm(vec)


def _make_mock_tensor(embeddings_np: np.ndarray):
    """Create a mock tensor that behaves like a PyTorch tensor."""
    t = MagicMock()
    t.cpu.return_value = t
    t.numpy.return_value = embeddings_np
    # norm() returns a mock that supports division
    norm_val = MagicMock()
    t.norm.return_value = norm_val
    t.__truediv__ = lambda self, other: t  # normalisation is a no-op on mock
    # indexing
    t.__getitem__ = lambda self, idx: t
    return t


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _mock_settings(monkeypatch):
    """Provide a minimal Settings mock so config.get_settings() works."""
    mock_settings = MagicMock()
    mock_settings.CLIP_MODEL_NAME = "openai/clip-vit-base-patch32"
    monkeypatch.setattr("config.get_settings", lambda: mock_settings)


@pytest.fixture()
def _mock_torch(monkeypatch):
    """Mock torch to avoid importing the real library."""
    mock_torch = MagicMock()
    mock_torch.cuda.is_available.return_value = False
    mock_torch.backends.mps.is_available.return_value = False
    mock_torch.no_grad.return_value.__enter__ = MagicMock(return_value=None)
    mock_torch.no_grad.return_value.__exit__ = MagicMock(return_value=False)
    monkeypatch.setitem(sys.modules, "torch", mock_torch)
    return mock_torch


@pytest.fixture()
def _mock_transformers(monkeypatch):
    """Mock transformers CLIPModel and CLIPProcessor."""
    mock_model = MagicMock()
    mock_processor = MagicMock()

    mock_clip_model = MagicMock()
    mock_clip_model.from_pretrained.return_value = mock_model

    mock_clip_processor = MagicMock()
    mock_clip_processor.from_pretrained.return_value = mock_processor

    mock_transformers = MagicMock()
    mock_transformers.CLIPModel = mock_clip_model
    mock_transformers.CLIPProcessor = mock_clip_processor
    monkeypatch.setitem(sys.modules, "transformers", mock_transformers)

    return {"model": mock_model, "processor": mock_processor,
            "CLIPModel": mock_clip_model, "CLIPProcessor": mock_clip_processor}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCLIPEmbedderInit:
    """Test 1: CLIPEmbedder initialises without network calls when TRANSFORMERS_CACHE is set."""

    def test_init_does_not_load_model(self):
        """Creating CLIPEmbedder should NOT load the model eagerly."""
        from models.clip_embedder import CLIPEmbedder

        embedder = CLIPEmbedder()
        assert embedder.model is None
        assert embedder.processor is None
        assert embedder._initialized is False

    def test_ensure_initialized_loads_model(self, _mock_torch, _mock_transformers):
        """_ensure_initialized should load model and processor."""
        from models.clip_embedder import CLIPEmbedder

        embedder = CLIPEmbedder()
        embedder._ensure_initialized()

        _mock_transformers["CLIPModel"].from_pretrained.assert_called_once_with(
            "openai/clip-vit-base-patch32"
        )
        _mock_transformers["CLIPProcessor"].from_pretrained.assert_called_once_with(
            "openai/clip-vit-base-patch32"
        )
        assert embedder._initialized is True


class TestEmbedImage:
    """Test 2: embed_image returns a 512-dimensional numpy array."""

    def test_embed_image_shape(self, _mock_torch, _mock_transformers, tmp_path):
        """embed_image should return a 512-dim numpy array."""
        from models.clip_embedder import CLIPEmbedder

        fake_emb = _fake_embedding(512)
        mock_tensor = _make_mock_tensor(fake_emb)
        _mock_transformers["model"].get_image_features.return_value = mock_tensor

        processor_return = MagicMock()
        processor_return.items.return_value = [("pixel_values", MagicMock())]
        _mock_transformers["processor"].return_value = processor_return

        # Create a tiny valid image file
        from PIL import Image
        img = Image.new("RGB", (10, 10), color="red")
        img_path = tmp_path / "test.jpg"
        img.save(img_path)

        embedder = CLIPEmbedder()
        embedder._ensure_initialized()
        result = embedder.embed_image(str(img_path))

        assert isinstance(result, np.ndarray)
        assert result.shape == (512,)


class TestEmbedImages:
    """Test 3: embed_images returns list of 512-dim arrays for batch input."""

    def test_embed_images_batch(self, _mock_torch, _mock_transformers, tmp_path):
        """embed_images should return a list of embeddings for each image."""
        from models.clip_embedder import CLIPEmbedder

        batch_embs = np.random.randn(3, 512).astype(np.float32)
        mock_tensor = _make_mock_tensor(batch_embs)
        _mock_transformers["model"].get_image_features.return_value = mock_tensor

        processor_return = MagicMock()
        processor_return.items.return_value = [("pixel_values", MagicMock())]
        _mock_transformers["processor"].return_value = processor_return

        from PIL import Image
        paths = []
        for i in range(3):
            img = Image.new("RGB", (10, 10), color="blue")
            p = tmp_path / f"img_{i}.jpg"
            img.save(p)
            paths.append(str(p))

        embedder = CLIPEmbedder()
        embedder._ensure_initialized()
        results = embedder.embed_images(paths)

        assert len(results) == 3

    def test_embed_images_empty(self, _mock_torch, _mock_transformers):
        """embed_images with empty list should return empty list."""
        from models.clip_embedder import CLIPEmbedder

        embedder = CLIPEmbedder()
        assert embedder.embed_images([]) == []


class TestCosineSimilarity:
    """Test 4: cosine_similarity of identical embeddings returns 1.0."""

    def test_identical_embeddings(self):
        """Cosine similarity of the same vector with itself should be 1.0."""
        from models.clip_embedder import CLIPEmbedder

        emb = _fake_embedding(512)
        sim = CLIPEmbedder.cosine_similarity(emb, emb)
        assert abs(sim - 1.0) < 1e-5

    def test_orthogonal_embeddings(self):
        """Cosine similarity of orthogonal vectors should be ~0.0."""
        from models.clip_embedder import CLIPEmbedder

        emb1 = np.zeros(512, dtype=np.float32)
        emb1[0] = 1.0
        emb2 = np.zeros(512, dtype=np.float32)
        emb2[1] = 1.0
        sim = CLIPEmbedder.cosine_similarity(emb1, emb2)
        assert abs(sim) < 1e-5


class TestTrainMode:
    """Test 5: model uses train(False) mode (not deprecated set_training_mode)."""

    def test_uses_train_false(self, _mock_torch, _mock_transformers):
        """_ensure_initialized should call model.train(False), not set_training_mode."""
        from models.clip_embedder import CLIPEmbedder

        embedder = CLIPEmbedder()
        embedder._ensure_initialized()

        _mock_transformers["model"].train.assert_called_once_with(False)
        # Ensure deprecated method is NOT called
        _mock_transformers["model"].set_training_mode.assert_not_called()
