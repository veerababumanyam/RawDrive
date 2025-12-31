"""Gallery Assets API endpoints.

Handles listing and managing assets within galleries.
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status, Path
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse
from app.api.exceptions import NotFoundError, ValidationAppError
from app.db.postgres import get_postgres_pool
from app.services.deletion_service import get_deletion_service
from app.services.gallery_service import get_gallery_service

logger = logging.getLogger(__name__)

router = APIRouter()


class UpdateSortOrderRequest(BaseModel):
    """Request to update sort order for gallery assets."""
    asset_ids: list[UUID] = Field(..., description="List of asset IDs in new order")


class MoveAssetsRequest(BaseModel):
    """Request to move assets to a sub-gallery."""
    asset_ids: list[UUID] = Field(..., description="List of asset IDs to move")
    sub_gallery_id: UUID | None = Field(None, description="Sub-gallery ID (null for root gallery)")


class DeleteAssetsRequest(BaseModel):
    """Request to delete assets."""
    asset_ids: list[UUID] = Field(..., description="List of asset IDs to delete")


class ToggleFavoriteRequest(BaseModel):
    """Request to toggle favorite status for gallery assets."""
    asset_ids: list[UUID] = Field(..., description="List of asset IDs to toggle")
    favorited: bool = Field(..., description="True to favorite, False to unfavorite")


class ToggleSelectionRequest(BaseModel):
    """Request to toggle selection status for gallery assets."""
    asset_ids: list[UUID] = Field(..., description="List of asset IDs to toggle")
    selected: bool = Field(..., description="True to select, False to deselect")


class UpdateAssetRequest(BaseModel):
    """Request to update gallery asset metadata."""
    title: str | None = Field(None, description="Asset title", max_length=255)
    description: str | None = Field(None, description="Asset description", max_length=2000)
    is_private: bool | None = Field(None, description="Whether the asset is private/locked")


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
    face_group_ids: list[UUID] | None = Query(None, description="Filter by face groups (OR logic)"),
    tag_ids: list[UUID] | None = Query(None, description="Filter by tag IDs (OR logic)"),
    tag_source: str | None = Query(None, description="Filter by tag source (manual, ai_vision, ai_gemini, ai_local)"),
) -> dict:
    """List assets in a gallery with pagination and filtering."""
    # Extract workspace_id from workspace_access tuple
    _, workspace_id = workspace_access

    gallery_service = get_gallery_service()

    return await gallery_service.list_assets(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        page=page,
        limit=limit,
        sub_gallery_id=sub_gallery_id,
        picks_only=picks_only,
        favorites_only=favorites_only,
        selections_only=selections_only,
        search_query=search_query,
        face_group_ids=face_group_ids,
        tag_ids=tag_ids,
        tag_source=tag_source,
    )


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
        # Verify gallery exists and user has access (exclude deleted)
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
            """,
            workspace_id,
            gallery_id,
        )

        if not gallery:
            raise NotFoundError("Gallery", str(gallery_id))

        # Verify all assets belong to this gallery (exclude deleted)
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id
            WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
            AND ga.asset_id = ANY($3::uuid[]) AND a.deleted = FALSE
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )

        if asset_count != len(request.asset_ids):
            raise ValidationAppError("Some assets do not belong to this gallery", field="asset_ids")

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
        # Verify gallery exists and user has access (exclude deleted)
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
            """,
            workspace_id,
            gallery_id,
        )

        if not gallery:
            raise NotFoundError("Gallery", str(gallery_id))

        # Verify sub-gallery exists if provided (exclude deleted)
        if request.sub_gallery_id:
            sub_gallery = await conn.fetchrow(
                """
                SELECT sub_gallery_id FROM sub_galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3 AND deleted = FALSE
                """,
                workspace_id,
                gallery_id,
                request.sub_gallery_id,
            )

            if not sub_gallery:
                raise NotFoundError("Sub-gallery", str(request.sub_gallery_id))

        # Verify all assets belong to this gallery (exclude deleted)
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id
            WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
            AND ga.asset_id = ANY($3::uuid[]) AND a.deleted = FALSE
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )

        if asset_count != len(request.asset_ids):
            raise ValidationAppError("Some assets do not belong to this gallery", field="asset_ids")

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
    """Soft delete assets from gallery (moves to recycle bin).
    
    This properly soft-deletes assets by setting deleted=TRUE and deleted_at
    on the assets table, making them appear in the recycle bin.
    Also hides the gallery_asset link by setting visible=FALSE.
    """
    _, workspace_id = workspace_access
    pool = await get_postgres_pool()
    deletion_service = get_deletion_service()

    async with pool.acquire() as conn:
        # Verify gallery exists and user has access (exclude deleted)
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
            """,
            workspace_id,
            gallery_id,
        )

        if not gallery:
            raise NotFoundError("Gallery", str(gallery_id))

        # Verify all assets belong to this gallery (exclude deleted)
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id
            WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
            AND ga.asset_id = ANY($3::uuid[]) AND a.deleted = FALSE
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )

        if asset_count != len(request.asset_ids):
            raise ValidationAppError("Some assets do not belong to this gallery", field="asset_ids")

        # Hide from gallery view (set visible = FALSE)
        await conn.execute(
            """
            UPDATE gallery_assets
            SET visible = FALSE
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )

    # Soft delete assets using the deletion service (sets deleted=TRUE, deleted_at)
    # This makes them appear in the recycle bin
    results = await deletion_service.soft_delete_photos_batch(
        workspace_id=workspace_id,
        asset_ids=request.asset_ids,
        user_id=current_user.user_id,
    )
    
    deleted_count = len(results)
    return {"message": f"Deleted {deleted_count} asset(s) successfully. Items moved to recycle bin."}


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
        # Verify gallery exists and user has access (exclude deleted)
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
            """,
            workspace_id,
            gallery_id,
        )

        if not gallery:
            raise NotFoundError("Gallery", str(gallery_id))

        # Verify all assets belong to this gallery (exclude deleted assets)
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id
            WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
            AND ga.asset_id = ANY($3::uuid[]) AND a.deleted = FALSE
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )

        if asset_count != len(request.asset_ids):
            raise ValidationAppError("Some assets do not belong to this gallery", field="asset_ids")

        # Restore assets (set visible = TRUE)
        await conn.execute(
            """
            UPDATE gallery_assets
            SET visible = TRUE
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
        # Verify gallery exists and user has access (exclude deleted)
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
            """,
            workspace_id,
            gallery_id,
        )

        if not gallery:
            raise NotFoundError("Gallery", str(gallery_id))

        # Verify all assets belong to this gallery (exclude deleted)
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id
            WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
            AND ga.asset_id = ANY($3::uuid[]) AND a.deleted = FALSE
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )

        if asset_count != len(request.asset_ids):
            raise ValidationAppError("Some assets do not belong to this gallery", field="asset_ids")

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
        # Verify gallery exists and user has access (exclude deleted)
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
            """,
            workspace_id,
            gallery_id,
        )

        if not gallery:
            raise NotFoundError("Gallery", str(gallery_id))

        # Verify all assets belong to this gallery (exclude deleted)
        asset_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id
            WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
            AND ga.asset_id = ANY($3::uuid[]) AND a.deleted = FALSE
            """,
            workspace_id,
            gallery_id,
            request.asset_ids,
        )

        if asset_count != len(request.asset_ids):
            raise ValidationAppError("Some assets do not belong to this gallery", field="asset_ids")
        
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


