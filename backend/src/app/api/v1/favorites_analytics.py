"""API endpoints for favorites analytics.

These endpoints are for photographers to view analytics about
which photos clients have favorited.

Feature: 012-client-favorites (US5)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Any, List, Optional
from uuid import UUID
import io

from app.api.dependencies import get_current_user, require_permissions
from app.services.favorites_analytics_service import (
    FavoritesAnalyticsService,
    GalleryNotFoundError,
    get_favorites_analytics_service,
)


router = APIRouter(prefix="/workspaces/{workspace_id}/galleries/{gallery_id}/favorites", tags=["favorites-analytics"])


# =========================================================================
# Response Schemas
# =========================================================================


class PhotoAnalytics(BaseModel):
    """Analytics data for a single photo."""

    asset_id: str
    filename: str
    thumbnail_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    favorite_count: int
    unique_clients: int
    first_favorited_at: Optional[str] = None
    last_favorited_at: Optional[str] = None


class PaginationMeta(BaseModel):
    """Pagination metadata."""

    page: int
    limit: int
    total: int
    total_pages: int


class AnalyticsResponse(BaseModel):
    """Response for favorites analytics endpoint."""

    data: List[PhotoAnalytics]
    meta: PaginationMeta


class MostFavoritedPhoto(BaseModel):
    """Most favorited photo details."""

    asset_id: str
    filename: str
    thumbnail_url: Optional[str] = None
    favorite_count: int


class FavoritesByDay(BaseModel):
    """Favorites count for a specific day."""

    date: str
    count: int


class SummaryResponse(BaseModel):
    """Response for favorites summary endpoint."""

    gallery_id: str
    gallery_title: str
    total_favorites: int
    unique_clients: int
    favorited_photos: int
    total_photos: int
    total_lists: int
    engagement_rate: float
    most_favorited_photo: Optional[MostFavoritedPhoto] = None
    favorites_by_day: List[FavoritesByDay]


class RefreshResponse(BaseModel):
    """Response for analytics refresh endpoint."""

    success: bool
    message: str


# =========================================================================
# Favorites Settings Schemas (T091-T093)
# =========================================================================


class FavoritesSettings(BaseModel):
    """Favorites settings for a gallery."""

    favorites_enabled: bool = True
    sharing_enabled: bool = True
    download_enabled: bool = False
    max_lists_per_client: int = Field(default=5, ge=1, le=20)
    download_resolution: str = Field(default="web_only")  # web_only, original_allowed
    download_limit_per_client: int = Field(default=100, ge=1, le=1000)


class UpdateFavoritesSettingsRequest(BaseModel):
    """Request to update favorites settings."""

    favorites_enabled: Optional[bool] = None
    sharing_enabled: Optional[bool] = None
    download_enabled: Optional[bool] = None
    max_lists_per_client: Optional[int] = Field(default=None, ge=1, le=20)
    download_resolution: Optional[str] = None
    download_limit_per_client: Optional[int] = Field(default=None, ge=1, le=1000)


# =========================================================================
# T086: GET /favorites/analytics - Photo analytics with pagination
# =========================================================================


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_favorites_analytics(
    workspace_id: UUID,
    gallery_id: UUID,
    sort_by: str = Query(
        default="favorite_count",
        description="Field to sort by",
        regex="^(favorite_count|first_favorited_at|last_favorited_at|filename)$",
    ),
    order: str = Query(
        default="desc", description="Sort order", regex="^(asc|desc)$"
    ),
    page: int = Query(default=1, ge=1, description="Page number"),
    limit: int = Query(default=50, ge=1, le=100, description="Items per page"),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("galleries:read")),
    service: FavoritesAnalyticsService = Depends(get_favorites_analytics_service),
) -> AnalyticsResponse:
    """Get analytics for favorited photos in a gallery.

    Returns a paginated list of photos with their favorite counts,
    sorted by the specified field.
    """
    # Verify user has access to this workspace
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    try:
        result = await service.get_favorites_analytics(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            sort_by=sort_by,
            order=order,
            page=page,
            limit=limit,
        )
        return AnalyticsResponse(**result)
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail="Gallery not found")


# =========================================================================
# T087: GET /favorites/analytics/summary - Summary statistics
# =========================================================================


@router.get("/analytics/summary", response_model=SummaryResponse)
async def get_favorites_summary(
    workspace_id: UUID,
    gallery_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("galleries:read")),
    service: FavoritesAnalyticsService = Depends(get_favorites_analytics_service),
) -> SummaryResponse:
    """Get summary statistics for favorites in a gallery.

    Returns high-level metrics including total favorites, unique clients,
    most favorited photo, and a 30-day trend chart.
    """
    # Verify user has access to this workspace
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    try:
        result = await service.get_favorites_summary(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )
        return SummaryResponse(**result)
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail="Gallery not found")


# =========================================================================
# T088: POST /favorites/analytics/refresh - Refresh analytics
# =========================================================================


@router.post("/analytics/refresh", response_model=RefreshResponse)
async def refresh_favorites_analytics(
    workspace_id: UUID,
    gallery_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("galleries:write")),
    service: FavoritesAnalyticsService = Depends(get_favorites_analytics_service),
) -> RefreshResponse:
    """Refresh analytics data for a gallery.

    This forces a recalculation of any cached or materialized analytics data.
    """
    # Verify user has access to this workspace
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    try:
        success = await service.refresh_analytics(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )
        return RefreshResponse(
            success=success,
            message="Analytics refreshed successfully" if success else "Refresh failed",
        )
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail="Gallery not found")


# =========================================================================
# T089: GET /favorites/export - Export CSV
# =========================================================================


@router.get("/export")
async def export_favorites_csv(
    workspace_id: UUID,
    gallery_id: UUID,
    min_favorites: int = Query(default=1, ge=1, description="Minimum favorites to include"),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("galleries:read")),
    service: FavoritesAnalyticsService = Depends(get_favorites_analytics_service),
) -> StreamingResponse:
    """Export favorited photos as a CSV file.

    Returns a downloadable CSV with photo filenames, favorite counts,
    and timestamps for each favorited photo.
    """
    # Verify user has access to this workspace
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    try:
        csv_content = await service.export_favorites_csv(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            min_favorites=min_favorites,
        )

        # Return as downloadable CSV
        return StreamingResponse(
            io.BytesIO(csv_content.encode("utf-8")),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="favorites_{gallery_id}.csv"'
            },
        )
    except GalleryNotFoundError:
        raise HTTPException(status_code=404, detail="Gallery not found")


# =========================================================================
# T091-T092: Favorites Settings endpoints
# =========================================================================


@router.get("/settings", response_model=FavoritesSettings)
async def get_favorites_settings(
    workspace_id: UUID,
    gallery_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("galleries:read")),
) -> FavoritesSettings:
    """Get favorites settings for a gallery."""
    # Verify user has access to this workspace
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    from app.db.postgres import get_postgres_pool

    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        # Check if gallery exists
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id, favorites_settings
            FROM galleries
            WHERE gallery_id = $1 AND workspace_id = $2
            """,
            gallery_id,
            workspace_id,
        )

        if not gallery:
            raise HTTPException(status_code=404, detail="Gallery not found")

        # Return settings from JSONB column or defaults
        settings_data = gallery.get("favorites_settings") or {}
        return FavoritesSettings(
            favorites_enabled=settings_data.get("favorites_enabled", True),
            sharing_enabled=settings_data.get("sharing_enabled", True),
            download_enabled=settings_data.get("download_enabled", False),
            max_lists_per_client=settings_data.get("max_lists_per_client", 5),
            download_resolution=settings_data.get("download_resolution", "web_only"),
            download_limit_per_client=settings_data.get("download_limit_per_client", 100),
        )


@router.patch("/settings", response_model=FavoritesSettings)
async def update_favorites_settings(
    workspace_id: UUID,
    gallery_id: UUID,
    request: UpdateFavoritesSettingsRequest,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("galleries:write")),
) -> FavoritesSettings:
    """Update favorites settings for a gallery."""
    # Verify user has access to this workspace
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    from app.db.postgres import get_postgres_pool

    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        # Get current settings
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id, favorites_settings
            FROM galleries
            WHERE gallery_id = $1 AND workspace_id = $2
            """,
            gallery_id,
            workspace_id,
        )

        if not gallery:
            raise HTTPException(status_code=404, detail="Gallery not found")

        # Merge updates with current settings
        current_settings = gallery.get("favorites_settings") or {}
        updates = request.model_dump(exclude_none=True)

        for key, value in updates.items():
            current_settings[key] = value

        # Update in database
        await conn.execute(
            """
            UPDATE galleries
            SET favorites_settings = $1, updated_at = NOW()
            WHERE gallery_id = $2
            """,
            current_settings,
            gallery_id,
        )

        return FavoritesSettings(**current_settings)
