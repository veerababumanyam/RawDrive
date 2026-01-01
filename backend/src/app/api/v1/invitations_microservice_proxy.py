"""Invitations Microservice Proxy Routes.

Proxies specific requests to the dedicated invitations microservice for
production-ready features:
- Guest management (CRUD, bulk operations, CSV import)
- RSVP with HMAC-signed edit tokens
- Analytics with caching
- Bulk invite emails

Feature: 018-invitations-production-readiness
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user, CurrentUser
from app.services.invitations_proxy_service import (
    get_invitations_proxy_service,
    InvitationsProxyService,
    InvitationsProxyError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper to convert proxy errors to HTTP responses
# ---------------------------------------------------------------------------


def handle_proxy_error(error: InvitationsProxyError) -> JSONResponse:
    """Convert proxy error to appropriate HTTP response."""
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": error.message,
            "details": error.details,
        },
    )


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class GuestCreateRequest(BaseModel):
    """Request to create a guest."""
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=1, max_length=320)
    phone: Optional[str] = Field(None, max_length=50)
    party_size: int = Field(1, ge=1, le=20)
    notes: Optional[str] = Field(None, max_length=1000)


class GuestUpdateRequest(BaseModel):
    """Request to update a guest."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[str] = Field(None, min_length=1, max_length=320)
    phone: Optional[str] = Field(None, max_length=50)
    party_size: Optional[int] = Field(None, ge=1, le=20)
    notes: Optional[str] = Field(None, max_length=1000)
    status: Optional[str] = Field(None)


class BulkStatusUpdateRequest(BaseModel):
    """Request to bulk update guest statuses."""
    guest_ids: list[str]
    status: str


class BulkInviteRequest(BaseModel):
    """Request to send bulk invitations."""
    guest_ids: Optional[list[str]] = None
    send_all_pending: bool = False


class CSVImportRequest(BaseModel):
    """Request to import guests from CSV."""
    csv_content: str
    column_mapping: Optional[dict[str, str]] = None


class PublicRSVPSubmitRequest(BaseModel):
    """Public RSVP submission request."""
    guest_name: str = Field(..., min_length=1, max_length=200)
    guest_email: str = Field(..., min_length=1, max_length=320)
    response_status: str = Field(..., pattern="^(yes|no|maybe)$")
    party_size: int = Field(1, ge=1, le=20)
    dietary_preferences: Optional[str] = Field(None, max_length=500)
    message: Optional[str] = Field(None, max_length=1000)
    custom_answers: Optional[dict[str, Any]] = None
    turnstile_token: Optional[str] = None


class RSVPUpdateRequest(BaseModel):
    """Request to update RSVP."""
    response_status: Optional[str] = Field(None, pattern="^(yes|no|maybe)$")
    party_size: Optional[int] = Field(None, ge=1, le=20)
    dietary_preferences: Optional[str] = Field(None, max_length=500)
    message: Optional[str] = Field(None, max_length=1000)


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


async def get_proxy_service() -> InvitationsProxyService:
    """Get invitations proxy service."""
    return get_invitations_proxy_service()


