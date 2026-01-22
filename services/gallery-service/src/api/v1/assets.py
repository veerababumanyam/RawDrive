"""
Pro Review Mode Asset API Endpoints.

Handles asset metadata operations for the professional photo culling workflow:
- Single asset metadata updates (rating, flag, color_label)
- Batch metadata updates for efficient multi-select operations
- Asset filtering by metadata for Review Mode views
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from uuid import UUID

from src.services.gallery_service import (
    get_gallery_service,
    GalleryNotFoundError,
    GalleryError,
)
from src.services.audit_service import get_audit_service
from src.schemas.asset_metadata import (
    AssetFlag,
    ColorLabel,
    AssetMetadataUpdateRequest,
    BatchAssetMetadataItem,
    BatchAssetMetadataUpdateRequest,
    AssetFilterRequest,
    AssetMetadataResponse,
    AssetMetadataUpdateResponse,
    BatchAssetMetadataUpdateResponse,
    FilteredAssetsResponse,
)
from src.schemas.sync_audit import SyncAuditAction, SyncAuditSource, SyncActorType
from src.middleware.auth import get_workspace_id, get_current_user
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# =============================================================================
# Pro Review Mode Asset Metadata Endpoints
# =============================================================================


@router.patch(
    "/{gallery_id}/assets/{asset_id}/metadata",
    response_model=AssetMetadataUpdateResponse,
)
async def update_asset_metadata(
    gallery_id: str,
    asset_id: str,
    request: AssetMetadataUpdateRequest,
    workspace_id: str = Depends(get_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """
    Update rating, flag, or color label for a single gallery asset.

    Used by Pro Review Mode for keyboard-driven culling workflow.

    **Keyboard Shortcuts** (frontend handles these):
    - 0-5: Set rating (0 removes rating)
    - P: Set flag to pick
    - U: Set flag to unflagged
    - X: Set flag to reject
    - 6-9: Set color labels (red, yellow, green, blue)

    All changes are logged for audit compliance.
    """
    gallery_service = get_gallery_service()
    audit_service = get_audit_service()
    user_id = current_user.get("user_id")

    try:
        # Get current values for audit logging
        current = await gallery_service.get_asset_metadata(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            asset_id=UUID(asset_id),
        )

        # Update metadata
        result = await gallery_service.update_asset_metadata(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            asset_id=UUID(asset_id),
            rating=request.rating,
            flag=request.flag,
            color_label=request.color_label,
        )

        # Log audit entries for each changed field
        if request.rating is not None and request.rating != current.get("rating"):
            await audit_service.log_metadata_update(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                asset_id=asset_id,
                update_type="rating",
                old_value=str(current.get("rating")) if current.get("rating") is not None else None,
                new_value=str(request.rating),
                actor_type=SyncActorType.USER,
                actor_id=user_id,
                source=SyncAuditSource.WEB_UI,
            )

        if request.flag is not None and request.flag.value != current.get("flag"):
            await audit_service.log_metadata_update(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                asset_id=asset_id,
                update_type="flag",
                old_value=current.get("flag"),
                new_value=request.flag.value,
                actor_type=SyncActorType.USER,
                actor_id=user_id,
                source=SyncAuditSource.WEB_UI,
            )

        if request.color_label is not None and request.color_label.value != current.get("color_label"):
            await audit_service.log_metadata_update(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                asset_id=asset_id,
                update_type="color_label",
                old_value=current.get("color_label"),
                new_value=request.color_label.value,
                actor_type=SyncActorType.USER,
                actor_id=user_id,
                source=SyncAuditSource.WEB_UI,
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


@router.patch(
    "/{gallery_id}/assets/metadata/batch",
    response_model=BatchAssetMetadataUpdateResponse,
)
async def batch_update_asset_metadata(
    gallery_id: str,
    request: BatchAssetMetadataUpdateRequest,
    workspace_id: str = Depends(get_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """
    Batch update metadata for multiple assets at once.

    Efficient for multi-select operations in Review Mode where user
    selects multiple images and applies the same rating/flag/label.

    Maximum 100 assets per batch request.

    All changes are logged for audit compliance.
    """
    gallery_service = get_gallery_service()
    audit_service = get_audit_service()
    user_id = current_user.get("user_id")

    if len(request.items) > 100:
        raise HTTPException(
            status_code=400,
            detail={"error": "BATCH_TOO_LARGE", "message": "Maximum 100 assets per batch"}
        )

    try:
        result = await gallery_service.batch_update_asset_metadata(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            items=request.items,
        )

        # Log batch audit entry
        await audit_service.log(
            workspace_id=workspace_id,
            action=SyncAuditAction.BATCH_UPDATE,
            source=SyncAuditSource.WEB_UI,
            actor_type=SyncActorType.USER,
            actor_id=user_id,
            gallery_id=gallery_id,
            affected_asset_ids=[item.asset_id for item in request.items],
            details={
                "batch_size": len(request.items),
                "success_count": result.success_count,
                "failed_count": result.failed_count,
            },
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


@router.get(
    "/{gallery_id}/assets/filter",
    response_model=FilteredAssetsResponse,
)
async def filter_assets(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    rating: Optional[int] = Query(None, ge=0, le=5, description="Filter by rating (0-5)"),
    rating_min: Optional[int] = Query(None, ge=0, le=5, description="Minimum rating (inclusive)"),
    rating_max: Optional[int] = Query(None, ge=0, le=5, description="Maximum rating (inclusive)"),
    flag: Optional[AssetFlag] = Query(None, description="Filter by flag status"),
    color_label: Optional[ColorLabel] = Query(None, description="Filter by color label"),
    color_labels: Optional[str] = Query(None, description="Filter by multiple color labels (comma-separated)"),
    unrated: bool = Query(False, description="Filter to only unrated assets"),
    has_rating: bool = Query(False, description="Filter to only rated assets"),
    sub_gallery_id: Optional[str] = Query(None, description="Filter by sub-gallery"),
    sort_by: str = Query("sort_order", description="Sort field: sort_order, rating, filename, date_taken"),
    sort_direction: str = Query("asc", description="Sort direction: asc or desc"),
):
    """
    Filter gallery assets by Pro Review metadata.

    Supports complex filtering for Review Mode:
    - Filter by exact rating or rating range
    - Filter by flag status (pick/unflagged/reject)
    - Filter by color label(s)
    - Filter unrated vs rated assets

    Sorting options for different workflow needs:
    - sort_order: Default gallery order
    - rating: Sort by rating (useful for prioritized review)
    - filename: Alphabetical (matches Lightroom default)
    - date_taken: Chronological

    Pagination supports large galleries with thousands of assets.
    """
    gallery_service = get_gallery_service()

    # Parse color_labels if provided
    parsed_color_labels = None
    if color_labels:
        try:
            parsed_color_labels = [ColorLabel(c.strip()) for c in color_labels.split(",")]
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail={"error": "INVALID_COLOR_LABEL", "message": str(e)}
            )

    # Validate sort options
    valid_sort_fields = {"sort_order", "rating", "filename", "date_taken"}
    if sort_by not in valid_sort_fields:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_SORT_FIELD",
                "message": f"sort_by must be one of: {', '.join(valid_sort_fields)}"
            }
        )

    if sort_direction not in {"asc", "desc"}:
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_SORT_DIRECTION", "message": "sort_direction must be 'asc' or 'desc'"}
        )

    try:
        result = await gallery_service.filter_assets(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            page=page,
            limit=limit,
            rating=rating,
            rating_min=rating_min,
            rating_max=rating_max,
            flag=flag,
            color_label=color_label,
            color_labels=parsed_color_labels,
            unrated=unrated,
            has_rating=has_rating,
            sub_gallery_id=UUID(sub_gallery_id) if sub_gallery_id else None,
            sort_by=sort_by,
            sort_direction=sort_direction,
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


@router.get(
    "/{gallery_id}/assets/{asset_id}/metadata",
    response_model=AssetMetadataResponse,
)
async def get_asset_metadata(
    gallery_id: str,
    asset_id: str,
    workspace_id: str = Depends(get_workspace_id),
):
    """
    Get current rating, flag, and color label for an asset.

    Used by Review Mode to display current metadata state.
    """
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.get_asset_metadata(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            asset_id=UUID(asset_id),
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


@router.get(
    "/{gallery_id}/review/stats",
)
async def get_review_stats(
    gallery_id: str,
    workspace_id: str = Depends(get_workspace_id),
    sub_gallery_id: Optional[str] = Query(None),
):
    """
    Get Review Mode statistics for a gallery.

    Returns counts for:
    - Total assets
    - Assets by rating (0-5)
    - Assets by flag (pick, unflagged, reject)
    - Assets by color label
    - Unrated assets count

    Useful for showing progress indicators in the Review Mode UI.
    """
    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.get_review_stats(
            workspace_id=UUID(workspace_id),
            gallery_id=UUID(gallery_id),
            sub_gallery_id=UUID(sub_gallery_id) if sub_gallery_id else None,
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
