"""Recycle Bin API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/recycle-bin.

Provides endpoints for:
- Listing soft-deleted galleries and photos
- Restoring items from recycle bin
- Permanently deleting items
- Bulk operations

Requirements: 2.7, 3.1, 4.1, 7.1-7.5, 10.2-10.4
"""

from __future__ import annotations

import logging
from typing import Annotated, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query, Request, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse
from app.config.deletion import get_deletion_settings
from app.services.deletion_service import (
    DeletionError,
    DeletionInProgressError,
    EntityNotFoundError,
    NotDeletedError,
    WorkspaceAccessError,
    get_deletion_service,
)
from app.services.recycle_bin_service import (
    NameConflictError,
    ParentNotFoundError,
    get_recycle_bin_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class RecycleBinItemResponse(BaseModel):
    """A single item in the recycle bin."""

    id: str = Field(..., description="Item ID (gallery_id or asset_id)")
    type: Literal["gallery", "photo"] = Field(..., description="Item type")
    name: str = Field(..., description="Item name (title for gallery, filename for photo)")
    deleted_at: str = Field(
        ..., description="ISO timestamp when deleted", serialization_alias="deletedAt"
    )
    days_until_permanent_delete: int = Field(
        ...,
        description="Days remaining before auto-deletion",
        serialization_alias="daysUntilPermanentDelete",
    )
    photo_count: Optional[int] = Field(
        None, description="Number of photos (galleries only)", serialization_alias="photoCount"
    )
    thumbnail_url: Optional[str] = Field(
        None, description="Thumbnail URL (photos only)", serialization_alias="thumbnailUrl"
    )
    original_bytes: Optional[int] = Field(
        None, description="File size in bytes (photos only)", serialization_alias="originalBytes"
    )
    parent_gallery_id: Optional[str] = Field(
        None, description="Parent gallery ID (photos only)", serialization_alias="parentGalleryId"
    )
    deleted: bool = Field(True, description="Always true for recycle bin items")
    delete_status: Optional[str] = Field(
        None, description="Deletion status", serialization_alias="deleteStatus"
    )


class RecycleBinListResponse(BaseModel):
    """Response for listing recycle bin items."""

    items: list[RecycleBinItemResponse]
    meta: dict


class RestoreRequest(BaseModel):
    """Request to restore an item from recycle bin."""

    item_id: UUID = Field(..., description="ID of item to restore")
    item_type: Literal["gallery", "photo"] = Field(..., description="Type of item")
    new_name: Optional[str] = Field(
        None, max_length=200, description="New name if conflict exists (galleries only)"
    )


class RestoreResponse(BaseModel):
    """Response after restoring an item."""

    success: bool
    message: str
    entity_id: str
    entity_type: str
    new_name: Optional[str] = Field(None, description="New name if changed due to conflict")


class PermanentDeleteRequest(BaseModel):
    """Request to permanently delete an item."""

    item_id: UUID = Field(..., description="ID of item to delete")
    item_type: Literal["gallery", "photo"] = Field(..., description="Type of item")


class PermanentDeleteResponse(BaseModel):
    """Response after permanent deletion."""

    success: bool
    message: str
    files_deleted: int
    storage_freed: int  # bytes
    storage_freed_formatted: str


class BulkOperationItem(BaseModel):
    """Single item for bulk operations."""

    item_id: UUID
    item_type: Literal["gallery", "photo"]


class BulkRestoreRequest(BaseModel):
    """Request for bulk restore operation."""

    items: list[BulkOperationItem] = Field(..., min_length=1, max_length=100)


class BulkPermanentDeleteRequest(BaseModel):
    """Request for bulk permanent delete operation."""

    items: list[BulkOperationItem] = Field(..., min_length=1, max_length=100)


class BulkOperationResultItem(BaseModel):
    """Result for a single item in bulk operation."""

    item_id: str
    item_type: str
    success: bool
    error: Optional[str] = None


class BulkOperationResponse(BaseModel):
    """Response for bulk operations."""

    success: bool
    results: list[BulkOperationResultItem]
    success_count: int
    failure_count: int
    total_storage_freed: Optional[int] = None  # For permanent delete


class DeletionInfoResponse(BaseModel):
    """Response with deletion info for confirmation dialogs."""

    photo_count: int
    requires_name_confirmation: bool
    name_confirmation_threshold: int


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def format_bytes(size: int) -> str:
    """Format bytes to human-readable string."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} PB"


def get_client_info(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Extract client IP and user agent from request."""
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return ip_address, user_agent


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=RecycleBinListResponse,
    status_code=status.HTTP_200_OK,
    summary="List recycle bin items",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_recycle_bin(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    item_type: Annotated[
        Optional[Literal["gallery", "photo"]],
        Query(alias="type", description="Filter by item type"),
    ] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> RecycleBinListResponse:
    """List all soft-deleted items in the workspace's recycle bin.

    Requirement 2.7: WHEN a photographer accesses the Recycle Bin THEN the system
    SHALL display all soft-deleted galleries and photos for that photographer's workspace.
    """
    service = get_recycle_bin_service()
    try:
        result = await service.list_recycle_bin_items(
            workspace_id=workspace_id,
            item_type=item_type,
            page=page,
            limit=limit,
        )
        return RecycleBinListResponse(
            items=[RecycleBinItemResponse(**item) for item in result["items"]],
            meta=result["meta"],
        )
    except Exception as e:
        logger.exception("Failed to list recycle bin")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to list recycle bin"},
        )


@router.post(
    "/restore",
    response_model=RestoreResponse,
    status_code=status.HTTP_200_OK,
    summary="Restore item from recycle bin",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request or parent not found"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Item not found"},
        409: {"model": ErrorResponse, "description": "Name conflict"},
    },
)
async def restore_item(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request_obj: RestoreRequest,
    request: Request,
) -> RestoreResponse:
    """Restore a gallery or photo from the recycle bin.

    Requirement 3.1: WHEN a photographer restores a gallery from the Recycle Bin
    THEN the system SHALL validate that the original parent still exists.
    """
    service = get_recycle_bin_service()
    ip_address, user_agent = get_client_info(request)

    try:
        if request_obj.item_type == "gallery":
            result = await service.restore_gallery(
                workspace_id=workspace_id,
                gallery_id=request_obj.item_id,
                user_id=current_user.user_id,
                new_name=request_obj.new_name,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        else:
            result = await service.restore_photo(
                workspace_id=workspace_id,
                asset_id=request_obj.item_id,
                user_id=current_user.user_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )

        return RestoreResponse(
            success=True,
            message=f"{request_obj.item_type.capitalize()} restored successfully",
            entity_id=str(result.entity_id),
            entity_type=result.entity_type,
            new_name=result.new_name,
        )

    except NameConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "NAME_CONFLICT",
                "message": str(e),
                "conflicting_name": e.conflicting_name,
            },
        )
    except ParentNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code, "message": str(e)},
        )
    except NotDeletedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code, "message": str(e)},
        )
    except EntityNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": e.code, "message": str(e)},
        )
    except WorkspaceAccessError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": e.code, "message": str(e)},
        )
    except DeletionError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )
    except Exception as e:
        logger.exception("Failed to restore item")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to restore item"},
        )


