"""
Guest API routes for the Invitations Microservice.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel

from src.schemas.guest import (
    Guest,
    GuestCreate,
    GuestUpdate,
    GuestList,
    GuestStats,
    CSVColumnMapping,
    ImportPreview,
    ImportResult,
    BulkInviteRequest,
    BulkInviteResult,
)
from src.services.guest_service import get_guest_service
from src.api.v1.dependencies import get_current_user, CurrentUser

router = APIRouter()


@router.post(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
    response_model=Guest,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new guest",
)
async def create_guest(
    workspace_id: UUID,
    invitation_id: UUID,
    guest_data: GuestCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Create a new guest for an invitation.

    - **name**: Guest's full name (required)
    - **email**: Guest's email address (optional)
    - **phone**: Guest's phone number (optional)
    - **plus_ones**: Number of additional guests (0-10)
    - **dietary_restrictions**: Any dietary requirements
    - **notes**: Additional notes about the guest
    - **group_name**: Group/table assignment
    """
    # Verify user has access to workspace
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    service = get_guest_service()
    guest = await service.create_guest(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        **guest_data.model_dump(),
    )
    if not guest:
        raise HTTPException(status_code=500, detail="Failed to create guest")
    return guest


@router.get(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
    response_model=GuestList,
    summary="List guests for an invitation",
)
async def list_guests(
    workspace_id: UUID,
    invitation_id: UUID,
    status: Optional[str] = Query(None, description="Filter by status (pending, invited, viewed, rsvp_yes, rsvp_no, rsvp_maybe)"),
    group_name: Optional[str] = Query(None, description="Filter by group name"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    List guests for an invitation with filtering and pagination.

    Supports filtering by status, group, and text search.
    Results are ordered by creation date (newest first).
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    service = get_guest_service()
    return await service.list_guests(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        status=status,
        group_name=group_name,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/workspaces/{workspace_id}/guests/{guest_id}",
    response_model=Guest,
    summary="Get a guest by ID",
)
async def get_guest(
    workspace_id: UUID,
    guest_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get detailed information about a specific guest."""
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    service = get_guest_service()
    guest = await service.get_guest(workspace_id, guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    return guest


@router.patch(
    "/workspaces/{workspace_id}/guests/{guest_id}",
    response_model=Guest,
    summary="Update a guest",
)
async def update_guest(
    workspace_id: UUID,
    guest_id: UUID,
    updates: GuestUpdate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Update guest information.

    Only provided fields will be updated.
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    service = get_guest_service()
    guest = await service.update_guest(
        workspace_id=workspace_id,
        guest_id=guest_id,
        **updates.model_dump(exclude_unset=True),
    )
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    return guest


@router.delete(
    "/workspaces/{workspace_id}/guests/{guest_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a guest",
)
async def delete_guest(
    workspace_id: UUID,
    guest_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Remove a guest from an invitation."""
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    service = get_guest_service()
    deleted = await service.delete_guest(workspace_id, guest_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Guest not found")


@router.get(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/guests/stats",
    response_model=GuestStats,
    summary="Get guest statistics",
)
async def get_guest_stats(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get aggregated statistics for an invitation's guest list.

    Returns counts by status and RSVP response rate.
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    service = get_guest_service()
    return await service.get_guest_stats(workspace_id, invitation_id)


# CSV Import Endpoints

@router.post(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import/preview",
    response_model=ImportPreview,
    summary="Preview CSV before import",
)
async def preview_csv_import(
    workspace_id: UUID,
    invitation_id: UUID,
    file: UploadFile = File(..., description="CSV file to preview"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Preview a CSV file before importing guests.

    Returns detected columns, sample data, and validation errors.
    Use this to build the column mapping UI.
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    try:
        csv_content = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            csv_content = content.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Unable to decode file. Please use UTF-8 or Latin-1 encoding.")

    service = get_guest_service()
    return await service.preview_csv(csv_content)


@router.post(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import",
    response_model=ImportResult,
    summary="Import guests from CSV",
)
async def import_guests_from_csv(
    workspace_id: UUID,
    invitation_id: UUID,
    file: UploadFile = File(..., description="CSV file to import"),
    name_column: str = Query(..., description="Column containing guest names"),
    email_column: Optional[str] = Query(None, description="Column containing emails"),
    phone_column: Optional[str] = Query(None, description="Column containing phone numbers"),
    plus_ones_column: Optional[str] = Query(None, description="Column containing plus-one count"),
    dietary_column: Optional[str] = Query(None, description="Column containing dietary restrictions"),
    group_column: Optional[str] = Query(None, description="Column containing group/table names"),
    notes_column: Optional[str] = Query(None, description="Column containing notes"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Import guests from a CSV file.

    Provide column names from the CSV that map to guest fields.
    The name_column is required; all others are optional.

    Rate limit: 5 imports per hour.
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    try:
        csv_content = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            csv_content = content.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Unable to decode file")

    column_mapping = {
        "name_column": name_column,
        "email_column": email_column,
        "phone_column": phone_column,
        "plus_ones_column": plus_ones_column,
        "dietary_column": dietary_column,
        "group_column": group_column,
        "notes_column": notes_column,
    }

    service = get_guest_service()
    return await service.import_from_csv(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        csv_content=csv_content,
        column_mapping=column_mapping,
    )


# Bulk Actions

class BulkStatusUpdate(BaseModel):
    """Request to update status for multiple guests."""
    guest_ids: list[UUID]
    status: str


@router.post(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/guests/bulk-status",
    summary="Bulk update guest status",
)
async def bulk_update_guest_status(
    workspace_id: UUID,
    invitation_id: UUID,
    request: BulkStatusUpdate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Update status for multiple guests at once.

    Valid statuses: pending, invited, viewed, rsvp_yes, rsvp_no, rsvp_maybe
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    valid_statuses = {"pending", "invited", "viewed", "rsvp_yes", "rsvp_no", "rsvp_maybe"}
    if request.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    service = get_guest_service()
    updated_count = await service.bulk_update_status(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        guest_ids=request.guest_ids,
        status=request.status,
    )
    return {"updated": updated_count}


@router.post(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/guests/bulk-invite",
    response_model=BulkInviteResult,
    summary="Send bulk invitations",
)
async def bulk_invite_guests(
    workspace_id: UUID,
    invitation_id: UUID,
    request: BulkInviteRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Send email invitations to multiple guests.

    Creates email_send_log entries for tracking delivery status.
    Returns a batch_id that can be used to check status.

    Rate limit: 10 bulk sends per hour.
    Max batch size: 500 guests.
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    from src.services.bulk_invite_service import BulkInviteService
    from src.logging import get_logger

    logger = get_logger(__name__)

    try:
        service = BulkInviteService()
        result = await service.queue_bulk_invites(
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
            guest_ids=[str(gid) for gid in request.guest_ids],
            user_id=str(current_user.user_id),
        )

        logger.info(
            "bulk_invite_requested",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
            batch_id=result.get("batch_id"),
            queued_count=result.get("queued_count"),
        )

        return BulkInviteResult(
            batch_id=result.get("batch_id"),
            total_sent=result.get("queued_count", 0),
            failed=result.get("skipped_count", 0),
            errors=[],
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            "bulk_invite_failed",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to queue bulk invitations",
        )


class BulkInviteStatusResponse(BaseModel):
    """Status of a bulk invite batch."""

    batch_id: str
    total: int
    sent: int
    pending: int
    failed: int
    completion_percentage: float


@router.get(
    "/workspaces/{workspace_id}/bulk-invite/{batch_id}/status",
    response_model=BulkInviteStatusResponse,
    summary="Get bulk invite batch status",
)
async def get_bulk_invite_status(
    workspace_id: UUID,
    batch_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get the status of a bulk invitation batch.

    Returns counts of sent, pending, and failed emails.
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    from src.services.bulk_invite_service import BulkInviteService

    service = BulkInviteService()
    result = await service.get_batch_status(str(workspace_id), batch_id)

    if result.get("not_found") or result.get("total", 0) == 0:
        raise HTTPException(status_code=404, detail="Batch not found")

    return BulkInviteStatusResponse(
        batch_id=batch_id,
        total=result.get("total", 0),
        sent=result.get("sent", 0),
        pending=result.get("pending", 0),
        failed=result.get("failed", 0),
        completion_percentage=result.get("completion_percentage", 0),
    )
