"""
Public Magic Link API Endpoints.

Endpoints for validating and interacting with magic links (no authentication required).
"""

from fastapi import APIRouter, HTTPException, Request
from typing import Optional

from src.services.magic_link_service import (
    get_magic_link_service,
    MagicLinkError,
)
from src.schemas.magic_link import (
    MagicLinkValidateResponse,
    PinVerifyRequest,
    PinVerifyResponse,
    PasswordVerifyRequest,
    PasswordVerifyResponse,
)
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


def get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# =============================================================================
# Magic Link Validation Endpoints (Public)
# =============================================================================


@router.get("/{token}", response_model=MagicLinkValidateResponse)
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
