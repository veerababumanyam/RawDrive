"""Gallery Story Generation Service.

Uses AI to generate narrative stories for photo galleries based on their content.
Feature: 010-ai-powered-features
Tasks: T045-T055
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Literal, Optional
from uuid import UUID

from app.config.settings import get_settings
from app.db.redis import get_redis_client
from app.services.gemini_client_service import get_gemini_client_service
from app.services.ai_usage_service import get_ai_usage_service, AIFeatureType

logger = logging.getLogger(__name__)

# Cache TTL for generated stories (24 hours)
STORY_CACHE_TTL = 86400


# ---------------------------------------------------------------------------
# Type Aliases
# ---------------------------------------------------------------------------

StoryLength = Literal["short", "medium", "long"]
StoryTone = Literal["professional", "casual", "poetic", "journalistic"]


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


class StoryResult:
    """Gallery story generation result."""

    def __init__(
        self,
        gallery_id: str,
        story: str,
        title: str,
        length: StoryLength,
        tone: StoryTone,
        word_count: int,
        photo_count: int,
        themes: list[str],
    ):
        self.gallery_id = gallery_id
        self.story = story
        self.title = title
        self.length = length
        self.tone = tone
        self.word_count = word_count
        self.photo_count = photo_count
        self.themes = themes

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "gallery_id": self.gallery_id,
            "story": self.story,
            "title": self.title,
            "length": self.length,
            "tone": self.tone,
            "word_count": self.word_count,
            "photo_count": self.photo_count,
            "themes": self.themes,
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class GalleryStoryService:
    """Service for AI-powered gallery story generation."""

    # Word count ranges by length
    LENGTH_WORD_COUNTS = {
        "short": (50, 100),
        "medium": (150, 300),
        "long": (400, 600),
    }

    def __init__(self):
        self.settings = get_settings()
        self.gemini_client = get_gemini_client_service()
        self.ai_usage = get_ai_usage_service()

    def _get_cache_key(
        self,
        gallery_id: UUID,
        length: StoryLength,
        tone: StoryTone,
        custom_context: Optional[str],
    ) -> str:
        """Generate a cache key for story lookup."""
        context_hash = hashlib.md5(
            (custom_context or "").encode()
        ).hexdigest()[:8]
        return f"story:{gallery_id}:{length}:{tone}:{context_hash}"

    async def get_cached_story(
        self,
        gallery_id: UUID,
        length: StoryLength,
        tone: StoryTone,
        custom_context: Optional[str] = None,
    ) -> Optional[StoryResult]:
        """Get a cached story if available."""
        try:
            redis = await get_redis_client()
            cache_key = self._get_cache_key(gallery_id, length, tone, custom_context)
            cached = await redis.get(cache_key)
            if cached:
                data = json.loads(cached)
                logger.info(f"Story cache hit for gallery {gallery_id}")
                return StoryResult(**data)
            return None
        except Exception as e:
            logger.warning(f"Failed to get cached story: {e}")
            return None

    async def cache_story(self, story: StoryResult, custom_context: Optional[str] = None) -> None:
        """Cache a generated story."""
        try:
            redis = await get_redis_client()
            cache_key = self._get_cache_key(
                UUID(story.gallery_id), story.length, story.tone, custom_context
            )
            await redis.setex(cache_key, STORY_CACHE_TTL, json.dumps(story.to_dict()))
            logger.info(f"Cached story for gallery {story.gallery_id}")
        except Exception as e:
            logger.warning(f"Failed to cache story: {e}")

    async def invalidate_story_cache(self, gallery_id: UUID) -> None:
        """Invalidate all cached stories for a gallery."""
        try:
            redis = await get_redis_client()
            pattern = f"story:{gallery_id}:*"
            keys = []
            async for key in redis.scan_iter(match=pattern):
                keys.append(key)
            if keys:
                await redis.delete(*keys)
                logger.info(f"Invalidated {len(keys)} cached stories for gallery {gallery_id}")
        except Exception as e:
            logger.warning(f"Failed to invalidate story cache: {e}")

    async def generate_story(
        self,
        user_id: UUID,
        workspace_id: UUID,
        gallery_id: UUID,
        gallery_name: str,
        photo_descriptions: list[dict[str, Any]],
        length: StoryLength = "medium",
        tone: StoryTone = "professional",
        custom_context: Optional[str] = None,
        use_cache: bool = True,
    ) -> StoryResult:
        """Generate a narrative story for a gallery.

        Args:
            user_id: The user requesting generation
            workspace_id: The workspace context
            gallery_id: The gallery ID
            gallery_name: Name of the gallery
            photo_descriptions: List of photo metadata/descriptions
            length: Story length (short, medium, long)
            tone: Story tone (professional, casual, poetic, journalistic)
            custom_context: Optional additional context for the story
            use_cache: Whether to use/store cached results (default: True)

        Returns:
            StoryResult with generated story
        """
        try:
            # Validate inputs
            if length not in self.LENGTH_WORD_COUNTS:
                raise ValueError(f"Invalid length: {length}. Must be short, medium, or long.")
            if tone not in ["professional", "casual", "poetic", "journalistic"]:
                raise ValueError(f"Invalid tone: {tone}.")

            # Check cache first
            if use_cache:
                cached = await self.get_cached_story(gallery_id, length, tone, custom_context)
                if cached:
                    return cached

            # Get user's Gemini client
            client = await self.gemini_client.get_client_for_user(user_id, workspace_id)

            # Build story prompt
            prompt = self._build_story_prompt(
                gallery_name=gallery_name,
                photo_descriptions=photo_descriptions,
                length=length,
                tone=tone,
                custom_context=custom_context,
            )

            # Make API call (text-only, no images for performance)
            response = await client.generate_content(
                contents=[{"parts": [{"text": prompt}]}]
            )

            # Parse response
            result = self._parse_story_response(
                response.text,
                gallery_id=str(gallery_id),
                length=length,
                tone=tone,
                photo_count=len(photo_descriptions),
            )

            # Log usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier=client.model,
                feature_type=AIFeatureType.STORY_GENERATION,
                success=True,
                metadata={
                    "gallery_id": str(gallery_id),
                    "length": length,
                    "tone": tone,
                    "photo_count": len(photo_descriptions),
                },
            )

            # Cache the result
            if use_cache:
                await self.cache_story(result, custom_context)

            return result

        except Exception as e:
            logger.error(f"Story generation failed: {e}", exc_info=True)
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
        gallery_name: str,
        photo_descriptions: list[dict[str, Any]],
        length: StoryLength,
        tone: StoryTone,
        custom_context: Optional[str],
    ) -> str:
        """Build the story generation prompt."""
        min_words, max_words = self.LENGTH_WORD_COUNTS[length]

        tone_guidelines = {
            "professional": "Use polished, business-appropriate language. Focus on quality, craftsmanship, and the significance of captured moments.",
            "casual": "Use friendly, conversational language. Make it feel like you're sharing the story with a friend.",
            "poetic": "Use artistic, evocative language with metaphors and imagery. Create an emotional, dreamy narrative.",
            "journalistic": "Use clear, informative language. Report on the event/occasion with attention to details and significance.",
        }

        # Summarize photo descriptions
        photo_summaries = []
        for i, photo in enumerate(photo_descriptions[:20], 1):  # Limit to 20 photos
            summary_parts = []
            if "description" in photo:
                summary_parts.append(photo["description"])
            if "tags" in photo and photo["tags"]:
                summary_parts.append(f"Tags: {', '.join(photo['tags'][:5])}")
            if "mood" in photo:
                summary_parts.append(f"Mood: {photo['mood']}")
            if summary_parts:
                photo_summaries.append(f"Photo {i}: {' | '.join(summary_parts)}")

        photos_context = "\n".join(photo_summaries) if photo_summaries else "Various photographs"

        custom_section = f"\n\nAdditional context: {custom_context}" if custom_context else ""

        return f"""Create a narrative story for a photo gallery titled "{gallery_name}".

