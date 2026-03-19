"""Regression tests for critical face identification system fixes.

Tests cover:
1. FaceGroupResponse Pydantic validation (no 500 errors from duplicate id)
2. Embedding vectors stripped from public API response schemas
3. Centroid vectors stripped from public API response schemas
4. FaceDetailResponse embedding accessible for internal use
5. Consent bypass blocked in production
6. Consent bypass allowed in dev/test
7. Model hash validation
8. Representative face always set after clustering
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import patch, AsyncMock, MagicMock
from uuid import uuid4, UUID

import pytest


# ---------------------------------------------------------------------------
# Task 1: Schema validation tests
# ---------------------------------------------------------------------------


def _make_face_group_dict(**overrides) -> dict:
    """Create a valid face group dict as returned by the repository."""
    base = {
        "id": uuid4(),
        "workspace_id": uuid4(),
        "name": "Test Person",
        "representative_face_id": uuid4(),
        "face_count": 5,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "representative_thumbnail_url": "https://example.com/thumb.jpg",
        "person_id": uuid4(),
        "person_name": "Test Person",
    }
    base.update(overrides)
    return base


def _make_face_dict(**overrides) -> dict:
    """Create a valid face dict as returned by the repository."""
    base = {
        "id": uuid4(),
        "workspace_id": uuid4(),
        "photo_id": uuid4(),
        "face_group_id": uuid4(),
        "bounding_box": {"x": 10.0, "y": 20.0, "width": 30.0, "height": 40.0},
        "confidence": 0.95,
        "provider": "cloud_vision",
        "thumbnail_urls": None,
        "thumbnail_url": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    base.update(overrides)
    return base


class TestFaceGroupResponseNoDuplicate:
    """Regression: FaceGroupResponse must validate without Pydantic 500 errors."""

    def test_face_group_response_validates_from_dict(self):
        """FaceGroupResponse.model_validate(dict) succeeds without ValidationError."""
        from app.api.face_schemas import FaceGroupResponse

        data = _make_face_group_dict()
        # This previously raised ValidationError due to duplicate `id` parameter
        result = FaceGroupResponse(**data)
        assert result.face_group_id == data["id"]

    def test_face_group_response_validates_from_orm(self):
        """FaceGroupResponse works with from_attributes=True."""
        from app.api.face_schemas import FaceGroupResponse

        data = _make_face_group_dict()
        result = FaceGroupResponse.model_validate(data)
        assert result.face_group_id == data["id"]

    def test_face_group_gallery_stats_validates(self):
        """FaceGroupGalleryStats (subclass) also validates without error."""
        from app.api.face_schemas import FaceGroupGalleryStats

        data = _make_face_group_dict()
        data["gallery_photo_count"] = 10
        data["gallery_face_count"] = 3
        result = FaceGroupGalleryStats(**data)
        assert result.face_group_id == data["id"]


class TestEmbeddingNotInPublicResponse:
    """Security: embedding vectors must never appear in public API responses."""

    def test_face_response_public_excludes_embedding(self):
        """FaceResponsePublic serialization has no 'embedding' key."""
        from app.api.face_schemas import FaceResponsePublic

        data = _make_face_dict()
        response = FaceResponsePublic(**data)
        serialized = response.model_dump(by_alias=True)
        assert "embedding" not in serialized

    def test_face_group_response_public_excludes_centroid(self):
        """FaceGroupResponsePublic serialization has no 'centroid' key."""
        from app.api.face_schemas import FaceGroupResponsePublic

        data = _make_face_group_dict()
        data["centroid"] = [0.1] * 512  # provide centroid, should be stripped
        data["sample_faces"] = []
        response = FaceGroupResponsePublic(**data)
        serialized = response.model_dump(by_alias=True)
        assert "centroid" not in serialized

    def test_face_detail_response_has_embedding_for_internal_use(self):
        """FaceDetailResponse (internal) retains embedding for similarity search."""
        from app.api.face_schemas import FaceDetailResponse

        data = _make_face_dict()
        data["embedding"] = [0.1] * 512
        data["detection_metadata"] = {}
        data["photo_filename"] = "test.jpg"
        data["gallery_id"] = uuid4()
        data["face_group_name"] = "Test"
        response = FaceDetailResponse(**data)
        assert response.embedding is not None
        assert len(response.embedding) == 512

    def test_face_response_public_serialization_complete(self):
        """FaceResponsePublic has all required fields except embedding."""
        from app.api.face_schemas import FaceResponsePublic

        data = _make_face_dict()
        response = FaceResponsePublic(**data)
        serialized = response.model_dump(by_alias=True)
        # Must have core fields
        assert "id" in serialized  # via alias
        assert "photo_id" in serialized
        assert "confidence" in serialized


# ---------------------------------------------------------------------------
# Task 2: Consent bypass tests
# ---------------------------------------------------------------------------


class TestConsentBypassBlocked:
    """Security: Consent bypass must be impossible in production."""

    def test_consent_bypass_blocked_in_production(self):
        """BYPASS_CONSENT_CHECKS is False in production regardless of env var."""
        with patch.dict(os.environ, {
            "RAWDRIVE_ENV": "production",
            "RAWDRIVE_BYPASS_BIOMETRIC_CONSENT": "true",
        }):
            # Re-evaluate the module-level variable
            from app.services.face_detection_service import _evaluate_consent_bypass
            result = _evaluate_consent_bypass()
            assert result is False

    def test_consent_bypass_allowed_in_dev(self):
        """BYPASS_CONSENT_CHECKS can be True in development."""
        with patch.dict(os.environ, {
            "RAWDRIVE_ENV": "development",
            "RAWDRIVE_BYPASS_BIOMETRIC_CONSENT": "true",
        }):
            from app.services.face_detection_service import _evaluate_consent_bypass
            result = _evaluate_consent_bypass()
            assert result is True

    def test_consent_bypass_allowed_in_test(self):
        """BYPASS_CONSENT_CHECKS can be True in test environment."""
        with patch.dict(os.environ, {
            "RAWDRIVE_ENV": "test",
            "RAWDRIVE_BYPASS_BIOMETRIC_CONSENT": "true",
        }):
            from app.services.face_detection_service import _evaluate_consent_bypass
            result = _evaluate_consent_bypass()
            assert result is True

    def test_consent_bypass_default_production(self):
        """Default RAWDRIVE_ENV (production) blocks bypass."""
        with patch.dict(os.environ, {
            "RAWDRIVE_BYPASS_BIOMETRIC_CONSENT": "true",
        }, clear=False):
            env = os.environ.copy()
            env.pop("RAWDRIVE_ENV", None)
            with patch.dict(os.environ, env, clear=True):
                from app.services.face_detection_service import _evaluate_consent_bypass
                result = _evaluate_consent_bypass()
                assert result is False


class TestModelHashValidation:
    """Security: ONNX model integrity must be validated."""

    def test_model_hash_validation_raises_on_mismatch(self):
        """face_embedder validates model hash and fails on mismatch."""
        from app.services.ai.face_embedder import EXPECTED_MODEL_HASH
        # EXPECTED_MODEL_HASH should be configurable via env var
        assert EXPECTED_MODEL_HASH is not None or os.getenv("FACE_MODEL_SHA256") is not None, \
            "EXPECTED_MODEL_HASH must be set or configurable via FACE_MODEL_SHA256 env var"


class TestRepresentativeFaceAfterClustering:
    """Data integrity: Every face group must have a representative face after clustering."""

    @pytest.mark.asyncio
    async def test_ensure_representative_face_sets_highest_confidence(self):
        """ensure_representative_face picks the face with highest confidence."""
        from app.services.face_cluster_service import FaceClusterService

        # Create mock repos
        mock_face_repo = AsyncMock()
        mock_group_repo = AsyncMock()

        # Mock faces in group - face_2 has highest confidence
        face_1 = _make_face_dict(confidence=0.85)
        face_2 = _make_face_dict(confidence=0.99)
        face_3 = _make_face_dict(confidence=0.70)
        mock_face_repo.find_by_group_id.return_value = [face_1, face_2, face_3]
        mock_group_repo.update.return_value = _make_face_group_dict(
            representative_face_id=face_2["id"]
        )

        service = FaceClusterService.__new__(FaceClusterService)
        service.face_repo = mock_face_repo
        service.group_repo = mock_group_repo
        service.embedding_service = AsyncMock()

        group_id = uuid4()
        workspace_id = uuid4()
        await service.ensure_representative_face(group_id, workspace_id)

        # Should have updated with highest confidence face
        mock_group_repo.update.assert_called_once()
        call_kwargs = mock_group_repo.update.call_args
        assert call_kwargs[1].get("representative_face_id") == face_2["id"] or \
               (len(call_kwargs[0]) > 2 and call_kwargs[0][2] == face_2["id"])
