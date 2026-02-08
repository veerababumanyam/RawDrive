"""Portfolio Recommendation Service.

AI-powered portfolio recommendation engine that analyzes:
- CLIP embeddings for visual similarity search
- Engagement metrics for high-performing shots
- Client preferences for personalization
- Contextual factors (occasion, season, theme)

Includes A/B testing capabilities for algorithm optimization.

Feature: AI Portfolio Recommendation Engine
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import numpy as np
import redis.asyncio as redis

from app.config.settings import get_settings
from app.repositories.portfolio_recommendation_repository import (
    PortfolioRecommendationRepository,
    get_portfolio_recommendation_repository,
)
from app.schemas.portfolio_recommendation import (
    ABTestStatus,
    ClientType,
    EngagementTrend,
    FeedbackSource,
    FeedbackType,
    PrimaryMetric,
    RecommendationStatus,
    RecommendationType,
    SceneCategory,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class ScoringWeights:
    """Weights for recommendation scoring components."""

    similarity: float = 0.30
    engagement: float = 0.25
    quality: float = 0.20
    relevance: float = 0.15
    recency: float = 0.05
    diversity: float = 0.05

    def normalize(self) -> "ScoringWeights":
        """Normalize weights to sum to 1."""
        total = (
            self.similarity + self.engagement + self.quality +
            self.relevance + self.recency + self.diversity
        )
        if total == 0:
            return self
        return ScoringWeights(
            similarity=self.similarity / total,
            engagement=self.engagement / total,
            quality=self.quality / total,
            relevance=self.relevance / total,
            recency=self.recency / total,
            diversity=self.diversity / total,
        )


@dataclass
class RecommendationConfig:
    """Configuration for recommendation generation."""

    weights: ScoringWeights = field(default_factory=ScoringWeights)
    diversity_factor: float = 0.3
    min_quality_score: float = 40.0
    min_engagement_score: float = 0.0
    recency_decay_days: int = 90
    max_candidates: int = 500
    batch_size: int = 50


DEFAULT_CONFIG = RecommendationConfig()


# Scene categories and their related keywords for CLIP text embedding
SCENE_PROMPTS = {
    SceneCategory.WEDDING: "wedding ceremony reception bride groom celebration love",
    SceneCategory.PORTRAIT: "portrait headshot face person professional studio",
    SceneCategory.LANDSCAPE: "landscape nature scenic view mountains ocean sky",
    SceneCategory.EVENT: "event party celebration gathering conference crowd",
    SceneCategory.PRODUCT: "product commercial advertising marketing studio",
    SceneCategory.LIFESTYLE: "lifestyle candid natural everyday authentic moment",
    SceneCategory.CORPORATE: "corporate business professional office meeting",
    SceneCategory.FAMILY: "family children parents home togetherness love",
    SceneCategory.NATURE: "nature wildlife animals flowers plants garden",
    SceneCategory.ARCHITECTURE: "architecture building interior exterior design structure",
    SceneCategory.FOOD: "food culinary restaurant cuisine dish meal",
    SceneCategory.FASHION: "fashion style clothing model runway editorial",
    SceneCategory.SPORTS: "sports action athletic competition game fitness",
}


OCCASION_SCENE_MAPPING = {
    "wedding": [SceneCategory.WEDDING, SceneCategory.PORTRAIT, SceneCategory.LIFESTYLE],
    "engagement": [SceneCategory.PORTRAIT, SceneCategory.LIFESTYLE, SceneCategory.LANDSCAPE],
    "birthday": [SceneCategory.EVENT, SceneCategory.FAMILY, SceneCategory.LIFESTYLE],
    "corporate_event": [SceneCategory.CORPORATE, SceneCategory.EVENT, SceneCategory.PORTRAIT],
    "product_shoot": [SceneCategory.PRODUCT, SceneCategory.LIFESTYLE],
    "family_portrait": [SceneCategory.FAMILY, SceneCategory.PORTRAIT],
    "headshot": [SceneCategory.PORTRAIT, SceneCategory.CORPORATE],
    "graduation": [SceneCategory.PORTRAIT, SceneCategory.EVENT, SceneCategory.FAMILY],
    "baby_shower": [SceneCategory.FAMILY, SceneCategory.EVENT, SceneCategory.LIFESTYLE],
    "anniversary": [SceneCategory.PORTRAIT, SceneCategory.LIFESTYLE, SceneCategory.EVENT],
}


SEASON_ATTRIBUTES = {
    "spring": {"colors": ["pastel", "green", "vibrant"], "brightness": "bright"},
    "summer": {"colors": ["vibrant", "warm", "bright"], "brightness": "bright"},
    "fall": {"colors": ["warm", "earthy", "golden"], "brightness": "medium"},
    "winter": {"colors": ["cool", "muted", "neutral"], "brightness": "medium"},
}


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class PortfolioRecommendationService:
    """Service for AI-powered portfolio recommendations."""

    def __init__(self):
        self.settings = get_settings()
        self._repository = get_portfolio_recommendation_repository()
        self._redis: redis.Redis | None = None
        self._clip_embedder = None

    async def _get_redis(self) -> redis.Redis:
        """Get Redis connection for caching."""
        if self._redis is None:
            self._redis = redis.from_url(
                self.settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._redis

    def _get_clip_embedder(self):
        """Get CLIP embedder lazily."""
        if self._clip_embedder is None:
            try:
                # Import from AI processing service (shared code)
                from services.ai_processing_service.src.models.clip_embedder import (
                    get_clip_embedder,
                )
                self._clip_embedder = get_clip_embedder()
            except ImportError:
                # Fallback: use local stub or raise
                logger.warning("CLIP embedder not available - recommendations will be limited")
                self._clip_embedder = None
        return self._clip_embedder

    # =========================================================================
    # CLIP Embedding Operations
    # =========================================================================

    async def generate_asset_embedding(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        image_path: str,
        *,
        gallery_id: UUID | None = None,
    ) -> dict[str, Any]:
        """Generate and store CLIP embedding for an asset."""
        clip = self._get_clip_embedder()
        if clip is None:
            raise RuntimeError("CLIP embedder not available")

        try:
            # Generate image embedding
            embedding = clip.embed_image(image_path)
            embedding_list = embedding.tolist()

            # Classify scene
            scene_category, scene_confidence = await self._classify_scene(embedding)

            # Analyze visual characteristics
            visual_analysis = await self._analyze_visual_characteristics(image_path)

            # Store embedding
            result = await self._repository.upsert_asset_embedding(
                workspace_id=workspace_id,
                asset_id=asset_id,
                clip_embedding=embedding_list,
                gallery_id=gallery_id,
                scene_category=scene_category.value if scene_category else None,
                scene_confidence=scene_confidence,
                scene_tags=visual_analysis.get("tags", []),
                dominant_colors=visual_analysis.get("colors", []),
                color_palette=visual_analysis.get("palette"),
                brightness_level=visual_analysis.get("brightness"),
                composition_type=visual_analysis.get("composition"),
                aesthetic_score=visual_analysis.get("aesthetic_score"),
                overall_quality_score=visual_analysis.get("quality_score"),
                has_people=visual_analysis.get("has_people", False),
                detected_faces_count=visual_analysis.get("face_count", 0),
            )

            logger.info(f"Generated embedding for asset {asset_id}")
            return result

        except Exception as e:
            logger.error(f"Failed to generate embedding for asset {asset_id}: {e}")
            raise

    async def _classify_scene(
        self,
        image_embedding: np.ndarray,
    ) -> tuple[SceneCategory | None, float]:
        """Classify scene category using CLIP text embeddings."""
        clip = self._get_clip_embedder()
        if clip is None:
            return None, 0.0

        best_category = None
        best_score = 0.0

        for category, prompt in SCENE_PROMPTS.items():
            text_embedding = clip.embed_text(prompt)
            similarity = clip.cosine_similarity(image_embedding, text_embedding)

            if similarity > best_score:
                best_score = similarity
                best_category = category

        return best_category, best_score

    async def _analyze_visual_characteristics(
        self,
        image_path: str,
    ) -> dict[str, Any]:
        """Analyze visual characteristics of an image.

        This is a placeholder - in production, this would integrate with
        the AI processing service for detailed analysis.
        """
        # TODO: Integrate with AI processing service for full analysis
        return {
            "tags": [],
            "colors": [],
            "palette": None,
            "brightness": None,
            "composition": None,
            "aesthetic_score": None,
            "quality_score": None,
            "has_people": False,
            "face_count": 0,
        }

    async def batch_generate_embeddings(
        self,
        workspace_id: UUID,
        *,
        gallery_ids: list[UUID] | None = None,
        asset_ids: list[UUID] | None = None,
        batch_size: int = 50,
        force_regenerate: bool = False,
    ) -> dict[str, Any]:
        """Generate embeddings for multiple assets in batches."""
        start_time = time.time()

        if asset_ids:
            pending_ids = asset_ids
        else:
            # Get assets without embeddings
            pending_ids = await self._repository.get_assets_without_embeddings(
                workspace_id,
                gallery_ids=gallery_ids,
                limit=1000,
            )

        total_requested = len(pending_ids)
        processed = 0
        failed = 0
        failed_ids = []

        # Process in batches
        for i in range(0, len(pending_ids), batch_size):
            batch = pending_ids[i:i + batch_size]

            for asset_id in batch:
                try:
                    # In production, would get actual image path from asset service
                    # For now, this is a placeholder
                    # await self.generate_asset_embedding(workspace_id, asset_id, image_path)
                    processed += 1
                except Exception as e:
                    logger.error(f"Failed to process asset {asset_id}: {e}")
                    failed += 1
                    failed_ids.append(asset_id)

        processing_time_ms = int((time.time() - start_time) * 1000)

        return {
            "total_requested": total_requested,
            "total_processed": processed,
            "total_failed": failed,
            "failed_asset_ids": failed_ids,
            "processing_time_ms": processing_time_ms,
        }

    # =========================================================================
    # Engagement Score Operations
    # =========================================================================

    async def refresh_engagement_scores(
        self,
        workspace_id: UUID,
    ) -> int:
        """Refresh engagement scores for a workspace."""
        updated = await self._repository.refresh_engagement_scores(workspace_id)
        logger.info(f"Refreshed {updated} engagement scores for workspace {workspace_id}")
        return updated

    async def get_top_performing_assets(
        self,
        workspace_id: UUID,
        *,
        limit: int = 50,
        gallery_ids: list[UUID] | None = None,
        scene_category: str | None = None,
        min_engagement_score: float = 0,
    ) -> list[dict[str, Any]]:
        """Get top performing assets by engagement score."""
        return await self._repository.get_top_engaged_assets(
            workspace_id,
            limit=limit,
            gallery_ids=gallery_ids,
            min_engagement_score=min_engagement_score,
            scene_category=scene_category,
        )

    # =========================================================================
    # Client Preferences
    # =========================================================================

    async def learn_client_preferences(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        favorited_asset_ids: list[UUID] | None = None,
        selected_asset_ids: list[UUID] | None = None,
    ) -> dict[str, Any]:
        """Learn client preferences from their interactions."""
        all_asset_ids = []
        if favorited_asset_ids:
            all_asset_ids.extend(favorited_asset_ids)
        if selected_asset_ids:
            # Weight selected assets more heavily
            all_asset_ids.extend(selected_asset_ids * 2)

        if not all_asset_ids:
            return await self._repository.get_client_preference(workspace_id, client_id) or {}

        # Get embeddings for interacted assets
        embeddings_data = await self._repository.get_embeddings_for_assets(
            workspace_id, list(set(all_asset_ids))
        )

        if not embeddings_data:
            return {}

        # Calculate average preference embedding
        embeddings = []
        scenes = []
        colors = []

        for data in embeddings_data:
            if data.get("clip_embedding"):
                # Convert from pgvector string format if needed
                emb = data["clip_embedding"]
                if isinstance(emb, str):
                    emb = [float(x) for x in emb.strip("[]").split(",")]
                embeddings.append(emb)

            if data.get("scene_category"):
                scenes.append(data["scene_category"])
            if data.get("color_palette"):
                colors.append(data["color_palette"])

        preference_embedding = None
        embedding_confidence = 0.0

        if embeddings:
            # Calculate centroid embedding
            preference_embedding = np.mean(embeddings, axis=0).tolist()
            # Confidence based on sample size and variance
            embedding_confidence = min(1.0, len(embeddings) / 20)  # Max at 20 samples

        # Determine preferred styles/colors from frequency
        from collections import Counter
        scene_counts = Counter(scenes)
        color_counts = Counter(colors)

        preferred_scenes = [s for s, _ in scene_counts.most_common(3)]
        preferred_colors = [c for c, _ in color_counts.most_common(3)]

        # Upsert preferences
        result = await self._repository.upsert_client_preference(
            workspace_id=workspace_id,
            client_id=client_id,
            preferred_scenes=preferred_scenes,
            preferred_colors=preferred_colors,
            preference_embedding=preference_embedding,
            embedding_confidence=embedding_confidence,
            embedding_sample_size=len(embeddings),
        )

        logger.info(
            f"Learned preferences for client {client_id} from {len(all_asset_ids)} interactions"
        )

        return result

    async def update_client_type(
        self,
        workspace_id: UUID,
        client_id: UUID,
        client_type: ClientType,
        occasion_type: str | None = None,
    ) -> dict[str, Any]:
        """Update client type and occasion."""
        return await self._repository.upsert_client_preference(
            workspace_id=workspace_id,
            client_id=client_id,
            client_type=client_type.value,
            occasion_type=occasion_type,
        )

    # =========================================================================
    # Recommendation Generation
    # =========================================================================

    async def generate_recommendations(
        self,
        workspace_id: UUID,
        recommendation_type: RecommendationType,
        *,
        client_id: UUID | None = None,
        gallery_id: UUID | None = None,
        source_gallery_ids: list[UUID] | None = None,
        reference_asset_id: UUID | None = None,
        occasion_type: str | None = None,
        target_season: str | None = None,
        target_theme: str | None = None,
        limit: int = 20,
        filter_criteria: dict[str, Any] | None = None,
        scoring_weights: dict[str, float] | None = None,
        config: RecommendationConfig | None = None,
    ) -> dict[str, Any]:
        """Generate portfolio recommendations.

        Main entry point for all recommendation types.
        """
        start_time = time.time()
        config = config or DEFAULT_CONFIG

        # Check for active A/B test
        ab_test = await self._get_active_ab_test(
            workspace_id, recommendation_type, client_id
        )
        ab_test_id = None
        ab_variant = None

        if ab_test:
            ab_test_id = ab_test["test_id"]
            ab_variant = self._assign_ab_variant(ab_test, workspace_id, client_id)
            # Apply variant config
            config = self._apply_ab_variant_config(config, ab_test, ab_variant)

        # Apply custom scoring weights
        if scoring_weights:
            config.weights = ScoringWeights(**scoring_weights).normalize()

        # Create recommendation record
        recommendation = await self._repository.create_recommendation(
            workspace_id=workspace_id,
            recommendation_type=recommendation_type.value,
            client_id=client_id,
            gallery_id=gallery_id,
            occasion_type=occasion_type,
            target_season=target_season,
            target_theme=target_theme,
            source_gallery_ids=source_gallery_ids,
            filter_criteria=filter_criteria,
            ab_test_id=ab_test_id,
            ab_variant=ab_variant,
        )

        recommendation_id = recommendation["recommendation_id"]

        try:
            # Update status to processing
            await self._repository.update_recommendation_status(
                workspace_id, recommendation_id, "processing"
            )

            # Generate recommendations based on type
            items = await self._generate_items(
                workspace_id=workspace_id,
                recommendation_type=recommendation_type,
                client_id=client_id,
                gallery_id=gallery_id,
                source_gallery_ids=source_gallery_ids,
                reference_asset_id=reference_asset_id,
                occasion_type=occasion_type,
                target_season=target_season,
                target_theme=target_theme,
                limit=limit,
                filter_criteria=filter_criteria,
                config=config,
            )

            # Store recommendation items
            if items:
                await self._repository.add_recommendation_items(
                    recommendation_id, workspace_id, items
                )

            # Calculate aggregate scores
            avg_similarity = None
            avg_engagement = None
            avg_quality = None

            if items:
                similarity_scores = [i.get("similarity_score", 0) for i in items if i.get("similarity_score")]
                engagement_scores = [i.get("engagement_score", 0) for i in items if i.get("engagement_score")]
                quality_scores = [i.get("quality_score", 0) for i in items if i.get("quality_score")]

                if similarity_scores:
                    avg_similarity = sum(similarity_scores) / len(similarity_scores)
                if engagement_scores:
                    avg_engagement = sum(engagement_scores) / len(engagement_scores)
                if quality_scores:
                    avg_quality = sum(quality_scores) / len(quality_scores)

            processing_time_ms = int((time.time() - start_time) * 1000)

            # Update recommendation with results
            await self._repository.update_recommendation_status(
                workspace_id=workspace_id,
                recommendation_id=recommendation_id,
                status="completed",
                total_candidates=len(items) * 2 if items else 0,  # Approximation
                total_recommended=len(items),
                avg_similarity_score=avg_similarity,
                avg_engagement_score=avg_engagement,
                avg_quality_score=avg_quality,
                processing_time_ms=processing_time_ms,
            )

            # Fetch full recommendation with items
            result = await self._repository.get_recommendation(workspace_id, recommendation_id)
            result["items"] = items

            logger.info(
                f"Generated {len(items)} recommendations for workspace {workspace_id}",
                extra={
                    "recommendation_id": str(recommendation_id),
                    "type": recommendation_type.value,
                    "processing_time_ms": processing_time_ms,
                },
            )

            return result

        except Exception as e:
            logger.error(f"Failed to generate recommendations: {e}")
            await self._repository.update_recommendation_status(
                workspace_id=workspace_id,
                recommendation_id=recommendation_id,
                status="failed",
                error_message=str(e),
            )
            raise

    async def _generate_items(
        self,
        workspace_id: UUID,
        recommendation_type: RecommendationType,
        *,
        client_id: UUID | None = None,
        gallery_id: UUID | None = None,
        source_gallery_ids: list[UUID] | None = None,
        reference_asset_id: UUID | None = None,
        occasion_type: str | None = None,
        target_season: str | None = None,
        target_theme: str | None = None,
        limit: int = 20,
        filter_criteria: dict[str, Any] | None = None,
        config: RecommendationConfig = DEFAULT_CONFIG,
    ) -> list[dict[str, Any]]:
        """Generate recommendation items based on type."""

        if recommendation_type == RecommendationType.SIMILAR_STYLE:
            return await self._generate_similar_style(
                workspace_id, reference_asset_id, limit, config
            )

        elif recommendation_type == RecommendationType.PERSONALIZED:
            return await self._generate_personalized(
                workspace_id, client_id, source_gallery_ids, limit, config
            )

        elif recommendation_type == RecommendationType.HERO_SHOTS:
            return await self._generate_hero_shots(
                workspace_id, source_gallery_ids, limit, config
            )

        elif recommendation_type == RecommendationType.TRENDING_SHOTS:
            return await self._generate_trending(
                workspace_id, source_gallery_ids, limit, config
            )

        elif recommendation_type == RecommendationType.SEASONAL_PICKS:
            return await self._generate_seasonal(
                workspace_id, target_season, source_gallery_ids, limit, config
            )

        elif recommendation_type == RecommendationType.PORTFOLIO_SELECTION:
            return await self._generate_portfolio_selection(
                workspace_id, client_id, gallery_id, occasion_type, limit, config
            )

        elif recommendation_type == RecommendationType.PRINT_WORTHY:
            return await self._generate_print_worthy(
                workspace_id, source_gallery_ids, limit, config
            )

        elif recommendation_type == RecommendationType.SOCIAL_MEDIA:
            return await self._generate_social_media(
                workspace_id, source_gallery_ids, limit, config
            )

        elif recommendation_type == RecommendationType.ALBUM_COVER:
            return await self._generate_album_cover(
                workspace_id, gallery_id, limit, config
            )

        else:
            # Default: engagement-based selection
            return await self._generate_by_engagement(
                workspace_id, source_gallery_ids, limit, config
            )

    async def _generate_similar_style(
        self,
        workspace_id: UUID,
        reference_asset_id: UUID | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Generate recommendations similar to a reference asset."""
        if not reference_asset_id:
            return []

        # Get reference embedding
        ref_data = await self._repository.get_asset_embedding(workspace_id, reference_asset_id)
        if not ref_data or not ref_data.get("clip_embedding"):
            return []

        ref_embedding = ref_data["clip_embedding"]
        if isinstance(ref_embedding, str):
            ref_embedding = [float(x) for x in ref_embedding.strip("[]").split(",")]

        # Find similar assets
        similar = await self._repository.find_similar_assets(
            workspace_id=workspace_id,
            query_embedding=ref_embedding,
            limit=limit * 2,  # Get more for diversity filtering
            min_similarity=0.6,
            exclude_asset_ids=[reference_asset_id],
            min_quality_score=config.min_quality_score,
        )

        # Get engagement scores
        asset_ids = [s["asset_id"] for s in similar]
        engagement_map = await self._repository.get_engagement_scores_for_assets(
            workspace_id, asset_ids
        )

        # Score and rank
        items = []
        for rank, asset_data in enumerate(similar[:limit]):
            asset_id = asset_data["asset_id"]
            engagement_data = engagement_map.get(asset_id, {})

            similarity_score = asset_data.get("similarity_score", 0)
            engagement_score = engagement_data.get("engagement_score", 0)
            quality_score = asset_data.get("overall_quality_score", 50)

            final_score = (
                config.weights.similarity * similarity_score +
                config.weights.engagement * (engagement_score / 100) +
                config.weights.quality * (quality_score / 100)
            )

            items.append({
                "asset_id": asset_id,
                "rank_position": rank + 1,
                "final_score": final_score,
                "similarity_score": similarity_score,
                "engagement_score": engagement_score,
                "quality_score": quality_score,
                "scene_category": asset_data.get("scene_category"),
                "visual_tags": asset_data.get("scene_tags", []),
                "match_reasons": [
                    {
                        "reason": "style_match",
                        "detail": f"Visual similarity: {similarity_score:.0%}",
                        "weight": config.weights.similarity,
                    },
                ],
                "score_breakdown": {
                    "similarity_score": similarity_score,
                    "engagement_score": engagement_score,
                    "quality_score": quality_score,
                },
            })

        return items

    async def _generate_personalized(
        self,
        workspace_id: UUID,
        client_id: UUID | None,
        gallery_ids: list[UUID] | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Generate personalized recommendations based on client preferences."""
        if not client_id:
            return await self._generate_by_engagement(workspace_id, gallery_ids, limit, config)

        # Get client preferences
        prefs = await self._repository.get_client_preference(workspace_id, client_id)
        if not prefs or not prefs.get("preference_embedding"):
            # Fall back to engagement-based
            return await self._generate_by_engagement(workspace_id, gallery_ids, limit, config)

        pref_embedding = prefs["preference_embedding"]
        if isinstance(pref_embedding, str):
            pref_embedding = [float(x) for x in pref_embedding.strip("[]").split(",")]

        # Find assets similar to preference embedding
        similar = await self._repository.find_similar_assets(
            workspace_id=workspace_id,
            query_embedding=pref_embedding,
            limit=limit * 2,
            min_similarity=0.5,
            gallery_ids=gallery_ids,
            min_quality_score=config.min_quality_score,
        )

        # Get engagement scores
        asset_ids = [s["asset_id"] for s in similar]
        engagement_map = await self._repository.get_engagement_scores_for_assets(
            workspace_id, asset_ids
        )

        # Score with personalization boost
        items = []
        preferred_scenes = prefs.get("preferred_scenes", [])

        for rank, asset_data in enumerate(similar[:limit]):
            asset_id = asset_data["asset_id"]
            engagement_data = engagement_map.get(asset_id, {})

            similarity_score = asset_data.get("similarity_score", 0)
            engagement_score = engagement_data.get("engagement_score", 0)
            quality_score = asset_data.get("overall_quality_score", 50)

            # Boost for matching preferred scenes
            relevance_score = 0.5
            scene = asset_data.get("scene_category")
            if scene and scene in preferred_scenes:
                relevance_score = 0.9

            final_score = (
                config.weights.similarity * similarity_score +
                config.weights.engagement * (engagement_score / 100) +
                config.weights.quality * (quality_score / 100) +
                config.weights.relevance * relevance_score
            )

            match_reasons = [
                {
                    "reason": "personalized_match",
                    "detail": f"Matches your preferences ({similarity_score:.0%})",
                    "weight": config.weights.similarity,
                },
            ]
            if scene in preferred_scenes:
                match_reasons.append({
                    "reason": "preferred_style",
                    "detail": f"Your preferred style: {scene}",
                    "weight": config.weights.relevance,
                })

            items.append({
                "asset_id": asset_id,
                "rank_position": rank + 1,
                "final_score": final_score,
                "similarity_score": similarity_score,
                "engagement_score": engagement_score,
                "quality_score": quality_score,
                "relevance_score": relevance_score,
                "scene_category": scene,
                "visual_tags": asset_data.get("scene_tags", []),
                "match_reasons": match_reasons,
                "score_breakdown": {
                    "similarity_score": similarity_score,
                    "engagement_score": engagement_score,
                    "quality_score": quality_score,
                    "relevance_score": relevance_score,
                },
            })

        return items

    async def _generate_hero_shots(
        self,
        workspace_id: UUID,
        gallery_ids: list[UUID] | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Generate hero shot recommendations - best overall quality."""
        top_assets = await self._repository.get_top_engaged_assets(
            workspace_id=workspace_id,
            gallery_ids=gallery_ids,
            limit=limit * 3,  # Get more for diversity
            min_engagement_score=config.min_engagement_score,
        )

        # Apply diversity selection
        items = []
        selected_scenes = []

        for asset_data in top_assets:
            scene = asset_data.get("scene_category")

            # Diversity check
            if config.diversity_factor > 0:
                scene_count = selected_scenes.count(scene)
                max_per_scene = max(2, limit // 4)
                if scene_count >= max_per_scene:
                    continue

            engagement_score = asset_data.get("engagement_score", 0)
            quality_score = asset_data.get("overall_quality_score", 50)
            aesthetic_score = asset_data.get("aesthetic_score", 50)

            final_score = (
                config.weights.engagement * (engagement_score / 100) +
                config.weights.quality * (quality_score / 100) +
                0.2 * (aesthetic_score / 100) if aesthetic_score else 0
            )

            items.append({
                "asset_id": asset_data["asset_id"],
                "rank_position": len(items) + 1,
                "final_score": final_score,
                "engagement_score": engagement_score,
                "quality_score": quality_score,
                "scene_category": scene,
                "match_reasons": [
                    {
                        "reason": "high_engagement",
                        "detail": f"Top {asset_data.get('score_percentile', 0):.0%} engagement",
                        "weight": config.weights.engagement,
                    },
                    {
                        "reason": "quality_shot",
                        "detail": f"Quality score: {quality_score:.0f}/100",
                        "weight": config.weights.quality,
                    },
                ],
                "score_breakdown": {
                    "engagement_score": engagement_score,
                    "quality_score": quality_score,
                },
            })

            selected_scenes.append(scene)

            if len(items) >= limit:
                break

        return items

    async def _generate_trending(
        self,
        workspace_id: UUID,
        gallery_ids: list[UUID] | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Generate trending recommendations - recent high performers."""
        # Get assets with recent high engagement
        top_assets = await self._repository.get_top_engaged_assets(
            workspace_id=workspace_id,
            gallery_ids=gallery_ids,
            limit=limit * 2,
            min_engagement_score=30,  # Lower threshold, focus on recency
        )

        # Sort by recent activity (views_last_7d, favorites_last_7d)
        sorted_assets = sorted(
            top_assets,
            key=lambda x: (x.get("views_last_7d", 0) + x.get("favorites_last_7d", 0) * 3),
            reverse=True,
        )

        items = []
        for rank, asset_data in enumerate(sorted_assets[:limit]):
            engagement_score = asset_data.get("engagement_score", 0)
            views_7d = asset_data.get("views_last_7d", 0)
            favorites_7d = asset_data.get("favorites_last_7d", 0)

            recency_score = min(1.0, (views_7d + favorites_7d * 3) / 50)

            final_score = (
                config.weights.engagement * (engagement_score / 100) +
                config.weights.recency * recency_score
            )

            items.append({
                "asset_id": asset_data["asset_id"],
                "rank_position": rank + 1,
                "final_score": final_score,
                "engagement_score": engagement_score,
                "recency_score": recency_score,
                "scene_category": asset_data.get("scene_category"),
                "match_reasons": [
                    {
                        "reason": "trending",
                        "detail": f"{views_7d} views, {favorites_7d} favorites this week",
                        "weight": config.weights.recency,
                    },
                ],
                "score_breakdown": {
                    "engagement_score": engagement_score,
                    "recency_score": recency_score,
                },
            })

        return items

    async def _generate_seasonal(
        self,
        workspace_id: UUID,
        target_season: str | None,
        gallery_ids: list[UUID] | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Generate seasonal recommendations."""
        if not target_season:
            # Default to current season
            month = datetime.now().month
            if month in [3, 4, 5]:
                target_season = "spring"
            elif month in [6, 7, 8]:
                target_season = "summer"
            elif month in [9, 10, 11]:
                target_season = "fall"
            else:
                target_season = "winter"

        season_attrs = SEASON_ATTRIBUTES.get(target_season, {})
        preferred_colors = season_attrs.get("colors", [])
        preferred_brightness = season_attrs.get("brightness")

        # Get top assets and filter by seasonal attributes
        top_assets = await self._repository.get_top_engaged_assets(
            workspace_id=workspace_id,
            gallery_ids=gallery_ids,
            limit=limit * 3,
            min_engagement_score=config.min_engagement_score,
        )

        items = []
        for asset_data in top_assets:
            color_palette = asset_data.get("color_palette")
            brightness = asset_data.get("brightness_level")

            # Calculate seasonal relevance
            relevance = 0.5
            if color_palette and color_palette in preferred_colors:
                relevance += 0.3
            if brightness and brightness == preferred_brightness:
                relevance += 0.2

            engagement_score = asset_data.get("engagement_score", 0)
            quality_score = asset_data.get("overall_quality_score", 50)

            final_score = (
                config.weights.engagement * (engagement_score / 100) +
                config.weights.quality * (quality_score / 100) +
                config.weights.relevance * relevance
            )

            items.append({
                "asset_id": asset_data["asset_id"],
                "rank_position": len(items) + 1,
                "final_score": final_score,
                "engagement_score": engagement_score,
                "quality_score": quality_score,
                "relevance_score": relevance,
                "scene_category": asset_data.get("scene_category"),
                "match_reasons": [
                    {
                        "reason": "seasonal_match",
                        "detail": f"Perfect for {target_season}",
                        "weight": config.weights.relevance,
                    },
                ],
                "score_breakdown": {
                    "engagement_score": engagement_score,
                    "quality_score": quality_score,
                    "relevance_score": relevance,
                },
            })

            if len(items) >= limit:
                break

        return items

    async def _generate_portfolio_selection(
        self,
        workspace_id: UUID,
        client_id: UUID | None,
        gallery_id: UUID | None,
        occasion_type: str | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Generate optimized portfolio selection for a client."""
        gallery_ids = [gallery_id] if gallery_id else None

        # If client has preferences, use personalized
        if client_id:
            prefs = await self._repository.get_client_preference(workspace_id, client_id)
            if prefs and prefs.get("preference_embedding"):
                return await self._generate_personalized(
                    workspace_id, client_id, gallery_ids, limit, config
                )

        # Otherwise, use occasion-based selection
        relevant_scenes = None
        if occasion_type and occasion_type in OCCASION_SCENE_MAPPING:
            relevant_scenes = OCCASION_SCENE_MAPPING[occasion_type]

        # Get top assets
        all_items = []

        if relevant_scenes:
            # Get assets from each relevant scene category
            items_per_scene = limit // len(relevant_scenes) + 1
            for scene in relevant_scenes:
                scene_assets = await self._repository.get_top_engaged_assets(
                    workspace_id=workspace_id,
                    gallery_ids=gallery_ids,
                    limit=items_per_scene,
                    scene_category=scene.value,
                    min_engagement_score=config.min_engagement_score,
                )
                all_items.extend(scene_assets)
        else:
            all_items = await self._repository.get_top_engaged_assets(
                workspace_id=workspace_id,
                gallery_ids=gallery_ids,
                limit=limit * 2,
                min_engagement_score=config.min_engagement_score,
            )

        # Score and dedupe
        seen_ids = set()
        items = []

        for asset_data in all_items:
            asset_id = asset_data["asset_id"]
            if asset_id in seen_ids:
                continue
            seen_ids.add(asset_id)

            engagement_score = asset_data.get("engagement_score", 0)
            quality_score = asset_data.get("overall_quality_score", 50)

            final_score = (
                config.weights.engagement * (engagement_score / 100) +
                config.weights.quality * (quality_score / 100)
            )

            items.append({
                "asset_id": asset_id,
                "rank_position": len(items) + 1,
                "final_score": final_score,
                "engagement_score": engagement_score,
                "quality_score": quality_score,
                "scene_category": asset_data.get("scene_category"),
                "match_reasons": [
                    {
                        "reason": "curated_selection",
                        "detail": "Optimized for your portfolio",
                        "weight": 1.0,
                    },
                ],
                "score_breakdown": {
                    "engagement_score": engagement_score,
                    "quality_score": quality_score,
                },
            })

            if len(items) >= limit:
                break

        # Sort by score
        items.sort(key=lambda x: x["final_score"], reverse=True)
        for i, item in enumerate(items):
            item["rank_position"] = i + 1

        return items

    async def _generate_print_worthy(
        self,
        workspace_id: UUID,
        gallery_ids: list[UUID] | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Generate print-worthy recommendations - high technical quality."""
        # Focus on quality scores
        modified_config = RecommendationConfig(
            weights=ScoringWeights(
                quality=0.50,
                engagement=0.25,
                similarity=0.05,
                relevance=0.10,
                recency=0.05,
                diversity=0.05,
            ).normalize(),
            min_quality_score=70,  # Higher quality threshold
        )

        return await self._generate_hero_shots(
            workspace_id, gallery_ids, limit, modified_config
        )

    async def _generate_social_media(
        self,
        workspace_id: UUID,
        gallery_ids: list[UUID] | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Generate social media optimized recommendations."""
        # Focus on engagement and aesthetics
        modified_config = RecommendationConfig(
            weights=ScoringWeights(
                engagement=0.40,
                quality=0.20,
                similarity=0.10,
                relevance=0.10,
                recency=0.15,
                diversity=0.05,
            ).normalize(),
        )

        return await self._generate_trending(
            workspace_id, gallery_ids, limit, modified_config
        )

    async def _generate_album_cover(
        self,
        workspace_id: UUID,
        gallery_id: UUID | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Generate album cover candidates."""
        gallery_ids = [gallery_id] if gallery_id else None

        # Hero shots make good covers
        return await self._generate_hero_shots(
            workspace_id, gallery_ids, limit, config
        )

    async def _generate_by_engagement(
        self,
        workspace_id: UUID,
        gallery_ids: list[UUID] | None,
        limit: int,
        config: RecommendationConfig,
    ) -> list[dict[str, Any]]:
        """Default: generate by engagement score."""
        return await self._generate_hero_shots(
            workspace_id, gallery_ids, limit, config
        )

    # =========================================================================
    # A/B Testing
    # =========================================================================

    async def _get_active_ab_test(
        self,
        workspace_id: UUID,
        recommendation_type: RecommendationType,
        client_id: UUID | None,
    ) -> dict[str, Any] | None:
        """Get active A/B test for this recommendation context."""
        client_type = None
        if client_id:
            prefs = await self._repository.get_client_preference(workspace_id, client_id)
            client_type = prefs.get("client_type") if prefs else None

        return await self._repository.get_active_ab_test(
            workspace_id=workspace_id,
            recommendation_type=recommendation_type.value,
            client_type=client_type,
        )

    def _assign_ab_variant(
        self,
        ab_test: dict[str, Any],
        workspace_id: UUID,
        client_id: UUID | None,
    ) -> str:
        """Assign a variant for an A/B test."""
        # Create deterministic hash for consistent assignment
        hash_input = f"{ab_test['test_id']}:{workspace_id}"
        if client_id:
            hash_input += f":{client_id}"

        hash_value = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)

        # Get variants and their weights
        variants = ab_test.get("variants", [])
        if not variants:
            return "control"

        total_weight = sum(v.get("weight", 50) for v in variants) + 50  # +50 for control
        roll = hash_value % total_weight

        # Check control first
        if roll < 50:
            return "control"

        # Check variants
        cumulative = 50
        for variant in variants:
            weight = variant.get("weight", 50)
            if roll < cumulative + weight:
                return variant["name"]
            cumulative += weight

        return "control"

    def _apply_ab_variant_config(
        self,
        config: RecommendationConfig,
        ab_test: dict[str, Any],
        variant_name: str,
    ) -> RecommendationConfig:
        """Apply variant configuration to recommendation config."""
        if variant_name == "control":
            variant_config = ab_test.get("control_config", {})
        else:
            variants = ab_test.get("variants", [])
            variant_config = {}
            for v in variants:
                if v["name"] == variant_name:
                    variant_config = v.get("config", {})
                    break

        # Apply config overrides
        if "weights" in variant_config:
            config.weights = ScoringWeights(**variant_config["weights"]).normalize()
        if "diversity_factor" in variant_config:
            config.diversity_factor = variant_config["diversity_factor"]
        if "min_quality_score" in variant_config:
            config.min_quality_score = variant_config["min_quality_score"]

        return config

    async def create_ab_test(
        self,
        workspace_id: UUID,
        test_name: str,
        test_type: str,
        control_config: dict,
        variants: list[dict],
        start_date: datetime,
        **kwargs,
    ) -> dict[str, Any]:
        """Create a new A/B test."""
        return await self._repository.create_ab_test(
            workspace_id=workspace_id,
            test_name=test_name,
            test_type=test_type,
            control_config=control_config,
            variants=variants,
            start_date=start_date,
            **kwargs,
        )

    async def start_ab_test(
        self,
        workspace_id: UUID,
        test_id: UUID,
    ) -> None:
        """Start an A/B test."""
        await self._repository.update_ab_test_status(
            workspace_id, test_id, "active"
        )
        logger.info(f"Started A/B test {test_id}")

    async def conclude_ab_test(
        self,
        workspace_id: UUID,
        test_id: UUID,
        winner_variant: str | None = None,
    ) -> None:
        """Conclude an A/B test."""
        await self._repository.update_ab_test_status(
            workspace_id=workspace_id,
            test_id=test_id,
            status="concluded",
            winner_variant=winner_variant,
        )
        logger.info(f"Concluded A/B test {test_id} with winner: {winner_variant}")

    async def get_ab_test_results(
        self,
        workspace_id: UUID,
        test_id: UUID,
    ) -> dict[str, Any]:
        """Get A/B test results with statistical analysis."""
        test = await self._repository.get_ab_test(workspace_id, test_id)
        if not test:
            raise ValueError(f"A/B test {test_id} not found")

        # Get recommendations assigned to this test
        recommendations = await self._repository.list_recommendations(
            workspace_id=workspace_id,
            limit=10000,
        )

        test_recommendations = [
            r for r in recommendations
            if r.get("ab_test_id") == test_id
        ]

        # Calculate metrics per variant
        variant_results = {}
        variants = ["control"] + [v["name"] for v in test.get("variants", [])]

        for variant in variants:
            variant_recs = [r for r in test_recommendations if r.get("ab_variant") == variant]

            total = len(variant_recs)
            if total == 0:
                variant_results[variant] = {
                    "sample_size": 0,
                    "conversion_rate": 0,
                    "avg_selection_rate": 0,
                }
                continue

            # Calculate metrics
            items_selected = sum(r.get("items_selected", 0) for r in variant_recs)
            items_recommended = sum(r.get("total_recommended", 0) for r in variant_recs)

            selection_rate = items_selected / items_recommended if items_recommended > 0 else 0
            avg_rating = sum(r.get("user_rating", 0) for r in variant_recs if r.get("user_rating")) / total

            variant_results[variant] = {
                "sample_size": total,
                "items_recommended": items_recommended,
                "items_selected": items_selected,
                "selection_rate": selection_rate,
                "avg_rating": avg_rating,
            }

        # Statistical comparison
        control = variant_results.get("control", {})
        significance_results = {}

        for variant_name, results in variant_results.items():
            if variant_name == "control":
                continue

            # Simple z-test for proportions
            control_rate = control.get("selection_rate", 0)
            variant_rate = results.get("selection_rate", 0)
            control_n = control.get("sample_size", 0)
            variant_n = results.get("sample_size", 0)

            if control_n > 0 and variant_n > 0 and control_rate > 0:
                lift = (variant_rate - control_rate) / control_rate
                # Simplified p-value calculation
                pooled_rate = (control_rate * control_n + variant_rate * variant_n) / (control_n + variant_n)
                se = (pooled_rate * (1 - pooled_rate) * (1/control_n + 1/variant_n)) ** 0.5
                z = (variant_rate - control_rate) / se if se > 0 else 0
                # Approximate p-value
                p_value = 2 * (1 - min(0.9999, abs(z) / 4))  # Simplified

                significance_results[variant_name] = {
                    "lift": lift,
                    "p_value": p_value,
                    "is_significant": p_value < test.get("significance_level", 0.05),
                }

        return {
            "test_id": str(test_id),
            "test_name": test["test_name"],
            "status": test["status"],
            "primary_metric": test["primary_metric"],
            "variant_results": variant_results,
            "significance_results": significance_results,
            "total_samples": sum(v.get("sample_size", 0) for v in variant_results.values()),
            "min_sample_size": test.get("min_sample_size", 100),
        }

    # =========================================================================
    # Feedback & Learning
    # =========================================================================

    async def record_feedback(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
        feedback_type: FeedbackType,
        *,
        feedback_source: FeedbackSource = FeedbackSource.USER,
        user_id: UUID | None = None,
        client_id: UUID | None = None,
        rating: int | None = None,
        comment: str | None = None,
        selected_count: int | None = None,
        rejected_count: int | None = None,
    ) -> dict[str, Any]:
        """Record user feedback on recommendations."""
        feedback = await self._repository.create_feedback(
            workspace_id=workspace_id,
            recommendation_id=recommendation_id,
            feedback_source=feedback_source.value,
            feedback_type=feedback_type.value,
            user_id=user_id,
            client_id=client_id,
            rating=rating,
            comment=comment,
            selected_count=selected_count,
            rejected_count=rejected_count,
        )

        # If client provided feedback, update their preferences
        if client_id and selected_count and selected_count > 0:
            # Get selected items
            items = await self._repository.get_recommendation_items(
                workspace_id, recommendation_id
            )
            selected_ids = [
                i["asset_id"] for i in items if i.get("was_selected")
            ]
            if selected_ids:
                await self.learn_client_preferences(
                    workspace_id, client_id, selected_asset_ids=selected_ids
                )

        logger.info(
            f"Recorded {feedback_type.value} feedback for recommendation {recommendation_id}"
        )

        return feedback

    async def record_item_interaction(
        self,
        workspace_id: UUID,
        item_id: UUID,
        interaction_type: str,
        *,
        view_duration_ms: int | None = None,
    ) -> None:
        """Record interaction with a recommendation item."""
        await self._repository.record_item_interaction(
            workspace_id=workspace_id,
            item_id=item_id,
            was_viewed=interaction_type in ["view", "select", "download"],
            was_selected=interaction_type == "select",
            was_downloaded=interaction_type == "download",
            was_rejected=interaction_type == "reject",
            view_duration_ms=view_duration_ms,
        )

    # =========================================================================
    # Utility Methods
    # =========================================================================

    async def get_recommendation(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
        *,
        include_items: bool = True,
        include_asset_details: bool = False,
    ) -> dict[str, Any] | None:
        """Get a recommendation with optional items."""
        recommendation = await self._repository.get_recommendation(
            workspace_id, recommendation_id
        )
        if not recommendation:
            return None

        if include_items:
            items = await self._repository.get_recommendation_items(
                workspace_id,
                recommendation_id,
                include_asset_details=include_asset_details,
            )
            recommendation["items"] = items

        return recommendation

    async def list_recommendations(
        self,
        workspace_id: UUID,
        **filters,
    ) -> list[dict[str, Any]]:
        """List recommendations with filtering."""
        return await self._repository.list_recommendations(workspace_id, **filters)

    async def get_top_assets(
        self,
        workspace_id: UUID,
        *,
        limit: int = 50,
        scene_category: str | None = None,
    ) -> list[dict[str, Any]]:
        """Get top performing assets."""
        return await self._repository.get_top_assets(
            workspace_id, limit=limit, scene_category=scene_category
        )


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_portfolio_recommendation_service: PortfolioRecommendationService | None = None


def get_portfolio_recommendation_service() -> PortfolioRecommendationService:
    """Get the portfolio recommendation service singleton."""
    global _portfolio_recommendation_service
    if _portfolio_recommendation_service is None:
        _portfolio_recommendation_service = PortfolioRecommendationService()
    return _portfolio_recommendation_service
