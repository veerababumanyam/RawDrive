"""MCP (Model Context Protocol) server for gallery service.

This module provides 12 MCP tools that allow AI agents to interact with
gallery operations through a standardized protocol:

Gallery CRUD:
- get_gallery: Get gallery details with assets
- list_galleries: List galleries with filtering
- create_gallery: Create new gallery
- update_gallery: Update gallery metadata
- delete_gallery: Soft delete gallery

Asset Operations:
- list_gallery_assets: List assets in gallery
- add_assets_to_gallery: Add assets to gallery
- remove_assets_from_gallery: Remove assets from gallery

Magic Link Operations:
- create_magic_link: Create shareable Magic Link
- validate_magic_link: Validate Magic Link token

Proofing:
- get_proofing_selections: Get client selections/favorites

Batch:
- batch_gallery_operations: Execute multiple operations

AI Integration:
- get_gallery_ai_insights: Get AI insights from ai-service
"""

import asyncio
from typing import Any
from uuid import UUID

from fastapi import FastAPI
from fastmcp import FastMCP

from src.services.gallery_service import GalleryService
from src.services.magic_link_service import MagicLinkService
from src.services.proofing_service import ProofingService
from .auth import (
    extract_auth_context,
    check_permission,
    check_workspace_access,
    MCPAuthError,
    MCPPermissionError,
)

# Initialize FastMCP server
mcp = FastMCP(
    name="gallery-mcp",
    description="Gallery service MCP server for AI agent operations",
    version="1.0.0",
)

# FastAPI app for health checks and metrics
app = FastAPI(title="Gallery MCP Server")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "gallery-mcp"}


@app.get("/health/ready")
async def readiness():
    """Readiness check endpoint."""
    # TODO: Check database connectivity
    return {"status": "ready", "service": "gallery-mcp"}


# ============================================================================
# Gallery CRUD Tools
# ============================================================================


@mcp.tool()
async def get_gallery(
    workspace_id: str, gallery_id: str, context: dict[str, Any]
) -> dict:
    """Get gallery details with assets and metadata.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        context: MCP call context with authentication

    Returns:
        Gallery details including assets, metadata, and signed URLs

    Raises:
        MCPAuthError: If authentication is invalid
        MCPPermissionError: If permission check fails
    """
    # Extract and validate authentication
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:read")

    # Validate workspace match
    check_workspace_access(auth, workspace_id)

    # Get gallery from service (service returns dict directly)
    service = GalleryService()
    gallery = await service.get_gallery(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        use_cache=False  # MCP tools don't use cache
    )

    if not gallery:
        return {"error": "Gallery not found", "gallery_id": gallery_id}

    # Gallery service returns a complete dict with all data
    return gallery


@mcp.tool()
async def list_galleries(
    workspace_id: str,
    filters: dict[str, Any] | None = None,
    limit: int = 50,
    offset: int = 0,
    context: dict[str, Any] = {},
) -> dict:
    """List galleries with pagination and filtering.

    Args:
        workspace_id: Workspace UUID
        filters: Optional filters (status, client_name, etc.)
        limit: Maximum galleries to return (default: 50)
        offset: Pagination offset (default: 0)
        context: MCP call context with authentication

    Returns:
        List of galleries with pagination metadata
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:read")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    async with get_async_session() as session:
        service = GalleryService(session)

        # Apply filters
        status_filter = filters.get("status") if filters else None
        client_filter = filters.get("client_name") if filters else None

        galleries = await service.list_galleries(
            workspace_id=workspace_uuid,
            status=status_filter,
            client_name=client_filter,
            limit=limit,
            offset=offset,
        )

        total_count = await service.count_galleries(
            workspace_id=workspace_uuid,
            status=status_filter,
            client_name=client_filter,
        )

        return {
            "galleries": [
                {
                    "gallery_id": str(g.gallery_id),
                    "title": g.title,
                    "client_name": g.client_name,
                    "status": g.status,
                    "published_at": g.published_at.isoformat()
                    if g.published_at
                    else None,
                    "created_at": g.created_at.isoformat(),
                }
                for g in galleries
            ],
            "total": total_count,
            "limit": limit,
            "offset": offset,
        }


@mcp.tool()
async def create_gallery(
    workspace_id: str, gallery_data: dict[str, Any], context: dict[str, Any]
) -> dict:
    """Create a new gallery.

    Args:
        workspace_id: Workspace UUID
        gallery_data: Gallery creation data (title, description, client_name, etc.)
        context: MCP call context with authentication

    Returns:
        Created gallery details
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    async with get_async_session() as session:
        service = GalleryService(session)

        gallery = await service.create_gallery(
            workspace_id=workspace_uuid,
            title=gallery_data.get("title"),
            description=gallery_data.get("description"),
            client_id=UUID(gallery_data["client_id"])
            if gallery_data.get("client_id")
            else None,
            client_name=gallery_data.get("client_name"),
            created_by_user_id=auth.user_id,
        )

        await session.commit()

        return {
            "gallery_id": str(gallery.gallery_id),
            "title": gallery.title,
            "description": gallery.description,
            "client_name": gallery.client_name,
            "status": gallery.status,
            "created_at": gallery.created_at.isoformat(),
        }


