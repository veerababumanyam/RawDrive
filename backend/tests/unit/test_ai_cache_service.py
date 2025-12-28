"""Unit tests for AICacheService.

Tests Redis caching for AI analysis results.
Feature: 010-ai-powered-features
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.services.ai_cache_service import (
    AICacheService,
    CACHE_TTL_ANALYSIS,
    CACHE_TTL_CAPTION,
    CACHE_TTL_HASHTAG,
    CACHE_TTL_STORY,
    CACHE_TTL_CURATION,
)


class TestAICacheServicePhotoAnalysis:
    """Test photo analysis caching - T017."""

    @pytest.fixture
    def service(self) -> AICacheService:
        """Create an AICacheService instance."""
        return AICacheService()

    @pytest.mark.asyncio
    async def test_get_photo_analysis_cache_hit(self, service: AICacheService) -> None:
        """Test cache hit returns cached analysis."""
        asset_sha256 = "abc123def456"
        cached_data = {
            "description": "A beautiful sunset",
            "quality_score": 85,
            "tags": ["sunset", "beach"],
        }

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            mock_client.get.return_value = json.dumps(cached_data)

            result = await service.get_photo_analysis(asset_sha256)

            assert result == cached_data
            mock_client.get.assert_called_once_with(f"ai:analysis:{asset_sha256}")

    @pytest.mark.asyncio
    async def test_get_photo_analysis_cache_miss(self, service: AICacheService) -> None:
        """Test cache miss returns None."""
        asset_sha256 = "abc123def456"

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            mock_client.get.return_value = None

            result = await service.get_photo_analysis(asset_sha256)

            assert result is None

    @pytest.mark.asyncio
    async def test_set_photo_analysis(self, service: AICacheService) -> None:
        """Test setting photo analysis in cache."""
        asset_sha256 = "abc123def456"
        analysis_data = {
            "description": "A beautiful sunset",
            "quality_score": 85,
        }

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client

            await service.set_photo_analysis(asset_sha256, analysis_data)

            mock_client.setex.assert_called_once_with(
                f"ai:analysis:{asset_sha256}",
                CACHE_TTL_ANALYSIS,
                json.dumps(analysis_data),
            )

    @pytest.mark.asyncio
    async def test_cache_graceful_degradation(self, service: AICacheService) -> None:
        """Test that Redis errors don't crash the service."""
        asset_sha256 = "abc123def456"

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_redis.side_effect = Exception("Redis connection failed")

            # Should return None, not raise
            result = await service.get_photo_analysis(asset_sha256)
            assert result is None


class TestAICacheServiceCaptions:
    """Test caption caching - T029."""

    @pytest.fixture
    def service(self) -> AICacheService:
        return AICacheService()

    @pytest.mark.asyncio
    async def test_get_caption_with_style(self, service: AICacheService) -> None:
        """Test caption cache includes style in key."""
        asset_sha256 = "abc123"
        style = "professional"
        cached_data = {"captions": ["Caption 1", "Caption 2"], "style": style}

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            mock_client.get.return_value = json.dumps(cached_data)

            result = await service.get_caption(asset_sha256, style)

            assert result == cached_data
            mock_client.get.assert_called_once_with(f"ai:caption:{asset_sha256}:{style}")

    @pytest.mark.asyncio
    async def test_set_caption_with_correct_ttl(self, service: AICacheService) -> None:
        """Test caption uses correct TTL."""
        asset_sha256 = "abc123"
        style = "casual"
        caption_data = {"captions": ["Caption"], "style": style}

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client

            await service.set_caption(asset_sha256, style, caption_data)

            mock_client.setex.assert_called_once_with(
                f"ai:caption:{asset_sha256}:{style}",
                CACHE_TTL_CAPTION,
                json.dumps(caption_data),
            )


class TestAICacheServiceHashtags:
    """Test hashtag caching - T041."""

    @pytest.fixture
    def service(self) -> AICacheService:
        return AICacheService()

    @pytest.mark.asyncio
    async def test_get_hashtags_with_category(self, service: AICacheService) -> None:
        """Test hashtag cache includes category in key."""
        asset_sha256 = "abc123"
        category = "trending"
        cached_data = {"hashtags": ["#photo", "#nature"], "categories": {}}

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            mock_client.get.return_value = json.dumps(cached_data)

            result = await service.get_hashtags(asset_sha256, category)

            assert result == cached_data
            mock_client.get.assert_called_once_with(f"ai:hashtag:{asset_sha256}:{category}")


class TestAICacheServiceGalleryStory:
    """Test gallery story caching - T055."""

    @pytest.fixture
    def service(self) -> AICacheService:
        return AICacheService()

    @pytest.mark.asyncio
    async def test_get_gallery_story(self, service: AICacheService) -> None:
        """Test story cache includes length and tone."""
        gallery_id = uuid4()
        length = "medium"
        tone = "professional"
        cached_data = {"story": "Once upon a time...", "word_count": 150}

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            mock_client.get.return_value = json.dumps(cached_data)

            result = await service.get_gallery_story(gallery_id, length, tone)

            assert result == cached_data
            mock_client.get.assert_called_once_with(
                f"ai:story:{gallery_id}:{length}:{tone}"
            )

    @pytest.mark.asyncio
    async def test_invalidate_gallery_story(self, service: AICacheService) -> None:
        """Test invalidating all story variants for a gallery."""
        gallery_id = uuid4()

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            # Simulate SCAN returning keys then finishing
            mock_client.scan.side_effect = [
                (0, [f"ai:story:{gallery_id}:short:casual"]),
            ]

            await service.invalidate_gallery_story(gallery_id)

            mock_client.delete.assert_called_once()


class TestAICacheServiceCuration:
    """Test curation caching - T068."""

    @pytest.fixture
    def service(self) -> AICacheService:
        return AICacheService()

    @pytest.mark.asyncio
    async def test_get_curation_with_params(self, service: AICacheService) -> None:
        """Test curation cache includes all parameters."""
        gallery_id = uuid4()
        quality = 70.0
        diversity = 0.5
        max_photos = 20
        cached_data = {"asset_ids": ["id1", "id2"], "selected_count": 2}

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            mock_client.get.return_value = json.dumps(cached_data)

            result = await service.get_curation(gallery_id, quality, diversity, max_photos)

            assert result == cached_data
            mock_client.get.assert_called_once_with(
                f"ai:curation:{gallery_id}:{quality}:{diversity}:{max_photos}"
            )

    @pytest.mark.asyncio
    async def test_get_curation_no_max_photos(self, service: AICacheService) -> None:
        """Test curation cache with None max_photos."""
        gallery_id = uuid4()

        with patch("app.services.ai_cache_service.get_redis_client") as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            mock_client.get.return_value = None

            await service.get_curation(gallery_id, 70.0, 0.5, None)

            # Should use "all" for None max_photos
            mock_client.get.assert_called_once_with(
                f"ai:curation:{gallery_id}:70.0:0.5:all"
            )