@router.delete(
    "/permanent",
    response_model=PermanentDeleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Permanently delete item",
    responses={
        400: {"model": ErrorResponse, "description": "Item not in recycle bin"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Item not found"},
        409: {"model": ErrorResponse, "description": "Deletion already in progress"},
    },
)
async def permanent_delete_item(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request_obj: PermanentDeleteRequest,
    request: Request,
) -> PermanentDeleteResponse:
    """Permanently delete a gallery or photo from the recycle bin.

    Requirement 4.1: WHEN a photographer initiates permanent deletion from the
    Recycle Bin THEN the system SHALL display a confirmation dialog warning
    about irreversibility.
    """
    service = get_deletion_service()
    ip_address, user_agent = get_client_info(request)

    try:
        if request_obj.item_type == "gallery":
            result = await service.permanent_delete_gallery(
                workspace_id=workspace_id,
                gallery_id=request_obj.item_id,
                user_id=current_user.user_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        else:
            result = await service.permanent_delete_photo(
                workspace_id=workspace_id,
                asset_id=request_obj.item_id,
                user_id=current_user.user_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )

        if result.success:
            return PermanentDeleteResponse(
                success=True,
                message=f"{request_obj.item_type.capitalize()} permanently deleted",
                files_deleted=result.files_deleted,
                storage_freed=result.storage_freed,
                storage_freed_formatted=format_bytes(result.storage_freed),
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "code": "DELETION_FAILED",
                    "message": "Permanent deletion failed",
                    "errors": result.errors,
                },
            )

    except DeletionInProgressError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": e.code, "message": str(e)},
        )
    except NotDeletedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code, "message": str(e)},
        )
    except EntityNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": e.code, "message": str(e)},
        )
    except WorkspaceAccessError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": e.code, "message": str(e)},
        )
    except DeletionError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )
    except Exception as e:
        logger.exception("Failed to permanently delete item")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to permanently delete item"},
        )


