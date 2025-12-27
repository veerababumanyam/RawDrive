"""Magic Links API endpoints.

Provides two router groups:
1. Authenticated endpoints for workspace admins (CRUD on magic links)
2. Public endpoints for token validation (no auth required)

All routes follow workspace-scoped patterns for multi-tenant isolation.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, UploadFile, File, status
from fastapi.responses import Response

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import (
    CreateMagicLinkRequest,
    UpdateMagicLinkRequest,
    MagicLinkResponse,
    MagicLinkListResponse,
    MagicLinkStatsResponse,
    ValidateMagicLinkResponse,
    ErrorResponse,
    MessageResponse,
)
from app.api.exceptions import AppError, NotFoundError, ForbiddenError, ValidationAppError
from app.services.magic_link_service import (
    MagicLinkService,
    MagicLinkError,
    LinkNotFoundError,
    LinkExpiredError,
    LinkRevokedError,
    LinkAccessLimitError,
    SharingDisabledError,
    RateLimitError,
    get_magic_link_service,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Authenticated Router (Workspace Admin)
# ---------------------------------------------------------------------------

router = APIRouter()


@router.get(
    "",
    response_model=MagicLinkListResponse,
    status_code=status.HTTP_200_OK,
    summary="List magic links",
    description="List all magic links for a gallery in this workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def list_magic_links(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
    offset: Annotated[int, Query(ge=0, description="Pagination offset")] = 0,
    status_filter: Annotated[
        Optional[str], Query(alias="status", description="Filter by status")
    ] = None,
) -> MagicLinkListResponse:
    """List magic links for a gallery."""
    service = get_magic_link_service()
    try:
        result = await service.list_links(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            limit=limit,
            offset=offset,
            status=status_filter,
        )
        return MagicLinkListResponse(**result)
    except MagicLinkError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to list magic links")
        raise AppError(
            message="Failed to list magic links",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "",
    response_model=MagicLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create magic link",
    description="Create a new magic link for a gallery. The token is returned ONLY in this response.",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def create_magic_link(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateMagicLinkRequest,
    req: Request,
) -> MagicLinkResponse:
    """Create a new magic link.

    IMPORTANT: The access token is returned ONLY in this response.
    It is never stored in plaintext and cannot be retrieved later.
    """
    service = get_magic_link_service()

    # Get base URL from request or config
    base_url = str(req.base_url).rstrip("/")
    # In production, this should come from PUBLIC_URL env var
    import os
    base_url = os.getenv("PUBLIC_URL", base_url)

    try:
        # Validate target_id is provided for non-gallery targets
        if request.target_type != "gallery" and not request.target_id:
            raise ValidationAppError(
                message="target_id is required for sub_gallery and photo targets",
                field="target_id",
            )

        result = await service.create_link(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            target_type=request.target_type,
            target_id=request.target_id,
            label=request.label,
            expires_at=request.expires_at,
            max_accesses=request.max_accesses,
            qr_config=request.qr_config.model_dump() if request.qr_config else None,
            created_by_user_id=current_user.user_id,
            base_url=base_url,
        )
        return MagicLinkResponse(**result)
    except MagicLinkError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except ValidationAppError:
        raise
    except Exception as e:
        logger.exception("Failed to create magic link")
        raise AppError(
            message="Failed to create magic link",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/{link_id}",
    response_model=MagicLinkResponse,
    status_code=status.HTTP_200_OK,
    summary="Get magic link",
    description="Get details of a specific magic link.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Link not found"},
    },
)
async def get_magic_link(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    link_id: Annotated[UUID, Path(..., description="Magic link ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> MagicLinkResponse:
    """Get a magic link by ID."""
    service = get_magic_link_service()
    try:
        result = await service.get_link(link_id=link_id, workspace_id=workspace_id)
        return MagicLinkResponse(**result)
    except LinkNotFoundError:
        raise NotFoundError("Magic link", str(link_id))
    except MagicLinkError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get magic link")
        raise AppError(
            message="Failed to get magic link",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.delete(
    "/{link_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Revoke magic link",
    description="Revoke a magic link, making it immediately invalid.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Link not found"},
    },
)
async def revoke_magic_link(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    link_id: Annotated[UUID, Path(..., description="Magic link ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> MessageResponse:
    """Revoke a magic link."""
    service = get_magic_link_service()
    try:
        await service.revoke_link(link_id=link_id, workspace_id=workspace_id)
        return MessageResponse(message="Magic link revoked successfully")
    except LinkNotFoundError:
        raise NotFoundError("Magic link", str(link_id))
    except MagicLinkError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to revoke magic link")
        raise AppError(
            message="Failed to revoke magic link",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/{link_id}/stats",
    response_model=MagicLinkStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get magic link statistics",
    description="Get access statistics for a magic link.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Link not found"},
    },
)
async def get_magic_link_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    link_id: Annotated[UUID, Path(..., description="Magic link ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    days: Annotated[int, Query(ge=1, le=365, description="Days to include")] = 30,
) -> MagicLinkStatsResponse:
    """Get access statistics for a magic link."""
    service = get_magic_link_service()
    try:
        result = await service.get_link_stats(
            link_id=link_id,
            workspace_id=workspace_id,
            days=days,
        )
        return MagicLinkStatsResponse(**result)
    except LinkNotFoundError:
        raise NotFoundError("Magic link", str(link_id))
    except MagicLinkError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get magic link stats")
        raise AppError(
            message="Failed to get statistics",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/{link_id}/qr",
    status_code=status.HTTP_200_OK,
    summary="Get QR code",
    description="Generate QR code for a magic link in various formats.",
    responses={
        404: {"model": ErrorResponse, "description": "Link not found"},
    },
)
async def get_magic_link_qr(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    link_id: Annotated[UUID, Path(..., description="Magic link ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    format: Annotated[str, Query(description="Output format: png, svg, pdf")] = "png",
    size: Annotated[Optional[int], Query(ge=256, le=4096, description="Size in pixels")] = None,
    color: Annotated[Optional[str], Query(pattern=r"^#[0-9A-Fa-f]{6}$", description="QR color (hex)")] = None,
) -> Response:
    service = get_magic_link_service()
    try:
        qr_bytes, content_type = await service.get_qr_code(
            link_id=link_id,
            workspace_id=workspace_id,
            format=format,
            size=size,
            fill_color=color,
        )

        # Set filename based on format
        filename = f"qr-{link_id}.{format}"

        return Response(
            content=qr_bytes,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except LinkNotFoundError:
        raise NotFoundError("Magic link", str(link_id))
    except ValueError as e:
        raise ValidationAppError(message=str(e), field="format")
    except MagicLinkError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to generate QR code")
        raise AppError(
            message="Failed to generate QR code",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/{link_id}/qr/branded",
    status_code=status.HTTP_200_OK,
    summary="Get branded QR code",
    description="Generate a branded QR code with custom logo overlay.",
    responses={
        404: {"model": ErrorResponse, "description": "Link not found"},
    },
)
async def get_branded_qr(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    link_id: Annotated[UUID, Path(..., description="Magic link ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    logo: Annotated[UploadFile, File(description="Logo image file")],
    format: Annotated[str, Query(description="Output format: png, pdf")] = "png",
    size: Annotated[Optional[int], Query(ge=256, le=4096, description="Size in pixels")] = None,
    title: Annotated[Optional[str], Query(description="Title for PDF output")] = None,
) -> Response:
    """Generate a branded QR code with logo overlay."""
    service = get_magic_link_service()

    # Read logo bytes
    logo_bytes = await logo.read()

    # Validate logo size (max 1MB)
    if len(logo_bytes) > 1024 * 1024:
        raise ValidationAppError(message="Logo file too large (max 1MB)", field="logo")

    try:
        qr_bytes, content_type = await service.get_qr_code(
            link_id=link_id,
            workspace_id=workspace_id,
            format=format,
            size=size,
            logo_bytes=logo_bytes,
            title=title,
        )

        filename = f"qr-branded-{link_id}.{format}"

        return Response(
            content=qr_bytes,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except LinkNotFoundError:
        raise NotFoundError("Magic link", str(link_id))
    except ValueError as e:
        raise ValidationAppError(message=str(e), field="format")
    except MagicLinkError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to generate branded QR code")
        raise AppError(
            message="Failed to generate QR code",
            code="INTERNAL_ERROR",
            status_code=500,
        )


# ---------------------------------------------------------------------------
# Public Router (No Auth Required)
# ---------------------------------------------------------------------------

public_router = APIRouter()


@public_router.get(
    "/{token}",
    response_model=ValidateMagicLinkResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate magic link",
    description="Validate a magic link token and get gallery data for rendering.",
    responses={
        404: {"model": ErrorResponse, "description": "Link not found"},
        410: {"model": ErrorResponse, "description": "Link expired, revoked, or access limit reached"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)
async def validate_magic_link(
    token: Annotated[str, Path(..., min_length=32, max_length=64, description="Access token")],
    request: Request,
) -> ValidateMagicLinkResponse:
    """Validate a magic link token and return gallery data.

    This endpoint is public (no authentication required) and is used by the
    frontend to render a shared gallery. Rate limiting is applied per IP.

    Returns gallery data including:
    - Gallery metadata (title, description, branding)
    - Whether PIN or email registration is required
    - Company profile for branding
    """
    service = get_magic_link_service()

    # Get client info for logging and rate limiting
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    referer = request.headers.get("referer")

    try:
        result = await service.validate_token(
            token=token,
            ip_address=ip_address,
            user_agent=user_agent,
            referer=referer,
        )
        return ValidateMagicLinkResponse(**result)
    except LinkNotFoundError:
        # Don't reveal whether token exists - use generic message
        raise AppError(
            message="This link is not valid",
            code="LINK_INVALID",
            status_code=404,
        )
    except LinkExpiredError:
        raise AppError(
            message="This link has expired",
            code="LINK_EXPIRED",
            status_code=410,
        )
    except LinkRevokedError:
        raise AppError(
            message="This link is no longer valid",
            code="LINK_REVOKED",
            status_code=410,
        )
    except LinkAccessLimitError:
        raise AppError(
            message="This link has reached its access limit",
            code="LINK_ACCESS_LIMIT",
            status_code=410,
        )
    except SharingDisabledError:
        raise AppError(
            message="This gallery is not available for sharing",
            code="SHARING_DISABLED",
            status_code=403,
        )
    except RateLimitError as e:
        raise AppError(
            message="Too many requests. Please try again later.",
            code="RATE_LIMITED",
            status_code=429,
            headers={"Retry-After": str(e.retry_after)},
        )
    except Exception as e:
        logger.exception("Failed to validate magic link")
        raise AppError(
            message="Failed to validate link",
            code="INTERNAL_ERROR",
            status_code=500,
        )
