"""
Public Gallery API Endpoints.

No authentication required - accessed via magic links.
Uses read replicas for high-throughput 50K concurrent users.
"""

from fastapi import APIRouter, Header, Query, Request, Body
from typing import Optional
from pydantic import BaseModel
from uuid import UUID

from src.services.gallery_service import (
    get_gallery_service,
    GalleryNotFoundError,
    GalleryError,
)
from src.services.magic_link_service import get_magic_link_service
from src.schemas.gallery import (
    GalleryResponse,
    GalleryAssetsListResponse,
    BreadcrumbsResponse,
)
from src.utils.security import verify_password
from src.database import get_connection
from src.api.v1.errors import (
    raise_http_exception,
    exception_to_error_response,
    ErrorCode,
    ErrorMessage,
    get_request_id,
)
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()


# =============================================================================
# Request/Response Schemas
# =============================================================================


class PinVerifyRequest(BaseModel):
    """Request to verify gallery PIN."""
    pin: str


class PasswordVerifyRequest(BaseModel):
    """Request to verify gallery password."""
    password: str


class VerifyResponse(BaseModel):
    """Response for PIN/password verification."""
    valid: bool
    message: Optional[str] = None

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
            raise_http_exception(
                ErrorCode.FORBIDDEN,
                "Invalid or expired magic link"
            )

        if validation["gallery_id"] != gallery_id:
            raise_http_exception(
                ErrorCode.FORBIDDEN,
                "Magic link does not match gallery"
            )

        # Check if protected
        if validation["requires_pin"] or validation["requires_password"]:
            if not x_access_token:
                raise_http_exception(
                    ErrorCode.FORBIDDEN,
                    "Gallery requires PIN or password verification",
                    details={
                        "requires_pin": validation["requires_pin"],
                        "requires_password": validation["requires_password"],
                    }
                )

        # Increment view count
        await magic_link_service.increment_view_count(x_magic_link_token)

        return {"gallery_id": gallery_id, "token": x_magic_link_token}

    raise_http_exception(
        ErrorCode.UNAUTHORIZED,
        ErrorMessage.UNAUTHORIZED
    )


# =============================================================================
# Public Gallery Endpoints
# =============================================================================


@router.get("/{gallery_id}")
async def get_public_gallery(
    request: Request,
    gallery_id: str,
    x_access_token: Optional[str] = Header(None, alias="X-Access-Token"),
    x_magic_link_token: Optional[str] = Header(None, alias="X-Magic-Link-Token"),
):
    """
    Get public gallery details.

    Requires valid magic link token.
    For protected galleries, also requires access token from verification.
    """
    request_id = get_request_id(request)

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
        raise_http_exception(
            ErrorCode.GALLERY_NOT_FOUND,
            ErrorMessage.GALLERY_NOT_FOUND,
            details={"gallery_id": gallery_id},
            request_id=request_id
        )
    except GalleryError as e:
        error_response = exception_to_error_response(e, request_id)
        from fastapi import HTTPException
        from src.api.v1.errors import STATUS_CODE_MAP
        status_code = STATUS_CODE_MAP.get(error_response.error.code, getattr(e, 'status', 500))
        raise HTTPException(
            status_code=status_code,
            content=error_response.model_dump()
        )


