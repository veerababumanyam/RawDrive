"""Client Favorites API Endpoints.

Public endpoints for gallery visitors to manage their favorites.
These endpoints use X-Client-Token header for client identification.

Feature: 012-client-favorites
"""
from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Path, Query, Response, status

from app.api.exceptions import AppError, InternalError, NotFoundError
from app.api.schemas import (
    CreateFavoriteListRequest,
    CreateShareLinkRequest,
    DownloadStatusResponse,
    FavoriteListResponse,
    FavoriteListsResponse,
    FavoritesListResponse,
    MoveToListRequest,
    RequestDownloadRequest,
    ShareLinkResponse,
    ShareLinksListResponse,
    ToggleFavoriteRequest,
    ToggleFavoriteResponse,
    UpdateFavoriteListRequest,
)
from app.services.favorites_service import (
    FavoritesService,
    GalleryNotAccessibleError,
    AssetNotInGalleryError,
    get_favorites_service,
)
from app.utils.client_token import get_client_token

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# US1: Toggle Favorites (T025-T026)
# =============================================================================


@router.post(
    "",
    response_model=ToggleFavoriteResponse,
    status_code=status.HTTP_200_OK,
    summary="Toggle favorite status for a photo",
    description="Mark or unmark a photo as favorite. Creates default list on first favorite.",
)
async def toggle_favorite(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: ToggleFavoriteRequest = Body(...),
    client_token: str = Depends(get_client_token),
) -> ToggleFavoriteResponse:
    """Toggle favorite status for a photo in a public gallery.

    - If favorited=True and photo is not favorited, adds to favorites
    - If favorited=False and photo is favorited, removes from favorites
    - Creates default "Favorites" list on first favorite action
    """
    service = get_favorites_service()
    try:
        result = await service.toggle_favorite(
            gallery_id=gallery_id,
            asset_id=request.asset_id,
            client_token=client_token,
            favorited=request.favorited,
            list_id=request.list_id,
        )
        return ToggleFavoriteResponse(
            asset_id=result["asset_id"],
            is_favorited=result["is_favorited"],
            favorites_count=result["favorites_count"],
            list_id=result.get("list_id"),
        )
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except AssetNotInGalleryError:
        raise NotFoundError("Asset", str(request.asset_id))
    except Exception as e:
        logger.exception("Failed to toggle favorite")
        raise InternalError("Failed to update favorite status")


# =============================================================================
# Batch Favorites Check (Performance Optimization)
# =============================================================================


@router.post(
    "/check",
    status_code=status.HTTP_200_OK,
    summary="Check favorite status for multiple assets",
    description="Batch check favorite status to avoid N+1 queries.",
)
async def check_favorites_batch(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    asset_ids: Annotated[list[UUID], Body(..., description="Asset IDs to check", max_length=100)],
    client_token: str = Depends(get_client_token),
) -> dict[str, bool]:
    """Check if multiple assets are favorited in a single request.

    Returns a dict mapping asset_id to favorited boolean.
    Maximum 100 assets per request.
    """
    service = get_favorites_service()
    try:
        return await service.check_favorites_batch(
            gallery_id=gallery_id,
            asset_ids=asset_ids,
            client_token=client_token,
        )
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to check favorites batch")
        raise InternalError("Failed to check favorites")


# =============================================================================
# US2: List Favorites (T027-T031)
# =============================================================================


