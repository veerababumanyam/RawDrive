"""Smart Curation Service.

Uses AI and quality scores to automatically select the best photos from a gallery.
Feature: AI-powered photo curation (US5)
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from app.config.settings import get_settings
from app.services.ai_usage_service import get_ai_usage_service, AIFeatureType

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


class CurationResult:
    """Smart curation result."""

    def __init__(
        self,
        asset_ids: list[str],
        criteria: dict[str, Any],
        total_assets: int,
        selected_count: int,
        rankings: list[dict[str, Any]],
    ):
        self.asset_ids = asset_ids
        self.criteria = criteria
        self.total_assets = total_assets
        self.selected_count = selected_count
        self.rankings = rankings  # List of {asset_id, score, reason}

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "asset_ids": self.asset_ids,
            "criteria": self.criteria,
            "total_assets": self.total_assets,
            "selected_count": self.selected_count,
            "rankings": self.rankings,
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class SmartCurationService:
    """Service for AI-powered photo curation."""

    def __init__(self):
        self.settings = get_settings()
        self.ai_usage = get_ai_usage_service()

    async def curate_gallery(
        self,
        user_id: UUID,
        workspace_id: UUID,
        gallery_id: UUID,
        photo_analyses: list[dict[str, Any]],
        quality_threshold: int = 70,
        diversity_weight: float = 0.5,
        max_photos: int = 20,
        prefer_people: bool = False,
    ) -> CurationResult:
        """Select the best photos from a gallery based on AI analysis.

        Args:
            user_id: The user requesting curation
            workspace_id: The workspace context
            gallery_id: The gallery ID
            photo_analyses: List of photo analysis results with asset_id
            quality_threshold: Minimum quality score (0-100)
            diversity_weight: Balance between quality and diversity (0-1)
            max_photos: Maximum number of photos to select
            prefer_people: Weight photos with detected faces higher

        Returns:
            CurationResult with selected photos and rankings
        """
        if not photo_analyses:
            return CurationResult(
                asset_ids=[],
                criteria={
                    "quality_threshold": quality_threshold,
                    "diversity_weight": diversity_weight,
                    "max_photos": max_photos,
                    "prefer_people": prefer_people,
                },
                total_assets=0,
                selected_count=0,
                rankings=[],
            )

        try:
            # Score and rank photos
            scored_photos = self._score_photos(
                photo_analyses,
                quality_threshold,
                prefer_people,
            )

            # Apply diversity filtering
            selected = self._apply_diversity_filter(
                scored_photos,
                diversity_weight,
                max_photos,
            )

            # Build rankings with reasons
            rankings = []
            for photo in selected:
                rankings.append({
                    "asset_id": photo["asset_id"],
                    "score": photo["score"],
                    "reason": self._generate_selection_reason(photo),
                })

            result = CurationResult(
                asset_ids=[p["asset_id"] for p in selected],
                criteria={
                    "quality_threshold": quality_threshold,
                    "diversity_weight": diversity_weight,
                    "max_photos": max_photos,
                    "prefer_people": prefer_people,
                },
                total_assets=len(photo_analyses),
                selected_count=len(selected),
                rankings=rankings,
            )

            # Log usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="smart_curation",
                feature_type=AIFeatureType.SMART_CURATION,
                success=True,
                metadata={
                    "gallery_id": str(gallery_id),
                    "total_photos": len(photo_analyses),
                    "selected_photos": len(selected),
                },
            )

            return result

        except Exception as e:
            # Log failed usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="smart_curation",
                feature_type=AIFeatureType.SMART_CURATION,
                success=False,
                error_code=str(type(e).__name__),
            )
            raise

    def _score_photos(
        self,
        photo_analyses: list[dict[str, Any]],
        quality_threshold: int,
        prefer_people: bool,
    ) -> list[dict[str, Any]]:
        """Score photos based on analysis results."""
        scored = []

        for analysis in photo_analyses:
            asset_id = analysis.get("asset_id")
            if not asset_id:
                continue

            # Calculate composite score
            quality_score = analysis.get("quality_score", 50)
            sharpness = analysis.get("sharpness", 50)
            exposure = analysis.get("exposure", 50)
            composition = analysis.get("composition", 50)

            # Weighted average of quality metrics
            base_score = (
                quality_score * 0.4 +
                sharpness * 0.2 +
                exposure * 0.2 +
                composition * 0.2
            )

            # Apply people preference if enabled
            face_count = analysis.get("face_count", 0)
            if prefer_people and face_count > 0:
                base_score *= 1.15  # 15% boost for photos with people
                base_score = min(100, base_score)  # Cap at 100

            # Filter by quality threshold
            if base_score < quality_threshold:
                continue

            scored.append({
                "asset_id": str(asset_id),
                "score": round(base_score, 1),
                "quality_score": quality_score,
                "sharpness": sharpness,
                "exposure": exposure,
                "composition": composition,
                "face_count": face_count,
                "lighting": analysis.get("lighting", "unknown"),
                "mood": analysis.get("mood", "neutral"),
                "dominant_colors": analysis.get("dominant_colors", []),
                "tags": analysis.get("tags", []),
            })

        # Sort by score descending
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored

    def _apply_diversity_filter(
        self,
        scored_photos: list[dict[str, Any]],
        diversity_weight: float,
        max_photos: int,
    ) -> list[dict[str, Any]]:
        """Filter for diversity to avoid selecting near-duplicate photos."""
        if not scored_photos:
            return []

        # If diversity weight is 0, just take top N
        if diversity_weight <= 0:
            return scored_photos[:max_photos]

        selected = [scored_photos[0]]  # Always include best photo

        for candidate in scored_photos[1:]:
            if len(selected) >= max_photos:
                break

            # Check similarity with already selected photos
            is_diverse = True
            for selected_photo in selected:
                similarity = self._calculate_similarity(candidate, selected_photo)

                # If too similar and diversity weight is high, skip
                if similarity > (1 - diversity_weight):
                    is_diverse = False
                    break

            if is_diverse:
                selected.append(candidate)

        return selected

    def _calculate_similarity(
        self,
        photo1: dict[str, Any],
        photo2: dict[str, Any],
    ) -> float:
        """Calculate similarity between two photos based on their attributes."""
        similarity_score = 0.0
        factors = 0

        # Compare lighting
        if photo1.get("lighting") == photo2.get("lighting"):
            similarity_score += 0.2
        factors += 0.2

        # Compare mood
        if photo1.get("mood") == photo2.get("mood"):
            similarity_score += 0.2
        factors += 0.2

        # Compare dominant colors (overlap)
        colors1 = set(photo1.get("dominant_colors", []))
        colors2 = set(photo2.get("dominant_colors", []))
        if colors1 and colors2:
            color_overlap = len(colors1 & colors2) / max(len(colors1 | colors2), 1)
            similarity_score += color_overlap * 0.3
        factors += 0.3

        # Compare tags (overlap)
        tags1 = set(photo1.get("tags", []))
        tags2 = set(photo2.get("tags", []))
        if tags1 and tags2:
            tag_overlap = len(tags1 & tags2) / max(len(tags1 | tags2), 1)
            similarity_score += tag_overlap * 0.3
        factors += 0.3

        return similarity_score / factors if factors > 0 else 0.0

    def _generate_selection_reason(self, photo: dict[str, Any]) -> str:
        """Generate a human-readable reason for why a photo was selected."""
        reasons = []

        score = photo.get("score", 0)
        if score >= 90:
            reasons.append("Excellent overall quality")
        elif score >= 80:
            reasons.append("Very good quality")
        elif score >= 70:
            reasons.append("Good quality")

        if photo.get("sharpness", 0) >= 85:
            reasons.append("sharp focus")
        if photo.get("exposure", 0) >= 85:
            reasons.append("great exposure")
        if photo.get("composition", 0) >= 85:
            reasons.append("strong composition")
        if photo.get("face_count", 0) > 0:
            reasons.append(f"{photo['face_count']} face(s) detected")

        lighting = photo.get("lighting", "")
        if lighting in ("natural", "studio"):
            reasons.append(f"{lighting} lighting")

        if not reasons:
            reasons.append("Selected for diversity")

        return ", ".join(reasons[:3]).capitalize()


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------


_smart_curation_service: Optional[SmartCurationService] = None


def get_smart_curation_service() -> SmartCurationService:
    """Get the smart curation service instance."""
    global _smart_curation_service
    if _smart_curation_service is None:
        _smart_curation_service = SmartCurationService()
    return _smart_curation_service