@mcp.tool()
async def update_gallery(
    workspace_id: str,
    gallery_id: str,
    updates: dict[str, Any],
    context: dict[str, Any],
) -> dict:
    """Update gallery metadata.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        updates: Fields to update (title, description, status, etc.)
        context: MCP call context with authentication

    Returns:
        Updated gallery details
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    async with get_async_session() as session:
        service = GalleryService(session)

        gallery = await service.update_gallery(
            workspace_id=workspace_uuid, gallery_id=UUID(gallery_id), updates=updates
        )

        await session.commit()

        return {
            "gallery_id": str(gallery.gallery_id),
            "title": gallery.title,
            "description": gallery.description,
            "status": gallery.status,
            "updated_at": gallery.updated_at.isoformat(),
        }


@mcp.tool()
async def delete_gallery(
    workspace_id: str, gallery_id: str, context: dict[str, Any]
) -> dict:
    """Soft delete a gallery.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        context: MCP call context with authentication

    Returns:
        Deletion confirmation
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:delete")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    async with get_async_session() as session:
        service = GalleryService(session)

        await service.delete_gallery(
            workspace_id=workspace_uuid, gallery_id=UUID(gallery_id)
        )

        await session.commit()

        return {
            "gallery_id": gallery_id,
            "deleted": True,
            "message": "Gallery soft deleted successfully",
        }


# ============================================================================
# Asset Operations Tools
# ============================================================================


@mcp.tool()
async def list_gallery_assets(
    workspace_id: str, gallery_id: str, context: dict[str, Any]
) -> dict:
    """List all assets in a gallery with signed URLs.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        context: MCP call context with authentication

    Returns:
        List of assets with signed URLs and metadata
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:read")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    async with get_async_session() as session:
        service = GalleryService(session)

        assets = await service.get_gallery_assets(
            workspace_id=workspace_uuid, gallery_id=UUID(gallery_id)
        )

        return {
            "gallery_id": gallery_id,
            "asset_count": len(assets),
            "assets": [
                {
                    "asset_id": str(asset["asset_id"]),
                    "filename": asset["filename"],
                    "file_size": asset.get("file_size"),
                    "content_type": asset.get("content_type"),
                    "sort_order": asset["sort_order"],
                    "is_favorited": asset.get("is_favorited", False),
                    "is_selected": asset.get("is_selected", False),
                    "signed_url": asset.get("signed_url"),
                    "thumbnail_url": asset.get("thumbnail_url"),
                }
                for asset in assets
            ],
        }


@mcp.tool()
async def add_assets_to_gallery(
    workspace_id: str,
    gallery_id: str,
    asset_ids: list[str],
    context: dict[str, Any],
) -> dict:
    """Add assets to a gallery.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        asset_ids: List of asset UUIDs to add
        context: MCP call context with authentication

    Returns:
        Confirmation with added asset count
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    async with get_async_session() as session:
        service = GalleryService(session)

        # Convert asset IDs to UUIDs
        asset_uuids = [UUID(aid) for aid in asset_ids]

        added_count = await service.add_assets_to_gallery(
            workspace_id=workspace_uuid,
            gallery_id=UUID(gallery_id),
            asset_ids=asset_uuids,
        )

        await session.commit()

        return {
            "gallery_id": gallery_id,
            "assets_added": added_count,
            "total_asset_ids": len(asset_ids),
        }


