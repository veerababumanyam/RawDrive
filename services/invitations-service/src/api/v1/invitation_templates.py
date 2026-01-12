"""Invitation Templates API.

CRUD endpoints for managing invitation templates.

Feature: 016-save-the-date
"""

import json
import traceback
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from src.api.v1.dependencies import get_current_user, CurrentUser
from src.services.invitation_template_service import (
    InvitationTemplateService,
    TemplateError,
    TemplateNotFoundError,
)


router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class TemplateLayoutRequest(BaseModel):
    """Template layout configuration."""

    sections: list[str] = Field(default_factory=list)
    fonts: dict[str, str] = Field(default_factory=dict)
    colors: dict[str, str] = Field(default_factory=dict)
    positions: dict[str, dict[str, Any]] = Field(default_factory=dict)
    assets: dict[str, str] = Field(default_factory=dict)


class CreateTemplateRequest(BaseModel):
    """Request to create a new template."""

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    category: str = Field(..., min_length=1, max_length=50)
    subcategory: Optional[str] = Field(None, max_length=50)
    tags: list[str] = Field(default_factory=list)
    layout: Optional[TemplateLayoutRequest] = None
    content_i18n: dict[str, dict[str, str]] = Field(default_factory=dict)
    supported_languages: list[str] = Field(default=["en"])
    is_premium: bool = False


