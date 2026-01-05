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

from fastapi import APIRouter, Depends, Path, Query, status
from datetime import datetime
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse
from app.api.exceptions import ForbiddenError, InternalError, NotFoundError
from app.config.feature_flags import FeatureFlags, get_feature_flags
from app.services.audit_service import AuditService, AuditEventType
from app.services.content_detection_service import get_content_detection_service
from app.services.tagging_health_service import get_tagging_health_service
from app.services.search_service import get_search_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _require_ai_filter_enabled(flags: FeatureFlags = Depends(get_feature_flags)) -> None:
    if not flags.ai_filter_simplify:
        raise ForbiddenError(
            message="AI filter simplify feature is disabled",
            code="FEATURE_DISABLED",
        )


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
    event_type: Optional[str] = None
    key_elements: list[str] = []
    activity: Optional[str] = None
    semantic_description: Optional[str] = None


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


class GenerateStoryRequest(BaseModel):
    """Request to generate a gallery story."""

    length: str = Field("medium", description="Story length: short, medium, long")
    tone: str = Field("professional", description="Story tone: professional, casual, poetic, journalistic")
    custom_context: Optional[str] = Field(None, description="Additional context for the story")


class StoryResponse(BaseModel):
    """Gallery story generation response."""

    gallery_id: str
    story: str = Field(..., description="The generated narrative story")
    title: str = Field(..., description="Story title")
    length: str = Field(..., description="Story length used")
    tone: str = Field(..., description="Story tone used")
    word_count: int = Field(..., description="Number of words in the story")
    photo_count: int = Field(..., description="Number of photos analyzed for the story")
    themes: list[str] = Field(default_factory=list, description="Key themes identified")


class SmartCurationRequest(BaseModel):
    """Request for smart photo curation."""

    count: int = Field(10, ge=1, le=100, description="Number of photos to select")
    quality_threshold: float = Field(0.6, ge=0.0, le=1.0, description="Minimum quality score threshold")
    diversity_weight: float = Field(0.3, ge=0.0, le=1.0, description="Weight for diversity vs quality")
    prefer_people: bool = Field(False, description="Prefer photos with people")
    exclude_asset_ids: Optional[list[UUID]] = Field(None, description="Asset IDs to exclude")
    exclude_technical_rejects: bool = Field(True, description="Exclude photos flagged as technical rejects (severe blur)")


class SmartCurationResponse(BaseModel):
    """Smart curation response."""

    gallery_id: str
    selected_assets: list[dict] = Field(..., description="Selected asset IDs with scores")
    total_candidates: int = Field(..., description="Total photos analyzed")
    selection_criteria: dict = Field(..., description="Criteria used for selection")


# ---------------------------------------------------------------------------
# Quality Analysis Schemas (023-enhanced-smart-curate)
# ---------------------------------------------------------------------------


class QualityAnalysisStartRequest(BaseModel):
    """Request to start quality analysis."""

    session_id: Optional[UUID] = Field(None, description="Existing session to resume")
    asset_ids: Optional[list[UUID]] = Field(None, description="Specific assets to analyze")


class QualityAnalysisStartResponse(BaseModel):
    """Response for starting quality analysis."""

    session_id: UUID = Field(..., description="Session ID for tracking")
    status: str = Field(..., description="Session status")
    message: str = Field(..., description="Status message")


class PhotoQualityResultSchema(BaseModel):
    """Quality result for a single photo."""

    asset_id: UUID
    overall_score: float = Field(..., ge=0, le=100)
    sharpness_score: float = Field(..., ge=0, le=100)
    exposure_score: float = Field(..., ge=0, le=100)
    composition_score: float = Field(..., ge=0, le=100)
    blur_detected: bool
    blur_type: Optional[str] = Field(None, description="motion|focus|bokeh")
    blur_confidence: float = Field(default=0, ge=0, le=1)
    blur_severity: Optional[str] = Field(None, description="low|medium|high")
    blur_region: Optional[str] = Field(None, description="center|edges|full")
    is_intentional_blur: bool = Field(default=False, description="True for artistic bokeh")
    is_technical_reject: bool = Field(default=False, description="Flagged as reject candidate")
    expression_data: Optional[dict] = None
    scene_type: Optional[str] = None
    analyzed_at: Optional[datetime] = None
    event_type: Optional[str] = None
    key_elements: list[str] = []
    activity: Optional[str] = None
    semantic_description: Optional[str] = None
    lighting: Optional[str] = None
    mood: Optional[str] = None


class QualitySummarySchema(BaseModel):
    """Summary of quality analysis."""

    total_analyzed: int
    average_score: float
    blur_count: int
    excellent_count: int = 0  # 80+
    good_count: int = 0  # 60-79
    fair_count: int = 0  # 40-59
    poor_count: int = 0  # <40


class GalleryQualityResultsResponse(BaseModel):
    """Response for gallery quality results."""

    gallery_id: UUID
    results: list[PhotoQualityResultSchema]
    total: int
    summary: Optional[QualitySummarySchema] = None


class QualityAnalysisProgressSchema(BaseModel):
    """Progress response for quality analysis."""

    session_id: UUID
    status: str
    progress_percent: int = Field(..., ge=0, le=100)
    photos_analyzed: int
    photos_total: int
    estimated_remaining_seconds: Optional[int] = None
    stage: Optional[str] = None
    error_message: Optional[str] = None


# ---------------------------------------------------------------------------
# One-Click Analysis (alias) Endpoints (025-ai-filter-simplify)
# These wrap the quality-analysis workflow under the new /analyze paths
# defined in the feature contracts to keep backwards compatibility while
# aligning to the simplified AI entry point.
# ---------------------------------------------------------------------------


class StartAnalyzeRequest(BaseModel):
    """Request payload for one-click analyze endpoint."""

    reanalyzeAll: bool = Field(
        False,
        description="If true, re-run analysis for all photos; otherwise analyze only new/unanalyzed photos.",
    )


class AnalysisSummaryResponse(BaseModel):
    """Summary response for one-click analyze summary endpoint."""

    total_analyzed: int
    total_photos: int  # Total photos in gallery (for partial failure calculation)
    failed_count: int  # Photos that failed analysis: total_photos - total_analyzed
    excellent: int
    good: int
    fair: int
    poor: int
    blur_count: int


# ---------------------------------------------------------------------------
# AI Filter Schemas (quality/blur/technical only - 025-ai-filter-simplify P1)
# ---------------------------------------------------------------------------


class AIFilterRequest(BaseModel):
    """Query params for AI filter endpoint (subset for P1)."""

    quality_tier: str = Field("all", description="all|excellent|good|fair")
    quality_min: Optional[int] = Field(None, ge=0, le=100)
    blur_hide: bool = Field(False, description="Hide blurred photos")
    blur_show_bokeh: bool = Field(True, description="Show bokeh even when hiding blur")
    min_sharpness: Optional[int] = Field(None, ge=0, le=100)
    min_exposure: Optional[int] = Field(None, ge=0, le=100)
    min_composition: Optional[int] = Field(None, ge=0, le=100)
    page: int = Field(1, ge=1)
    limit: int = Field(100, ge=1, le=500)


