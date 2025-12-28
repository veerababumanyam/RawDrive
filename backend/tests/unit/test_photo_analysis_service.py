"""Unit tests for PhotoAnalysisService.

Tests AI-powered photo analysis with Gemini integration.
Feature: 010-ai-powered-features (US1)
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.photo_analysis_service import (
    PhotoAnalysisService,
    PhotoAnalysis,
)


class TestPhotoAnalysisService:
    """Test PhotoAnalysisService - T018."""

    @pytest.fixture
    def service(self) -> PhotoAnalysisService:
        """Create a PhotoAnalysisService instance with mocked dependencies."""
        with patch("app.services.photo_analysis_service.get_settings") as mock_settings, \
             patch("app.services.photo_analysis_service.get_gemini_client_service") as mock_gemini, \
             patch("app.services.photo_analysis_service.get_ai_usage_service") as mock_usage, \
             patch("app.services.photo_analysis_service.get_ai_cache_service") as mock_cache:
            mock_settings.return_value = MagicMock()
            mock_gemini.return_value = MagicMock()
            mock_usage.return_value = MagicMock()
            mock_cache.return_value = MagicMock()
            return PhotoAnalysisService()

    @pytest.mark.asyncio
    async def test_analyze_photo_cache_hit(self) -> None:
        """Test that cached results are returned without API call."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_url = "https://example.com/photo.jpg"
        asset_sha256 = "abc123def456"

        cached_data = {
            "description": "A sunset over the ocean",
            "tags": ["sunset", "ocean"],
            "hashtags": ["#sunset"],
            "quality_score": 85,
            "sharpness": 80,
            "exposure": 90,
            "composition": 85,
            "dominant_colors": ["#FF5733"],
            "lighting": "natural",
            "mood": "serene",
            "improvements": [],
            "best_for": ["web"],
        }

        with patch("app.services.photo_analysis_service.get_settings"), \
             patch("app.services.photo_analysis_service.get_gemini_client_service") as mock_gemini, \
             patch("app.services.photo_analysis_service.get_ai_usage_service"), \
             patch("app.services.photo_analysis_service.get_ai_cache_service") as mock_cache:

            mock_cache_instance = AsyncMock()
            mock_cache.return_value = mock_cache_instance
            mock_cache_instance.get_photo_analysis.return_value = cached_data

            service = PhotoAnalysisService()
            result = await service.analyze_photo(
                user_id=user_id,
                workspace_id=workspace_id,
                photo_url=photo_url,
                asset_sha256=asset_sha256,
            )

            assert result.description == "A sunset over the ocean"
            assert result.quality_score == 85
            # Gemini client should NOT be called
            mock_gemini.return_value.get_client_for_user.assert_not_called()

    @pytest.mark.asyncio
    async def test_analyze_photo_cache_miss_calls_api(self) -> None:
        """Test that cache miss triggers API call and caches result."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_url = "https://example.com/photo.jpg"
        asset_sha256 = "abc123def456"

        api_response = json.dumps({
            "description": "A beautiful landscape",
            "tags": ["landscape", "mountains"],
            "hashtags": ["#nature"],
            "quality_score": 90,
            "sharpness": 85,
            "exposure": 88,
            "composition": 92,
            "dominant_colors": ["#228B22"],
            "lighting": "natural",
            "mood": "peaceful",
            "improvements": ["Slight crop"],
            "best_for": ["print", "web"],
        })

        with patch("app.services.photo_analysis_service.get_settings"), \
             patch("app.services.photo_analysis_service.get_gemini_client_service") as mock_gemini, \
             patch("app.services.photo_analysis_service.get_ai_usage_service") as mock_usage, \
             patch("app.services.photo_analysis_service.get_ai_cache_service") as mock_cache, \
             patch("app.services.photo_analysis_service.fetch_image_base64") as mock_fetch:

            # Setup cache miss
            mock_cache_instance = AsyncMock()
            mock_cache.return_value = mock_cache_instance
            mock_cache_instance.get_photo_analysis.return_value = None

            # Setup Gemini client
            mock_gemini_instance = AsyncMock()
            mock_gemini.return_value = mock_gemini_instance
            mock_client = AsyncMock()
            mock_client.model = "gemini-pro-vision"
            mock_gemini_instance.get_client_for_user.return_value = mock_client
            mock_response = MagicMock()
            mock_response.text = api_response
            mock_client.generate_content.return_value = mock_response

            # Setup image fetch mock
            mock_fetch.return_value = "ZmFrZSBpbWFnZSBkYXRh"  # base64 of "fake image data"

            # Setup usage logging
            mock_usage_instance = AsyncMock()
            mock_usage.return_value = mock_usage_instance

            service = PhotoAnalysisService()
            result = await service.analyze_photo(
                user_id=user_id,
                workspace_id=workspace_id,
                photo_url=photo_url,
                asset_sha256=asset_sha256,
            )

            assert result.description == "A beautiful landscape"
            assert result.quality_score == 90
            # Should have cached the result
            mock_cache_instance.set_photo_analysis.assert_called_once()

    @pytest.mark.asyncio
    async def test_analyze_photo_without_sha256_skips_cache(self) -> None:
        """Test that missing SHA256 skips cache operations."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        api_response = json.dumps({
            "description": "Test photo",
            "tags": [],
            "hashtags": [],
            "quality_score": 50,
            "sharpness": 50,
            "exposure": 50,
            "composition": 50,
            "dominant_colors": [],
            "lighting": "unknown",
            "mood": "neutral",
            "improvements": [],
            "best_for": [],
        })

        with patch("app.services.photo_analysis_service.get_settings"), \
             patch("app.services.photo_analysis_service.get_gemini_client_service") as mock_gemini, \
             patch("app.services.photo_analysis_service.get_ai_usage_service") as mock_usage, \
             patch("app.services.photo_analysis_service.get_ai_cache_service") as mock_cache, \
             patch("app.services.photo_analysis_service.fetch_image_base64") as mock_fetch:

            mock_cache_instance = AsyncMock()
            mock_cache.return_value = mock_cache_instance

            mock_gemini_instance = AsyncMock()
            mock_gemini.return_value = mock_gemini_instance
            mock_client = AsyncMock()
            mock_client.model = "gemini-pro-vision"
            mock_gemini_instance.get_client_for_user.return_value = mock_client
            mock_response = MagicMock()
            mock_response.text = api_response
            mock_client.generate_content.return_value = mock_response

            # Setup image fetch mock
            mock_fetch.return_value = "ZmFrZSBpbWFnZSBkYXRh"

            mock_usage_instance = AsyncMock()
            mock_usage.return_value = mock_usage_instance

            service = PhotoAnalysisService()
            result = await service.analyze_photo(
                user_id=user_id,
                workspace_id=workspace_id,
                photo_url=photo_url,
                # No asset_sha256 provided
            )

            assert result.description == "Test photo"
            # Cache should not be checked or set
            mock_cache_instance.get_photo_analysis.assert_not_called()
            mock_cache_instance.set_photo_analysis.assert_not_called()


