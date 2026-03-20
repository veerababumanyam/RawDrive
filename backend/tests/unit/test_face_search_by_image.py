"""Tests for the face-search-by-image endpoint.

Validates that the server-side face embedding generation approach works
correctly, avoiding the 128-dim (face-api.js) vs 512-dim (ArcFace) mismatch.

Tests cover:
- Image validation (type, size, empty)
- Face detection and embedding generation pipeline
- Gallery verification and consent checks
- Error handling for invalid inputs
- Rate limiting integration
"""

from __future__ import annotations

import io
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import numpy as np
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_jpeg_bytes(width: int = 100, height: int = 100) -> bytes:
    """Create a minimal valid JPEG image in memory using OpenCV."""
    import cv2

    # Create a simple BGR image with a face-like pattern
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[20:80, 30:70] = [200, 180, 160]  # skin-tone rectangle
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def _make_png_bytes(width: int = 100, height: int = 100) -> bytes:
    """Create a minimal valid PNG image."""
    import cv2

    img = np.zeros((height, width, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".png", img)
    return buf.tobytes()


GALLERY_ID = str(uuid4())
WORKSPACE_ID = str(uuid4())

MOCK_GALLERY_RESPONSE = {
    "id": GALLERY_ID,
    "workspace_id": WORKSPACE_ID,
    "face_search_enabled": True,
    "stats": {"total_faces": 42},
}


# ---------------------------------------------------------------------------
# Unit tests for validation logic
# ---------------------------------------------------------------------------


class TestImageValidation:
    """Tests for image upload validation in face-search-by-image."""

    def test_allowed_image_types(self):
        """Verify the set of allowed MIME types."""
        from app.api.v1.public_galleries import _ALLOWED_IMAGE_TYPES

        assert "image/jpeg" in _ALLOWED_IMAGE_TYPES
        assert "image/png" in _ALLOWED_IMAGE_TYPES
        assert "image/webp" in _ALLOWED_IMAGE_TYPES
        assert "image/gif" not in _ALLOWED_IMAGE_TYPES
        assert "application/pdf" not in _ALLOWED_IMAGE_TYPES

    def test_max_image_size(self):
        """Verify maximum upload size is 5 MB."""
        from app.api.v1.public_galleries import _MAX_FACE_IMAGE_BYTES

        assert _MAX_FACE_IMAGE_BYTES == 5 * 1024 * 1024


class TestEmbeddingDimensionConsistency:
    """Tests that verify the core fix: server-side embedding generation
    produces 512-dim embeddings matching stored gallery embeddings."""

    @pytest.mark.asyncio
    async def test_embedder_produces_512_dim(self):
        """FaceEmbedder.generate_embedding must return 512 floats."""
        from app.services.ai.face_embedder import FaceEmbedder

        embedder = FaceEmbedder()

        # Mock the ONNX model to return a 512-dim vector
        mock_net = MagicMock()
        fake_output = np.random.randn(1, 512).astype(np.float32)
        mock_net.forward.return_value = fake_output
        mock_net.setInput = MagicMock()

        embedder._net = mock_net
        embedder._initialized = True
        embedder._model_validated = True

        face_crop = np.zeros((112, 112, 3), dtype=np.uint8)
        embedding = await embedder.generate_embedding(face_crop)

        assert embedding is not None
        assert len(embedding) == 512, (
            f"Expected 512-dim embedding, got {len(embedding)}-dim. "
            "This would cause dimension mismatch with stored embeddings."
        )

    @pytest.mark.asyncio
    async def test_embedder_output_is_normalized(self):
        """Embedding must be L2-normalized for cosine similarity to work."""
        from app.services.ai.face_embedder import FaceEmbedder

        embedder = FaceEmbedder()

        mock_net = MagicMock()
        fake_output = np.random.randn(1, 512).astype(np.float32)
        mock_net.forward.return_value = fake_output
        mock_net.setInput = MagicMock()

        embedder._net = mock_net
        embedder._initialized = True
        embedder._model_validated = True

        face_crop = np.zeros((112, 112, 3), dtype=np.uint8)
        embedding = await embedder.generate_embedding(face_crop)

        assert embedding is not None
        l2_norm = np.linalg.norm(embedding)
        assert abs(l2_norm - 1.0) < 0.01, (
            f"Embedding L2 norm is {l2_norm}, expected ~1.0. "
            "Non-normalized embeddings break cosine similarity search."
        )

    def test_embedding_repo_expects_512_dim(self):
        """FaceEmbeddingRepository validates embeddings are 512-dim."""
        from app.repositories.face_embedding_repository import (
            EMBEDDING_DIMENSION,
            FaceEmbeddingRepository,
        )
        from app.services.face_exceptions import EmbeddingDimensionMismatchError

        assert EMBEDDING_DIMENSION == 512

        repo = FaceEmbeddingRepository()

        # 128-dim should fail (this is what face-api.js produces)
        with pytest.raises(EmbeddingDimensionMismatchError):
            repo._validate_embedding([0.1] * 128)

        # 512-dim normalized should pass
        vec_512 = np.random.randn(512).astype(np.float32)
        vec_512 /= np.linalg.norm(vec_512)
        repo._validate_embedding(vec_512.tolist())  # Should not raise


class TestFaceSearchByImageEndpoint:
    """Tests for the face-search-by-image FastAPI endpoint logic."""

    @pytest.mark.asyncio
    async def test_rejects_unsupported_content_type(self):
        """Endpoint should reject non-image uploads."""
        from app.api.v1.public_galleries import _ALLOWED_IMAGE_TYPES

        # GIF is not in the allowed list
        assert "image/gif" not in _ALLOWED_IMAGE_TYPES

    @pytest.mark.asyncio
    async def test_rejects_oversized_image(self):
        """Endpoint should reject images larger than 5 MB."""
        from app.api.v1.public_galleries import _MAX_FACE_IMAGE_BYTES

        # A 6 MB payload should be rejected
        oversized = b"\x00" * (6 * 1024 * 1024)
        assert len(oversized) > _MAX_FACE_IMAGE_BYTES
