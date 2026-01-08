"""MCP (Model Context Protocol) server for gallery service.

This module provides 12 MCP tools that allow AI agents to interact with
gallery operations through a standardized protocol.

IMPORTANT: This implementation uses the existing GalleryService, MagicLinkService,
and ProofingService which use asyncpg directly (not SQLAlchemy).
"""

from typing import Any
from uuid import UUID

from fastapi import FastAPI
from fastmcp import FastMCP

from src.services.gallery_service import GalleryService, GalleryNotFoundError
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
mcp = FastMCP("gallery-mcp")

# FastAPI app for health checks and metrics
app = FastAPI(title="Gallery MCP Server")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "gallery-mcp"}


@app.get("/health/ready")
async def readiness():
    """Readiness check endpoint."""
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
        workspace_id: Workspace UUID (string)
        gallery_id: Gallery UUID (string)
        context: MCP call context with authentication

    Returns:
        Gallery details dictionary from GalleryService.get_gallery()
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:read")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = GalleryService()
    gallery = await service.get_gallery(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        use_cache=False,  # MCP tools don't use cache
    )

    if not gallery:
        return {"error": "Gallery not found", "gallery_id": gallery_id}

    return gallery


@mcp.tool()
async def list_galleries(
    workspace_id: str,
    filters: dict[str, Any] | None = None,
    limit: int = 20,
    page: int = 1,
    context: dict[str, Any] = {},
) -> dict:
    """List galleries with pagination and filtering.

    Args:
        workspace_id: Workspace UUID (string)
        filters: Optional filters (status, search)
        limit: Page size (default: 20)
        page: Page number (default: 1)
        context: MCP call context with authentication

    Returns:
        Dict with 'galleries' list and pagination metadata
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:read")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = GalleryService()
    result = await service.list_galleries(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        sort="created_at",
        status=filters.get("status") if filters else None,
        search=filters.get("search") if filters else None,
    )

    return result


@mcp.tool()
async def create_gallery(
    workspace_id: str, gallery_data: dict[str, Any], context: dict[str, Any]
) -> dict:
    """Create a new gallery.

    Args:
        workspace_id: Workspace UUID (string)
        gallery_data: Gallery data (title, description, client_name, client_id, shoot_date)
        context: MCP call context with authentication

    Returns:
        Created gallery details dictionary
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = GalleryService()
    gallery = await service.create_gallery(
        workspace_id=UUID(workspace_id),
        user_id=auth.user_id,
        title=gallery_data.get("title", "Untitled Gallery"),
        description=gallery_data.get("description"),
        client_name=gallery_data.get("client_name"),
        client_id=UUID(gallery_data["client_id"]) if gallery_data.get("client_id") else None,
        shoot_date=None,  # TODO: Parse from gallery_data if provided
    )

    return gallery


@mcp.tool()
async def update_gallery(
    workspace_id: str,
    gallery_id: str,
    updates: dict[str, Any],
    context: dict[str, Any],
) -> dict:
    """Update gallery metadata.

    Args:
        workspace_id: Workspace UUID (string)
        gallery_id: Gallery UUID (string)
        updates: Fields to update (title, description, status, etc.)
        context: MCP call context with authentication

    Returns:
        Updated gallery details dictionary
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = GalleryService()
    gallery = await service.update_gallery(
        workspace_id=UUID(workspace_id),
        gallery_id=UUID(gallery_id),
        **updates,  # Pass all updates as kwargs
    )

    return gallery


@mcp.tool()
async def delete_gallery(
    workspace_id: str, gallery_id: str, context: dict[str, Any]
) -> dict:
    """Soft delete a gallery.

    Args:
        workspace_id: Workspace UUID (string)
        gallery_id: Gallery UUID (string)
        context: MCP call context with authentication

    Returns:
        Success message
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:delete")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = GalleryService()
    await service.delete_gallery(
        workspace_id=UUID(workspace_id),
        gallery_id=UUID(gallery_id),
    )

    return {
        "gallery_id": gallery_id,
        "deleted": True,
        "message": "Gallery soft deleted successfully",
    }