def get_auth_token(request: Request) -> str:
    """Extract auth token from request."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return ""


# ---------------------------------------------------------------------------
# Guest Management Endpoints (Proxied)
# ---------------------------------------------------------------------------


@router.post(
    "/guests",
    summary="Create guest (via microservice)",
    description="Creates a guest using the production-ready microservice.",
)
async def create_guest_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request_body: GuestCreateRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Create a guest via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.create_guest(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            name=request_body.name,
            email=request_body.email,
            phone=request_body.phone,
            party_size=request_body.party_size,
            notes=request_body.notes,
            auth_token=get_auth_token(request),
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.get(
    "/guests",
    summary="List guests (via microservice)",
    description="Lists guests with pagination using the production-ready microservice.",
)
async def list_guests_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """List guests via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.list_guests(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
            page=page,
            limit=limit,
            status=status,
            search=search,
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.get(
    "/guests/stats",
    summary="Get guest statistics (via microservice)",
    description="Gets guest statistics using the production-ready microservice.",
)
async def get_guest_stats_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Get guest statistics via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.get_guest_stats(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.post(
    "/guests/import/preview",
    summary="Preview CSV import (via microservice)",
    description="Preview CSV import without committing.",
)
async def preview_csv_import_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request_body: CSVImportRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Preview CSV import via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.import_guests_preview(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
            csv_content=request_body.csv_content,
            column_mapping=request_body.column_mapping,
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.post(
    "/guests/import",
    summary="Import guests from CSV (via microservice)",
    description="Import guests from CSV using the production-ready microservice.",
)
async def import_guests_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request_body: CSVImportRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Import guests from CSV via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.import_guests(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
            csv_content=request_body.csv_content,
            column_mapping=request_body.column_mapping or {},
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.post(
    "/guests/bulk-status",
    summary="Bulk update guest statuses (via microservice)",
    description="Bulk update guest statuses using the production-ready microservice.",
)
async def bulk_update_status_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request_body: BulkStatusUpdateRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Bulk update guest statuses via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.bulk_update_status(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
            guest_ids=request_body.guest_ids,
            status=request_body.status,
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.post(
    "/guests/bulk-invite",
    summary="Send bulk invitations (via microservice)",
    description="Send bulk invitation emails using the production-ready microservice with Celery workers.",
)
async def bulk_invite_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request_body: BulkInviteRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Send bulk invitations via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.bulk_invite(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
            guest_ids=request_body.guest_ids,
            send_all_pending=request_body.send_all_pending,
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


# ---------------------------------------------------------------------------
# Analytics Endpoints (Proxied)
# ---------------------------------------------------------------------------


@router.get(
    "/analytics",
    summary="Get comprehensive analytics (via microservice)",
    description="Get comprehensive invitation analytics with Redis caching.",
)
async def get_analytics_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Get comprehensive analytics via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.get_analytics(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.get(
    "/analytics/views",
    summary="Get view analytics (via microservice)",
    description="Get view statistics with time series data.",
)
async def get_view_analytics_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request: Request,
    period: str = Query("week", pattern="^(day|week|month|all)$"),
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Get view analytics via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.get_view_analytics(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
            period=period,
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.get(
    "/analytics/devices",
    summary="Get device analytics (via microservice)",
    description="Get device and browser breakdown for invitation views.",
)
async def get_device_analytics_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Get device analytics via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.get_device_analytics(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.get(
    "/analytics/rsvp",
    summary="Get RSVP analytics (via microservice)",
    description="Get RSVP statistics with response breakdown.",
)
async def get_rsvp_analytics_proxied(
    workspace_id: UUID,
    invitation_id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Get RSVP analytics via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.get_rsvp_analytics(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            auth_token=get_auth_token(request),
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


# ---------------------------------------------------------------------------
# Public RSVP Endpoints (No Auth Required)
# ---------------------------------------------------------------------------


@router.post(
    "/public/{slug}/rsvp",
    summary="Submit public RSVP (via microservice)",
    description="Submit RSVP via the production-ready microservice with HMAC edit tokens.",
    tags=["public-rsvp"],
)
async def submit_public_rsvp_proxied(
    slug: str,
    request_body: PublicRSVPSubmitRequest,
    request: Request,
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Submit public RSVP via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    # Get client IP and user agent for audit
    forwarded = request.headers.get("x-forwarded-for")
    ip_address = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None
    )
    user_agent = request.headers.get("user-agent")

    try:
        result = await proxy.submit_rsvp(
            slug=slug,
            guest_name=request_body.guest_name,
            guest_email=request_body.guest_email,
            response_status=request_body.response_status,
            party_size=request_body.party_size,
            dietary_preferences=request_body.dietary_preferences,
            message=request_body.message,
            custom_answers=request_body.custom_answers,
            turnstile_token=request_body.turnstile_token,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.get(
    "/public/{slug}/rsvp/{rsvp_id}",
    summary="Get RSVP by ID (via microservice)",
    description="Get RSVP details with edit token verification.",
    tags=["public-rsvp"],
)
async def get_public_rsvp_proxied(
    slug: str,
    rsvp_id: str,
    edit_token: str = Query(...),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Get RSVP via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.get_rsvp(
            slug=slug,
            rsvp_id=rsvp_id,
            edit_token=edit_token,
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)


@router.patch(
    "/public/{slug}/rsvp/{rsvp_id}",
    summary="Update RSVP (via microservice)",
    description="Update RSVP with edit token verification.",
    tags=["public-rsvp"],
)
async def update_public_rsvp_proxied(
    slug: str,
    rsvp_id: str,
    request_body: RSVPUpdateRequest,
    edit_token: str = Query(...),
    proxy: InvitationsProxyService = Depends(get_proxy_service),
):
    """Update RSVP via the invitations microservice."""
    if not proxy.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )

    try:
        result = await proxy.update_rsvp(
            slug=slug,
            rsvp_id=rsvp_id,
            edit_token=edit_token,
            response_status=request_body.response_status,
            party_size=request_body.party_size,
            dietary_preferences=request_body.dietary_preferences,
            message=request_body.message,
        )
        return result
    except InvitationsProxyError as e:
        return handle_proxy_error(e)
