"""Unit tests for CaptionHashtagService.

Feature: 010-ai-powered-features
Tasks: T030 - Unit tests for caption generation service
       T042 - Unit tests for hashtag generation service
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.caption_hashtag_service import (
    CaptionHashtagService,
    CaptionResult,
    HashtagResult,
)


class TestCaptionGenerationService:
    """Test caption generation functionality."""

    @pytest.fixture
    def service(self) -> CaptionHashtagService:
        """Create a CaptionHashtagService instance."""
        return CaptionHashtagService()

    @pytest.fixture
    def mock_gemini_client(self) -> MagicMock:
        """Mock Gemini client."""
        client = MagicMock()
        client.model = "gemini-2.0-flash"
        return client

    @pytest.fixture
    def sample_caption_response(self) -> dict:
        """Sample caption response data."""
        return {
            "captions": [
                "Golden hour magic over the Pacific 🌅",
                "Where the sky meets the sea in perfect harmony",
                "Nature's daily masterpiece at its finest",
            ],
            "style": "professional",
        }

    @pytest.mark.asyncio
    async def test_generate_captions_success(
        self,
        service: CaptionHashtagService,
        mock_gemini_client: MagicMock,
        sample_caption_response: dict,
    ) -> None:
        """Test successful caption generation."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        mock_response = MagicMock()
        mock_response.text = f"```json\n{json.dumps(sample_caption_response)}\n```"
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
            "_parse_caption_response",
            return_value=CaptionResult(
                photo_id=str(photo_id),
                captions=sample_caption_response["captions"],
                style="professional",
            ),
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.generate_captions(
                user_id=user_id,
                workspace_id=workspace_id,
                photo_url=photo_url,
                photo_id=photo_id,
                style="professional",
                count=3,
            )

        assert result is not None
        assert isinstance(result, CaptionResult)
        assert len(result.captions) == 3
        assert result.style == "professional"
        assert all(isinstance(c, str) for c in result.captions)

    @pytest.mark.asyncio
    async def test_generate_captions_different_styles(
        self,
        service: CaptionHashtagService,
        mock_gemini_client: MagicMock,
    ) -> None:
        """Test caption generation with different styles."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        styles_and_expected = {
            "professional": ["High-quality professional shot"],
            "casual": ["Just vibing with this view!"],
            "poetic": ["Where dreams meet reality..."],
        }

        for style, expected_captions in styles_and_expected.items():
            response_data = {"captions": expected_captions, "style": style}
            mock_response = MagicMock()
            mock_response.text = f"```json\n{json.dumps(response_data)}\n```"
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
                "_parse_caption_response",
                return_value=CaptionResult(
                    photo_id="test",
                    captions=expected_captions,
                    style=style,
                ),
            ), patch.object(
                service.ai_usage,
                "log_ai_call",
                new_callable=AsyncMock,
            ):
                result = await service.generate_captions(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    photo_url=photo_url,
                    style=style,
                    count=1,
                )

            assert result.style == style

    @pytest.mark.asyncio
    async def test_generate_captions_logs_usage(
        self,
        service: CaptionHashtagService,
        mock_gemini_client: MagicMock,
        sample_caption_response: dict,
    ) -> None:
        """Test that caption generation logs AI usage."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        mock_response = MagicMock()
        mock_response.text = f"```json\n{json.dumps(sample_caption_response)}\n```"
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
            "_parse_caption_response",
            return_value=CaptionResult(
                photo_id="test",
                captions=sample_caption_response["captions"],
                style="professional",
            ),
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ) as mock_log:
            await service.generate_captions(
                user_id=user_id,
                workspace_id=workspace_id,
                photo_url=photo_url,
                style="professional",
                count=3,
            )

        mock_log.assert_called_once()
        call_kwargs = mock_log.call_args.kwargs
        assert call_kwargs["user_id"] == user_id
        assert call_kwargs["workspace_id"] == workspace_id