Gallery Information:
- Number of photos: {len(photo_descriptions)}
- Photo details:
{photos_context}
{custom_section}

Story Requirements:
- Tone: {tone} ({tone_guidelines[tone]})
- Length: {length} ({min_words}-{max_words} words)
- Create a cohesive narrative that ties the photos together
- Include a compelling title for the story
- Identify 3-5 key themes from the photos

Return your response in this exact JSON format:
{{
  "title": "Story Title",
  "story": "The narrative story text...",
  "themes": ["theme1", "theme2", "theme3"]
}}

Important: Return ONLY the JSON object, no additional text."""

    def _parse_story_response(
        self,
        response_text: str,
        gallery_id: str,
        length: StoryLength,
        tone: StoryTone,
        photo_count: int,
    ) -> StoryResult:
        """Parse story generation response."""
        try:
            # Extract JSON object
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start == -1 or json_end == 0:
                raise ValueError("No JSON object found")

            json_str = response_text[json_start:json_end]
            data = json.loads(json_str)

            if not isinstance(data, dict):
                raise ValueError("Response is not a dict")

            story = data.get("story", "")
            title = data.get("title", "Untitled Story")
            themes = data.get("themes", [])

            # Count words
            word_count = len(story.split())

            return StoryResult(
                gallery_id=gallery_id,
                story=story,
                title=title,
                length=length,
                tone=tone,
                word_count=word_count,
                photo_count=photo_count,
                themes=themes if isinstance(themes, list) else [],
            )

        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Failed to parse story response: {e}")
            return StoryResult(
                gallery_id=gallery_id,
                story="Story generation failed. Please try again.",
                title="Error",
                length=length,
                tone=tone,
                word_count=0,
                photo_count=photo_count,
                themes=[],
            )

    async def export_story(
        self,
        story_result: StoryResult,
        format: Literal["text", "markdown", "html"] = "text",
    ) -> str:
        """Export a story in the specified format.

        Args:
            story_result: The generated story
            format: Export format (text, markdown, html)

        Returns:
            Formatted story string
        """
        if format == "text":
            return f"{story_result.title}\n\n{story_result.story}"

        elif format == "markdown":
            themes_md = ", ".join(f"*{t}*" for t in story_result.themes)
            return f"""# {story_result.title}

{story_result.story}

---

**Themes:** {themes_md}
**Photos:** {story_result.photo_count}
**Words:** {story_result.word_count}
"""

        elif format == "html":
            themes_html = ", ".join(f"<em>{t}</em>" for t in story_result.themes)
            return f"""<article class="gallery-story">
  <h1>{story_result.title}</h1>
  <div class="story-content">
    {story_result.story}
  </div>
  <footer class="story-meta">
    <p><strong>Themes:</strong> {themes_html}</p>
    <p><strong>Photos:</strong> {story_result.photo_count}</p>
    <p><strong>Words:</strong> {story_result.word_count}</p>
  </footer>
</article>"""

        else:
            raise ValueError(f"Unsupported export format: {format}")


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
