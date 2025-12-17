"""FastMCP Server for RawDrive workspace operations.

Provides MCP tools for AI agents to interact with workspace data.
Requirement 18.1, 18.4, 18.5
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastmcp import FastMCP
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MCP_PORT = int(os.getenv("MCP_PORT", "8001"))
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")


# ---------------------------------------------------------------------------
# MCP Server Instance
# ---------------------------------------------------------------------------

mcp = FastMCP(
    name="rawdrive-mcp",
    description="RawDrive MCP server for workspace operations",
)


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

    # TODO: Replace with actual database query
    # This is a stub implementation
    galleries = [
        GalleryItem(
            gallery_id="gal_001",
            name="Wedding Photos",
            description="Smith-Jones Wedding 2024",
            photo_count=250,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
        GalleryItem(
            gallery_id="gal_002",
            name="Corporate Event",
            description="Annual Company Retreat",
            photo_count=180,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
    ]

    return {
        "galleries": [g.model_dump() for g in galleries],
        "total": len(galleries),
        "limit": limit,
        "offset": offset,
    }


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

    # TODO: Replace with actual database query
    gallery = GalleryDetail(
        gallery_id=gallery_id,
        name="Wedding Photos",
        description="Smith-Jones Wedding 2024",
        cover_photo_url="https://cdn.rawdrive.in/thumb/cover_001.jpg",
        photo_count=250,
        is_published=True,
        share_link="https://gallery.rawdrive.in/s/abc123",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        settings={
            "download_policy": "watermarked_only",
            "watermark_enabled": True,
            "expiry_days": 30,
        },
    )

    return gallery.model_dump()


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

    # TODO: Replace with actual database query
    photos = [
        PhotoItem(
            photo_id="photo_001",
            filename="IMG_0001.jpg",
            thumbnail_url="https://cdn.rawdrive.in/thumb/photo_001.jpg",
            width=4000,
            height=3000,
            file_size=8500000,
            uploaded_at=datetime.now(timezone.utc),
        ),
        PhotoItem(
            photo_id="photo_002",
            filename="IMG_0002.jpg",
            thumbnail_url="https://cdn.rawdrive.in/thumb/photo_002.jpg",
            width=4000,
            height=3000,
            file_size=7200000,
            uploaded_at=datetime.now(timezone.utc),
        ),
    ]

    return {
        "photos": [p.model_dump() for p in photos],
        "total": len(photos),
        "gallery_id": gallery_id,
        "limit": limit,
        "offset": offset,
    }


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

    # TODO: Replace with actual search implementation using pgvector
    results = [
        PhotoSearchResult(
            photo=PhotoItem(
                photo_id="photo_001",
                filename="IMG_0001.jpg",
                thumbnail_url="https://cdn.rawdrive.in/thumb/photo_001.jpg",
                width=4000,
                height=3000,
                file_size=8500000,
                uploaded_at=datetime.now(timezone.utc),
            ),
            relevance_score=0.95,
            matched_tags=["wedding", "ceremony"],
        ),
    ]

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

    # TODO: Replace with actual stats from database
    return {
        "workspace_id": workspace_id,
        "galleries": {
            "total": 15,
            "published": 10,
        },
        "photos": {
            "total": 5420,
            "storage_bytes": 45_000_000_000,  # 45GB
        },
        "subscription": {
            "plan": "professional",
            "storage_limit_bytes": 100_000_000_000,  # 100GB
            "storage_used_percent": 45,
        },
        "activity": {
            "last_upload": datetime.now(timezone.utc).isoformat(),
            "gallery_views_30d": 1250,
            "downloads_30d": 340,
        },
    }


# ---------------------------------------------------------------------------
# Resources (Read-only data)
# ---------------------------------------------------------------------------


@mcp.resource("workspace://{workspace_id}/info")
async def workspace_info_resource(workspace_id: str) -> str:
    """Get basic workspace information as a resource."""
    # TODO: Fetch from database
    return f"""
    Workspace: {workspace_id}
    Name: My Photography Studio
    Plan: Professional
    Status: Active
    """


@mcp.resource("workspace://{workspace_id}/galleries")
async def galleries_resource(workspace_id: str) -> str:
    """Get list of galleries as a resource."""
    # TODO: Fetch from database
    return """
    Galleries:
    1. Wedding Photos (250 photos, published)
    2. Corporate Event (180 photos, draft)
    3. Family Portrait (45 photos, published)
    """


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