class TestHashtagGenerationService:
    """Test hashtag generation functionality."""

    @pytest.fixture
    def service(self) -> CaptionHashtagService:
        """Create a CaptionHashtagService instance."""
        return CaptionHashtagService()

    @pytest.fixture
    def mock_gemini_client(self) -> MagicMock:
        """Mock Gemini client."""
        client = MagicMock()
        client.model = "gemini-2.0-flash"
        return client

    @pytest.fixture
    def sample_hashtag_response(self) -> dict:
        """Sample hashtag response data."""
        return {
            "hashtags": [
                "#sunset",
                "#oceanview",
                "#naturephotography",
                "#goldenhour",
                "#beachlife",
                "#travelgram",
                "#photooftheday",
                "#landscapephotography",
                "#skylovers",
                "#beautifuldestinations",
            ],
            "categories": {
                "trending": ["#photooftheday", "#travelgram", "#beautifuldestinations"],
                "niche": ["#landscapephotography", "#naturephotography", "#skylovers"],
                "general": ["#sunset", "#oceanview", "#beachlife", "#goldenhour"],
                "branded": [],
            },
        }

    @pytest.mark.asyncio
    async def test_generate_hashtags_success(
        self,
        service: CaptionHashtagService,
        mock_gemini_client: MagicMock,
        sample_hashtag_response: dict,
    ) -> None:
        """Test successful hashtag generation."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        mock_response = MagicMock()
        mock_response.text = f"```json\n{json.dumps(sample_hashtag_response)}\n```"
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
            "_parse_hashtag_response",
            return_value=HashtagResult(
                photo_id=str(photo_id),
                hashtags=sample_hashtag_response["hashtags"],
                categories=sample_hashtag_response["categories"],
            ),
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.generate_hashtags(
                user_id=user_id,
                workspace_id=workspace_id,
                photo_url=photo_url,
                photo_id=photo_id,
                count=10,
            )

        assert result is not None
        assert isinstance(result, HashtagResult)
        assert len(result.hashtags) == 10
        assert all(h.startswith("#") for h in result.hashtags)

    @pytest.mark.asyncio
    async def test_hashtag_categories_structure(
        self,
        service: CaptionHashtagService,
        mock_gemini_client: MagicMock,
        sample_hashtag_response: dict,
    ) -> None:
        """Test that hashtags are properly categorized."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        mock_response = MagicMock()
        mock_response.text = f"```json\n{json.dumps(sample_hashtag_response)}\n```"
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
            "_parse_hashtag_response",
            return_value=HashtagResult(
                photo_id="test",
                hashtags=sample_hashtag_response["hashtags"],
                categories=sample_hashtag_response["categories"],
            ),
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.generate_hashtags(
                user_id=user_id,
                workspace_id=workspace_id,
                photo_url=photo_url,
                count=10,
            )

        # Verify all required categories exist
        assert "trending" in result.categories
        assert "niche" in result.categories
        assert "general" in result.categories
        assert "branded" in result.categories

        # Verify categories contain hashtags
        for category, tags in result.categories.items():
            assert isinstance(tags, list)
            for tag in tags:
                assert tag.startswith("#")

    @pytest.mark.asyncio
    async def test_generate_hashtags_respects_count(
        self,
        service: CaptionHashtagService,
        mock_gemini_client: MagicMock,
    ) -> None:
        """Test that hashtag count parameter is respected."""
        user_id = uuid4()
        workspace_id = uuid4()
        photo_url = "https://example.com/photo.jpg"

        for count in [5, 10, 20, 30]:
            hashtags = [f"#tag{i}" for i in range(count)]
            response_data = {
                "hashtags": hashtags,
                "categories": {
                    "trending": hashtags[:2],
                    "niche": hashtags[2:4],
                    "general": hashtags[4:],
                    "branded": [],
                },
            }
            mock_response = MagicMock()
            mock_response.text = f"```json\n{json.dumps(response_data)}\n```"
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
                "_parse_hashtag_response",
                return_value=HashtagResult(
                    photo_id="test",
                    hashtags=hashtags,
                    categories=response_data["categories"],
                ),
            ), patch.object(
                service.ai_usage,
                "log_ai_call",
                new_callable=AsyncMock,
            ):
                result = await service.generate_hashtags(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    photo_url=photo_url,
                    count=count,
                )

            assert len(result.hashtags) == count


class TestCaptionResult:
    """Test CaptionResult data model."""

    def test_create_caption_result(self) -> None:
        """Test creating CaptionResult instance."""
        result = CaptionResult(
            photo_id="123",
            captions=["Caption 1", "Caption 2"],
            style="professional",
        )

        assert result.photo_id == "123"
        assert len(result.captions) == 2
        assert result.style == "professional"

    def test_caption_result_to_dict(self) -> None:
        """Test CaptionResult serialization."""
        result = CaptionResult(
            photo_id="123",
            captions=["Test caption"],
            style="casual",
        )

        data = result.to_dict()
        assert data["photo_id"] == "123"
        assert data["captions"] == ["Test caption"]
        assert data["style"] == "casual"


class TestHashtagResult:
    """Test HashtagResult data model."""

    def test_create_hashtag_result(self) -> None:
        """Test creating HashtagResult instance."""
        result = HashtagResult(
            photo_id="123",
            hashtags=["#tag1", "#tag2"],
            categories={
                "trending": ["#tag1"],
                "niche": ["#tag2"],
                "general": [],
                "branded": [],
            },
        )

        assert result.photo_id == "123"
        assert len(result.hashtags) == 2
        assert len(result.categories) == 4

    def test_hashtag_result_to_dict(self) -> None:
        """Test HashtagResult serialization."""
        result = HashtagResult(
            photo_id="123",
            hashtags=["#test"],
            categories={"trending": [], "niche": [], "general": ["#test"], "branded": []},
        )

        data = result.to_dict()
        assert data["photo_id"] == "123"
        assert data["hashtags"] == ["#test"]
        assert "categories" in data