# ============================================================================
# Asset Operations
# ============================================================================


@mcp.tool()
async def list_gallery_assets(
    workspace_id: str,
    gallery_id: str,
    page: int = 1,
    limit: int = 50,
    context: dict[str, Any] = {},
) -> dict:
    """List all assets in a gallery with pagination.

    Args:
        workspace_id: Workspace UUID (string)
        gallery_id: Gallery UUID (string)
        page: Page number (default: 1)
        limit: Page size (default: 50)
        context: MCP call context with authentication

    Returns:
        Dict with 'assets' list and pagination metadata
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:read")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = GalleryService()
    result = await service.list_gallery_assets(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        page=page,
        limit=limit,
    )

    return result


@mcp.tool()
async def add_assets_to_gallery(
    workspace_id: str,
    gallery_id: str,
    asset_ids: list[str],
    context: dict[str, Any],
) -> dict:
    """Add assets to a gallery.

    Args:
        workspace_id: Workspace UUID (string)
        gallery_id: Gallery UUID (string)
        asset_ids: List of asset UUIDs (strings)
        context: MCP call context with authentication

    Returns:
        Updated gallery details with new asset count
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = GalleryService()
    gallery = await service.add_assets(
        workspace_id=UUID(workspace_id),
        gallery_id=UUID(gallery_id),
        asset_ids=[UUID(aid) for aid in asset_ids],
    )

    return {
        "gallery_id": gallery_id,
        "assets_added": len(asset_ids),
        "total_asset_ids": len(asset_ids),
        "gallery": gallery,
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
        workspace_id: Workspace UUID (string)
        gallery_id: Gallery UUID (string)
        asset_ids: List of asset UUIDs (strings)
        context: MCP call context with authentication

    Returns:
        Success message with count of removed assets
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = GalleryService()
    await service.remove_assets(
        workspace_id=UUID(workspace_id),
        gallery_id=UUID(gallery_id),
        asset_ids=[UUID(aid) for aid in asset_ids],
    )

    return {
        "gallery_id": gallery_id,
        "assets_removed": len(asset_ids),
        "total_asset_ids": len(asset_ids),
    }


# ============================================================================
# Magic Link Operations
# ============================================================================


@mcp.tool()
async def create_magic_link(
    workspace_id: str,
    gallery_id: str,
    settings: dict[str, Any] | None = None,
    context: dict[str, Any] = {},
) -> dict:
    """Create a shareable Magic Link for a gallery.

    Args:
        workspace_id: Workspace UUID (string)
        gallery_id: Gallery UUID (string)
        settings: Magic Link settings (expires_at, view_limit, password, require_email)
        context: MCP call context with authentication

    Returns:
        Magic Link details (token, URL, expiration, etc.)
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:share")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = MagicLinkService()

    # Create Magic Link with optional settings
    magic_link = await service.create_magic_link(
        workspace_id=UUID(workspace_id),
        gallery_id=UUID(gallery_id),
        created_by_user_id=auth.user_id,
        expires_at=settings.get("expires_at") if settings else None,
        view_limit=settings.get("view_limit") if settings else None,
        password=settings.get("password") if settings else None,
        require_email=settings.get("require_email", False) if settings else False,
    )

    return magic_link


@mcp.tool()
async def validate_magic_link(token: str, context: dict[str, Any] = {}) -> dict:
    """Validate a Magic Link token.

    Args:
        token: Magic Link token
        context: MCP call context (no auth required for validation)

    Returns:
        Validation result with gallery info if valid
    """
    # No permission check - public validation
    service = MagicLinkService()
    result = await service.validate_magic_link(token)

    return result


# ============================================================================
# Proofing
# ============================================================================


@mcp.tool()
async def get_proofing_selections(
    workspace_id: str, gallery_id: str, context: dict[str, Any]
) -> dict:
    """Get client selections and favorites from proofing.

    Args:
        workspace_id: Workspace UUID (string)
        gallery_id: Gallery UUID (string)
        context: MCP call context with authentication

    Returns:
        Dict with selections and favorites counts and asset IDs
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:read")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = ProofingService()
    result = await service.get_proofing_selections(
        workspace_id=UUID(workspace_id),
        gallery_id=UUID(gallery_id),
    )

    return result


# ============================================================================
# Batch Operations
# ============================================================================


@mcp.tool()
async def batch_gallery_operations(
    workspace_id: str, operations: list[dict[str, Any]], context: dict[str, Any]
) -> dict:
    """Execute multiple gallery operations in a batch.

    Args:
        workspace_id: Workspace UUID (string)
        operations: List of operations, each with 'type' and 'params'
                   Example: [{"type": "create", "params": {"title": "Gallery 1"}}]
        context: MCP call context with authentication

    Returns:
        Results for each operation with success/error status
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:write")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    service = GalleryService()
    results = []
    successful = 0
    failed = 0

    for idx, op in enumerate(operations):
        op_type = op.get("type")
        params = op.get("params", {})

        try:
            if op_type == "create":
                result = await service.create_gallery(
                    workspace_id=UUID(workspace_id),
                    user_id=auth.user_id,
                    title=params.get("title", "Untitled"),
                    description=params.get("description"),
                    client_name=params.get("client_name"),
                    client_id=UUID(params["client_id"]) if params.get("client_id") else None,
                )
                results.append({
                    "index": idx,
                    "type": op_type,
                    "success": True,
                    "gallery_id": result["gallery_id"],
                })
                successful += 1

            elif op_type == "update":
                gallery_id = params.pop("gallery_id")
                result = await service.update_gallery(
                    workspace_id=UUID(workspace_id),
                    gallery_id=UUID(gallery_id),
                    **params,
                )
                results.append({
                    "index": idx,
                    "type": op_type,
                    "success": True,
                    "gallery_id": result["gallery_id"],
                })
                successful += 1

            elif op_type == "delete":
                await service.delete_gallery(
                    workspace_id=UUID(workspace_id),
                    gallery_id=UUID(params["gallery_id"]),
                )
                results.append({
                    "index": idx,
                    "type": op_type,
                    "success": True,
                    "gallery_id": params["gallery_id"],
                })
                successful += 1

            else:
                results.append({
                    "index": idx,
                    "type": op_type,
                    "success": False,
                    "error": f"Unknown operation type: {op_type}",
                })
                failed += 1

        except Exception as e:
            results.append({
                "index": idx,
                "type": op_type,
                "success": False,
                "error": str(e),
            })
            failed += 1

    return {
        "total_operations": len(operations),
        "successful": successful,
        "failed": failed,
        "results": results,
    }


# ============================================================================
# AI Integration (Phase 4 - placeholder)
# ============================================================================


@mcp.tool()
async def get_gallery_ai_insights(
    workspace_id: str, gallery_id: str, context: dict[str, Any]
) -> dict:
    """Get AI insights from ai-service for a gallery.

    This tool delegates to the existing ai-service microservice.
    Implementation in Phase 4.

    Args:
        workspace_id: Workspace UUID (string)
        gallery_id: Gallery UUID (string)
        context: MCP call context with authentication

    Returns:
        AI insights from ai-service
    """
    auth = extract_auth_context(context)
    check_permission(auth, "galleries:ai:read")
    check_workspace_access(auth.workspace_id, UUID(workspace_id))

    # TODO: Implement in Phase 4 - call ai-service
    return {
        "gallery_id": gallery_id,
        "ai_insights": {
            "note": "AI insights integration coming in Phase 4",
            "recommendations": [],
            "quality_analysis": {},
            "semantic_tags": [],
        },
    }
