"""Digital Invitations API Routes.

Host endpoints for managing digital event invitations.

Feature: 016-save-the-date
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_current_user, CurrentUser
from app.api.invitation_schemas import (
    CreateInvitationRequest,
    UpdateInvitationRequest,
    InvitationResponse,
    InvitationListResponse,
    InvitationStatsResponse,
    PublishInvitationRequest,
    InvitationRSVPResponse,
    RSVPListResponse,
    RSVPStatsResponse,
    RSVPStatus,
    # Draft schemas (Phase 10)
    SaveDraftRequest,
    SaveDraftResponse,
    DraftResponse,
    DraftListResponse,
    # Duplicate schema (Phase 11)
    DuplicateInvitationRequest,
    # Notification schemas (Phase 12)
    UpdateNotificationSettingsRequest,
    NotificationSettingsResponse,
    # Check-in schemas (Phase 13)
    ScanCheckinRequest,
    ManualCheckinRequest,
    CheckinVerifyResponse,
    CheckinResultResponse,
    CheckinStatsResponse,
    CheckinListResponse,
    InvitationCheckinResponse,
)
from app.services.digital_invitation_service import (
    DigitalInvitationService,
    get_digital_invitation_service,
    InvitationNotFoundError,
    InvitationAlreadyPublishedError,
    InvitationNotPublishedError,
    InvitationAccessDeniedError,
)
from app.services.invitation_rsvp_service import (
    InvitationRSVPService,
    get_rsvp_service,
    RSVPNotFoundError,
)
from app.utils.pdf_generator import generate_rsvp_pdf, is_pdf_available, PDFGenerationError
from app.services.invitation_qr_service import get_invitation_qr_service
from app.services.calendar_service import (
    get_calendar_service,
    is_calendar_available,
    CalendarServiceError,
)
from app.services.invitation_draft_service import (
    get_invitation_draft_service,
    InvitationDraftService,
)
from app.services.checkin_service import (
    CheckinService,
    AlreadyCheckedInError,
    TokenExpiredError,
    TokenInvalidError,
    RSVPNotFoundError as CheckinRSVPNotFoundError,
)


logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Invitation CRUD Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a digital invitation",
    description="Create a new digital invitation for events like weddings, birthdays, etc.",
)
async def create_invitation(
    workspace_id: UUID,
    request: CreateInvitationRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> InvitationResponse:
    """Create a new digital invitation."""
    try:
        invitation = await service.create_invitation(
            workspace_id=workspace_id,
            created_by_user_id=current_user.user_id,
            title=request.title,
            event_datetime=request.event_datetime,
            venue_country=request.venue.country if request.venue else "India",
            template_id=request.template_id,
            description=request.description,
            event_type=request.event_type or "wedding",
            event_end_datetime=request.event_end_datetime,
            event_timezone=request.event_timezone or "Asia/Kolkata",
            venue=request.venue.model_dump() if request.venue else None,
            host_names=request.host_names,
            host_contact_phone=request.host_contact_phone,
            host_contact_email=request.host_contact_email,
            rsvp_settings=request.rsvp_settings.model_dump() if request.rsvp_settings else None,
            primary_language=request.primary_language or "en",
            secondary_language=request.secondary_language,
            customization=request.customization,
        )
        return InvitationResponse(**invitation)
    except Exception as e:
        logger.error(f"Error creating invitation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create invitation",
        )


@router.get(
    "",
    response_model=InvitationListResponse,
    summary="List invitations",
    description="List all invitations for the workspace with optional filtering.",
)
async def list_invitations(
    workspace_id: UUID,
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    search: Optional[str] = Query(None, description="Search in title"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> InvitationListResponse:
    """List invitations for the workspace."""
    result = await service.list_invitations(
        workspace_id=workspace_id,
        status=status_filter,
        event_type=event_type,
        search=search,
        page=page,
        limit=limit,
    )
    return InvitationListResponse(**result)


@router.get(
    "/{invitation_id}",
    response_model=InvitationResponse,
    summary="Get invitation details",
    description="Get details of a specific invitation.",
)
async def get_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> InvitationResponse:
    """Get invitation by ID."""
    try:
        invitation = await service.get_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )
        return InvitationResponse(**invitation)
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )


@router.patch(
    "/{invitation_id}",
    response_model=InvitationResponse,
    summary="Update invitation",
    description="Update an existing invitation.",
)
async def update_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    request: UpdateInvitationRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> InvitationResponse:
    """Update an invitation."""
    try:
        # Build update kwargs from request
        update_kwargs = {}

        if request.title is not None:
            update_kwargs["title"] = request.title
        if request.description is not None:
            update_kwargs["description"] = request.description
        if request.event_type is not None:
            update_kwargs["event_type"] = request.event_type
        if request.event_datetime is not None:
            update_kwargs["event_datetime"] = request.event_datetime
        if request.event_end_datetime is not None:
            update_kwargs["event_end_datetime"] = request.event_end_datetime
        if request.event_timezone is not None:
            update_kwargs["event_timezone"] = request.event_timezone
        if request.venue is not None:
            update_kwargs["venue"] = request.venue.model_dump()
        if request.host_names is not None:
            update_kwargs["host_names"] = request.host_names
        if request.host_contact_phone is not None:
            update_kwargs["host_contact_phone"] = request.host_contact_phone
        if request.host_contact_email is not None:
            update_kwargs["host_contact_email"] = request.host_contact_email
        if request.rsvp_settings is not None:
            update_kwargs["rsvp_settings"] = request.rsvp_settings.model_dump()
        if request.primary_language is not None:
            update_kwargs["primary_language"] = request.primary_language
        if request.secondary_language is not None:
            update_kwargs["secondary_language"] = request.secondary_language
        if request.customization is not None:
            update_kwargs["customization"] = request.customization
        if request.content_i18n is not None:
            update_kwargs["content_i18n"] = request.content_i18n
        if request.auto_delete_enabled is not None:
            update_kwargs["auto_delete_enabled"] = request.auto_delete_enabled
        if request.auto_delete_days is not None:
            update_kwargs["auto_delete_days"] = request.auto_delete_days

        invitation = await service.update_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            updated_by_user_id=current_user.user_id,
            **update_kwargs,
        )
        return InvitationResponse(**invitation)
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )


@router.delete(
    "/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete invitation",
    description="Soft-delete an invitation.",
)
async def delete_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> None:
    """Delete an invitation."""
    try:
        await service.delete_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            deleted_by_user_id=current_user.user_id,
        )
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )


@router.post(
    "/{invitation_id}/duplicate",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate invitation",
    description="Create a copy of an existing invitation with all content except RSVPs and guests.",
)
async def duplicate_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    request: Optional[DuplicateInvitationRequest] = None,
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> InvitationResponse:
    """Duplicate an invitation.

    Creates a copy of the invitation with:
    - All event details, venue info, and host info
    - Template and customization settings
    - RSVP settings (but not existing RSVPs)
    - Gallery images (references same storage objects)

    The duplicate will:
    - Have 'draft' status (not published)
    - Get a new slug and invitation_id
    - Have "Copy of <title>" as the title (unless custom title provided)
    - Start with zero views and no RSVPs
    """
    try:
        new_title = request.title if request else None
        invitation = await service.duplicate_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            duplicated_by_user_id=current_user.user_id,
            new_title=new_title,
        )
        return InvitationResponse(**invitation)
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
    except Exception as e:
        logger.error(f"Error duplicating invitation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to duplicate invitation",
        )


@router.patch(
    "/{invitation_id}/notification-settings",
    response_model=NotificationSettingsResponse,
    summary="Update notification settings",
    description="Update RSVP notification preferences for an invitation.",
)
async def update_notification_settings(
    workspace_id: UUID,
    invitation_id: UUID,
    request: UpdateNotificationSettingsRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> NotificationSettingsResponse:
    """Update notification settings for an invitation.

    Controls how the host receives notifications when guests submit RSVPs:
    - immediate: Send notification immediately after each RSVP
    - daily_digest: Aggregate RSVPs and send once daily at 9 AM local time
    - disabled: No notifications (host can still view RSVPs in dashboard)
    """
    try:
        await service.update_notification_preference(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            notification_preference=request.notification_preference.value,
        )
        return NotificationSettingsResponse(
            notification_preference=request.notification_preference.value,
            message="Notification settings updated successfully",
        )
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
    except Exception as e:
        logger.error(f"Error updating notification settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update notification settings",
        )


# ---------------------------------------------------------------------------
# Publishing Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{invitation_id}/publish",
    response_model=InvitationResponse,
    summary="Publish invitation",
    description="Publish an invitation and generate a public URL.",
)
async def publish_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    request: Optional[PublishInvitationRequest] = None,
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> InvitationResponse:
    """Publish an invitation."""
    try:
        base_url = request.base_url if request else "https://rawdrive.ai"
        invitation = await service.publish_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            published_by_user_id=current_user.user_id,
            base_url=base_url,
        )
        return InvitationResponse(**invitation)
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
    except InvitationAlreadyPublishedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        )


@router.post(
    "/{invitation_id}/unpublish",
    response_model=InvitationResponse,
    summary="Unpublish invitation",
    description="Unpublish an invitation and revoke the public URL.",
)
async def unpublish_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> InvitationResponse:
    """Unpublish an invitation."""
    try:
        invitation = await service.unpublish_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            unpublished_by_user_id=current_user.user_id,
        )
        return InvitationResponse(**invitation)
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
    except InvitationNotPublishedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        )


# ---------------------------------------------------------------------------
# Statistics Endpoint
# ---------------------------------------------------------------------------


@router.get(
    "/{invitation_id}/stats",
    response_model=InvitationStatsResponse,
    summary="Get invitation statistics",
    description="Get view count, RSVP stats, and check-in stats for an invitation.",
)
async def get_invitation_stats(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> InvitationStatsResponse:
    """Get invitation statistics."""
    try:
        stats = await service.get_invitation_stats(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )
        return InvitationStatsResponse(**stats)
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )


# ---------------------------------------------------------------------------
# RSVP Management Endpoints (T051-T054)
# ---------------------------------------------------------------------------


@router.get(
    "/{invitation_id}/rsvps",
    response_model=RSVPListResponse,
    summary="List RSVPs for invitation",
    description="Get all RSVPs for an invitation with filtering and search.",
)
async def list_rsvps(
    workspace_id: UUID,
    invitation_id: UUID,
    attending: Optional[bool] = Query(None, description="Filter by attending status"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by RSVP status"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_user),
    invitation_service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> RSVPListResponse:
    """List RSVPs for an invitation."""
    # Verify invitation exists and belongs to workspace
    try:
        await invitation_service.get_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )

    # Parse status filter
    rsvp_status = None
    if status_filter:
        try:
            rsvp_status = RSVPStatus(status_filter)
        except ValueError:
            pass

    # Get RSVP service
    rsvp_service = get_rsvp_service()

    # List RSVPs
    rsvps, total = await rsvp_service.list_rsvps(
        invitation_id=invitation_id,
        workspace_id=workspace_id,
        attending=attending,
        status=rsvp_status,
        search=search,
        page=page,
        limit=limit,
    )

    return RSVPListResponse(
        rsvps=rsvps,
        total=total,
        page=page,
        limit=limit,
        has_more=(page * limit) < total,
    )


@router.get(
    "/{invitation_id}/rsvps/stats",
    response_model=RSVPStatsResponse,
    summary="Get RSVP statistics",
    description="Get summary statistics for RSVPs (attending, not attending, maybe, total party size).",
)
async def get_rsvp_stats(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    invitation_service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> RSVPStatsResponse:
    """Get RSVP statistics."""
    # Verify invitation exists
    try:
        await invitation_service.get_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )

    rsvp_service = get_rsvp_service()
    return await rsvp_service.get_rsvp_stats(
        invitation_id=invitation_id,
        workspace_id=workspace_id,
    )


@router.delete(
    "/{invitation_id}/rsvps/{rsvp_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete RSVP",
    description="Delete an RSVP (host action).",
)
async def delete_rsvp(
    workspace_id: UUID,
    invitation_id: UUID,
    rsvp_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    invitation_service: DigitalInvitationService = Depends(get_digital_invitation_service),
) -> None:
    """Delete an RSVP."""
    # Verify invitation exists
    try:
        await invitation_service.get_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )

    rsvp_service = get_rsvp_service()
    try:
        await rsvp_service.delete_rsvp(
            rsvp_id=rsvp_id,
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )
    except RSVPNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# ---------------------------------------------------------------------------
# RSVP Export Endpoints (T056-T057)
# ---------------------------------------------------------------------------


@router.get(
    "/{invitation_id}/rsvps/export",
    summary="Export RSVPs",
    description="Export RSVPs to CSV or PDF format.",
)
async def export_rsvps(
    workspace_id: UUID,
    invitation_id: UUID,
    format: str = Query("csv", description="Export format: csv or pdf"),
    current_user: CurrentUser = Depends(get_current_user),
    invitation_service: DigitalInvitationService = Depends(get_digital_invitation_service),
):
    """Export RSVPs to CSV or PDF."""
    # Verify invitation exists and get details
    try:
        invitation = await invitation_service.get_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )

    # Get all RSVPs (no pagination for export)
    rsvp_service = get_rsvp_service()
    rsvps, total = await rsvp_service.list_rsvps(
        invitation_id=invitation_id,
        workspace_id=workspace_id,
        page=1,
        limit=10000,  # Get all RSVPs
    )

    # Get stats for PDF
    stats = await rsvp_service.get_rsvp_stats(
        invitation_id=invitation_id,
        workspace_id=workspace_id,
    )

    # Generate filename base
    invitation_title = invitation.get("title", "invitation")
    safe_title = "".join(c for c in invitation_title if c.isalnum() or c in " -_").strip()
    safe_title = safe_title[:50] if safe_title else "rsvps"
    timestamp = datetime.now().strftime("%Y%m%d")

    if format.lower() == "pdf":
        # PDF Export
        if not is_pdf_available():
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="PDF export is not available. Please install reportlab.",
            )

        try:
            # Convert RSVPResponse objects to dicts for PDF generator
            rsvp_dicts = [
                {
                    "guest_name": r.guest_name,
                    "guest_email": r.guest_email,
                    "guest_phone": r.guest_phone,
                    "attending": r.attending,
                    "party_size": r.party_size,
                    "party_names": r.party_names,
                    "dietary_preferences": r.dietary_preferences,
                    "message": r.message,
                    "created_at": r.created_at,
                }
                for r in rsvps
            ]

            stats_dict = {
                "total": stats.total,
                "attending": stats.attending,
                "not_attending": stats.not_attending,
                "maybe": stats.maybe,
                "total_party_size": stats.total_party_size,
            }

            event_datetime = invitation.get("event_datetime")
            if isinstance(event_datetime, str):
                try:
                    event_datetime = datetime.fromisoformat(event_datetime.replace("Z", "+00:00"))
                except Exception:
                    event_datetime = None

            pdf_bytes = generate_rsvp_pdf(
                rsvps=rsvp_dicts,
                stats=stats_dict,
                invitation_title=invitation_title,
                event_datetime=event_datetime,
            )

            return StreamingResponse(
                io.BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="{safe_title}-rsvps-{timestamp}.pdf"'
                },
            )
        except PDFGenerationError as e:
            logger.error(f"PDF generation failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate PDF",
            )

    else:
        # CSV Export (default)
        output = io.StringIO()
        writer = csv.writer(output)

        # Header row
        writer.writerow([
            "Guest Name",
            "Email",
            "Phone",
            "Status",
            "Party Size",
            "Party Names",
            "Dietary Preferences",
            "Message",
            "RSVP Date",
        ])

        # Data rows
        for rsvp in rsvps:
            status_text = "Attending" if rsvp.attending is True else (
                "Not Attending" if rsvp.attending is False else "Maybe"
            )
            party_names = ", ".join(rsvp.party_names) if rsvp.party_names else ""
            created_at = rsvp.created_at
            if isinstance(created_at, datetime):
                created_at = created_at.strftime("%Y-%m-%d %H:%M")
            elif isinstance(created_at, str):
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    created_at = dt.strftime("%Y-%m-%d %H:%M")
                except Exception:
                    pass

            writer.writerow([
                rsvp.guest_name,
                rsvp.guest_email,
                rsvp.guest_phone or "",
                status_text,
                rsvp.party_size,
                party_names,
                rsvp.dietary_preferences or "",
                rsvp.message or "",
                created_at,
            ])

        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_title}-rsvps-{timestamp}.csv"'
            },
        )


# ---------------------------------------------------------------------------
# QR Code Endpoints (T063-T066)
# ---------------------------------------------------------------------------


@router.get(
    "/{invitation_id}/qr",
    summary="Generate QR code",
    description="Generate a QR code for the invitation's public URL in PNG, SVG, or PDF format.",
)
async def generate_qr_code(
    workspace_id: UUID,
    invitation_id: UUID,
    format: str = Query("png", description="Output format: png, svg, or pdf"),
    size: int = Query(512, ge=256, le=2048, description="QR code size in pixels"),
    fill_color: str = Query("#000000", description="QR code module color (hex)"),
    back_color: str = Query("#FFFFFF", description="Background color (hex)"),
    include_logo: bool = Query(False, description="Include cover image as logo overlay"),
    current_user: CurrentUser = Depends(get_current_user),
    invitation_service: DigitalInvitationService = Depends(get_digital_invitation_service),
):
    """Generate a QR code for an invitation.

    The QR code links to the invitation's public URL.
    Supports PNG, SVG, and PDF formats with customizable colors.
    """
    # Verify invitation exists
    try:
        await invitation_service.get_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )

    # Validate format
    format_lower = format.lower()
    if format_lower not in ("png", "svg", "pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid format. Use png, svg, or pdf.",
        )

    # Generate QR code
    qr_service = get_invitation_qr_service()
    try:
        qr_bytes, content_type, filename = await qr_service.generate_invitation_qr(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            format=format_lower,  # type: ignore
            size=size,
            fill_color=fill_color,
            back_color=back_color,
            include_logo=include_logo,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return StreamingResponse(
        io.BytesIO(qr_bytes),
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


# ---------------------------------------------------------------------------
# Calendar Endpoints (T075)
# ---------------------------------------------------------------------------


@router.get(
    "/{invitation_id}/calendar",
    summary="Download calendar file",
    description="Generate and download an iCalendar (.ics) file for the event.",
)
async def download_calendar(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    invitation_service: DigitalInvitationService = Depends(get_digital_invitation_service),
):
    """Download an iCalendar file for the invitation event.

    Generates an RFC 5545 compliant .ics file with:
    - Event date/time with timezone support
    - Venue location with geo coordinates
    - Reminder alarms (1 day and 1 hour before)
    - Public URL link to invitation
    """
    # Check if calendar service is available
    if not is_calendar_available():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Calendar generation is not available. Please install icalendar package.",
        )

    # Get invitation details
    try:
        invitation = await invitation_service.get_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )

    # Check if invitation has required date
    if not invitation.get("event_datetime"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation does not have an event date set.",
        )

    # Generate calendar file
    try:
        calendar_service = get_calendar_service()
        ics_bytes, filename = calendar_service.generate_invitation_ics(invitation)
    except CalendarServiceError as e:
        logger.error(f"Calendar generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate calendar file.",
        )

    return StreamingResponse(
        io.BytesIO(ics_bytes),
        media_type="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/calendar; charset=utf-8",
        },
    )


# ---------------------------------------------------------------------------
# Draft Endpoints (T093-T096: Save Draft and Auto-Save)
# ---------------------------------------------------------------------------


@router.post(
    "/drafts",
    response_model=SaveDraftResponse,
    status_code=status.HTTP_200_OK,
    summary="Save invitation draft",
    description="Save or update an invitation draft. Creates new draft if draft_id not provided.",
)
async def save_draft(
    workspace_id: UUID,
    request: SaveDraftRequest,
    current_user: CurrentUser = Depends(get_current_user),
    draft_service: InvitationDraftService = Depends(get_invitation_draft_service),
) -> SaveDraftResponse:
    """Save invitation draft for auto-save and resume functionality.

    If draft_id is provided, updates existing draft.
    If draft_id is None, creates a new draft.
    Drafts expire after 7 days of inactivity.
    """
    try:
        draft_id = await draft_service.save_or_create(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            draft_id=request.draft_id,
            data=request.data,
        )
        return SaveDraftResponse(
            draft_id=draft_id,
            message="Draft saved successfully",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error saving draft: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save draft",
        )


@router.get(
    "/drafts",
    response_model=DraftListResponse,
    summary="List invitation drafts",
    description="Get all invitation drafts for the current user.",
)
async def list_drafts(
    workspace_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    draft_service: InvitationDraftService = Depends(get_invitation_draft_service),
) -> DraftListResponse:
    """List all invitation drafts for the current user.

    Drafts are sorted by updated_at descending (most recent first).
    Expired drafts are automatically cleaned up.
    """
    drafts = await draft_service.list_drafts(
        workspace_id=workspace_id,
        user_id=current_user.user_id,
    )
    return DraftListResponse(
        data=[DraftResponse.from_redis(d) for d in drafts],
        total=len(drafts),
    )


@router.get(
    "/drafts/{draft_id}",
    response_model=DraftResponse,
    summary="Get invitation draft",
    description="Get a specific invitation draft by ID.",
)
async def get_draft(
    workspace_id: UUID,
    draft_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    draft_service: InvitationDraftService = Depends(get_invitation_draft_service),
) -> DraftResponse:
    """Get a specific invitation draft.

    Only the draft owner can access their drafts.
    """
    draft = await draft_service.get_draft(
        workspace_id=workspace_id,
        user_id=current_user.user_id,
        draft_id=draft_id,
    )
    if not draft:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found or has expired",
        )
    return DraftResponse.from_redis(draft)


@router.delete(
    "/drafts/{draft_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete invitation draft",
    description="Delete a specific invitation draft.",
)
async def delete_draft(
    workspace_id: UUID,
    draft_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    draft_service: InvitationDraftService = Depends(get_invitation_draft_service),
) -> None:
    """Delete a specific invitation draft.

    Only the draft owner can delete their drafts.
    """
    deleted = await draft_service.delete_draft(
        workspace_id=workspace_id,
        user_id=current_user.user_id,
        draft_id=draft_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found or has expired",
        )


# ---------------------------------------------------------------------------
# Check-in Endpoints (T115-T117: Guest Check-In via QR)
# ---------------------------------------------------------------------------


def get_checkin_service() -> CheckinService:
    """Dependency to get CheckinService instance."""
    return CheckinService()


@router.post(
    "/{invitation_id}/checkins/verify",
    response_model=CheckinVerifyResponse,
    summary="Verify QR code token",
    description="Verify a QR code token and return guest info without recording check-in.",
)
async def verify_checkin_token(
    workspace_id: UUID,
    invitation_id: UUID,
    request: ScanCheckinRequest,
    current_user: CurrentUser = Depends(get_current_user),
    checkin_service: CheckinService = Depends(get_checkin_service),
) -> CheckinVerifyResponse:
    """Verify a check-in QR code token.

    This endpoint validates the QR token and returns guest information
    without recording a check-in. Use this to preview guest details
    before confirming check-in.
    """
    try:
        guest_info = await checkin_service.verify_and_get_guest_info(
            token=request.token,
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        return CheckinVerifyResponse(
            valid=True,
            rsvp_id=guest_info.get("rsvp_id"),
            guest_name=guest_info.get("guest_name"),
            guest_email=guest_info.get("guest_email"),
            party_size=guest_info.get("party_size"),
            attending=guest_info.get("attending"),
            dietary_preferences=guest_info.get("dietary_preferences"),
            already_checked_in=guest_info.get("already_checked_in", False),
            checkin_details=guest_info.get("checkin_details"),
        )

    except TokenExpiredError:
        return CheckinVerifyResponse(
            valid=False,
            error="Check-in token has expired. The event check-in window may have closed.",
        )
    except TokenInvalidError as e:
        return CheckinVerifyResponse(
            valid=False,
            error=str(e),
        )
    except CheckinRSVPNotFoundError:
        return CheckinVerifyResponse(
            valid=False,
            error="RSVP not found for this token.",
        )


@router.post(
    "/{invitation_id}/checkins",
    response_model=CheckinResultResponse,
    summary="Record guest check-in",
    description="Record a guest check-in via QR scan.",
)
async def record_checkin(
    workspace_id: UUID,
    invitation_id: UUID,
    request: ScanCheckinRequest,
    current_user: CurrentUser = Depends(get_current_user),
    checkin_service: CheckinService = Depends(get_checkin_service),
) -> CheckinResultResponse:
    """Record a guest check-in via QR scan.

    This endpoint verifies the QR token and records the check-in.
    It is idempotent - scanning the same QR twice returns the
    existing check-in record instead of creating a duplicate.
    """
    try:
        result = await checkin_service.scan_and_checkin(
            token=request.token,
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            checked_in_by_user_id=current_user.user_id,
            party_size_override=request.party_size_override,
            latitude=request.latitude,
            longitude=request.longitude,
            notes=request.notes,
        )

        checkin = result.get("checkin", {})
        return CheckinResultResponse(
            success=True,
            checkin_id=str(checkin.get("checkin_id")),
            guest_name=checkin.get("guest_name", ""),
            party_size_checked_in=checkin.get("party_size_checked_in", 1),
            verification_method=checkin.get("verification_method", "qr_scan"),
            checked_in_at=checkin.get("checked_in_at"),
            message="Guest checked in successfully",
        )

    except AlreadyCheckedInError as e:
        # Return existing check-in info (idempotent behavior)
        existing = e.checkin
        return CheckinResultResponse(
            success=True,
            checkin_id=str(existing.get("checkin_id")),
            guest_name=existing.get("guest_name", ""),
            party_size_checked_in=existing.get("party_size_checked_in", 1),
            verification_method=existing.get("verification_method", "qr_scan"),
            checked_in_at=existing.get("checked_in_at"),
            already_checked_in=True,
            existing_checkin=existing,
            message="Guest was already checked in",
        )

    except TokenExpiredError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Check-in token has expired",
        )
    except TokenInvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except CheckinRSVPNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RSVP not found for this token",
        )


@router.post(
    "/{invitation_id}/checkins/manual",
    response_model=CheckinResultResponse,
    summary="Manual check-in by name",
    description="Manually check in a guest by name lookup.",
)
async def manual_checkin(
    workspace_id: UUID,
    invitation_id: UUID,
    request: ManualCheckinRequest,
    current_user: CurrentUser = Depends(get_current_user),
    checkin_service: CheckinService = Depends(get_checkin_service),
) -> CheckinResultResponse:
    """Manually check in a guest by name lookup.

    Use this when a guest doesn't have their QR code.
    Searches RSVPs for matching name and records check-in.
    """
    try:
        checkin = await checkin_service.manual_checkin_by_name(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            guest_name=request.guest_name,
            party_size_checked_in=request.party_size_checked_in,
            checked_in_by_user_id=current_user.user_id,
            notes=request.notes,
        )

        return CheckinResultResponse(
            success=True,
            checkin_id=str(checkin.get("checkin_id")),
            guest_name=checkin.get("guest_name", request.guest_name),
            party_size_checked_in=checkin.get("party_size_checked_in", 1),
            verification_method="name_lookup",
            checked_in_at=checkin.get("checked_in_at"),
            message="Guest checked in successfully via name lookup",
        )

    except AlreadyCheckedInError as e:
        existing = e.checkin
        return CheckinResultResponse(
            success=True,
            checkin_id=str(existing.get("checkin_id")),
            guest_name=existing.get("guest_name", ""),
            party_size_checked_in=existing.get("party_size_checked_in", 1),
            verification_method=existing.get("verification_method", "name_lookup"),
            checked_in_at=existing.get("checked_in_at"),
            already_checked_in=True,
            existing_checkin=existing,
            message="Guest was already checked in",
        )

    except CheckinRSVPNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No RSVP found for guest: {request.guest_name}",
        )


@router.get(
    "/{invitation_id}/checkins",
    response_model=CheckinListResponse,
    summary="List check-ins",
    description="Get paginated list of check-ins for an invitation.",
)
async def list_checkins(
    workspace_id: UUID,
    invitation_id: UUID,
    verification_method: Optional[str] = Query(
        None, description="Filter by verification method (qr_scan, manual, name_lookup)"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_user),
    checkin_service: CheckinService = Depends(get_checkin_service),
) -> CheckinListResponse:
    """Get paginated list of check-ins for an invitation.

    Returns check-in records with statistics.
    """
    result = await checkin_service.list_checkins(
        invitation_id=invitation_id,
        workspace_id=workspace_id,
        verification_method=verification_method,
        page=page,
        limit=limit,
    )

    stats = await checkin_service.get_checkin_stats(
        invitation_id=invitation_id,
        workspace_id=workspace_id,
    )

    # Convert to response models
    checkins = [
        InvitationCheckinResponse(
            checkin_id=c.get("checkin_id"),
            invitation_id=invitation_id,
            rsvp_id=c.get("rsvp_id"),
            guest_id=c.get("guest_id"),
            guest_name=c.get("guest_name", ""),
            party_size_checked_in=c.get("party_size_checked_in", 1),
            verification_method=c.get("verification_method", "qr_scan"),
            checked_in_by_user_id=c.get("checked_in_by_user_id"),
            checked_in_at=c.get("checked_in_at"),
            notes=c.get("notes"),
        )
        for c in result.get("items", [])
    ]

    return CheckinListResponse(
        data=checkins,
        stats={
            "total_checked_in": stats.get("total_checkins", 0),
            "total_party_size": stats.get("total_guests_checked_in", 0),
        },
        meta={
            "page": result.get("page", 1),
            "limit": result.get("limit", limit),
            "total": result.get("total", 0),
            "pages": result.get("pages", 1),
        },
    )


@router.get(
    "/{invitation_id}/checkins/stats",
    response_model=CheckinStatsResponse,
    summary="Get check-in statistics",
    description="Get check-in statistics for dashboard display.",
)
async def get_checkin_stats(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    checkin_service: CheckinService = Depends(get_checkin_service),
) -> CheckinStatsResponse:
    """Get check-in statistics for an invitation.

    Returns total check-ins, breakdown by method, and check-in rate.
    """
    stats = await checkin_service.get_checkin_stats(
        invitation_id=invitation_id,
        workspace_id=workspace_id,
    )

    return CheckinStatsResponse(
        total_checkins=stats.get("total_checkins", 0),
        total_guests_checked_in=stats.get("total_guests_checked_in", 0),
        expected_guests=stats.get("expected_guests", 0),
        checkin_rate_percent=stats.get("checkin_rate_percent", 0.0),
        first_checkin_at=stats.get("first_checkin_at"),
        last_checkin_at=stats.get("last_checkin_at"),
        by_method=stats.get("by_method", {}),
        rsvp_stats=stats.get("rsvp_stats"),
    )
