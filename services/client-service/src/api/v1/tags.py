"""
Tag CRUD and assignment API endpoints.

Provides REST API for workspace-scoped tag management and client-tag assignments.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Path, status

from src.services.tag_service import TagService, get_tag_service
from src.schemas.tag import (
    TagCreate,
    TagUpdate,
    TagResponse,
    TagListResponse,
    TagAssignRequest,
    TagUnassignRequest,
)
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["tags"])


# =============================================================================
# Tag CRUD Endpoints
# =============================================================================


@router.get("/tags", response_model=TagListResponse)
async def list_tags(
    workspace_id: UUID = Depends(verify_workspace_access),
    search: Optional[str] = Query(None, description="Search tags by name"),
    service: TagService = Depends(get_tag_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> TagListResponse:
    """
    List all tags in a workspace.

    Args:
        workspace_id: Workspace ID
        search: Optional search query
        service: TagService instance
        current_user: Current user from JWT

    Returns:
        TagListResponse: List of tags with client counts
    """
    tags = await service.list_tags(
        workspace_id=str(workspace_id),
        search=search,
    )

    logger.debug(
        "Tags listed",
        extra={
            "workspace_id": str(workspace_id),
            "count": len(tags),
        },
    )

    return TagListResponse(tags=[TagResponse(**t) for t in tags])


@router.post("/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    data: TagCreate,
    workspace_id: UUID = Depends(verify_workspace_access),
    service: TagService = Depends(get_tag_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> TagResponse:
    """
    Create a new tag.

    Args:
        data: Tag creation data
        workspace_id: Workspace ID
        service: TagService instance
        current_user: Current user from JWT

    Returns:
        TagResponse: Created tag

    Raises:
        HTTPException: 400 if tag name already exists or validation fails
    """
    try:
        tag = await service.create_tag(
            workspace_id=str(workspace_id),
            data=data,
        )

        logger.info(
            "Tag created",
            extra={
                "tag_id": str(tag["tag_id"]),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return TagResponse(**tag)

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
            "Tag creation failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="TAG_CREATION_FAILED",
                message="Failed to create tag",
            ).model_dump(),
        )


@router.get("/tags/{tag_id}", response_model=TagResponse)
async def get_tag(
    tag_id: UUID = Path(..., description="Tag ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: TagService = Depends(get_tag_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> TagResponse:
    """
    Get tag by ID.

    Args:
        tag_id: Tag ID
        workspace_id: Workspace ID
        service: TagService instance
        current_user: Current user from JWT

    Returns:
        TagResponse: Tag details with client count

    Raises:
        HTTPException: 404 if tag not found
    """
    tag = await service.get_tag(str(workspace_id), str(tag_id))

    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TAG_NOT_FOUND",
                message=f"Tag {tag_id} not found",
            ).model_dump(),
        )

    return TagResponse(**tag)


@router.patch("/tags/{tag_id}", response_model=TagResponse)
async def update_tag(
    data: TagUpdate,
    tag_id: UUID = Path(..., description="Tag ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: TagService = Depends(get_tag_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> TagResponse:
    """
    Update tag.

    Args:
        data: Tag update data
        tag_id: Tag ID
        workspace_id: Workspace ID
        service: TagService instance
        current_user: Current user from JWT

    Returns:
        TagResponse: Updated tag

    Raises:
        HTTPException: 404 if tag not found, 400 if validation fails
    """
    try:
        tag = await service.update_tag(
            workspace_id=str(workspace_id),
            tag_id=str(tag_id),
            data=data,
        )

        if not tag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(
                    error="TAG_NOT_FOUND",
                    message=f"Tag {tag_id} not found",
                ).model_dump(),
            )

        logger.info(
            "Tag updated",
            extra={
                "tag_id": str(tag_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return TagResponse(**tag)

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
            "Tag update failed",
            extra={
                "tag_id": str(tag_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="TAG_UPDATE_FAILED",
                message="Failed to update tag",
            ).model_dump(),
        )


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: UUID = Path(..., description="Tag ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: TagService = Depends(get_tag_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> None:
    """
    Delete tag.

    This will also remove all client-tag assignments (cascade delete).

    Args:
        tag_id: Tag ID
        workspace_id: Workspace ID
        service: TagService instance
        current_user: Current user from JWT

    Raises:
        HTTPException: 404 if tag not found
    """
    deleted = await service.delete_tag(str(workspace_id), str(tag_id))

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TAG_NOT_FOUND",
                message=f"Tag {tag_id} not found",
            ).model_dump(),
        )

    logger.info(
        "Tag deleted",
        extra={
            "tag_id": str(tag_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return None


# =============================================================================
# Tag Assignment Endpoints
# =============================================================================


@router.get("/clients/{client_id}/tags", response_model=List[TagResponse])
async def get_client_tags(
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: TagService = Depends(get_tag_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> List[TagResponse]:
    """
    Get all tags assigned to a client.

    Args:
        client_id: Client ID
        workspace_id: Workspace ID
        service: TagService instance
        current_user: Current user from JWT

    Returns:
        List[TagResponse]: List of tags
    """
    tags = await service.get_client_tags(
        workspace_id=str(workspace_id),
        client_id=str(client_id),
    )

    logger.debug(
        "Client tags retrieved",
        extra={
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "tag_count": len(tags),
        },
    )

    return [TagResponse(**t) for t in tags]


@router.post("/clients/{client_id}/tags", status_code=status.HTTP_200_OK)
async def assign_tags_to_client(
    data: TagAssignRequest,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: TagService = Depends(get_tag_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> dict:
    """
    Assign tags to a client.

    Args:
        data: Tag assignment data (list of tag IDs)
        client_id: Client ID
        workspace_id: Workspace ID
        service: TagService instance
        current_user: Current user from JWT

    Returns:
        dict: Assignment result with counts

    Raises:
        HTTPException: 400 if validation fails (tag doesn't exist)
    """
    try:
        result = await service.assign_tags_to_client(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            tag_ids=[str(tid) for tid in data.tag_ids],
        )

        logger.info(
            "Tags assigned to client",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "tag_count": len(data.tag_ids),
            },
        )

        return result

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
            "Tag assignment failed",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="TAG_ASSIGNMENT_FAILED",
                message="Failed to assign tags",
            ).model_dump(),
        )


@router.delete("/clients/{client_id}/tags", status_code=status.HTTP_200_OK)
async def unassign_tags_from_client(
    data: TagUnassignRequest,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: TagService = Depends(get_tag_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> dict:
    """
    Unassign tags from a client.

    Args:
        data: Tag unassignment data (list of tag IDs)
        client_id: Client ID
        workspace_id: Workspace ID
        service: TagService instance
        current_user: Current user from JWT

    Returns:
        dict: Unassignment result with counts
    """
    result = await service.unassign_tags_from_client(
        workspace_id=str(workspace_id),
        client_id=str(client_id),
        tag_ids=[str(tid) for tid in data.tag_ids],
    )

    logger.info(
        "Tags unassigned from client",
        extra={
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "tag_count": len(data.tag_ids),
        },
    )

    return result
