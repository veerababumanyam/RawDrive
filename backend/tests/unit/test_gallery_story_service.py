"""Unit tests for GalleryStoryService.

Feature: 010-ai-powered-features
Tasks: T056 - Unit tests for story generation service
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.gallery_story_service import (
    GalleryStoryService,
    StoryResult,
)


class TestGalleryStoryService:
    """Test gallery story generation functionality."""

    @pytest.fixture
    def service(self) -> GalleryStoryService:
        """Create a GalleryStoryService instance."""
        return GalleryStoryService()

    @pytest.fixture
    def mock_gemini_client(self) -> MagicMock:
        """Mock Gemini client."""
        client = MagicMock()
        client.model = "gemini-2.0-flash"
        return client

    @pytest.fixture
    def sample_story_response(self) -> dict:
        """Sample story response data."""
        return {
            "title": "A Day to Remember",
            "story": "The golden hour cast its warm glow across the landscape as the celebrations began. Each moment captured tells a story of joy, love, and connection. From the tender glances to the exuberant dances, this gallery preserves memories that will last a lifetime.",
            "themes": ["celebration", "love", "golden hour", "joy"],
        }

    @pytest.fixture
    def sample_photo_descriptions(self) -> list[dict]:
        """Sample photo descriptions for story generation."""
        return [
            {
                "description": "Sunset over the ocean",
                "tags": ["sunset", "ocean", "nature"],
                "mood": "peaceful",
            },
            {
                "description": "Group celebration photo",
                "tags": ["people", "celebration", "party"],
                "mood": "joyful",
            },
            {
                "description": "Close-up of flowers",
                "tags": ["flowers", "macro", "nature"],
                "mood": "romantic",
            },
        ]

    @pytest.mark.asyncio
    async def test_generate_story_success(
        self,
        service: GalleryStoryService,
        mock_gemini_client: MagicMock,
        sample_story_response: dict,
        sample_photo_descriptions: list[dict],
    ) -> None:
        """Test successful story generation."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        mock_response = MagicMock()
        mock_response.text = f"```json\n{json.dumps(sample_story_response)}\n```"
        mock_gemini_client.generate_content = AsyncMock(return_value=mock_response)

        with patch.object(
            service.gemini_client,
            "get_client_for_user",
            new_callable=AsyncMock,
            return_value=mock_gemini_client,
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.generate_story(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                gallery_name="Wedding Gallery",
                photo_descriptions=sample_photo_descriptions,
                length="medium",
                tone="professional",
            )

        assert result is not None
        assert isinstance(result, StoryResult)
        assert result.gallery_id == str(gallery_id)
        assert result.length == "medium"
        assert result.tone == "professional"
        assert result.photo_count == 3

    @pytest.mark.asyncio
    async def test_generate_story_different_lengths(
        self,
        service: GalleryStoryService,
        mock_gemini_client: MagicMock,
        sample_photo_descriptions: list[dict],
    ) -> None:
        """Test story generation with different lengths."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        lengths = ["short", "medium", "long"]

        for length in lengths:
            story_response = {
                "title": f"Story ({length})",
                "story": "Generated story content.",
                "themes": ["theme1"],
            }
            mock_response = MagicMock()
            mock_response.text = json.dumps(story_response)
            mock_gemini_client.generate_content = AsyncMock(return_value=mock_response)

            with patch.object(
                service.gemini_client,
                "get_client_for_user",
                new_callable=AsyncMock,
                return_value=mock_gemini_client,
            ), patch.object(
                service.ai_usage,
                "log_ai_call",
                new_callable=AsyncMock,
            ):
                result = await service.generate_story(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    gallery_name="Test Gallery",
                    photo_descriptions=sample_photo_descriptions,
                    length=length,
                    tone="casual",
                )

            assert result.length == length

    @pytest.mark.asyncio
    async def test_generate_story_different_tones(
        self,
        service: GalleryStoryService,
        mock_gemini_client: MagicMock,
        sample_photo_descriptions: list[dict],
    ) -> None:
        """Test story generation with different tones."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        tones = ["professional", "casual", "poetic", "journalistic"]

        for tone in tones:
            story_response = {
                "title": f"Story ({tone})",
                "story": "Generated story content.",
                "themes": ["theme1"],
            }
            mock_response = MagicMock()
            mock_response.text = json.dumps(story_response)
            mock_gemini_client.generate_content = AsyncMock(return_value=mock_response)

            with patch.object(
                service.gemini_client,
                "get_client_for_user",
                new_callable=AsyncMock,
                return_value=mock_gemini_client,
            ), patch.object(
                service.ai_usage,
                "log_ai_call",
                new_callable=AsyncMock,
            ):
                result = await service.generate_story(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    gallery_name="Test Gallery",
                    photo_descriptions=sample_photo_descriptions,
                    length="medium",
                    tone=tone,
                )

            assert result.tone == tone

    @pytest.mark.asyncio
    async def test_generate_story_logs_usage(
        self,
        service: GalleryStoryService,
        mock_gemini_client: MagicMock,
        sample_story_response: dict,
        sample_photo_descriptions: list[dict],
    ) -> None:
        """Test that story generation logs AI usage."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        mock_response = MagicMock()
        mock_response.text = json.dumps(sample_story_response)
        mock_gemini_client.generate_content = AsyncMock(return_value=mock_response)

        with patch.object(
            service.gemini_client,
            "get_client_for_user",
            new_callable=AsyncMock,
            return_value=mock_gemini_client,
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ) as mock_log:
            await service.generate_story(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                gallery_name="Test Gallery",
                photo_descriptions=sample_photo_descriptions,
                length="medium",
                tone="professional",
            )

        mock_log.assert_called_once()
        call_kwargs = mock_log.call_args.kwargs
        assert call_kwargs["user_id"] == user_id
        assert call_kwargs["workspace_id"] == workspace_id
        assert call_kwargs["success"] is True

    @pytest.mark.asyncio
    async def test_generate_story_with_custom_context(
        self,
        service: GalleryStoryService,
        mock_gemini_client: MagicMock,
        sample_story_response: dict,
        sample_photo_descriptions: list[dict],
    ) -> None:
        """Test story generation with custom context."""
        user_id = uuid4()
        workspace_id = uuid4()
        gallery_id = uuid4()

        mock_response = MagicMock()
        mock_response.text = json.dumps(sample_story_response)
        mock_gemini_client.generate_content = AsyncMock(return_value=mock_response)

        with patch.object(
            service.gemini_client,
            "get_client_for_user",
            new_callable=AsyncMock,
            return_value=mock_gemini_client,
        ), patch.object(
            service.ai_usage,
            "log_ai_call",
            new_callable=AsyncMock,
        ):
            result = await service.generate_story(
                user_id=user_id,
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                gallery_name="Wedding of John and Jane",
                photo_descriptions=sample_photo_descriptions,
                length="long",
                tone="poetic",
                custom_context="This was a beach wedding in Malibu, California.",
            )

        assert result is not None
        # The custom context should have been included in the prompt


class TestStoryResult:
    """Test StoryResult data model."""

    def test_create_story_result(self) -> None:
        """Test creating StoryResult instance."""
        result = StoryResult(
            gallery_id="123",
            story="Once upon a time...",
            title="A Beautiful Story",
            length="medium",
            tone="poetic",
            word_count=50,
            photo_count=10,
            themes=["love", "nature"],
        )

        assert result.gallery_id == "123"
        assert result.story == "Once upon a time..."
        assert result.title == "A Beautiful Story"
        assert result.length == "medium"
        assert result.tone == "poetic"
        assert result.word_count == 50
        assert result.photo_count == 10
        assert result.themes == ["love", "nature"]

    def test_story_result_to_dict(self) -> None:
        """Test StoryResult serialization."""
        result = StoryResult(
            gallery_id="456",
            story="Story content here.",
            title="Test Title",
            length="short",
            tone="casual",
            word_count=20,
            photo_count=5,
            themes=["fun"],
        )

        data = result.to_dict()
        assert data["gallery_id"] == "456"
        assert data["story"] == "Story content here."
        assert data["title"] == "Test Title"
        assert data["length"] == "short"
        assert data["tone"] == "casual"
        assert data["word_count"] == 20
        assert data["photo_count"] == 5
        assert data["themes"] == ["fun"]


class TestStoryExport:
    """Test story export functionality."""

    @pytest.fixture
    def service(self) -> GalleryStoryService:
        """Create a GalleryStoryService instance."""
        return GalleryStoryService()

    @pytest.fixture
    def sample_story_result(self) -> StoryResult:
        """Create a sample StoryResult for testing exports."""
        return StoryResult(
            gallery_id="test-gallery",
            story="This is a beautiful story about a memorable day.",
            title="A Memorable Day",
            length="medium",
            tone="professional",
            word_count=9,
            photo_count=5,
            themes=["memories", "celebration"],
        )

    @pytest.mark.asyncio
    async def test_export_text_format(
        self,
        service: GalleryStoryService,
        sample_story_result: StoryResult,
    ) -> None:
        """Test exporting story in text format."""
        exported = await service.export_story(sample_story_result, format="text")

        assert sample_story_result.title in exported
        assert sample_story_result.story in exported

    @pytest.mark.asyncio
    async def test_export_markdown_format(
        self,
        service: GalleryStoryService,
        sample_story_result: StoryResult,
    ) -> None:
        """Test exporting story in markdown format."""
        exported = await service.export_story(sample_story_result, format="markdown")

        assert f"# {sample_story_result.title}" in exported
        assert sample_story_result.story in exported
        assert "**Themes:**" in exported
        assert "*memories*" in exported

    @pytest.mark.asyncio
    async def test_export_html_format(
        self,
        service: GalleryStoryService,
        sample_story_result: StoryResult,
    ) -> None:
        """Test exporting story in HTML format."""
        exported = await service.export_story(sample_story_result, format="html")

        assert f"<h1>{sample_story_result.title}</h1>" in exported
        assert sample_story_result.story in exported
        assert '<article class="gallery-story">' in exported
        assert "<em>memories</em>" in exported

    @pytest.mark.asyncio
    async def test_export_invalid_format(
        self,
        service: GalleryStoryService,
        sample_story_result: StoryResult,
    ) -> None:
        """Test that invalid export format raises error."""
        with pytest.raises(ValueError, match="Unsupported export format"):
            await service.export_story(sample_story_result, format="pdf")