@router.post(
    "/bulk-restore",
    response_model=BulkOperationResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk restore items",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def bulk_restore(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request_obj: BulkRestoreRequest,
    request: Request,
) -> BulkOperationResponse:
    """Restore multiple items from the recycle bin.

    Requirement 7.1: WHEN a photographer selects multiple items in the Recycle Bin
    THEN the system SHALL enable bulk restore action.

    Requirement 7.3: WHEN bulk restore is initiated THEN the system SHALL validate
    and restore each item individually.

    Requirement 7.5: WHEN bulk operations complete THEN the system SHALL report
    success and failure counts for each item processed.
    """
    service = get_recycle_bin_service()
    ip_address, user_agent = get_client_info(request)

    results: list[BulkOperationResultItem] = []
    success_count = 0
    failure_count = 0

    for item in request_obj.items:
        try:
            if item.item_type == "gallery":
                await service.restore_gallery(
                    workspace_id=workspace_id,
                    gallery_id=item.item_id,
                    user_id=current_user.user_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            else:
                await service.restore_photo(
                    workspace_id=workspace_id,
                    asset_id=item.item_id,
                    user_id=current_user.user_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )

            results.append(
                BulkOperationResultItem(
                    item_id=str(item.item_id),
                    item_type=item.item_type,
                    success=True,
                )
            )
            success_count += 1

        except Exception as e:
            error_msg = str(e) if isinstance(e, DeletionError) else "Restore failed"
            results.append(
                BulkOperationResultItem(
                    item_id=str(item.item_id),
                    item_type=item.item_type,
                    success=False,
                    error=error_msg,
                )
            )
            failure_count += 1

    return BulkOperationResponse(
        success=failure_count == 0,
        results=results,
        success_count=success_count,
        failure_count=failure_count,
    )


@router.post(
    "/bulk-permanent-delete",
    response_model=BulkOperationResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk permanent delete items",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def bulk_permanent_delete(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request_obj: BulkPermanentDeleteRequest,
    request: Request,
) -> BulkOperationResponse:
    """Permanently delete multiple items from the recycle bin.

    Requirement 7.2: WHEN a photographer selects multiple items in the Recycle Bin
    THEN the system SHALL enable bulk permanent delete action.

    Requirement 7.4: WHEN bulk permanent delete is initiated THEN the system SHALL
    display a confirmation dialog with the count of items to be deleted.
    """
    service = get_deletion_service()
    ip_address, user_agent = get_client_info(request)

    results: list[BulkOperationResultItem] = []
    success_count = 0
    failure_count = 0
    total_storage_freed = 0

    for item in request_obj.items:
        try:
            if item.item_type == "gallery":
                result = await service.permanent_delete_gallery(
                    workspace_id=workspace_id,
                    gallery_id=item.item_id,
                    user_id=current_user.user_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            else:
                result = await service.permanent_delete_photo(
                    workspace_id=workspace_id,
                    asset_id=item.item_id,
                    user_id=current_user.user_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )

            if result.success:
                results.append(
                    BulkOperationResultItem(
                        item_id=str(item.item_id),
                        item_type=item.item_type,
                        success=True,
                    )
                )
                success_count += 1
                total_storage_freed += result.storage_freed
            else:
                results.append(
                    BulkOperationResultItem(
                        item_id=str(item.item_id),
                        item_type=item.item_type,
                        success=False,
                        error="; ".join(result.errors) if result.errors else "Deletion failed",
                    )
                )
                failure_count += 1

        except Exception as e:
            error_msg = str(e) if isinstance(e, DeletionError) else "Deletion failed"
            results.append(
                BulkOperationResultItem(
                    item_id=str(item.item_id),
                    item_type=item.item_type,
                    success=False,
                    error=error_msg,
                )
            )
            failure_count += 1

    return BulkOperationResponse(
        success=failure_count == 0,
        results=results,
        success_count=success_count,
        failure_count=failure_count,
        total_storage_freed=total_storage_freed,
    )


@router.get(
    "/deletion-info/{item_type}/{item_id}",
    response_model=DeletionInfoResponse,
    status_code=status.HTTP_200_OK,
    summary="Get deletion info for confirmation",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Item not found"},
    },
)
async def get_deletion_info(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    item_type: Annotated[Literal["gallery", "photo"], Path(..., description="Item type")],
    item_id: Annotated[UUID, Path(..., description="Item ID")],
) -> DeletionInfoResponse:
    """Get information about an item for deletion confirmation dialog.

    Requirement 1.2: WHEN a photographer initiates deletion of an important or large
    gallery THEN the system SHALL require typing the gallery name to confirm deletion.
    """
    service = get_deletion_service()
    settings = get_deletion_settings()

    try:
        if item_type == "gallery":
            photo_count = await service.get_gallery_photo_count(
                workspace_id=workspace_id,
                gallery_id=item_id,
            )
        else:
            photo_count = 1  # Single photo

        requires_name_confirmation = (
            item_type == "gallery"
            and photo_count >= settings.name_confirmation_threshold
        )

        return DeletionInfoResponse(
            photo_count=photo_count,
            requires_name_confirmation=requires_name_confirmation,
            name_confirmation_threshold=settings.name_confirmation_threshold,
        )

    except EntityNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": e.code, "message": str(e)},
        )
    except Exception as e:
        logger.exception("Failed to get deletion info")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to get deletion info"},
        )
