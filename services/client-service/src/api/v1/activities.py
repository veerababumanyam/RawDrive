"""
Activity timeline API endpoints.

Provides REST API for client activity tracking:
- List activities (manual + system events unified timeline)
- Create manual activities (notes, calls, meetings)
- Update/delete manual activities
- Create quick notes
"""

from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from src.services.activity_service import ActivityService, get_activity_service
from src.schemas.activity import (
    ActivityCreate,
    ActivityUpdate,
    ActivityResponse,
    ActivityListResponse,
    NoteCreate,
    ActivitySearchParams,
)
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/clients/{client_id}/activities",
    tags=["activities"],
)


# =============================================================================
# Activity Endpoints
# =============================================================================


@router.get("", response_model=ActivityListResponse)
async def list_activities(
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    activity_type: Optional[str] = Query(None, description="Filter by activity type"),
    start_date: Optional[datetime] = Query(None, description="Filter from date"),
    end_date: Optional[datetime] = Query(None, description="Filter to date"),
    related_entity_type: Optional[str] = Query(
        None, description="Filter by related entity type"
    ),
    related_entity_id: Optional[UUID] = Query(
        None, description="Filter by related entity ID"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sort order"),
    service: ActivityService = Depends(get_activity_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ActivityListResponse:
    """
    List all activities for a client.

    Returns unified timeline combining:
    - Manual activities (notes, calls, meetings)
    - System activities (status changes, tag additions, gallery views)

    Args:
        client_id: Client ID
        workspace_id: Workspace ID
        activity_type: Optional activity type filter
        start_date: Optional start date filter
        end_date: Optional end date filter
        related_entity_type: Optional related entity type filter
        related_entity_id: Optional related entity ID filter
        page: Page number
        limit: Items per page
        sort_by: Sort field
        sort_order: Sort order
        service: ActivityService instance
        current_user: Current user from JWT

    Returns:
        ActivityListResponse: Paginated activity list
    """
    result = await service.list_activities(
        workspace_id=str(workspace_id),
        client_id=str(client_id),
        activity_type=activity_type,
        start_date=start_date,
        end_date=end_date,
        related_entity_type=related_entity_type,
        related_entity_id=str(related_entity_id) if related_entity_id else None,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    logger.debug(
        "Activities listed",
        extra={
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "total": result["total"],
            "page": page,
        },
    )

    return ActivityListResponse(
        activities=[ActivityResponse(**activity) for activity in result["activities"]],
        total=result["total"],
        page=result["page"],
        limit=result["limit"],
    )


@router.post("", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    data: ActivityCreate,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ActivityService = Depends(get_activity_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ActivityResponse:
    """
    Create a new manual activity.

    Use this for recording notes, calls, meetings, and other manual events.

    Args:
        data: Activity creation data
        client_id: Client ID
        workspace_id: Workspace ID
        service: ActivityService instance
        current_user: Current user from JWT

    Returns:
        ActivityResponse: Created activity

    Raises:
        HTTPException: 400 if validation fails
    """
    try:
        activity = await service.create_activity(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            activity_type=data.activity_type,
            title=data.title,
            description=data.description,
            related_entity_type=data.related_entity_type,
            related_entity_id=(
                str(data.related_entity_id) if data.related_entity_id else None
            ),
            metadata=data.metadata,
        )

        logger.info(
            "Activity created",
            extra={
                "activity_id": str(activity["activity_id"]),
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "activity_type": data.activity_type,
                "user_id": str(current_user.user_id),
            },
        )

        return ActivityResponse(**activity)

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
            "Activity creation failed",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "activity_type": data.activity_type,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="ACTIVITY_CREATION_FAILED",
                message="Failed to create activity",
            ).model_dump(),
        )


@router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity(
    activity_id: UUID = Path(..., description="Activity ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ActivityService = Depends(get_activity_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ActivityResponse:
    """
    Get activity details.

    Args:
        activity_id: Activity ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: ActivityService instance
        current_user: Current user from JWT

    Returns:
        ActivityResponse: Activity details

    Raises:
        HTTPException: 404 if activity not found
    """
    activity = await service.get_activity(
        workspace_id=str(workspace_id),
        activity_id=str(activity_id),
    )

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="ACTIVITY_NOT_FOUND",
                message=f"Activity {activity_id} not found",
            ).model_dump(),
        )

    # Verify activity belongs to this client
    if str(activity["client_id"]) != str(client_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="ACTIVITY_NOT_FOUND",
                message=f"Activity {activity_id} not found for client {client_id}",
            ).model_dump(),
        )

    return ActivityResponse(**activity)


@router.patch("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    data: ActivityUpdate,
    activity_id: UUID = Path(..., description="Activity ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ActivityService = Depends(get_activity_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ActivityResponse:
    """
    Update a manual activity.

    Note: Only manual activities can be updated.
    System activities (from analytics_events) are immutable.

    Args:
        data: Activity update data
        activity_id: Activity ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: ActivityService instance
        current_user: Current user from JWT

    Returns:
        ActivityResponse: Updated activity

    Raises:
        HTTPException: 404 if activity not found
    """
    activity = await service.update_activity(
        workspace_id=str(workspace_id),
        activity_id=str(activity_id),
        title=data.title,
        description=data.description,
        metadata=data.metadata,
    )

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="ACTIVITY_NOT_FOUND",
                message=f"Activity {activity_id} not found or cannot be updated",
            ).model_dump(),
        )

    # Verify activity belongs to this client
    if str(activity["client_id"]) != str(client_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="ACTIVITY_NOT_FOUND",
                message=f"Activity {activity_id} not found for client {client_id}",
            ).model_dump(),
        )

    logger.info(
        "Activity updated",
        extra={
            "activity_id": str(activity_id),
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return ActivityResponse(**activity)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: UUID = Path(..., description="Activity ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ActivityService = Depends(get_activity_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> None:
    """
    Delete a manual activity.

    Note: Only manual activities can be deleted.
    System activities are immutable.

    Args:
        activity_id: Activity ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: ActivityService instance
        current_user: Current user from JWT

    Raises:
        HTTPException: 404 if activity not found
    """
    deleted = await service.delete_activity(
        workspace_id=str(workspace_id),
        activity_id=str(activity_id),
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="ACTIVITY_NOT_FOUND",
                message=f"Activity {activity_id} not found or cannot be deleted",
            ).model_dump(),
        )

    logger.info(
        "Activity deleted",
        extra={
            "activity_id": str(activity_id),
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return None


# =============================================================================
# Quick Note Endpoint
# =============================================================================


@router.post(
    "/notes", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED
)
async def create_note(
    data: NoteCreate,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ActivityService = Depends(get_activity_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ActivityResponse:
    """
    Create a quick note (simplified activity creation).

    Convenience endpoint for creating notes without specifying activity_type.

    Args:
        data: Note creation data
        client_id: Client ID
        workspace_id: Workspace ID
        service: ActivityService instance
        current_user: Current user from JWT

    Returns:
        ActivityResponse: Created note activity
    """
    activity = await service.create_note(
        workspace_id=str(workspace_id),
        client_id=str(client_id),
        title=data.title,
        description=data.description,
        related_gallery_id=(
            str(data.related_gallery_id) if data.related_gallery_id else None
        ),
    )

    logger.info(
        "Note created",
        extra={
            "activity_id": str(activity["activity_id"]),
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return ActivityResponse(**activity)
