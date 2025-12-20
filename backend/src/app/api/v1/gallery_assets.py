"""Gallery Assets API endpoints.

Handles listing and managing assets within galleries.
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status, Body, Path
from pydantic import BaseModel

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep, CurrentUser
from app.api.schemas import ErrorResponse
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)

router = APIRouter()


class UpdateSortOrderRequest(BaseModel):
    """Request to update sort order for gallery assets."""
    asset_ids: list[UUID] = Body(..., description="List of asset IDs in new order")


class MoveAssetsRequest(BaseModel):
    """Request to move assets to a sub-gallery."""
    asset_ids: list[UUID] = Body(..., description="List of asset IDs to move")
    sub_gallery_id: UUID | None = Body(None, description="Sub-gallery ID (null for root gallery)")


class DeleteAssetsRequest(BaseModel):
    """Request to delete assets."""
    asset_ids: list[UUID] = Body(..., description="List of asset IDs to delete")


class ToggleFavoriteRequest(BaseModel):
    """Request to toggle favorite status for gallery assets."""
    asset_ids: list[UUID] = Body(..., description="List of asset IDs to toggle")
    favorited: bool = Body(..., description="True to favorite, False to unfavorite")


class ToggleSelectionRequest(BaseModel):
    """Request to toggle selection status for gallery assets."""
    asset_ids: list[UUID] = Body(..., description="List of asset IDs to toggle")
    selected: bool = Body(..., description="True to select, False to deselect")


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    summary="List gallery assets",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def list_gallery_assets(
    workspace_access: WorkspaceAccessDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    current_user: CurrentUserDep,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    sub_gallery_id: str | None = Query(None, description="Filter by sub-gallery"),
    picks_only: bool = Query(False, description="Filter picks (selected) only"),
    favorites_only: bool = Query(False, description="Filter favorites only"),
    selections_only: bool = Query(False, description="Filter selections only"),
    search_query: str | None = Query(None, description="Search by filename"),
) -> dict:
    """List assets in a gallery with pagination and filtering."""
    # Extract workspace_id from workspace_access tuple
    _, workspace_id = workspace_access
    
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Verify gallery exists and user has access
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2
            """,
            workspace_id,
            gallery_id,
        )
        
        if not gallery:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "GALLERY_NOT_FOUND", "message": "Gallery not found"},
            )
        
        # Build query with filters
        offset = (page - 1) * limit
        where_conditions = [
            "ga.workspace_id = $1",
            "ga.gallery_id = $2",
            "ga.visible = TRUE",
            "a.status = 'available'",
        ]
        params = [workspace_id, gallery_id]
        param_idx = 3
        
        if sub_gallery_id:
            where_conditions.append(f"ga.sub_gallery_id = ${param_idx}")
            params.append(UUID(sub_gallery_id))
            param_idx += 1
        elif sub_gallery_id is not None and sub_gallery_id == "":
            # Empty string means root gallery (no sub-gallery)
            where_conditions.append("ga.sub_gallery_id IS NULL")
        
        if picks_only or selections_only:
            # is_selected is computed from client_interactions, use EXISTS subquery
            where_conditions.append("""
                EXISTS (
                    SELECT 1 FROM client_interactions ci
                    WHERE ci.workspace_id = ga.workspace_id
                    AND ci.gallery_id = ga.gallery_id
                    AND ci.asset_id = ga.asset_id
                    AND ci.type = 'select'
                )
            """)
        
        if favorites_only:
            # is_favorited is computed from client_interactions, use EXISTS subquery
            where_conditions.append("""
                EXISTS (
                    SELECT 1 FROM client_interactions ci
                    WHERE ci.workspace_id = ga.workspace_id
                    AND ci.gallery_id = ga.gallery_id
                    AND ci.asset_id = ga.asset_id
                    AND ci.type = 'favorite'
                )
            """)
        
        if search_query:
            # Search by filename extracted from original_object_key (case-insensitive)
            where_conditions.append(f"LOWER(SUBSTRING(a.original_object_key FROM '[^/]+$')) LIKE ${param_idx}")
            params.append(f"%{search_query.lower()}%")
            param_idx += 1
        
        where_sql = " AND ".join(where_conditions)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*)
            FROM gallery_assets ga
            INNER JOIN assets a ON ga.asset_id = a.asset_id
            WHERE {where_sql}
        """
        total = await conn.fetchval(count_query, *params)
        
        # Get assets with pagination
        # Note: is_favorited, is_selected, and favorites_count are computed from client_interactions
        # Add limit and offset to params first, then use their indices
        params.append(limit)
        params.append(offset)
        limit_param_num = len(params) - 1  # asyncpg uses 1-indexed parameters
        offset_param_num = len(params)      # offset is the last parameter
        
        # Build query with correct parameter numbers
        assets_query = f"""
            SELECT
                ga.gallery_asset_id,
                ga.asset_id,
                ga.sort_order,
                ga.visible,
                ga.is_private,
                ga.sub_gallery_id,
                EXISTS (
                    SELECT 1 FROM client_interactions ci
                    WHERE ci.workspace_id = ga.workspace_id
                    AND ci.gallery_id = ga.gallery_id
                    AND ci.asset_id = ga.asset_id
                    AND ci.type = 'favorite'
                ) AS is_favorited,
                EXISTS (
                    SELECT 1 FROM client_interactions ci
                    WHERE ci.workspace_id = ga.workspace_id
                    AND ci.gallery_id = ga.gallery_id
                    AND ci.asset_id = ga.asset_id
                    AND ci.type = 'select'
                ) AS is_selected,
                (
                    SELECT COUNT(*) FROM client_interactions ci
                    WHERE ci.workspace_id = ga.workspace_id
                    AND ci.gallery_id = ga.gallery_id
                    AND ci.asset_id = ga.asset_id
                    AND ci.type = 'favorite'
                ) AS favorites_count,
                a.type,
                a.status,
                a.mime_type,
                SUBSTRING(a.original_object_key FROM '[^/]+$') AS filename,
                (a.exif->>'width')::INTEGER AS width,
                (a.exif->>'height')::INTEGER AS height,
                (a.exif->>'duration_ms')::INTEGER AS duration_ms,
                (a.exif->>'date_taken')::TIMESTAMPTZ AS date_taken,
                a.exif
            FROM gallery_assets ga
            INNER JOIN assets a ON ga.asset_id = a.asset_id
            WHERE {where_sql}
            ORDER BY ga.sort_order ASC, ga.gallery_asset_id ASC
            LIMIT ${limit_param_num} OFFSET ${offset_param_num}
        """
        
        assets = await conn.fetch(assets_query, *params)
        
        # Format response
        assets_data = []
        for row in assets:
            asset_data = {
                "gallery_asset_id": str(row["gallery_asset_id"]),
                "asset_id": str(row["asset_id"]),
                "sort_order": row["sort_order"],
                "visible": row["visible"],
                "is_private": row["is_private"],
                "sub_gallery_id": str(row["sub_gallery_id"]) if row["sub_gallery_id"] else None,
                "is_favorited": row["is_favorited"],
                "is_selected": row["is_selected"],
                "favorites_count": row["favorites_count"] or 0,
                "asset": {
                    "type": row["type"],
                    "status": row["status"],
                    "mime_type": row["mime_type"],
                    "filename": row["filename"] or "",
                    "width": row["width"],
                    "height": row["height"],
                    "duration_ms": row["duration_ms"],
                    "date_taken": row["date_taken"].isoformat() if row["date_taken"] else None,
                    "exif": row["exif"],
                },
            }
            assets_data.append(asset_data)
        
        return {
            "data": assets_data,
            "meta": {
                "page": page,
                "limit": limit,
                "total": total,
                "hasMore": (offset + limit) < total,
            },
        }


@router.patch(
    "/sort-order",
    status_code=status.HTTP_200_OK,
    summary="Update gallery assets sort order",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def update_sort_order(
    workspace_access: WorkspaceAccessDep,
    gallery_id: UUID,
    current_user: CurrentUserDep,
    request: UpdateSortOrderRequest,
) -> dict:
    """Update sort order for gallery assets."""
    _, workspace_id = workspace_access
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Verify gallery exists and user has access
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2
            """,
            workspace_id,
            gallery_id,
        )
        
        if not gallery:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "GALLERY_NOT_FOUND", "message": "Gallery not found"},
            )
        
        # Verify all assets belong to this gallery
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )
        
        if asset_count != len(request.asset_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_ASSETS", "message": "Some assets do not belong to this gallery"},
            )
        
        # Update sort_order for each asset
        for index, asset_id in enumerate(request.asset_ids):
            await conn.execute(
                """
                UPDATE gallery_assets
                SET sort_order = $1
                WHERE workspace_id = $2 AND gallery_id = $3 AND asset_id = $4
                """,
                index,
                workspace_id,
                gallery_id,
                asset_id,
            )
        
        return {"message": "Sort order updated successfully"}


