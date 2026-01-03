"""
Public Invitations API

Public (unauthenticated) endpoints for viewing invitations and submitting RSVPs.

Feature: 016-save-the-date
"""

import io
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.digital_invitation_service import (
    get_invitation_service,
    InvitationNotFoundError,
)
from app.services.magic_link_service import (
    get_magic_link_service,
    LinkNotFoundError,
    LinkExpiredError,
    LinkRevokedError,
)
from app.services.calendar_service import (
    get_calendar_service,
    is_calendar_available,
    CalendarServiceError,
)
from app.services.invitation_rsvp_service import (
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
):
    """
    Access a public invitation.

    If the invitation is password/PIN protected, returns requirements
    without the full invitation data.
    """
    invitation_service = get_invitation_service()

    try:
        # Get invitation by slug
        invitation_dict = await invitation_service.get_public_invitation(slug)

        if not invitation_dict:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        # Convert dict to object for attribute access
        invitation = SimpleNamespace(**invitation_dict)

        # Check protection status
        requires_password = getattr(invitation, 'password_protected', False)
        requires_pin = getattr(invitation, 'pin_protected', False)

        if requires_password or requires_pin:
            return AccessInvitationResponse(
                access_granted=False,
                requires_password=requires_password,
                requires_pin=requires_pin,
                error=None,
            )

        # Note: View tracking is handled internally by get_public_invitation

        # Return full invitation
        public_data = PublicInvitationResponse(
            invitation_id=invitation.invitation_id,
            title=invitation.title,
            description=getattr(invitation, 'description', None),
            event_type=invitation.event_type,
            event_datetime=invitation.event_datetime.isoformat() if getattr(invitation, 'event_datetime', None) else None,
            event_end_datetime=invitation.event_end_datetime.isoformat() if getattr(invitation, 'event_end_datetime', None) else None,
            event_timezone=getattr(invitation, 'event_timezone', 'UTC'),
            venue=getattr(invitation, 'venue', {}),
            host_names=getattr(invitation, 'host_names', None) or [],
            cover_image_url=getattr(invitation, 'cover_image_url', None),
            gallery_images=getattr(invitation, 'gallery_images', []) or [],
            rsvp_enabled=getattr(invitation, 'rsvp_settings', {}).get("enabled", True),
            rsvp_deadline=getattr(invitation, 'rsvp_settings', {}).get("deadline"),
            max_party_size=getattr(invitation, 'rsvp_settings', {}).get("max_party_size", 1),
            collect_dietary=getattr(invitation, 'rsvp_settings', {}).get("collect_dietary", False),
            collect_phone=getattr(invitation, 'rsvp_settings', {}).get("collect_phone", False),
            custom_questions=getattr(invitation, 'rsvp_settings', {}).get("custom_questions", []),
            primary_language=getattr(invitation, 'primary_language', 'en'),
            secondary_language=getattr(invitation, 'secondary_language', None),
            content_i18n=getattr(invitation, 'content_i18n', {}),
            template_layout=getattr(invitation, 'template_layout', None),
            customization=getattr(invitation, 'customization', {}),
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


@router.get(
    "/token/{token}",
    response_model=AccessInvitationResponse,
    summary="Access invitation via magic link token",
    description="Get a public invitation using a magic link token. Used for /i/{token} URLs.",
)
async def access_invitation_by_token(
    token: str,
    request: Request,
):
    """
    Access a public invitation via magic link token.

    This endpoint resolves a magic link token to an invitation and returns
    the public invitation data. Used when accessing invitations via the
    /i/{token} URL pattern.
    """
    magic_link_service = get_magic_link_service()
    invitation_service = get_invitation_service()

    try:
        # Validate token and get invitation_id
        link_data = await magic_link_service.validate_invitation_token(
            token=token,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            referer=request.headers.get("referer"),
        )

        invitation_id = link_data.get("invitation_id")
        workspace_id = link_data.get("workspace_id")
        if not invitation_id or not workspace_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        # Get the invitation by ID (not slug)
        invitation_dict = await invitation_service.get_public_invitation_by_id(
            invitation_id=UUID(invitation_id),
            workspace_id=UUID(workspace_id),
        )

        if not invitation_dict:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        # Convert dict to object for attribute access
        invitation = SimpleNamespace(**invitation_dict)

        # Check protection status
        requires_password = getattr(invitation, 'password_protected', False)
        requires_pin = getattr(invitation, 'pin_protected', False)

        if requires_password or requires_pin:
            return AccessInvitationResponse(
                access_granted=False,
                requires_password=requires_password,
                requires_pin=requires_pin,
                error=None,
            )

        # Return full invitation
        public_data = PublicInvitationResponse(
            invitation_id=invitation.invitation_id,
            title=invitation.title,
            description=getattr(invitation, 'description', None),
            event_type=invitation.event_type,
            event_datetime=invitation.event_datetime.isoformat() if getattr(invitation, 'event_datetime', None) else None,
            event_end_datetime=invitation.event_end_datetime.isoformat() if getattr(invitation, 'event_end_datetime', None) else None,
            event_timezone=getattr(invitation, 'event_timezone', 'UTC'),
            venue=getattr(invitation, 'venue', {}),
            host_names=getattr(invitation, 'host_names', None) or [],
            cover_image_url=getattr(invitation, 'cover_image_url', None),
            gallery_images=getattr(invitation, 'gallery_images', []) or [],
            rsvp_enabled=getattr(invitation, 'rsvp_settings', {}).get("enabled", True),
            rsvp_deadline=getattr(invitation, 'rsvp_settings', {}).get("deadline"),
            max_party_size=getattr(invitation, 'rsvp_settings', {}).get("max_party_size", 1),
            collect_dietary=getattr(invitation, 'rsvp_settings', {}).get("collect_dietary", False),
            collect_phone=getattr(invitation, 'rsvp_settings', {}).get("collect_phone", False),
            custom_questions=getattr(invitation, 'rsvp_settings', {}).get("custom_questions", []),
            primary_language=getattr(invitation, 'primary_language', 'en'),
            secondary_language=getattr(invitation, 'secondary_language', None),
            content_i18n=getattr(invitation, 'content_i18n', {}),
            template_layout=getattr(invitation, 'template_layout', None),
            customization=getattr(invitation, 'customization', {}),
        )

        return AccessInvitationResponse(
            access_granted=True,
            invitation=public_data,
            requires_password=False,
            requires_pin=False,
        )

    except LinkNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired invitation link",
        )
    except LinkExpiredError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation link has expired",
        )
    except LinkRevokedError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation link is no longer valid",
        )
    except InvitationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )


@router.get(
    "/token/{token}/calendar",
    summary="Download calendar file via magic link token",
    description="Download an iCalendar (.ics) file using magic link token access.",
)
async def download_calendar_by_token(
    token: str,
    request: Request,
):
    """
    Download an iCalendar file for the invitation via magic link token.

    This endpoint allows guests who accessed via magic link to download
    the calendar file without needing the invitation slug.
    """
    magic_link_service = get_magic_link_service()
    invitation_service = get_invitation_service()

    try:
        # Validate token and get invitation_id
        link_data = await magic_link_service.validate_invitation_token(
            token=token,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            referer=request.headers.get("referer"),
        )

        invitation_id = link_data.get("invitation_id")
        workspace_id = link_data.get("workspace_id")
        if not invitation_id or not workspace_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        # Get the invitation by ID
        invitation_dict = await invitation_service.get_public_invitation_by_id(
            invitation_id=UUID(invitation_id),
            workspace_id=UUID(workspace_id),
        )

        if not invitation_dict:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        invitation = invitation_dict

        # Check if event datetime is set
        event_datetime = invitation.get("event_datetime")
        if not event_datetime:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Event date not set for this invitation.",
            )

        # Generate calendar file
        if is_calendar_available():
            try:
                calendar_service = get_calendar_service()
                ics_bytes, filename = calendar_service.generate_invitation_ics(invitation)
            except CalendarServiceError:
                # Fallback to simple ICS
                ics_content = _generate_simple_ics(invitation)
                ics_bytes = ics_content.encode("utf-8")
                filename = f"{invitation.get('invitation_id')}.ics"
        else:
            # Fallback to simple ICS generation
            ics_content = _generate_simple_ics(invitation)
            ics_bytes = ics_content.encode("utf-8")
            filename = f"{invitation.get('invitation_id')}.ics"

        return StreamingResponse(
            io.BytesIO(ics_bytes),
            media_type="text/calendar",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "text/calendar; charset=utf-8",
            },
        )

    except LinkNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired link",
        )
    except LinkExpiredError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This link has expired",
        )
    except LinkRevokedError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation link is no longer valid",
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
):
    """
    Verify password/PIN and access protected invitation.
    """
    invitation_service = get_invitation_service()

    try:
        # Verify credentials
        invitation_dict = await invitation_service.verify_and_get_invitation(
            slug=slug,
            password=credentials.password,
            pin=credentials.pin,
        )

        if not invitation_dict:
            return AccessInvitationResponse(
                access_granted=False,
                requires_password=True,
                requires_pin=True,
                error="Invalid password or PIN",
            )

        # Convert dict to object for attribute access
        invitation = SimpleNamespace(**invitation_dict)

        # Note: View tracking is handled internally by verify_and_get_invitation

        # Return full invitation
        public_data = PublicInvitationResponse(
            invitation_id=invitation.invitation_id,
            title=invitation.title,
            description=getattr(invitation, 'description', None),
            event_type=invitation.event_type,
            event_datetime=invitation.event_datetime.isoformat() if getattr(invitation, 'event_datetime', None) else None,
            event_end_datetime=invitation.event_end_datetime.isoformat() if getattr(invitation, 'event_end_datetime', None) else None,
            event_timezone=getattr(invitation, 'event_timezone', 'UTC'),
            venue=getattr(invitation, 'venue', {}),
            host_names=getattr(invitation, 'host_names', None) or [],
            cover_image_url=getattr(invitation, 'cover_image_url', None),
            gallery_images=getattr(invitation, 'gallery_images', []) or [],
            rsvp_enabled=getattr(invitation, 'rsvp_settings', {}).get("enabled", True),
            rsvp_deadline=getattr(invitation, 'rsvp_settings', {}).get("deadline"),
            max_party_size=getattr(invitation, 'rsvp_settings', {}).get("max_party_size", 1),
            collect_dietary=getattr(invitation, 'rsvp_settings', {}).get("collect_dietary", False),
            collect_phone=getattr(invitation, 'rsvp_settings', {}).get("collect_phone", False),
            custom_questions=getattr(invitation, 'rsvp_settings', {}).get("custom_questions", []),
            primary_language=getattr(invitation, 'primary_language', 'en'),
            secondary_language=getattr(invitation, 'secondary_language', None),
            content_i18n=getattr(invitation, 'content_i18n', {}),
            template_layout=getattr(invitation, 'template_layout', None),
            customization=getattr(invitation, 'customization', {}),
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
async def get_turnstile_config():
    """
    Get Turnstile CAPTCHA configuration.

    Returns whether Turnstile is enabled and the site key for rendering the widget.
    """
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
):
    """
    Submit an RSVP response.

    Returns an edit token that can be used to update the response.

    If Turnstile CAPTCHA is configured (CLOUDFLARE_TURNSTILE_SECRET_KEY env var),
    a valid turnstile_token must be provided in the request body.
    """
    invitation_service = get_invitation_service()
    rsvp_service = get_rsvp_service()
    turnstile_service = get_turnstile_service()

    try:
        # Get invitation by slug
        invitation_dict = await invitation_service.get_public_invitation(slug)
        if not invitation_dict:
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
            invitation_id=invitation_dict["invitation_id"],
            workspace_id=invitation_dict["workspace_id"],
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
):
    """
    Get RSVP details by edit token.
    """
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
):
    """
    Update an RSVP using the edit token.
    """
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
):
    """
    Get ICS calendar data as JSON response.

    Use /calendar endpoint for direct file download.
    """
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
            slug_val = invitation.get("slug") if isinstance(invitation, dict) else invitation.slug
            inv_id = invitation.get("invitation_id") if isinstance(invitation, dict) else invitation.invitation_id
            filename = f"{slug_val or inv_id}.ics"

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
    invitation_service = get_invitation_service()

    try:
        invitation = await invitation_service.get_public_invitation(slug)
        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found",
            )

        # Check if event datetime is set
        event_datetime = invitation.get("event_datetime") if isinstance(invitation, dict) else invitation.event_datetime
        if not event_datetime:
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
                slug_val = invitation.get("slug") if isinstance(invitation, dict) else invitation.slug
                inv_id = invitation.get("invitation_id") if isinstance(invitation, dict) else invitation.invitation_id
                filename = f"{slug_val or inv_id}.ics"
        else:
            # Fallback to simple ICS generation
            ics_content = _generate_simple_ics(invitation)
            ics_bytes = ics_content.encode("utf-8")
            slug_val = invitation.get("slug") if isinstance(invitation, dict) else invitation.slug
            inv_id = invitation.get("invitation_id") if isinstance(invitation, dict) else invitation.invitation_id
            filename = f"{slug_val or inv_id}.ics"

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
    """Convert invitation object/dict to dict for CalendarService."""
    # Handle both dict and object access patterns
    def get_val(key, default=None):
        if isinstance(invitation, dict):
            return invitation.get(key, default)
        return getattr(invitation, key, default)

    venue = get_val("venue") or {}
    return {
        "invitation_id": str(get_val("invitation_id")),
        "title": get_val("title"),
        "description": get_val("description"),
        "event_datetime": get_val("event_datetime"),
        "event_end_datetime": get_val("event_end_datetime"),
        "event_timezone": get_val("event_timezone") or "Asia/Kolkata",
        "venue": venue,
        "host_names": get_val("host_names"),
        "host_contact_email": get_val("host_contact_email"),
        "public_url": get_val("public_url"),
    }


