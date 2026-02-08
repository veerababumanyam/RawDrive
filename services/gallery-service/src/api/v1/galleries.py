"""
Authenticated Gallery API Endpoints.

Requires JWT authentication for all endpoints.
"""

from fastapi import APIRouter, Depends, Header, Query, Request
from typing import Optional
from uuid import UUID

from src.services.gallery_service import (
    get_gallery_service,
    GalleryNotFoundError,
    GalleryError,
    SubGalleryNotFoundError,
)
from src.services.cache_warming_service import get_cache_warming_service
from src.services.collaboration_service import get_collaboration_service
from src.schemas.gallery import (
    GalleryResponse,
    GalleryListResponse,
    GalleryAssetsListResponse,
    GalleryCreateRequest,
    GalleryUpdateRequest,
    AddAssetsRequest,
    GalleryCredentialsResponse,
    GalleryPublishRequest,
    SubGalleryCreateRequest,
    SubGalleryUpdateRequest,
    UpdateSubGalleriesSortOrderRequest,
    UpdateAssetRequest,
    DownloadLimitRequest,
    DownloadLimitResponse,
    DownloadUsageResponse,
)
from src.schemas.gallery_design import (
    GalleryDesignResponse,
    GalleryDesignUpdateRequest,
    GalleryDesignConfig,
)
from src.middleware.auth import get_workspace_id, get_current_user
from src.middleware.correlation import get_correlation_id
from src.api.v1.errors import (
    raise_http_exception,
    exception_to_error_response,
    ErrorCode,
    ErrorMessage,
)
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# Dependencies are imported from src.middleware.auth:
# - get_current_user: Decodes and validates JWT tokens
# - get_workspace_id: Extracts workspace ID from header or path


def handle_service_error(exc: Exception, request_id: str):
    """Convert service exceptions to HTTP exceptions with unified format."""
    error_response = exception_to_error_response(exc, request_id)
    from fastapi import HTTPException
    status_code = getattr(exc, "status", 500)
    raise HTTPException(status_code=status_code, content=error_response.model_dump())


# =============================================================================
# Gallery Endpoints
# =============================================================================


