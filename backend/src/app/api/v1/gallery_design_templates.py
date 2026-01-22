"""Gallery Design Template API Endpoints.

Provides REST API for managing custom and system Gallery Design Studio templates.

Features:
- CRUD operations (Create, Read, Update, Delete)
- Template listing with filtering (category, tags, search)
- Template application (merge with current design config)
- System and workspace-specific templates
- Soft-delete with is_active flag

Feature: Enhancement 3 - Custom Templates
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Any, Optional
from uuid import UUID

from src.middleware.auth import get_workspace_id, get_current_user
from src.log_config import get_logger
from src.observability.metrics import get_metrics
from src.services.gallery_design_template_service import (
    GalleryDesignTemplateService,
    TemplateError,
    TemplateNotFoundError,
    TemplateAlreadyExistsError,
    InvalidDesignConfigError,
)
from src.repositories.gallery_design_template_repository import (
    get_gallery_design_template_repository,
)

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


def get_template_service() -> GalleryDesignTemplateService:
    """Get or create Gallery Design Template Service instance."""
    repository = get_gallery_design_template_repository()
    return GalleryDesignTemplateService(repository=repository)


# =============================================================================
# Template CRUD Endpoints
# =============================================================================


@router.post("/gallery-design-templates")
async def create_template(
    payload: dict[str, Any],
    workspace_id: str = Depends(get_workspace_id),
    current_user: dict = Depends(get_current_user),
    service: GalleryDesignTemplateService = Depends(get_template_service),
) -> dict[str, Any]:
    """Create a new custom template.

    Args:
        payload: Template creation request with:
            - name: str (required, unique per workspace)
            - design_config: dict (required, complete GalleryDesignConfig)
            - category: str (optional, default="other")
            - description: str (optional)
            - tags: list[str] (optional)
            - generate_thumbnail: bool (optional, default=True)

    Returns:
        Created template with all metadata:
        {
            "template_id": str,
            "workspace_id": str,
            "name": str,
            "description": str | null,
            "category": str,
            "tags": list[str],
            "design_config": dict,
            "thumbnail_url": str | null,
            "is_system": bool,
            "is_active": bool,
            "created_at": ISO8601,
            "updated_at": ISO8601,
            "created_by_user_id": str | null
        }

    Raises:
        HTTPException:
            400: Invalid design config or template name already exists
            409: Template with this name already exists in workspace
    """
    try:
        # Extract fields from payload
        name = payload.get("name", "").strip()
        design_config = payload.get("design_config", {})
        category = payload.get("category", "other")
        description = payload.get("description", "").strip() if payload.get("description") else None
        tags = payload.get("tags", [])
        generate_thumbnail = payload.get("generate_thumbnail", True)

        # Validate required fields
        if not name:
            raise HTTPException(
                status_code=400,
                detail={"error": "INVALID_REQUEST", "message": "Template name is required"},
            )

        if not design_config:
            raise HTTPException(
                status_code=400,
                detail={"error": "INVALID_REQUEST", "message": "design_config is required"},
            )

        # Create template via service
        template = await service.create_template(
            workspace_id=UUID(workspace_id),
            name=name,
            design_config=design_config,
            category=category,
            description=description,
            tags=tags,
            generate_thumbnail=generate_thumbnail,
        )

        # Log creation
        logger.info(
            "Template created",
            extra={
                "template_id": template.get("template_id"),
                "workspace_id": workspace_id,
                "user_id": current_user.get("user_id"),
                "name": name,
                "category": category,
            },
        )

        # Track metrics
        metrics.counter("gallery.templates.created", 1, {
            "workspace_id": workspace_id,
            "category": category,
        })

        return template

    except TemplateAlreadyExistsError as e:
        logger.warning(
            "Template creation failed - name already exists",
            extra={
                "workspace_id": workspace_id,
                "name": name,
                "error": e.message,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except InvalidDesignConfigError as e:
        logger.warning(
            "Template creation failed - invalid design config",
            extra={
                "workspace_id": workspace_id,
                "error": e.message,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except TemplateError as e:
        logger.error(
            "Template creation failed",
            extra={
                "workspace_id": workspace_id,
                "error": e.message,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except Exception as e:
        logger.error(
            "Unexpected error creating template",
            extra={
                "workspace_id": workspace_id,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to create template"},
        )


@router.get("/gallery-design-templates/{template_id}")
async def get_template(
    template_id: UUID,
    workspace_id: str = Depends(get_workspace_id),
    service: GalleryDesignTemplateService = Depends(get_template_service),
) -> dict[str, Any]:
    """Get a specific template by ID.

    Args:
        template_id: Template ID
        workspace_id: Workspace ID (from auth)

    Returns:
        Template record with all metadata

    Raises:
        HTTPException:
            404: Template not found or not accessible
    """
    try:
        template = await service.get_template(
            template_id=template_id,
            workspace_id=UUID(workspace_id),
        )

        logger.debug(
            "Template retrieved",
            extra={
                "template_id": str(template_id),
                "workspace_id": workspace_id,
            },
        )

        return template

    except TemplateNotFoundError as e:
        logger.warning(
            "Template not found",
            extra={
                "template_id": str(template_id),
                "workspace_id": workspace_id,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except Exception as e:
        logger.error(
            "Error retrieving template",
            extra={
                "template_id": str(template_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to retrieve template"},
        )


@router.patch("/gallery-design-templates/{template_id}")
async def update_template(
    template_id: UUID,
    payload: dict[str, Any],
    workspace_id: str = Depends(get_workspace_id),
    current_user: dict = Depends(get_current_user),
    service: GalleryDesignTemplateService = Depends(get_template_service),
) -> dict[str, Any]:
    """Update an existing template.

    Args:
        template_id: Template ID to update
        payload: Update request with optional fields:
            - name: str
            - description: str
            - category: str
            - tags: list[str]
            - design_config: dict
            - is_active: bool

    Returns:
        Updated template record

    Raises:
        HTTPException:
            400: Invalid design config or duplicate name
            404: Template not found
    """
    try:
        # Extract update fields (only include provided fields)
        updates = {}

        if "name" in payload:
            updates["name"] = payload["name"].strip()

        if "description" in payload:
            description = payload["description"]
            updates["description"] = description.strip() if description else None

        if "category" in payload:
            updates["category"] = payload["category"]

        if "tags" in payload:
            updates["tags"] = payload["tags"]

        if "design_config" in payload:
            updates["design_config"] = payload["design_config"]

        if "is_active" in payload:
            updates["is_active"] = payload["is_active"]

        if not updates:
            # No updates provided, return existing template
            template = await service.get_template(
                template_id=template_id,
                workspace_id=UUID(workspace_id),
            )
            return template

        # Update via service
        updated_template = await service.update_template(
            template_id=template_id,
            workspace_id=UUID(workspace_id),
            **updates,
        )

        # Log update
        logger.info(
            "Template updated",
            extra={
                "template_id": str(template_id),
                "workspace_id": workspace_id,
                "user_id": current_user.get("user_id"),
                "updated_fields": list(updates.keys()),
            },
        )

        # Track metrics
        metrics.counter("gallery.templates.updated", 1, {
            "workspace_id": workspace_id,
        })

        return updated_template

    except TemplateAlreadyExistsError as e:
        logger.warning(
            "Template update failed - name already exists",
            extra={
                "template_id": str(template_id),
                "error": e.message,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except InvalidDesignConfigError as e:
        logger.warning(
            "Template update failed - invalid design config",
            extra={
                "template_id": str(template_id),
                "error": e.message,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except TemplateNotFoundError as e:
        logger.warning(
            "Template not found",
            extra={
                "template_id": str(template_id),
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except TemplateError as e:
        logger.error(
            "Template update failed",
            extra={
                "template_id": str(template_id),
                "error": e.message,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except Exception as e:
        logger.error(
            "Unexpected error updating template",
            extra={
                "template_id": str(template_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to update template"},
        )


@router.delete("/gallery-design-templates/{template_id}")
async def delete_template(
    template_id: UUID,
    workspace_id: str = Depends(get_workspace_id),
    current_user: dict = Depends(get_current_user),
    service: GalleryDesignTemplateService = Depends(get_template_service),
) -> dict[str, str]:
    """Delete a template (soft-delete by default).

    Args:
        template_id: Template ID to delete
        workspace_id: Workspace ID (from auth)

    Returns:
        Success message

    Raises:
        HTTPException:
            404: Template not found
    """
    try:
        # Soft-delete template
        await service.delete_template(
            template_id=template_id,
            workspace_id=UUID(workspace_id),
            hard_delete=False,  # Default to soft-delete
        )

        logger.info(
            "Template deleted",
            extra={
                "template_id": str(template_id),
                "workspace_id": workspace_id,
                "user_id": current_user.get("user_id"),
            },
        )

        # Track metrics
        metrics.counter("gallery.templates.deleted", 1, {
            "workspace_id": workspace_id,
        })

        return {
            "message": "Template deleted successfully",
            "template_id": str(template_id),
        }

    except TemplateNotFoundError as e:
        logger.warning(
            "Template not found",
            extra={
                "template_id": str(template_id),
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except Exception as e:
        logger.error(
            "Error deleting template",
            extra={
                "template_id": str(template_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to delete template"},
        )


# =============================================================================
# Template Listing & Filtering
# =============================================================================


@router.get("/gallery-design-templates")
async def list_templates(
    workspace_id: str = Depends(get_workspace_id),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    tags: Optional[list[str]] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    include_system: bool = Query(True),
    service: GalleryDesignTemplateService = Depends(get_template_service),
) -> dict[str, Any]:
    """List templates with optional filtering.

    Args:
        workspace_id: Workspace ID (from auth)
        category: Filter by category (wedding, portrait, event, product, landscape, other)
        search: Search by name or description (case-insensitive)
        tags: Filter by tags (comma-separated, AND logic - must have all)
        page: Page number (1-indexed)
        limit: Results per page (max 100)
        include_system: Include system templates in results

    Returns:
        Paginated template list:
        {
            "data": [template1, template2, ...],
            "meta": {
                "page": int,
                "limit": int,
                "total": int,
                "pages": int,
                "has_next": bool
            }
        }

    Raises:
        HTTPException:
            400: Invalid category
    """
    try:
        # List templates with filters
        result = await service.list_templates(
            workspace_id=UUID(workspace_id),
            category=category,
            search=search,
            tags=tags,
            page=page,
            limit=limit,
            include_system=include_system,
        )

        logger.debug(
            "Templates listed",
            extra={
                "workspace_id": workspace_id,
                "category": category,
                "total": result["meta"]["total"],
                "page": page,
            },
        )

        # Track metrics
        metrics.counter("gallery.templates.listed", 1, {
            "workspace_id": workspace_id,
            "category": category or "all",
        })

        return result

    except InvalidDesignConfigError as e:
        logger.warning(
            "Template listing failed - invalid category",
            extra={
                "category": category,
                "error": e.message,
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except Exception as e:
        logger.error(
            "Error listing templates",
            extra={
                "workspace_id": workspace_id,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to list templates"},
        )


@router.get("/gallery-design-templates/search/quick")
async def search_templates(
    workspace_id: str = Depends(get_workspace_id),
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(10, ge=1, le=50),
    service: GalleryDesignTemplateService = Depends(get_template_service),
) -> dict[str, Any]:
    """Quick search templates by name or tags.

    Args:
        workspace_id: Workspace ID (from auth)
        q: Search query (name or tag)
        limit: Max results

    Returns:
        List of matching templates:
        {
            "data": [template1, template2, ...],
            "query": str,
            "count": int
        }
    """
    try:
        results = await service.search_templates(
            workspace_id=UUID(workspace_id),
            query=q,
            limit=limit,
        )

        logger.debug(
            "Templates searched",
            extra={
                "workspace_id": workspace_id,
                "query": q,
                "results_count": len(results),
            },
        )

        return {
            "data": results,
            "query": q,
            "count": len(results),
        }

    except Exception as e:
        logger.error(
            "Error searching templates",
            extra={
                "workspace_id": workspace_id,
                "query": q,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to search templates"},
        )


# =============================================================================
# Template Application
# =============================================================================


@router.post("/gallery-design-templates/{template_id}/apply")
async def apply_template(
    template_id: UUID,
    payload: dict[str, Any],
    workspace_id: str = Depends(get_workspace_id),
    service: GalleryDesignTemplateService = Depends(get_template_service),
) -> dict[str, Any]:
    """Apply a template to a gallery design.

    Merges template design config with current gallery config.
    Optionally preserves current cover asset.

    Args:
        template_id: Template to apply
        payload: Application request with:
            - current_config: dict (required, current GalleryDesignConfig)
            - preserve_cover_asset: bool (optional, default=True)

    Returns:
        Merged design configuration ready to apply

    Raises:
        HTTPException:
            400: Invalid current_config
            404: Template not found
    """
    try:
        current_config = payload.get("current_config", {})
        preserve_cover_asset = payload.get("preserve_cover_asset", True)

        if not current_config:
            raise HTTPException(
                status_code=400,
                detail={"error": "INVALID_REQUEST", "message": "current_config is required"},
            )

        # Apply template
        merged_config = await service.apply_template(
            template_id=template_id,
            current_config=current_config,
            workspace_id=UUID(workspace_id),
            preserve_cover_asset=preserve_cover_asset,
        )

        logger.info(
            "Template applied",
            extra={
                "template_id": str(template_id),
                "workspace_id": workspace_id,
                "preserve_cover_asset": preserve_cover_asset,
            },
        )

        # Track metrics
        metrics.counter("gallery.templates.applied", 1, {
            "workspace_id": workspace_id,
        })

        return {
            "merged_config": merged_config,
            "template_id": str(template_id),
        }

    except TemplateNotFoundError as e:
        logger.warning(
            "Template not found",
            extra={
                "template_id": str(template_id),
            },
        )
        raise HTTPException(
            status_code=e.status_code,
            detail={"error": e.code, "message": e.message},
        )
    except Exception as e:
        logger.error(
            "Error applying template",
            extra={
                "template_id": str(template_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": "Failed to apply template"},
        )


# =============================================================================
# Health Check
# =============================================================================


@router.get("/_health")
async def health_check() -> dict[str, str]:
    """Health check endpoint for templates service.

    Returns:
        Service status
    """
    return {"status": "ok", "service": "gallery-design-templates"}