@router.patch(
    "/move",
    status_code=status.HTTP_200_OK,
    summary="Move gallery assets to sub-gallery",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery or sub-gallery not found"},
    },
)
async def move_assets(
    workspace_access: WorkspaceAccessDep,
    gallery_id: UUID,
    current_user: CurrentUserDep,
    request: MoveAssetsRequest,
) -> dict:
    """Move assets to a sub-gallery (or root gallery)."""
    _, workspace_id = workspace_access
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Verify gallery exists and user has access
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2
            """,
            workspace_id,
            gallery_id,
        )
        
        if not gallery:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "GALLERY_NOT_FOUND", "message": "Gallery not found"},
            )
        
        # Verify sub-gallery exists if provided
        if request.sub_gallery_id:
            sub_gallery = await conn.fetchrow(
                """
                SELECT sub_gallery_id FROM sub_galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3
                """,
                workspace_id,
                gallery_id,
                request.sub_gallery_id,
            )
            
            if not sub_gallery:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "SUB_GALLERY_NOT_FOUND", "message": "Sub-gallery not found"},
                )
        
        # Verify all assets belong to this gallery
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )
        
        if asset_count != len(request.asset_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_ASSETS", "message": "Some assets do not belong to this gallery"},
            )
        
        # Update sub_gallery_id for each asset
        for asset_id in request.asset_ids:
            await conn.execute(
                """
                UPDATE gallery_assets
                SET sub_gallery_id = $1
                WHERE workspace_id = $2 AND gallery_id = $3 AND asset_id = $4
                """,
                request.sub_gallery_id,
                workspace_id,
                gallery_id,
                asset_id,
            )
        
        return {"message": f"Moved {len(request.asset_ids)} asset(s) successfully"}


@router.delete(
    "",
    status_code=status.HTTP_200_OK,
    summary="Delete gallery assets",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def delete_assets(
    workspace_access: WorkspaceAccessDep,
    gallery_id: UUID,
    current_user: CurrentUserDep,
    request: DeleteAssetsRequest,
) -> dict:
    """Soft delete assets from gallery (set visible = FALSE)."""
    _, workspace_id = workspace_access
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Verify gallery exists and user has access
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2
            """,
            workspace_id,
            gallery_id,
        )
        
        if not gallery:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "GALLERY_NOT_FOUND", "message": "Gallery not found"},
            )
        
        # Verify all assets belong to this gallery
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )
        
        if asset_count != len(request.asset_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_ASSETS", "message": "Some assets do not belong to this gallery"},
            )
        
        # Soft delete assets (set visible = FALSE and record deletion time)
        await conn.execute(
            """
            UPDATE gallery_assets
            SET visible = FALSE, deleted_at = NOW(), deleted_by_user_id = $4
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
            current_user.user_id,
        )

        return {"message": f"Deleted {len(request.asset_ids)} asset(s) successfully"}


@router.patch(
    "/restore",
    status_code=status.HTTP_200_OK,
    summary="Restore deleted gallery assets",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def restore_assets(
    workspace_access: WorkspaceAccessDep,
    gallery_id: UUID,
    current_user: CurrentUserDep,
    request: DeleteAssetsRequest,  # Reuse same request model
) -> dict:
    """Restore soft-deleted assets (set visible = TRUE)."""
    _, workspace_id = workspace_access
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Verify gallery exists and user has access
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2
            """,
            workspace_id,
            gallery_id,
        )
        
        if not gallery:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "GALLERY_NOT_FOUND", "message": "Gallery not found"},
            )
        
        # Verify all assets belong to this gallery
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )
        
        if asset_count != len(request.asset_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_ASSETS", "message": "Some assets do not belong to this gallery"},
            )
        
        # Restore assets (set visible = TRUE and clear deletion info)
        await conn.execute(
            """
            UPDATE gallery_assets
            SET visible = TRUE, deleted_at = NULL, deleted_by_user_id = NULL
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )

        return {"message": f"Restored {len(request.asset_ids)} asset(s) successfully"}


@router.patch(
    "/favorite",
    status_code=status.HTTP_200_OK,
    summary="Toggle favorite status for gallery assets",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def toggle_favorite(
    workspace_access: WorkspaceAccessDep,
    gallery_id: UUID,
    current_user: CurrentUserDep,
    request: ToggleFavoriteRequest,
) -> dict:
    """Toggle favorite status for gallery assets."""
    _, workspace_id = workspace_access
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Verify gallery exists and user has access
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2
            """,
            workspace_id,
            gallery_id,
        )
        
        if not gallery:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "GALLERY_NOT_FOUND", "message": "Gallery not found"},
            )
        
        # Verify all assets belong to this gallery
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )
        
        if asset_count != len(request.asset_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_ASSETS", "message": "Some assets do not belong to this gallery"},
            )
        
        # Update favorite status
        await conn.execute(
            """
            UPDATE gallery_assets
            SET is_favorited = $1
            WHERE workspace_id = $2 AND gallery_id = $3 AND asset_id = ANY($4::uuid[])
            """,
            request.favorited,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )
        
        # Note: favorites_count is typically a gallery-level aggregate stat
        # For individual asset favorites, we just update is_favorited flag
        # If favorites_count needs to be maintained per asset, it should be calculated
        # from a separate favorites table or updated via triggers
        
        action = "favorited" if request.favorited else "unfavorited"
        return {"message": f"{action.capitalize()} {len(request.asset_ids)} asset(s) successfully"}


@router.patch(
    "/selection",
    status_code=status.HTTP_200_OK,
    summary="Toggle selection status for gallery assets",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def toggle_selection(
    workspace_access: WorkspaceAccessDep,
    gallery_id: UUID,
    current_user: CurrentUserDep,
    request: ToggleSelectionRequest,
) -> dict:
    """Toggle selection (pick) status for gallery assets."""
    _, workspace_id = workspace_access
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Verify gallery exists and user has access
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2
            """,
            workspace_id,
            gallery_id,
        )
        
        if not gallery:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "GALLERY_NOT_FOUND", "message": "Gallery not found"},
            )
        
        # Verify all assets belong to this gallery
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )
        
        if asset_count != len(request.asset_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_ASSETS", "message": "Some assets do not belong to this gallery"},
            )
        
        # Update selection status
        await conn.execute(
            """
            UPDATE gallery_assets
            SET is_selected = $1
            WHERE workspace_id = $2 AND gallery_id = $3 AND asset_id = ANY($4::uuid[])
            """,
            request.selected,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )
        
        action = "selected" if request.selected else "deselected"
        return {"message": f"{action.capitalize()} {len(request.asset_ids)} asset(s) successfully"}

