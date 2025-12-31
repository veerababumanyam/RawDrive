"""
Public Invitations API

Public (unauthenticated) endpoints for viewing invitations and submitting RSVPs.

Feature: 016-save-the-date
"""

import io
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.digital_invitation_service import (
    DigitalInvitationService,
    get_invitation_service,
    InvitationNotFoundError,
)
from app.services.calendar_service import (
    get_calendar_service,
    is_calendar_available,
    CalendarServiceError,
)
from app.services.invitation_rsvp_service import (
    InvitationRSVPService,
    get_rsvp_service,
    RSVPNotFoundError,
    RSVPDeadlinePassedError,
    RSVPDuplicateError,
    InvalidEditTokenError,
    RSVPServiceError,
)
from app.services.turnstile_service import (
    TurnstileService,
    TurnstileVerificationError,
    get_turnstile_service,
)
from app.api.invitation_schemas import (
    PublicInvitationResponse,
    RSVPCreate,
    RSVPUpdate,
    RSVPResponse,
    RSVPSubmitResponse,
    AccessInvitationRequest,
    AccessInvitationResponse,
    ICSResponse,
    RSVPSource,
)


router = APIRouter()


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def get_services():
    """Get invitation and RSVP services."""
    return get_invitation_service(), get_rsvp_service()


# ---------------------------------------------------------------------------
# Public Invitation Access
# ---------------------------------------------------------------------------


@router.get(
    "/{slug}",
    response_model=AccessInvitationResponse,
    summary="Access public invitation",
    description="Get a public invitation by slug. Returns protection requirements if needed.",
)
async def access_invitation(
    slug: str,
    request: Request,
    invitation_service: DigitalInvitationService = None,
):
    """
    Access a public invitation.

    If the invitation is password/PIN protected, returns requirements
    without the full invitation data.
    """
    if invitation_service is None:
        invitation_service = get_invitation_service()

    try:
        # Get invitation by slug
        invitation = await invitation_service.get_public_invitation(slug)

        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        # Check protection status
        requires_password = invitation.password_protected
        requires_pin = invitation.pin_protected

        if requires_password or requires_pin:
            return AccessInvitationResponse(
                access_granted=False,
                requires_password=requires_password,
                requires_pin=requires_pin,
                error=None,
            )

        # Track view
        client_ip = request.client.host if request.client else None
        await invitation_service.track_view(
            invitation.invitation_id,
            invitation.workspace_id,
            ip_address=client_ip,
        )

        # Return full invitation
        public_data = PublicInvitationResponse(
            invitation_id=invitation.invitation_id,
            title=invitation.title,
            description=invitation.description,
            event_type=invitation.event_type,
            event_datetime=invitation.event_datetime.isoformat() if invitation.event_datetime else None,
            event_end_datetime=invitation.event_end_datetime.isoformat() if invitation.event_end_datetime else None,
            event_timezone=invitation.event_timezone,
            venue=invitation.venue,
            host_names=invitation.host_names,
            cover_image_url=invitation.cover_image_url,
            gallery_images=[],  # TODO: Fetch from invitation_images
            rsvp_enabled=invitation.rsvp_settings.get("enabled", True),
            rsvp_deadline=invitation.rsvp_settings.get("deadline"),
            max_party_size=invitation.rsvp_settings.get("max_party_size", 1),
            collect_dietary=invitation.rsvp_settings.get("collect_dietary", False),
            collect_phone=invitation.rsvp_settings.get("collect_phone", False),
            custom_questions=invitation.rsvp_settings.get("custom_questions", []),
            primary_language=invitation.primary_language,
            secondary_language=invitation.secondary_language,
            content_i18n=invitation.content_i18n,
            template_layout=invitation.template_layout if hasattr(invitation, 'template_layout') else None,
            customization=invitation.customization,
        )

        return AccessInvitationResponse(
            access_granted=True,
            invitation=public_data,
            requires_password=False,
            requires_pin=False,
        )

    except InvitationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )


@router.post(
    "/{slug}/access",
    response_model=AccessInvitationResponse,
    summary="Verify password/PIN",
    description="Verify password or PIN to access a protected invitation.",
)
async def verify_access(
    slug: str,
    credentials: AccessInvitationRequest,
    request: Request,
    invitation_service: DigitalInvitationService = None,
):
    """
    Verify password/PIN and access protected invitation.
    """
    if invitation_service is None:
        invitation_service = get_invitation_service()

    try:
        # Verify credentials
        invitation = await invitation_service.verify_and_get_invitation(
            slug=slug,
            password=credentials.password,
            pin=credentials.pin,
        )

        if not invitation:
            return AccessInvitationResponse(
                access_granted=False,
                requires_password=True,
                requires_pin=True,
                error="Invalid password or PIN",
            )

        # Track view
        client_ip = request.client.host if request.client else None
        await invitation_service.track_view(
            invitation.invitation_id,
            invitation.workspace_id,
            ip_address=client_ip,
        )

        # Return full invitation
        public_data = PublicInvitationResponse(
            invitation_id=invitation.invitation_id,
            title=invitation.title,
            description=invitation.description,
            event_type=invitation.event_type,
            event_datetime=invitation.event_datetime.isoformat() if invitation.event_datetime else None,
            event_end_datetime=invitation.event_end_datetime.isoformat() if invitation.event_end_datetime else None,
            event_timezone=invitation.event_timezone,
            venue=invitation.venue,
            host_names=invitation.host_names,
            cover_image_url=invitation.cover_image_url,
            gallery_images=[],
            rsvp_enabled=invitation.rsvp_settings.get("enabled", True),
            rsvp_deadline=invitation.rsvp_settings.get("deadline"),
            max_party_size=invitation.rsvp_settings.get("max_party_size", 1),
            collect_dietary=invitation.rsvp_settings.get("collect_dietary", False),
            collect_phone=invitation.rsvp_settings.get("collect_phone", False),
            custom_questions=invitation.rsvp_settings.get("custom_questions", []),
            primary_language=invitation.primary_language,
            secondary_language=invitation.secondary_language,
            content_i18n=invitation.content_i18n,
            template_layout=invitation.template_layout if hasattr(invitation, 'template_layout') else None,
            customization=invitation.customization,
        )

        return AccessInvitationResponse(
            access_granted=True,
            invitation=public_data,
            requires_password=False,
            requires_pin=False,
        )

    except InvitationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )


# ---------------------------------------------------------------------------
# Turnstile Configuration (T124)
# ---------------------------------------------------------------------------


class TurnstileConfigResponse(BaseModel):
    """Turnstile CAPTCHA configuration for frontend."""

    enabled: bool = False
    site_key: Optional[str] = None


@router.get(
    "/config/turnstile",
    response_model=TurnstileConfigResponse,
    summary="Get Turnstile configuration",
    description="Get Turnstile CAPTCHA configuration for public forms.",
)
async def get_turnstile_config(
    turnstile_service: TurnstileService = None,
):
    """
    Get Turnstile CAPTCHA configuration.

    Returns whether Turnstile is enabled and the site key for rendering the widget.
    """
    if turnstile_service is None:
        turnstile_service = get_turnstile_service()

    is_enabled = turnstile_service.is_configured()
    site_key = TurnstileService.get_site_key() if is_enabled else None

    return TurnstileConfigResponse(
        enabled=is_enabled,
        site_key=site_key,
    )


# ---------------------------------------------------------------------------
# RSVP Submission
# ---------------------------------------------------------------------------


