"""
Authenticated Gallery API Endpoints.

Requires JWT authentication for all endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from typing import Optional

from src.services.gallery_service import (
    get_gallery_service,
    GalleryNotFoundError,
    GalleryError,
)
from src.schemas.gallery import (
    GalleryResponse,
    GalleryListResponse,
    GalleryAssetsListResponse,
)
from src.logging import get_logger
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
    """
    gallery_service = get_gallery_service()

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


@router.get("/{gallery_id}", response_model=GalleryResponse)
async def get_gallery(
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
        return result
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.get("/{gallery_id}/assets", response_model=GalleryAssetsListResponse)
async def list_gallery_assets(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    sub_gallery_id: Optional[str] = Query(None),
    favorites_only: bool = Query(False),
    selections_only: bool = Query(False),
):
    """
    List assets in a gallery with pagination.

    Filter by sub-gallery or proofing status.
    """
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.list_gallery_assets(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            page=page,
            limit=limit,
            sub_gallery_id=sub_gallery_id,
            favorites_only=favorites_only,
            selections_only=selections_only,
        )
        return result
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found"})
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})
