"""
Public Gallery API Endpoints.

No authentication required - accessed via magic links.
Uses read replicas for high-throughput 50K concurrent users.
"""

from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional

from src.services.gallery_service import (
    get_gallery_service,
    GalleryNotFoundError,
    GalleryError,
)
from src.services.magic_link_service import get_magic_link_service
from src.schemas.gallery import (
    GalleryResponse,
    GalleryAssetsListResponse,
)
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# =============================================================================
# Access Token Verification
# =============================================================================


async def verify_gallery_access(
    gallery_id: str,
    x_access_token: Optional[str] = Header(None, alias="X-Access-Token"),
    x_magic_link_token: Optional[str] = Header(None, alias="X-Magic-Link-Token"),
) -> dict:
    """Verify access to a gallery via magic link token or access token.

    For protected galleries, requires either:
    - X-Access-Token: Obtained after PIN/password verification
    - X-Magic-Link-Token: For unprotected galleries

    Returns gallery access info.
    """
    magic_link_service = get_magic_link_service()

    if x_magic_link_token:
        # Validate magic link
        validation = await magic_link_service.validate_magic_link(x_magic_link_token)

        if not validation["valid"]:
            raise HTTPException(
                status_code=403,
                detail={"error": "ACCESS_DENIED", "message": "Invalid or expired magic link"}
            )

        if validation["gallery_id"] != gallery_id:
            raise HTTPException(
                status_code=403,
                detail={"error": "ACCESS_DENIED", "message": "Magic link does not match gallery"}
            )

        # Check if protected
        if validation["requires_pin"] or validation["requires_password"]:
            if not x_access_token:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "VERIFICATION_REQUIRED",
                        "message": "Gallery requires PIN or password verification",
                        "requires_pin": validation["requires_pin"],
                        "requires_password": validation["requires_password"],
                    }
                )

        # Increment view count
        await magic_link_service.increment_view_count(x_magic_link_token)

        return {"gallery_id": gallery_id, "token": x_magic_link_token}

    raise HTTPException(
        status_code=401,
        detail={"error": "UNAUTHORIZED", "message": "Magic link token required"}
    )


# =============================================================================
# Public Gallery Endpoints
# =============================================================================


@router.get("/{gallery_id}")
async def get_public_gallery(
    gallery_id: str,
    x_access_token: Optional[str] = Header(None, alias="X-Access-Token"),
    x_magic_link_token: Optional[str] = Header(None, alias="X-Magic-Link-Token"),
):
    """
    Get public gallery details.

    Requires valid magic link token.
    For protected galleries, also requires access token from verification.
    """
    # Verify access
    await verify_gallery_access(
        gallery_id=gallery_id,
        x_access_token=x_access_token,
        x_magic_link_token=x_magic_link_token,
    )

    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.get_public_gallery(gallery_id=gallery_id)
        return result
    except GalleryNotFoundError:
        raise HTTPException(
            status_code=404,
            detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found or not published"}
        )
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.get("/{gallery_id}/assets")
async def get_public_gallery_assets(
    gallery_id: str,
    x_access_token: Optional[str] = Header(None, alias="X-Access-Token"),
    x_magic_link_token: Optional[str] = Header(None, alias="X-Magic-Link-Token"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    sub_gallery_id: Optional[str] = Query(None),
):
    """
    Get public gallery assets with pagination.

    Returns visible assets only.
    Uses read replica for high throughput.
    """
    # Verify access
    await verify_gallery_access(
        gallery_id=gallery_id,
        x_access_token=x_access_token,
        x_magic_link_token=x_magic_link_token,
    )

    gallery_service = get_gallery_service()

    try:
        # Get gallery to find workspace_id
        gallery = await gallery_service.get_public_gallery(gallery_id=gallery_id)
        workspace_id = gallery["workspace_id"]

        result = await gallery_service.list_gallery_assets(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            page=page,
            limit=limit,
            sub_gallery_id=sub_gallery_id,
        )
        return result
    except GalleryNotFoundError:
        raise HTTPException(
            status_code=404,
            detail={"error": "GALLERY_NOT_FOUND", "message": "Gallery not found or not published"}
        )
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})
