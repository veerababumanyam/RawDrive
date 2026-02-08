"""FastMCP Server for RawDrive workspace operations.

Provides MCP tools for AI agents to interact with workspace data.
Requirement 18.1, 18.4, 18.5
"""

from __future__ import annotations

import logging
import os
import json
import time
from datetime import datetime, timezone
from typing import Any, List, Optional
from uuid import UUID, uuid4
import httpx
import contextvars

# Request correlation ID for distributed tracing
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar('request_id', default='')

from fastmcp import FastMCP
from pydantic import BaseModel, Field

from rawdrive_mcp.milvus_client import get_milvus_client
from rawdrive_mcp.db import get_db_conn, get_db_pool
from rawdrive_mcp.cache import get_redis_client, close_redis_client
from services.emotion_detection_service import get_emotion_service
from rawdrive_mcp.upload_monitoring import register_upload_monitoring_tools

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MCP_PORT = int(os.getenv("PORT_AI_SERVICE", "8013"))
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")

# CDN and Gallery URLs for mock data
# Default to example.com to make it clear these are placeholders
# In production, set these via environment variables
CDN_BASE_URL = os.getenv("CDN_BASE_URL", "https://cdn.rawdrive.ai")
GALLERY_SHARE_BASE_URL = os.getenv("GALLERY_SHARE_BASE_URL", "https://gallery.rawdrive.ai")
AI_PROCESSING_URL = os.getenv("AI_PROCESSING_URL", "http://ai-processing-service:8012")


# ---------------------------------------------------------------------------
# MCP Error Classes
# ---------------------------------------------------------------------------

class MCPError(Exception):
    """Base class for MCP-specific errors.
    
    Requirement 7.1, 7.2
    """
    
    def __init__(
        self,
        message: str,
        error_type: str,
        workspace_id: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.error_type = error_type
        self.workspace_id = workspace_id
        self.details = details or {}
        self.timestamp = datetime.now(timezone.utc)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert error to dictionary format."""
        return {
            "error": {
                "type": self.error_type,
                "code": f"MCP_{self.error_type.upper()}",
                "message": str(self),
                "workspace_id": self.workspace_id,
                "timestamp": self.timestamp.isoformat(),
                "details": self.details,
            }
        }


class MCPDatabaseError(MCPError):
    """Database-related MCP errors."""
    
    def __init__(
        self,
        message: str,
        operation: str,
        workspace_id: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            error_type="database_error",
            workspace_id=workspace_id,
            details={"operation": operation, **(details or {})},
        )


class MCPModelError(MCPError):
    """AI model-related MCP errors."""
    
    def __init__(
        self,
        message: str,
        model: str,
        operation: str,
        workspace_id: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            error_type="model_error",
            workspace_id=workspace_id,
            details={"model": model, "operation": operation, **(details or {})},
        )


class MCPTimeoutError(MCPError):
    """Timeout-related MCP errors."""
    
    def __init__(
        self,
        message: str,
        operation: str,
        timeout_seconds: float,
        workspace_id: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            error_type="timeout_error",
            workspace_id=workspace_id,
            details={
                "operation": operation,
                "timeout_seconds": timeout_seconds,
                **(details or {}),
            },
        )


class MCPValidationError(MCPError):
    """Validation-related MCP errors."""
    
    def __init__(
        self,
        message: str,
        field: str,
        value: Any,
        workspace_id: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            error_type="validation_error",
            workspace_id=workspace_id,
            details={"field": field, "value": str(value), **(details or {})},
        )


# ---------------------------------------------------------------------------
# MCP Server Instance
# ---------------------------------------------------------------------------

mcp = FastMCP(name="rawdrive-mcp")

# Register upload monitoring tools (Phase 6: AI Enhancement Plan)
register_upload_monitoring_tools(mcp)

# ASGI app for uvicorn - use http_app() or sse_app() for deployment
mcp_app = mcp.http_app()

# Create FastAPI app for REST endpoints
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route, Mount


try:
    from src.api.v1 import router as api_v1_router
except Exception as e:
    logger.error(f"Failed to import api_v1_router: {e}", exc_info=True)
    # Create empty router as fallback
    from fastapi import APIRouter
    api_v1_router = APIRouter()


@asynccontextmanager
async def lifespan(app):
    """Application lifespan for A2A service registration."""
    import asyncio
    import uuid

    # Startup - Register service in A2A registry (Phase 4: A2A Integration)
    # Optional: Only register if backend service_registry is available
    registry = None
    heartbeat_task = None
    try:
        import sys
        sys.path.insert(0, '/app/backend/src')
        from app.services.service_registry import (
            get_service_registry,
            ServiceRegistration,
            ServiceCapability,
        )
        registry = get_service_registry()
    except (ImportError, ModuleNotFoundError):
        logger.warning("A2A service registry not available - skipping registration")
        registry = None

    heartbeat_task = None
    if registry:
        service_id = os.getenv("SERVICE_ID", str(uuid.uuid4()))
        registration = ServiceRegistration(
            service_name="ai-service",
            service_id=service_id,
            base_url=os.getenv("SERVICE_BASE_URL", "http://ai-service:8013"),
            capabilities=[
                ServiceCapability(name="ai:analyze", version="1.0", endpoint="/api/v1/ai/analyze"),
                ServiceCapability(name="ai:duplicate", version="1.0", endpoint="/api/v1/ai/duplicates"),
                ServiceCapability(name="ai:curate", version="1.0", endpoint="/api/v1/ai/curate"),
                ServiceCapability(name="smart-tagging", version="1.0", endpoint="/api/v1/workspaces/{workspace_id}/smart-tagging"),
                ServiceCapability(name="mcp:tools", version="1.0", endpoint="/mcp"),
            ],
            health_check_endpoint="/health",
        )

        await registry.register(registration)
        logger.info(f"AI service registered in A2A registry: {service_id}")

        # Start heartbeat loop
        async def heartbeat_loop():
            """Send heartbeat every 15 seconds."""
            while True:
                try:
                    await asyncio.sleep(15)
                    await registry.heartbeat("ai-service", service_id)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Heartbeat failed: {e}")

        heartbeat_task = asyncio.create_task(heartbeat_loop())

    try:
        yield
    finally:
        # Shutdown: Unregister from A2A registry
        if registry and heartbeat_task:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
            try:
                await registry.unregister("ai-service", service_id)
                logger.info("AI service unregistered from A2A registry")
            except Exception as e:
                logger.error(f"Failed to unregister from A2A registry: {e}")


async def health_check(request):
    """Health check endpoint for Docker/K8s."""
    return JSONResponse({"status": "healthy", "service": "rawdrive-ai-service"})


# Create FastAPI app for REST endpoints

fastapi_app = FastAPI(
    title="RawDrive AI Service",
    description="AI Service for smart tagging and analysis",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate Limiting Setup (addresses HIGH priority from SECURITY_REVIEW.md)
# ---------------------------------------------------------------------------
from src.middleware.rate_limit import limiter, rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Attach limiter to app state
fastapi_app.state.limiter = limiter
fastapi_app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# Prometheus Metrics (addresses MEDIUM priority from SECURITY_REVIEW.md)
# ---------------------------------------------------------------------------
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    
    # Create instrumentator with custom settings
    instrumentator = Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        should_respect_env_var=True,
        should_instrument_requests_inprogress=True,
        excluded_handlers=["/health", "/metrics"],
        env_var_name="METRICS_ENABLED",
        inprogress_name="ai_service_requests_inprogress",
        inprogress_labels=True,
    )
    
    # Instrument the app and expose /metrics endpoint
    instrumentator.instrument(fastapi_app).expose(fastapi_app, include_in_schema=True)
    logger.info("Prometheus metrics enabled at /metrics")
except ImportError as e:
    logger.warning(f"Prometheus instrumentator not available: {e}")
except Exception as e:
    logger.warning(f"Failed to setup Prometheus metrics: {e}")

# Add request logging middleware with correlation ID
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request as StarletteRequest

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Middleware to add request correlation ID for distributed tracing.
    
    Addresses MEDIUM priority: Missing Request ID Tracing from SECURITY_REVIEW.md
    """
    async def dispatch(self, request: StarletteRequest, call_next):
        # Get request ID from header or generate new one
        request_id = request.headers.get('X-Request-ID', str(uuid4()))
        request_id_var.set(request_id)
        
        response = await call_next(request)
        
        # Add request ID to response headers for tracing
        response.headers['X-Request-ID'] = request_id
        return response

fastapi_app.add_middleware(RequestIdMiddleware)

# Add GZip compression middleware (addresses MEDIUM priority from SECURITY_REVIEW.md)
fastapi_app.add_middleware(GZipMiddleware, minimum_size=1000)

# Add CORS middleware - Use environment-based configuration (addresses HIGH priority from SECURITY_REVIEW.md)
# Parse allowed origins from environment variable
default_origins = "http://localhost,http://localhost:3000,http://localhost:5173,http://localhost:8000"
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", default_origins)
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

logger.info(f"CORS allowed origins: {allowed_origins}")

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Workspace-ID", "X-Request-ID"],
    max_age=3600,  # Cache preflight for 1 hour
)

