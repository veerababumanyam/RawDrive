"""Unit tests for SmartCurationService.

Feature: 010-ai-powered-features
Tasks: T069 - Unit tests for curation service
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
    """Test smart curation functionality."""

    @pytest.fixture
    def service(self) -> SmartCurationService:
        """Create a SmartCurationService instance."""
        return SmartCurationService()

    @pytest.fixture
    def sample_assets(self) -> list[dict]:
        """Sample asset data for curation testing."""
        return [
            {
                "asset_id": str(uuid4()),
                "quality_score": 0.9,
                "sharpness": 0.85,
                "exposure": 0.9,
                "composition": 0.88,
                "face_count": 2,
                "thumbnail_url": "https://example.com/thumb1.jpg",
            },
            {
                "asset_id": str(uuid4()),
                "quality_score": 0.75,
                "sharpness": 0.7,
                "exposure": 0.8,
                "composition": 0.75,
                "face_count": 0,
                "thumbnail_url": "https://example.com/thumb2.jpg",
            },
            {
                "asset_id": str(uuid4()),
                "quality_score": 0.85,
                "sharpness": 0.8,
                "exposure": 0.85,
                "composition": 0.9,
                "face_count": 1,
                "thumbnail_url": "https://example.com/thumb3.jpg",
            },
            {
                "asset_id": str(uuid4()),
                "quality_score": 0.5,
                "sharpness": 0.5,
                "exposure": 0.5,
                "composition": 0.5,
                "face_count": 0,
                "thumbnail_url": "https://example.com/thumb4.jpg",
            },
            {
                "asset_id": str(uuid4()),
                "quality_score": 0.95,
                "sharpness": 0.95,
                "exposure": 0.95,
                "composition": 0.95,
                "face_count": 3,
                "thumbnail_url": "https://example.com/thumb5.jpg",
            },
        ]

    @pytest.mark.asyncio
    async def test_curate_gallery_success(
        self,
        service: SmartCurationService,
        sample_assets: list[dict],
    ) -> None:
        """Test successful gallery curation."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        mock_gallery_service = MagicMock()
        mock_gallery_service.get_gallery_assets = AsyncMock(
            return_value={"assets": sample_assets}
        )

        with patch(
            "app.services.smart_curation_service.get_gallery_service",
            return_value=mock_gallery_service,
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.curate_gallery(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                count=3,
                quality_threshold=0.6,
                diversity_weight=0.3,
            )

        assert result is not None
        assert isinstance(result, CurationResult)
        assert len(result.selected_assets) == 3
        assert result.total_candidates == 5
        assert result.quality_threshold == 0.6

    @pytest.mark.asyncio
    async def test_curate_gallery_respects_count(
        self,
        service: SmartCurationService,
        sample_assets: list[dict],
    ) -> None:
        """Test that curation respects the requested count."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        mock_gallery_service = MagicMock()
        mock_gallery_service.get_gallery_assets = AsyncMock(
            return_value={"assets": sample_assets}
        )

        for count in [1, 2, 3, 5]:
            with patch(
                "app.services.smart_curation_service.get_gallery_service",
                return_value=mock_gallery_service,
            ), patch.object(
                service.ai_usage,
                "log_ai_call",
                new_callable=AsyncMock,
            ):
                result = await service.curate_gallery(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    count=count,
                    quality_threshold=0.0,  # Accept all
                    diversity_weight=0.0,
                )

            # Should get at most the requested count
            assert len(result.selected_assets) <= count

    @pytest.mark.asyncio
    async def test_curate_gallery_quality_threshold(
        self,
        service: SmartCurationService,
        sample_assets: list[dict],
    ) -> None:
        """Test that quality threshold filters out low-quality photos."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        mock_gallery_service = MagicMock()
        mock_gallery_service.get_gallery_assets = AsyncMock(
            return_value={"assets": sample_assets}
        )

        # High threshold should exclude lower quality photos
        with patch(
            "app.services.smart_curation_service.get_gallery_service",
            return_value=mock_gallery_service,
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.curate_gallery(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                count=10,
                quality_threshold=0.8,
                diversity_weight=0.0,
            )

        # All selected assets should have score >= threshold
        for asset in result.selected_assets:
            assert asset["score"] >= 0.8

    @pytest.mark.asyncio
    async def test_curate_gallery_prefer_people(
        self,
        service: SmartCurationService,
        sample_assets: list[dict],
    ) -> None:
        """Test that prefer_people option boosts photos with faces."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        mock_gallery_service = MagicMock()
        mock_gallery_service.get_gallery_assets = AsyncMock(
            return_value={"assets": sample_assets}
        )

        with patch(
            "app.services.smart_curation_service.get_gallery_service",
            return_value=mock_gallery_service,
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.curate_gallery(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                count=3,
                quality_threshold=0.0,
                diversity_weight=0.0,
                prefer_people=True,
            )

        # Photos with faces should be prioritized
        # At least one selected should have faces
        has_faces = [a for a in result.selected_assets if a.get("has_faces", False)]
        assert len(has_faces) > 0

    @pytest.mark.asyncio
    async def test_curate_gallery_exclude_assets(
        self,
        service: SmartCurationService,
        sample_assets: list[dict],
    ) -> None:
        """Test that excluded assets are not selected."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        # Get the first asset's ID to exclude
        exclude_id = uuid4()
        sample_assets[0]["asset_id"] = str(exclude_id)

        mock_gallery_service = MagicMock()
        mock_gallery_service.get_gallery_assets = AsyncMock(
            return_value={"assets": sample_assets}
        )

        with patch(
            "app.services.smart_curation_service.get_gallery_service",
            return_value=mock_gallery_service,
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.curate_gallery(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                count=10,
                quality_threshold=0.0,
                diversity_weight=0.0,
                exclude_asset_ids=[exclude_id],
            )

        # Excluded asset should not be in results
        selected_ids = [a["asset_id"] for a in result.selected_assets]
        assert str(exclude_id) not in selected_ids

    @pytest.mark.asyncio
    async def test_curate_gallery_logs_usage(
        self,
        service: SmartCurationService,
        sample_assets: list[dict],
    ) -> None:
        """Test that curation logs AI usage."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        mock_gallery_service = MagicMock()
        mock_gallery_service.get_gallery_assets = AsyncMock(
            return_value={"assets": sample_assets}
        )

        with patch(
            "app.services.smart_curation_service.get_gallery_service",
            return_value=mock_gallery_service,
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ) as mock_log:
            await service.curate_gallery(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                count=3,
                quality_threshold=0.6,
                diversity_weight=0.3,
            )

        mock_log.assert_called_once()
        call_kwargs = mock_log.call_args.kwargs
        assert call_kwargs["user_id"] == user_id
        assert call_kwargs["workspace_id"] == workspace_id
        assert call_kwargs["success"] is True

    @pytest.mark.asyncio
    async def test_curate_empty_gallery(
        self,
        service: SmartCurationService,
    ) -> None:
        """Test curation of an empty gallery."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        mock_gallery_service = MagicMock()
        mock_gallery_service.get_gallery_assets = AsyncMock(
            return_value={"assets": []}
        )

        with patch(
            "app.services.smart_curation_service.get_gallery_service",
            return_value=mock_gallery_service,
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.curate_gallery(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                count=10,
            )

        assert len(result.selected_assets) == 0
        assert result.total_candidates == 0


class TestCurationResult:
    """Test CurationResult data model."""

    def test_create_curation_result(self) -> None:
        """Test creating CurationResult instance."""
        result = CurationResult(
            gallery_id="123",
            selected_assets=[
                {"asset_id": "a1", "score": 0.9},
                {"asset_id": "a2", "score": 0.85},
            ],
            total_candidates=10,
            quality_threshold=0.6,
            diversity_weight=0.3,
        )

        assert result.gallery_id == "123"
        assert len(result.selected_assets) == 2
        assert result.total_candidates == 10
        assert result.quality_threshold == 0.6
        assert result.diversity_weight == 0.3

    def test_curation_result_to_dict(self) -> None:
        """Test CurationResult serialization."""
        result = CurationResult(
            gallery_id="456",
            selected_assets=[{"asset_id": "a1", "score": 0.9}],
            total_candidates=5,
            quality_threshold=0.7,
            diversity_weight=0.2,
        )

        data = result.to_dict()
        assert data["gallery_id"] == "456"
        assert len(data["selected_assets"]) == 1
        assert data["total_candidates"] == 5
        assert data["quality_threshold"] == 0.7
        assert data["diversity_weight"] == 0.2


class TestCurationAlgorithm:
    """Test the curation scoring algorithm."""

    @pytest.fixture
    def service(self) -> SmartCurationService:
        """Create a SmartCurationService instance."""
        return SmartCurationService()

    def test_calculate_asset_score_base(
        self,
        service: SmartCurationService,
    ) -> None:
        """Test base score calculation."""
        asset = {
            "quality_score": 0.8,
            "sharpness": 0.7,
            "exposure": 0.75,
            "composition": 0.8,
            "face_count": 0,
        }

        score = service._calculate_asset_score(
            asset=asset,
            quality_threshold=0.5,
            diversity_weight=0.3,
            prefer_people=False,
        )

        # Score should be between 0 and 1
        assert 0 <= score <= 1
        # Quality weight is 0.6, technical is 0.4
        # Expected: 0.8 * 0.6 + ((0.7 + 0.75 + 0.8) / 3) * 0.4
        expected = 0.8 * 0.6 + 0.75 * 0.4
        assert abs(score - expected) < 0.01

    def test_calculate_asset_score_with_people_bonus(
        self,
        service: SmartCurationService,
    ) -> None:
        """Test score calculation with people preference."""
        asset = {
            "quality_score": 0.7,
            "sharpness": 0.7,
            "exposure": 0.7,
            "composition": 0.7,
            "face_count": 2,
        }

        score_with_bonus = service._calculate_asset_score(
            asset=asset,
            quality_threshold=0.5,
            diversity_weight=0.3,
            prefer_people=True,
        )

        score_without_bonus = service._calculate_asset_score(
            asset=asset,
            quality_threshold=0.5,
            diversity_weight=0.3,
            prefer_people=False,
        )

        # With people preference, score should be higher
        assert score_with_bonus > score_without_bonus

    def test_diversity_selection(
        self,
        service: SmartCurationService,
    ) -> None:
        """Test diversity-aware selection."""
        scored_assets = [
            {"asset_id": "1", "score": 0.95, "has_faces": True},
            {"asset_id": "2", "score": 0.9, "has_faces": True},
            {"asset_id": "3", "score": 0.85, "has_faces": False},
            {"asset_id": "4", "score": 0.8, "has_faces": True},
            {"asset_id": "5", "score": 0.75, "has_faces": False},
        ]

        selected = service._apply_diversity_selection(
            scored_assets=scored_assets,
            count=4,
            diversity_weight=0.5,
        )

        assert len(selected) == 4

        # Should include some variety (not all faces or all no-faces)
        has_faces = [a for a in selected if a["has_faces"]]
        no_faces = [a for a in selected if not a["has_faces"]]

        # With diversity weight 0.5, we should have some variety
        assert len(has_faces) > 0
        assert len(no_faces) > 0