@router.patch(
    "/{asset_id}",
    status_code=status.HTTP_200_OK,
    summary="Update gallery asset metadata",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery or asset not found"},
    },
)
async def update_asset(
    workspace_access: WorkspaceAccessDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    current_user: CurrentUserDep,
    request: UpdateAssetRequest,
) -> dict:
    """Update metadata for a gallery asset (title, description, is_private)."""
    _, workspace_id = workspace_access
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        # Verify gallery exists and user has access
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
            """,
            workspace_id,
            gallery_id,
        )

        if not gallery:
            raise NotFoundError("Gallery", str(gallery_id))

        # Verify asset belongs to this gallery
        asset = await conn.fetchrow(
            """
            SELECT ga.asset_id FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id
            WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
            AND ga.asset_id = $3 AND a.deleted = FALSE
            """,
            workspace_id,
            gallery_id,
            asset_id,
        )

        if not asset:
            raise NotFoundError("Asset", str(asset_id))

        # Build update query dynamically based on provided fields
        updates = []
        params = []
        param_idx = 1

        if request.title is not None:
            updates.append(f"title = ${param_idx}")
            params.append(request.title)
            param_idx += 1

        if request.description is not None:
            updates.append(f"description = ${param_idx}")
            params.append(request.description)
            param_idx += 1

        if request.is_private is not None:
            updates.append(f"is_private = ${param_idx}")
            params.append(request.is_private)
            param_idx += 1

        if not updates:
            return {"message": "No updates provided"}

        # Add workspace_id, gallery_id, asset_id as final parameters
        params.extend([workspace_id, gallery_id, asset_id])

        await conn.execute(
            f"""
            UPDATE gallery_assets
            SET {', '.join(updates)}
            WHERE workspace_id = ${param_idx} AND gallery_id = ${param_idx + 1} AND asset_id = ${param_idx + 2}
            """,
            *params,
        )

        return {"message": "Asset updated successfully"}


class DownloadListRequest(BaseModel):
    """Request for download list with filters."""
    sub_gallery_id: UUID | None = Field(None, description="Filter by sub-gallery")
    face_group_ids: list[UUID] | None = Field(None, description="Filter by face groups (OR logic)")
    picks_only: bool = Field(False, description="Only include selected/picked assets")
    favorites_only: bool = Field(False, description="Only include favorited assets")


@router.post(
    "/download-list",
    status_code=status.HTTP_200_OK,
    summary="Get list of asset IDs for download",
    description="Returns asset IDs filtered by face groups etc. for bulk download. Use with signed URL endpoint.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_download_list(
    workspace_access: WorkspaceAccessDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    current_user: CurrentUserDep,
    request: DownloadListRequest,
) -> dict:
    """Get list of asset IDs for bulk download, optionally filtered by face groups.
    
    This endpoint returns a list of asset IDs that can be used with the 
    signed URL endpoint to download individual files. The frontend can
    use this to generate download links for all matching assets.
    
    Requirements: 17.5
    """
    _, workspace_id = workspace_access
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Verify gallery exists
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id, download_policy FROM galleries
            WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
            """,
            workspace_id,
            gallery_id,
        )
        
        if not gallery:
            raise NotFoundError("Gallery", str(gallery_id))
        
        download_policy = gallery["download_policy"]
        
        # Check download policy
        if download_policy == "view_only":
            raise ValidationAppError("Gallery does not allow downloads", field="gallery_id")
        
        # Build query with filters
        query = """
            SELECT DISTINCT a.asset_id
            FROM assets a
            JOIN gallery_assets ga ON a.asset_id = ga.asset_id
            WHERE ga.workspace_id = $1 
              AND ga.gallery_id = $2
              AND a.deleted = FALSE
              AND ga.visible = TRUE
        """
        params = [workspace_id, gallery_id]
        param_idx = 3
        
        # Sub-gallery filter
        if request.sub_gallery_id:
            query += f" AND ga.sub_gallery_id = ${param_idx}"
            params.append(request.sub_gallery_id)
            param_idx += 1
        
        # Picks (selections) filter
        if request.picks_only:
            query += " AND ga.is_selected = TRUE"
        
        # Favorites filter
        if request.favorites_only:
            query += " AND ga.is_favorited = TRUE"
        
        # Face group filter - join with faces table
        if request.face_group_ids:
            query += f"""
                AND a.asset_id IN (
                    SELECT DISTINCT f.photo_id
                    FROM faces f
                    WHERE f.workspace_id = $1
                      AND f.face_group_id = ANY(${param_idx}::uuid[])
                )
            """
            params.append(request.face_group_ids)
            param_idx += 1
        
        query += " ORDER BY a.asset_id"
        
        rows = await conn.fetch(query, *params)
        asset_ids = [row["asset_id"] for row in rows]
        
        # Determine allowed variant based on download policy
        allowed_variant = "original"
        if download_policy == "web_only":
            allowed_variant = "preview"
        elif download_policy == "watermarked_only":
            allowed_variant = "watermarked"
        
        return {
            "asset_ids": [str(aid) for aid in asset_ids],
            "total": len(asset_ids),
            "download_policy": download_policy,
            "allowed_variant": allowed_variant,
        }