@router.get("/{gallery_id}/assets")
async def get_public_gallery_assets(
    request: Request,
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
    request_id = get_request_id(request)

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
        raise_http_exception(
            ErrorCode.GALLERY_NOT_FOUND,
            ErrorMessage.GALLERY_NOT_FOUND,
            details={"gallery_id": gallery_id},
            request_id=request_id
        )
    except GalleryError as e:
        error_response = exception_to_error_response(e, request_id)
        from fastapi import HTTPException
        status_code = getattr(e, 'status', 500)
        # Map error code to status code if available
        if error_response.error.code in ErrorCode.__dict__.values():
            # Get the status code from STATUS_CODE_MAP
            from src.api.v1.errors import STATUS_CODE_MAP
            status_code = STATUS_CODE_MAP.get(error_response.error.code, status_code)
        raise HTTPException(
            status_code=status_code,
            content=error_response.model_dump()
        )


# =============================================================================
# Gallery PIN/Password Verification Endpoints
# =============================================================================


@router.post("/{gallery_id}/verify-pin", response_model=VerifyResponse)
async def verify_gallery_pin(
    request: Request,
    gallery_id: str,
    verify_request: PinVerifyRequest,
):
    """
    Verify PIN for a protected gallery.

    Returns whether the PIN is valid.
    """
    request_id = get_request_id(request)

    try:
        gallery_uuid = UUID(gallery_id)
    except ValueError:
        raise_http_exception(
            ErrorCode.INVALID_FORMAT,
            ErrorMessage.INVALID_FORMAT,
            details={"field": "gallery_id", "value": gallery_id},
            request_id=request_id
        )

    async with get_connection() as conn:
        # Get gallery PIN hash
        result = await conn.fetchrow(
            """
            SELECT pin_hash, status
            FROM galleries
            WHERE gallery_id = $1 AND deleted = FALSE
            """,
            gallery_uuid,
        )

        if not result:
            raise_http_exception(
                ErrorCode.GALLERY_NOT_FOUND,
                ErrorMessage.GALLERY_NOT_FOUND,
                details={"gallery_id": gallery_id},
                request_id=request_id
            )

        if result["status"] != "published":
            raise_http_exception(
                ErrorCode.FORBIDDEN,
                "Gallery is not published",
                request_id=request_id
            )

        if not result["pin_hash"]:
            # No PIN set, return valid (gallery not PIN protected)
            return VerifyResponse(valid=True, message="Gallery is not PIN protected")

        # Verify PIN
        is_valid = verify_password(verify_request.pin, result["pin_hash"])

        if is_valid:
            return VerifyResponse(valid=True, message="PIN verified successfully")
        else:
            return VerifyResponse(valid=False, message="Invalid PIN")


@router.post("/{gallery_id}/verify-password", response_model=VerifyResponse)
async def verify_gallery_password(
    request: Request,
    gallery_id: str,
    verify_request: PasswordVerifyRequest,
):
    """
    Verify password for a protected gallery.

    Returns whether the password is valid.
    """
    request_id = get_request_id(request)

    try:
        gallery_uuid = UUID(gallery_id)
    except ValueError:
        raise_http_exception(
            ErrorCode.INVALID_FORMAT,
            ErrorMessage.INVALID_FORMAT,
            details={"field": "gallery_id", "value": gallery_id},
            request_id=request_id
        )

    async with get_connection() as conn:
        # Get gallery password hash
        result = await conn.fetchrow(
            """
            SELECT password_hash, status
            FROM galleries
            WHERE gallery_id = $1 AND deleted = FALSE
            """,
            gallery_uuid,
        )

        if not result:
            raise_http_exception(
                ErrorCode.GALLERY_NOT_FOUND,
                ErrorMessage.GALLERY_NOT_FOUND,
                details={"gallery_id": gallery_id},
                request_id=request_id
            )

        if result["status"] != "published":
            raise_http_exception(
                ErrorCode.FORBIDDEN,
                "Gallery is not published",
                request_id=request_id
            )

        if not result["password_hash"]:
            # No password set, return valid (gallery not password protected)
            return VerifyResponse(valid=True, message="Gallery is not password protected")

        # Verify password
        is_valid = verify_password(verify_request.password, result["password_hash"])

        if is_valid:
            return VerifyResponse(valid=True, message="Password verified successfully")
        else:
            return VerifyResponse(valid=False, message="Invalid password")


# =============================================================================
# Client Rating Endpoint
# =============================================================================


class RatingRequest(BaseModel):
    """Request to rate a photo."""
    asset_id: str
    rating: int  # 1-5 stars


class RatingResponse(BaseModel):
    """Response for rating submission."""
    success: bool
    message: str
    new_average: Optional[float] = None


@router.post("/{gallery_id}/rate", response_model=RatingResponse)
async def rate_asset(
    request: Request,
    gallery_id: str,
    rating_request: RatingRequest,
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-ID"),
    x_magic_link_token: Optional[str] = Header(None, alias="X-Magic-Link-Token"),
):
    """
    Rate a photo in a gallery.

    Requires:
    - Valid magic link token
    - Gallery must have ratings_enabled = true
    - Rating value must be 1-5
    """
    request_id = get_request_id(request)

    # Validate rating value
    if rating_request.rating < 1 or rating_request.rating > 5:
        raise_http_exception(
            ErrorCode.VALIDATION_ERROR,
            "Rating must be between 1 and 5",
            details={"field": "rating", "value": rating_request.rating},
            request_id=request_id
        )

    # Validate UUIDs
    try:
        gallery_uuid = UUID(gallery_id)
        asset_uuid = UUID(rating_request.asset_id)
    except ValueError:
        raise_http_exception(
            ErrorCode.INVALID_FORMAT,
            ErrorMessage.INVALID_FORMAT,
            details={"field": "gallery_id or asset_id"},
            request_id=request_id
        )

    # Validate magic link
    if not x_magic_link_token:
        raise_http_exception(
            ErrorCode.UNAUTHORIZED,
            ErrorMessage.UNAUTHORIZED,
            request_id=request_id
        )

    magic_link_service = get_magic_link_service()
    magic_link_validation = await magic_link_service.validate_magic_link(x_magic_link_token)

    if not magic_link_validation["valid"]:
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "Invalid or expired magic link",
            request_id=request_id
        )

    if magic_link_validation["gallery_id"] != gallery_id:
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "Magic link does not match gallery",
            request_id=request_id
        )

    async with get_connection() as conn:
        # Check if ratings are enabled for this gallery
        gallery = await conn.fetchrow(
            """
            SELECT ratings_enabled, workspace_id
            FROM galleries
            WHERE gallery_id = $1 AND deleted = FALSE AND status = 'published'
            """,
            gallery_uuid,
        )

        if not gallery:
            raise_http_exception(
                ErrorCode.GALLERY_NOT_FOUND,
                ErrorMessage.GALLERY_NOT_FOUND,
                details={"gallery_id": gallery_id},
                request_id=request_id
            )

        if not gallery["ratings_enabled"]:
            raise_http_exception(
                ErrorCode.FORBIDDEN,
                "Ratings are not enabled for this gallery",
                request_id=request_id
            )

        workspace_id = gallery["workspace_id"]

        # Verify asset exists in this gallery
        asset_check = await conn.fetchval(
            """
            SELECT 1 FROM gallery_assets
            WHERE gallery_id = $1 AND asset_id = $2
            """,
            gallery_uuid,
            asset_uuid,
        )

        if not asset_check:
            raise_http_exception(
                ErrorCode.ASSET_NOT_FOUND,
                ErrorMessage.ASSET_NOT_FOUND,
                details={"asset_id": str(asset_uuid)},
                request_id=request_id
            )

        # Generate visitor ID if not provided
        visitor_id = x_visitor_id or f"anon_{gallery_id[:8]}"

        # Upsert rating interaction (update if exists, insert if not)
        # Using ON CONFLICT to handle re-ratings by same visitor
        # CRITICAL: Use parameterized JSONB to prevent SQL injection
        await conn.execute(
            """
            INSERT INTO client_interactions (workspace_id, gallery_id, asset_id, type, actor, payload)
            VALUES ($1, $2, $3, 'rating', $4::jsonb, $5::jsonb)
            ON CONFLICT ON CONSTRAINT uq_client_interaction_rating
            DO UPDATE SET payload = $5::jsonb, created_at = NOW()
            """,
            workspace_id,
            gallery_uuid,
            asset_uuid,
            {"visitor_id": visitor_id},
            {"value": rating_request.rating},
        )

        # Calculate new average rating
        avg_result = await conn.fetchrow(
            """
            SELECT AVG((payload->>'value')::int) as avg_rating
            FROM client_interactions
            WHERE gallery_id = $1 AND asset_id = $2 AND type = 'rating'
            """,
            gallery_uuid,
            asset_uuid,
        )

        new_average = float(avg_result["avg_rating"]) if avg_result["avg_rating"] else None

        # Update the denormalized average_rating on gallery_assets
        if new_average is not None:
            await conn.execute(
                """
                UPDATE gallery_assets
                SET average_rating = $1
                WHERE gallery_id = $2 AND asset_id = $3
                """,
                round(new_average, 2),
                gallery_uuid,
                asset_uuid,
            )

        return RatingResponse(
            success=True,
            message="Rating submitted successfully",
            new_average=round(new_average, 2) if new_average else None
        )


