"""Emotion Detection API endpoints for AI Service.

Provides HTTP API for emotion detection in photos.
Uses customer API keys from user_ai_provider_settings.
"""

import logging
from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from rawdrive_mcp.db import get_db_pool
from services.emotion_detection_service import (
    EmotionDetectionService,
    get_emotion_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai-analysis"])


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class AnalyzeEmotionsRequest(BaseModel):
    """Request to analyze photo emotions."""

    user_id: UUID = Field(..., description="User UUID (for API key lookup)")
    workspace_id: UUID = Field(..., description="Workspace UUID")
    photo_id: UUID = Field(..., description="Photo/Asset UUID to analyze")
    provider: str = Field(
        default="cloud_vision",
        description="AI provider to use (cloud_vision, gemini)",
    )


class FaceEmotion(BaseModel):
    """Per-face emotion result."""

    face_index: int = Field(..., description="Face index in photo")
    emotions: Dict[str, float] = Field(
        ..., description="Emotion scores (joy, sadness, anger, surprise, fear, disgust, contentment)"
    )
    dominant_emotion: str = Field(..., description="Primary detected emotion")
    confidence: float = Field(..., description="Confidence score for dominant emotion")
    bounding_box: Dict[str, int] = Field(..., description="Face bounding box {x, y, width, height}")


class PhotoEmotionSummary(BaseModel):
    """Photo-level emotion summary."""

    dominant_emotion: str | None = Field(..., description="Overall photo emotion")
    average_confidence: float = Field(..., description="Average confidence across faces")
    emotion_distribution: Dict[str, float] = Field(..., description="Average emotion scores")
    face_count: int = Field(..., description="Number of faces detected")


class EmotionAnalysisResponse(BaseModel):
    """Response for emotion analysis."""

    photo_id: str = Field(..., description="Photo UUID")
    faces: list[FaceEmotion] = Field(..., description="Per-face emotion results")
    photo_emotion_summary: PhotoEmotionSummary = Field(..., description="Photo-level summary")
    provider: str = Field(..., description="AI provider used")
    credits_used: int = Field(..., description="Credits consumed")
    analyzed_at: str = Field(..., description="Analysis timestamp (ISO 8601)")


class GetEmotionsResponse(BaseModel):
    """Response for getting cached emotions."""

    photo_id: str
    emotions: Dict[str, float] | None
    dominant_emotion: str | None
    emotion_confidence: float | None
    analyzed_at: str | None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


async def get_service() -> EmotionDetectionService:
    """Dependency: Get emotion detection service."""
    db_pool = await get_db_pool()
    return get_emotion_service(db_pool)


@router.post(
    "/analyze",
    response_model=EmotionAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze photo emotions",
    description="Detect emotions in photo faces using customer API keys (10 credits)",
)
async def analyze_photo_emotions(
    request: AnalyzeEmotionsRequest,
    service: EmotionDetectionService = Depends(get_service),
):
    """Analyze emotions in a photo.

    **Requirements:**
    - User must have configured API credentials for the selected provider
    - Photo must exist in the workspace

    **Cost:** 10 credits per photo

    **Returns:**
    - Per-face emotion breakdown (7 emotions)
    - Photo-level emotion summary
    - Dominant emotion and confidence scores

    **Errors:**
    - 400: Invalid request or missing credentials
    - 404: Photo not found
    - 500: AI provider error
    """
    try:
        result = await service.detect_emotions(
            photo_id=request.photo_id,
            user_id=request.user_id,
            workspace_id=request.workspace_id,
            provider=request.provider,
        )

        return EmotionAnalysisResponse(**result.to_dict())

    except ValueError as e:
        logger.warning(f"Validation error in emotion detection: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Emotion detection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Emotion detection failed: {str(e)}",
        )


@router.get(
    "/photos/{photo_id}/emotions",
    response_model=GetEmotionsResponse,
    summary="Get cached emotions",
    description="Retrieve previously analyzed emotion results for a photo",
)
async def get_photo_emotions(
    photo_id: UUID,
    workspace_id: UUID,
    service: EmotionDetectionService = Depends(get_service),
):
    """Get cached emotion results for a photo.

    **No credits charged** - retrieves previously analyzed results.

    Returns None if photo has not been analyzed yet.
    """
    try:
        async with service.db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    emotions,
                    dominant_emotion,
                    emotion_confidence,
                    analyzed_at
                FROM asset_analysis
                WHERE asset_id = $1 AND workspace_id = $2
                """,
                photo_id,
                workspace_id,
            )

            if not row:
                return GetEmotionsResponse(
                    photo_id=str(photo_id),
                    emotions=None,
                    dominant_emotion=None,
                    emotion_confidence=None,
                    analyzed_at=None,
                )

            return GetEmotionsResponse(
                photo_id=str(photo_id),
                emotions=row["emotions"],
                dominant_emotion=row["dominant_emotion"],
                emotion_confidence=row["emotion_confidence"],
                analyzed_at=row["analyzed_at"].isoformat() if row["analyzed_at"] else None,
            )

    except Exception as e:
        logger.error(f"Failed to get cached emotions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve emotions: {str(e)}",
        )


@router.post(
    "/batch",
    summary="Batch analyze multiple photos",
    description="Analyze emotions in multiple photos (8 credits per photo)",
)
async def batch_analyze_emotions(
    user_id: UUID,
    workspace_id: UUID,
    photo_ids: list[UUID],
    provider: str = "cloud_vision",
    service: EmotionDetectionService = Depends(get_service),
):
    """Batch analyze emotions in multiple photos.

    **Cost:** 8 credits per photo (bulk discount)

    **Limits:**
    - Max 100 photos per batch
    - Async processing for batches > 10 photos
    """
    if len(photo_ids) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 100 photos per batch",
        )

    results = []
    errors = []

    for photo_id in photo_ids:
        try:
            result = await service.detect_emotions(
                photo_id=photo_id,
                user_id=user_id,
                workspace_id=workspace_id,
                provider=provider,
            )
            results.append(result.to_dict())
        except Exception as e:
            logger.warning(f"Failed to analyze photo {photo_id}: {e}")
            errors.append({"photo_id": str(photo_id), "error": str(e)})

    return {
        "results": results,
        "errors": errors,
        "total_photos": len(photo_ids),
        "successful": len(results),
        "failed": len(errors),
        "total_credits": len(results) * 8,
    }


@router.get(
    "/health",
    summary="Emotion detection health check",
    description="Check if emotion detection service is operational",
)
async def emotion_detection_health():
    """Health check for emotion detection service."""
    return {
        "status": "healthy",
        "service": "emotion-detection",
        "providers": ["cloud_vision", "gemini"],
    }
