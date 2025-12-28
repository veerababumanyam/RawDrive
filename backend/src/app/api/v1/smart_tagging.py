"""Smart Tagging API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/smart-tagging.

Provides endpoints for:
- Asset analysis status and AI-generated metadata
- Content detection job management
- Tagging health statistics
- Gallery and workspace-level tagging analytics
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse
from app.api.exceptions import InternalError, NotFoundError
from app.services.content_detection_service import get_content_detection_service
from app.services.tagging_health_service import get_tagging_health_service
from app.services.search_service import get_search_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class AnalysisStatusResponse(BaseModel):
    """Asset analysis status response."""

    asset_id: str
    vision_status: Optional[str] = Field(None, description="Vision analysis status")
    vision_provider: Optional[str] = Field(None, description="AI provider used")
    vision_completed_at: Optional[str] = None
    face_status: Optional[str] = Field(None, description="Face detection status")
    face_provider: Optional[str] = None
    face_completed_at: Optional[str] = None
    tag_count: int = Field(0, description="Number of AI-generated tags")
    face_count: int = Field(0, description="Number of detected faces")


class ContentJobResponse(BaseModel):
    """Content detection job response."""

    id: str
    asset_id: str
    status: str
    priority: int
    retry_count: int = 0
    error_message: Optional[str] = None
    scheduled_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str


class QueueDetectionRequest(BaseModel):
    """Request to queue asset(s) for content detection."""

    asset_ids: list[UUID] = Field(..., min_length=1, max_length=100)
    priority: int = Field(5, ge=0, le=10, description="Job priority (0=batch, 5=normal, 10=urgent)")
    force: bool = Field(False, description="Re-analyze even if already processed")


class BulkReanalyzeRequest(BaseModel):
    """Request to reanalyze multiple assets."""

    asset_ids: list[UUID] = Field(..., min_length=1, max_length=100)


class BulkReanalyzeResponse(BaseModel):
    """Response for bulk reanalyze operation."""

    queued: int = Field(..., description="Number of assets queued for reanalysis")
    failed: int = Field(..., description="Number of assets that failed to queue")


class QueueDetectionResponse(BaseModel):
    """Response for bulk queue operation."""

    queued: int
    skipped: int


class DetectionStatsResponse(BaseModel):
    """Content detection statistics response."""

    jobs: dict = Field(..., description="Job queue statistics")
    analysis: dict = Field(..., description="Asset analysis statistics")


class PhotoAnalysisResponse(BaseModel):
    """Photo analysis response."""

    description: str
    tags: list[str]
    hashtags: list[str]
    quality_score: int
    sharpness: int
    exposure: int
    composition: int
    dominant_colors: list[str]
    lighting: str
    mood: str
    improvements: list[str]
    best_for: list[str]


class AnalyzePhotoRequest(BaseModel):
    """Request to analyze a photo."""

    photo_url: str = Field(..., description="URL of the photo to analyze")


class GenerateCaptionsRequest(BaseModel):
    """Request to generate captions."""

    photo_url: str = Field(..., description="URL of the photo")
    style: str = Field("professional", description="Caption style: professional, casual, poetic")
    count: int = Field(3, ge=1, le=5, description="Number of captions to generate")


class GenerateHashtagsRequest(BaseModel):
    """Request to generate hashtags."""

    photo_url: str = Field(..., description="URL of the photo")
    count: int = Field(15, ge=5, le=30, description="Number of hashtags to generate")


class CaptionsResponse(BaseModel):
    """Captions generation response."""

    captions: list[str]
    style: str


class HashtagsResponse(BaseModel):
    """Hashtags generation response."""

    hashtags: list[str]
    categories: dict[str, list[str]]


class HealthBadgeResponse(BaseModel):
    """Gallery tagging health badge."""

    badge: str = Field(..., description="Health status: excellent, good, needs_attention, poor")
    vision_pct: float = Field(..., description="Percentage of assets with vision analysis")
    face_pct: float = Field(..., description="Percentage of assets with face detection")
    tag_pct: float = Field(..., description="Percentage of assets with at least one tag")


class GalleryHealthResponse(BaseModel):
    """Gallery tagging health statistics."""

    gallery_id: str
    total_assets: int
    vision_completed: int
    vision_failed: int
    vision_pending: int
    face_completed: int
    face_failed: int
    face_pending: int
    tagged_assets: int
    total_tags: int
    ai_tags: int
    manual_tags: int
    badge: HealthBadgeResponse


class WorkspaceHealthResponse(BaseModel):
    """Workspace-wide tagging health statistics."""

    workspace_id: str
    total_assets: int
    total_galleries: int
    vision_completed: int
    vision_pending: int
    vision_failed: int
    face_completed: int
    face_pending: int
    face_failed: int
    tagged_assets: int
    total_tags: int
    ai_tags: int
    manual_tags: int
    galleries: list[GalleryHealthResponse]


class GalleryFilterRequest(BaseModel):
    """Request to filter gallery assets by tags and people."""

    tags: Optional[list[str]] = Field(None, description="Tag names to filter by")
    people: Optional[list[str]] = Field(None, description="Person names to filter by")
    tag_source: Optional[str] = Field(None, description="Tag source filter: manual, ai_vision, ai_gemini, ai_local")


class GalleryFilterResponse(BaseModel):
    """Response containing filtered asset IDs."""

    asset_ids: list[str] = Field(..., description="Filtered asset IDs")
    total_count: int = Field(..., description="Total number of matching assets")
    applied_filters: dict = Field(..., description="Applied filter criteria")


# ---------------------------------------------------------------------------
# Asset Analysis Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/assets/{asset_id}/analysis",
    response_model=AnalysisStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Get asset analysis status",
    responses={
        404: {"model": ErrorResponse, "description": "Asset not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_asset_analysis(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> AnalysisStatusResponse:
    """
    Get the AI analysis status for an asset.

    Returns vision analysis status, face detection status, and counts
    of AI-generated tags and detected faces.
    """
    service = get_content_detection_service()
    try:
        result = await service.get_detection_status(
            asset_id=asset_id,
            workspace_id=workspace_id,
        )

        if not result:
            # Asset has no analysis record - return default
            return AnalysisStatusResponse(
                asset_id=str(asset_id),
                vision_status="pending",
                face_status="pending",
            )

        analysis = result.get("analysis", {}) or {}
        job = result.get("job", {}) or {}

        return AnalysisStatusResponse(
            asset_id=str(asset_id),
            vision_status=analysis.get("vision_status", "pending"),
            vision_provider=analysis.get("vision_provider"),
            vision_completed_at=analysis.get("vision_completed_at"),
            face_status=analysis.get("face_status", "pending"),
            face_provider=analysis.get("face_provider"),
            face_completed_at=analysis.get("face_completed_at"),
            tag_count=analysis.get("tag_count", 0),
            face_count=analysis.get("face_count", 0),
        )

    except Exception as e:
        logger.exception("Failed to get asset analysis status")
        raise InternalError("Failed to get asset analysis status")


# ---------------------------------------------------------------------------
# Content Detection Job Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/queue",
    response_model=QueueDetectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Queue assets for content detection",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def queue_detection(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: QueueDetectionRequest,
) -> QueueDetectionResponse:
    """
    Queue one or more assets for AI content detection.

    Creates jobs in the content detection queue. Jobs are processed by
    the content detection worker in priority order.
    """
    service = get_content_detection_service()
    try:
        result = await service.queue_detection_bulk(
            asset_ids=request.asset_ids,
            workspace_id=workspace_id,
            priority=request.priority,
        )
        return QueueDetectionResponse(**result)

    except Exception as e:
        logger.exception("Failed to queue content detection")
        raise InternalError("Failed to queue content detection")


@router.post(
    "/assets/{asset_id}/reanalyze",
    response_model=ContentJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Reanalyze an asset",
    responses={
        404: {"model": ErrorResponse, "description": "Asset not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def reanalyze_asset(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> ContentJobResponse:
    """
    Queue an asset for re-analysis.

    Removes existing AI-generated tags and queues the asset for fresh
    content detection with high priority.
    """
    service = get_content_detection_service()
    try:
        job_id = await service.reanalyze_asset(
            asset_id=asset_id,
            workspace_id=workspace_id,
        )

        # Get job details
        job = await service.content_job_repo.find_by_id(job_id)
        if not job:
            raise NotFoundError("Job not found after creation")

        return ContentJobResponse(
            id=str(job["id"]),
            asset_id=str(job["asset_id"]),
            status=job["status"],
            priority=job["priority"],
            retry_count=job.get("retry_count", 0),
            error_message=job.get("error_message"),
            scheduled_at=job.get("scheduled_at"),
            started_at=job.get("started_at"),
            completed_at=job.get("completed_at"),
            created_at=job["created_at"],
        )

    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to reanalyze asset")
        raise InternalError("Failed to reanalyze asset")


@router.post(
    "/assets/reanalyze/bulk",
    response_model=BulkReanalyzeResponse,
    status_code=status.HTTP_200_OK,
    summary="Reanalyze multiple assets",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def reanalyze_assets_bulk(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkReanalyzeRequest,
) -> BulkReanalyzeResponse:
    """
    Queue multiple assets for re-analysis.

    Removes existing AI-generated tags and queues each asset for fresh
    content detection with high priority. Processes up to 100 assets
    per request.
    """
    service = get_content_detection_service()
    try:
        result = await service.reanalyze_assets_bulk(
            asset_ids=request.asset_ids,
            workspace_id=workspace_id,
        )
        return BulkReanalyzeResponse(**result)

    except Exception as e:
        logger.exception("Failed to reanalyze assets")
        raise InternalError("Failed to reanalyze assets")


@router.get(
    "/stats",
    response_model=DetectionStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get content detection statistics",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_detection_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> DetectionStatsResponse:
    """
    Get content detection job queue and analysis statistics.

    Provides counts of pending, processing, completed, and failed jobs
    along with overall analysis completion rates.
    """
    service = get_content_detection_service()
    try:
        result = await service.get_detection_stats(workspace_id=workspace_id)
        return DetectionStatsResponse(**result)

    except Exception as e:
        logger.exception("Failed to get detection stats")
        raise InternalError("Failed to get detection stats")


# ---------------------------------------------------------------------------
# Photo Analysis Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/assets/{asset_id}/analyze",
    response_model=PhotoAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze a photo with AI",
    responses={
        404: {"model": ErrorResponse, "description": "Asset not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        400: {"model": ErrorResponse, "description": "AI not configured"},
    },
)
async def analyze_photo(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AnalyzePhotoRequest,
) -> PhotoAnalysisResponse:
    """
    Analyze a photo using AI for metadata, quality scoring, and suggestions.

    Requires user to have Gemini API key configured. Returns detailed
    analysis including description, tags, quality metrics, and improvements.
    """
    from app.services.photo_analysis_service import get_photo_analysis_service

    service = get_photo_analysis_service()
    try:
        # Get signed URL for the asset
        from app.services.signed_url_service import get_signed_url_service
        signed_url_service = get_signed_url_service()
        photo_url = await signed_url_service.get_signed_url(
            asset_id=asset_id,
            workspace_id=workspace_id,
            operation="read",
        )

        result = await service.analyze_photo(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            photo_url=photo_url,
            photo_id=asset_id,
        )

        return PhotoAnalysisResponse(**result.to_dict())

    except Exception as e:
        logger.exception("Failed to analyze photo")
        raise InternalError("Failed to analyze photo")


@router.post(
    "/assets/{asset_id}/captions",
    response_model=CaptionsResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate captions for a photo",
    responses={
        404: {"model": ErrorResponse, "description": "Asset not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        400: {"model": ErrorResponse, "description": "AI not configured"},
    },
)
async def generate_captions(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: GenerateCaptionsRequest,
) -> CaptionsResponse:
    """
    Generate AI-powered captions for a photo.

    Requires user to have Gemini API key configured. Returns multiple
    caption options in the specified style.
    """
    from app.services.caption_hashtag_service import get_caption_hashtag_service

    service = get_caption_hashtag_service()
    try:
        # Get signed URL for the asset
        from app.services.signed_url_service import get_signed_url_service
        signed_url_service = get_signed_url_service()
        photo_url = await signed_url_service.get_signed_url(
            asset_id=asset_id,
            workspace_id=workspace_id,
            operation="read",
        )

        result = await service.generate_captions(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            photo_url=photo_url,
            style=request.style,
            count=request.count,
            photo_id=asset_id,
        )

        return CaptionsResponse(**result.to_dict())

    except Exception as e:
        logger.exception("Failed to generate captions")
        raise InternalError("Failed to generate captions")


@router.post(
    "/assets/{asset_id}/hashtags",
    response_model=HashtagsResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate hashtags for a photo",
    responses={
        404: {"model": ErrorResponse, "description": "Asset not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        400: {"model": ErrorResponse, "description": "AI not configured"},
    },
)
async def generate_hashtags(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: GenerateHashtagsRequest,
) -> HashtagsResponse:
    """
    Generate AI-powered hashtags for a photo.

    Requires user to have Gemini API key configured. Returns categorized
    hashtags suitable for social media.
    """
    from app.services.caption_hashtag_service import get_caption_hashtag_service

    service = get_caption_hashtag_service()
    try:
        # Get signed URL for the asset
        from app.services.signed_url_service import get_signed_url_service
        signed_url_service = get_signed_url_service()
        photo_url = await signed_url_service.get_signed_url(
            asset_id=asset_id,
            workspace_id=workspace_id,
            operation="read",
        )

        result = await service.generate_hashtags(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            photo_url=photo_url,
            count=request.count,
            photo_id=asset_id,
        )

        return HashtagsResponse(**result.to_dict())

    except Exception as e:
        logger.exception("Failed to generate hashtags")
        raise InternalError("Failed to generate hashtags")


# ---------------------------------------------------------------------------
# Tagging Health Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/health",
    response_model=WorkspaceHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Get workspace tagging health",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_workspace_health(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    include_galleries: Annotated[bool, Query(description="Include per-gallery stats")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Max galleries to include")] = 20,
) -> WorkspaceHealthResponse:
    """
    Get workspace-wide tagging health statistics.

    Provides aggregated statistics on AI analysis completion rates,
    tag coverage, and optionally per-gallery breakdowns.
    """
    service = get_tagging_health_service()
    try:
        result = await service.get_workspace_health(
            workspace_id=workspace_id,
            include_galleries=include_galleries,
            limit=limit,
        )
        return WorkspaceHealthResponse(**result)

    except Exception as e:
        logger.exception("Failed to get workspace tagging health")
        raise InternalError("Failed to get workspace tagging health")


@router.get(
    "/galleries/{gallery_id}/health",
    response_model=GalleryHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Get gallery tagging health",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_gallery_health(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> GalleryHealthResponse:
    """
    Get tagging health statistics for a specific gallery.

    Returns completion rates for vision analysis and face detection,
    along with tag counts and an overall health badge.
    """
    service = get_tagging_health_service()
    try:
        result = await service.get_gallery_health(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )

        if not result:
            raise NotFoundError("Gallery not found or has no assets")

        return GalleryHealthResponse(**result)

    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to get gallery tagging health")
        raise InternalError("Failed to get gallery tagging health")


@router.post(
    "/health/refresh",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Refresh tagging health statistics",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def refresh_health_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> None:
    """
    Refresh the materialized view for tagging health statistics.

    This is a potentially slow operation that recalculates all statistics.
    Should be called sparingly, typically after bulk operations complete.
    """
    service = get_tagging_health_service()
    try:
        await service.refresh_stats(workspace_id=workspace_id)
        return  # Explicit return None for 204

    except Exception as e:
        logger.exception("Failed to refresh health stats")
        raise InternalError("Failed to refresh health stats")


@router.get(
    "/galleries/{gallery_id}/filter",
    response_model=GalleryFilterResponse,
    status_code=status.HTTP_200_OK,
    summary="Filter gallery assets by tags and people",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def filter_gallery_assets(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    tags: Annotated[Optional[list[str]], Query(description="Tag names to filter by")] = None,
    people: Annotated[Optional[list[str]], Query(description="Person names to filter by")] = None,
    tag_source: Annotated[Optional[str], Query(description="Tag source filter: manual, ai_vision, ai_gemini, ai_local")] = None,
) -> GalleryFilterResponse:
    """
    Filter gallery assets by tags, people, and tag source.

    Returns a list of asset IDs that match the specified filters.
    All filters are combined with AND logic.
    """
    service = get_search_service()
    try:
        # Build filter criteria
        filters = {}
        if tags:
            filters["tags"] = tags
        if people:
            filters["people"] = people
        if tag_source:
            filters["tag_source"] = tag_source

        # Perform the search
        result = await service.filter_gallery_assets(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            filters=filters,
        )

        return GalleryFilterResponse(
            asset_ids=result["asset_ids"],
            total_count=result["total_count"],
            applied_filters=filters,
        )

    except Exception as e:
        logger.exception("Failed to filter gallery assets")
        raise InternalError("Failed to filter gallery assets")


# ---------------------------------------------------------------------------
# Gallery Story Endpoints
# ---------------------------------------------------------------------------


class GenerateStoryRequest(BaseModel):
    """Request to generate a gallery story."""

    length: str = Field("medium", description="Story length: short, medium, long")
    tone: str = Field("professional", description="Story tone: professional, casual, poetic, journalistic")


class StoryResponse(BaseModel):
    """Story generation response."""

    story: str
    length: str
    tone: str
    word_count: int


@router.post(
    "/galleries/{gallery_id}/story",
    response_model=StoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate a story for a gallery",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        400: {"model": ErrorResponse, "description": "AI not configured or insufficient photos"},
    },
)
async def generate_gallery_story(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: GenerateStoryRequest,
) -> StoryResponse:
    """
    Generate an AI-powered narrative story about a gallery.

    Requires user to have Gemini API key configured and at least 5
    analyzed photos in the gallery. Returns a narrative that captures
    the essence of the photo collection.
    """
    from app.services.gallery_story_service import get_gallery_story_service
    from app.api.exceptions import BadRequestError

    service = get_gallery_story_service()
    try:
        # TODO: Fetch analyzed photos from gallery
        # For now, we return a placeholder indicating this needs implementation
        # In production, this would query asset_analysis for the gallery
        photo_analyses: list = []  # Would be fetched from database

        if len(photo_analyses) < 5:
            raise BadRequestError(
                "At least 5 analyzed photos are required for story generation. "
                "Please analyze more photos first."
            )

        result = await service.generate_story(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            photo_analyses=photo_analyses,
            length=request.length,
            tone=request.tone,
        )

        return StoryResponse(**result.to_dict())

    except ValueError as e:
        from app.api.exceptions import BadRequestError
        raise BadRequestError(str(e))
    except Exception as e:
        logger.exception("Failed to generate gallery story")
        raise InternalError("Failed to generate gallery story")


# ---------------------------------------------------------------------------
# Smart Curation Endpoints
# ---------------------------------------------------------------------------


class SmartCurationRequest(BaseModel):
    """Request for smart photo curation."""

    quality_threshold: int = Field(70, ge=0, le=100, description="Minimum quality score")
    diversity_weight: float = Field(0.5, ge=0, le=1, description="Diversity vs quality balance")
    max_photos: int = Field(20, ge=1, le=50, description="Maximum photos to select")
    prefer_people: bool = Field(False, description="Weight photos with faces higher")


class CurationRanking(BaseModel):
    """Individual photo ranking in curation results."""

    asset_id: str
    score: float
    reason: str


class SmartCurationResponse(BaseModel):
    """Smart curation response."""

    asset_ids: list[str]
    criteria: dict
    total_assets: int
    selected_count: int
    rankings: list[CurationRanking]


@router.post(
    "/galleries/{gallery_id}/curate",
    response_model=SmartCurationResponse,
    status_code=status.HTTP_200_OK,
    summary="Smart curation of gallery photos",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        400: {"model": ErrorResponse, "description": "No analyzed photos available"},
    },
)
async def curate_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: SmartCurationRequest,
) -> SmartCurationResponse:
    """
    AI-powered selection of the best photos from a gallery.

    Uses quality scores and diversity filtering to select a curated
    subset of photos. Returns rankings with reasons for each selection.
    """
    from app.services.smart_curation_service import get_smart_curation_service

    service = get_smart_curation_service()
    try:
        # TODO: Fetch analyzed photos from gallery
        # For now, return empty result
        photo_analyses: list = []  # Would be fetched from database

        result = await service.curate_gallery(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            photo_analyses=photo_analyses,
            quality_threshold=request.quality_threshold,
            diversity_weight=request.diversity_weight,
            max_photos=request.max_photos,
            prefer_people=request.prefer_people,
        )

        return SmartCurationResponse(
            asset_ids=result.asset_ids,
            criteria=result.criteria,
            total_assets=result.total_assets,
            selected_count=result.selected_count,
            rankings=[
                CurationRanking(**r) for r in result.rankings
            ],
        )

    except Exception as e:
        logger.exception("Failed to curate gallery")
        raise InternalError("Failed to curate gallery")