class FilteredAsset(BaseModel):
    asset_id: UUID
    overall_score: float
    sharpness_score: Optional[float] = None
    exposure_score: Optional[float] = None
    composition_score: Optional[float] = None
    blur_detected: Optional[bool] = None
    blur_type: Optional[str] = None
    blur_severity: Optional[str] = None


class AIFilterResponse(BaseModel):
    assets: list[FilteredAsset]
    meta: dict
    filter_stats: dict
    applied_filters: dict


class AIFilterCountResponse(BaseModel):
    count: int
    similarityGroupsCount: int = 0


@router.post(
    "/galleries/{gallery_id}/analyze",
    response_model=QualityAnalysisStartResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start one-click AI analysis for a gallery",
    responses={
        400: {"model": ErrorResponse, "description": "AI not configured"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        409: {"model": ErrorResponse, "description": "Analysis already in progress"},
    },
)
async def start_one_click_analysis(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: StartAnalyzeRequest,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> QualityAnalysisStartResponse:
    """
    Start AI analysis via the new /analyze path (alias of quality-analysis).

    This reuses the curation session service. "reanalyzeAll" maps to creating a
    fresh session (analyze all). When false, the existing session logic will
    process only new/unanalyzed photos as implemented by the service.
    """
    from app.services.curation_session_service import (
        get_curation_session_service,
        SessionAlreadyActiveError,
    )
    from app.services.gemini_client_service import AIConfigurationError
    from app.api.exceptions import ConflictError, ValidationAppError

    try:
        session_service = get_curation_session_service()

        # If reanalyzeAll is true, start a fresh session; otherwise reuse/create
        # NOTE: curation_session_service currently enforces a single active session.
        # reanalyzeAll semantics are approximated by starting a fresh session (and
        # failing with 409 if one is active). Future enhancement can explicitly
        # archive/close existing sessions when reanalyzeAll=True.
        session = await session_service.create_session(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            user_id=current_user.user_id,
            auto_start=True,
        )

        # T060: Audit logging for AI analysis start
        try:
            await AuditService().log_event(
                event_type=AuditEventType.AI_ANALYSIS_STARTED,
                actor_user_id=current_user.user_id,
                workspace_id=workspace_id,
                resource_type="gallery",
                resource_id=str(gallery_id),
                details={
                    "session_id": str(session["session_id"]),
                    "reanalyze_all": request.reanalyzeAll,
                },
            )
        except Exception:
            logger.warning("Failed to log AI_ANALYSIS_STARTED audit event", exc_info=True)

        return QualityAnalysisStartResponse(
            session_id=session["session_id"],
            status=session["status"],
            message="Analysis started. Track progress via /analyze/progress endpoint.",
        )

    except SessionAlreadyActiveError as e:
        raise ConflictError(str(e), code="SESSION_ALREADY_ACTIVE")
    except AIConfigurationError as e:
        raise ValidationAppError(
            f"Gemini AI not configured: {e.message}. "
            "Please add your API key in Settings > AI."
        )
    except NotFoundError:
        raise
    except Exception:
        logger.exception("Failed to start one-click analysis")
        raise InternalError("Failed to start one-click analysis")


@router.get(
    "/galleries/{gallery_id}/analyze/progress",
    response_model=QualityAnalysisProgressSchema,
    status_code=status.HTTP_200_OK,
    summary="Get one-click analysis progress",
)
async def get_one_click_analysis_progress(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> QualityAnalysisProgressSchema:
    """Alias for quality-analysis progress under the new /analyze path."""
    return await get_quality_analysis_progress(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        workspace_access=workspace_access,
        current_user=current_user,
    )


@router.get(
    "/galleries/{gallery_id}/analyze/summary",
    response_model=AnalysisSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get one-click analysis summary",
)
async def get_one_click_analysis_summary(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> AnalysisSummaryResponse:
    """Return aggregate analysis summary for a gallery under the /analyze path.

    Includes total_photos and failed_count to support partial failure handling (T023a).
    """
    from app.repositories.photo_quality_repository import get_photo_quality_repository
    from app.services.gallery_service import get_gallery_service

    try:
        repo = get_photo_quality_repository()
        gallery_service = get_gallery_service()

        # Get gallery to determine total photo count
        gallery = await gallery_service.get_gallery(gallery_id=gallery_id, workspace_id=workspace_id)
        total_photos = gallery.get("photo_count", 0) if gallery else 0

        summary = await repo.get_summary_by_gallery(workspace_id, gallery_id)
        total_analyzed = summary.get("total_analyzed", 0) if summary else 0
        failed_count = max(0, total_photos - total_analyzed)

        if not summary:
            return AnalysisSummaryResponse(
                total_analyzed=0,
                total_photos=total_photos,
                failed_count=failed_count,
                excellent=0,
                good=0,
                fair=0,
                poor=0,
                blur_count=0,
            )

        return AnalysisSummaryResponse(
            total_analyzed=total_analyzed,
            total_photos=total_photos,
            failed_count=failed_count,
            excellent=summary.get("excellent_count", 0),
            good=summary.get("good_count", 0),
            fair=summary.get("fair_count", 0),
            poor=summary.get("poor_count", 0),
            blur_count=summary.get("blur_count", 0),
        )
    except Exception:
        logger.exception("Failed to get analysis summary")
        raise InternalError("Failed to get analysis summary")


class RetryFailedAnalysisResponse(BaseModel):
    """Response for retry failed analysis endpoint."""

    queued_count: int
    message: str


@router.post(
    "/galleries/{gallery_id}/analyze/retry-failed",
    response_model=RetryFailedAnalysisResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Retry failed AI analysis for unanalyzed photos",
    responses={
        400: {"model": ErrorResponse, "description": "AI not configured"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        409: {"model": ErrorResponse, "description": "Analysis already in progress"},
    },
)
async def retry_failed_analysis(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> RetryFailedAnalysisResponse:
    """Retry analysis for photos that failed or were not analyzed.

    This identifies photos in the gallery that don't have quality analysis
    results and queues them for re-analysis. Used by the "Retry Failed" button
    when partial failures are detected (T023a).
    """
    from app.repositories.photo_quality_repository import get_photo_quality_repository
    from app.services.gallery_service import get_gallery_service
    from app.services.curation_session_service import (
        get_curation_session_service,
        SessionAlreadyActiveError,
    )
    from app.services.gemini_client_service import AIConfigurationError
    from app.api.exceptions import ConflictError, ValidationAppError

    try:
        gallery_service = get_gallery_service()
        repo = get_photo_quality_repository()
        session_service = get_curation_session_service()

        # Get gallery to verify it exists and get total photo count
        gallery = await gallery_service.get_gallery(gallery_id=gallery_id, workspace_id=workspace_id)
        if not gallery:
            raise NotFoundError("Gallery", gallery_id)

        # Get list of all asset IDs in gallery
        assets_result = await gallery_service.list_assets(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            limit=2000,  # Support up to 2000 photos per gallery
        )
        all_asset_ids = {a["asset_id"] for a in assets_result.get("assets", [])}

        # Get list of already-analyzed asset IDs from latest session
        analyzed_results, _ = await repo.list_by_gallery(
            workspace_id, gallery_id, limit=2000, offset=0
        )
        analyzed_asset_ids = {str(r["asset_id"]) for r in analyzed_results}

        # Find unanalyzed assets
        unanalyzed_ids = all_asset_ids - analyzed_asset_ids

        if not unanalyzed_ids:
            return RetryFailedAnalysisResponse(
                queued_count=0,
                message="All photos have already been analyzed successfully."
            )

        # Start a new session to analyze only the failed photos
        session = await session_service.create_session(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            user_id=current_user.user_id,
            auto_start=True,
            asset_ids=list(unanalyzed_ids),  # Only analyze unanalyzed photos
        )

        # T060: Audit logging for AI analysis retry
        try:
            await AuditService().log_event(
                event_type=AuditEventType.AI_ANALYSIS_RETRY,
                actor_user_id=current_user.user_id,
                workspace_id=workspace_id,
                resource_type="gallery",
                resource_id=str(gallery_id),
                details={
                    "session_id": str(session["session_id"]),
                    "failed_count": len(unanalyzed_ids),
                    "total_photos": len(all_asset_ids),
                },
            )
        except Exception:
            logger.warning("Failed to log AI_ANALYSIS_RETRY audit event", exc_info=True)

        return RetryFailedAnalysisResponse(
            queued_count=len(unanalyzed_ids),
            message=f"Queued {len(unanalyzed_ids)} photos for re-analysis. Track progress via /analyze/progress."
        )

    except SessionAlreadyActiveError as e:
        raise ConflictError(str(e), code="SESSION_ALREADY_ACTIVE")
    except AIConfigurationError as e:
        raise ValidationAppError(
            f"Gemini AI not configured: {e.message}. "
            "Please add your API key in Settings > AI."
        )
    except NotFoundError:
        raise
    except Exception:
        logger.exception("Failed to retry failed analysis")
        raise InternalError("Failed to retry failed analysis")


# ---------------------------------------------------------------------------
# AI Filter Endpoints (quality/blur/technical score filters, P1 scope)
# ---------------------------------------------------------------------------


def _quality_min_from_tier(tier: str) -> Optional[int]:
    tier_map = {
        "excellent": 90,
        "good": 70,
        "fair": 50,
        "all": None,
    }
    return tier_map.get(tier, None)


def _passes_blur_filters(row: dict, blur_hide: bool, blur_show_bokeh: bool) -> bool:
    if not blur_hide:
        return True
    if not row.get("blur_detected"):
        return True
    # allow artistic bokeh if configured
    if blur_show_bokeh and row.get("blur_type") == "bokeh":
        return True
    # otherwise hide blurred
    return False


def _passes_score_filters(row: dict, min_sharpness: Optional[int], min_exposure: Optional[int], min_composition: Optional[int]) -> bool:
    if min_sharpness is not None and (row.get("sharpness_score") or 0) < min_sharpness:
        return False
    if min_exposure is not None and (row.get("exposure_score") or 0) < min_exposure:
        return False
    if min_composition is not None and (row.get("composition_score") or 0) < min_composition:
        return False
    return True


@router.get(
    "/galleries/{gallery_id}/ai-filter",
    response_model=AIFilterResponse,
    summary="Filter gallery assets by AI quality/blur/technical scores",
)
async def filter_gallery_ai(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    quality_tier: Annotated[str, Query(alias="quality_tier", regex="^(all|excellent|good|fair)$", description="Quality tier filter")] = "all",
    quality_min: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum overall quality score")]=None,
    blur_hide: Annotated[bool, Query(description="Hide photos with blur")]=False,
    blur_show_bokeh: Annotated[bool, Query(description="Show bokeh even when hiding blur")]=True,
    min_sharpness: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum sharpness score")]=None,
    min_exposure: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum exposure score")]=None,
    min_composition: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum composition score")]=None,
    page: Annotated[int, Query(ge=1, description="Page number")]=1,
    limit: Annotated[int, Query(ge=1, le=500, description="Page size")]=100,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> AIFilterResponse:
    """Return filtered assets using quality/blur/technical scores from latest session."""
    from app.repositories.photo_quality_repository import get_photo_quality_repository

    repo = get_photo_quality_repository()

    # Determine min score from tier/explicit override
    tier_min = _quality_min_from_tier(quality_tier)
    effective_min = quality_min if quality_min is not None else tier_min

    results, total = await repo.list_by_gallery(
        workspace_id,
        gallery_id,
        min_score=effective_min,
        blur_only=False,
        limit=2000,  # fetch enough to filter/paginate client-side for this response
        offset=0,
    )

    filtered: list[dict] = []
    for row in results:
        if not _passes_blur_filters(row, blur_hide=blur_hide, blur_show_bokeh=blur_show_bokeh):
            continue
        if not _passes_score_filters(row, min_sharpness, min_exposure, min_composition):
            continue
        filtered.append(row)

    # Pagination (server-side)
    start = (page - 1) * limit
    end = start + limit
    paged = filtered[start:end]

    assets = [
        FilteredAsset(
            asset_id=row["asset_id"],
            overall_score=row.get("overall_score", 0),
            sharpness_score=row.get("sharpness_score"),
            exposure_score=row.get("exposure_score"),
            composition_score=row.get("composition_score"),
            blur_detected=row.get("blur_detected"),
            blur_type=row.get("blur_type"),
            blur_severity=row.get("blur_severity"),
        )
        for row in paged
    ]

    applied_filters = {
        "quality_tier": quality_tier,
        "quality_min": quality_min,
        "blur_hide": blur_hide,
        "blur_show_bokeh": blur_show_bokeh,
        "min_sharpness": min_sharpness,
        "min_exposure": min_exposure,
        "min_composition": min_composition,
        "page": page,
        "limit": limit,
    }

    filter_stats = {
        "excellentCount": sum(1 for r in filtered if (r.get("overall_score", 0) >= 90)),
        "goodCount": sum(1 for r in filtered if 70 <= (r.get("overall_score", 0)) < 90),
        "fairCount": sum(1 for r in filtered if 50 <= (r.get("overall_score", 0)) < 70),
        "blurryHidden": sum(1 for r in results if not _passes_blur_filters(r, blur_hide=True, blur_show_bokeh=blur_show_bokeh)),
    }

    meta = {
        "page": page,
        "limit": limit,
        "total": len(filtered),
        "hasMore": end < len(filtered),
    }

    # T060: Audit logging for AI filter application (only log on first page to avoid spam)
    if page == 1:
        try:
            await AuditService().log_event(
                event_type=AuditEventType.AI_FILTER_APPLIED,
                actor_user_id=current_user.user_id,
                workspace_id=workspace_id,
                resource_type="gallery",
                resource_id=str(gallery_id),
                details={
                    "filters": applied_filters,
                    "result_count": len(filtered),
                    "total_analyzed": total,
                },
            )
        except Exception:
            logger.warning("Failed to log AI_FILTER_APPLIED audit event", exc_info=True)

    return AIFilterResponse(
        assets=assets,
        meta=meta,
        filter_stats=filter_stats,
        applied_filters=applied_filters,
    )


@router.get(
    "/galleries/{gallery_id}/ai-filter/count",
    response_model=AIFilterCountResponse,
    summary="Get count of assets matching AI filters (quality/blur/technical)",
)
async def count_gallery_ai_filters(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    quality_tier: Annotated[str, Query(alias="quality_tier", regex="^(all|excellent|good|fair)$", description="Quality tier filter")] = "all",
    quality_min: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum overall quality score")]=None,
    blur_hide: Annotated[bool, Query(description="Hide photos with blur")]=False,
    blur_show_bokeh: Annotated[bool, Query(description="Show bokeh even when hiding blur")]=True,
    min_sharpness: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum sharpness score")]=None,
    min_exposure: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum exposure score")]=None,
    min_composition: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum composition score")]=None,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> AIFilterCountResponse:
    """Return count only, for real-time match indicator."""
    from app.repositories.photo_quality_repository import get_photo_quality_repository

    repo = get_photo_quality_repository()
    tier_min = _quality_min_from_tier(quality_tier)
    effective_min = quality_min if quality_min is not None else tier_min

    results, _ = await repo.list_by_gallery(
        workspace_id,
        gallery_id,
        min_score=effective_min,
        blur_only=False,
        limit=2000,
        offset=0,
    )

    filtered = [
        r
        for r in results
        if _passes_blur_filters(r, blur_hide=blur_hide, blur_show_bokeh=blur_show_bokeh)
        and _passes_score_filters(r, min_sharpness, min_exposure, min_composition)
    ]

    return AIFilterCountResponse(count=len(filtered), similarityGroupsCount=0)


# ---------------------------------------------------------------------------
# US4: Content & Context Filtering Endpoints
# ---------------------------------------------------------------------------


class GalleryTagResponse(BaseModel):
    """Tag info for content filtering."""

    tag_id: str
    name: str
    type: str
    color: Optional[str] = None
    usage_count: int
    source: Optional[str] = None


class GalleryTagsResponse(BaseModel):
    """Response for gallery tags endpoint."""

    tags: list[GalleryTagResponse]
    total: int


@router.get(
    "/galleries/{gallery_id}/tags",
    response_model=GalleryTagsResponse,
    summary="Get tags used in gallery for content filtering UI",
)
async def get_gallery_tags(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    source: Annotated[Optional[str], Query(description="Filter by source: all, ai, manual")] = "all",
    min_usage: Annotated[int, Query(ge=0, description="Minimum usage count")] = 0,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> GalleryTagsResponse:
    """Get all tags used in gallery assets for the content filter UI."""
    from app.db.postgres import acquire_conn, get_postgres_pool

    pool = await get_postgres_pool()
    async with acquire_conn(pool) as conn:
        # Build source filter
        source_filter = ""
        if source == "ai":
            source_filter = "AND at.source != 'manual'"
        elif source == "manual":
            source_filter = "AND at.source = 'manual'"

        rows = await conn.fetch(
            f"""
            SELECT
                t.tag_id::text,
                t.name,
                t.type,
                t.color,
                COUNT(DISTINCT ga.asset_id) as usage_count,
                MAX(at.source) as source
            FROM gallery_assets ga
            JOIN asset_tags at ON ga.asset_id = at.asset_id AND ga.workspace_id = at.workspace_id
            JOIN tags t ON at.tag_id = t.tag_id
            WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
            {source_filter}
            GROUP BY t.tag_id, t.name, t.type, t.color
            HAVING COUNT(DISTINCT ga.asset_id) >= $3
            ORDER BY COUNT(DISTINCT ga.asset_id) DESC, t.name ASC
            """,
            workspace_id,
            gallery_id,
            min_usage,
        )

        tags = [
            GalleryTagResponse(
                tag_id=row["tag_id"],
                name=row["name"],
                type=row["type"],
                color=row["color"],
                usage_count=row["usage_count"],
                source=row["source"],
            )
            for row in rows
        ]

        return GalleryTagsResponse(tags=tags, total=len(tags))


# ---------------------------------------------------------------------------
# US5: Similarity Organization Endpoints
# ---------------------------------------------------------------------------


class SimilarityGroupMemberResponse(BaseModel):
    """Member of a similarity group."""

    asset_id: str
    similarity_score: float
    is_best: bool
    is_user_selected: bool
    quality_rank: Optional[int] = None


class SimilarityGroupResponse(BaseModel):
    """Similarity group response."""

    group_id: str
    best_asset_id: Optional[str] = None
    user_override_asset_id: Optional[str] = None
    member_count: int
    avg_similarity: float
    best_reason: Optional[str] = None
    members: list[SimilarityGroupMemberResponse] = []


class SimilarityGroupsListResponse(BaseModel):
    """Response for similarity groups list."""

    groups: list[SimilarityGroupResponse]
    total: int
    singleton_count: int


class SetBestShotRequest(BaseModel):
    """Request to set best shot for a group."""

    asset_id: UUID = Field(..., description="Asset ID to set as best shot")


@router.get(
    "/galleries/{gallery_id}/similarity-groups",
    response_model=SimilarityGroupsListResponse,
    summary="Get similarity groups for a gallery",
)
async def get_similarity_groups(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    min_members: Annotated[int, Query(ge=1, description="Minimum group members")] = 2,
    include_members: Annotated[bool, Query(description="Include member details")] = False,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> SimilarityGroupsListResponse:
    """Get similarity groups for the gallery from the latest curation session."""
    from app.repositories.similarity_group_repository import get_similarity_group_repository
    from app.services.curation_session_service import get_curation_session_service

    session_service = get_curation_session_service()
    group_repo = get_similarity_group_repository()

    # Find the latest completed session for this gallery
    session = await session_service.get_latest_session(workspace_id, gallery_id)
    if not session:
        return SimilarityGroupsListResponse(groups=[], total=0, singleton_count=0)

    session_id = session.get("session_id")
    if not session_id:
        return SimilarityGroupsListResponse(groups=[], total=0, singleton_count=0)

    groups, total, singleton_count = await group_repo.list_by_session(
        workspace_id=workspace_id,
        session_id=session_id,
        min_members=min_members,
        include_members=include_members,
        limit=limit,
        offset=(page - 1) * limit,
    )

    response_groups = [
        SimilarityGroupResponse(
            group_id=str(g["group_id"]),
            best_asset_id=str(g["best_asset_id"]) if g.get("best_asset_id") else None,
            user_override_asset_id=str(g["user_override_asset_id"]) if g.get("user_override_asset_id") else None,
            member_count=g.get("member_count", 0),
            avg_similarity=g.get("avg_similarity", 0.0),
            best_reason=g.get("best_reason"),
            members=[
                SimilarityGroupMemberResponse(
                    asset_id=str(m["asset_id"]),
                    similarity_score=m.get("similarity_score", 0.0),
                    is_best=m.get("is_best", False),
                    is_user_selected=m.get("is_user_selected", False),
                    quality_rank=m.get("quality_rank"),
                )
                for m in g.get("members", [])
            ],
        )
        for g in groups
    ]

    return SimilarityGroupsListResponse(
        groups=response_groups,
        total=total,
        singleton_count=singleton_count,
    )


@router.put(
    "/galleries/{gallery_id}/similarity-groups/{group_id}/best-shot",
    status_code=status.HTTP_200_OK,
    summary="Set best shot for a similarity group (user override)",
)
async def set_best_shot(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    group_id: Annotated[UUID, Path(..., description="Similarity group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: SetBestShotRequest,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> dict:
    """Set the best shot for a similarity group (user override)."""
    from app.repositories.similarity_group_repository import get_similarity_group_repository

    group_repo = get_similarity_group_repository()

    result = await group_repo.set_best_shot(
        workspace_id=workspace_id,
        group_id=group_id,
        asset_id=request.asset_id,
        reason="User override",
        is_user_override=True,
    )

    if not result:
        raise NotFoundError("Similarity group not found")

    return {"success": True, "group_id": str(group_id), "best_asset_id": str(request.asset_id)}


# ---------------------------------------------------------------------------
# US6: AI Create (Story/Caption generation) Endpoints
# ---------------------------------------------------------------------------


class AICreateRequest(BaseModel):
    """Request for AI content generation."""

    mode: str = Field(..., description="story|caption|hashtags")
    asset_ids: list[UUID] = Field(..., min_length=1, max_length=50, description="Asset IDs to include")
    style: Optional[str] = Field(None, description="Content style")
    tone: Optional[str] = Field(None, description="Content tone")
    max_length: Optional[int] = Field(None, ge=50, le=5000, description="Max content length")


class AICreateResponse(BaseModel):
    """Response for AI content generation."""

    mode: str
    content: str
    asset_count: int
    tokens_used: Optional[int] = None


@router.post(
    "/galleries/{gallery_id}/ai-create",
    response_model=AICreateResponse,
    summary="Generate AI content from selected photos",
)
async def generate_ai_content(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AICreateRequest,
    feature_flag: Annotated[None, Depends(_require_ai_filter_enabled)] = None,
) -> AICreateResponse:
    """Generate AI content (story, captions, hashtags) from selected photos."""
    from app.services.ai_filter_service import get_ai_filter_service

    ai_service = get_ai_filter_service()

    try:
        result = await ai_service.generate_content(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            asset_ids=request.asset_ids,
            mode=request.mode,
            style=request.style,
            tone=request.tone,
            max_length=request.max_length,
            user_id=current_user.user_id,
        )

        # T060: Audit logging for AI content generation
        try:
            await AuditService().log_event(
                event_type=AuditEventType.AI_CONTENT_GENERATED,
                actor_user_id=current_user.user_id,
                workspace_id=workspace_id,
                resource_type="gallery",
                resource_id=str(gallery_id),
                details={
                    "mode": request.mode,
                    "asset_count": len(request.asset_ids),
                    "tokens_used": result.get("tokens_used"),
                },
            )
        except Exception:
            logger.warning("Failed to log AI_CONTENT_GENERATED audit event", exc_info=True)

        return AICreateResponse(
            mode=request.mode,
            content=result.get("content", ""),
            asset_count=len(request.asset_ids),
            tokens_used=result.get("tokens_used"),
        )

    except Exception as e:
        logger.exception("Failed to generate AI content")
        raise InternalError("Failed to generate AI content")


class BlurDetectionResultSchema(BaseModel):
    """Blur detection result for a single photo."""

    asset_id: UUID
    blur_detected: bool
    blur_type: Optional[str] = Field(None, description="motion|focus|bokeh")
    blur_confidence: float = Field(default=0, ge=0, le=1)
    blur_severity: Optional[str] = Field(None, description="low|medium|high")
    blur_region: Optional[str] = Field(None, description="center|edges|full")
    is_intentional_blur: bool = Field(default=False, description="True for artistic bokeh")
    is_technical_reject: bool = Field(default=False, description="Flagged as reject candidate")
    sharpness_score: float = Field(..., ge=0, le=100)


class BlurSummarySchema(BaseModel):
    """Summary of blur detection results."""

    total_analyzed: int
    blur_count: int
    motion_blur_count: int = 0
    focus_blur_count: int = 0
    bokeh_count: int = 0
    technical_reject_count: int = 0
    severity_low: int = 0
    severity_medium: int = 0
    severity_high: int = 0


class BlurDetectionResponse(BaseModel):
    """Response for blur detection endpoint."""

    gallery_id: UUID
    results: list[BlurDetectionResultSchema]
    total: int
    summary: BlurSummarySchema


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
    from app.services.vision_service import get_vision_service

    service = get_vision_service()
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
    from app.services.vision_service import get_vision_service

    service = get_vision_service()
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
    from app.services.vision_service import get_vision_service

    service = get_vision_service()
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
# Gallery Story Generation Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/galleries/{gallery_id}/story",
    response_model=StoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate a narrative story for a gallery",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def generate_gallery_story(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: GenerateStoryRequest,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> StoryResponse:
    """
    Generate an AI-written narrative story for a photo gallery.

    The story is generated based on the gallery's photos and their AI analysis.
    Supports different lengths (short, medium, long) and tones (professional,
    casual, poetic, journalistic).
    """
    from app.services.gallery_story_service import get_gallery_story_service
    from app.services.gallery_service import get_gallery_service

    # Validate length and tone
    valid_lengths = ["short", "medium", "long"]
    valid_tones = ["professional", "casual", "poetic", "journalistic"]

    if request.length not in valid_lengths:
        from app.api.exceptions import ValidationError
        raise ValidationError(f"Invalid length. Must be one of: {', '.join(valid_lengths)}")

    if request.tone not in valid_tones:
        from app.api.exceptions import ValidationError
        raise ValidationError(f"Invalid tone. Must be one of: {', '.join(valid_tones)}")

    try:
        # Get gallery details
        gallery_service = get_gallery_service()
        gallery = await gallery_service.get_gallery(
            gallery_id=gallery_id,
            workspace_id=workspace_id,
        )

        if not gallery:
            raise NotFoundError("Gallery not found")

        # Get photo descriptions from gallery assets
        # In a real implementation, this would fetch AI analysis data for the photos
        photo_descriptions = []
        assets_result = await gallery_service.list_assets(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            limit=50,
        )

        for asset in assets_result.get("assets", []):
            desc = {
                "description": asset.get("ai_description", asset.get("filename", "")),
                "tags": asset.get("ai_tags", []),
                "mood": asset.get("mood", ""),
            }
            photo_descriptions.append(desc)

        # Generate the story
        story_service = get_gallery_story_service()
        result = await story_service.generate_story(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            gallery_name=gallery.get("name", "Untitled Gallery"),
            photo_descriptions=photo_descriptions,
            length=request.length,
            tone=request.tone,
            custom_context=request.custom_context,
        )

        return StoryResponse(
            gallery_id=str(gallery_id),
            story=result.story,
            title=result.title,
            length=result.length,
            tone=result.tone,
            word_count=result.word_count,
            photo_count=result.photo_count,
            themes=result.themes,
        )

    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to generate gallery story")
        raise InternalError("Failed to generate gallery story")


@router.post(
    "/galleries/{gallery_id}/story/export",
    status_code=status.HTTP_200_OK,
    summary="Export a generated story in different formats",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid format"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def export_gallery_story(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    story: StoryResponse,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    format: Annotated[str, Query(description="Export format: text, markdown, html")] = "text",
) -> dict:
    """
    Export a previously generated story in different formats.

    Supports text, markdown, and HTML export formats.
    """
    from app.services.gallery_story_service import get_gallery_story_service, StoryResult

    valid_formats = ["text", "markdown", "html"]
    if format not in valid_formats:
        from app.api.exceptions import ValidationError
        raise ValidationError(f"Invalid format. Must be one of: {', '.join(valid_formats)}")

    try:
        # Convert StoryResponse back to StoryResult
        story_result = StoryResult(
            gallery_id=story.gallery_id,
            story=story.story,
            title=story.title,
            length=story.length,
            tone=story.tone,
            word_count=story.word_count,
            photo_count=story.photo_count,
            themes=story.themes,
        )

        story_service = get_gallery_story_service()
        exported = await story_service.export_story(story_result, format=format)

        return {
            "format": format,
            "content": exported,
            "gallery_id": story.gallery_id,
        }

    except Exception as e:
        logger.exception("Failed to export story")
        raise InternalError("Failed to export story")


# ---------------------------------------------------------------------------
# Smart Curation Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/galleries/{gallery_id}/curate",
    response_model=SmartCurationResponse,
    status_code=status.HTTP_200_OK,
    summary="Smart curation - AI-powered photo selection",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def smart_curate_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: SmartCurationRequest,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> SmartCurationResponse:
    """
    AI-powered selection of the best photos from a gallery.

    Uses quality scores, diversity analysis, and optional preferences
    to select the best photos for highlights, sharing, or printing.
    """
    from app.services.smart_curation_service import get_smart_curation_service
    from app.services.gallery_service import get_gallery_service

    try:
        # Verify gallery exists
        gallery_service = get_gallery_service()
        gallery = await gallery_service.get_gallery(
            gallery_id=gallery_id,
            workspace_id=workspace_id,
        )

        if not gallery:
            raise NotFoundError("Gallery not found")

        # Perform curation
        curation_service = get_smart_curation_service()
        result = await curation_service.curate_gallery(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            count=request.count,
            quality_threshold=request.quality_threshold,
            diversity_weight=request.diversity_weight,
            prefer_people=request.prefer_people,
            exclude_asset_ids=request.exclude_asset_ids,
            exclude_technical_rejects=request.exclude_technical_rejects,
        )

        return SmartCurationResponse(
            gallery_id=str(gallery_id),
            selected_assets=result.selected_assets,
            total_candidates=result.total_candidates,
            selection_criteria={
                "count": request.count,
                "quality_threshold": request.quality_threshold,
                "diversity_weight": request.diversity_weight,
                "prefer_people": request.prefer_people,
                "exclude_technical_rejects": request.exclude_technical_rejects,
            },
        )

    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to curate gallery")
        raise InternalError("Failed to curate gallery")


# ---------------------------------------------------------------------------
# Quality Analysis Endpoints (023-enhanced-smart-curate)
# ---------------------------------------------------------------------------


@router.post(
    "/galleries/{gallery_id}/quality-analysis",
    response_model=QualityAnalysisStartResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start quality analysis for gallery photos",
    responses={
        400: {"model": ErrorResponse, "description": "AI not configured"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        409: {"model": ErrorResponse, "description": "Analysis already in progress"},
    },
)
async def start_quality_analysis(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: QualityAnalysisStartRequest,
) -> QualityAnalysisStartResponse:
    """
    Start AI quality analysis for all photos in a gallery.

    This creates a curation session and begins asynchronous analysis.
    Requires user to have Gemini API key configured. Progress can be
    tracked via the /progress endpoint or WebSocket updates.
    """
    from app.services.curation_session_service import (
        get_curation_session_service,
        SessionAlreadyActiveError,
    )
    from app.services.gemini_client_service import AIConfigurationError
    from app.api.exceptions import ConflictError, ValidationAppError

    try:
        session_service = get_curation_session_service()

        # Create or use existing session
        if request.session_id:
            # Resume existing session
            session = await session_service.get_session(workspace_id, request.session_id)
            if not session:
                raise NotFoundError(f"Session not found: {request.session_id}")
            # Start the session
            session = await session_service.start_session(
                workspace_id, request.session_id
            )
        else:
            # Create new session
            session = await session_service.create_session(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                user_id=current_user.user_id,
                auto_start=True,
            )

        return QualityAnalysisStartResponse(
            session_id=session["session_id"],
            status=session["status"],
            message="Quality analysis started. Track progress via /progress endpoint.",
        )

    except SessionAlreadyActiveError as e:
        raise ConflictError(str(e), code="SESSION_ALREADY_ACTIVE")
    except AIConfigurationError as e:
        raise ValidationAppError(
            f"Gemini AI not configured: {e.message}. "
            "Please add your API key in Settings > AI."
        )
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to start quality analysis")
        raise InternalError("Failed to start quality analysis")


@router.get(
    "/galleries/{gallery_id}/quality-analysis",
    response_model=GalleryQualityResultsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get quality analysis results for a gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_quality_analysis_results(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    session_id: Annotated[Optional[UUID], Query(description="Filter by session")] = None,
    min_score: Annotated[Optional[float], Query(ge=0, le=100, description="Minimum overall score")] = None,
    blur_detected: Annotated[Optional[bool], Query(description="Filter by blur detection")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="Results per page")] = 100,
    offset: Annotated[int, Query(ge=0, description="Pagination offset")] = 0,
) -> GalleryQualityResultsResponse:
    """
    Get quality analysis results for photos in a gallery.

    Returns quality scores for each analyzed photo with filtering
    options by score threshold, blur detection, and session.
    """
    from app.repositories.photo_quality_repository import get_photo_quality_repository

    try:
        quality_repo = get_photo_quality_repository()

        # If session_id specified, get results for that session
        if session_id:
            results, total = await quality_repo.list_by_session(
                workspace_id, session_id, limit=limit, offset=offset
            )
        else:
            # Get latest results for gallery (from most recent session)
            results, total = await quality_repo.list_by_gallery(
                workspace_id, gallery_id, limit=limit, offset=offset
            )

        # Apply filters
        filtered_results = []
        for r in results:
            if min_score is not None and r["overall_score"] < min_score:
                continue
            if blur_detected is not None and r["blur_detected"] != blur_detected:
                continue
            filtered_results.append(r)

        # Get summary - use session-specific method if session_id provided
        summary = None
        if results:
            if session_id:
                summary = await quality_repo.get_summary(workspace_id, session_id)
            else:
                summary = await quality_repo.get_summary_by_gallery(workspace_id, gallery_id)

        return GalleryQualityResultsResponse(
            gallery_id=gallery_id,
            results=[
                PhotoQualityResultSchema(
                    asset_id=r["asset_id"],
                    overall_score=r["overall_score"],
                    sharpness_score=r["sharpness_score"],
                    exposure_score=r["exposure_score"],
                    composition_score=r["composition_score"],
                    blur_detected=r["blur_detected"],
                    blur_type=r.get("blur_type"),
                    blur_confidence=r.get("blur_confidence", 0),
                    blur_severity=r.get("blur_severity"),
                    blur_region=r.get("blur_region"),
                    is_intentional_blur=r.get("is_intentional_blur", False),
                    is_technical_reject=_is_technical_reject(r),
                    expression_data=r.get("expression_data"),
                    scene_type=r.get("scene_type"),
                    analyzed_at=r.get("analyzed_at"),
                    event_type=r.get("event_type"),
                    key_elements=r.get("key_elements", []),
                    activity=r.get("activity"),
                    semantic_description=r.get("semantic_description"),
                    lighting=r.get("lighting"),
                    mood=r.get("mood"),
                )
                for r in filtered_results
            ],
            total=len(filtered_results),
            summary=QualitySummarySchema(
                total_analyzed=summary["total_analyzed"] if summary else 0,
                average_score=summary["average_score"] if summary else 0,
                blur_count=summary["blur_count"] if summary else 0,
                excellent_count=summary.get("excellent_count", 0) if summary else 0,
                good_count=summary.get("good_count", 0) if summary else 0,
                fair_count=summary.get("fair_count", 0) if summary else 0,
                poor_count=summary.get("poor_count", 0) if summary else 0,
            ) if summary else None,
        )

    except Exception as e:
        logger.exception("Failed to get quality analysis results")
        raise InternalError("Failed to get quality analysis results")


@router.get(
    "/galleries/{gallery_id}/quality-analysis/progress",
    response_model=QualityAnalysisProgressSchema,
    status_code=status.HTTP_200_OK,
    summary="Get quality analysis progress",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "No active analysis"},
    },
)
async def get_quality_analysis_progress(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> QualityAnalysisProgressSchema:
    """
    Get progress of active quality analysis for a gallery.

    Returns current progress percentage, photos analyzed, and
    estimated time remaining. Returns 404 if no active analysis.
    """
    from app.services.curation_session_service import get_curation_session_service

    try:
        session_service = get_curation_session_service()
        session = await session_service.get_active_session(workspace_id, gallery_id)

        if not session:
            raise NotFoundError("No active analysis for this gallery")

        # Calculate estimated time remaining
        analyzed = session.get("analyzed_count", 0)
        total = session.get("total_photos", 0)
        percent = session.get("progress_percent", 0)

        eta_seconds = None
        if analyzed > 0 and total > analyzed:
            # Rough estimate: 2 seconds per photo for quality analysis
            remaining = total - analyzed
            eta_seconds = remaining * 2

        return QualityAnalysisProgressSchema(
            session_id=session["session_id"],
            status=session["status"],
            progress_percent=percent,
            photos_analyzed=analyzed,
            photos_total=total,
            estimated_remaining_seconds=eta_seconds,
            stage=session.get("progress_stage"),
            error_message=session.get("error_message"),
        )

    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to get quality analysis progress")
        raise InternalError("Failed to get quality analysis progress")


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def _is_technical_reject(result: dict) -> bool:
    """Determine if a photo should be flagged as a technical reject.

    A photo is a technical reject if:
    - Blur detected with high confidence AND not intentional
    - Sharpness score below acceptable threshold
    """
    blur_detected = result.get("blur_detected", False)
    is_intentional = result.get("is_intentional_blur", False)
    blur_confidence = result.get("blur_confidence", 0)
    blur_severity = result.get("blur_severity")
    sharpness_score = result.get("sharpness_score", 50)

    if blur_detected and not is_intentional:
        if blur_confidence >= 0.7 or blur_severity == "high":
            return True
    if sharpness_score < 40:
        return True
    return False


# ---------------------------------------------------------------------------
# Blur Detection Endpoint (023-enhanced-smart-curate US4)
# ---------------------------------------------------------------------------


@router.get(
    "/galleries/{gallery_id}/blur-detection",
    response_model=BlurDetectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get blur detection results for a gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_blur_detection_results(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    blur_only: Annotated[bool, Query(description="Only return photos with blur")] = False,
    technical_rejects_only: Annotated[bool, Query(description="Only return technical rejects")] = False,
    blur_type: Annotated[Optional[str], Query(description="Filter by blur type: motion|focus|bokeh")] = None,
    severity: Annotated[Optional[str], Query(description="Filter by severity: low|medium|high")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="Results per page")] = 100,
    offset: Annotated[int, Query(ge=0, description="Pagination offset")] = 0,
) -> BlurDetectionResponse:
    """
    Get blur detection results for photos in a gallery.

    Returns blur analysis for each photo, distinguishing between:
    - Motion blur (camera shake, subject movement)
    - Focus blur (missed focus)
    - Bokeh (intentional artistic blur)

    Technical rejects are photos with high-confidence blur or very low sharpness
    that are strong candidates for rejection.
    """
    from app.repositories.photo_quality_repository import get_photo_quality_repository

    try:
        quality_repo = get_photo_quality_repository()

        # Get quality results for gallery
        results, total = await quality_repo.list_by_gallery(
            workspace_id, gallery_id,
            blur_only=blur_only,
            limit=limit,
            offset=offset,
        )

        # Apply additional filters and build response
        filtered_results = []
        summary_stats = {
            "total_analyzed": 0,
            "blur_count": 0,
            "motion_blur_count": 0,
            "focus_blur_count": 0,
            "bokeh_count": 0,
            "technical_reject_count": 0,
            "severity_low": 0,
            "severity_medium": 0,
            "severity_high": 0,
        }

        for r in results:
            is_reject = _is_technical_reject(r)
            result_blur_type = r.get("blur_type")
            result_severity = r.get("blur_severity")
            result_blur_detected = r.get("blur_detected", False)

            # Update summary
            summary_stats["total_analyzed"] += 1
            if result_blur_detected:
                summary_stats["blur_count"] += 1
                if result_blur_type == "motion":
                    summary_stats["motion_blur_count"] += 1
                elif result_blur_type == "focus":
                    summary_stats["focus_blur_count"] += 1
                elif result_blur_type == "bokeh":
                    summary_stats["bokeh_count"] += 1
            if is_reject:
                summary_stats["technical_reject_count"] += 1
            if result_severity == "low":
                summary_stats["severity_low"] += 1
            elif result_severity == "medium":
                summary_stats["severity_medium"] += 1
            elif result_severity == "high":
                summary_stats["severity_high"] += 1

            # Apply filters
            if technical_rejects_only and not is_reject:
                continue
            if blur_type and result_blur_type != blur_type:
                continue
            if severity and result_severity != severity:
                continue

            filtered_results.append(
                BlurDetectionResultSchema(
                    asset_id=r["asset_id"],
                    blur_detected=result_blur_detected,
                    blur_type=result_blur_type,
                    blur_confidence=r.get("blur_confidence", 0),
                    blur_severity=result_severity,
                    blur_region=r.get("blur_region"),
                    is_intentional_blur=r.get("is_intentional_blur", False),
                    is_technical_reject=is_reject,
                    sharpness_score=r.get("sharpness_score", 50),
                )
            )

        return BlurDetectionResponse(
            gallery_id=gallery_id,
            results=filtered_results,
            total=len(filtered_results),
            summary=BlurSummarySchema(**summary_stats),
        )

    except Exception as e:
        logger.exception("Failed to get blur detection results")
        raise InternalError("Failed to get blur detection results")


# ---------------------------------------------------------------------------
# Smart Collection Presets Endpoints (Phase 5 - US3)
# ---------------------------------------------------------------------------


class CurationPresetSchema(BaseModel):
    """Curation preset schema."""

    preset_id: UUID
    name: str
    description: str
    target_count_ratio: Optional[float] = None
    target_count_fixed: Optional[int] = None
    quality_threshold: float
    similarity_threshold: float
    prioritize_expressions: bool = False
    prioritize_composition: bool = False
    enforce_story_coverage: bool = False
    enforce_person_coverage: bool = False
    is_system: bool


@router.get(
    "/presets",
    response_model=dict,
    summary="List Smart Collection presets",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_curation_presets(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> dict:
    """List available Smart Collection presets (system + workspace custom).
    
    Returns system presets (workspace_id=NULL) and workspace-specific custom presets.
    """
    from app.db.postgres import get_postgres_pool

    try:
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    preset_id, workspace_id, name, description,
                    target_count_ratio, target_count_fixed, quality_threshold,
                    similarity_threshold, prioritize_expressions, prioritize_composition,
                    enforce_story_coverage, enforce_person_coverage, is_system
                FROM curation_presets
                WHERE workspace_id IS NULL OR workspace_id = $1
                ORDER BY is_system DESC, name ASC
                """,
                workspace_id,
            )

            presets = [
                CurationPresetSchema(
                    preset_id=row["preset_id"],
                    name=row["name"],
                    description=row["description"],
                    target_count_ratio=float(row["target_count_ratio"]) if row["target_count_ratio"] else None,
                    target_count_fixed=row["target_count_fixed"],
                    quality_threshold=float(row["quality_threshold"]),
                    similarity_threshold=float(row["similarity_threshold"]),
                    prioritize_expressions=row["prioritize_expressions"],
                    prioritize_composition=row["prioritize_composition"],
                    enforce_story_coverage=row["enforce_story_coverage"],
                    enforce_person_coverage=row["enforce_person_coverage"],
                    is_system=row["is_system"],
                )
                for row in rows
            ]

            return {"presets": presets}

    except Exception:
        logger.exception("Failed to list curation presets")
        raise InternalError("Failed to list curation presets")


# ---------------------------------------------------------------------------
# Create Sub-Gallery from Filter Results (Phase 5 - US3)
# ---------------------------------------------------------------------------


class CreateSubGalleryRequest(BaseModel):
    """Request to create sub-gallery from filter results."""

    name: str = Field(..., min_length=1, max_length=100)
    asset_ids: list[UUID] = Field(..., min_length=1, max_length=500)
    copy_settings: bool = Field(True, description="Copy parent gallery settings")


class CreateSubGalleryResponse(BaseModel):
    """Response for create sub-gallery operation."""

    gallery_id: UUID
    name: str
    asset_count: int
    parent_gallery_id: UUID
    created_at: str


@router.post(
    "/galleries/{gallery_id}/create-from-filter",
    response_model=CreateSubGalleryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create sub-gallery from filtered assets",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def create_sub_gallery_from_filter(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateSubGalleryRequest,
) -> CreateSubGalleryResponse:
    """Create a new sub-gallery containing the specified assets.
    
    Used by "Save as Gallery" feature in AI filter UI to persist filtered results.
    """
    from app.services.gallery_service import GalleryService, GalleryNotFoundError
    from app.api.exceptions import ValidationAppError

    try:
        if len(request.asset_ids) > 500:
            raise ValidationAppError(
                "Cannot create sub-gallery with more than 500 assets. "
                "Please narrow your filters or split into multiple galleries."
            )

        gallery_service = GalleryService()
        
        result = await gallery_service.create_from_assets(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            name=request.name,
            asset_ids=request.asset_ids,
            copy_settings=request.copy_settings,
        )

        # T060: Audit logging for AI sub-gallery creation
        try:
            await AuditService().log_event(
                event_type=AuditEventType.AI_SUBGALLERY_CREATED,
                actor_user_id=current_user.user_id,
                workspace_id=workspace_id,
                resource_type="gallery",
                resource_id=result["sub_gallery_id"],
                details={
                    "name": request.name,
                    "asset_count": len(request.asset_ids),
                    "parent_gallery_id": str(gallery_id),
                    "copy_settings": request.copy_settings,
                },
            )
        except Exception:
            logger.warning("Failed to log AI_SUBGALLERY_CREATED audit event", exc_info=True)

        return CreateSubGalleryResponse(
            gallery_id=UUID(result["sub_gallery_id"]),
            name=result["name"],
            asset_count=result["asset_count"],
            parent_gallery_id=UUID(result["parent_gallery_id"]),
            created_at=result["created_at"],
        )

    except GalleryNotFoundError:
        raise NotFoundError("Gallery", gallery_id)
    except Exception:
        logger.exception("Failed to create sub-gallery from filter")
        raise InternalError("Failed to create sub-gallery from filter")
