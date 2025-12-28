"""Gallery Story Service.

Uses AI to generate written narratives about photo galleries.
Feature: AI-powered gallery story generation (US4)
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from app.config.settings import get_settings
from app.services.gemini_client_service import get_gemini_client_service
from app.services.ai_usage_service import get_ai_usage_service, AIFeatureType
from app.services.ai_cache_service import get_ai_cache_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


class StoryResult:
    """Gallery story generation result."""

    def __init__(
        self,
        story: str,
        length: str,
        tone: str,
        word_count: int,
    ):
        self.story = story
        self.length = length
        self.tone = tone
        self.word_count = word_count

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "story": self.story,
            "length": self.length,
            "tone": self.tone,
            "word_count": self.word_count,
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class GalleryStoryService:
    """Service for AI-powered gallery story generation."""

    # Word count targets for each length option
    LENGTH_TARGETS = {
        "short": (100, 150),
        "medium": (250, 350),
        "long": (500, 700),
    }

    def __init__(self):
        self.settings = get_settings()
        self.gemini_client = get_gemini_client_service()
        self.ai_usage = get_ai_usage_service()
        self.ai_cache = get_ai_cache_service()

    async def generate_story(
        self,
        user_id: UUID,
        workspace_id: UUID,
        gallery_id: UUID,
        photo_analyses: list[dict[str, Any]],
        length: str = "medium",
        tone: str = "professional",
    ) -> StoryResult:
        """Generate a story for a gallery based on analyzed photos.

        Args:
            user_id: The user requesting generation
            workspace_id: The workspace context
            gallery_id: The gallery ID
            photo_analyses: List of photo analysis results (from photo_analysis_service)
            length: Story length - 'short', 'medium', 'long'
            tone: Story tone - 'professional', 'casual', 'poetic', 'journalistic'

        Returns:
            StoryResult with generated story

        Raises:
            ValueError: If fewer than 5 photos provided
            AIConfigurationError: If AI is not configured
            AIRuntimeError: If generation fails
        """
        # Validate minimum photos
        if len(photo_analyses) < 5:
            raise ValueError("At least 5 analyzed photos are required for story generation")

        # Check cache first
        cached = await self.ai_cache.get_gallery_story(gallery_id, length, tone)
        if cached:
            logger.debug(f"Returning cached story for gallery {gallery_id}")
            return StoryResult(
                story=cached.get("story", ""),
                length=cached.get("length", length),
                tone=cached.get("tone", tone),
                word_count=cached.get("word_count", 0),
            )

        try:
            # Get user's Gemini client
            client = await self.gemini_client.get_client_for_user(user_id)

            # Build story prompt
            prompt = self._build_story_prompt(photo_analyses, length, tone)

            # Make API call
            response = await client.generate_content(
                contents=[{"parts": [{"text": prompt}]}]
            )

            # Parse response
            story_text = self._parse_story_response(response.text)
            word_count = len(story_text.split())

            result = StoryResult(
                story=story_text,
                length=length,
                tone=tone,
                word_count=word_count,
            )

            # Cache the result
            await self.ai_cache.set_gallery_story(gallery_id, length, tone, result.to_dict())

            # Log usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier=client.model,
                feature_type=AIFeatureType.STORY_GENERATION,
                success=True,
                metadata={
                    "gallery_id": str(gallery_id),
                    "photo_count": len(photo_analyses),
                    "length": length,
                    "tone": tone,
                },
            )

            return result

        except Exception as e:
            # Log failed usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="unknown",
                feature_type=AIFeatureType.STORY_GENERATION,
                success=False,
                error_code=str(type(e).__name__),
            )
            raise

    def _build_story_prompt(
        self,
        photo_analyses: list[dict[str, Any]],
        length: str,
        tone: str,
    ) -> str:
        """Build the story generation prompt."""
        min_words, max_words = self.LENGTH_TARGETS.get(length, (250, 350))

        # Summarize photo analyses for context
        photo_summaries = []
        for i, analysis in enumerate(photo_analyses[:20], 1):  # Limit to 20 photos
            desc = analysis.get("description", "A photo")
            mood = analysis.get("mood", "neutral")
            lighting = analysis.get("lighting", "unknown")
            tags = ", ".join(analysis.get("tags", [])[:5])

            photo_summaries.append(
                f"Photo {i}: {desc} (mood: {mood}, lighting: {lighting}, tags: {tags})"
            )

        photos_context = "\n".join(photo_summaries)

        tone_instructions = {
            "professional": "Write in a polished, business-appropriate tone suitable for portfolios and client presentations. Use sophisticated vocabulary and maintain a formal register.",
            "casual": "Write in a friendly, conversational tone as if telling a friend about these photos. Keep it warm and engaging but not too formal.",
            "poetic": "Write in an artistic, evocative style with metaphors and imagery. Focus on emotions, atmosphere, and the beauty captured in the photos.",
            "journalistic": "Write in a clear, objective style like a photo essay or magazine article. Focus on the story and context behind the photos.",
        }

        return f"""You are a skilled writer creating a narrative about a photo gallery.

Based on the following {len(photo_analyses)} photos, write a cohesive story that captures the essence of this collection.

PHOTOS IN THE GALLERY:
{photos_context}

WRITING REQUIREMENTS:
- Length: {min_words}-{max_words} words
- Tone: {tone_instructions.get(tone, tone_instructions["professional"])}
- Create a narrative that flows naturally and connects the photos thematically
- Reference specific photos when appropriate (use descriptions, not numbers)
- Include an engaging opening and a satisfying conclusion
- Focus on emotions, atmosphere, and the story the photos tell together

Write only the story text, no additional commentary or formatting.
"""

    def _parse_story_response(self, response_text: str) -> str:
        """Parse and clean the story response."""
        # Remove any markdown formatting if present
        story = response_text.strip()

        # Remove potential JSON wrapper if AI returns structured data
        if story.startswith("{") and story.endswith("}"):
            try:
                data = json.loads(story)
                story = data.get("story", data.get("text", story))
            except json.JSONDecodeError:
                pass

        # Remove quotes if wrapped
        if story.startswith('"') and story.endswith('"'):
            story = story[1:-1]

        return story.strip()


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------


_gallery_story_service: Optional[GalleryStoryService] = None


def get_gallery_story_service() -> GalleryStoryService:
    """Get the gallery story service instance."""
    global _gallery_story_service
    if _gallery_story_service is None:
        _gallery_story_service = GalleryStoryService()
    return _gallery_story_service
