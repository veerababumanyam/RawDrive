"""Access Code API Endpoints for per-photo protection.

Provides endpoints for:
- Public: Verifying access codes to view protected photos
- Authenticated: Setting/removing access codes on photos

Feature: 027-gallery-feature-completion
User Story: US1 - Per-Photo Access Codes
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Body, Request, Depends, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.exceptions import AppError, NotFoundError, InternalError, ForbiddenError
from app.db.session import get_db
from app.middleware.auth import get_current_user, AuthenticatedUser
from app.schemas.access_code import (
    VerifyCodeRequest,
    VerifyCodeResponse,
    AccessCodeRequest,
    AccessCodeResponse,
    AccessCodeStatusResponse,
)
from app.services.access_code_service import AccessCodeService

logger = logging.getLogger(__name__)

# Public router - no authentication required
public_router = APIRouter()

# Authenticated router - workspace access required
authenticated_router = APIRouter()


def _get_client_identifier(request: Request, client_identifier: str | None = None) -> str:
    """Get client identifier for lockout tracking.

    Uses provided identifier, falling back to IP address.
    """
    if client_identifier:
        return client_identifier

    # Get IP from X-Forwarded-For or client host
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()

    return request.client.host if request.client else "unknown"


@public_router.post(
    "/{gallery_id}/assets/{asset_id}/verify-code",
    response_model=VerifyCodeResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify access code for protected photo",
    responses={
        200: {"description": "Verification result"},
        404: {"description": "Gallery or asset not found"},
        429: {"description": "Too many failed attempts - locked out"},
    },
)
async def verify_asset_access_code(
    request: Request,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    body: VerifyCodeRequest = Body(...),
    db: AsyncSession = Depends(get_db),
) -> VerifyCodeResponse:
    """Verify access code to unlock a protected photo.

    Returns verification result including lockout status if too many failures.
    Successful verification should be stored client-side for session duration.
    """
    client_id = _get_client_identifier(request, body.client_identifier)

    # Get the asset's access code hash
    result = await db.execute(
        text(
            """
            SELECT ga.access_code_hash, g.workspace_id
            FROM gallery_assets ga
            JOIN galleries g ON ga.gallery_id = g.gallery_id
            WHERE ga.gallery_id = :gallery_id
              AND ga.asset_id = :asset_id
              AND g.status = 'published'
            """
        ),
        {"gallery_id": gallery_id, "asset_id": asset_id},
    )
    row = result.fetchone()

    if not row:
        raise NotFoundError("Asset", str(asset_id))

    if not row.access_code_hash:
        # No code set - asset is not protected
        return VerifyCodeResponse(
            verified=True,
            locked_out=False,
            remaining_attempts=3,
            message="This photo does not require an access code.",
        )

    # Verify the code
    service = AccessCodeService()
    verification_result = await service.verify_access_code(
        submitted_code=body.code,
        stored_hash=row.access_code_hash,
        gallery_id=gallery_id,
        asset_id=asset_id,
        client_identifier=client_id,
    )

    if verification_result.locked_out:
        raise AppError(
            message=verification_result.error_message or "Too many failed attempts",
            code="ACCESS_CODE_LOCKOUT",
            status_code=429,
        )

    return VerifyCodeResponse(
        verified=verification_result.verified,
        locked_out=verification_result.locked_out,
        remaining_attempts=verification_result.remaining_attempts,
        lockout_expires_at=verification_result.lockout_expires_at,
        message="Access granted" if verification_result.verified else verification_result.error_message,
    )


@authenticated_router.put(
    "/{gallery_id}/assets/{asset_id}/access-code",
    response_model=AccessCodeResponse,
    status_code=status.HTTP_200_OK,
    summary="Set access code on photo",
    responses={
        200: {"description": "Access code set successfully"},
        403: {"description": "Not authorized to modify this gallery"},
        404: {"description": "Gallery or asset not found"},
    },
)
async def set_asset_access_code(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    body: AccessCodeRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AccessCodeResponse:
    """Set an access code on a specific photo.

    Only users with gallery management permissions can set access codes.
    The code is hashed before storage for security.
    """
    workspace_id = current_user.workspace_id

    # Verify asset exists and belongs to user's workspace
    result = await db.execute(
        text(
            """
            SELECT ga.gallery_asset_id
            FROM gallery_assets ga
            JOIN galleries g ON ga.gallery_id = g.gallery_id
            WHERE ga.gallery_id = :gallery_id
              AND ga.asset_id = :asset_id
              AND g.workspace_id = :workspace_id
            """
        ),
        {"gallery_id": gallery_id, "asset_id": asset_id, "workspace_id": workspace_id},
    )
    row = result.fetchone()

    if not row:
        raise NotFoundError("Asset", str(asset_id))

    # Hash the access code
    service = AccessCodeService()
    code_hash = service.hash_access_code(body.code)

    # Update the asset
    await db.execute(
        text(
            """
            UPDATE gallery_assets
            SET access_code_hash = :code_hash
            WHERE gallery_id = :gallery_id AND asset_id = :asset_id
            """
        ),
        {"code_hash": code_hash, "gallery_id": gallery_id, "asset_id": asset_id},
    )
    await db.commit()

    logger.info(
        "Access code set on asset",
        extra={"gallery_id": str(gallery_id), "asset_id": str(asset_id), "user_id": str(current_user.user_id)},
    )

    return AccessCodeResponse(
        success=True,
        asset_id=str(asset_id),
        has_access_code=True,
        message="Access code set successfully",
    )


@authenticated_router.delete(
    "/{gallery_id}/assets/{asset_id}/access-code",
    response_model=AccessCodeResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove access code from photo",
    responses={
        200: {"description": "Access code removed successfully"},
        403: {"description": "Not authorized to modify this gallery"},
        404: {"description": "Gallery or asset not found"},
    },
)
async def remove_asset_access_code(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AccessCodeResponse:
    """Remove the access code from a photo, making it publicly viewable.

    Only users with gallery management permissions can remove access codes.
    """
    workspace_id = current_user.workspace_id

    # Verify asset exists and belongs to user's workspace
    result = await db.execute(
        text(
            """
            SELECT ga.gallery_asset_id
            FROM gallery_assets ga
            JOIN galleries g ON ga.gallery_id = g.gallery_id
            WHERE ga.gallery_id = :gallery_id
              AND ga.asset_id = :asset_id
              AND g.workspace_id = :workspace_id
            """
        ),
        {"gallery_id": gallery_id, "asset_id": asset_id, "workspace_id": workspace_id},
    )
    row = result.fetchone()

    if not row:
        raise NotFoundError("Asset", str(asset_id))

    # Remove the access code
    await db.execute(
        text(
            """
            UPDATE gallery_assets
            SET access_code_hash = NULL
            WHERE gallery_id = :gallery_id AND asset_id = :asset_id
            """
        ),
        {"gallery_id": gallery_id, "asset_id": asset_id},
    )
    await db.commit()

    logger.info(
        "Access code removed from asset",
        extra={"gallery_id": str(gallery_id), "asset_id": str(asset_id), "user_id": str(current_user.user_id)},
    )

    return AccessCodeResponse(
        success=True,
        asset_id=str(asset_id),
        has_access_code=False,
        message="Access code removed successfully",
    )


@authenticated_router.get(
    "/{gallery_id}/assets/{asset_id}/access-code",
    response_model=AccessCodeStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Check if photo has access code",
    responses={
        200: {"description": "Access code status"},
        404: {"description": "Gallery or asset not found"},
    },
)
async def get_asset_access_code_status(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AccessCodeStatusResponse:
    """Check if a photo has an access code set.

    Does not return the actual code, only whether one is set.
    """
    workspace_id = current_user.workspace_id

    result = await db.execute(
        text(
            """
            SELECT ga.access_code_hash IS NOT NULL as has_code
            FROM gallery_assets ga
            JOIN galleries g ON ga.gallery_id = g.gallery_id
            WHERE ga.gallery_id = :gallery_id
              AND ga.asset_id = :asset_id
              AND g.workspace_id = :workspace_id
            """
        ),
        {"gallery_id": gallery_id, "asset_id": asset_id, "workspace_id": workspace_id},
    )
    row = result.fetchone()

    if not row:
        raise NotFoundError("Asset", str(asset_id))

    return AccessCodeStatusResponse(
        asset_id=str(asset_id),
        has_access_code=row.has_code,
        is_protected=row.has_code,
    )
