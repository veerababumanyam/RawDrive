"""Photo Analysis Service.

Uses AI to analyze photos for metadata, quality scoring, colors, lighting, mood, and suggestions.
Feature: AI-powered photo analysis
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

import base64
import httpx

from app.config.settings import get_settings
from app.services.gemini_client_service import get_gemini_client_service
from app.services.ai_usage_service import get_ai_usage_service, AIFeatureType
from app.services.ai_cache_service import get_ai_cache_service

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
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class PhotoAnalysisService:
    """Service for AI-powered photo analysis."""

    def __init__(self):
        self.settings = get_settings()
        self.gemini_client = get_gemini_client_service()
        self.ai_usage = get_ai_usage_service()
        self.ai_cache = get_ai_cache_service()

    async def analyze_photo(
        self,
        user_id: UUID,
        workspace_id: UUID,
        photo_url: str,
        photo_id: Optional[UUID] = None,
        asset_sha256: Optional[str] = None,
    ) -> PhotoAnalysis:
        """Analyze a photo using AI.

        Args:
            user_id: The user requesting analysis
            workspace_id: The workspace context
            photo_url: URL to the photo to analyze
            photo_id: Optional photo ID for logging
            asset_sha256: Optional SHA256 hash for caching

        Returns:
            PhotoAnalysis result

        Raises:
            AIConfigurationError: If AI is not configured
            AIRuntimeError: If analysis fails
        """
        # Check cache first if SHA256 provided
        if asset_sha256:
            cached = await self.ai_cache.get_photo_analysis(asset_sha256)
            if cached:
                logger.debug(f"Returning cached analysis for {asset_sha256[:16]}...")
                return PhotoAnalysis(
                    description=cached.get("description", ""),
                    tags=cached.get("tags", []),
                    hashtags=cached.get("hashtags", []),
                    quality_score=cached.get("quality_score", 50),
                    sharpness=cached.get("sharpness", 50),
                    exposure=cached.get("exposure", 50),
                    composition=cached.get("composition", 50),
                    dominant_colors=cached.get("dominant_colors", []),
                    lighting=cached.get("lighting", "unknown"),
                    mood=cached.get("mood", "neutral"),
                    improvements=cached.get("improvements", []),
                    best_for=cached.get("best_for", []),
                )

        try:
            # Get user's Gemini client
            client = await self.gemini_client.get_client_for_user(user_id)

            # Build analysis prompt
            prompt = self._build_analysis_prompt()

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
            result = self._parse_analysis_response(response.text)

            # Cache the result if SHA256 provided
            if asset_sha256:
                await self.ai_cache.set_photo_analysis(asset_sha256, result.to_dict())

            # Log usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier=client.model,
                feature_type=AIFeatureType.PHOTO_ANALYSIS,
                success=True,
                metadata={"photo_id": str(photo_id), "cached": False} if photo_id else {"cached": False},
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

    async def _fetch_image_data(self, photo_url: str) -> str:
        """Fetch image data from URL and encode as base64."""
        async with httpx.AsyncClient() as client:
            response = await client.get(photo_url)
            response.raise_for_status()
            return base64.b64encode(response.content).decode()

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
- hashtags: Social media ready hashtags"""

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
            )


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------


_photo_analysis_service: Optional[PhotoAnalysisService] = None


def get_photo_analysis_service() -> PhotoAnalysisService:
    """Get the photo analysis service instance."""
    global _photo_analysis_service
    if _photo_analysis_service is None:
        _photo_analysis_service = PhotoAnalysisService()
    return _photo_analysis_service