# Add global exception handler (addresses MEDIUM priority from SECURITY_REVIEW.md)
from starlette.responses import JSONResponse
from fastapi import Request as FastAPIRequest

@fastapi_app.exception_handler(Exception)
async def global_exception_handler(request: FastAPIRequest, exc: Exception):
    """Global exception handler to return JSON error responses."""
    request_id = request_id_var.get()
    logger.exception(f"Unhandled exception [request_id={request_id}]: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred",
            "request_id": request_id,
        }
    )

# Include API v1 router

fastapi_app.include_router(api_v1_router, prefix="/api/v1")

# ---------------------------------------------------------------------------
# Enhanced Health Check (addresses MEDIUM priority from SECURITY_REVIEW.md)
# ---------------------------------------------------------------------------
from src.middleware.circuit_breaker import get_all_circuit_breaker_status

@fastapi_app.get("/health")
async def fastapi_health():
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "rawdrive-ai-service"}


@fastapi_app.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check with dependency status.
    
    Checks:
    - Database connectivity
    - Redis connectivity  
    - Milvus connectivity
    - Circuit breaker status
    """
    health_status = {
        "status": "healthy",
        "service": "rawdrive-ai-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dependencies": {},
        "circuit_breakers": {},
    }
    
    issues = []
    
    # Check database
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        health_status["dependencies"]["database"] = {
            "status": "healthy",
            "pool_size": pool.get_size() if hasattr(pool, 'get_size') else "unknown",
        }
    except Exception as e:
        health_status["dependencies"]["database"] = {
            "status": "unhealthy",
            "error": str(e),
        }
        issues.append("database")
    
    # Check Redis
    try:
        redis = await get_redis_client()
        await redis.ping()
        info = await redis.info("server")
        health_status["dependencies"]["redis"] = {
            "status": "healthy",
            "version": info.get("redis_version", "unknown"),
        }
    except Exception as e:
        health_status["dependencies"]["redis"] = {
            "status": "unhealthy",
            "error": str(e),
        }
        issues.append("redis")
    
    # Check Milvus
    try:
        milvus = await get_milvus_client()
        if milvus:
            health_status["dependencies"]["milvus"] = {"status": "healthy"}
        else:
            health_status["dependencies"]["milvus"] = {"status": "not_configured"}
    except Exception as e:
        health_status["dependencies"]["milvus"] = {
            "status": "unhealthy",
            "error": str(e),
        }
        issues.append("milvus")
    
    # Get circuit breaker status
    health_status["circuit_breakers"] = get_all_circuit_breaker_status()
    
    # Determine overall status
    if issues:
        health_status["status"] = "degraded"
        health_status["issues"] = issues
    
    return health_status


# Add test endpoint to verify routing
@fastapi_app.get("/api/v1/test")
async def test_endpoint():
    """Test endpoint to verify FastAPI routing is working."""
    return {"status": "ok", "message": "FastAPI routing is working", "service": "ai-service"}

# Mount MCP app at /mcp
from starlette.routing import Mount as StarletteMount
fastapi_app.mount("/mcp", mcp_app)

# Use FastAPI as the main app (it can handle both FastAPI routes and Starlette mounts)
app = fastapi_app


# ---------------------------------------------------------------------------
# Tool Input/Output Models
# ---------------------------------------------------------------------------


class AuthContext(BaseModel):
    """Authentication context for MCP calls."""

    user_id: str
    workspace_id: str
    permissions: list[str] = []


class GalleryItem(BaseModel):
    """Gallery summary for listings."""

    gallery_id: str
    name: str
    description: str | None = None
    photo_count: int = 0
    created_at: datetime
    updated_at: datetime


class GalleryDetail(BaseModel):
    """Full gallery details."""

    gallery_id: str
    name: str
    description: str | None = None
    cover_photo_url: str | None = None
    photo_count: int = 0
    is_published: bool = False
    share_link: str | None = None
    created_at: datetime
    updated_at: datetime
    settings: dict[str, Any] = {}


class PhotoItem(BaseModel):
    """Photo summary."""

    photo_id: str
    filename: str
    thumbnail_url: str | None = None
    width: int | None = None
    height: int | None = None
    file_size: int | None = None
    uploaded_at: datetime


class PhotoSearchResult(BaseModel):
    """Search result with relevance."""

    photo: PhotoItem
    relevance_score: float
    matched_tags: list[str] = []


# ---------------------------------------------------------------------------
# Authentication Helper
# ---------------------------------------------------------------------------


def _extract_auth_context(context: dict[str, Any]) -> AuthContext:
    """Extract and validate auth context from MCP call context.

    Requirement 18.2: MCP calls must include authentication context.
    """
    auth = context.get("auth", {})

    if not auth.get("user_id") or not auth.get("workspace_id"):
        raise ValueError("Authentication context required: user_id and workspace_id")

    return AuthContext(
        user_id=auth["user_id"],
        workspace_id=auth["workspace_id"],
        permissions=auth.get("permissions", []),
    )


def _check_permission(auth: AuthContext, required: str) -> None:
    """Check if user has required permission.

    Requirement 18.3: Permission checks for MCP operations.
    """
    if required not in auth.permissions and "*" not in auth.permissions:
        raise PermissionError(f"Permission denied: {required}")


# ---------------------------------------------------------------------------
# MCP Tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def list_galleries(
    workspace_id: str = Field(description="Workspace ID to list galleries from"),
    limit: int = Field(default=50, description="Maximum number of galleries to return"),
    offset: int = Field(default=0, description="Offset for pagination"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """List all galleries in a workspace.

    Returns a paginated list of galleries the user has access to.
    Requires 'galleries:read' permission.
    """
    auth = _extract_auth_context(context)

    # Verify workspace access
    if auth.workspace_id != workspace_id:
        raise PermissionError("Cannot access galleries from different workspace")

    _check_permission(auth, "galleries:read")

    # Query database for galleries
    try:
        async with get_db_conn() as conn:
            # Get total count
            total = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM galleries
                WHERE workspace_id = $1 AND deleted = FALSE
                """,
                UUID(workspace_id),
            )

            # Get galleries with photo count
            rows = await conn.fetch(
                """
                SELECT
                    g.gallery_id,
                    g.title as name,
                    g.description,
                    g.created_at,
                    g.updated_at,
                    (
                        SELECT COUNT(*)
                        FROM gallery_assets ga
                        WHERE ga.gallery_id = g.gallery_id
                          AND ga.workspace_id = g.workspace_id
                          AND ga.deleted = FALSE
                    ) as photo_count
                FROM galleries g
                WHERE g.workspace_id = $1 AND g.deleted = FALSE
                ORDER BY g.created_at DESC
                LIMIT $2 OFFSET $3
                """,
                UUID(workspace_id),
                limit,
                offset,
            )

            galleries = []
            for row in rows:
                galleries.append(
                    GalleryItem(
                        gallery_id=str(row["gallery_id"]),
                        name=row["name"],
                        description=row["description"],
                        photo_count=row["photo_count"],
                        created_at=row["created_at"].replace(tzinfo=timezone.utc) if row["created_at"].tzinfo is None else row["created_at"],
                        updated_at=row["updated_at"].replace(tzinfo=timezone.utc) if row["updated_at"].tzinfo is None else row["updated_at"],
                    )
                )

            return {
                "galleries": [g.model_dump() for g in galleries],
                "total": total,
                "limit": limit,
                "offset": offset,
            }

    except Exception as e:
        logger.error(f"Failed to list galleries: {e}")
        raise MCPDatabaseError(
            message=f"Failed to list galleries: {str(e)}",
            operation="list_galleries",
            workspace_id=workspace_id,
        )


