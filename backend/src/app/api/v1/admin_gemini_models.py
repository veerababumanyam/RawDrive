"""Admin Gemini Models API endpoints.

All routes prefixed with /api/v1/admin/gemini-models.
Requires admin authentication.
Feature: 003-user-gemini-settings
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.api.dependencies.auth import CurrentUserDep, require_platform_permission
from app.api.schemas import (
    ErrorResponse,
    GeminiModelAdmin,
    GeminiAdminStats,
    ModelDistribution,
    CreateGeminiModelRequest,
    UpdateGeminiModelRequest,
    ReorderGeminiModelsRequest,
)
from app.api.exceptions import AppError
from app.services.gemini_model_service import (
    get_gemini_model_service,
    GeminiModelService,
    GeminiModelNotFoundError,
    CannotDeleteDefaultModelError,
    CannotDeactivateDefaultModelError,
    CannotDeactivateLastModelError,
    DuplicateModelIdentifierError,
)
from app.services.audit_service import AuditService, AuditEventType
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/admin/gemini-models",
    tags=["admin-gemini-models"],
    dependencies=[Depends(require_platform_permission("admin"))],
)


def _get_gemini_model_service() -> GeminiModelService:
    return get_gemini_model_service()


GeminiModelServiceDep = Annotated[
    GeminiModelService, Depends(_get_gemini_model_service)
]


# ---------------------------------------------------------------------------
# Response Model List
# ---------------------------------------------------------------------------


class GeminiModelsAdminListResponse:
    """Response for admin model list."""

    def __init__(self, models: list[GeminiModelAdmin]):
        self.models = models


# ---------------------------------------------------------------------------
# Admin Gemini Models Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[GeminiModelAdmin],
    summary="List all Gemini models (admin)",
    description="List all models including inactive ones. Requires admin role.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "Admin role required"},
    },
)
async def list_all_models(
    current_user: CurrentUserDep,
    service: GeminiModelServiceDep,
    include_inactive: bool = True,
) -> list[GeminiModelAdmin]:
    """List all Gemini models for admin management.

    Returns all models including inactive ones, with user count for each.
    """
    models = await service.list_all_models(include_inactive=include_inactive)

    return [
        GeminiModelAdmin(
            model_id=m["model_id"],
            identifier=m["identifier"],
            display_name=m["display_name"],
            description=m.get("description"),
            is_default=m["is_default"],
            is_active=m["is_active"],
            sort_order=m["sort_order"],
            created_at=m["created_at"],
            updated_at=m["updated_at"],
            user_count=m.get("user_count", 0),
        )
        for m in models
    ]


@router.post(
    "",
    response_model=GeminiModelAdmin,
    status_code=status.HTTP_201_CREATED,
    summary="Create Gemini model",
    description="Add a new model to the catalogue. Requires admin role.",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "Admin role required"},
    },
)
async def create_model(
    current_user: CurrentUserDep,
    service: GeminiModelServiceDep,
    request: CreateGeminiModelRequest,
) -> GeminiModelAdmin:
    """Create a new Gemini model in the catalogue."""
    try:
        model = await service.create_model(
            identifier=request.identifier,
            display_name=request.display_name,
            description=request.description,
            sort_order=request.sort_order,
            is_active=request.is_active if request.is_active is not None else True,
            is_default=request.is_default if request.is_default is not None else False,
        )

        # Audit log
        await AuditService().log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            user_id=current_user.user_id,
            workspace_id=None,  # Admin action, no workspace context
            resource_type="gemini_model",
            resource_id=str(model["model_id"]),
            details={"action": "model_created", "identifier": request.identifier},
        )

        return _to_admin_model(model)

    except DuplicateModelIdentifierError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status,
        )


@router.get(
    "/stats",
    response_model=GeminiAdminStats,
    summary="Get Gemini usage statistics",
    description="Get aggregate statistics about user Gemini configurations. Requires admin role.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "Admin role required"},
    },
)
async def get_stats(
    current_user: CurrentUserDep,
    service: GeminiModelServiceDep,
    workspace_id: Optional[UUID] = None,
) -> GeminiAdminStats:
    """Get aggregate Gemini statistics for admin dashboard.

    Returns:
        - Total users in scope
        - Users with API key configured
        - Users with 'connected' vs 'validation_failed' status
        - Model distribution (how many users per model)
        - Recent AI call counts and success rates
    """
    stats = await service.get_admin_stats(workspace_id=workspace_id)

    return GeminiAdminStats(
        total_users=stats["total_users"],
        users_with_key=stats["users_with_key"],
        users_connected=stats["users_connected"],
        users_failed=stats["users_failed"],
        model_distribution=[
            ModelDistribution(
                model_identifier=d["model_identifier"],
                display_name=d["display_name"],
                user_count=d["user_count"],
            )
            for d in stats["model_distribution"]
        ],
        recent_ai_calls=stats["recent_ai_calls"],
        ai_success_rate=stats["ai_success_rate"],
    )


@router.get(
    "/{model_id}",
    response_model=GeminiModelAdmin,
    summary="Get Gemini model",
    description="Get a specific model by ID. Requires admin role.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "Admin role required"},
        404: {"model": ErrorResponse, "description": "Model not found"},
    },
)
async def get_model(
    current_user: CurrentUserDep,
    service: GeminiModelServiceDep,
    model_id: UUID,
) -> GeminiModelAdmin:
    """Get a specific Gemini model."""
    try:
        model = await service.get_model(model_id)
        return _to_admin_model(model)
    except GeminiModelNotFoundError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status,
        )


@router.patch(
    "/{model_id}",
    response_model=GeminiModelAdmin,
    summary="Update Gemini model",
    description="Update an existing model. Requires admin role.",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "Admin role required"},
        404: {"model": ErrorResponse, "description": "Model not found"},
    },
)
async def update_model(
    current_user: CurrentUserDep,
    service: GeminiModelServiceDep,
    model_id: UUID,
    request: UpdateGeminiModelRequest,
) -> GeminiModelAdmin:
    """Update a Gemini model."""
    try:
        model = await service.update_model(
            model_id=model_id,
            display_name=request.display_name,
            description=request.description,
            sort_order=request.sort_order,
            is_active=request.is_active,
            is_default=request.is_default,
        )

        # Audit log
        await AuditService().log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            user_id=current_user.user_id,
            workspace_id=None,
            resource_type="gemini_model",
            resource_id=str(model_id),
            details={"action": "model_updated"},
        )

        return _to_admin_model(model)

    except GeminiModelNotFoundError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status,
        )
    except (
        CannotDeactivateDefaultModelError,
        CannotDeactivateLastModelError,
    ) as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status,
        )


@router.delete(
    "/{model_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete Gemini model",
    description="Delete a model from the catalogue. Requires admin role. "
    "Users with this model selected will be migrated to the default model.",
    responses={
        400: {"model": ErrorResponse, "description": "Cannot delete default model"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "Admin role required"},
        404: {"model": ErrorResponse, "description": "Model not found"},
    },
)
async def delete_model(
    current_user: CurrentUserDep,
    service: GeminiModelServiceDep,
    model_id: UUID,
):
    """Delete a Gemini model."""
    try:
        await service.delete_model(model_id)

        # Audit log
        await AuditService().log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            user_id=current_user.user_id,
            workspace_id=None,
            resource_type="gemini_model",
            resource_id=str(model_id),
            details={"action": "model_deleted"},
        )

    except GeminiModelNotFoundError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status,
        )
    except CannotDeleteDefaultModelError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status,
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/reorder",
    response_model=list[GeminiModelAdmin],
    summary="Reorder Gemini models",
    description="Update model sort order. Requires admin role.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "Admin role required"},
    },
)
async def reorder_models(
    current_user: CurrentUserDep,
    service: GeminiModelServiceDep,
    request: ReorderGeminiModelsRequest,
) -> list[GeminiModelAdmin]:
    """Reorder models by providing list of model IDs in new order."""
    models = await service.reorder_models(request.model_ids)

    # Audit log
    await AuditService().log_event(
        event_type=AuditEventType.SETTINGS_CHANGED,
        user_id=current_user.user_id,
        workspace_id=None,
        resource_type="gemini_models",
        resource_id="reorder",
        details={"action": "models_reordered"},
    )

    return [_to_admin_model(m) for m in models]


@router.patch(
    "/{model_id}/default",
    response_model=GeminiModelAdmin,
    summary="Set default model",
    description="Set a model as the platform default. Requires admin role.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
        403: {"model": ErrorResponse, "description": "Admin role required"},
        404: {"model": ErrorResponse, "description": "Model not found"},
    },
)
async def set_default_model(
    current_user: CurrentUserDep,
    service: GeminiModelServiceDep,
    model_id: UUID,
) -> GeminiModelAdmin:
    """Set a model as the platform default."""
    try:
        model = await service.set_default_model(model_id)

        # Audit log
        await AuditService().log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            user_id=current_user.user_id,
            workspace_id=None,
            resource_type="gemini_model",
            resource_id=str(model_id),
            details={"action": "set_default"},
        )

        return _to_admin_model(model)

    except GeminiModelNotFoundError as e:
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_admin_model(model_dict: dict) -> GeminiModelAdmin:
    """Convert model dict to GeminiModelAdmin schema."""
    return GeminiModelAdmin(
        model_id=model_dict["model_id"],
        identifier=model_dict["identifier"],
        display_name=model_dict["display_name"],
        description=model_dict.get("description"),
        is_default=model_dict["is_default"],
        is_active=model_dict["is_active"],
        sort_order=model_dict["sort_order"],
        created_at=model_dict["created_at"],
        updated_at=model_dict["updated_at"],
        user_count=model_dict.get("user_count", 0),
    )
