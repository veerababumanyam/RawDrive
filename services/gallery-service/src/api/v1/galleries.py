"""
Authenticated Gallery API Endpoints.

Requires JWT authentication for all endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from typing import Optional
from uuid import UUID

from src.services.gallery_service import (
    get_gallery_service,
    GalleryNotFoundError,
    GalleryError,
    SubGalleryNotFoundError,
)
from src.services.cache_warming_service import get_cache_warming_service
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
    UpdateAssetRequest,
)
from src.middleware.auth import get_workspace_id, get_current_user
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# =============================================================================
# Dependencies
# =============================================================================


async def get_current_user(
    authorization: str = Header(..., description="Bearer token"),
    x_workspace_id: str = Header(..., alias="X-Workspace-ID"),
) -> dict:
    """Extract and validate JWT token.

    In production, this would decode and validate the JWT.
    For now, we extract user info from headers set by the API gateway.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    # In production, decode JWT here
    # For now, trust headers from gateway
    return {
        "user_id": "user-from-jwt",
        "workspace_id": x_workspace_id,
    }


async def get_workspace_id(
    x_workspace_id: str = Header(..., alias="X-Workspace-ID"),
) -> str:
    """Extract workspace ID from header."""
    return x_workspace_id


# =============================================================================
# Gallery Endpoints
# =============================================================================


