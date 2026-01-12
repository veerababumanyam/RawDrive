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
