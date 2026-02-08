"""Gallery Design AI Recommendations API Endpoints.

Provides AI-powered design recommendations based on gallery photo analysis.

Features:
- Smart photo sampling for representative diversity
- Color and composition analysis
- Style, theme, and font recommendations
- Redis caching (24hr TTL)

Feature: Enhancement 4 - AI Recommendations
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Any, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta
import json

from src.middleware.auth import get_workspace_id, get_current_user
from src.log_config import get_logger
from src.observability.metrics import get_metrics
from src.services.gallery_recommendation_service import (
    GalleryRecommendationService,
    InsufficientGalleryDataError,
    RecommendationError,
)
from src.cache.redis_client import redis_client

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


def get_recommendation_service() -> GalleryRecommendationService:
    """Get or create Gallery Recommendation Service instance."""
    return GalleryRecommendationService(
        redis_client=redis_client,
    )


# =============================================================================
# AI Recommendations Endpoints
# =============================================================================


@router.post("/galleries/{gallery_id}/design/recommendations")
async def get_ai_recommendations(
    gallery_id: UUID,
    workspace_id: str = Depends(get_workspace_id),
    current_user: dict = Depends(get_current_user),
    use_cache: bool = Query(True),
    service: GalleryRecommendationService = Depends(get_recommendation_service),
) -> dict[str, Any]:
    """Generate AI-powered design recommendations for a gallery.

    Analyzes gallery photos to recommend:
    - Top 5 cover styles (with reasoning)
    - Best matching theme
    - Recommended font pairing
    - Analysis summary (colors, composition, scenes)

    Process:
    1. Check Redis cache (24hr TTL)
    2. Select representative sample (10 photos with CLIP embeddings)
    3. Extract features (colors, composition, scenes)
    4. Score options (styles, themes, fonts)
    5. Cache and return

    Args:
        gallery_id: Gallery ID to analyze
        workspace_id: Workspace ID (from auth)
        current_user: Current user info
        use_cache: Whether to use cached recommendations (default: True)

    Returns:
        Recommendation response with:
        {
            "gallery_id": str,
            "recommended_styles": [
                {
                    "style_id": str,
                    "score": 0-1,
                    "reasoning": str
                },
                ...  // up to 5
            ],
            "recommended_theme": {
                "theme_id": str,
                "score": 0-1,
                "reasoning": str
            },
            "recommended_font_pairing": {
                "pairing_id": str,
                "score": 0-1,
                "reasoning": str
            },
            "analysis_summary": {
                "total_photos": int,
                "sample_size": int,
                "dominant_colors": [(R,G,B), ...],
                "avg_brightness": 0-1,
                "avg_saturation": 0-1,
                "aspect_ratio_breakdown": {
                    "portrait": int,
                    "landscape": int,
                    "square": int
                },
                "color_temperature": {
                    "warm_percentage": 0-1,
                    "cool_percentage": 0-1
                },
                "scene_categories": {
                    "category_name": count,
                    ...
                }
            },
            "cached": bool,
            "generated_at": ISO8601 timestamp
        }

    Raises:
        HTTPException:
            400: Gallery has fewer than 3 photos
            404: Gallery not found
            403: Unauthorized (no access to workspace)
    """
    try:
        # Generate recommendations using the service
        recommendations = await service.generate_recommendations(
            workspace_id=UUID(workspace_id),
            gallery_id=gallery_id,
            use_cache=use_cache,
        )

        # Log recommendation request (for metrics/analytics)
        logger.info(
            "AI recommendations generated",
            extra={
                "gallery_id": str(gallery_id),
                "workspace_id": workspace_id,
                "user_id": current_user.get("user_id"),
                "cached": recommendations.get("cached", False),
            },
        )

        # Track metrics
        metrics.counter("gallery.recommendations.generated", 1, {
            "workspace_id": workspace_id,
            "cached": str(recommendations.get("cached", False)),
        })

        return recommendations

    except InsufficientGalleryDataError as e:
        logger.warning(
            "Insufficient gallery data for recommendations",
            extra={
                "gallery_id": str(gallery_id),
                "error": e.message,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except RecommendationError as e:
        logger.error(
            "Recommendation generation failed",
            extra={
                "gallery_id": str(gallery_id),
                "error": e.message,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except Exception as e:
        logger.error(
            "Unexpected error generating recommendations",
            extra={
                "gallery_id": str(gallery_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to generate recommendations"},
        )


@router.get("/galleries/{gallery_id}/design/recommendations/status")
async def check_recommendation_cache(
    gallery_id: UUID,
    workspace_id: str = Depends(get_workspace_id),
) -> dict[str, Any]:
    """Check if cached recommendations exist for a gallery.

    Useful for UI to determine if recommendations were recently generated.

    Args:
        gallery_id: Gallery ID
        workspace_id: Workspace ID (from auth)

    Returns:
        {
            "has_cache": bool,
            "cached_at": ISO8601 timestamp | null,
            "cache_expires_at": ISO8601 timestamp | null
        }
    """
    try:
        cache_key = f"gallery:recommendations:{gallery_id}"

        if not redis_client:
            # Redis not available, return no cache
            return {
                "has_cache": False,
                "cached_at": None,
                "cache_expires_at": None,
            }

        # Check if cache entry exists
        cached_data = await redis_client.get(cache_key)

        if not cached_data:
            return {
                "has_cache": False,
                "cached_at": None,
                "cache_expires_at": None,
            }

        # Get TTL (time to live in seconds)
        ttl = await redis_client.ttl(cache_key)

        if ttl <= 0:
            # Cache expired or no TTL set
            return {
                "has_cache": False,
                "cached_at": None,
                "cache_expires_at": None,
            }

        # Parse cached data to get generated_at timestamp
        cached_obj = json.loads(cached_data)
        generated_at = cached_obj.get("generated_at")

        # Calculate cache expiration time
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=ttl)

        return {
            "has_cache": True,
            "cached_at": generated_at,
            "cache_expires_at": expires_at.isoformat(),
        }

    except Exception as e:
        logger.error(
            "Error checking recommendation cache status",
            extra={
                "gallery_id": str(gallery_id),
                "error": str(e),
            },
        )
        # Return no cache on error (safe fallback)
        return {
            "has_cache": False,
            "cached_at": None,
            "cache_expires_at": None,
        }


@router.delete("/galleries/{gallery_id}/design/recommendations/cache")
async def invalidate_recommendation_cache(
    gallery_id: UUID,
    workspace_id: str = Depends(get_workspace_id),
) -> dict[str, str]:
    """Invalidate cached recommendations for a gallery.

    Use this when gallery photos are significantly updated.

    Args:
        gallery_id: Gallery ID
        workspace_id: Workspace ID (from auth)

    Returns:
        {
            "message": "Recommendations cache invalidated",
            "gallery_id": str
        }
    """
    try:
        cache_key = f"gallery:recommendations:{gallery_id}"

        if redis_client:
            # Delete the cache entry
            await redis_client.delete(cache_key)
            logger.info(
                "Recommendations cache invalidated",
                extra={
                    "gallery_id": str(gallery_id),
                    "workspace_id": workspace_id,
                },
            )

        return {
            "message": "Recommendations cache invalidated",
            "gallery_id": str(gallery_id),
        }

    except Exception as e:
        logger.error(
            "Error invalidating recommendation cache",
            extra={
                "gallery_id": str(gallery_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to invalidate cache"},
        )


# =============================================================================
# Health Check
# =============================================================================


@router.get("/_health")
async def health_check() -> dict[str, str]:
    """Health check endpoint for recommendations service.

    Returns:
        Service status
    """
    return {"status": "ok", "service": "gallery-design-recommendations"}
