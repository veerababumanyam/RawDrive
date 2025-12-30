"""Unit tests for PhotoAnalysisService.

Feature: 010-ai-powered-features
Tasks: T018 - Unit tests for photo analysis service
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.photo_analysis_service import PhotoAnalysisService, PhotoAnalysis


class TestPhotoAnalysisService:
    """Test PhotoAnalysisService methods."""

    @pytest.fixture
    def service(self) -> PhotoAnalysisService:
        """Create a PhotoAnalysisService instance."""
        return PhotoAnalysisService()

    @pytest.fixture
    def mock_gemini_client(self) -> MagicMock:
        """Mock Gemini client."""
        client = MagicMock()
        client.model = "gemini-2.0-flash"
        return client

    @pytest.fixture
    def sample_analysis_response(self) -> dict:
        """Sample analysis response data."""
        return {
            "description": "A stunning landscape photo of mountains at sunset",
            "tags": ["landscape", "mountains", "sunset", "nature", "scenic"],
            "hashtags": ["#landscape", "#mountains", "#naturephotography"],
            "quality_score": 88,
            "sharpness": 92,
            "exposure": 85,
            "composition": 90,
            "dominant_colors": ["#FF6B35", "#2E86AB", "#1A1A2E"],
            "lighting": "golden hour",
            "mood": "majestic",
            "improvements": ["Consider adding foreground interest"],
            "best_for": ["print", "portfolio", "social media"],
        }

    @pytest.mark.asyncio
    async def test_analyze_photo_success(
        self,
        service: PhotoAnalysisService,
        mock_gemini_client: MagicMock,
        sample_analysis_response: dict,
    ) -> None:
        """Test successful photo analysis."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        # Setup mocks
        mock_response = MagicMock()
        mock_response.text = f"```json\n{json.dumps(sample_analysis_response)}\n```"
        mock_gemini_client.generate_content = AsyncMock(return_value=mock_response)

        with patch.object(
            service.gemini_client,
            "get_client_for_user",
            new_callable=AsyncMock,
            return_value=mock_gemini_client,
        ), patch.object(
            service,
            "_fetch_image_data",
            new_callable=AsyncMock,
            return_value=b"fake_image_data",
        ), patch.object(
            service,
            "_parse_analysis_response",
            return_value=PhotoAnalysis(**sample_analysis_response),
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.analyze_photo(
                user_id=user_id,
                workspace_id=workspace_id,
                photo_url=photo_url,
                photo_id=photo_id,
            )

        # Verify result
        assert result is not None
        assert isinstance(result, PhotoAnalysis)
        assert result.description == sample_analysis_response["description"]
        assert result.quality_score == 88
        assert result.sharpness == 92
        assert result.lighting == "golden hour"
        assert result.mood == "majestic"
        assert len(result.tags) == 5
        assert len(result.dominant_colors) == 3
        assert len(result.improvements) == 1

    @pytest.mark.asyncio
    async def test_analyze_photo_logs_usage_on_success(
        self,
        service: PhotoAnalysisService,
        mock_gemini_client: MagicMock,
        sample_analysis_response: dict,
    ) -> None:
        """Test that AI usage is logged on successful analysis."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        mock_response = MagicMock()
        mock_response.text = f"```json\n{json.dumps(sample_analysis_response)}\n```"
        mock_gemini_client.generate_content = AsyncMock(return_value=mock_response)

        with patch.object(
            service.gemini_client,
            "get_client_for_user",
            new_callable=AsyncMock,
            return_value=mock_gemini_client,
        ), patch.object(
            service,
            "_fetch_image_data",
            new_callable=AsyncMock,
            return_value=b"fake_image_data",
        ), patch.object(
            service,
            "_parse_analysis_response",
            return_value=PhotoAnalysis(**sample_analysis_response),
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ) as mock_log:
            await service.analyze_photo(
                user_id=user_id,
                workspace_id=workspace_id,
                photo_url=photo_url,
            )

        # Verify logging was called with correct parameters
        mock_log.assert_called_once()
        call_kwargs = mock_log.call_args.kwargs
        assert call_kwargs["user_id"] == user_id
        assert call_kwargs["workspace_id"] == workspace_id
        assert call_kwargs["success"] is True

    @pytest.mark.asyncio
    async def test_analyze_photo_logs_failure(
        self,
        service: PhotoAnalysisService,
    ) -> None:
        """Test that failed analysis is logged."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        with patch.object(
            service.gemini_client,
            "get_client_for_user",
            new_callable=AsyncMock,
            side_effect=Exception("API Error"),
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ) as mock_log:
            with pytest.raises(Exception):
                await service.analyze_photo(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    photo_url=photo_url,
                )

        # Verify failure was logged
        mock_log.assert_called_once()
        call_kwargs = mock_log.call_args.kwargs
        assert call_kwargs["success"] is False

    def test_photo_analysis_to_dict(
        self,
        sample_analysis_response: dict,
    ) -> None:
        """Test PhotoAnalysis.to_dict() method."""
        analysis = PhotoAnalysis(**sample_analysis_response)
        result = analysis.to_dict()

        assert result == sample_analysis_response
        assert isinstance(result["tags"], list)
        assert isinstance(result["quality_score"], int)
        assert isinstance(result["dominant_colors"], list)

    def test_build_analysis_prompt(
        self,
        service: PhotoAnalysisService,
    ) -> None:
        """Test that analysis prompt is properly constructed."""
        prompt = service._build_analysis_prompt()

        # Prompt should contain key instructions
        assert "analyze" in prompt.lower()
        assert "quality" in prompt.lower()
        assert "json" in prompt.lower()

    @pytest.mark.asyncio
    async def test_fetch_image_data_success(
        self,
        service: PhotoAnalysisService,
    ) -> None:
        """Test successful image data fetching."""
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.content = b"image_bytes"
            mock_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock()
            mock_client_class.return_value = mock_client

            result = await service._fetch_image_data("https://example.com/photo.jpg")

        assert result == b"image_bytes"


class TestPhotoAnalysisModel:
    """Test PhotoAnalysis data model."""

    def test_create_photo_analysis(self) -> None:
        """Test creating PhotoAnalysis instance."""
        analysis = PhotoAnalysis(
            description="Test description",
            tags=["tag1", "tag2"],
            hashtags=["#hash1"],
            quality_score=85,
            sharpness=90,
            exposure=80,
            composition=88,
            dominant_colors=["#FF0000"],
            lighting="natural",
            mood="calm",
            improvements=["tip1"],
            best_for=["print"],
        )

        assert analysis.description == "Test description"
        assert len(analysis.tags) == 2
        assert analysis.quality_score == 85
        assert analysis.lighting == "natural"

    def test_quality_score_range(self) -> None:
        """Test that quality scores should be 0-100."""
        # Valid scores
        for score in [0, 50, 100]:
            analysis = PhotoAnalysis(
                description="Test",
                tags=[],
                hashtags=[],
                quality_score=score,
                sharpness=score,
                exposure=score,
                composition=score,
                dominant_colors=[],
                lighting="",
                mood="",
                improvements=[],
                best_for=[],
            )
            assert 0 <= analysis.quality_score <= 100