@router.post(
    "/{slug}/rsvp",
    response_model=RSVPSubmitResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit RSVP",
    description="Submit an RSVP response for a public invitation.",
)
async def submit_rsvp(
    slug: str,
    data: RSVPCreate,
    request: Request,
    invitation_service: DigitalInvitationService = None,
    rsvp_service: InvitationRSVPService = None,
    turnstile_service: TurnstileService = None,
):
    """
    Submit an RSVP response.

    Returns an edit token that can be used to update the response.

    If Turnstile CAPTCHA is configured (CLOUDFLARE_TURNSTILE_SECRET_KEY env var),
    a valid turnstile_token must be provided in the request body.
    """
    if invitation_service is None:
        invitation_service = get_invitation_service()
    if rsvp_service is None:
        rsvp_service = get_rsvp_service()
    if turnstile_service is None:
        turnstile_service = get_turnstile_service()

    try:
        # Get invitation by slug
        invitation = await invitation_service.get_public_invitation(slug)
        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        # Get client IP for rate limiting and Turnstile verification
        client_ip = request.client.host if request.client else None

        # T124: Verify Turnstile CAPTCHA if configured
        if turnstile_service.is_configured():
            if not data.turnstile_token:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CAPTCHA verification required",
                )

            try:
                result = await turnstile_service.verify(
                    token=data.turnstile_token,
                    ip_address=client_ip,
                )
                if not result.success:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="CAPTCHA verification failed. Please try again.",
                    )
            except TurnstileVerificationError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"CAPTCHA verification error: {str(e)}",
                )

        # Submit RSVP
        result = await rsvp_service.submit_rsvp(
            invitation_id=invitation.invitation_id,
            workspace_id=invitation.workspace_id,
            data=data,
            source=RSVPSource.WEB,
            ip_address=client_ip,
        )

        return result

    except InvitationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )
    except RSVPDeadlinePassedError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The RSVP deadline has passed",
        )
    except RSVPDuplicateError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )
    except RSVPServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ---------------------------------------------------------------------------
# RSVP Edit by Token
# ---------------------------------------------------------------------------


@router.get(
    "/rsvp/{edit_token}",
    response_model=RSVPResponse,
    summary="Get RSVP by token",
    description="Get RSVP details using the edit token.",
)
async def get_rsvp_by_token(
    edit_token: str,
    rsvp_service: InvitationRSVPService = None,
):
    """
    Get RSVP details by edit token.
    """
    if rsvp_service is None:
        rsvp_service = get_rsvp_service()

    try:
        return await rsvp_service.get_rsvp_by_token(edit_token)
    except InvalidEditTokenError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired edit token",
        )


@router.patch(
    "/rsvp/{edit_token}",
    response_model=RSVPResponse,
    summary="Update RSVP by token",
    description="Update an RSVP using the edit token.",
)
async def update_rsvp_by_token(
    edit_token: str,
    data: RSVPUpdate,
    rsvp_service: InvitationRSVPService = None,
):
    """
    Update an RSVP using the edit token.
    """
    if rsvp_service is None:
        rsvp_service = get_rsvp_service()

    try:
        return await rsvp_service.update_rsvp_by_token(edit_token, data)
    except InvalidEditTokenError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired edit token",
        )
    except RSVPDeadlinePassedError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The RSVP deadline has passed",
        )
    except RSVPServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ---------------------------------------------------------------------------
# Calendar Export (T076)
# ---------------------------------------------------------------------------


@router.get(
    "/{slug}/ics",
    response_model=ICSResponse,
    summary="Get ICS calendar data",
    description="Get ICS calendar data as JSON for client-side handling.",
)
async def get_invitation_ics(
    slug: str,
    invitation_service: DigitalInvitationService = None,
):
    """
    Get ICS calendar data as JSON response.

    Use /calendar endpoint for direct file download.
    """
    if invitation_service is None:
        invitation_service = get_invitation_service()

    try:
        invitation = await invitation_service.get_public_invitation(slug)
        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        # Check if calendar service is available
        if is_calendar_available():
            # Use CalendarService for proper RFC 5545 compliance
            calendar_service = get_calendar_service()
            invitation_dict = _invitation_to_dict(invitation)
            ics_bytes, filename = calendar_service.generate_invitation_ics(invitation_dict)
            ics_content = ics_bytes.decode("utf-8")
        else:
            # Fallback to simple ICS generation
            ics_content = _generate_simple_ics(invitation)
            filename = f"{invitation.slug or invitation.invitation_id}.ics"

        return ICSResponse(
            ics_content=ics_content,
            filename=filename,
            content_type="text/calendar",
        )

    except InvitationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )


@router.get(
    "/{slug}/calendar",
    summary="Download calendar file",
    description="Download an iCalendar (.ics) file for adding the event to your calendar.",
)
async def download_public_calendar(
    slug: str,
    invitation_service: DigitalInvitationService = None,
):
    """
    Download an iCalendar file for the invitation event.

    This is the public endpoint for guests to add the event to their calendar.
    Generates an RFC 5545 compliant .ics file with:
    - Event date/time with timezone support
    - Venue location with geo coordinates
    - Reminder alarms (1 day and 1 hour before)
    - Public URL link to invitation
    """
    if invitation_service is None:
        invitation_service = get_invitation_service()

    try:
        invitation = await invitation_service.get_public_invitation(slug)
        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        # Check if event datetime is set
        if not invitation.event_datetime:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Event date not set for this invitation.",
            )

        # Generate calendar file
        if is_calendar_available():
            try:
                calendar_service = get_calendar_service()
                invitation_dict = _invitation_to_dict(invitation)
                ics_bytes, filename = calendar_service.generate_invitation_ics(invitation_dict)
            except CalendarServiceError:
                # Fallback to simple ICS
                ics_content = _generate_simple_ics(invitation)
                ics_bytes = ics_content.encode("utf-8")
                filename = f"{invitation.slug or invitation.invitation_id}.ics"
        else:
            # Fallback to simple ICS generation
            ics_content = _generate_simple_ics(invitation)
            ics_bytes = ics_content.encode("utf-8")
            filename = f"{invitation.slug or invitation.invitation_id}.ics"

        return StreamingResponse(
            io.BytesIO(ics_bytes),
            media_type="text/calendar",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "text/calendar; charset=utf-8",
            },
        )

    except InvitationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )


def _invitation_to_dict(invitation) -> dict:
    """Convert invitation object to dict for CalendarService."""
    venue = invitation.venue or {}
    return {
        "invitation_id": str(invitation.invitation_id),
        "title": invitation.title,
        "description": invitation.description,
        "event_datetime": invitation.event_datetime,
        "event_end_datetime": invitation.event_end_datetime,
        "event_timezone": invitation.event_timezone or "Asia/Kolkata",
        "venue": venue,
        "host_names": invitation.host_names,
        "host_contact_email": getattr(invitation, "host_contact_email", None),
        "public_url": invitation.public_url,
    }


def _generate_simple_ics(invitation) -> str:
    """Generate simple ICS calendar content (fallback when icalendar not installed)."""
    # Format dates
    start_dt = invitation.event_datetime
    end_dt = invitation.event_end_datetime or start_dt

    # Format for ICS (YYYYMMDDTHHMMSSZ)
    def format_ics_date(dt):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.strftime("%Y%m%dT%H%M%SZ")

    start_str = format_ics_date(start_dt)
    end_str = format_ics_date(end_dt)
    now_str = format_ics_date(datetime.now(timezone.utc))

    # Build location string
    venue = invitation.venue or {}
    location_parts = []
    if venue.get("name"):
        location_parts.append(venue["name"])
    if venue.get("address"):
        location_parts.append(venue["address"])
    if venue.get("city"):
        location_parts.append(venue["city"])
    if venue.get("state"):
        location_parts.append(venue["state"])
    if venue.get("country"):
        location_parts.append(venue["country"])
    location = ", ".join(location_parts)

    # Generate ICS
    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//RawDrive//Digital Invitations//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{invitation.invitation_id}@rawdrive.ai",
        f"DTSTAMP:{now_str}",
        f"DTSTART:{start_str}",
        f"DTEND:{end_str}",
        f"SUMMARY:{invitation.title}",
    ]

    if invitation.description:
        # Escape special characters in description
        desc = invitation.description.replace("\n", "\\n").replace(",", "\\,")
        ics_lines.append(f"DESCRIPTION:{desc}")

    if location:
        ics_lines.append(f"LOCATION:{location}")

    if invitation.public_url:
        ics_lines.append(f"URL:{invitation.public_url}")

    # Add alarm (1 day before)
    ics_lines.extend([
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Event reminder",
        "TRIGGER:-P1D",
        "END:VALARM",
    ])

    ics_lines.extend([
        "END:VEVENT",
        "END:VCALENDAR",
    ])

    return "\r\n".join(ics_lines)
