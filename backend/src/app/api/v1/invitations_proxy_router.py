"""Comprehensive Invitations Microservice Proxy Router.

Proxies ALL invitation-related requests to the invitations-service microservice.
This includes:
- Invitation CRUD operations
- Template management
- Drafts, exports, media, fonts, sub-events, AI integrations
- Public invitation access

Feature: Invitations microservice migration
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_current_user, CurrentUser, require_workspace_access
from app.config.settings import get_settings
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)

router = APIRouter()

# Microservice base URL
INVITATIONS_SERVICE_URL = get_settings().invitations_service_url or "http://localhost:8007"


def get_auth_token(request: Request) -> str:
    """Extract auth token from request headers."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return ""


async def proxy_request(
    request: Request,
    workspace_id: str,
    path: str = "",
    current_user: CurrentUser | None = None,
) -> Response:
    """
    Proxy request to invitations microservice.
    
    Args:
        request: Original FastAPI request
        workspace_id: Workspace ID from path parameter
        path: Remaining path after /digital-invitations (e.g., "/templates", "/{invitation_id}")
        current_user: Current authenticated user (optional for public routes)
        
    Returns:
        Response from microservice
    """
    if not INVITATIONS_SERVICE_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )
    
    # Build target URL: /api/v1/workspaces/{workspace_id}/digital-invitations{path}
    # Path comes from the catch-all route parameter
    if path and not path.startswith("/"):
        path = "/" + path
    
    microservice_path = f"/api/v1/workspaces/{workspace_id}/digital-invitations{path}"
    target_url = f"{INVITATIONS_SERVICE_URL.rstrip('/')}{microservice_path}"
    
    # Forward query parameters
    query_params = dict(request.query_params)
    
    # Prepare headers
    headers = {
        "Content-Type": request.headers.get("Content-Type", "application/json"),
    }
    
    # Forward authorization
    auth_token = get_auth_token(request)
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    
    # Forward user context for internal service calls
    if current_user:
        headers["X-User-ID"] = str(current_user.user_id)
        headers["X-Workspace-ID"] = str(workspace_id)
        headers["X-User-Email"] = current_user.email
        # Look up user's workspace role for downstream RBAC enforcement
        try:
            pool = await get_postgres_pool()
            role_row = await pool.fetchrow(
                "SELECT role FROM workspace_memberships WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'",
                current_user.user_id,
                uuid.UUID(str(workspace_id)),
            )
            if role_row:
                headers["X-User-Role"] = role_row["role"]
        except Exception:
            logger.warning("Failed to look up workspace role for proxy headers")
    
    # Forward other relevant headers
    for header_name in ["X-Request-ID", "X-Correlation-ID", "User-Agent", "Accept"]:
        if header_name in request.headers:
            headers[header_name] = request.headers[header_name]
    
    try:
        # Get request body if present
        body = None
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.json()
            except Exception:
                # Not JSON, might be form data or file upload
                body = await request.body()
        
        # Make request to microservice
        async with httpx.AsyncClient(timeout=30.0) as client:
            if request.method == "GET":
                response = await client.get(target_url, params=query_params, headers=headers)
            elif request.method == "POST":
                response = await client.post(target_url, json=body if isinstance(body, dict) else None, content=body if not isinstance(body, dict) else None, params=query_params, headers=headers)
            elif request.method == "PUT":
                response = await client.put(target_url, json=body if isinstance(body, dict) else None, content=body if not isinstance(body, dict) else None, params=query_params, headers=headers)
            elif request.method == "PATCH":
                response = await client.patch(target_url, json=body if isinstance(body, dict) else None, content=body if not isinstance(body, dict) else None, params=query_params, headers=headers)
            elif request.method == "DELETE":
                response = await client.delete(target_url, params=query_params, headers=headers)
            else:
                raise HTTPException(
                    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
                    detail=f"Method {request.method} not supported",
                )
            
            # Handle streaming responses (e.g., file downloads)
            content_type = response.headers.get("Content-Type", "")
            if "application/pdf" in content_type or "text/csv" in content_type or "image/" in content_type or "application/octet-stream" in content_type:
                return StreamingResponse(
                    iter([response.content]),
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=content_type,
                )
            
            # Return JSON response
            if response.status_code >= 400:
                try:
                    error_detail = response.json()
                except Exception:
                    error_detail = {"detail": response.text}
                raise HTTPException(
                    status_code=response.status_code,
                    detail=error_detail.get("detail", error_detail),
                )
            
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.headers.get("Content-Type", "application/json"),
            )
            
    except httpx.HTTPStatusError as e:
        logger.error(
            f"Microservice request failed: {e.response.status_code}",
            extra={
                "url": target_url,
                "method": request.method,
                "status_code": e.response.status_code,
            },
        )
        try:
            error_detail = e.response.json()
        except Exception:
            error_detail = {"detail": e.response.text}
        raise HTTPException(
            status_code=e.response.status_code,
            detail=error_detail.get("detail", error_detail),
        )
    except httpx.RequestError as e:
        logger.error(
            f"Failed to connect to invitations microservice: {e}",
            extra={"url": target_url, "method": request.method},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice unavailable",
        )


# Catch-all route for all invitation endpoints
# This handles all paths under /digital-invitations
# Note: Must be registered with empty prefix since parent router already includes the prefix
@router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def proxy_all_invitations(
    request: Request,
    workspace_id: str,
    path: str = "",
    workspace_access: tuple[CurrentUser, uuid.UUID] = Depends(require_workspace_access),
) -> Response:
    """
    Proxy all invitation requests to the microservice.

    This catch-all route handles:
    - "" (list/create invitations)
    - /templates
    - /{invitation_id}
    - /drafts
    - /{invitation_id}/exports
    - /{invitation_id}/media
    - /{invitation_id}/sub-events
    - /{invitation_id}/ai
    - /fonts
    - etc.
    """
    current_user, validated_workspace_id = workspace_access
    return await proxy_request(request, workspace_id=str(validated_workspace_id), path=path, current_user=current_user)

# Root path handler (for POST /digital-invitations and GET /digital-invitations)
@router.api_route(
    "",
    methods=["GET", "POST"],
    include_in_schema=False,
)
async def proxy_invitations_root(
    request: Request,
    workspace_id: str,
    workspace_access: tuple[CurrentUser, uuid.UUID] = Depends(require_workspace_access),
) -> Response:
    """Proxy root invitation endpoints (list/create)."""
    current_user, validated_workspace_id = workspace_access
    return await proxy_request(request, workspace_id=str(validated_workspace_id), path="", current_user=current_user)