class TestPhotoAnalysisParseResponse:
    """Test response parsing logic."""

    def test_parse_valid_json(self) -> None:
        """Test parsing valid JSON response."""
        with patch("app.services.photo_analysis_service.get_settings"), \
             patch("app.services.photo_analysis_service.get_gemini_client_service"), \
             patch("app.services.photo_analysis_service.get_ai_usage_service"), \
             patch("app.services.photo_analysis_service.get_ai_cache_service"):

            service = PhotoAnalysisService()

            response_text = """{
                "description": "Test description",
                "tags": ["tag1", "tag2"],
                "hashtags": ["#test"],
                "quality_score": 75,
                "sharpness": 70,
                "exposure": 80,
                "composition": 72,
                "dominant_colors": ["#FFFFFF"],
                "lighting": "natural",
                "mood": "calm",
                "improvements": ["Crop tighter"],
                "best_for": ["social"]
            }"""

            result = service._parse_analysis_response(response_text)

            assert result.description == "Test description"
            assert result.quality_score == 75
            assert len(result.tags) == 2

    def test_parse_json_with_markdown_wrapper(self) -> None:
        """Test parsing JSON wrapped in markdown code blocks."""
        with patch("app.services.photo_analysis_service.get_settings"), \
             patch("app.services.photo_analysis_service.get_gemini_client_service"), \
             patch("app.services.photo_analysis_service.get_ai_usage_service"), \
             patch("app.services.photo_analysis_service.get_ai_cache_service"):

            service = PhotoAnalysisService()

            response_text = """Here is the analysis:
```json
{
    "description": "Wrapped response",
    "tags": [],
    "hashtags": [],
    "quality_score": 60,
    "sharpness": 55,
    "exposure": 65,
    "composition": 58,
    "dominant_colors": [],
    "lighting": "artificial",
    "mood": "neutral",
    "improvements": [],
    "best_for": []
}
```"""

            result = service._parse_analysis_response(response_text)

            assert result.description == "Wrapped response"
            assert result.quality_score == 60

    def test_parse_invalid_json_returns_defaults(self) -> None:
        """Test that invalid JSON returns default values."""
        with patch("app.services.photo_analysis_service.get_settings"), \
             patch("app.services.photo_analysis_service.get_gemini_client_service"), \
             patch("app.services.photo_analysis_service.get_ai_usage_service"), \
             patch("app.services.photo_analysis_service.get_ai_cache_service"):

            service = PhotoAnalysisService()

            result = service._parse_analysis_response("This is not JSON")

            assert result.description == "Photo analysis unavailable"
            assert result.quality_score == 50

    def test_quality_score_clamped_to_100(self) -> None:
        """Test that quality scores above 100 are clamped."""
        with patch("app.services.photo_analysis_service.get_settings"), \
             patch("app.services.photo_analysis_service.get_gemini_client_service"), \
             patch("app.services.photo_analysis_service.get_ai_usage_service"), \
             patch("app.services.photo_analysis_service.get_ai_cache_service"):

            service = PhotoAnalysisService()

            response_text = json.dumps({
                "description": "Test",
                "tags": [],
                "hashtags": [],
                "quality_score": 150,
                "sharpness": 200,
                "exposure": -10,
                "composition": 50,
                "dominant_colors": [],
                "lighting": "unknown",
                "mood": "neutral",
                "improvements": [],
                "best_for": [],
            })

            result = service._parse_analysis_response(response_text)

            assert result.quality_score == 100
            assert result.sharpness == 100
            assert result.exposure == 0


class TestPhotoAnalysisModel:
    """Test PhotoAnalysis data model."""

    def test_to_dict(self) -> None:
        """Test conversion to dictionary."""
        analysis = PhotoAnalysis(
            description="Test",
            tags=["tag1"],
            hashtags=["#test"],
            quality_score=80,
            sharpness=75,
            exposure=85,
            composition=70,
            dominant_colors=["#FF0000"],
            lighting="natural",
            mood="happy",
            improvements=["Crop"],
            best_for=["web"],
        )

        result = analysis.to_dict()

        assert result["description"] == "Test"
        assert result["quality_score"] == 80
        assert result["tags"] == ["tag1"]