@mcp.tool()
async def remove_assets_from_gallery(
    workspace_id: str,
    gallery_id: str,
    asset_ids: list[str],
    context: dict[str, Any],
) -> dict:
    """Remove assets from a gallery.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        asset_ids: List of asset UUIDs to remove
        context: MCP call context with authentication

    Returns:
        Confirmation with removed asset count
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    async with get_async_session() as session:
        service = GalleryService(session)

        # Convert asset IDs to UUIDs
        asset_uuids = [UUID(aid) for aid in asset_ids]

        removed_count = await service.remove_assets_from_gallery(
            workspace_id=workspace_uuid,
            gallery_id=UUID(gallery_id),
            asset_ids=asset_uuids,
        )

        await session.commit()

        return {
            "gallery_id": gallery_id,
            "assets_removed": removed_count,
            "total_asset_ids": len(asset_ids),
        }


# ============================================================================
# Magic Link Tools
# ============================================================================


@mcp.tool()
async def create_magic_link(
    workspace_id: str,
    gallery_id: str,
    settings: dict[str, Any] | None = None,
    context: dict[str, Any] = {},
) -> dict:
    """Create a Magic Link for gallery sharing.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        settings: Optional settings (expiration, view limit, password, etc.)
        context: MCP call context with authentication

    Returns:
        Magic Link details including token and URL
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:share")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    settings = settings or {}

    async with get_async_session() as session:
        service = MagicLinkService(session)

        magic_link = await service.create_magic_link(
            workspace_id=workspace_uuid,
            gallery_id=UUID(gallery_id),
            expires_at=settings.get("expires_at"),
            view_limit=settings.get("view_limit"),
            password=settings.get("password"),
            require_email=settings.get("require_email", False),
        )

        await session.commit()

        return {
            "magic_link_id": str(magic_link.magic_link_id),
            "gallery_id": gallery_id,
            "token": magic_link.token,
            "url": f"/galleries/public/{magic_link.token}",
            "expires_at": magic_link.expires_at.isoformat()
            if magic_link.expires_at
            else None,
            "view_limit": magic_link.view_limit,
            "created_at": magic_link.created_at.isoformat(),
        }


@mcp.tool()
async def validate_magic_link(token: str, context: dict[str, Any]) -> dict:
    """Validate a Magic Link token.

    Args:
        token: Magic Link token
        context: MCP call context

    Returns:
        Validation result with gallery access info
    """
    async with get_async_session() as session:
        service = MagicLinkService(session)

        magic_link = await service.validate_magic_link(token)

        if not magic_link:
            return {"valid": False, "error": "Invalid or expired Magic Link"}

        return {
            "valid": True,
            "gallery_id": str(magic_link.gallery_id),
            "workspace_id": str(magic_link.workspace_id),
            "requires_password": bool(magic_link.password_hash),
            "requires_email": magic_link.require_email,
            "view_count": magic_link.view_count,
            "view_limit": magic_link.view_limit,
        }


# ============================================================================
# Proofing Tools
# ============================================================================


