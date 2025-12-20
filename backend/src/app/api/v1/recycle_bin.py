"""Recycle Bin API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/recycle-bin.

Provides centralized management of soft-deleted galleries and photos.
Items are automatically permanently deleted after 30 days.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query, status

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import (
    BulkOperationResult,
    BulkRecycleBinRequest,
    BulkRecycleBinResponse,
    ErrorResponse,
    PermanentDeleteRequest,
    PermanentDeleteResponse,
    RecycleBinItemResponse,
    RecycleBinListResponse,
    RestoreItemRequest,
    RestoreItemResponse,
)
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)

router = APIRouter()

# Configuration
RETENTION_DAYS = 30  # Days until items are permanently deleted


def calculate_days_until_permanent_delete(deleted_at: datetime) -> int:
    """Calculate days remaining until auto-permanent deletion."""
    if deleted_at.tzinfo is None:
        deleted_at = deleted_at.replace(tzinfo=timezone.utc)
    expiry = deleted_at + timedelta(days=RETENTION_DAYS)
    now = datetime.now(timezone.utc)
    remaining = (expiry - now).days
    return max(0, remaining)


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
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    type_filter: Annotated[
        Literal["all", "gallery", "photo"] | None,
        Query(alias="type", description="Filter by item type"),
    ] = "all",
) -> RecycleBinListResponse:
    """List all soft-deleted items in the workspace recycle bin."""
    _, ws_id = workspace_access
    pool = await get_postgres_pool()
    offset = (page - 1) * limit

    async with pool.acquire() as conn:
        # Build queries based on filter
        if type_filter == "gallery":
            # Only deleted galleries
            count_query = """
                SELECT COUNT(*) FROM galleries
                WHERE workspace_id = $1 AND deleted_at IS NOT NULL
            """
            items_query = """
                SELECT
                    gallery_id as id,
                    'gallery' as type,
                    title as name,
                    NULL::uuid as asset_id,
                    NULL::uuid as parent_gallery_id,
                    NULL as parent_gallery_title,
                    NULL::uuid as sub_gallery_id,
                    NULL as sub_gallery_name,
                    deleted_at,
                    deleted_by_user_id
                FROM galleries
                WHERE workspace_id = $1 AND deleted_at IS NOT NULL
                ORDER BY deleted_at DESC
                LIMIT $2 OFFSET $3
            """
            total = await conn.fetchval(count_query, ws_id)
            rows = await conn.fetch(items_query, ws_id, limit, offset)

        elif type_filter == "photo":
            # Only deleted photos (gallery_assets with deleted_at set)
            count_query = """
                SELECT COUNT(*) FROM gallery_assets ga
                JOIN galleries g ON ga.gallery_id = g.gallery_id
                WHERE ga.workspace_id = $1 AND ga.deleted_at IS NOT NULL
            """
            items_query = """
                SELECT
                    ga.gallery_asset_id as id,
                    'photo' as type,
                    COALESCE(a.original_name, 'Photo') as name,
                    ga.asset_id,
                    g.gallery_id as parent_gallery_id,
                    g.title as parent_gallery_title,
                    ga.sub_gallery_id,
                    sg.name as sub_gallery_name,
                    ga.deleted_at,
                    ga.deleted_by_user_id
                FROM gallery_assets ga
                JOIN galleries g ON ga.gallery_id = g.gallery_id
                LEFT JOIN assets a ON ga.asset_id = a.asset_id
                LEFT JOIN sub_galleries sg ON ga.sub_gallery_id = sg.sub_gallery_id
                WHERE ga.workspace_id = $1 AND ga.deleted_at IS NOT NULL
                ORDER BY ga.deleted_at DESC
                LIMIT $2 OFFSET $3
            """
            total = await conn.fetchval(count_query, ws_id)
            rows = await conn.fetch(items_query, ws_id, limit, offset)

        else:
            # All deleted items (galleries + photos)
            count_query = """
                SELECT
                    (SELECT COUNT(*) FROM galleries WHERE workspace_id = $1 AND deleted_at IS NOT NULL) +
                    (SELECT COUNT(*) FROM gallery_assets WHERE workspace_id = $1 AND deleted_at IS NOT NULL)
            """
            items_query = """
                (
                    SELECT
                        gallery_id as id,
                        'gallery' as type,
                        title as name,
                        NULL::uuid as asset_id,
                        NULL::uuid as parent_gallery_id,
                        NULL as parent_gallery_title,
                        NULL::uuid as sub_gallery_id,
                        NULL as sub_gallery_name,
                        deleted_at,
                        deleted_by_user_id
                    FROM galleries
                    WHERE workspace_id = $1 AND deleted_at IS NOT NULL
                )
                UNION ALL
                (
                    SELECT
                        ga.gallery_asset_id as id,
                        'photo' as type,
                        COALESCE(a.original_name, 'Photo') as name,
                        ga.asset_id,
                        g.gallery_id as parent_gallery_id,
                        g.title as parent_gallery_title,
                        ga.sub_gallery_id,
                        sg.name as sub_gallery_name,
                        ga.deleted_at,
                        ga.deleted_by_user_id
                    FROM gallery_assets ga
                    JOIN galleries g ON ga.gallery_id = g.gallery_id
                    LEFT JOIN assets a ON ga.asset_id = a.asset_id
                    LEFT JOIN sub_galleries sg ON ga.sub_gallery_id = sg.sub_gallery_id
                    WHERE ga.workspace_id = $1 AND ga.deleted_at IS NOT NULL
                )
                ORDER BY deleted_at DESC
                LIMIT $2 OFFSET $3
            """
            total = await conn.fetchval(count_query, ws_id)
            rows = await conn.fetch(items_query, ws_id, limit, offset)

        # Convert to response items
        items = []
        for row in rows:
            items.append(
                RecycleBinItemResponse(
                    id=row["id"],
                    type=row["type"],
                    name=row["name"] or "Untitled",
                    thumbnail_url=None,  # Will be populated by frontend with signed URL
                    asset_id=row["asset_id"],
                    gallery_id=row["parent_gallery_id"],
                    gallery_title=row["parent_gallery_title"],
                    sub_gallery_id=row["sub_gallery_id"],
                    sub_gallery_name=row["sub_gallery_name"],
                    deleted_at=row["deleted_at"],
                    deleted_by_user_id=row["deleted_by_user_id"],
                    days_until_permanent_delete=calculate_days_until_permanent_delete(
                        row["deleted_at"]
                    ),
                )
            )

        total_pages = max(1, math.ceil(total / limit))

        return RecycleBinListResponse(
            items=items,
            total=total,
            page=page,
            per_page=limit,
            total_pages=total_pages,
        )


@router.post(
    "/restore",
    response_model=RestoreItemResponse,
    status_code=status.HTTP_200_OK,
    summary="Restore item from recycle bin",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Item not found"},
    },
)
async def restore_item(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: RestoreItemRequest,
) -> RestoreItemResponse:
    """Restore a soft-deleted item from the recycle bin."""
    _, ws_id = workspace_access
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        if request.item_type == "gallery":
            # Restore gallery
            result = await conn.fetchrow(
                """
                UPDATE galleries
                SET deleted_at = NULL, deleted_by_user_id = NULL, status = 'draft'
                WHERE workspace_id = $1 AND gallery_id = $2 AND deleted_at IS NOT NULL
                RETURNING gallery_id
                """,
                ws_id,
                request.item_id,
            )
            if not result:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "NOT_FOUND", "message": "Gallery not found in recycle bin"},
                )
            return RestoreItemResponse(
                success=True,
                message="Gallery restored successfully",
                restored_id=result["gallery_id"],
            )

        else:
            # Restore photo (gallery_asset)
            result = await conn.fetchrow(
                """
                UPDATE gallery_assets
                SET deleted_at = NULL, deleted_by_user_id = NULL, visible = TRUE
                WHERE workspace_id = $1 AND gallery_asset_id = $2 AND deleted_at IS NOT NULL
                RETURNING gallery_asset_id
                """,
                ws_id,
                request.item_id,
            )
            if not result:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "NOT_FOUND", "message": "Photo not found in recycle bin"},
                )
            return RestoreItemResponse(
                success=True,
                message="Photo restored successfully",
                restored_id=result["gallery_asset_id"],
            )


@router.delete(
    "/permanent",
    response_model=PermanentDeleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Permanently delete item",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Item not found"},
    },
)
async def permanent_delete(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: PermanentDeleteRequest,
) -> PermanentDeleteResponse:
    """Permanently delete an item from the recycle bin.

    This action cannot be undone. All associated files will be removed from storage.
    """
    _, ws_id = workspace_access
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        if request.item_type == "gallery":
            # Verify gallery exists in recycle bin
            gallery = await conn.fetchrow(
                """
                SELECT gallery_id FROM galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND deleted_at IS NOT NULL
                """,
                ws_id,
                request.item_id,
            )
            if not gallery:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "NOT_FOUND", "message": "Gallery not found in recycle bin"},
                )

            # Delete associated gallery_assets first (foreign key constraint)
            await conn.execute(
                """
                DELETE FROM gallery_assets
                WHERE workspace_id = $1 AND gallery_id = $2
                """,
                ws_id,
                request.item_id,
            )

            # Delete the gallery
            await conn.execute(
                """
                DELETE FROM galleries
                WHERE workspace_id = $1 AND gallery_id = $2
                """,
                ws_id,
                request.item_id,
            )

            # TODO: Delete files from R2 storage
            # This should be done via a background job queue

            return PermanentDeleteResponse(
                success=True,
                message="Gallery permanently deleted",
                files_deleted=0,  # TODO: Implement file deletion
                storage_freed=0,
            )

        else:
            # Permanently delete photo (gallery_asset)
            result = await conn.fetchrow(
                """
                DELETE FROM gallery_assets
                WHERE workspace_id = $1 AND gallery_asset_id = $2 AND deleted_at IS NOT NULL
                RETURNING gallery_asset_id
                """,
                ws_id,
                request.item_id,
            )
            if not result:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "NOT_FOUND", "message": "Photo not found in recycle bin"},
                )

            # TODO: Delete files from R2 storage
            # This should be done via a background job queue

            return PermanentDeleteResponse(
                success=True,
                message="Photo permanently deleted",
                files_deleted=0,
                storage_freed=0,
            )


@router.post(
    "/bulk-restore",
    response_model=BulkRecycleBinResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk restore items",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def bulk_restore(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkRecycleBinRequest,
) -> BulkRecycleBinResponse:
    """Restore multiple items from the recycle bin."""
    _, ws_id = workspace_access
    pool = await get_postgres_pool()
    results = []
    success_count = 0
    failure_count = 0

    async with pool.acquire() as conn:
        for item in request.items:
            try:
                if item.item_type == "gallery":
                    result = await conn.fetchrow(
                        """
                        UPDATE galleries
                        SET deleted_at = NULL, deleted_by_user_id = NULL, status = 'draft'
                        WHERE workspace_id = $1 AND gallery_id = $2 AND deleted_at IS NOT NULL
                        RETURNING gallery_id
                        """,
                        ws_id,
                        item.item_id,
                    )
                else:
                    result = await conn.fetchrow(
                        """
                        UPDATE gallery_assets
                        SET deleted_at = NULL, deleted_by_user_id = NULL, visible = TRUE
                        WHERE workspace_id = $1 AND gallery_asset_id = $2 AND deleted_at IS NOT NULL
                        RETURNING gallery_asset_id
                        """,
                        ws_id,
                        item.item_id,
                    )

                if result:
                    results.append(
                        BulkOperationResult(
                            item_id=item.item_id,
                            item_type=item.item_type,
                            success=True,
                        )
                    )
                    success_count += 1
                else:
                    results.append(
                        BulkOperationResult(
                            item_id=item.item_id,
                            item_type=item.item_type,
                            success=False,
                            error="Item not found in recycle bin",
                        )
                    )
                    failure_count += 1

            except Exception as e:
                logger.error(f"Failed to restore item {item.item_id}: {e}")
                results.append(
                    BulkOperationResult(
                        item_id=item.item_id,
                        item_type=item.item_type,
                        success=False,
                        error=str(e),
                    )
                )
                failure_count += 1

    return BulkRecycleBinResponse(
        success=failure_count == 0,
        results=results,
        success_count=success_count,
        failure_count=failure_count,
    )


@router.post(
    "/bulk-permanent-delete",
    response_model=BulkRecycleBinResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk permanently delete items",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def bulk_permanent_delete(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkRecycleBinRequest,
) -> BulkRecycleBinResponse:
    """Permanently delete multiple items from the recycle bin.

    This action cannot be undone.
    """
    _, ws_id = workspace_access
    pool = await get_postgres_pool()
    results = []
    success_count = 0
    failure_count = 0

    async with pool.acquire() as conn:
        for item in request.items:
            try:
                if item.item_type == "gallery":
                    # Check if gallery exists in recycle bin
                    gallery = await conn.fetchrow(
                        """
                        SELECT gallery_id FROM galleries
                        WHERE workspace_id = $1 AND gallery_id = $2 AND deleted_at IS NOT NULL
                        """,
                        ws_id,
                        item.item_id,
                    )
                    if gallery:
                        # Delete gallery_assets first
                        await conn.execute(
                            """
                            DELETE FROM gallery_assets
                            WHERE workspace_id = $1 AND gallery_id = $2
                            """,
                            ws_id,
                            item.item_id,
                        )
                        # Delete gallery
                        await conn.execute(
                            """
                            DELETE FROM galleries
                            WHERE workspace_id = $1 AND gallery_id = $2
                            """,
                            ws_id,
                            item.item_id,
                        )
                        results.append(
                            BulkOperationResult(
                                item_id=item.item_id,
                                item_type=item.item_type,
                                success=True,
                            )
                        )
                        success_count += 1
                    else:
                        results.append(
                            BulkOperationResult(
                                item_id=item.item_id,
                                item_type=item.item_type,
                                success=False,
                                error="Gallery not found in recycle bin",
                            )
                        )
                        failure_count += 1
                else:
                    result = await conn.fetchrow(
                        """
                        DELETE FROM gallery_assets
                        WHERE workspace_id = $1 AND gallery_asset_id = $2 AND deleted_at IS NOT NULL
                        RETURNING gallery_asset_id
                        """,
                        ws_id,
                        item.item_id,
                    )
                    if result:
                        results.append(
                            BulkOperationResult(
                                item_id=item.item_id,
                                item_type=item.item_type,
                                success=True,
                            )
                        )
                        success_count += 1
                    else:
                        results.append(
                            BulkOperationResult(
                                item_id=item.item_id,
                                item_type=item.item_type,
                                success=False,
                                error="Photo not found in recycle bin",
                            )
                        )
                        failure_count += 1

            except Exception as e:
                logger.error(f"Failed to permanently delete item {item.item_id}: {e}")
                results.append(
                    BulkOperationResult(
                        item_id=item.item_id,
                        item_type=item.item_type,
                        success=False,
                        error=str(e),
                    )
                )
                failure_count += 1

    return BulkRecycleBinResponse(
        success=failure_count == 0,
        results=results,
        success_count=success_count,
        failure_count=failure_count,
    )