@router.get("", response_model=GalleryListResponse)
async def list_galleries(
    request: Request,
    workspace_id: str = Depends(get_workspace_id),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("created_at"),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """
    List galleries for the authenticated workspace.

    Supports pagination, sorting, and filtering.

    Triggers background cache warming on first page load to preload
    the 5 most recent galleries for faster subsequent access.
    """
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or request.headers.get("X-Correlation-ID", "")

    # Trigger background cache warming on first page load (non-blocking)
    if page == 1 and not search and not status:
        cache_warming_service = get_cache_warming_service()
        await cache_warming_service.warm_workspace_cache_background(workspace_id)

    try:
        result = await gallery_service.list_galleries(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            sort=sort,
            status=status,
            search=search,
        )
        return result
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.post("", response_model=GalleryResponse)
async def create_gallery(
    req: Request,
    request: GalleryCreateRequest,
    workspace_id: str = Depends(get_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Create a new gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    # Convert ISO string to datetime if present
    shoot_date = None
    if request.shoot_date:
        from datetime import datetime
        try:
            shoot_date = datetime.fromisoformat(request.shoot_date)
        except ValueError:
            raise_http_exception(
                ErrorCode.INVALID_FORMAT,
                ErrorMessage.INVALID_FORMAT,
                details={"field": "shoot_date", "value": request.shoot_date},
                request_id=request_id
            )

    try:
        # Extract user_id from JWT payload - should always be present after auth
        user_id_str = current_user.get("user_id")
        if not user_id_str:
            raise_http_exception(
                ErrorCode.UNAUTHORIZED,
                ErrorMessage.UNAUTHORIZED,
                request_id=request_id
            )

        result = await gallery_service.create_gallery(
            workspace_id=UUID(workspace_id),
            user_id=UUID(user_id_str),
            title=request.title,
            description=request.description,
            client_name=request.client_name,
            client_id=UUID(request.client_id) if request.client_id else None,
            shoot_date=shoot_date,
        )
        return result
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.patch("/{gallery_id}", response_model=GalleryResponse)
async def update_gallery(
    req: Request,
    gallery_id: str,
    request: GalleryUpdateRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Update a gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        # Filter out None values from request model
        updates = request.model_dump(exclude_unset=True)

        result = await gallery_service.update_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            **updates
        )
        return result
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)
    except Exception as e:
        error_response = exception_to_error_response(e, request_id)
        from fastapi import HTTPException
        raise HTTPException(status_code=500, content=error_response.model_dump())


@router.get("/{gallery_id}/credentials", response_model=GalleryCredentialsResponse)
async def get_gallery_credentials(
    req: Request,
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Get gallery credentials."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        result = await gallery_service.get_gallery_credentials(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )
        return result
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)
    except ValueError as e:
        raise_http_exception(
            ErrorCode.INVALID_FORMAT,
            ErrorMessage.INVALID_FORMAT,
            details={"field": "gallery_id", "value": gallery_id},
            request_id=request_id
        )
    except Exception as e:
        error_response = exception_to_error_response(e, request_id)
        from fastapi import HTTPException
        raise HTTPException(status_code=500, content=error_response.model_dump())


@router.delete("/{gallery_id}", status_code=204)
async def delete_gallery(
    req: Request,
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Delete a gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        await gallery_service.delete_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
        )
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.post("/{gallery_id}/publish", response_model=GalleryResponse)
async def publish_gallery(
    req: Request,
    gallery_id: str,
    request: GalleryPublishRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Publish or unpublish a gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        result = await gallery_service.publish_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            publish=request.publish,
        )
        return result
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.post("/{gallery_id}/sub-galleries", status_code=201)
async def create_sub_gallery(
    req: Request,
    gallery_id: str,
    request: SubGalleryCreateRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Create a sub-gallery with optional nesting support.

    Sub-galleries can be nested up to 3 levels deep:
    - Level 1: Direct child of gallery
    - Level 2: Child of a level 1 sub-gallery
    - Level 3: Child of a level 2 sub-gallery (maximum)

    To create a nested sub-gallery, provide parent_sub_gallery_id.
    """
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        result = await gallery_service.create_sub_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            name=request.name,
            sort_order=request.sort_order,
            parent_sub_gallery_id=UUID(request.parent_sub_gallery_id) if request.parent_sub_gallery_id else None,
        )
        return result
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.patch("/{gallery_id}/sub-galleries/sort-order", status_code=200)
async def update_sub_galleries_sort_order(
    req: Request,
    gallery_id: str,
    request: UpdateSubGalleriesSortOrderRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Update sort order for multiple sub-galleries."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        await gallery_service.update_sub_galleries_sort_order(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            sub_gallery_ids=request.sub_gallery_ids,  # Pass strings, service handles conversion
        )

        return {"message": "Sub-galleries sort order updated successfully"}
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)
    except Exception as e:
        error_response = exception_to_error_response(e, request_id)
        from fastapi import HTTPException
        raise HTTPException(status_code=500, content=error_response.model_dump())


@router.patch("/{gallery_id}/sub-galleries/{sub_gallery_id}")
async def update_sub_gallery(
    req: Request,
    gallery_id: str,
    sub_gallery_id: str,
    request: SubGalleryUpdateRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Update a sub-gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        updates = request.model_dump(exclude_unset=True)
        result = await gallery_service.update_sub_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            sub_gallery_id=UUID(sub_gallery_id),
            **updates
        )
        return result
    except SubGalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.delete("/{gallery_id}/sub-galleries/{sub_gallery_id}", status_code=204)
async def delete_sub_gallery(
    req: Request,
    gallery_id: str,
    sub_gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Delete a sub-gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        await gallery_service.delete_sub_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            sub_gallery_id=UUID(sub_gallery_id),
        )
    except SubGalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)



@router.post("/{gallery_id}/pin", response_model=GalleryResponse)
async def pin_gallery(
    req: Request,
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Pin a gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        result = await gallery_service.pin_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
        )
        return result
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.post("/{gallery_id}/unpin", response_model=GalleryResponse)
async def unpin_gallery(
    req: Request,
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Unpin a gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        result = await gallery_service.unpin_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
        )
        return result
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.post("/{gallery_id}/assets", response_model=GalleryResponse)
async def add_assets(
    req: Request,
    gallery_id: str,
    request: AddAssetsRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Add assets to a gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        result = await gallery_service.add_assets(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            asset_ids=[UUID(aid) for aid in request.asset_ids],
        )
        return result
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.post("/{gallery_id}/assets/remove", status_code=204)
async def remove_assets(
    req: Request,
    gallery_id: str,
    request: AddAssetsRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Remove assets from gallery."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        await gallery_service.remove_assets(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            asset_ids=[UUID(aid) for aid in request.asset_ids],
        )
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.patch("/{gallery_id}/assets/{asset_id}")
async def update_asset(
    req: Request,
    gallery_id: str,
    asset_id: str,
    request: UpdateAssetRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Update metadata for a gallery asset (title, description, is_private)."""
    gallery_service = get_gallery_service()
    request_id = get_correlation_id() or req.headers.get("X-Correlation-ID", "")

    try:
        updates = request.model_dump(exclude_unset=True)
        result = await gallery_service.update_asset(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            asset_id=UUID(asset_id),
            **updates
        )
        return result
    except GalleryNotFoundError as e:
        handle_service_error(e, request_id)
    except GalleryError as e:
        handle_service_error(e, request_id)


@router.get("/{gallery_id}", response_model=GalleryResponse)
async def get_gallery(
    req: Request,
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """
    Get detailed gallery information.

    Returns full gallery data including sub-galleries and stats.
    """
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.get_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )
        
        # Final safety check - ensure custom_links is always a list before returning
        if isinstance(result, dict) and "custom_links" in result:
            if not isinstance(result["custom_links"], list):
                result["custom_links"] = []
        
        return result
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})
    except Exception as e:
        raise


@router.get("/{gallery_id}/assets", response_model=GalleryAssetsListResponse)
async def list_gallery_assets(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    sub_gallery_id: Optional[str] = Query(None),
    favorites_only: bool = Query(False),
    selections_only: bool = Query(False),
    # Emotion-based filtering (Phase 2: Emotion Detection Integration)
    emotion: Optional[str] = Query(None, description="Filter by emotion (joy, sadness, anger, surprise, fear, disgust, contentment)"),
    min_emotion_confidence: float = Query(0.7, ge=0.0, le=1.0, description="Minimum emotion confidence threshold"),
):
    """
    List assets in a gallery with pagination.

    Filter by sub-gallery, proofing status, or emotion.

    **Emotion Filtering** (requires AI analysis):
    - emotion: Filter photos by detected emotion (joy, sadness, anger, surprise, fear, disgust, contentment)
    - min_emotion_confidence: Minimum confidence threshold (0.0 to 1.0, default 0.7)

    **Example**: `GET /galleries/{id}/assets?emotion=joy&min_emotion_confidence=0.8`
    """
    gallery_service = get_gallery_service()

    # Validate emotion parameter
    if emotion:
        valid_emotions = {"joy", "sadness", "anger", "surprise", "fear", "disgust", "contentment"}
        if emotion.lower() not in valid_emotions:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "INVALID_EMOTION",
                    "message": f"Invalid emotion: {emotion}. Must be one of: {', '.join(valid_emotions)}"
                }
            )

    try:
        result = await gallery_service.list_gallery_assets(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            page=page,
            limit=limit,
            sub_gallery_id=sub_gallery_id,
            favorites_only=favorites_only,
            selections_only=selections_only,
            emotion=emotion.lower() if emotion else None,
            min_emotion_confidence=min_emotion_confidence if emotion else None,
        )
        return result
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


