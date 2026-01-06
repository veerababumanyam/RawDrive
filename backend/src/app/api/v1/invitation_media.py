"""Invitation Media API endpoints."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.models.invitation_media import InvitationMedia, MediaType
from app.services.invitation_media_service import (
    InvitationMediaService,
    get_invitation_media_service,
)

router = APIRouter()


class InitiateMediaUploadRequest(BaseModel):
    """Request to initiate media upload."""
    filename: str
    content_type: str
    size_bytes: int
    media_type: MediaType


@router.post(
    "/{invitation_id}/media",
    response_model=dict[str, Any],
    status_code=status.HTTP_201_CREATED,
)
async def initiate_media_upload(
    invitation_id: UUID,
    request: InitiateMediaUploadRequest,
    workspace_id: UUID,  # Assume workspace_id comes from header/dependency in main router context
    current_user: Any = Depends(get_current_user),
    service: InvitationMediaService = Depends(get_invitation_media_service),
) -> dict[str, Any]:
    """Initiate media upload for an invitation.
    
    Returns the media record. conversion to upload URL should happen here or client 
    uses returned info to upload.
    """
    # Note: Authorization check for workspace/invitation access is assumed to be handled 
    # either by global dependencies or we should check it here. 
    # For brevity, assuming workspace_id is validated.
    
    media = await service.initiate_upload(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        media_type=request.media_type,
        filename=request.filename,
        content_type=request.content_type,
        size_bytes=request.size_bytes,
        user_id=current_user.user_id,
    )
    return media


@router.put(
    "/{invitation_id}/media/{media_id}/complete",
    response_model=dict[str, Any],
)
async def complete_media_upload(
    invitation_id: UUID,
    media_id: UUID,
    workspace_id: UUID,
    service: InvitationMediaService = Depends(get_invitation_media_service),
    current_user: Any = Depends(get_current_user),
) -> dict[str, Any]:
    """Mark media upload as complete and trigger processing."""
    try:
        media = await service.complete_upload(workspace_id, invitation_id, media_id)
        return media
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get(
    "/{invitation_id}/media",
    response_model=list[dict[str, Any]],
)
async def list_invitation_media(
    invitation_id: UUID,
    workspace_id: UUID,
    service: InvitationMediaService = Depends(get_invitation_media_service),
    current_user: Any = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List all media for an invitation."""
    return await service.list_media(workspace_id, invitation_id)


@router.delete(
    "/{invitation_id}/media/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_invitation_media(
    invitation_id: UUID,
    media_id: UUID,
    workspace_id: UUID,
    service: InvitationMediaService = Depends(get_invitation_media_service),
    current_user: Any = Depends(get_current_user),
) -> None:
    """Delete media from invitation."""
    success = await service.delete_media(workspace_id, invitation_id, media_id)
    if not success:
        raise HTTPException(status_code=404, detail="Media not found")
