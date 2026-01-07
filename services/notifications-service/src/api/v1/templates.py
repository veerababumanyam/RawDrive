"""Templates API endpoints for the Notifications & Communication Microservice.

This module provides REST API endpoints for:
- Creating and managing notification templates
- Template versioning and lifecycle management
- Template rendering and preview
- Template validation and variable detection
- Bulk operations for template management
- Template cloning and search

All endpoints require JWT authentication and enforce workspace isolation.
System templates (workspace_id = NULL) are read-only for non-admin users.

Feature: Notifications & Communication Microservice
Task: T028 - Create templates API router
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from src.log_config import get_logger
from src.middleware.auth import JWTPayload, get_current_user
from src.repositories.template_repository import template_repository
from src.schemas.notification import (
    ErrorResponse,
    NotificationCategory,
    NotificationChannel,
)
from src.schemas.template import (
    BulkTemplateStatusUpdate,
    BulkTemplateUpdateResponse,
    TemplateCloneRequest,
    TemplateCreateRequest,
    TemplateListResponse,
    TemplatePreviewRequest,
    TemplateRenderRequest,
    TemplateRenderResponse,
    TemplateResponse,
    TemplateSearchRequest,
    TemplateStatus,
    TemplateSummary,
    TemplateUpdateRequest,
    TemplateValidationRequest,
    TemplateValidationResult,
    TemplateVersionHistory,
    TemplateVersionListResponse,
    TemplateVersionRequest,
)
from src.services.template_service import template_service

logger = get_logger(__name__)


# =============================================================================
# Workspace & Role Access Verification
# =============================================================================


async def verify_workspace_access(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: JWTPayload = Depends(get_current_user),
) -> UUID:
    """
    Verify user has access to the requested workspace.

    Args:
        workspace_id: Workspace ID from path
        current_user: JWT payload from auth

    Returns:
        UUID: Validated workspace ID

    Raises:
        HTTPException: 403 if user doesn't have access
    """
    if str(current_user.workspace_id) != str(workspace_id):
        logger.warning(
            "Workspace access denied",
            extra={
                "user_id": current_user.user_id,
                "requested_workspace": str(workspace_id),
                "user_workspace": current_user.workspace_id,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                error="WORKSPACE_ACCESS_DENIED",
                message="You do not have access to this workspace",
            ).model_dump(),
        )

    return workspace_id


async def require_admin_role(
    current_user: JWTPayload = Depends(get_current_user),
) -> JWTPayload:
    """
    Require admin role for certain operations.

    Args:
        current_user: JWT payload from auth

    Returns:
        JWTPayload: Current user if admin

    Raises:
        HTTPException: 403 if user is not admin
    """
    if current_user.role not in ("admin", "owner"):
        logger.warning(
            "Admin access denied",
            extra={
                "user_id": current_user.user_id,
                "role": current_user.role,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                error="ADMIN_ACCESS_REQUIRED",
                message="Admin role required for this operation",
            ).model_dump(),
        )

    return current_user


# =============================================================================
# Router Configuration
# =============================================================================

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/templates",
    tags=["templates"],
)


# =============================================================================
# Template CRUD Operations
# =============================================================================


@router.post(
    "",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a template",
    description="Create a new notification template for the workspace.",
)
async def create_template(
    request: TemplateCreateRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateResponse:
    """
    Create a new notification template.

    Templates define the content and format for notifications across
    different channels (email, SMS, push, in-app).

    Args:
        request: Template creation request with content and settings
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateResponse: Created template

    Raises:
        HTTPException: 400 for validation errors, 409 for duplicate code
    """
    # Check if template code already exists
    existing = await template_repository.template_code_exists(
        workspace_id=workspace_id,
        code=request.code,
        version=request.version,
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ErrorResponse(
                error="TEMPLATE_CODE_EXISTS",
                message=f"Template with code '{request.code}' version '{request.version}' already exists",
            ).model_dump(),
        )

    try:
        template = await template_repository.create_template(
            code=request.code,
            name=request.name,
            category=request.category,
            workspace_id=workspace_id,
            description=request.description,
            supported_channels=request.supported_channels,
            status=request.status,
            email=request.email,
            sms=request.sms,
            push=request.push,
            in_app=request.in_app,
            variable_schema=request.variable_schema.model_dump() if request.variable_schema else None,
            default_values=request.default_values,
            default_language=request.default_language,
            localized_content={k: v.model_dump() for k, v in request.localized_content.items()} if request.localized_content else None,
            version=request.version,
            default_priority=request.default_priority,
            is_transactional=request.is_transactional,
            ttl_seconds=request.ttl_seconds,
            tags=request.tags,
            metadata=request.metadata,
            created_by_user_id=UUID(current_user.user_id),
        )

        logger.info(
            "Template created",
            extra={
                "template_id": str(template.template_id),
                "code": template.code,
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
            },
        )

        return template

    except Exception as e:
        logger.exception(
            "Failed to create template",
            extra={"workspace_id": str(workspace_id), "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="TEMPLATE_CREATE_FAILED",
                message=str(e),
            ).model_dump(),
        )


@router.get(
    "",
    response_model=TemplateListResponse,
    summary="List templates",
    description="List notification templates with filtering and pagination.",
)
async def list_templates(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[TemplateStatus] = Query(None, description="Filter by status"),
    category: Optional[NotificationCategory] = Query(None, description="Filter by category"),
    channel: Optional[NotificationChannel] = Query(None, description="Filter by supported channel"),
    tags: Optional[str] = Query(None, description="Filter by tags (comma-separated)"),
    is_transactional: Optional[bool] = Query(None, description="Filter by transactional flag"),
    include_system: bool = Query(True, description="Include system templates"),
    search: Optional[str] = Query(None, description="Search in code, name, description"),
) -> TemplateListResponse:
    """
    List notification templates for a workspace.

    Supports filtering by status, category, channel, tags, and search.
    Results include both workspace-specific and system templates (unless excluded).

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user
        page: Page number (1-indexed)
        limit: Items per page (1-100)
        status: Optional status filter
        category: Optional category filter
        channel: Optional channel filter
        tags: Optional comma-separated tags
        is_transactional: Optional transactional flag filter
        include_system: Whether to include system templates (default True)
        search: Optional search query

    Returns:
        TemplateListResponse: Paginated list of templates
    """
    # Parse tags if provided
    tag_list = [t.strip() for t in tags.split(",")] if tags else None

    templates, meta = await template_repository.list_templates(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        status=status,
        category=category,
        channel=channel,
        tags=tag_list,
        is_transactional=is_transactional,
        include_system=include_system,
        search_query=search,
    )

    logger.debug(
        "Templates listed",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "page": page,
            "total": meta.total,
        },
    )

    return TemplateListResponse(data=templates, meta=meta)


@router.get(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="Get template",
    description="Get detailed information about a specific template.",
)
async def get_template(
    template_id: UUID = Path(..., description="Template ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateResponse:
    """
    Get a template by ID.

    Returns the full template with all content and settings.
    Accessible for workspace templates and system templates.

    Args:
        template_id: Template ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateResponse: Full template details

    Raises:
        HTTPException: 404 if template not found
    """
    template = await template_repository.get_template(
        workspace_id=workspace_id,
        template_id=template_id,
    )

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"Template {template_id} not found",
            ).model_dump(),
        )

    logger.debug(
        "Template retrieved",
        extra={
            "template_id": str(template_id),
            "workspace_id": str(workspace_id),
        },
    )

    return template


@router.get(
    "/code/{code}",
    response_model=TemplateResponse,
    summary="Get template by code",
    description="Get a template by its unique code.",
)
async def get_template_by_code(
    code: str = Path(..., description="Template code"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    template_status: Optional[TemplateStatus] = Query(
        None, alias="status", description="Filter by status (default: active)"
    ),
) -> TemplateResponse:
    """
    Get a template by code.

    Returns the active template for the given code, or filters by status if provided.
    Workspace templates take precedence over system templates with the same code.

    Args:
        code: Template code
        workspace_id: Workspace ID from path
        current_user: Current authenticated user
        template_status: Optional status filter (default: active)

    Returns:
        TemplateResponse: Template details

    Raises:
        HTTPException: 404 if template not found
    """
    template = await template_repository.get_template_by_code(
        workspace_id=workspace_id,
        code=code,
        status=template_status,
    )

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"Template with code '{code}' not found",
            ).model_dump(),
        )

    logger.debug(
        "Template retrieved by code",
        extra={
            "code": code,
            "workspace_id": str(workspace_id),
            "template_id": str(template.template_id),
        },
    )

    return template


@router.patch(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="Update template",
    description="Update an existing notification template.",
)
async def update_template(
    request: TemplateUpdateRequest,
    template_id: UUID = Path(..., description="Template ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateResponse:
    """
    Update a notification template.

    Only provided fields are updated. Omitted fields remain unchanged.
    System templates can only be updated by admins.

    Args:
        request: Template update request
        template_id: Template ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateResponse: Updated template

    Raises:
        HTTPException: 404 if not found, 403 if updating system template without admin
    """
    # Check if template exists and get workspace info
    existing = await template_repository.get_template(
        workspace_id=workspace_id,
        template_id=template_id,
    )

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"Template {template_id} not found",
            ).model_dump(),
        )

    # System templates require admin role
    if existing.workspace_id is None and current_user.role not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                error="SYSTEM_TEMPLATE_UPDATE_FORBIDDEN",
                message="Only admins can update system templates",
            ).model_dump(),
        )

    try:
        updated = await template_repository.update_template(
            workspace_id=workspace_id,
            template_id=template_id,
            name=request.name,
            description=request.description,
            supported_channels=request.supported_channels,
            status=request.status,
            email=request.email,
            sms=request.sms,
            push=request.push,
            in_app=request.in_app,
            variable_schema=request.variable_schema.model_dump() if request.variable_schema else None,
            default_values=request.default_values,
            default_language=request.default_language,
            localized_content={k: v.model_dump() for k, v in request.localized_content.items()} if request.localized_content else None,
            default_priority=request.default_priority,
            is_transactional=request.is_transactional,
            ttl_seconds=request.ttl_seconds,
            tags=request.tags,
            metadata=request.metadata,
            updated_by_user_id=UUID(current_user.user_id),
        )

        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(
                    error="TEMPLATE_NOT_FOUND",
                    message=f"Template {template_id} not found",
                ).model_dump(),
            )

        logger.info(
            "Template updated",
            extra={
                "template_id": str(template_id),
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
            },
        )

        return updated

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Failed to update template",
            extra={"template_id": str(template_id), "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="TEMPLATE_UPDATE_FAILED",
                message=str(e),
            ).model_dump(),
        )


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete template",
    description="Delete a notification template.",
)
async def delete_template(
    template_id: UUID = Path(..., description="Template ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> None:
    """
    Delete a notification template.

    System templates require admin role to delete.
    Notifications using this template will have template_id set to NULL.

    Args:
        template_id: Template ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Raises:
        HTTPException: 404 if not found, 403 if deleting system template without admin
    """
    # Check if template exists and get workspace info
    existing = await template_repository.get_template(
        workspace_id=workspace_id,
        template_id=template_id,
    )

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"Template {template_id} not found",
            ).model_dump(),
        )

    # System templates require admin role
    if existing.workspace_id is None and current_user.role not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                error="SYSTEM_TEMPLATE_DELETE_FORBIDDEN",
                message="Only admins can delete system templates",
            ).model_dump(),
        )

    deleted = await template_repository.delete_template(
        workspace_id=workspace_id,
        template_id=template_id,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"Template {template_id} not found",
            ).model_dump(),
        )

    logger.info(
        "Template deleted",
        extra={
            "template_id": str(template_id),
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
        },
    )


# =============================================================================
# Template Status Management
# =============================================================================


@router.post(
    "/{template_id}/activate",
    response_model=TemplateResponse,
    summary="Activate template",
    description="Set template status to active.",
)
async def activate_template(
    template_id: UUID = Path(..., description="Template ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateResponse:
    """
    Activate a template.

    Changes template status to 'active', making it available for use
    in notifications.

    Args:
        template_id: Template ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateResponse: Updated template

    Raises:
        HTTPException: 404 if not found
    """
    template = await template_repository.activate_template(
        workspace_id=workspace_id,
        template_id=template_id,
        updated_by_user_id=UUID(current_user.user_id),
    )

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"Template {template_id} not found",
            ).model_dump(),
        )

    logger.info(
        "Template activated",
        extra={
            "template_id": str(template_id),
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
        },
    )

    return template


@router.post(
    "/{template_id}/archive",
    response_model=TemplateResponse,
    summary="Archive template",
    description="Set template status to archived.",
)
async def archive_template(
    template_id: UUID = Path(..., description="Template ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateResponse:
    """
    Archive a template.

    Changes template status to 'archived'. Archived templates are
    preserved but cannot be used for new notifications.

    Args:
        template_id: Template ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateResponse: Updated template

    Raises:
        HTTPException: 404 if not found
    """
    template = await template_repository.archive_template(
        workspace_id=workspace_id,
        template_id=template_id,
        updated_by_user_id=UUID(current_user.user_id),
    )

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"Template {template_id} not found",
            ).model_dump(),
        )

    logger.info(
        "Template archived",
        extra={
            "template_id": str(template_id),
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
        },
    )

    return template


@router.post(
    "/{template_id}/deprecate",
    response_model=TemplateResponse,
    summary="Deprecate template",
    description="Set template status to deprecated.",
)
async def deprecate_template(
    template_id: UUID = Path(..., description="Template ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateResponse:
    """
    Deprecate a template.

    Changes template status to 'deprecated'. Deprecated templates should
    not be used and typically have a newer replacement.

    Args:
        template_id: Template ID
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateResponse: Updated template

    Raises:
        HTTPException: 404 if not found
    """
    template = await template_repository.deprecate_template(
        workspace_id=workspace_id,
        template_id=template_id,
        updated_by_user_id=UUID(current_user.user_id),
    )

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"Template {template_id} not found",
            ).model_dump(),
        )

    logger.info(
        "Template deprecated",
        extra={
            "template_id": str(template_id),
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
        },
    )

    return template


# =============================================================================
# Template Versioning
# =============================================================================


@router.get(
    "/code/{code}/versions",
    response_model=TemplateVersionListResponse,
    summary="Get template versions",
    description="Get all versions of a template by code.",
)
async def get_template_versions(
    code: str = Path(..., description="Template code"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateVersionListResponse:
    """
    Get all versions of a template.

    Returns version history for a template code, including
    status and creation info for each version.

    Args:
        code: Template code
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateVersionListResponse: Version history
    """
    versions = await template_repository.get_template_versions(
        workspace_id=workspace_id,
        code=code,
    )

    if not versions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"No templates found with code '{code}'",
            ).model_dump(),
        )

    # Find current version (latest active or highest version)
    current_version = None
    for v in versions:
        if v.status == TemplateStatus.ACTIVE:
            current_version = v.version
            break
    if not current_version and versions:
        current_version = versions[0].version

    version_history = [
        TemplateVersionHistory(
            template_id=v.template_id,
            version=v.version,
            status=v.status,
            created_at=v.created_at,
            created_by_user_id=None,  # Not in summary
            changelog=None,
        )
        for v in versions
    ]

    logger.debug(
        "Template versions retrieved",
        extra={
            "code": code,
            "workspace_id": str(workspace_id),
            "version_count": len(versions),
        },
    )

    return TemplateVersionListResponse(
        code=code,
        current_version=current_version or "1.0.0",
        versions=version_history,
    )


@router.post(
    "/{template_id}/versions",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create template version",
    description="Create a new version of an existing template.",
)
async def create_template_version(
    request: TemplateVersionRequest,
    template_id: UUID = Path(..., description="Template ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateResponse:
    """
    Create a new version of a template.

    Creates a copy of the template with a new version number.
    The new version starts in 'draft' status.

    Args:
        request: Version creation request
        template_id: Template ID to version
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateResponse: New template version

    Raises:
        HTTPException: 404 if original not found, 400 if version invalid
    """
    # Get original template
    original = await template_repository.get_template(
        workspace_id=workspace_id,
        template_id=template_id,
    )

    if not original:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="TEMPLATE_NOT_FOUND",
                message=f"Template {template_id} not found",
            ).model_dump(),
        )

    # Check if version already exists
    exists = await template_repository.template_code_exists(
        workspace_id=workspace_id,
        code=original.code,
        version=request.version,
    )

    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ErrorResponse(
                error="VERSION_EXISTS",
                message=f"Version '{request.version}' already exists for template '{original.code}'",
            ).model_dump(),
        )

    try:
        new_version = await template_repository.create_template_version(
            workspace_id=workspace_id,
            original_template_id=template_id,
            version=request.version,
            email=request.email,
            sms=request.sms,
            push=request.push,
            in_app=request.in_app,
            variable_schema=request.variable_schema.model_dump() if request.variable_schema else None,
            default_values=request.default_values,
            localized_content={k: v.model_dump() for k, v in request.localized_content.items()} if request.localized_content else None,
            metadata=request.metadata,
            updated_by_user_id=UUID(current_user.user_id),
        )

        if not new_version:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="VERSION_CREATE_FAILED",
                    message="Failed to create template version",
                ).model_dump(),
            )

        logger.info(
            "Template version created",
            extra={
                "template_id": str(new_version.template_id),
                "original_id": str(template_id),
                "version": request.version,
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
            },
        )

        return new_version

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Failed to create template version",
            extra={"template_id": str(template_id), "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="VERSION_CREATE_FAILED",
                message=str(e),
            ).model_dump(),
        )


# =============================================================================
# Template Cloning
# =============================================================================


@router.post(
    "/{template_id}/clone",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Clone template",
    description="Create a copy of a template with a new code.",
)
async def clone_template(
    request: TemplateCloneRequest,
    template_id: UUID = Path(..., description="Template ID to clone"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateResponse:
    """
    Clone a template.

    Creates a copy of the template with a new code. The clone
    starts in 'draft' status and version '1.0.0'.

    Args:
        request: Clone request with new code and optional name
        template_id: Template ID to clone
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateResponse: Cloned template

    Raises:
        HTTPException: 404 if source not found, 409 if new code exists
    """
    # Check if new code already exists
    target_workspace = request.target_workspace_id or workspace_id

    # Verify user has access to target workspace
    if request.target_workspace_id and str(request.target_workspace_id) != str(workspace_id):
        if str(current_user.workspace_id) != str(request.target_workspace_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=ErrorResponse(
                    error="WORKSPACE_ACCESS_DENIED",
                    message="You do not have access to the target workspace",
                ).model_dump(),
            )

    exists = await template_repository.template_code_exists(
        workspace_id=target_workspace,
        code=request.new_code,
    )

    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ErrorResponse(
                error="TEMPLATE_CODE_EXISTS",
                message=f"Template with code '{request.new_code}' already exists",
            ).model_dump(),
        )

    try:
        cloned = await template_repository.clone_template(
            source_workspace_id=workspace_id,
            source_template_id=template_id,
            new_code=request.new_code,
            target_workspace_id=target_workspace,
            new_name=request.new_name,
            created_by_user_id=UUID(current_user.user_id),
        )

        if not cloned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(
                    error="TEMPLATE_NOT_FOUND",
                    message=f"Source template {template_id} not found",
                ).model_dump(),
            )

        logger.info(
            "Template cloned",
            extra={
                "template_id": str(cloned.template_id),
                "source_id": str(template_id),
                "new_code": request.new_code,
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
            },
        )

        return cloned

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Failed to clone template",
            extra={"template_id": str(template_id), "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="CLONE_FAILED",
                message=str(e),
            ).model_dump(),
        )


# =============================================================================
# Template Rendering & Preview
# =============================================================================


@router.post(
    "/render",
    response_model=TemplateRenderResponse,
    summary="Render template",
    description="Render a template with provided variables.",
)
async def render_template(
    request: TemplateRenderRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateRenderResponse:
    """
    Render a template with variables.

    Processes a template with the provided variable values and
    returns the rendered content for the specified channel.

    Args:
        request: Render request with template reference and variables
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateRenderResponse: Rendered content with any warnings

    Raises:
        HTTPException: 404 if template not found, 400 if rendering fails
    """
    try:
        response = await template_service.render_template(
            workspace_id=workspace_id,
            template_id=request.template_id,
            template_code=request.template_code,
            channel=request.channel,
            variables=request.variables,
            language=request.language,
        )

        logger.debug(
            "Template rendered",
            extra={
                "template_id": str(request.template_id) if request.template_id else None,
                "template_code": request.template_code,
                "channel": request.channel.value,
                "workspace_id": str(workspace_id),
            },
        )

        return response

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="RENDER_FAILED",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        logger.exception(
            "Template render failed",
            extra={"error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="RENDER_ERROR",
                message="An error occurred while rendering the template",
            ).model_dump(),
        )


@router.post(
    "/preview",
    response_model=TemplateRenderResponse,
    summary="Preview template",
    description="Preview a template with sample data.",
)
async def preview_template(
    request: TemplatePreviewRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateRenderResponse:
    """
    Preview a template.

    Renders a template with sample data for preview purposes.
    Can preview either saved templates or custom content.

    Args:
        request: Preview request with template reference or custom content
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateRenderResponse: Preview rendered content

    Raises:
        HTTPException: 400 if preview fails
    """
    try:
        response = await template_service.preview_template(
            workspace_id=workspace_id,
            template_id=request.template_id,
            template_code=request.template_code,
            channel=request.channel,
            sample_variables=request.sample_variables,
            custom_email=request.email,
            custom_sms=request.sms,
            custom_push=request.push,
            custom_in_app=request.in_app,
            language=request.language,
        )

        logger.debug(
            "Template preview generated",
            extra={
                "template_id": str(request.template_id) if request.template_id else None,
                "template_code": request.template_code,
                "channel": request.channel.value,
                "workspace_id": str(workspace_id),
            },
        )

        return response

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="PREVIEW_FAILED",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        logger.exception(
            "Template preview failed",
            extra={"error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="PREVIEW_ERROR",
                message="An error occurred while previewing the template",
            ).model_dump(),
        )


# =============================================================================
# Template Validation
# =============================================================================


@router.post(
    "/validate",
    response_model=TemplateValidationResult,
    summary="Validate template",
    description="Validate template content and detect variables.",
)
async def validate_template(
    request: TemplateValidationRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateValidationResult:
    """
    Validate template content.

    Checks template syntax, detects variables, and validates
    against the provided schema.

    Args:
        request: Validation request with template content
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateValidationResult: Validation result with errors and warnings
    """
    result = await template_service.validate_template(
        email=request.email,
        sms=request.sms,
        push=request.push,
        in_app=request.in_app,
        variable_schema=request.variable_schema.model_dump() if request.variable_schema else None,
    )

    logger.debug(
        "Template validated",
        extra={
            "valid": result.valid,
            "error_count": len(result.errors),
            "warning_count": len(result.warnings),
            "workspace_id": str(workspace_id),
        },
    )

    return result


# =============================================================================
# Bulk Operations (Admin Only)
# =============================================================================


@router.post(
    "/bulk/status",
    response_model=BulkTemplateUpdateResponse,
    summary="Bulk update status",
    description="Bulk update status for multiple templates (admin only).",
)
async def bulk_update_status(
    request: BulkTemplateStatusUpdate,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
) -> BulkTemplateUpdateResponse:
    """
    Bulk update template status.

    Admin only. Updates status for multiple templates at once.

    Args:
        request: Bulk update request with template IDs and new status
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user

    Returns:
        BulkTemplateUpdateResponse: Results with success/failure counts
    """
    updated, failed = await template_repository.bulk_update_status(
        workspace_id=workspace_id,
        template_ids=request.template_ids,
        status=request.status,
        updated_by_user_id=UUID(current_user.user_id),
    )

    logger.info(
        "Bulk template status update",
        extra={
            "workspace_id": str(workspace_id),
            "admin_user_id": current_user.user_id,
            "status": request.status.value,
            "updated": updated,
            "failed": failed,
        },
    )

    return BulkTemplateUpdateResponse(
        updated=updated,
        failed=failed,
        errors=[],
    )


# =============================================================================
# Search & Statistics
# =============================================================================


@router.post(
    "/search",
    response_model=TemplateListResponse,
    summary="Search templates",
    description="Search templates with advanced filtering.",
)
async def search_templates(
    request: TemplateSearchRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> TemplateListResponse:
    """
    Search templates with advanced filtering.

    Supports searching by query text, category, channels, status,
    tags, and transactional flag.

    Args:
        request: Search request with filters
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        TemplateListResponse: Search results
    """
    templates, meta = await template_repository.list_templates(
        workspace_id=workspace_id,
        page=request.page,
        limit=request.limit,
        status=request.status,
        category=request.category,
        channel=request.channels[0] if request.channels else None,  # TODO: Support multiple channels
        tags=request.tags,
        is_transactional=request.is_transactional,
        include_system=request.include_system,
        search_query=request.query,
    )

    logger.debug(
        "Template search completed",
        extra={
            "workspace_id": str(workspace_id),
            "query": request.query,
            "total": meta.total,
        },
    )

    return TemplateListResponse(data=templates, meta=meta)


@router.get(
    "/stats/overview",
    response_model=dict[str, Any],
    summary="Get template statistics",
    description="Get template statistics for the workspace.",
)
async def get_template_stats(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Get template statistics.

    Returns aggregate statistics including counts by status,
    type, and channel.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        Statistics dictionary
    """
    stats = await template_repository.get_template_stats(workspace_id)

    logger.debug(
        "Template stats retrieved",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
        },
    )

    return stats