@mcp.tool()
async def get_gallery(
    workspace_id: str = Field(description="Workspace ID"),
    gallery_id: str = Field(description="Gallery ID to retrieve"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Get detailed information about a specific gallery.

    Returns gallery metadata, settings, and share information.
    Requires 'galleries:read' permission.
    """
    auth = _extract_auth_context(context)

    if auth.workspace_id != workspace_id:
        raise PermissionError("Cannot access gallery from different workspace")

    _check_permission(auth, "galleries:read")

    # Query database for gallery details
    try:
        async with get_db_conn() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    g.gallery_id,
                    g.title as name,
                    g.description,
                    g.cover_asset_id,
                    g.status,
                    g.download_policy,
                    g.exif_visible,
                    g.expires_at,
                    g.created_at,
                    g.updated_at,
                    g.published_at,
                    (
                        SELECT COUNT(*)
                        FROM gallery_assets ga
                        WHERE ga.gallery_id = g.gallery_id
                          AND ga.workspace_id = g.workspace_id
                          AND ga.deleted = FALSE
                    ) as photo_count
                FROM galleries g
                WHERE g.gallery_id = $1
                  AND g.workspace_id = $2
                  AND g.deleted = FALSE
                """,
                UUID(gallery_id),
                UUID(workspace_id),
            )

            if not row:
                raise MCPDatabaseError(
                    message=f"Gallery {gallery_id} not found",
                    operation="get_gallery",
                    workspace_id=workspace_id,
                )

            # Get magic links for share link
            magic_link_row = await conn.fetchrow(
                """
                SELECT short_code
                FROM magic_links
                WHERE gallery_id = $1
                  AND workspace_id = $2
                  AND is_active = TRUE
                  AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY created_at DESC
                LIMIT 1
                """,
                UUID(gallery_id),
                UUID(workspace_id),
            )

            share_link = None
            if magic_link_row:
                share_link = f"{GALLERY_SHARE_BASE_URL}/s/{magic_link_row['short_code']}"

            cover_photo_url = None
            if row["cover_asset_id"]:
                cover_photo_url = f"{CDN_BASE_URL}/thumb/{row['cover_asset_id']}.jpg"

            gallery = GalleryDetail(
                gallery_id=str(row["gallery_id"]),
                name=row["name"],
                description=row["description"],
                cover_photo_url=cover_photo_url,
                photo_count=row["photo_count"],
                is_published=(row["status"] == "published"),
                share_link=share_link,
                created_at=row["created_at"].replace(tzinfo=timezone.utc) if row["created_at"].tzinfo is None else row["created_at"],
                updated_at=row["updated_at"].replace(tzinfo=timezone.utc) if row["updated_at"].tzinfo is None else row["updated_at"],
                settings={
                    "download_policy": row["download_policy"] or "disabled",
                    "watermark_enabled": row["download_policy"] in ["watermarked_only", "watermarked_and_original"],
                    "expiry_days": (row["expires_at"] - datetime.now(timezone.utc)).days if row["expires_at"] else None,
                    "exif_visible": row["exif_visible"] or False,
                },
            )

            return gallery.model_dump()

    except MCPDatabaseError:
        raise
    except Exception as e:
        logger.error(f"Failed to get gallery: {e}")
        raise MCPDatabaseError(
            message=f"Failed to get gallery: {str(e)}",
            operation="get_gallery",
            workspace_id=workspace_id,
        )


@mcp.tool()
async def list_photos(
    workspace_id: str = Field(description="Workspace ID"),
    gallery_id: str = Field(description="Gallery ID to list photos from"),
    limit: int = Field(default=100, description="Maximum number of photos to return"),
    offset: int = Field(default=0, description="Offset for pagination"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """List photos in a gallery.

    Returns a paginated list of photos with thumbnails.
    Requires 'photos:read' permission.
    """
    auth = _extract_auth_context(context)

    if auth.workspace_id != workspace_id:
        raise PermissionError("Cannot access photos from different workspace")

    _check_permission(auth, "photos:read")

    # Query database for photos in gallery
    try:
        async with get_db_conn() as conn:
            # Get total count
            total = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1
                  AND ga.workspace_id = $2
                  AND ga.deleted = FALSE
                  AND a.deleted = FALSE
                """,
                UUID(gallery_id),
                UUID(workspace_id),
            )

            # Get photos
            rows = await conn.fetch(
                """
                SELECT
                    a.asset_id,
                    a.original_file_name,
                    a.generated_file_name,
                    a.width,
                    a.height,
                    a.size_bytes,
                    a.created_at
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1
                  AND ga.workspace_id = $2
                  AND ga.deleted = FALSE
                  AND a.deleted = FALSE
                ORDER BY ga.sort_order ASC, a.created_at DESC
                LIMIT $3 OFFSET $4
                """,
                UUID(gallery_id),
                UUID(workspace_id),
                limit,
                offset,
            )

            photos = []
            for row in rows:
                filename = row["original_file_name"] or row["generated_file_name"] or f"IMG_{row['asset_id']}.jpg"
                photos.append(
                    PhotoItem(
                        photo_id=str(row["asset_id"]),
                        filename=filename,
                        thumbnail_url=f"{CDN_BASE_URL}/thumb/{row['asset_id']}.jpg",
                        width=row["width"] or 0,
                        height=row["height"] or 0,
                        file_size=row["size_bytes"] or 0,
                        uploaded_at=row["created_at"].replace(tzinfo=timezone.utc) if row["created_at"].tzinfo is None else row["created_at"],
                    )
                )

            return {
                "photos": [p.model_dump() for p in photos],
                "total": total,
                "gallery_id": gallery_id,
                "limit": limit,
                "offset": offset,
            }

    except Exception as e:
        logger.error(f"Failed to list photos: {e}")
        raise MCPDatabaseError(
            message=f"Failed to list photos: {str(e)}",
            operation="list_photos",
            workspace_id=workspace_id,
        )


@mcp.tool()
async def search_photos(
    workspace_id: str = Field(description="Workspace ID"),
    query: str = Field(description="Search query (tags, description, or semantic search)"),
    gallery_id: str | None = Field(default=None, description="Optional gallery ID to search within"),
    tags: list[str] = Field(default=[], description="Filter by specific tags"),
    date_from: str | None = Field(default=None, description="Filter photos from this date (ISO format)"),
    date_to: str | None = Field(default=None, description="Filter photos until this date (ISO format)"),
    limit: int = Field(default=50, description="Maximum number of results"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Search photos with semantic and tag-based filtering.

    Searches across photo metadata, AI-generated tags, and descriptions.
    Requires 'photos:read' permission.
    """
    auth = _extract_auth_context(context)

    if auth.workspace_id != workspace_id:
        raise PermissionError("Cannot search photos from different workspace")

    _check_permission(auth, "photos:read")

    milvus = get_milvus_client()
    results = []
    
    if query and milvus.enabled:
        try:
            # 1. Get embedding from AI Processing Service
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{AI_PROCESSING_URL}/embed/text",
                    json={"text": query},
                    timeout=10.0
                )
                resp.raise_for_status()
                embedding = resp.json()["embedding"]

            # 2. Search in Milvus
            hits = milvus.search_photos(
                query_vector=embedding,
                workspace_id=workspace_id,
                limit=limit
            )

            # 3. Re-hydrate matched photos from Database with optional filters
            hit_map = {hit["id"]: hit["score"] for hit in hits}
            asset_ids = list(hit_map.keys())

            if asset_ids:
                try:
                    async with get_db_conn() as conn:
                        # Build query with optional filters
                        query_parts = [
                            """
                            SELECT
                                a.asset_id,
                                a.original_file_name,
                                a.generated_file_name,
                                a.width,
                                a.height,
                                a.size_bytes,
                                a.created_at
                            FROM assets a
                            """
                        ]

                        # Add gallery join if filtering by gallery
                        if gallery_id:
                            query_parts.append(
                                """
                                JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                                    AND a.workspace_id = ga.workspace_id
                                """
                            )

                        where_clauses = [
                            "a.asset_id = ANY($1::uuid[])",
                            "a.workspace_id = $2",
                            "a.deleted = FALSE"
                        ]
                        params = [[UUID(id) for id in asset_ids], UUID(workspace_id)]
                        param_idx = 3

                        # Add gallery filter
                        if gallery_id:
                            where_clauses.append(f"ga.gallery_id = ${param_idx}")
                            params.append(UUID(gallery_id))
                            param_idx += 1

                        # Add date filters
                        if date_from:
                            where_clauses.append(f"a.created_at >= ${param_idx}")
                            params.append(date_from)
                            param_idx += 1

                        if date_to:
                            where_clauses.append(f"a.created_at <= ${param_idx}")
                            params.append(date_to)
                            param_idx += 1

                        query_parts.append(f"WHERE {' AND '.join(where_clauses)}")

                        full_query = " ".join(query_parts)
                        rows = await conn.fetch(full_query, *params)
                        
                        for row in rows:
                            asset_id_str = str(row["asset_id"])
                            # Use generated name if original missing, or fallback
                            filename = row["original_file_name"] or row["generated_file_name"] or f"IMG_{asset_id_str}.jpg"
                            
                            results.append(
                                PhotoSearchResult(
                                    photo=PhotoItem(
                                        photo_id=asset_id_str,
                                        filename=filename,
                                        thumbnail_url=f"{CDN_BASE_URL}/thumb/{asset_id_str}.jpg", # TODO: Use actual object key
                                        width=row["width"],
                                        height=row["height"],
                                        file_size=row["size_bytes"],
                                        uploaded_at=row["created_at"].replace(tzinfo=timezone.utc) if row["created_at"].tzinfo is None else row["created_at"],
                                    ),
                                    relevance_score=hit_map[asset_id_str],
                                    matched_tags=[], # Tags fetching would require another query or join
                                )
                            )
                            
                    # Sort by relevance score
                    results.sort(key=lambda x: x.relevance_score, reverse=True)
                    
                except Exception as db_err:
                    logger.error(f"Database hydration failed: {db_err}")
                    # Fallback to stub if DB fails
                    for hit in hits:
                         results.append(
                            PhotoSearchResult(
                                photo=PhotoItem(
                                    photo_id=hit["id"],
                                    filename=f"IMG_{hit['id']}.jpg",
                                    thumbnail_url=f"{CDN_BASE_URL}/thumb/{hit['id']}.jpg",
                                    uploaded_at=datetime.now(timezone.utc),
                                ),
                                relevance_score=hit["score"],
                                matched_tags=[],
                            )
                        )
        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            # Fallback to empty or legacy search if implemented

    return {
        "results": [r.model_dump() for r in results],
        "total": len(results),
        "query": query,
        "filters": {
            "gallery_id": gallery_id,
            "tags": tags,
            "date_from": date_from,
            "date_to": date_to,
        },
    }


@mcp.tool()
async def get_workspace_stats(
    workspace_id: str = Field(description="Workspace ID"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Get workspace statistics and usage information.

    Returns storage usage, photo counts, and subscription limits.
    Requires 'workspace:read' permission.
    """
    auth = _extract_auth_context(context)

    if auth.workspace_id != workspace_id:
        raise PermissionError("Cannot access stats from different workspace")

    _check_permission(auth, "workspace:read")

    # Query database for workspace statistics
    try:
        async with get_db_conn() as conn:
            # Get gallery counts
            gallery_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'published') as published
                FROM galleries
                WHERE workspace_id = $1 AND deleted = FALSE
                """,
                UUID(workspace_id),
            )

            # Get photo counts and storage
            photo_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total,
                    COALESCE(SUM(size_bytes), 0) as storage_bytes
                FROM assets
                WHERE workspace_id = $1 AND deleted = FALSE
                """,
                UUID(workspace_id),
            )

            # Get workspace subscription info
            workspace_row = await conn.fetchrow(
                """
                SELECT
                    w.storage_quota_bytes,
                    s.tier_name
                FROM workspaces w
                LEFT JOIN subscriptions s ON w.subscription_id = s.subscription_id
                WHERE w.workspace_id = $1
                """,
                UUID(workspace_id),
            )

            # Get activity stats
            last_upload_row = await conn.fetchrow(
                """
                SELECT created_at
                FROM assets
                WHERE workspace_id = $1 AND deleted = FALSE
                ORDER BY created_at DESC
                LIMIT 1
                """,
                UUID(workspace_id),
            )

            gallery_views_30d = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM gallery_access_logs
                WHERE workspace_id = $1
                  AND accessed_at >= NOW() - INTERVAL '30 days'
                """,
                UUID(workspace_id),
            ) or 0

            # Calculate storage usage percentage
            storage_bytes = photo_stats["storage_bytes"] or 0
            storage_limit = workspace_row["storage_quota_bytes"] if workspace_row else 100_000_000_000  # Default 100GB
            storage_used_percent = int((storage_bytes / storage_limit) * 100) if storage_limit > 0 else 0

            return {
                "workspace_id": workspace_id,
                "galleries": {
                    "total": gallery_stats["total"] or 0,
                    "published": gallery_stats["published"] or 0,
                },
                "photos": {
                    "total": photo_stats["total"] or 0,
                    "storage_bytes": storage_bytes,
                },
                "subscription": {
                    "plan": workspace_row["tier_name"] if workspace_row and workspace_row["tier_name"] else "free",
                    "storage_limit_bytes": storage_limit,
                    "storage_used_percent": storage_used_percent,
                },
                "activity": {
                    "last_upload": last_upload_row["created_at"].isoformat() if last_upload_row else None,
                    "gallery_views_30d": gallery_views_30d,
                    "downloads_30d": 0,  # Would need download_logs table
                },
            }

    except Exception as e:
        logger.error(f"Failed to get workspace stats: {e}")
        raise MCPDatabaseError(
            message=f"Failed to get workspace stats: {str(e)}",
            operation="get_workspace_stats",
            workspace_id=workspace_id,
        )


@mcp.tool()
async def analyze_photo_emotions(
    photo_id: str = Field(description="Photo UUID to analyze"),
    workspace_id: str = Field(description="Workspace UUID"),
    provider: str = Field(default="cloud_vision", description="AI provider (cloud_vision, gemini)"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Detect emotions in photo faces (joy, sadness, anger, surprise, fear, disgust, contentment).

    Uses customer API keys from user profile. Costs 10 credits per photo.

    Args:
        photo_id: UUID of photo to analyze
        workspace_id: UUID of workspace
        provider: AI provider to use (cloud_vision or gemini)
        context: Auth context with user_id

    Returns:
        Emotion analysis with per-face and photo-level summaries

    Raises:
        ValueError: If customer API keys not configured
        PermissionError: If user lacks permission
    """
    auth = _extract_auth_context(context)

    if auth.workspace_id != workspace_id:
        raise PermissionError("Cannot analyze photo from different workspace")

    _check_permission(auth, "ai:analyze")

    # Get emotion detection service
    db_pool = await get_db_pool()
    service = get_emotion_service(db_pool)

    try:
        result = await service.detect_emotions(
            photo_id=UUID(photo_id),
            user_id=UUID(auth.user_id),
            workspace_id=UUID(workspace_id),
            provider=provider,
        )

        return result.to_dict()

    except ValueError as e:
        raise ValueError(f"Emotion detection failed: {str(e)}")
    except Exception as e:
        logger.error(f"MCP emotion detection error: {e}")
        raise Exception(f"Emotion detection failed: {str(e)}")


@mcp.tool()
async def search_photos_by_emotion(
    workspace_id: str = Field(description="Workspace UUID"),
    emotion: str = Field(description="Emotion to search (joy, sadness, anger, surprise, fear, disgust, contentment)"),
    gallery_id: str | None = Field(default=None, description="Optional gallery to filter"),
    min_confidence: float = Field(default=0.7, description="Minimum confidence threshold (0-1)"),
    limit: int = Field(default=50, description="Maximum number of results"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Search photos by detected emotion.

    Searches previously analyzed photos for specific emotions.
    No credits charged (uses cached results).

    Args:
        workspace_id: Workspace UUID
        emotion: Emotion to search (joy, sadness, anger, surprise, fear, disgust, contentment)
        gallery_id: Optional gallery to filter
        min_confidence: Minimum confidence threshold (0.0 to 1.0)
        limit: Maximum number of photos to return

    Returns:
        List of photos matching emotion criteria with scores

    Raises:
        PermissionError: If user lacks permission
        ValueError: If invalid emotion type
    """
    auth = _extract_auth_context(context)

    if auth.workspace_id != workspace_id:
        raise PermissionError("Cannot search photos from different workspace")

    _check_permission(auth, "photos:read")

    # Validate emotion type
    valid_emotions = {"joy", "sadness", "anger", "surprise", "fear", "disgust", "contentment"}
    if emotion not in valid_emotions:
        raise ValueError(f"Invalid emotion: {emotion}. Must be one of {valid_emotions}")

    # Query database for photos with emotion
    try:
        async with get_db_conn() as conn:
            query = """
                SELECT
                    aa.asset_id,
                    aa.emotions,
                    aa.dominant_emotion,
                    aa.emotion_confidence,
                    a.original_file_name,
                    a.generated_file_name,
                    a.width,
                    a.height,
                    a.size_bytes,
                    a.created_at
                FROM asset_analysis aa
                JOIN assets a ON aa.asset_id = a.asset_id
                WHERE aa.workspace_id = $1
                  AND (aa.emotions->>$2)::float >= $3
            """

            params = [UUID(workspace_id), emotion, min_confidence]

            if gallery_id:
                query += " AND a.gallery_id = $4"
                params.append(UUID(gallery_id))

            query += f" ORDER BY (aa.emotions->>$2)::float DESC LIMIT {limit}"

            rows = await conn.fetch(query, *params)

            photos = []
            for row in rows:
                filename = row["original_file_name"] or row["generated_file_name"] or f"IMG_{row['asset_id']}.jpg"
                emotion_score = row["emotions"].get(emotion, 0.0) if row["emotions"] else 0.0

                photos.append({
                    "photo_id": str(row["asset_id"]),
                    "filename": filename,
                    "thumbnail_url": f"{CDN_BASE_URL}/thumb/{row['asset_id']}.jpg",
                    "width": row["width"],
                    "height": row["height"],
                    "file_size": row["size_bytes"],
                    "uploaded_at": row["created_at"].replace(tzinfo=timezone.utc).isoformat() if row["created_at"].tzinfo is None else row["created_at"].isoformat(),
                    "emotion_score": emotion_score,
                    "dominant_emotion": row["dominant_emotion"],
                    "confidence": row["emotion_confidence"],
                })

            return {
                "photos": photos,
                "total": len(photos),
                "emotion": emotion,
                "min_confidence": min_confidence,
                "gallery_id": gallery_id,
            }

    except Exception as e:
        logger.error(f"Emotion search failed: {e}")
        raise Exception(f"Emotion search failed: {str(e)}")


@mcp.tool()
async def find_duplicate_photos(
    workspace_id: str = Field(description="Workspace UUID"),
    gallery_id: str | None = Field(default=None, description="Optional gallery to scan (scans all if not provided)"),
    similarity_threshold: float = Field(default=0.85, description="Similarity threshold (0.85 = 85% similar, higher = stricter)"),
    min_group_size: int = Field(default=2, description="Minimum number of photos in a duplicate group"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Find visually similar/duplicate photos using perceptual hashing.

    Detects duplicate photos based on visual content using pHash algorithm.
    Robust to resizing, compression, and minor modifications.
    Cost: 10 credits per 100 photos (one-time hash computation), subsequent scans are free.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Optional gallery ID to scan (scans all photos if not provided)
        similarity_threshold: Similarity threshold (0.85 = 85% similar, higher = stricter)
        min_group_size: Minimum number of photos in a duplicate group
        context: Auth context with user_id

    Returns:
        Dict with duplicate_groups, total_groups, photos_scanned, credits_used

    Raises:
        PermissionError: If user lacks permission
        ValueError: If insufficient AI credits
    """
    auth = _extract_auth_context(context)

    if auth.workspace_id != workspace_id:
        raise PermissionError("Cannot find duplicates from different workspace")

    _check_permission(auth, "ai:duplicate")

    # Call backend API endpoint
    try:
        backend_url = os.getenv("BACKEND_URL", "http://backend:8000")
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{backend_url}/api/v1/workspaces/{workspace_id}/photos/detect-duplicates",
                json={
                    "gallery_id": gallery_id,
                    "similarity_threshold": similarity_threshold,
                    "min_group_size": min_group_size,
                },
                headers={
                    "Authorization": f"Bearer {context.get('token', '')}",
                },
            )

            if response.status_code == 402:
                raise ValueError("Insufficient AI credits. Please upgrade your plan or wait for monthly reset.")

            if response.status_code != 200:
                raise Exception(f"Duplicate detection failed: {response.text}")

            result = response.json()

            return {
                "duplicate_groups": result.get("duplicate_groups", []),
                "total_groups": result.get("total_groups", 0),
                "total_photos_scanned": result.get("total_photos_scanned", 0),
                "photos_with_duplicates": result.get("photos_with_duplicates", 0),
                "credits_used": result.get("credits_used", 0),
                "credits_remaining": result.get("credits_remaining", 0),
                "gallery_id": gallery_id,
                "similarity_threshold": similarity_threshold,
            }

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error calling backend: {e}")
        raise Exception(f"Failed to detect photo duplicates: {str(e)}")
    except Exception as e:
        logger.error(f"Photo duplicate detection failed: {e}")
        raise Exception(f"Photo duplicate detection failed: {str(e)}")


@mcp.tool()
async def find_duplicate_clients(
    workspace_id: str = Field(description="Workspace UUID"),
    mode: str = Field(default="hybrid", description="Detection mode: ai (Gemini embeddings), traditional (Levenshtein), hybrid (both)"),
    similarity_threshold: float = Field(default=0.75, description="Similarity threshold (0.75 = 75% similar, higher = stricter)"),
    min_group_size: int = Field(default=2, description="Minimum number of clients in a duplicate group"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Find duplicate client records using AI semantic embeddings.

    Detects semantically similar clients using Google Gemini embeddings.
    Analyzes name, email, phone, and address data for similarity.
    Supports 3 modes: ai (Gemini only), traditional (Levenshtein), hybrid (both).
    Cost: 15 credits per 100 clients (one-time embedding generation), subsequent scans are free.

    Args:
        workspace_id: Workspace UUID
        mode: Detection mode (ai, traditional, hybrid)
        similarity_threshold: Similarity threshold (0.75 = 75% similar, higher = stricter)
        min_group_size: Minimum number of clients in a duplicate group
        context: Auth context with user_id

    Returns:
        Dict with duplicate_groups, total_groups, clients_scanned, credits_used

    Raises:
        PermissionError: If user lacks permission
        ValueError: If insufficient AI credits or invalid mode
    """
    auth = _extract_auth_context(context)

    if auth.workspace_id != workspace_id:
        raise PermissionError("Cannot find duplicates from different workspace")

    _check_permission(auth, "ai:duplicate")

    # Validate mode
    if mode not in ["ai", "traditional", "hybrid"]:
        raise ValueError(f"Invalid mode: {mode}. Must be 'ai', 'traditional', or 'hybrid'")

    # Call backend API endpoint
    try:
        backend_url = os.getenv("BACKEND_URL", "http://backend:8000")
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{backend_url}/api/v1/workspaces/{workspace_id}/clients/detect-duplicates-ai",
                json={
                    "mode": mode,
                    "similarity_threshold": similarity_threshold,
                    "min_group_size": min_group_size,
                },
                headers={
                    "Authorization": f"Bearer {context.get('token', '')}",
                },
            )

            if response.status_code == 402:
                raise ValueError("Insufficient AI credits. Please upgrade your plan or wait for monthly reset.")

            if response.status_code != 200:
                raise Exception(f"Duplicate detection failed: {response.text}")

            result = response.json()

            return {
                "duplicate_groups": result.get("duplicate_groups", []),
                "total_groups": result.get("total_groups", 0),
                "total_clients_scanned": result.get("total_clients_scanned", 0),
                "clients_with_duplicates": result.get("clients_with_duplicates", 0),
                "credits_used": result.get("credits_used", 0),
                "credits_remaining": result.get("credits_remaining", 0),
                "mode": mode,
                "similarity_threshold": similarity_threshold,
            }

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error calling backend: {e}")
        raise Exception(f"Failed to detect client duplicates: {str(e)}")
    except Exception as e:
        logger.error(f"Client duplicate detection failed: {e}")
        raise Exception(f"Client duplicate detection failed: {str(e)}")


# ---------------------------------------------------------------------------
# Resources (Read-only data)
# ---------------------------------------------------------------------------


@mcp.resource("workspace://{workspace_id}/info")
async def workspace_info_resource(workspace_id: str) -> str:
    """Get basic workspace information as a resource."""
    try:
        async with get_db_conn() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    w.name,
                    w.status,
                    w.created_at,
                    s.tier_name,
                    (SELECT COUNT(*) FROM galleries WHERE workspace_id = w.workspace_id AND deleted = FALSE) as gallery_count,
                    (SELECT COUNT(*) FROM assets WHERE workspace_id = w.workspace_id AND deleted = FALSE) as photo_count
                FROM workspaces w
                LEFT JOIN subscriptions s ON w.subscription_id = s.subscription_id
                WHERE w.workspace_id = $1
                """,
                UUID(workspace_id),
            )

            if not row:
                return f"Workspace: {workspace_id}\nStatus: Not Found"

            return f"""
Workspace: {workspace_id}
Name: {row['name'] or 'Unnamed Workspace'}
Plan: {row['tier_name'] or 'Free'}
Status: {row['status'] or 'active'}
Galleries: {row['gallery_count']}
Photos: {row['photo_count']}
Created: {row['created_at'].strftime('%Y-%m-%d') if row['created_at'] else 'Unknown'}
            """
    except Exception as e:
        logger.error(f"Failed to fetch workspace info resource: {e}")
        return f"Workspace: {workspace_id}\nError: {str(e)}"


@mcp.resource("workspace://{workspace_id}/galleries")
async def galleries_resource(workspace_id: str) -> str:
    """Get list of galleries as a resource."""
    try:
        async with get_db_conn() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    g.title,
                    g.status,
                    (
                        SELECT COUNT(*)
                        FROM gallery_assets ga
                        WHERE ga.gallery_id = g.gallery_id
                          AND ga.workspace_id = g.workspace_id
                          AND ga.deleted = FALSE
                    ) as photo_count
                FROM galleries g
                WHERE g.workspace_id = $1 AND g.deleted = FALSE
                ORDER BY g.created_at DESC
                LIMIT 20
                """,
                UUID(workspace_id),
            )

            if not rows:
                return f"Workspace {workspace_id}: No galleries found"

            lines = [f"Galleries in workspace {workspace_id}:", ""]
            for idx, row in enumerate(rows, 1):
                status = row['status'] or 'draft'
                lines.append(f"{idx}. {row['title']} ({row['photo_count']} photos, {status})")

            return "\n".join(lines)

    except Exception as e:
        logger.error(f"Failed to fetch galleries resource: {e}")
        return f"Error fetching galleries: {str(e)}"


# ---------------------------------------------------------------------------
# Server Entry Point
# ---------------------------------------------------------------------------


def run_mcp_server():
    """Run the MCP server."""
    import uvicorn

    logger.info(f"Starting MCP server on {MCP_HOST}:{MCP_PORT}")
    uvicorn.run(
        "ai_service.mcp.server:mcp.app",
        host=MCP_HOST,
        port=MCP_PORT,
        reload=os.getenv("MCP_RELOAD", "false").lower() == "true",
    )


if __name__ == "__main__":
    run_mcp_server()
@mcp.tool()
async def ask_gallery(
    workspace_id: str = Field(description="Workspace UUID"),
    gallery_id: str = Field(description="Gallery ID to reason over"),
    query: str = Field(description="Natural language question about the gallery"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Ask a question about a gallery using visual reasoning (RAG).
    
    This tool retrieves relevant photos using semantic search and then uses
    Gemini Vision to visually analyze them to answer the user's question.
    REQUIRES: User must have a configured Gemini API Key.
    """
    try:
        # 1. Search for relevant photos (Stage 1 retrieval)
        search_results = await search_photos(
            workspace_id=workspace_id,
            query=query,
            gallery_id=gallery_id,
            limit=20, # Fetch top 20 candidates
            context=context
        )
        
        photos = search_results.get("photos", [])
        if not photos:
            return {
                "answer": "I couldn't find any relevant photos in this gallery to answer your question.",
                "cited_photos": []
            }

        # 2. Extract image URLs (thumbnails for speed/cost)
        # Assuming photo objects have a 'urls' dict with 'thumbnail' or 'small'
        image_urls = []
        valid_photos = []
        for photo in photos:
            url = photo.get("urls", {}).get("small") or photo.get("urls", {}).get("thumbnail")
            if url:
                image_urls.append(url)
                valid_photos.append(photo)
        
        if not image_urls:
             return {
                "answer": "I found relevant photos, but could not access their visual data.",
                "cited_photos": []
            }

        # 3. Get User's API Key (Decrypted) via internal service call
        # We need to use the GeminiClientService to resolve the key securely
        # Note: In a real implementation, we'd inject this service properly
        # For now, we'll use the factory pattern
        from app.services.gemini_client_service import GeminiClientService
        client_service = GeminiClientService()
        
        user_id = context.get("user", {}).get("id")
        if not user_id:
             return {
                "error": "User context required for reasoning features.",
                 "code": "AUTH_REQUIRED"
            }

        try:
            config = await client_service.get_client_config(UUID(user_id), UUID(workspace_id))
            api_key = config.api_key
        except Exception as e:
             return {
                "error": "You need to configure your Gemini API Key in Settings to use reasoning features.",
                "code": "API_KEY_MISSING"
            }

        # 4. Call RAG Service
        from services.rag_service import get_rag_service
        rag_service = get_rag_service()
        
        answer = await rag_service.answer_question_with_images(
            query=query,
            image_urls=image_urls,
            api_key=api_key
        )

        return {
            "answer": answer,
            "cited_photos": [p["id"] for p in valid_photos],
            "analyzed_count": len(valid_photos)
        }

    except Exception as e:
        logger.error(f"Ask Gallery failed: {e}")
        return {"error": str(e)}
