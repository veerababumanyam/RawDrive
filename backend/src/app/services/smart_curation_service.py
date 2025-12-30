"""Smart Photo Curation Service.

Uses AI-powered analysis to select the best photos from galleries.
Feature: 010-ai-powered-features
Tasks: T059-T068
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
        gallery_id: str,
        selected_assets: list[dict[str, Any]],
        total_candidates: int,
        quality_threshold: float,
        diversity_weight: float,
    ):
        self.gallery_id = gallery_id
        self.selected_assets = selected_assets
        self.total_candidates = total_candidates
        self.quality_threshold = quality_threshold
        self.diversity_weight = diversity_weight

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "gallery_id": self.gallery_id,
            "selected_assets": self.selected_assets,
            "total_candidates": self.total_candidates,
            "quality_threshold": self.quality_threshold,
            "diversity_weight": self.diversity_weight,
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class SmartCurationService:
    """Service for AI-powered photo curation and selection."""

    def __init__(self):
        self.settings = get_settings()
        self.ai_usage = get_ai_usage_service()

    async def curate_gallery(
        self,
        user_id: UUID,
        workspace_id: UUID,
        gallery_id: UUID,
        count: int = 10,
        quality_threshold: float = 0.6,
        diversity_weight: float = 0.3,
        prefer_people: bool = False,
        exclude_asset_ids: Optional[list[UUID]] = None,
    ) -> CurationResult:
        """Curate the best photos from a gallery.

        Args:
            user_id: The user requesting curation
            workspace_id: The workspace context
            gallery_id: The gallery to curate
            count: Number of photos to select
            quality_threshold: Minimum quality score (0-1)
            diversity_weight: Weight for diversity vs pure quality (0-1)
            prefer_people: Whether to prioritize photos with people
            exclude_asset_ids: Asset IDs to exclude from selection

        Returns:
            CurationResult with selected photos and their scores
        """
        try:
            # Get gallery assets with their analysis data
            from app.services.gallery_service import get_gallery_service
            gallery_service = get_gallery_service()

            assets_data = await gallery_service.get_gallery_assets(
                gallery_id=gallery_id,
                workspace_id=workspace_id,
                limit=500,  # Get more to have a good selection pool
            )

            assets = assets_data.get("assets", [])
            total_candidates = len(assets)

            if not assets:
                return CurationResult(
                    gallery_id=str(gallery_id),
                    selected_assets=[],
                    total_candidates=0,
                    quality_threshold=quality_threshold,
                    diversity_weight=diversity_weight,
                )

            # Filter out excluded assets
            exclude_ids = set(str(aid) for aid in (exclude_asset_ids or []))
            assets = [a for a in assets if str(a.get("asset_id")) not in exclude_ids]

            # Score each asset
            scored_assets = []
            for asset in assets:
                score = self._calculate_asset_score(
                    asset=asset,
                    quality_threshold=quality_threshold,
                    diversity_weight=diversity_weight,
                    prefer_people=prefer_people,
                )
                if score >= quality_threshold:
                    scored_assets.append({
                        "asset_id": str(asset.get("asset_id")),
                        "score": round(score, 3),
                        "quality_score": asset.get("quality_score", 0.5),
                        "has_faces": asset.get("face_count", 0) > 0,
                        "thumbnail_url": asset.get("thumbnail_url"),
                    })

            # Sort by score (descending) and apply diversity selection
            scored_assets.sort(key=lambda x: x["score"], reverse=True)

            # Apply diversity selection if weight > 0
            if diversity_weight > 0:
                selected = self._apply_diversity_selection(
                    scored_assets=scored_assets,
                    count=count,
                    diversity_weight=diversity_weight,
                )
            else:
                selected = scored_assets[:count]

            # Log AI usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="curation_algorithm",
                feature_type=AIFeatureType.SMART_CURATION,
                success=True,
                metadata={
                    "gallery_id": str(gallery_id),
                    "selected_count": len(selected),
                    "total_candidates": total_candidates,
                    "quality_threshold": quality_threshold,
                    "diversity_weight": diversity_weight,
                },
            )

            return CurationResult(
                gallery_id=str(gallery_id),
                selected_assets=selected,
                total_candidates=total_candidates,
                quality_threshold=quality_threshold,
                diversity_weight=diversity_weight,
            )

        except Exception as e:
            logger.error(f"Curation failed: {e}", exc_info=True)
            # Log failed usage
            await self.ai_usage.log_ai_call(
                user_id=user_id,
                workspace_id=workspace_id,
                model_identifier="curation_algorithm",
                feature_type=AIFeatureType.SMART_CURATION,
                success=False,
                error_code=str(type(e).__name__),
            )
            raise

    def _calculate_asset_score(
        self,
        asset: dict[str, Any],
        quality_threshold: float,
        diversity_weight: float,
        prefer_people: bool,
    ) -> float:
        """Calculate the curation score for an asset.

        The score combines quality metrics with optional preferences.
        """
        # Base quality score (0-1)
        quality_score = asset.get("quality_score", 0.5)

        # Technical metrics (each 0-1, average them)
        sharpness = asset.get("sharpness", 0.5)
        exposure = asset.get("exposure", 0.5)
        composition = asset.get("composition", 0.5)

        technical_score = (sharpness + exposure + composition) / 3

        # Combine quality and technical scores
        base_score = (quality_score * 0.6) + (technical_score * 0.4)

        # Apply people preference bonus
        if prefer_people:
            face_count = asset.get("face_count", 0)
            if face_count > 0:
                # Bonus for having faces, capped at 0.15
                people_bonus = min(0.15, face_count * 0.05)
                base_score += people_bonus

        # Ensure score stays in 0-1 range
        return min(1.0, max(0.0, base_score))

    def _apply_diversity_selection(
        self,
        scored_assets: list[dict[str, Any]],
        count: int,
        diversity_weight: float,
    ) -> list[dict[str, Any]]:
        """Apply diversity-aware selection to avoid similar photos.

        Uses a simple approach: alternate between top-scored and
        different "types" of photos (with/without people, different moods).
        """
        if not scored_assets or count <= 0:
            return []

        selected = []
        remaining = scored_assets.copy()

        # First, always include the top-scored item
        if remaining:
            selected.append(remaining.pop(0))

        # Alternate between pure quality and diversity picks
        quality_turn = True
        while len(selected) < count and remaining:
            if quality_turn or diversity_weight < 0.1:
                # Quality pick: just take the highest scored remaining
                selected.append(remaining.pop(0))
            else:
                # Diversity pick: find something different from recent selections
                diverse_pick = self._find_diverse_pick(selected, remaining)
                if diverse_pick:
                    remaining.remove(diverse_pick)
                    selected.append(diverse_pick)
                elif remaining:
                    selected.append(remaining.pop(0))

            quality_turn = not quality_turn

        return selected

    def _find_diverse_pick(
        self,
        selected: list[dict[str, Any]],
        remaining: list[dict[str, Any]],
    ) -> Optional[dict[str, Any]]:
        """Find a photo that adds diversity to the selection."""
        if not remaining:
            return None

        # Check what we already have
        has_faces_count = sum(1 for a in selected if a.get("has_faces", False))
        total_selected = len(selected)

        # Determine what type to look for
        if total_selected > 0:
            faces_ratio = has_faces_count / total_selected
            # If we have too many with faces, prefer one without, and vice versa
            prefer_faces = faces_ratio < 0.4
        else:
            prefer_faces = True

        # Find a matching photo
        for asset in remaining:
            asset_has_faces = asset.get("has_faces", False)
            if asset_has_faces == prefer_faces:
                return asset

        # If no matching preference, return the first remaining
        return remaining[0] if remaining else None


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