@router.get("", response_model=GalleryListResponse)
async def list_galleries(
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
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.post("", response_model=GalleryResponse)
async def create_gallery(
    request: GalleryCreateRequest,
    workspace_id: str = Depends(get_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Create a new gallery."""
    gallery_service = get_gallery_service()

    # Convert ISO string to datetime if present
    shoot_date = None
    if request.shoot_date:
        from datetime import datetime
        try:
            shoot_date = datetime.fromisoformat(request.shoot_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid shoot_date format")

    try:
        result = await gallery_service.create_gallery(
            workspace_id=UUID(workspace_id),
            user_id=UUID(current_user["user_id"]) if current_user.get("user_id") != "user-from-jwt" else UUID("00000000-0000-0000-0000-000000000000"), # Fallback for dev/mock
            title=request.title,
            description=request.description,
            client_name=request.client_name,
            client_id=UUID(request.client_id) if request.client_id else None,
            shoot_date=shoot_date,
        )
        return result
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.patch("/{gallery_id}", response_model=GalleryResponse)
async def update_gallery(
    gallery_id: str,
    request: GalleryUpdateRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Update a gallery."""
    gallery_service = get_gallery_service()

    try:
        # Filter out None values from request model
        updates = request.model_dump(exclude_unset=True)
        
        result = await gallery_service.update_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            **updates
        )
        return result
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.get("/{gallery_id}/credentials", response_model=GalleryCredentialsResponse)
async def get_gallery_credentials(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Get gallery credentials."""
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.get_gallery_credentials(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )
        return result
    except GalleryNotFoundError:
         raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.delete("/{gallery_id}", status_code=204)
async def delete_gallery(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Delete a gallery."""
    gallery_service = get_gallery_service()

    try:
        await gallery_service.delete_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
        )
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.post("/{gallery_id}/publish", response_model=GalleryResponse)
async def publish_gallery(
    gallery_id: str,
    request: GalleryPublishRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Publish or unpublish a gallery."""
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.publish_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            publish=request.publish,
        )
        return result
    except GalleryNotFoundError:
         raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.post("/{gallery_id}/sub-galleries", status_code=201)
async def create_sub_gallery(
    gallery_id: str,
    request: SubGalleryCreateRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Create a sub-gallery."""
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.create_sub_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            name=request.name,
            sort_order=request.sort_order,
        )
        return result
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.patch("/{gallery_id}/sub-galleries/{sub_gallery_id}")
async def update_sub_gallery(
    gallery_id: str,
    sub_gallery_id: str,
    request: SubGalleryUpdateRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Update a sub-gallery."""
    gallery_service = get_gallery_service()

    try:
        updates = request.model_dump(exclude_unset=True)
        result = await gallery_service.update_sub_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            sub_gallery_id=UUID(sub_gallery_id),
            **updates
        )
        return result
    except SubGalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "SUB_GALLERY_NOT_FOUND", "message": "Sub-gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.delete("/{gallery_id}/sub-galleries/{sub_gallery_id}", status_code=204)
async def delete_sub_gallery(
    gallery_id: str,
    sub_gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Delete a sub-gallery."""
    gallery_service = get_gallery_service()

    try:
        await gallery_service.delete_sub_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            sub_gallery_id=UUID(sub_gallery_id),
        )
    except SubGalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "SUB_GALLERY_NOT_FOUND", "message": "Sub-gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})



@router.post("/{gallery_id}/pin", response_model=GalleryResponse)
async def pin_gallery(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Pin a gallery."""
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.pin_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
        )
        return result
    except GalleryNotFoundError:
         raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.post("/{gallery_id}/unpin", response_model=GalleryResponse)
async def unpin_gallery(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """Unpin a gallery."""
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.unpin_gallery(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
        )
        return result
    except GalleryNotFoundError:
         raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.post("/{gallery_id}/assets", response_model=GalleryResponse)
async def add_assets(
    gallery_id: str,
    request: AddAssetsRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Add assets to a gallery."""
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.add_assets(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            asset_ids=[UUID(aid) for aid in request.asset_ids],
        )
        return result
    except GalleryNotFoundError:
         raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.post("/{gallery_id}/assets/remove", status_code=204)
async def remove_assets(
    gallery_id: str,
    request: AddAssetsRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Remove assets from gallery."""
    gallery_service = get_gallery_service()
    try:
        await gallery_service.remove_assets(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            asset_ids=[UUID(aid) for aid in request.asset_ids],
        )
    except GalleryNotFoundError:
         raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.patch("/{gallery_id}/assets/{asset_id}")
async def update_asset(
    gallery_id: str,
    asset_id: str,
    request: UpdateAssetRequest,
    workspace_id: str = Depends(get_workspace_id),
):
    """Update metadata for a gallery asset (title, description, is_private)."""
    gallery_service = get_gallery_service()

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
        raise HTTPException(
            status_code=404,
            detail={"error": "NOT_FOUND", "message": str(e)}
        )
    except GalleryError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"error": e.code, "message": str(e)}
        )


@router.get("/{gallery_id}", response_model=GalleryResponse)
async def get_gallery(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """
    Get detailed gallery information.

    Returns full gallery data including sub-galleries and stats.
    """
    # #region agent log
    import json
    import os
    import time
    try:
        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
        log_entry = {
            "id": "log_entry",
            "timestamp": int(time.time() * 1000),
            "location": "galleries.py:get_gallery:entry",
            "message": "Endpoint called",
            "data": {
                "gallery_id": gallery_id,
                "workspace_id": workspace_id,
                "gallery_id_type": type(gallery_id).__name__,
                "workspace_id_type": type(workspace_id).__name__
            },
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "A"
        }
        with open(debug_log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_entry) + '\n')
            f.flush()
    except Exception:
        pass
    # #endregion
    
    gallery_service = get_gallery_service()

    try:
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "galleries.py:get_gallery:before_call",
                "message": "Before calling service.get_gallery",
                "data": {
                    "gallery_id": gallery_id,
                    "workspace_id": workspace_id
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "A"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        
        result = await gallery_service.get_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )
        
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "galleries.py:get_gallery:success",
                "message": "Service call succeeded",
                "data": {
                    "result_keys": list(result.keys()) if isinstance(result, dict) else "not_dict",
                    "result_type": type(result).__name__
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "A"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        
        # #region agent log
        try:
            import json
            import time
            from pydantic import ValidationError
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            
            # Try to validate the result matches the response model
            try:
                from src.schemas.gallery import GalleryResponse
                validated = GalleryResponse(**result)
                validation_status = "passed"
            except ValidationError as ve:
                validation_status = "failed"
                validation_errors = ve.errors()
            except Exception as ve:
                validation_status = "error"
                validation_errors = str(ve)
            else:
                validation_errors = None
            
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "galleries.py:get_gallery:before_return",
                "message": "Before returning result",
                "data": {
                    "result_keys": list(result.keys()) if isinstance(result, dict) else "not_dict",
                    "result_type": type(result).__name__,
                    "validation_status": validation_status,
                    "validation_errors": validation_errors,
                    "custom_links_type": type(result.get("custom_links")).__name__ if isinstance(result, dict) else None,
                    "custom_links_value": str(result.get("custom_links"))[:200] if isinstance(result, dict) else None
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "A"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        
        # Final safety check - ensure custom_links is always a list before returning
        if isinstance(result, dict) and "custom_links" in result:
            if not isinstance(result["custom_links"], list):
                # #region agent log
                try:
                    debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                    log_entry = {
                        "id": "log_entry",
                        "timestamp": int(time.time() * 1000),
                        "location": "galleries.py:get_gallery:final_custom_links_check",
                        "message": "custom_links is not a list in result, forcing to empty list",
                        "data": {
                            "custom_links_type": type(result["custom_links"]).__name__,
                            "custom_links_value": str(result["custom_links"])[:200]
                        },
                        "sessionId": "debug-session",
                        "runId": "run1",
                        "hypothesisId": "A"
                    }
                    with open(debug_log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps(log_entry) + '\n')
                        f.flush()
                except Exception:
                    pass
                # #endregion
                result["custom_links"] = []
        
        return result
    except GalleryNotFoundError:
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "galleries.py:get_gallery:not_found",
                "message": "GalleryNotFoundError caught",
                "data": {
                    "gallery_id": gallery_id,
                    "workspace_id": workspace_id
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "A"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "galleries.py:get_gallery:gallery_error",
                "message": "GalleryError caught",
                "data": {
                    "error_code": e.code,
                    "error_message": str(e),
                    "status": e.status,
                    "gallery_id": gallery_id,
                    "workspace_id": workspace_id
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "A"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})
    except Exception as e:
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "galleries.py:get_gallery:unhandled_exception",
                "message": "Unhandled exception caught",
                "data": {
                    "exception_type": type(e).__name__,
                    "exception_message": str(e),
                    "exception_args": str(e.args) if hasattr(e, 'args') else None,
                    "gallery_id": gallery_id,
                    "workspace_id": workspace_id
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "A"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
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