class UpdateTemplateRequest(BaseModel):
    """Request to update a template."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, min_length=1, max_length=50)
    subcategory: Optional[str] = Field(None, max_length=50)
    tags: Optional[list[str]] = None
    layout: Optional[TemplateLayoutRequest] = None
    content_i18n: Optional[dict[str, dict[str, str]]] = None
    supported_languages: Optional[list[str]] = None
    is_premium: Optional[bool] = None
    is_active: Optional[bool] = None


class TemplateResponse(BaseModel):
    """Template response model."""

    template_id: str
    workspace_id: Optional[str] = None
    name: str
    slug: str
    description: Optional[str] = None
    category: str
    subcategory: Optional[str] = None
    tags: list[str] = []
    layout: dict[str, Any] = {}
    content_i18n: dict[str, dict[str, str]] = {}
    supported_languages: list[str] = []
    is_system: bool = False
    is_premium: bool = False
    is_active: bool = True
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TemplateListResponse(BaseModel):
    """Paginated template list response."""

    data: list[TemplateResponse]
    total: int
    page: int
    limit: int
    has_more: bool


class CategoryResponse(BaseModel):
    """Template category response."""

    category: str
    count: int
    subcategories: list[str] = []


# ---------------------------------------------------------------------------
# Service Dependency
# ---------------------------------------------------------------------------


def get_template_service() -> InvitationTemplateService:
    """Get template service instance."""
    return InvitationTemplateService()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/templates",
    response_model=TemplateListResponse,
    summary="List templates",
)
async def list_templates(
    workspace_id: UUID,
    category: Optional[str] = Query(None, description="Filter by category"),
    subcategory: Optional[str] = Query(None, description="Filter by subcategory"),
    language: Optional[str] = Query(None, description="Filter by supported language"),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter by"),
    is_premium: Optional[bool] = Query(None, description="Filter by premium status"),
    include_premium: Optional[bool] = Query(None, description="Include premium templates"),
    search: Optional[str] = Query(None, description="Search in name/description"),
    include_system: bool = Query(True, description="Include system templates"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_user),
    template_service: InvitationTemplateService = Depends(get_template_service),
):
    """
    List available templates for the workspace.

    Returns both system templates and workspace-specific templates.
    Supports filtering by category, language, tags, and premium status.
    """
    # #region agent log
    try:
        with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
            json.dump({"sessionId": "debug-session", "runId": "run1", "hypothesisId": "A", "location": "invitation_templates.py:144", "message": "list_templates entry", "data": {"workspace_id": str(workspace_id), "include_system": include_system, "include_system_type": type(include_system).__name__, "include_premium": include_premium, "include_premium_type": type(include_premium).__name__, "is_premium": is_premium, "is_premium_type": type(is_premium).__name__}, "timestamp": __import__("time").time() * 1000}, f, ensure_ascii=False)
            f.write("\n")
    except Exception:
        pass
    # #endregion
    
    # Parse tags if provided
    tag_list = [t.strip() for t in tags.split(",")] if tags else None

    # Handle premium filtering:
    # - is_premium takes precedence if explicitly set
    # - include_premium=True means don't filter by premium (show all)
    # - include_premium=False means only show non-premium
    effective_is_premium = is_premium
    if effective_is_premium is None and include_premium is not None:
        if not include_premium:
            effective_is_premium = False
        # include_premium=True means show all, so leave as None

    # #region agent log
    effective_workspace_id = workspace_id if not include_system else None
    try:
        with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
            json.dump({"sessionId": "debug-session", "runId": "run1", "hypothesisId": "B", "location": "invitation_templates.py:162", "message": "workspace_id logic", "data": {"include_system": include_system, "original_workspace_id": str(workspace_id), "effective_workspace_id": str(effective_workspace_id) if effective_workspace_id else None, "effective_is_premium": effective_is_premium, "tag_list": tag_list}, "timestamp": __import__("time").time() * 1000}, f, ensure_ascii=False)
            f.write("\n")
    except Exception:
        pass
    # #endregion

    try:
        result = await template_service.list_templates(
            workspace_id=effective_workspace_id,
            category=category,
            subcategory=subcategory,
            language=language,
            tags=tag_list,
            is_premium=effective_is_premium,
            search=search,
            page=page,
            limit=limit,
        )
    except Exception as e:
        # #region agent log
        try:
            with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                json.dump({"sessionId": "debug-session", "runId": "run1", "hypothesisId": "B", "location": "invitation_templates.py:174", "message": "service.list_templates exception", "data": {"error": str(e), "error_type": type(e).__name__, "traceback": traceback.format_exc()}, "timestamp": __import__("time").time() * 1000}, f, ensure_ascii=False)
                f.write("\n")
        except Exception:
            pass
        # #endregion
        raise

    templates_data, total = result
    
    # #region agent log
    try:
        with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
            json.dump({"sessionId": "debug-session", "runId": "run1", "hypothesisId": "B", "location": "invitation_templates.py:179", "message": "service.list_templates success", "data": {"templates_count": len(templates_data), "total": total, "first_template_keys": list(templates_data[0].keys()) if templates_data else []}, "timestamp": __import__("time").time() * 1000}, f, ensure_ascii=False)
            f.write("\n")
    except Exception:
        pass
    # #endregion
    
    # Format response
    templates = []
    for idx, t in enumerate(templates_data):
        try:
            # #region agent log
            if idx == 0:
                try:
                    with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                        json.dump({"sessionId": "debug-session", "runId": "run1", "hypothesisId": "C", "location": "invitation_templates.py:188", "message": "before TemplateResponse construction", "data": {"template_id": str(t.get("template_id")), "template_id_type": type(t.get("template_id")).__name__, "created_at": str(t.get("created_at")), "created_at_type": type(t.get("created_at")).__name__}, "timestamp": __import__("time").time() * 1000}, f, ensure_ascii=False)
                        f.write("\n")
                except Exception:
                    pass
            # #endregion
            template = TemplateResponse(
                template_id=str(t["template_id"]),
                workspace_id=str(t["workspace_id"]) if t.get("workspace_id") else None,
                name=t["name"],
                slug=t.get("slug", ""),
                description=t.get("description"),
                category=t["category"],
                subcategory=t.get("subcategory"),
                tags=t.get("tags", []),
                layout=t.get("layout", {}),
                content_i18n=t.get("content_i18n", {}),
                supported_languages=t.get("supported_languages", []),
                is_system=t.get("workspace_id") is None,
                is_premium=t.get("is_premium", False),
                is_active=t.get("is_active", True),
                thumbnail_url=t.get("thumbnail_url"),
                preview_url=t.get("preview_image_url"), # Note: repo uses preview_image_url
                created_at=t["created_at"].isoformat() if t.get("created_at") else None,
                updated_at=t["updated_at"].isoformat() if t.get("updated_at") else None,
            )
            templates.append(template)
        except Exception as e:
            # #region agent log
            try:
                with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                    json.dump({"sessionId": "debug-session", "runId": "run1", "hypothesisId": "C", "location": "invitation_templates.py:212", "message": "TemplateResponse construction failed", "data": {"error": str(e), "error_type": type(e).__name__, "template_index": idx, "traceback": traceback.format_exc(), "template_keys": list(t.keys())}, "timestamp": __import__("time").time() * 1000}, f, ensure_ascii=False)
                    f.write("\n")
            except Exception:
                pass
            # #endregion
            raise

    return TemplateListResponse(
        data=templates,
        total=total,
        page=page,
        limit=limit,
        has_more=(page * limit) < total,
    )


@router.get(
    "/templates/categories",
    response_model=list[CategoryResponse],
    summary="List template categories",
)
async def list_categories(
    workspace_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    template_service: InvitationTemplateService = Depends(get_template_service),
):
    """
    List available template categories with counts.
    """
    categories = await template_service.list_categories()
    return [
        CategoryResponse(
            category=c["category"],
            count=c["count"],
            subcategories=c.get("subcategories", []),
        )
        for c in categories
    ]


@router.get(
    "/templates/{template_id}",
    response_model=TemplateResponse,
    summary="Get template by ID",
)
async def get_template(
    workspace_id: UUID,
    template_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    template_service: InvitationTemplateService = Depends(get_template_service),
):
    """
    Get a specific template by ID.

    Returns system templates or workspace-specific templates.
    """
    try:
        template = await template_service.get_template(
            template_id=template_id,
            workspace_id=workspace_id,
        )

        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found",
            )

        return TemplateResponse(
            template_id=str(template["template_id"]),
            workspace_id=str(template["workspace_id"]) if template.get("workspace_id") else None,
            name=template["name"],
            slug=template["slug"],
            description=template.get("description"),
            category=template["category"],
            subcategory=template.get("subcategory"),
            tags=template.get("tags", []),
            layout=template.get("layout", {}),
            content_i18n=template.get("content_i18n", {}),
            supported_languages=template.get("supported_languages", []),
            is_system=template.get("workspace_id") is None,
            is_premium=template.get("is_premium", False),
            is_active=template.get("is_active", True),
            thumbnail_url=template.get("thumbnail_url"),
            preview_url=template.get("preview_url"),
            created_at=template["created_at"].isoformat() if template.get("created_at") else None,
            updated_at=template["updated_at"].isoformat() if template.get("updated_at") else None,
        )

    except TemplateNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )


@router.post(
    "/templates",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create template",
)
async def create_template(
    workspace_id: UUID,
    request: CreateTemplateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    template_service: InvitationTemplateService = Depends(get_template_service),
):
    """
    Create a new workspace-specific template.

    Only workspace admins can create templates.
    """
    try:
        template = await template_service.create_template(
            workspace_id=workspace_id,
            name=request.name,
            description=request.description,
            category=request.category,
            subcategory=request.subcategory,
            tags=request.tags,
            layout=request.layout.model_dump() if request.layout else None,
            content_i18n=request.content_i18n,
            supported_languages=request.supported_languages,
            is_premium=request.is_premium,
        )

        return TemplateResponse(
            template_id=str(template["template_id"]),
            workspace_id=str(template["workspace_id"]) if template.get("workspace_id") else None,
            name=template["name"],
            slug=template["slug"],
            description=template.get("description"),
            category=template["category"],
            subcategory=template.get("subcategory"),
            tags=template.get("tags", []),
            layout=template.get("layout", {}),
            content_i18n=template.get("content_i18n", {}),
            supported_languages=template.get("supported_languages", []),
            is_system=False,
            is_premium=template.get("is_premium", False),
            is_active=True,
            thumbnail_url=template.get("thumbnail_url"),
            preview_url=template.get("preview_url"),
            created_at=template["created_at"].isoformat() if template.get("created_at") else None,
            updated_at=template["updated_at"].isoformat() if template.get("updated_at") else None,
        )

    except TemplateError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.message,
        )


@router.patch(
    "/templates/{template_id}",
    response_model=TemplateResponse,
    summary="Update template",
)
async def update_template(
    workspace_id: UUID,
    template_id: UUID,
    request: UpdateTemplateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    template_service: InvitationTemplateService = Depends(get_template_service),
):
    """
    Update a workspace-specific template.

    Cannot update system templates.
    """
    try:
        # Build update dict from non-None fields
        updates = {}
        if request.name is not None:
            updates["name"] = request.name
        if request.description is not None:
            updates["description"] = request.description
        if request.category is not None:
            updates["category"] = request.category
        if request.subcategory is not None:
            updates["subcategory"] = request.subcategory
        if request.tags is not None:
            updates["tags"] = request.tags
        if request.layout is not None:
            updates["layout"] = request.layout.model_dump()
        if request.content_i18n is not None:
            updates["content_i18n"] = request.content_i18n
        if request.supported_languages is not None:
            updates["supported_languages"] = request.supported_languages
        if request.is_premium is not None:
            updates["is_premium"] = request.is_premium
        if request.is_active is not None:
            updates["is_active"] = request.is_active

        template = await template_service.update_template(
            template_id=template_id,
            workspace_id=workspace_id,
            **updates,
        )

        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found",
            )

        return TemplateResponse(
            template_id=str(template["template_id"]),
            workspace_id=str(template["workspace_id"]) if template.get("workspace_id") else None,
            name=template["name"],
            slug=template["slug"],
            description=template.get("description"),
            category=template["category"],
            subcategory=template.get("subcategory"),
            tags=template.get("tags", []),
            layout=template.get("layout", {}),
            content_i18n=template.get("content_i18n", {}),
            supported_languages=template.get("supported_languages", []),
            is_system=template.get("workspace_id") is None,
            is_premium=template.get("is_premium", False),
            is_active=template.get("is_active", True),
            thumbnail_url=template.get("thumbnail_url"),
            preview_url=template.get("preview_url"),
            created_at=template["created_at"].isoformat() if template.get("created_at") else None,
            updated_at=template["updated_at"].isoformat() if template.get("updated_at") else None,
        )

    except TemplateNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    except TemplateError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.message,
        )


@router.delete(
    "/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete template",
)
async def delete_template(
    workspace_id: UUID,
    template_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    template_service: InvitationTemplateService = Depends(get_template_service),
):
    """
    Delete a workspace-specific template.

    Cannot delete system templates.
    """
    try:
        await template_service.delete_template(
            template_id=template_id,
            workspace_id=workspace_id,
        )
    except TemplateNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    except TemplateError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.message,
        )
