"""Proxy router for public invitation endpoints (no auth required)."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()

INVITATIONS_SERVICE_URL = get_settings().invitations_service_url or "http://localhost:8007"


async def proxy_public_request(
    request: Request,
    path: str = "",
) -> Response:
    """Proxy public invitation request (no auth required)."""
    if not INVITATIONS_SERVICE_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitations microservice not configured",
        )
    
    # Build target URL for public routes
    if path and not path.startswith("/"):
        path = "/" + path
    
    microservice_path = f"/api/v1/public/invitations{path}"
    target_url = f"{INVITATIONS_SERVICE_URL.rstrip('/')}{microservice_path}"
    
    # Forward query parameters
    query_params = dict(request.query_params)
    
    # Prepare headers (no auth required for public routes)
    headers = {
        "Content-Type": request.headers.get("Content-Type", "application/json"),
    }
    
    # Forward relevant headers
    for header_name in ["X-Request-ID", "X-Correlation-ID", "User-Agent", "Accept", "Origin", "Referer"]:
        if header_name in request.headers:
            headers[header_name] = request.headers[header_name]
    
    try:
        # Get request body if present
        body = None
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.json()
            except Exception:
                body = await request.body()
        
        # Make request to microservice
        async with httpx.AsyncClient(timeout=30.0) as client:
            if request.method == "GET":
                response = await client.get(target_url, params=query_params, headers=headers)
            elif request.method == "POST":
                response = await client.post(
                    target_url,
                    json=body if isinstance(body, dict) else None,
                    content=body if not isinstance(body, dict) else None,
                    params=query_params,
                    headers=headers,
                )
            elif request.method == "PUT":
                response = await client.put(
                    target_url,
                    json=body if isinstance(body, dict) else None,
                    content=body if not isinstance(body, dict) else None,
                    params=query_params,
                    headers=headers,
                )
            elif request.method == "PATCH":
                response = await client.patch(
                    target_url,
                    json=body if isinstance(body, dict) else None,
                    content=body if not isinstance(body, dict) else None,
                    params=query_params,
                    headers=headers,
                )
            elif request.method == "DELETE":
                response = await client.delete(target_url, params=query_params, headers=headers)
            else:
                raise HTTPException(
                    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
                    detail=f"Method {request.method} not supported",
                )
            
            # Handle streaming responses
            content_type = response.headers.get("Content-Type", "")
            if any(x in content_type for x in ["application/pdf", "text/csv", "image/", "application/octet-stream"]):
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
            f"Public microservice request failed: {e.response.status_code}",
            extra={"url": target_url, "method": request.method, "status_code": e.response.status_code},
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


# Catch-all for public invitation routes
@router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def proxy_public_invitations(
    request: Request,
    path: str = "",
) -> Response:
    """Proxy public invitation requests (no auth required)."""
    return await proxy_public_request(request, path=path)


# Root public path
@router.api_route(
    "",
    methods=["GET", "POST"],
    include_in_schema=False,
)
async def proxy_public_invitations_root(request: Request) -> Response:
    """Proxy root public invitation endpoints."""
    return await proxy_public_request(request, path="")
