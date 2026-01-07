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
    # #region agent log
    import json
    try:
        with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"magic_links.py:create_magic_link","message":"API endpoint entry","data":{"workspace_id":str(workspace_id),"gallery_id":str(gallery_id),"has_album_title":hasattr(request,"album_title"),"album_title":getattr(request,"album_title",None),"target_type":request.target_type},"timestamp":int(__import__("time").time()*1000)})+"\n")
    except: pass
    # #endregion
    logger.info(
        "[MagicLink API] Creating magic link - START",
        extra={
            "workspace_id": str(workspace_id),
            "gallery_id": str(gallery_id),
            "user_id": str(current_user.user_id),
            "target_type": request.target_type,
            "target_id": str(request.target_id) if request.target_id else None,
            "album_title": request.album_title,
            "label": request.label,
            "has_expires_at": request.expires_at is not None,
            "max_accesses": request.max_accesses,
            "has_qr_config": request.qr_config is not None,
            "request_method": req.method,
            "request_url": str(req.url),
            "client_host": req.client.host if req.client else None,
        },
    )

    service = get_magic_link_service()
    logger.debug("[MagicLink API] Service instance obtained", extra={"service_type": type(service).__name__})

    # Get base URL from request or config
    # Priority: Origin header (frontend) > Referer header > request.base_url > PUBLIC_URL
    import os
    from app.config.settings import get_settings
    settings = get_settings()
    
    # Try to get frontend origin from headers (browser sends this)
    origin = req.headers.get("Origin") or req.headers.get("Referer")
    if origin:
        # Extract base URL from Origin/Referer (remove path)
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        frontend_base_url = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    else:
        frontend_base_url = None
    
    request_base_url = str(req.base_url).rstrip("/")
    public_url_env = os.getenv("PUBLIC_URL", "").rstrip("/")
    
    # Determine base URL based on environment and available sources
    if settings.app_env == "development":
        # In development, prefer frontend origin (from browser) over backend URL
        if frontend_base_url and ("localhost" in frontend_base_url or "127.0.0.1" in frontend_base_url):
            base_url = frontend_base_url
        elif "localhost" in request_base_url or "127.0.0.1" in request_base_url:
            base_url = request_base_url
        elif public_url_env:
            base_url = public_url_env
        else:
            base_url = request_base_url
    else:
        # In production, always use PUBLIC_URL
        base_url = public_url_env if public_url_env else (frontend_base_url or request_base_url)
    
    logger.debug("[MagicLink API] Base URL determined", extra={
        "base_url": base_url,
        "app_env": settings.app_env,
        "frontend_base_url": frontend_base_url,
        "request_base_url": request_base_url,
        "public_url_env": public_url_env,
        "origin_header": req.headers.get("Origin"),
        "referer_header": req.headers.get("Referer"),
    })

    try:
        # Validate target_id is provided for non-gallery targets
        logger.debug("[MagicLink API] Validating request parameters")
        if request.target_type != "gallery" and not request.target_id:
            logger.warning(
                "[MagicLink API] Validation failed: target_id required",
                extra={"target_type": request.target_type},
            )
            raise ValidationAppError(
                message="target_id is required for sub_gallery and photo targets",
                field="target_id",
            )

        logger.info(
            "[MagicLink API] Calling service.create_link",
            extra={
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id),
                "target_type": request.target_type,
            },
        )

        # #region agent log
        try:
            with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"B","location":"magic_links.py:before_service_call","message":"Before service.create_link","data":{"workspace_id":str(workspace_id),"gallery_id":str(gallery_id),"album_title":request.album_title,"target_type":request.target_type},"timestamp":int(__import__("time").time()*1000)})+"\n")
        except: pass
        # #endregion
        result = await service.create_link(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            target_type=request.target_type,
            target_id=request.target_id,
            album_title=request.album_title,
            label=request.label,
            expires_at=request.expires_at,
            max_accesses=request.max_accesses,
            qr_config=request.qr_config.model_dump() if request.qr_config else None,
            created_by_user_id=current_user.user_id,
            base_url=base_url,
            invitation_id=None,
        )
        # #region agent log
        try:
            with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"B","location":"magic_links.py:after_service_call","message":"After service.create_link","data":{"has_result":result is not None,"link_id":result.get("link_id") if result else None,"has_token":"token" in result if result else False},"timestamp":int(__import__("time").time()*1000)})+"\n")
        except: pass
        # #endregion

        logger.info(
            "[MagicLink API] Service returned result",
            extra={
                "link_id": result.get("link_id"),
                "has_token": "token" in result,
                "has_url": "url" in result,
            },
        )

        logger.debug("[MagicLink API] Creating MagicLinkResponse from result")
        # #region agent log
        try:
            with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"G","location":"magic_links.py:before_response","message":"Before creating MagicLinkResponse","data":{"has_token":"token" in result,"has_url":"url" in result,"has_public_url":"public_url" in result,"url_preview":result.get("url","")[:80] if result.get("url") else None,"public_url_preview":result.get("public_url","")[:80] if result.get("public_url") else None},"timestamp":int(__import__("time").time()*1000)})+"\n")
        except: pass
        # #endregion
        response = MagicLinkResponse(**result)
        # #region agent log
        try:
            with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"G","location":"magic_links.py:after_response","message":"After creating MagicLinkResponse","data":{"has_token":hasattr(response,"token") and response.token is not None,"has_url":hasattr(response,"url") and response.url is not None,"url_preview":response.url[:80] if response.url else None},"timestamp":int(__import__("time").time()*1000)})+"\n")
        except: pass
        # #endregion
        logger.info(
            "[MagicLink API] Magic link created successfully - END",
            extra={"link_id": result.get("link_id")},
        )
        return response

    except MagicLinkError as e:
        logger.error(
            "[MagicLink API] MagicLinkError occurred",
            extra={
                "error_message": e.message,
                "error_code": e.code,
                "status_code": e.status_code,
            },
            exc_info=True,
        )
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except ValidationAppError as e:
        logger.warning(
            "[MagicLink API] ValidationAppError occurred",
            extra={"error_message": str(e), "field": getattr(e, "field", None)},
        )
        raise
    except Exception as e:
        # #region agent log
        try:
            with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"F","location":"magic_links.py:exception_handler","message":"Exception caught in API","data":{"error":str(e),"error_type":type(e).__name__,"error_module":getattr(e,"__module__",None)},"timestamp":int(__import__("time").time()*1000)})+"\n")
        except: pass
        # #endregion
        logger.exception(
            "[MagicLink API] Unexpected exception creating magic link",
            extra={
                "error": str(e),
                "error_type": type(e).__name__,
                "error_module": getattr(e, "__module__", None),
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id),
                "user_id": str(current_user.user_id),
            },
        )
        # Include error details in development for debugging
        import os
        error_message = "Failed to create magic link"
        if os.getenv("ENVIRONMENT", "production") != "production":
            error_message = f"Failed to create magic link: {str(e)}"
        raise AppError(
            message=error_message,
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
    # Security: Reject UUIDs (gallery_ids) - tokens are base64 encoded, not UUIDs
    from app.shared.validation import is_valid_uuid
    if is_valid_uuid(token):
        logger.warning(
            "[MagicLink API] Rejected UUID as token (security: gallery_id exposure attempt)",
            extra={"token": token, "ip_address": request.client.host if request.client else None},
        )
        raise AppError(
            message="Invalid link format. Please use a valid magic link URL.",
            code="INVALID_TOKEN_FORMAT",
            status_code=400,
        )
    
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