# =============================================================================
# Breadcrumb Navigation Endpoint
# =============================================================================


@router.get("/{gallery_id}/breadcrumbs", response_model=BreadcrumbsResponse)
async def get_gallery_breadcrumbs(
    request: Request,
    gallery_id: str,
    sub_gallery_id: Optional[str] = Query(
        None,
        description="Current sub-gallery ID to build path from",
    ),
    x_magic_link_token: Optional[str] = Header(None, alias="X-Magic-Link-Token"),
):
    """
    Get breadcrumb navigation path for a gallery/sub-gallery.

    Returns the path from root gallery to the current sub-gallery location.
    Used to display clickable breadcrumb navigation for nested sub-galleries.

    Example response:
    ```json
    {
        "gallery_id": "uuid-1",
        "current_sub_gallery_id": "uuid-3",
        "items": [
            {"id": "uuid-1", "name": "Wedding Gallery", "type": "gallery", "depth": 0},
            {"id": "uuid-2", "name": "Reception", "type": "sub_gallery", "depth": 1},
            {"id": "uuid-3", "name": "Cake Cutting", "type": "sub_gallery", "depth": 2}
        ]
    }
    ```
    """
    request_id = get_request_id(request)

    # Validate magic link for public access
    if not x_magic_link_token:
        raise_http_exception(
            ErrorCode.UNAUTHORIZED,
            ErrorMessage.UNAUTHORIZED,
            request_id=request_id
        )

    magic_link_service = get_magic_link_service()
    validation = await magic_link_service.validate_magic_link(x_magic_link_token)

    if not validation["valid"]:
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "Invalid or expired magic link",
            request_id=request_id
        )

    if validation["gallery_id"] != gallery_id:
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "Magic link does not match gallery",
            request_id=request_id
        )

    gallery_service = get_gallery_service()

    try:
        result = await gallery_service.get_breadcrumbs(
            gallery_id=gallery_id,
            sub_gallery_id=sub_gallery_id,
        )
        return result
    except GalleryNotFoundError:
        raise_http_exception(
            ErrorCode.GALLERY_NOT_FOUND,
            ErrorMessage.GALLERY_NOT_FOUND,
            details={"gallery_id": gallery_id},
            request_id=request_id
        )
    except GalleryError as e:
        error_response = exception_to_error_response(e, request_id)
        from fastapi import HTTPException
        from src.api.v1.errors import STATUS_CODE_MAP
        status_code = STATUS_CODE_MAP.get(error_response.error.code, getattr(e, 'status', 500))
        raise HTTPException(
            status_code=status_code,
            content=error_response.model_dump()
        )
