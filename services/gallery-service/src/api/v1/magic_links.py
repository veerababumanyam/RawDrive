"""
Magic Link API Endpoints.

Authenticated endpoints for managing magic links.
"""

from fastapi import APIRouter, Depends, Header, Query, Request
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
)
from src.api.v1.errors import (
    raise_http_exception,
    ErrorCode,
    ErrorMessage,
    get_request_id,
    exception_to_error_response,
)
from src.log_config import get_logger
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


# =============================================================================
# Magic Link Endpoints (Authenticated)
# =============================================================================


@router.post("", response_model=MagicLinkResponse)
async def create_magic_link(
    request: Request,
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
    request_id = get_request_id(request)
    magic_link_service = get_magic_link_service()

    try:
        expires_at = None
        if data.expires_at:
            try:
                expires_at = datetime.fromisoformat(data.expires_at.replace("Z", "+00:00"))
            except ValueError:
                raise_http_exception(
                    ErrorCode.INVALID_FORMAT,
                    ErrorMessage.INVALID_FORMAT,
                    details={"field": "expires_at", "value": data.expires_at},
                    request_id=request_id
                )

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
        error_response = exception_to_error_response(e, request_id)
        from fastapi import HTTPException
        raise HTTPException(
            status_code=getattr(e, 'status', 500),
            content=error_response.model_dump()
        )
