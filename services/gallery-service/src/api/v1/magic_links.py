"""
Magic Link API Endpoints.

Authenticated endpoints for managing magic links.
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from typing import Optional
from datetime import datetime

from src.services.magic_link_service import (
    get_magic_link_service,
    MagicLinkError,
    MagicLinkNotFoundError,
)
from src.schemas.magic_link import (
    MagicLinkResponse,
    MagicLinkCreateRequest,
    MagicLinkValidateResponse,
    PinVerifyRequest,
    PinVerifyResponse,
    PasswordVerifyRequest,
    PasswordVerifyResponse,
)
from src.logging import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# =============================================================================
# Dependencies
# =============================================================================


async def get_workspace_id(
    x_workspace_id: str = Header(..., alias="X-Workspace-ID"),
) -> str:
    """Extract workspace ID from header."""
    return x_workspace_id


async def get_user_id(
    x_user_id: str = Header(None, alias="X-User-ID"),
) -> Optional[str]:
    """Extract user ID from header."""
    return x_user_id


def get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# =============================================================================
# Magic Link Endpoints (Authenticated)
# =============================================================================


@router.post("", response_model=MagicLinkResponse)
async def create_magic_link(
    data: MagicLinkCreateRequest,
    workspace_id: str = Depends(get_workspace_id),
    user_id: str = Depends(get_user_id),
):
    """
    Create a new magic link for a gallery.

    The magic link can be optionally protected with:
    - PIN (4-8 digits)
    - Password
    - Expiration date
    - View limit
    """
    magic_link_service = get_magic_link_service()

    try:
        expires_at = None
        if data.expires_at:
            expires_at = datetime.fromisoformat(data.expires_at.replace("Z", "+00:00"))

        result = await magic_link_service.create_magic_link(
            workspace_id=workspace_id,
            gallery_id=data.gallery_id,
            created_by_user_id=user_id or "system",
            expires_at=expires_at,
            max_views=data.max_views,
            pin=data.pin,
            password=data.password,
        )
        return result
    except MagicLinkError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


# =============================================================================
# Magic Link Validation Endpoints (Public)
# =============================================================================


@router.get("/{token}/validate", response_model=MagicLinkValidateResponse)
async def validate_magic_link(token: str):
    """
    Validate a magic link token.

    Returns whether the link is valid and what protection it requires.
    This endpoint is public (no authentication required).
    """
    magic_link_service = get_magic_link_service()
    result = await magic_link_service.validate_magic_link(token)
    return result


@router.post("/{token}/verify-pin", response_model=PinVerifyResponse)
async def verify_magic_link_pin(
    token: str,
    data: PinVerifyRequest,
    request: Request,
):
    """
    Verify PIN for a protected magic link.

    Rate limited to prevent brute force attacks.
    Returns an access token on success.
    """
    magic_link_service = get_magic_link_service()
    client_ip = get_client_ip(request)

    try:
        result = await magic_link_service.verify_pin(
            token=token,
            pin=data.pin,
            client_ip=client_ip,
        )
        return result
    except MagicLinkError as e:
        response_data = {"error": e.code, "message": str(e)}
        if hasattr(e, "attempts_remaining"):
            response_data["attempts_remaining"] = e.attempts_remaining
        if hasattr(e, "locked_until") and e.locked_until:
            response_data["locked_until"] = e.locked_until.isoformat()
        raise HTTPException(status_code=e.status, detail=response_data)


@router.post("/{token}/verify-password", response_model=PasswordVerifyResponse)
async def verify_magic_link_password(
    token: str,
    data: PasswordVerifyRequest,
    request: Request,
):
    """
    Verify password for a protected magic link.

    Rate limited to prevent brute force attacks.
    Returns an access token on success.
    """
    magic_link_service = get_magic_link_service()
    client_ip = get_client_ip(request)

    try:
        result = await magic_link_service.verify_password(
            token=token,
            password=data.password,
            client_ip=client_ip,
        )
        return result
    except MagicLinkError as e:
        response_data = {"error": e.code, "message": str(e)}
        if hasattr(e, "attempts_remaining"):
            response_data["attempts_remaining"] = e.attempts_remaining
        if hasattr(e, "locked_until") and e.locked_until:
            response_data["locked_until"] = e.locked_until.isoformat()
        raise HTTPException(status_code=e.status, detail=response_data)