@router.get(
    "/stats/by-category",
    response_model=list[dict[str, Any]],
    summary="Get templates by category",
    description="Get template counts grouped by category.",
)
async def get_templates_by_category_stats(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """
    Get template counts by category.

    Returns template counts grouped by notification category.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        List of category stats
    """
    stats = await template_repository.get_templates_by_category_stats(workspace_id)

    logger.debug(
        "Template category stats retrieved",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
        },
    )

    return stats


# =============================================================================
# System Templates (Read-Only Access)
# =============================================================================


@router.get(
    "/system",
    response_model=list[TemplateSummary],
    summary="List system templates",
    description="List all available system templates.",
)
async def list_system_templates(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    status: TemplateStatus = Query(TemplateStatus.ACTIVE, description="Filter by status"),
) -> list[TemplateSummary]:
    """
    List system templates.

    Returns all system templates (workspace_id = NULL) that are
    available for use by all workspaces.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user
        status: Status filter (default: active)

    Returns:
        List of system templates
    """
    templates = await template_repository.get_system_templates(status=status)

    logger.debug(
        "System templates listed",
        extra={
            "status": status.value,
            "count": len(templates),
        },
    )

    return templates


# =============================================================================
# Category & Channel Filtering
# =============================================================================


@router.get(
    "/category/{category}",
    response_model=list[TemplateSummary],
    summary="Get templates by category",
    description="Get all templates for a specific category.",
)
async def get_templates_by_category(
    category: NotificationCategory = Path(..., description="Notification category"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    template_status: TemplateStatus = Query(TemplateStatus.ACTIVE, alias="status"),
) -> list[TemplateSummary]:
    """
    Get templates by category.

    Returns all templates belonging to a specific notification category.

    Args:
        category: Notification category
        workspace_id: Workspace ID from path
        current_user: Current authenticated user
        template_status: Status filter (default: active)

    Returns:
        List of templates in the category
    """
    templates = await template_repository.get_templates_by_category(
        workspace_id=workspace_id,
        category=category,
        status=template_status,
    )

    logger.debug(
        "Templates by category retrieved",
        extra={
            "category": category.value,
            "workspace_id": str(workspace_id),
            "count": len(templates),
        },
    )

    return templates


@router.get(
    "/channel/{channel}",
    response_model=list[TemplateSummary],
    summary="Get templates by channel",
    description="Get all templates supporting a specific channel.",
)
async def get_templates_by_channel(
    channel: NotificationChannel = Path(..., description="Notification channel"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    template_status: TemplateStatus = Query(TemplateStatus.ACTIVE, alias="status"),
) -> list[TemplateSummary]:
    """
    Get templates by channel.

    Returns all templates that support a specific notification channel.

    Args:
        channel: Notification channel
        workspace_id: Workspace ID from path
        current_user: Current authenticated user
        template_status: Status filter (default: active)

    Returns:
        List of templates supporting the channel
    """
    templates = await template_repository.get_templates_by_channel(
        workspace_id=workspace_id,
        channel=channel,
        status=template_status,
    )

    logger.debug(
        "Templates by channel retrieved",
        extra={
            "channel": channel.value,
            "workspace_id": str(workspace_id),
            "count": len(templates),
        },
    )

    return templates
