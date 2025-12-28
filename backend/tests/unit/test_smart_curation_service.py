"""Unit tests for SmartCurationService.

Tests AI-powered photo curation and selection algorithm.
Feature: 010-ai-powered-features (US5)
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.smart_curation_service import (
    SmartCurationService,
    CurationResult,
)


class TestSmartCurationService:
    """Test SmartCurationService - T069."""

    @pytest.fixture
    def service(self) -> SmartCurationService:
        """Create a SmartCurationService instance with mocked dependencies."""
        with patch("app.services.smart_curation_service.get_settings") as mock_settings, \
             patch("app.services.smart_curation_service.get_ai_usage_service") as mock_usage, \
             patch("app.services.smart_curation_service.get_ai_cache_service") as mock_cache:
            mock_settings.return_value = MagicMock()
            mock_usage.return_value = MagicMock()
            mock_cache.return_value = MagicMock()
            return SmartCurationService()

    @pytest.mark.asyncio
    async def test_curate_empty_gallery(self) -> None:
        """Test curation with no photos returns empty result."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        with patch("app.services.smart_curation_service.get_settings"), \
             patch("app.services.smart_curation_service.get_ai_usage_service"), \
             patch("app.services.smart_curation_service.get_ai_cache_service"):

            service = SmartCurationService()
            result = await service.curate_gallery(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                photo_analyses=[],
            )

            assert result.asset_ids == []
            assert result.selected_count == 0
            assert result.total_assets == 0

    @pytest.mark.asyncio
    async def test_curate_cache_hit(self) -> None:
        """Test that cached curation is returned."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        cached_data = {
            "asset_ids": ["asset1", "asset2"],
            "criteria": {"quality_threshold": 70},
            "total_assets": 10,
            "selected_count": 2,
            "rankings": [],
        }

        with patch("app.services.smart_curation_service.get_settings"), \
             patch("app.services.smart_curation_service.get_ai_usage_service"), \
             patch("app.services.smart_curation_service.get_ai_cache_service") as mock_cache:

            mock_cache_instance = AsyncMock()
            mock_cache.return_value = mock_cache_instance
            mock_cache_instance.get_curation.return_value = cached_data

            service = SmartCurationService()
            result = await service.curate_gallery(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                photo_analyses=[{"asset_id": "test"}],  # Non-empty to skip empty check
            )

            assert result.asset_ids == ["asset1", "asset2"]
            assert result.selected_count == 2

    @pytest.mark.asyncio
    async def test_curate_quality_threshold_filtering(self) -> None:
        """Test that photos below quality threshold are excluded."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        photos = [
            {"asset_id": str(uuid4()), "quality_score": 90, "sharpness": 85, "exposure": 88, "composition": 85},
            {"asset_id": str(uuid4()), "quality_score": 50, "sharpness": 45, "exposure": 55, "composition": 48},
            {"asset_id": str(uuid4()), "quality_score": 80, "sharpness": 78, "exposure": 82, "composition": 75},
        ]

        with patch("app.services.smart_curation_service.get_settings"), \
             patch("app.services.smart_curation_service.get_ai_usage_service") as mock_usage, \
             patch("app.services.smart_curation_service.get_ai_cache_service") as mock_cache:

            mock_cache_instance = AsyncMock()
            mock_cache.return_value = mock_cache_instance
            mock_cache_instance.get_curation.return_value = None

            mock_usage_instance = AsyncMock()
            mock_usage.return_value = mock_usage_instance

            service = SmartCurationService()
            result = await service.curate_gallery(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                photo_analyses=photos,
                quality_threshold=70,  # Should exclude the 50-score photo
            )

            # Only 2 photos should pass the threshold
            assert result.selected_count == 2
            assert result.total_assets == 3


class TestScorePhotos:
    """Test photo scoring algorithm."""

    @pytest.fixture
    def service(self) -> SmartCurationService:
        with patch("app.services.smart_curation_service.get_settings"), \
             patch("app.services.smart_curation_service.get_ai_usage_service"), \
             patch("app.services.smart_curation_service.get_ai_cache_service"):
            return SmartCurationService()

    def test_score_calculation(self, service: SmartCurationService) -> None:
        """Test composite score calculation."""
        photos = [
            {
                "asset_id": "test1",
                "quality_score": 80,
                "sharpness": 80,
                "exposure": 80,
                "composition": 80,
            }
        ]

        result = service._score_photos(photos, quality_threshold=0, prefer_people=False)

        # All scores are 80, so composite should be 80
        # (80 * 0.4) + (80 * 0.2) + (80 * 0.2) + (80 * 0.2) = 80
        assert len(result) == 1
        assert result[0]["score"] == 80.0

    def test_people_preference_boost(self, service: SmartCurationService) -> None:
        """Test that prefer_people boosts photos with faces."""
        photos = [
            {
                "asset_id": "no_faces",
                "quality_score": 80,
                "sharpness": 80,
                "exposure": 80,
                "composition": 80,
                "face_count": 0,
            },
            {
                "asset_id": "with_faces",
                "quality_score": 80,
                "sharpness": 80,
                "exposure": 80,
                "composition": 80,
                "face_count": 2,
            },
        ]

        result = service._score_photos(photos, quality_threshold=0, prefer_people=True)

        # Photo with faces should have higher score (15% boost)
        no_faces = next(p for p in result if p["asset_id"] == "no_faces")
        with_faces = next(p for p in result if p["asset_id"] == "with_faces")

        assert with_faces["score"] > no_faces["score"]
        assert with_faces["score"] == 92.0  # 80 * 1.15 = 92

    def test_score_capped_at_100(self, service: SmartCurationService) -> None:
        """Test that boosted scores don't exceed 100."""
        photos = [
            {
                "asset_id": "high_score",
                "quality_score": 95,
                "sharpness": 95,
                "exposure": 95,
                "composition": 95,
                "face_count": 3,
            },
        ]

        result = service._score_photos(photos, quality_threshold=0, prefer_people=True)

        # 95 * 1.15 = 109.25, should be capped at 100
        assert result[0]["score"] == 100