# =============================================================================
# Cache Warming Endpoint
# =============================================================================


@router.post("/cache/warm")
async def warm_cache(
    workspace_id: str = Depends(get_workspace_id),
    force: bool = Query(False, description="Force re-warming even if already warm"),
):
    """
    Manually trigger cache warming for a workspace.

    Preloads the 5 most recent galleries into cache for faster access.
    This operation is normally triggered automatically on workspace load.

    Use the force parameter to re-warm even if the cache was recently warmed.
    """
    cache_warming_service = get_cache_warming_service()

    try:
        result = await cache_warming_service.warm_workspace_cache(
            workspace_id=workspace_id,
            force=force,
        )
        return result
    except Exception as e:
        logger.error(f"Cache warming failed: {e}", extra={"workspace_id": workspace_id})
        raise HTTPException(
            status_code=500,
            detail={"error": "CACHE_WARM_FAILED", "message": str(e)}
        )


# =============================================================================
# Download Limit Endpoints (US2 - Daily Download Limits)
# =============================================================================


@router.put("/{gallery_id}/download-limit", response_model=DownloadLimitResponse)
async def set_download_limit(
    gallery_id: str,
    request: DownloadLimitRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """
    Set daily download limit for a gallery.

    Limits how many photos visitors can download per day.
    Set to 0 or null for unlimited downloads.

    Common values: 5, 10, 25, 50, 100, or unlimited (null/0).
    """
    gallery_service = get_gallery_service()

    try:
        # Update gallery's daily_download_limit
        daily_limit = request.daily_limit if request.daily_limit and request.daily_limit > 0 else None

        result = await gallery_service.update_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            daily_download_limit=daily_limit,
        )

        return DownloadLimitResponse(
            gallery_id=gallery_id,
            daily_limit=result.get('daily_download_limit'),
            limit_enabled=result.get('daily_download_limit') is not None and result.get('daily_download_limit') > 0,
        )
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.get("/{gallery_id}/download-limit", response_model=DownloadLimitResponse)
async def get_download_limit(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """
    Get current download limit settings for a gallery.
    """
    gallery_service = get_gallery_service()

    try:
        gallery = await gallery_service.get_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
        )

        daily_limit = gallery.get('daily_download_limit')

        return DownloadLimitResponse(
            gallery_id=gallery_id,
            daily_limit=daily_limit,
            limit_enabled=daily_limit is not None and daily_limit > 0,
        )
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