def _generate_simple_ics(invitation) -> str:
    """Generate simple ICS calendar content (fallback when icalendar not installed)."""
    # Handle both dict and object access patterns
    def get_val(key, default=None):
        if isinstance(invitation, dict):
            return invitation.get(key, default)
        return getattr(invitation, key, default)

    # Format dates
    start_dt = get_val("event_datetime")
    end_dt = get_val("event_end_datetime") or start_dt

    # Format for ICS (YYYYMMDDTHHMMSSZ)
    def format_ics_date(dt):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.strftime("%Y%m%dT%H%M%SZ")

    start_str = format_ics_date(start_dt)
    end_str = format_ics_date(end_dt)
    now_str = format_ics_date(datetime.now(timezone.utc))

    # Build location string
    venue = get_val("venue") or {}
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

    invitation_id = get_val("invitation_id")
    title = get_val("title")
    description = get_val("description")
    public_url = get_val("public_url")

    # Generate ICS
    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//RawDrive//Digital Invitations//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{invitation_id}@rawdrive.ai",
        f"DTSTAMP:{now_str}",
        f"DTSTART:{start_str}",
        f"DTEND:{end_str}",
        f"SUMMARY:{title}",
    ]

    if description:
        # Escape special characters in description
        desc = description.replace("\n", "\\n").replace(",", "\\,")
        ics_lines.append(f"DESCRIPTION:{desc}")

    if location:
        ics_lines.append(f"LOCATION:{location}")

    if public_url:
        ics_lines.append(f"URL:{public_url}")

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