class TestDiversityFilter:
    """Test diversity filtering algorithm."""

    @pytest.fixture
    def service(self) -> SmartCurationService:
        with patch("app.services.smart_curation_service.get_settings"), \
             patch("app.services.smart_curation_service.get_ai_usage_service"), \
             patch("app.services.smart_curation_service.get_ai_cache_service"):
            return SmartCurationService()

    def test_diversity_zero_returns_top_n(self, service: SmartCurationService) -> None:
        """Test that diversity=0 just returns top N by score."""
        photos = [
            {"asset_id": "1", "score": 90, "lighting": "natural", "mood": "happy", "dominant_colors": [], "tags": []},
            {"asset_id": "2", "score": 85, "lighting": "natural", "mood": "happy", "dominant_colors": [], "tags": []},
            {"asset_id": "3", "score": 80, "lighting": "natural", "mood": "happy", "dominant_colors": [], "tags": []},
        ]

        result = service._apply_diversity_filter(photos, diversity_weight=0, max_photos=2)

        assert len(result) == 2
        assert result[0]["asset_id"] == "1"
        assert result[1]["asset_id"] == "2"

    def test_diversity_filters_similar_photos(self, service: SmartCurationService) -> None:
        """Test that high diversity filters similar photos."""
        photos = [
            {"asset_id": "1", "score": 90, "lighting": "natural", "mood": "happy", "dominant_colors": ["#FF0000"], "tags": ["sunset"]},
            {"asset_id": "2", "score": 88, "lighting": "natural", "mood": "happy", "dominant_colors": ["#FF0000"], "tags": ["sunset"]},
            {"asset_id": "3", "score": 85, "lighting": "artificial", "mood": "calm", "dominant_colors": ["#0000FF"], "tags": ["indoor"]},
        ]

        result = service._apply_diversity_filter(photos, diversity_weight=0.8, max_photos=2)

        # Should prefer diverse photo over similar one
        assert len(result) == 2
        assert result[0]["asset_id"] == "1"  # Best photo
        # Second should be the diverse one, not the similar one
        assert "3" in [r["asset_id"] for r in result]


class TestSimilarityCalculation:
    """Test photo similarity calculation."""

    @pytest.fixture
    def service(self) -> SmartCurationService:
        with patch("app.services.smart_curation_service.get_settings"), \
             patch("app.services.smart_curation_service.get_ai_usage_service"), \
             patch("app.services.smart_curation_service.get_ai_cache_service"):
            return SmartCurationService()

    def test_identical_photos_high_similarity(self, service: SmartCurationService) -> None:
        """Test that identical attributes result in high similarity."""
        photo1 = {
            "lighting": "natural",
            "mood": "happy",
            "dominant_colors": ["#FF0000"],
            "tags": ["sunset", "beach"],
        }
        photo2 = {
            "lighting": "natural",
            "mood": "happy",
            "dominant_colors": ["#FF0000"],
            "tags": ["sunset", "beach"],
        }

        similarity = service._calculate_similarity(photo1, photo2)

        assert similarity > 0.9  # Should be very similar

    def test_different_photos_low_similarity(self, service: SmartCurationService) -> None:
        """Test that different attributes result in low similarity."""
        photo1 = {
            "lighting": "natural",
            "mood": "happy",
            "dominant_colors": ["#FF0000"],
            "tags": ["sunset", "beach"],
        }
        photo2 = {
            "lighting": "artificial",
            "mood": "sad",
            "dominant_colors": ["#0000FF"],
            "tags": ["indoor", "portrait"],
        }

        similarity = service._calculate_similarity(photo1, photo2)

        assert similarity < 0.3  # Should be very different


class TestSelectionReason:
    """Test selection reason generation."""

    @pytest.fixture
    def service(self) -> SmartCurationService:
        with patch("app.services.smart_curation_service.get_settings"), \
             patch("app.services.smart_curation_service.get_ai_usage_service"), \
             patch("app.services.smart_curation_service.get_ai_cache_service"):
            return SmartCurationService()

    def test_excellent_quality_reason(self, service: SmartCurationService) -> None:
        """Test reason for high quality photo."""
        photo = {"score": 95, "sharpness": 90, "exposure": 88, "composition": 92}

        reason = service._generate_selection_reason(photo)

        assert "Excellent" in reason

    def test_face_detection_in_reason(self, service: SmartCurationService) -> None:
        """Test that face count is mentioned in reason."""
        photo = {"score": 80, "sharpness": 75, "exposure": 78, "composition": 72, "face_count": 3}

        reason = service._generate_selection_reason(photo)

        assert "3 face(s)" in reason


class TestCurationResultModel:
    """Test CurationResult data model."""

    def test_to_dict(self) -> None:
        """Test conversion to dictionary."""
        result = CurationResult(
            asset_ids=["id1", "id2"],
            criteria={"quality_threshold": 70},
            total_assets=10,
            selected_count=2,
            rankings=[{"asset_id": "id1", "score": 90, "reason": "High quality"}],
        )

        dict_result = result.to_dict()

        assert dict_result["asset_ids"] == ["id1", "id2"]
        assert dict_result["selected_count"] == 2
        assert len(dict_result["rankings"]) == 1
