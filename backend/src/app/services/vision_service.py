"""Vision AI Service.

Consolidates AI-powered visual analysis and generation features:
- Photo Analysis (Metadata, Quality, aesthetics)
- Caption Generation
- Hashtag Generation

Feature: AI-powered photo analysis & generation
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from app.config.settings import get_settings
from app.services.gemini_client_service import get_gemini_client_service
from app.services.ai_usage_service import get_ai_usage_service, AIFeatureType
from app.services.ai_request_deduplication import get_ai_deduplication_service
from app.repositories.asset_analysis_repository import get_asset_analysis_repository

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


class PhotoAnalysis:
    """Photo analysis result."""

    def __init__(
        self,
        description: str,
        tags: list[str],
        hashtags: list[str],
        quality_score: int,
        sharpness: int,
        exposure: int,
        composition: int,
        dominant_colors: list[str],
        lighting: str,
        mood: str,
        improvements: list[str],
        best_for: list[str],
        event_type: Optional[str] = None,
        key_elements: list[str] = None,
        activity: Optional[str] = None,
        semantic_description: Optional[str] = None,
    ):
        self.description = description
        self.tags = tags
        self.hashtags = hashtags
        self.quality_score = quality_score
        self.sharpness = sharpness
        self.exposure = exposure
        self.composition = composition
        self.dominant_colors = dominant_colors
        self.lighting = lighting
        self.mood = mood
        self.improvements = improvements
        self.best_for = best_for
        self.event_type = event_type
        self.key_elements = key_elements or []
        self.activity = activity
        self.semantic_description = semantic_description

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "description": self.description,
            "tags": self.tags,
            "hashtags": self.hashtags,
            "quality_score": self.quality_score,
            "sharpness": self.sharpness,
            "exposure": self.exposure,
            "composition": self.composition,
            "dominant_colors": self.dominant_colors,
            "lighting": self.lighting,
            "mood": self.mood,
            "improvements": self.improvements,
            "best_for": self.best_for,
            "event_type": self.event_type,
            "key_elements": self.key_elements,
            "activity": self.activity,
            "semantic_description": self.semantic_description,
        }


class CaptionResult:
    """Caption generation result."""

    def __init__(
        self,
        captions: list[str],
        style: str,
        photo_id: Optional[str] = None,
    ):
        self.captions = captions
        self.style = style
        self.photo_id = photo_id

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "captions": self.captions,
            "style": self.style,
            "photo_id": self.photo_id,
        }


class HashtagResult:
    """Hashtag generation result."""

    def __init__(
        self,
        hashtags: list[str],
        categories: dict[str, list[str]],
        photo_id: Optional[str] = None,
    ):
        self.hashtags = hashtags
        self.categories = categories
        self.photo_id = photo_id

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "hashtags": self.hashtags,
            "categories": self.categories,
            "photo_id": self.photo_id,
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class VisionService:
    """Unified Service for AI-powered vision tasks."""

    def __init__(self):
        self.settings = get_settings()
        self.gemini_client = get_gemini_client_service()
        self.ai_usage = get_ai_usage_service()
        self.dedup = get_ai_deduplication_service()
        self.asset_analysis_repo = get_asset_analysis_repository()

    # -----------------------------------------------------------------------
    # Photo Analysis
    # -----------------------------------------------------------------------

    async def analyze_photo(
        self,
        user_id: UUID,
        workspace_id: UUID,
        photo_url: str,
        photo_id: Optional[UUID] = None,
    ) -> PhotoAnalysis:
        """Analyze a photo using AI."""
        # Generate deduplication key
        cache_key = self.dedup.generate_request_key(
            operation="analysis",
            user_id=user_id,
            photo_id=photo_id,
        )

        # Use deduplication to prevent duplicate concurrent requests
        return await self.dedup.deduplicated_call(
            cache_key=cache_key,
            operation=lambda: self._analyze_photo_impl(
                user_id, workspace_id, photo_url, photo_id
            ),
        )

    async def _analyze_photo_impl(
        self,
        user_id: UUID,
        workspace_id: UUID,
        photo_url: str,
        photo_id: Optional[UUID],
    ) -> PhotoAnalysis:
        """Internal implementation of photo analysis."""
        try:
            # Get user's Gemini client
            client = await self.gemini_client.get_client_for_user(user_id, workspace_id)

            # Build analysis prompt
            prompt = self._build_analysis_prompt()

            # Fetch image data with caching
            image_data = await self._fetch_image_data(photo_url)

            # Make API call
            response = await client.generate_content(
                contents=[
                    {
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/jpeg", "data": image_data}}
                        ]
                    }
                ]
            )

            # Parse response
            result = self._parse_analysis_response(response.text)

            # Log usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier=client.model,
                feature_type=AIFeatureType.PHOTO_ANALYSIS,
                success=True,
                metadata={"photo_id": str(photo_id)} if photo_id else None,
            )

            # Store full analysis result in asset_analysis table
            if photo_id:
                try:
                    await self.asset_analysis_repo.update_vision_status(
                        workspace_id=workspace_id,
                        asset_id=photo_id,
                        vision_status="completed",
                        vision_provider=client.model,
                        vision_tags_count=len(result.tags),
                        ai_metadata=result.to_dict(),
                    )
                except Exception as db_err:
                    logger.warning(
                        "Failed to store photo analysis in DB",
                        extra={"error": str(db_err), "photo_id": str(photo_id)},
                    )

            return result

        except Exception as e:
            # Log failed usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="unknown",
                feature_type=AIFeatureType.PHOTO_ANALYSIS,
                success=False,
                error_code=str(type(e).__name__),
            )
            raise

    # -----------------------------------------------------------------------
    # Caption Generation
    # -----------------------------------------------------------------------

    async def generate_captions(
        self,
        user_id: UUID,
        workspace_id: UUID,
        photo_url: str,
        style: str = "professional",
        count: int = 3,
        photo_id: Optional[UUID] = None,
    ) -> CaptionResult:
        """Generate captions for a photo using AI."""
        # Generate deduplication key
        cache_key = self.dedup.generate_request_key(
            operation="captions",
            user_id=user_id,
            photo_id=photo_id,
            style=style,
            count=count,
        )

        return await self.dedup.deduplicated_call(
            cache_key=cache_key,
            operation=lambda: self._generate_captions_impl(
                user_id, workspace_id, photo_url, style, count, photo_id
            ),
        )

    async def _generate_captions_impl(
        self,
        user_id: UUID,
        workspace_id: UUID,
        photo_url: str,
        style: str,
        count: int,
        photo_id: Optional[UUID],
    ) -> CaptionResult:
        try:
            client = await self.gemini_client.get_client_for_user(user_id, workspace_id)
            prompt = self._build_caption_prompt(style, count)
            image_data = await self._fetch_image_data(photo_url)

            response = await client.generate_content(
                contents=[
                    {
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/jpeg", "data": image_data}}
                        ]
                    }
                ]
            )

            result = self._parse_caption_response(response.text, style)

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
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="unknown",
                feature_type=AIFeatureType.CAPTION_GENERATION,
                success=False,
                error_code=str(type(e).__name__),
            )
            raise

    # -----------------------------------------------------------------------
    # Hashtag Generation
    # -----------------------------------------------------------------------

    async def generate_hashtags(
        self,
        user_id: UUID,
        workspace_id: UUID,
        photo_url: str,
        count: int = 15,
        photo_id: Optional[UUID] = None,
    ) -> HashtagResult:
        """Generate hashtags for a photo using AI."""
        # Generate deduplication key
        cache_key = self.dedup.generate_request_key(
            operation="hashtags",
            user_id=user_id,
            photo_id=photo_id,
            count=count,
        )

        return await self.dedup.deduplicated_call(
            cache_key=cache_key,
            operation=lambda: self._generate_hashtags_impl(
                user_id, workspace_id, photo_url, count, photo_id
            ),
        )

    async def _generate_hashtags_impl(
        self,
        user_id: UUID,
        workspace_id: UUID,
        photo_url: str,
        count: int,
        photo_id: Optional[UUID],
    ) -> HashtagResult:
        try:
            client = await self.gemini_client.get_client_for_user(user_id, workspace_id)
            prompt = self._build_hashtag_prompt(count)
            image_data = await self._fetch_image_data(photo_url)

            response = await client.generate_content(
                contents=[
                    {
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/jpeg", "data": image_data}}
                        ]
                    }
                ]
            )

            result = self._parse_hashtag_response(response.text)

            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier=client.model,
                feature_type=AIFeatureType.AUTO_TAGGING,
                success=True,
                metadata={"photo_id": str(photo_id), "count": count} if photo_id else {"count": count},
            )

            return result

        except Exception as e:
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="unknown",
                feature_type=AIFeatureType.AUTO_TAGGING,
                success=False,
                error_code=str(type(e).__name__),
            )
            raise

    # -----------------------------------------------------------------------
    # Remote Data Helpers
    # -----------------------------------------------------------------------

    async def _fetch_image_data(self, photo_url: str) -> bytes:
        """Fetch image data; kept as a separate method for easier testing/mocking."""
        return await self.dedup.fetch_image_data(photo_url)

    # -----------------------------------------------------------------------
    # Prompts
    # -----------------------------------------------------------------------

    def _build_analysis_prompt(self) -> str:
        """Build the analysis prompt for Gemini."""
        return """Analyze this photo and provide a detailed assessment in the following JSON format:

{
  "description": "A detailed description of the photo content",
  "tags": ["tag1", "tag2", "tag3"],
  "hashtags": ["#hashtag1", "#hashtag2"],
  "quality_score": 85,
  "sharpness": 80,
  "exposure": 90,
  "composition": 85,
  "dominant_colors": ["#FF5733", "#33FF57"],
  "lighting": "natural",
  "mood": "joyful",
  "improvements": ["Adjust exposure +0.5", "Crop to rule of thirds"],
  "best_for": ["web", "print", "social"]
}

Requirements:
- quality_score: Overall quality 0-100
- sharpness: Focus/clarity 0-100
- exposure: Brightness/contrast 0-100
- composition: Framing/balance 0-100
- lighting: "natural", "artificial", "mixed", "studio", "dramatic"
- mood: Emotional tone (joyful, serene, dramatic, etc.)
- improvements: Specific actionable suggestions
- best_for: Where this photo works best
- tags: Descriptive keywords
- hashtags: Social media ready hashtags
- event_type: Specific event classification (e.g., Wedding, Corporate, Birthday)
- key_elements: Notable objects/attire (e.g., Red Saree, Tiered Cake, Tuxedo)
- activity: Main action occurring (e.g., Cutting Cake, Dancing, Speech)
- semantic_description: A dense, keyword-rich paragraph optimized for vector similarity search."""

    def _build_caption_prompt(self, style: str, count: int) -> str:
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

    # -----------------------------------------------------------------------
    # Parsers
    # -----------------------------------------------------------------------

    def _parse_analysis_response(self, response_text: str) -> PhotoAnalysis:
        """Parse Gemini response into PhotoAnalysis object."""
        try:
            # Extract JSON from response
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start == -1 or json_end == 0:
                raise ValueError("No JSON found in response")

            json_str = response_text[json_start:json_end]
            data = json.loads(json_str)

            return PhotoAnalysis(
                description=data.get("description", ""),
                tags=data.get("tags", []),
                hashtags=data.get("hashtags", []),
                quality_score=max(0, min(100, data.get("quality_score", 50))),
                sharpness=max(0, min(100, data.get("sharpness", 50))),
                exposure=max(0, min(100, data.get("exposure", 50))),
                composition=max(0, min(100, data.get("composition", 50))),
                dominant_colors=data.get("dominant_colors", []),
                lighting=data.get("lighting", "unknown"),
                mood=data.get("mood", "neutral"),
                improvements=data.get("improvements", []),
                best_for=data.get("best_for", []),
                event_type=data.get("event_type"),
                key_elements=data.get("key_elements", []),
                activity=data.get("activity"),
                semantic_description=data.get("semantic_description"),
            )

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.error(f"Failed to parse analysis response: {e}")
            # Return default analysis
            return PhotoAnalysis(
                description="Photo analysis unavailable",
                tags=[],
                hashtags=[],
                quality_score=50,
                sharpness=50,
                exposure=50,
                composition=50,
                dominant_colors=[],
                lighting="unknown",
                mood="neutral",
                improvements=[],
                best_for=[],
                event_type=None,
                key_elements=[],
                activity=None,
                semantic_description=None,
            )

    def _parse_caption_response(self, response_text: str, style: str) -> CaptionResult:
        try:
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
        try:
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


_vision_service: Optional[VisionService] = None


def get_vision_service() -> VisionService:
    """Get the unified vision service instance."""
    global _vision_service
    if _vision_service is None:
        _vision_service = VisionService()
    return _vision_service