# =============================================================================
# Design Configuration Endpoints (Gallery Design Studio)
# =============================================================================


@router.get("/{gallery_id}/design", response_model=GalleryDesignResponse)
async def get_design_config(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """
    Get current gallery design configuration.

    Returns the complete design configuration including cover styles, typography,
    themes, and grid layout settings along with metadata (last_published_at).
    """
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.get_design_config(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
        )
        return result
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.patch("/{gallery_id}/design", response_model=GalleryDesignResponse)
async def update_design_config(
    gallery_id: str,
    request: GalleryDesignUpdateRequest,
    workspace_id: str = Depends(get_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """
    Update gallery design configuration.

    Validates the design configuration against Pydantic schemas and updates
    the design_config JSONB column. Supports partial updates - only include
    the sections you want to modify.

    Changes are immediately published to the live gallery and broadcasted
    to public viewing channels for real-time updates.
    """
    gallery_service = get_gallery_service()
    user_id = UUID(current_user["user_id"])

    try:
        # Validate design config using Pydantic schemas
        try:
            validated_config = GalleryDesignConfig(**request.design_config)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "INVALID_DESIGN_CONFIG",
                    "message": f"Invalid design configuration: {str(e)}"
                }
            )

        result = await gallery_service.update_design_config(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            design_config=validated_config.model_dump(),
        )

        # Broadcast published design to public viewing channel
        try:
            collaboration_service = get_collaboration_service()
            await collaboration_service.broadcast_design_publish(
                gallery_id=UUID(gallery_id),
                workspace_id=UUID(workspace_id),
                design_config=validated_config.model_dump(),
                published_by_user_id=user_id,
            )
        except Exception as e:
            logger.warning(
                f"Failed to broadcast design publish event: {e}",
                extra={"gallery_id": gallery_id, "workspace_id": workspace_id}
            )
            # Don't fail the request if broadcasting fails

        return result
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})
    except Exception as e:
        logger.error(f"Design config update failed: {e}", extra={"gallery_id": gallery_id, "workspace_id": workspace_id})
        raise HTTPException(status_code=500, detail={"error": "INTERNAL_ERROR", "message": "Failed to update design configuration"})
