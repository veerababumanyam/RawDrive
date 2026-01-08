"""
Communication history API endpoints.

Provides REST API for client communication tracking:
- List communications with filtering (type, direction, date range)
- Create communication records (email, calls, SMS, meetings)
- Update communication details
- Delete communications
- Follow-up tracking and completion
- Overdue follow-up detection
"""

from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from src.services.communication_service import (
    CommunicationService,
    get_communication_service,
)
from src.schemas.communication import (
    CommunicationCreate,
    CommunicationUpdate,
    CommunicationResponse,
    CommunicationListResponse,
    CompleteFollowUpRequest,
)
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/clients/{client_id}/communications",
    tags=["communications"],
)


# =============================================================================
# Communication Endpoints
# =============================================================================


@router.get("", response_model=CommunicationListResponse)
async def list_communications(
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    communication_type: Optional[str] = Query(
        None, description="Filter by communication type"
    ),
    direction: Optional[str] = Query(None, regex="^(inbound|outbound)$"),
    start_date: Optional[datetime] = Query(None, description="Filter from date"),
    end_date: Optional[datetime] = Query(None, description="Filter to date"),
    related_gallery_id: Optional[UUID] = Query(None, description="Filter by gallery"),
    follow_up_required: Optional[bool] = Query(
        None, description="Filter by follow-up status"
    ),
    follow_up_overdue: Optional[bool] = Query(
        None, description="Filter overdue follow-ups"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sort order"),
    service: CommunicationService = Depends(get_communication_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> CommunicationListResponse:
    """
    List all communications for a client.

    Supports filtering by:
    - Communication type (email, call, sms, meeting, video_call)
    - Direction (inbound/outbound)
    - Date range
    - Related gallery
    - Follow-up status (required, overdue)

    Args:
        client_id: Client ID
        workspace_id: Workspace ID
        communication_type: Optional type filter
        direction: Optional direction filter
        start_date: Optional start date filter
        end_date: Optional end date filter
        related_gallery_id: Optional gallery filter
        follow_up_required: Optional follow-up status filter
        follow_up_overdue: Optional overdue follow-up filter
        page: Page number
        limit: Items per page
        sort_by: Sort field
        sort_order: Sort order
        service: CommunicationService instance
        current_user: Current user from JWT

    Returns:
        CommunicationListResponse: Paginated communication list
    """
    result = await service.list_communications(
        workspace_id=str(workspace_id),
        client_id=str(client_id),
        communication_type=communication_type,
        direction=direction,
        start_date=start_date,
        end_date=end_date,
        related_gallery_id=(
            str(related_gallery_id) if related_gallery_id else None
        ),
        follow_up_required=follow_up_required,
        follow_up_overdue=follow_up_overdue,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    logger.debug(
        "Communications listed",
        extra={
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "total": result["total"],
            "page": page,
        },
    )

    return CommunicationListResponse(
        communications=[
            CommunicationResponse(**comm) for comm in result["communications"]
        ],
        total=result["total"],
        page=result["page"],
        limit=result["limit"],
    )


@router.post(
    "", response_model=CommunicationResponse, status_code=status.HTTP_201_CREATED
)
async def create_communication(
    data: CommunicationCreate,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: CommunicationService = Depends(get_communication_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> CommunicationResponse:
    """
    Create a new communication record.

    Use this to log emails, calls, SMS, meetings, and video calls.

    Args:
        data: Communication creation data
        client_id: Client ID
        workspace_id: Workspace ID
        service: CommunicationService instance
        current_user: Current user from JWT

    Returns:
        CommunicationResponse: Created communication

    Raises:
        HTTPException: 400 if validation fails
    """
    try:
        communication = await service.create_communication(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            communication_type=data.communication_type,
            direction=data.direction,
            subject=data.subject,
            body=data.body,
            related_gallery_id=(
                str(data.related_gallery_id) if data.related_gallery_id else None
            ),
            duration_minutes=data.duration_minutes,
            follow_up_required=data.follow_up_required,
            follow_up_date=data.follow_up_date,
            metadata=data.metadata,
        )

        logger.info(
            "Communication created",
            extra={
                "communication_id": str(communication["communication_id"]),
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "communication_type": data.communication_type,
                "direction": data.direction,
                "user_id": str(current_user.user_id),
            },
        )

        return CommunicationResponse(**communication)

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
            "Communication creation failed",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "communication_type": data.communication_type,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="COMMUNICATION_CREATION_FAILED",
                message="Failed to create communication",
            ).model_dump(),
        )


@router.get("/{communication_id}", response_model=CommunicationResponse)
async def get_communication(
    communication_id: UUID = Path(..., description="Communication ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: CommunicationService = Depends(get_communication_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> CommunicationResponse:
    """
    Get communication details.

    Args:
        communication_id: Communication ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: CommunicationService instance
        current_user: Current user from JWT

    Returns:
        CommunicationResponse: Communication details

    Raises:
        HTTPException: 404 if communication not found
    """
    communication = await service.get_communication(
        workspace_id=str(workspace_id),
        communication_id=str(communication_id),
    )

    if not communication:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="COMMUNICATION_NOT_FOUND",
                message=f"Communication {communication_id} not found",
            ).model_dump(),
        )

    # Verify communication belongs to this client
    if str(communication["client_id"]) != str(client_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="COMMUNICATION_NOT_FOUND",
                message=f"Communication {communication_id} not found for client {client_id}",
            ).model_dump(),
        )

    return CommunicationResponse(**communication)


@router.patch("/{communication_id}", response_model=CommunicationResponse)
async def update_communication(
    data: CommunicationUpdate,
    communication_id: UUID = Path(..., description="Communication ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: CommunicationService = Depends(get_communication_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> CommunicationResponse:
    """
    Update a communication record.

    Args:
        data: Communication update data
        communication_id: Communication ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: CommunicationService instance
        current_user: Current user from JWT

    Returns:
        CommunicationResponse: Updated communication

    Raises:
        HTTPException: 404 if communication not found
    """
    communication = await service.update_communication(
        workspace_id=str(workspace_id),
        communication_id=str(communication_id),
        subject=data.subject,
        body=data.body,
        duration_minutes=data.duration_minutes,
        follow_up_required=data.follow_up_required,
        follow_up_date=data.follow_up_date,
        follow_up_completed_at=data.follow_up_completed_at,
        metadata=data.metadata,
    )

    if not communication:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="COMMUNICATION_NOT_FOUND",
                message=f"Communication {communication_id} not found",
            ).model_dump(),
        )

    # Verify communication belongs to this client
    if str(communication["client_id"]) != str(client_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="COMMUNICATION_NOT_FOUND",
                message=f"Communication {communication_id} not found for client {client_id}",
            ).model_dump(),
        )

    logger.info(
        "Communication updated",
        extra={
            "communication_id": str(communication_id),
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return CommunicationResponse(**communication)


@router.delete("/{communication_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_communication(
    communication_id: UUID = Path(..., description="Communication ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: CommunicationService = Depends(get_communication_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> None:
    """
    Delete a communication record.

    Args:
        communication_id: Communication ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: CommunicationService instance
        current_user: Current user from JWT

    Raises:
        HTTPException: 404 if communication not found
    """
    deleted = await service.delete_communication(
        workspace_id=str(workspace_id),
        communication_id=str(communication_id),
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="COMMUNICATION_NOT_FOUND",
                message=f"Communication {communication_id} not found",
            ).model_dump(),
        )

    logger.info(
        "Communication deleted",
        extra={
            "communication_id": str(communication_id),
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return None


# =============================================================================
# Follow-Up Management
# =============================================================================


@router.post(
    "/{communication_id}/complete-follow-up", response_model=CommunicationResponse
)
async def complete_follow_up(
    data: CompleteFollowUpRequest,
    communication_id: UUID = Path(..., description="Communication ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: CommunicationService = Depends(get_communication_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> CommunicationResponse:
    """
    Mark a follow-up as completed.

    Args:
        data: Follow-up completion data
        communication_id: Communication ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: CommunicationService instance
        current_user: Current user from JWT

    Returns:
        CommunicationResponse: Updated communication with follow-up completed

    Raises:
        HTTPException: 404 if communication not found
    """
    communication = await service.complete_follow_up(
        workspace_id=str(workspace_id),
        communication_id=str(communication_id),
        notes=data.notes,
    )

    if not communication:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="COMMUNICATION_NOT_FOUND",
                message=f"Communication {communication_id} not found",
            ).model_dump(),
        )

    # Verify communication belongs to this client
    if str(communication["client_id"]) != str(client_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="COMMUNICATION_NOT_FOUND",
                message=f"Communication {communication_id} not found for client {client_id}",
            ).model_dump(),
        )

    logger.info(
        "Follow-up completed",
        extra={
            "communication_id": str(communication_id),
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return CommunicationResponse(**communication)
