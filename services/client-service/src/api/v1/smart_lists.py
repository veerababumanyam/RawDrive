"""
Smart lists API endpoints.

Provides REST API for dynamic client segmentation:
- List smart lists
- Create custom smart lists
- Update/delete smart lists
- Evaluate smart lists (get matching clients)
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from src.services.smart_list_service import SmartListService, get_smart_list_service
from src.schemas.smart_list import (
    SmartListCreate,
    SmartListUpdate,
    SmartListResponse,
    SmartListListResponse,
    SmartListEvaluationResponse,
    SYSTEM_SMART_LISTS,
)
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/clients/smart-lists",
    tags=["smart-lists"],
)


# =============================================================================
# Smart List Endpoints
# =============================================================================


@router.get("", response_model=SmartListListResponse)
async def list_smart_lists(
    workspace_id: UUID = Depends(verify_workspace_access),
    service: SmartListService = Depends(get_smart_list_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> SmartListListResponse:
    """
    List all smart lists for a workspace.

    Returns both custom smart lists and pre-built system smart lists.

    Args:
        workspace_id: Workspace ID
        service: SmartListService instance
        current_user: Current user from JWT

    Returns:
        SmartListListResponse: List of smart lists
    """
    smart_lists = await service.list_smart_lists(workspace_id=str(workspace_id))

    logger.debug(
        "Smart lists listed",
        extra={
            "workspace_id": str(workspace_id),
            "count": len(smart_lists),
        },
    )

    return SmartListListResponse(
        lists=[SmartListResponse(**sl) for sl in smart_lists],
        total=len(smart_lists),
    )


@router.post("", response_model=SmartListResponse, status_code=status.HTTP_201_CREATED)
async def create_smart_list(
    data: SmartListCreate,
    workspace_id: UUID = Depends(verify_workspace_access),
    service: SmartListService = Depends(get_smart_list_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> SmartListResponse:
    """
    Create a new custom smart list.

    Args:
        data: Smart list creation data
        workspace_id: Workspace ID
        service: SmartListService instance
        current_user: Current user from JWT

    Returns:
        SmartListResponse: Created smart list

    Raises:
        HTTPException: 400 if validation fails
    """
    try:
        smart_list = await service.create_smart_list(
            workspace_id=str(workspace_id),
            name=data.name,
            filters=data.filters.model_dump(),
            description=data.description,
            color=data.color,
        )

        logger.info(
            "Smart list created",
            extra={
                "list_id": str(smart_list["list_id"]),
                "workspace_id": str(workspace_id),
                "name": data.name,
                "user_id": str(current_user.user_id),
            },
        )

        return SmartListResponse(**smart_list)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="VALIDATION_ERROR",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        logger.error(
            "Smart list creation failed",
            extra={
                "workspace_id": str(workspace_id),
                "name": data.name,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="SMART_LIST_CREATION_FAILED",
                message="Failed to create smart list",
            ).model_dump(),
        )


@router.get("/{list_id}", response_model=SmartListResponse)
async def get_smart_list(
    list_id: UUID = Path(..., description="Smart list ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: SmartListService = Depends(get_smart_list_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> SmartListResponse:
    """
    Get smart list details.

    Args:
        list_id: Smart list ID
        workspace_id: Workspace ID
        service: SmartListService instance
        current_user: Current user from JWT

    Returns:
        SmartListResponse: Smart list details

    Raises:
        HTTPException: 404 if smart list not found
    """
    smart_list = await service.get_smart_list(
        workspace_id=str(workspace_id),
        list_id=str(list_id),
    )

    if not smart_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="SMART_LIST_NOT_FOUND",
                message=f"Smart list {list_id} not found",
            ).model_dump(),
        )

    return SmartListResponse(**smart_list)


@router.patch("/{list_id}", response_model=SmartListResponse)
async def update_smart_list(
    data: SmartListUpdate,
    list_id: UUID = Path(..., description="Smart list ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: SmartListService = Depends(get_smart_list_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> SmartListResponse:
    """
    Update a smart list.

    Args:
        data: Smart list update data
        list_id: Smart list ID
        workspace_id: Workspace ID
        service: SmartListService instance
        current_user: Current user from JWT

    Returns:
        SmartListResponse: Updated smart list

    Raises:
        HTTPException: 404 if smart list not found
        HTTPException: 400 if validation fails
    """
    try:
        smart_list = await service.update_smart_list(
            workspace_id=str(workspace_id),
            list_id=str(list_id),
            name=data.name,
            description=data.description,
            filters=data.filters.model_dump() if data.filters else None,
            color=data.color,
        )

        if not smart_list:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(
                    error="SMART_LIST_NOT_FOUND",
                    message=f"Smart list {list_id} not found",
                ).model_dump(),
            )

        logger.info(
            "Smart list updated",
            extra={
                "list_id": str(list_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return SmartListResponse(**smart_list)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="VALIDATION_ERROR",
                message=str(e),
            ).model_dump(),
        )


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_smart_list(
    list_id: UUID = Path(..., description="Smart list ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: SmartListService = Depends(get_smart_list_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> None:
    """
    Delete a smart list.

    Args:
        list_id: Smart list ID
        workspace_id: Workspace ID
        service: SmartListService instance
        current_user: Current user from JWT

    Raises:
        HTTPException: 404 if smart list not found
    """
    deleted = await service.delete_smart_list(
        workspace_id=str(workspace_id),
        list_id=str(list_id),
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="SMART_LIST_NOT_FOUND",
                message=f"Smart list {list_id} not found",
            ).model_dump(),
        )

    logger.info(
        "Smart list deleted",
        extra={
            "list_id": str(list_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return None


# =============================================================================
# Smart List Evaluation
# =============================================================================


@router.get("/{list_id}/evaluate", response_model=SmartListEvaluationResponse)
async def evaluate_smart_list(
    list_id: UUID = Path(..., description="Smart list ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    service: SmartListService = Depends(get_smart_list_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> SmartListEvaluationResponse:
    """
    Evaluate smart list and return matching clients.

    Args:
        list_id: Smart list ID
        workspace_id: Workspace ID
        page: Page number
        limit: Items per page
        service: SmartListService instance
        current_user: Current user from JWT

    Returns:
        SmartListEvaluationResponse: Matching clients

    Raises:
        HTTPException: 404 if smart list not found
    """
    result = await service.evaluate_smart_list(
        workspace_id=str(workspace_id),
        list_id=str(list_id),
        page=page,
        limit=limit,
    )

    if result["total"] == 0 and result["list_name"] == "Unknown":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="SMART_LIST_NOT_FOUND",
                message=f"Smart list {list_id} not found",
            ).model_dump(),
        )

    logger.debug(
        "Smart list evaluated",
        extra={
            "list_id": str(list_id),
            "workspace_id": str(workspace_id),
            "matches": result["total"],
            "page": page,
        },
    )

    return SmartListEvaluationResponse(**result)