@mcp.tool()
async def get_proofing_selections(
    workspace_id: str, gallery_id: str, context: dict[str, Any]
) -> dict:
    """Get client selections and favorites from proofing.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        context: MCP call context with authentication

    Returns:
        Proofing selections and statistics
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:read")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    async with get_async_session() as session:
        service = ProofingService(session)

        selections = await service.get_gallery_selections(
            workspace_id=workspace_uuid, gallery_id=UUID(gallery_id)
        )

        favorites = await service.get_gallery_favorites(
            workspace_id=workspace_uuid, gallery_id=UUID(gallery_id)
        )

        return {
            "gallery_id": gallery_id,
            "selections": {
                "count": len(selections),
                "asset_ids": [str(s["asset_id"]) for s in selections],
            },
            "favorites": {
                "count": len(favorites),
                "asset_ids": [str(f["asset_id"]) for f in favorites],
            },
            "total_proofing_actions": len(selections) + len(favorites),
        }


# ============================================================================
# Batch Operations Tool
# ============================================================================


@mcp.tool()
async def batch_gallery_operations(
    workspace_id: str, operations: list[dict[str, Any]], context: dict[str, Any]
) -> dict:
    """Execute multiple gallery operations in a batch.

    Args:
        workspace_id: Workspace UUID
        operations: List of operations to execute
                   Each operation: {"type": "create|update|delete", "params": {...}}
        context: MCP call context with authentication

    Returns:
        Batch execution results
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    results = []
    errors = []

    async with get_async_session() as session:
        service = GalleryService(session)

        for i, operation in enumerate(operations):
            op_type = operation.get("type")
            params = operation.get("params", {})

            try:
                if op_type == "create":
                    gallery = await service.create_gallery(
                        workspace_id=workspace_uuid,
                        title=params.get("title"),
                        description=params.get("description"),
                        client_id=UUID(params["client_id"])
                        if params.get("client_id")
                        else None,
                        client_name=params.get("client_name"),
                        created_by_user_id=auth.user_id,
                    )
                    results.append(
                        {
                            "index": i,
                            "type": "create",
                            "success": True,
                            "gallery_id": str(gallery.gallery_id),
                        }
                    )

                elif op_type == "update":
                    gallery = await service.update_gallery(
                        workspace_id=workspace_uuid,
                        gallery_id=UUID(params["gallery_id"]),
                        updates=params.get("updates", {}),
                    )
                    results.append(
                        {
                            "index": i,
                            "type": "update",
                            "success": True,
                            "gallery_id": str(gallery.gallery_id),
                        }
                    )

                elif op_type == "delete":
                    await service.delete_gallery(
                        workspace_id=workspace_uuid, gallery_id=UUID(params["gallery_id"])
                    )
                    results.append(
                        {
                            "index": i,
                            "type": "delete",
                            "success": True,
                            "gallery_id": params["gallery_id"],
                        }
                    )

                else:
                    errors.append(
                        {"index": i, "error": f"Unknown operation type: {op_type}"}
                    )

            except Exception as e:
                errors.append({"index": i, "error": str(e), "type": op_type})

        # Commit all operations
        await session.commit()

    return {
        "total_operations": len(operations),
        "successful": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors,
    }


# ============================================================================
# AI Integration Tool
# ============================================================================


@mcp.tool()
async def get_gallery_ai_insights(
    workspace_id: str, gallery_id: str, context: dict[str, Any]
) -> dict:
    """Get AI insights for a gallery by calling ai-service.

    This tool delegates to the existing ai-service for AI operations like:
    - Smart recommendations
    - Semantic search
    - Quality analysis
    - Caption generation

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        context: MCP call context with authentication

    Returns:
        AI insights from ai-service
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:ai:read")

    workspace_uuid = UUID(workspace_id)
    if auth.workspace_id != workspace_uuid:
        raise MCPPermissionError("Workspace ID mismatch")

    # TODO: Implement AI service client integration
    # This will be implemented in Phase 4

    return {
        "gallery_id": gallery_id,
        "ai_insights": {
            "status": "not_implemented",
            "message": "AI service integration coming in Phase 4",
            "available_features": [
                "smart_recommendations",
                "semantic_search",
                "quality_analysis",
                "caption_generation",
            ],
        },
    }
