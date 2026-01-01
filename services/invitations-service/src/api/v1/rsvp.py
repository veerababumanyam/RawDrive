"""
RSVP API routes for the Invitations Microservice.

Public-facing RSVP submission endpoints with rate limiting.

Security:
- Edit tokens are HMAC-SHA256 signed for integrity
- Token verification uses constant-time comparison
- Rate limiting prevents abuse (10/min per IP)
"""

from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator

from src.logging import get_logger
from src.services.rsvp_service import RSVPService

logger = get_logger(__name__)
router = APIRouter(tags=["RSVP"])


# =============================================================================
# Request/Response Schemas
# =============================================================================


class RSVPSubmission(BaseModel):
    """RSVP submission from a guest."""

    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    status: str = Field(..., pattern="^(yes|no|maybe)$")
    plus_ones: int = Field(0, ge=0, le=10)
    dietary_restrictions: Optional[str] = Field(None, max_length=500)
    message: Optional[str] = Field(None, max_length=1000)

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        """Ensure name is not just whitespace."""
        if not v.strip():
            raise ValueError("Name cannot be empty or whitespace")
        return v.strip()

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        """Basic phone validation - strip non-digits except + for country code."""
        if v is None:
            return None
        cleaned = "".join(c for c in v if c.isdigit() or c == "+")
        if len(cleaned) < 7:
            raise ValueError("Phone number too short")
        return cleaned


class RSVPUpdate(BaseModel):
    """Request schema for RSVP updates."""

    status: Optional[str] = Field(None, pattern="^(yes|no|maybe)$")
    plus_ones: Optional[int] = Field(None, ge=0, le=10)
    dietary_restrictions: Optional[str] = Field(None, max_length=500)
    message: Optional[str] = Field(None, max_length=1000)


class RSVPResponse(BaseModel):
    """Response after RSVP submission."""

    rsvp_id: str
    invitation_slug: str
    status: str
    edit_token: Optional[str] = None
    message: str


class RSVPDetails(BaseModel):
    """Full RSVP details with edit capability."""

    rsvp_id: str
    name: str
    email: Optional[str] = None
    status: str
    plus_ones: int = 0
    dietary_restrictions: Optional[str] = None
    message: Optional[str] = None
    submitted_at: Optional[str] = None
    updated_at: Optional[str] = None


# =============================================================================
# Endpoints
# =============================================================================


@router.post(
    "/invitations/{slug}/rsvp",
    response_model=RSVPResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit RSVP",
)
async def submit_rsvp(
    slug: str,
    rsvp: RSVPSubmission,
    request: Request,
):
    """
    Submit an RSVP response for a public invitation.

    Rate limit: 10 submissions per minute per IP.

    Returns an edit_token that can be used to view or update your response later.
    Keep this token safe - it's the only way to modify your RSVP.
    """
    # Get client IP for rate limiting and audit logging
    ip_address = request.client.host if request.client else None

    service = RSVPService()

    # Look up invitation by slug to get workspace_id and invitation_id
    invitation = await service.get_invitation_by_slug(slug)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found or expired",
        )

    workspace_id = str(invitation["workspace_id"])
    invitation_id = str(invitation["invitation_id"])

    try:
        result = await service.submit_rsvp(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            submission=rsvp.model_dump(exclude_none=True),
            ip_address=ip_address,
        )

        logger.info(
            "rsvp_submitted",
            slug=slug,
            status=rsvp.status,
        )

        return RSVPResponse(
            rsvp_id=result["rsvp_id"],
            invitation_slug=result.get("invitation_slug", slug),
            status=result["status"],
            edit_token=result.get("edit_token"),
            message=result.get("message", "Thank you for your RSVP!"),
        )

    except Exception as e:
        logger.error(
            "rsvp_submit_failed",
            slug=slug,
            error_type=type(e).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit RSVP. Please try again.",
        )


@router.get(
    "/invitations/{slug}/rsvp/{rsvp_id}",
    response_model=RSVPDetails,
    summary="Get RSVP details",
)
async def get_rsvp_status(
    slug: str,
    rsvp_id: str,
    x_edit_token: str = Header(..., alias="X-Edit-Token"),
):
    """
    Get the current details of an RSVP.

    Requires the X-Edit-Token header with the token provided when the RSVP was submitted.
    Email addresses are partially masked for privacy.
    """
    service = RSVPService()

    result = await service.get_rsvp(
        guest_id=rsvp_id,
        edit_token=x_edit_token,
    )

    if not result:
        logger.warning(
            "rsvp_get_failed",
            slug=slug,
            rsvp_id=rsvp_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RSVP not found or edit token invalid/expired",
        )

    return RSVPDetails(
        rsvp_id=result["rsvp_id"],
        name=result["name"],
        email=result.get("email"),
        status=result["status"],
        plus_ones=result.get("plus_ones", 0),
        dietary_restrictions=result.get("dietary_restrictions"),
        message=result.get("message"),
        submitted_at=str(result.get("submitted_at")) if result.get("submitted_at") else None,
        updated_at=str(result.get("updated_at")) if result.get("updated_at") else None,
    )


@router.patch(
    "/invitations/{slug}/rsvp/{rsvp_id}",
    response_model=RSVPDetails,
    summary="Update RSVP",
)
async def update_rsvp(
    slug: str,
    rsvp_id: str,
    rsvp: RSVPUpdate,
    request: Request,
    x_edit_token: str = Header(..., alias="X-Edit-Token"),
):
    """
    Update an existing RSVP response.

    Requires the X-Edit-Token header with the token provided when the RSVP was submitted.
    Only the fields provided in the request body will be updated.
    """
    ip_address = request.client.host if request.client else None

    # Get only the fields that were actually provided
    updates = rsvp.model_dump(exclude_none=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No updates provided",
        )

    service = RSVPService()

    result = await service.update_rsvp(
        guest_id=rsvp_id,
        edit_token=x_edit_token,
        updates=updates,
        ip_address=ip_address,
    )

    if not result:
        logger.warning(
            "rsvp_update_failed",
            slug=slug,
            rsvp_id=rsvp_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RSVP not found or edit token invalid/expired",
        )

    logger.info(
        "rsvp_updated",
        slug=slug,
        rsvp_id=rsvp_id,
    )

    return RSVPDetails(
        rsvp_id=result.get("guest_id", rsvp_id),
        name=result.get("name", ""),
        email=result.get("email"),
        status=result.get("status", ""),
        plus_ones=result.get("plus_ones", 0),
        dietary_restrictions=result.get("dietary_restrictions"),
        message=result.get("message"),
        submitted_at=str(result.get("submitted_at")) if result.get("submitted_at") else None,
        updated_at=str(result.get("updated_at")) if result.get("updated_at") else None,
    )
