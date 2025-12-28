"""Caption and Hashtag Generation Service.

Uses AI to generate captions and hashtags for photos.
Feature: AI-powered caption and hashtag generation
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from app.config.settings import get_settings
from app.services.gemini_client_service import get_gemini_client_service
from app.services.ai_usage_service import get_ai_usage_service, AIFeatureType

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


class CaptionResult:
    """Caption generation result."""

    def __init__(
        self,
        captions: list[str],
        style: str,
    ):
        self.captions = captions
        self.style = style

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "captions": self.captions,
            "style": self.style,
        }


class HashtagResult:
    """Hashtag generation result."""

    def __init__(
        self,
        hashtags: list[str],
        categories: dict[str, list[str]],
    ):
        self.hashtags = hashtags
        self.categories = categories

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "hashtags": self.hashtags,
            "categories": self.categories,
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class CaptionHashtagService:
    """Service for AI-powered caption and hashtag generation."""

    def __init__(self):
        self.settings = get_settings()
        self.gemini_client = get_gemini_client_service()
        self.ai_usage = get_ai_usage_service()

    async def generate_captions(
        self,
        user_id: UUID,
        workspace_id: UUID,
        photo_url: str,
        style: str = "professional",
        count: int = 3,
        photo_id: Optional[UUID] = None,
    ) -> CaptionResult:
        """Generate captions for a photo using AI.

        Args:
            user_id: The user requesting generation
            workspace_id: The workspace context
            photo_url: URL to the photo
            style: Caption style (professional, casual, poetic)
            count: Number of captions to generate
            photo_id: Optional photo ID for logging

        Returns:
            CaptionResult with generated captions
        """
        try:
            # Get user's Gemini client
            client = await self.gemini_client.get_client_for_user(user_id)

            # Build caption prompt
            prompt = self._build_caption_prompt(style, count)

            # Make API call
            response = await client.generate_content(
                contents=[
                    {
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/jpeg", "data": await self._fetch_image_data(photo_url)}}
                        ]
                    }
                ]
            )

            # Parse response
            result = self._parse_caption_response(response.text, style)

            # Log usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier=client.model,
                feature_type=AIFeatureType.CAPTION_GENERATION,
                success=True,
                metadata={"photo_id": str(photo_id), "style": style} if photo_id else {"style": style},
            )

            return result

        except Exception as e:
            # Log failed usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="unknown",
                feature_type=AIFeatureType.CAPTION_GENERATION,
                success=False,
                error_code=str(type(e).__name__),
            )
            raise

    async def generate_hashtags(
        self,
        user_id: UUID,
        workspace_id: UUID,
        photo_url: str,
        count: int = 15,
        photo_id: Optional[UUID] = None,
    ) -> HashtagResult:
        """Generate hashtags for a photo using AI.

        Args:
            user_id: The user requesting generation
            workspace_id: The workspace context
            photo_url: URL to the photo
            count: Number of hashtags to generate
            photo_id: Optional photo ID for logging

        Returns:
            HashtagResult with generated hashtags
        """
        try:
            # Get user's Gemini client
            client = await self.gemini_client.get_client_for_user(user_id)

            # Build hashtag prompt
            prompt = self._build_hashtag_prompt(count)

            # Make API call
            response = await client.generate_content(
                contents=[
                    {
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/jpeg", "data": await self._fetch_image_data(photo_url)}}
                        ]
                    }
                ]
            )

            # Parse response
            result = self._parse_hashtag_response(response.text)

            # Log usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier=client.model,
                feature_type=AIFeatureType.AUTO_TAGGING,  # Using existing feature type
                success=True,
                metadata={"photo_id": str(photo_id), "count": count} if photo_id else {"count": count},
            )

            return result

        except Exception as e:
            # Log failed usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="unknown",
                feature_type=AIFeatureType.AUTO_TAGGING,
                success=False,
                error_code=str(type(e).__name__),
            )
            raise

    async def _fetch_image_data(self, photo_url: str) -> str:
        """Fetch image data from URL and encode as base64."""
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(photo_url)
            response.raise_for_status()
            # Return base64 encoded data
            import base64
            return base64.b64encode(response.content).decode()

    def _build_caption_prompt(self, style: str, count: int) -> str:
        """Build the caption generation prompt."""
        style_examples = {
            "professional": "Business-appropriate, polished language. Example: 'Elegant portrait capturing the subject's poise and confidence in natural lighting.'",
            "casual": "Friendly, conversational tone. Example: 'Love this beautiful portrait with amazing natural light!'",
            "poetic": "Artistic, metaphorical language. Example: 'A moment frozen in time, where light dances across serene features like whispers of dawn.'",
        }

        return f"""Generate {count} unique captions for this photo in {style} style.

Style description: {style_examples.get(style, style)}

Requirements:
- Each caption should be 10-50 words
- Vary the length and focus for different use cases
- Make them engaging and relevant to the photo content
- Use the specified style consistently

Return only a JSON array of strings:
["Caption 1", "Caption 2", "Caption 3"]"""

    def _build_hashtag_prompt(self, count: int) -> str:
        """Build the hashtag generation prompt."""
        return f"""Generate {count} relevant hashtags for this photo, organized by category.

Categories:
- trending: Popular, viral hashtags
- niche: Photography-specific hashtags
- general: Broad appeal hashtags
- branded: Could include studio/client specific (use generic if unsure)

Requirements:
- Total hashtags: {count}
- Mix of categories, prioritize trending and niche
- Include both popular and specific hashtags
- All hashtags should start with #

Return only JSON in this format:
{{
  "trending": ["#hashtag1", "#hashtag2"],
  "niche": ["#hashtag3", "#hashtag4"],
  "general": ["#hashtag5", "#hashtag6"],
  "branded": ["#hashtag7", "#hashtag8"]
}}"""

    def _parse_caption_response(self, response_text: str, style: str) -> CaptionResult:
        """Parse caption response."""
        try:
            # Extract JSON array
            json_start = response_text.find('[')
            json_end = response_text.rfind(']') + 1
            if json_start == -1 or json_end == 0:
                raise ValueError("No JSON array found")

            json_str = response_text[json_start:json_end]
            captions = json.loads(json_str)

            if not isinstance(captions, list):
                raise ValueError("Response is not a list")

            return CaptionResult(captions=captions, style=style)

        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Failed to parse caption response: {e}")
            return CaptionResult(captions=["Caption generation failed"], style=style)

    def _parse_hashtag_response(self, response_text: str) -> HashtagResult:
        """Parse hashtag response."""
        try:
            # Extract JSON object
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start == -1 or json_end == 0:
                raise ValueError("No JSON object found")

            json_str = response_text[json_start:json_end]
            data = json.loads(json_str)

            if not isinstance(data, dict):
                raise ValueError("Response is not a dict")

            # Flatten all hashtags
            all_hashtags = []
            for category_hashtags in data.values():
                if isinstance(category_hashtags, list):
                    all_hashtags.extend(category_hashtags)

            return HashtagResult(hashtags=all_hashtags, categories=data)

        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Failed to parse hashtag response: {e}")
            return HashtagResult(hashtags=["#photo"], categories={"general": ["#photo"]})


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------


_caption_hashtag_service: Optional[CaptionHashtagService] = None


def get_caption_hashtag_service() -> CaptionHashtagService:
    """Get the caption and hashtag service instance."""
    global _caption_hashtag_service
    if _caption_hashtag_service is None:
        _caption_hashtag_service = CaptionHashtagService()
    return _caption_hashtag_service