@router.get(
    "",
    response_model=FavoritesListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get favorited photos",
    description="List all favorited photos for the current client.",
)
async def list_favorites(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    list_id: Annotated[UUID | None, Query(description="Filter by specific list")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
    client_token: str = Depends(get_client_token),
) -> FavoritesListResponse:
    """Get all favorited photos for the current client.

    Returns photos with thumbnails and metadata, paginated.
    Optionally filter by a specific favorite list.
    """
    service = get_favorites_service()
    try:
        result = await service.list_favorites(
            gallery_id=gallery_id,
            client_token=client_token,
            list_id=list_id,
            page=page,
            limit=limit,
        )
        return FavoritesListResponse(**result)
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to list favorites")
        raise InternalError("Failed to retrieve favorites")


# =============================================================================
# US3: Favorite Lists Management (T046-T060)
# =============================================================================


@router.get(
    "/lists",
    response_model=FavoriteListsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get favorite lists",
    description="Get all favorite lists for the current client.",
)
async def get_favorite_lists(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    client_token: str = Depends(get_client_token),
) -> FavoriteListsResponse:
    """Get all favorite lists created by the current client.

    Always includes the default "Favorites" list if any favorites exist.
    """
    service = get_favorites_service()
    try:
        result = await service.get_favorite_lists(
            gallery_id=gallery_id,
            client_token=client_token,
        )
        return FavoriteListsResponse(**result)
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to get favorite lists")
        raise InternalError("Failed to retrieve lists")


@router.post(
    "/lists",
    response_model=FavoriteListResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a favorite list",
    description="Create a new named favorite list.",
)
async def create_favorite_list(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: CreateFavoriteListRequest = Body(...),
    client_token: str = Depends(get_client_token),
) -> FavoriteListResponse:
    """Create a new favorite list for organizing selections.

    Limited to 10 lists per client per gallery.
    """
    service = get_favorites_service()
    try:
        result = await service.create_list(
            gallery_id=gallery_id,
            client_token=client_token,
            name=request.name,
        )
        return FavoriteListResponse(**result)
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except ValueError as e:
        raise AppError(message=str(e), code="LIST_LIMIT_EXCEEDED", status_code=400)
    except Exception as e:
        logger.exception("Failed to create favorite list")
        raise InternalError("Failed to create list")


@router.patch(
    "/lists/{list_id}",
    response_model=FavoriteListResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a favorite list",
    description="Update list name or sort order.",
)
async def update_favorite_list(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    list_id: Annotated[UUID, Path(..., description="List ID")],
    request: UpdateFavoriteListRequest = Body(...),
    client_token: str = Depends(get_client_token),
) -> FavoriteListResponse:
    """Update a favorite list's name or sort order.

    Cannot rename the default "Favorites" list.
    """
    service = get_favorites_service()
    try:
        result = await service.update_list(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
            name=request.name,
            sort_order=request.sort_order,
        )
        return FavoriteListResponse(**result)
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except ValueError as e:
        if "not found" in str(e).lower():
            raise NotFoundError("List", str(list_id))
        raise AppError(message=str(e), code="UPDATE_FAILED", status_code=400)
    except Exception as e:
        logger.exception("Failed to update favorite list")
        raise InternalError("Failed to update list")


@router.delete(
    "/lists/{list_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a favorite list",
    description="Delete a favorite list (moves photos to default list).",
)
async def delete_favorite_list(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    list_id: Annotated[UUID, Path(..., description="List ID")],
    client_token: str = Depends(get_client_token),
):
    """Delete a favorite list.

    Cannot delete the default "Favorites" list.
    Photos in the deleted list are moved to the default list.
    """
    service = get_favorites_service()
    try:
        await service.delete_list(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
        )
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except ValueError as e:
        if "not found" in str(e).lower():
            raise NotFoundError("List", str(list_id))
        if "default" in str(e).lower():
            raise AppError(
                message="Cannot delete the default Favorites list",
                code="CANNOT_DELETE_DEFAULT",
                status_code=400,
            )
        raise AppError(message=str(e), code="DELETE_FAILED", status_code=400)
    except Exception as e:
        logger.exception("Failed to delete favorite list")
        raise InternalError("Failed to delete list")


@router.post(
    "/lists/{list_id}/move",
    status_code=status.HTTP_200_OK,
    summary="Move photo to another list",
    description="Move a favorited photo from one list to another.",
)
async def move_to_list(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    list_id: Annotated[UUID, Path(..., description="Source list ID")],
    request: MoveToListRequest = Body(...),
    client_token: str = Depends(get_client_token),
) -> dict:
    """Move a favorited photo to a different list.

    The photo must exist in the source list.
    """
    service = get_favorites_service()
    try:
        await service.move_to_list(
            gallery_id=gallery_id,
            source_list_id=list_id,
            asset_id=request.asset_id,
            target_list_id=request.target_list_id,
            client_token=client_token,
        )
        return {"success": True}
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except ValueError as e:
        raise AppError(message=str(e), code="MOVE_FAILED", status_code=400)
    except Exception as e:
        logger.exception("Failed to move photo to list")
        raise InternalError("Failed to move photo")


# =============================================================================
# US6: Share Links (T091-T105)
# =============================================================================


@router.post(
    "/lists/{list_id}/share",
    response_model=ShareLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create share link for list",
    description="Generate a shareable link for a favorites list.",
)
async def create_share_link(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    list_id: Annotated[UUID, Path(..., description="List ID")],
    request: CreateShareLinkRequest = Body(...),
    client_token: str = Depends(get_client_token),
) -> ShareLinkResponse:
    """Create a shareable link for a favorites list.

    The link provides read-only access to the list contents.
    """
    service = get_favorites_service()
    try:
        result = await service.create_share_link(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
            expires_in_days=request.expires_in_days,
        )
        return ShareLinkResponse(**result)
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except ValueError as e:
        if "not found" in str(e).lower():
            raise NotFoundError("List", str(list_id))
        if "disabled" in str(e).lower():
            raise AppError(
                message="Sharing is disabled for this gallery",
                code="SHARING_DISABLED",
                status_code=403,
            )
        raise AppError(message=str(e), code="SHARE_FAILED", status_code=400)
    except Exception as e:
        logger.exception("Failed to create share link")
        raise InternalError("Failed to create share link")


@router.get(
    "/lists/{list_id}/share",
    response_model=ShareLinksListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get share links for list",
    description="Get all share links for a favorites list.",
)
async def get_share_links(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    list_id: Annotated[UUID, Path(..., description="List ID")],
    client_token: str = Depends(get_client_token),
) -> ShareLinksListResponse:
    """Get all share links created for a favorites list."""
    service = get_favorites_service()
    try:
        result = await service.get_share_links(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
        )
        return ShareLinksListResponse(**result)
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except ValueError as e:
        if "not found" in str(e).lower():
            raise NotFoundError("List", str(list_id))
        raise AppError(message=str(e), code="FETCH_FAILED", status_code=400)
    except Exception as e:
        logger.exception("Failed to get share links")
        raise InternalError("Failed to retrieve share links")


@router.delete(
    "/lists/{list_id}/share/{share_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke share link",
    description="Revoke a share link for a favorites list.",
)
async def revoke_share_link(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    list_id: Annotated[UUID, Path(..., description="List ID")],
    share_id: Annotated[UUID, Path(..., description="Share ID to revoke")],
    client_token: str = Depends(get_client_token),
):
    """Revoke a share link, making it no longer accessible."""
    service = get_favorites_service()
    try:
        await service.revoke_share_link(
            gallery_id=gallery_id,
            list_id=list_id,
            share_id=share_id,
            client_token=client_token,
        )
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except ValueError as e:
        if "list not found" in str(e).lower():
            raise NotFoundError("List", str(list_id))
        if "share not found" in str(e).lower():
            raise NotFoundError("Share", str(share_id))
        raise AppError(message=str(e), code="REVOKE_FAILED", status_code=400)
    except Exception as e:
        logger.exception("Failed to revoke share link")
        raise InternalError("Failed to revoke share link")


# =============================================================================
# US4: ZIP Downloads (T076-T090)
# =============================================================================


@router.post(
    "/lists/{list_id}/download",
    response_model=DownloadStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request ZIP download",
    description="Request a ZIP file containing all photos in a favorites list.",
)
async def request_download(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    list_id: Annotated[UUID, Path(..., description="List ID")],
    request: RequestDownloadRequest = Body(...),
    client_token: str = Depends(get_client_token),
) -> DownloadStatusResponse:
    """Request a ZIP download of favorites.

    Returns a download job ID. Poll the status endpoint for progress.
    """
    service = get_favorites_service()
    try:
        result = await service.request_download(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
            resolution=request.resolution,
        )
        return DownloadStatusResponse(**result)
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except ValueError as e:
        if "not found" in str(e).lower():
            raise NotFoundError("List", str(list_id))
        if "limit" in str(e).lower():
            raise AppError(
                message="Download limit reached for this gallery",
                code="DOWNLOAD_LIMIT_EXCEEDED",
                status_code=429,
            )
        raise AppError(message=str(e), code="DOWNLOAD_FAILED", status_code=400)
    except Exception as e:
        logger.exception("Failed to request download")
        raise InternalError("Failed to initiate download")


@router.get(
    "/downloads/{download_id}",
    response_model=DownloadStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Get download status",
    description="Check the status of a ZIP download request.",
)
async def get_download_status(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    download_id: Annotated[UUID, Path(..., description="Download ID")],
    client_token: str = Depends(get_client_token),
) -> DownloadStatusResponse:
    """Get the current status of a download job.

    When status is 'completed', the response includes a download_url.
    """
    service = get_favorites_service()
    try:
        result = await service.get_download_status(
            gallery_id=gallery_id,
            download_id=download_id,
            client_token=client_token,
        )
        return DownloadStatusResponse(**result)
    except GalleryNotAccessibleError:
        raise NotFoundError("Gallery", str(gallery_id))
    except ValueError as e:
        if "not found" in str(e).lower():
            raise NotFoundError("Download", str(download_id))
        raise AppError(message=str(e), code="STATUS_FAILED", status_code=400)
    except Exception as e:
        logger.exception("Failed to get download status")
        raise InternalError("Failed to retrieve download status")
