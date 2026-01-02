"""Gemini Settings API endpoints.

All routes prefixed with /api/v1/users/me/gemini-settings.
Feature: 003-user-gemini-settings
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.dependencies.auth import CurrentUserDep
from app.api.schemas import (
    ErrorResponse,
    GeminiValidationError,
    KeyValidationResult,
    UpdateGeminiSettingsRequest,
    UserGeminiSettingsResponse,
    ValidateGeminiKeyRequest,
    GeminiModelPublic,
    GeminiModelsListResponse,
    AIFeatureToggles,
    AIFeatureTogglesResponse,
    UpdateAIFeatureTogglesRequest,
)
from app.api.exceptions import AppError
from app.services.gemini_settings_service import (
    get_gemini_settings_service,
    GeminiSettingsService,
    GeminiValidationFailedError,
    GeminiModelNotFoundError,
)
from app.services.audit_service import AuditService, AuditEventType
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/users/me/gemini-settings",
    tags=["gemini-settings"],
)


def _get_gemini_settings_service() -> GeminiSettingsService:
    return get_gemini_settings_service()


GeminiSettingsServiceDep = Annotated[
    GeminiSettingsService, Depends(_get_gemini_settings_service)
]


async def _get_user_workspace_id(user_id: UUID) -> UUID:
    """Get the user's primary workspace ID for encryption key derivation."""
    pool = await get_postgres_pool()
    workspace_id = await pool.fetchval(
        """
        SELECT workspace_id FROM workspace_memberships
        WHERE user_id = $1
        ORDER BY created_at ASC
        LIMIT 1
        """,
        user_id,
    )
    if not workspace_id:
        raise AppError(
            message="User has no workspace",
            code="NO_WORKSPACE",
            status_code=400,
        )
    return workspace_id


# ---------------------------------------------------------------------------
# User Gemini Settings Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=UserGeminiSettingsResponse,
    summary="Get Gemini settings",
    description="Get the current user's Gemini API key and model settings.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
    },
)
async def get_gemini_settings(
    current_user: CurrentUserDep,
    service: GeminiSettingsServiceDep,
) -> UserGeminiSettingsResponse:
    """Get current user's Gemini settings.

    Returns status, masked API key (if configured), selected model,
    and effective model (selected or platform default).
    """
    workspace_id = await _get_user_workspace_id(current_user.user_id)
    settings = await service.get_user_settings(current_user.user_id, workspace_id)

    return UserGeminiSettingsResponse(
        status=settings["status"],
        has_api_key=settings["has_api_key"],
        api_key_masked=settings["api_key_masked"],
        selected_model=_to_model_public(settings["selected_model"]),
        effective_model=_to_model_public(settings["effective_model"]),
        last_validated_at=settings["last_validated_at"],
        validation_error=settings["validation_error"],
    )


@router.put(
    "",
    response_model=UserGeminiSettingsResponse,
    summary="Update Gemini settings",
    description="Update the current user's Gemini API key and/or model selection. "
    "If an API key is provided, it will be validated before saving.",
    responses={
        400: {"model": ErrorResponse, "description": "Validation failed"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "Model not found"},
    },
)
async def update_gemini_settings(
    current_user: CurrentUserDep,
    service: GeminiSettingsServiceDep,
    request: UpdateGeminiSettingsRequest,
) -> UserGeminiSettingsResponse:
    """Update user's Gemini settings.

    - If `api_key` is provided, it will be validated with Gemini API before saving
    - If `selected_model_id` is provided, it must be an active model
    - Set `selected_model_id` to null to use platform default
    """
    workspace_id = await _get_user_workspace_id(current_user.user_id)

    try:
        settings = await service.create_or_update_settings(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            api_key=request.api_key,
            selected_model_id=request.selected_model_id,
        )

        # Audit log for security
        if request.api_key:
            await AuditService().log_event(
                event_type=AuditEventType.SETTINGS_CHANGED,
                actor_user_id=current_user.user_id,
                workspace_id=workspace_id,
                target_entity_type="gemini_settings",
                target_entity_id=current_user.user_id,
                details={"action": "api_key_updated"},
            )

        return UserGeminiSettingsResponse(
            status=settings["status"],
            has_api_key=settings["has_api_key"],
            api_key_masked=settings["api_key_masked"],
            selected_model=_to_model_public(settings["selected_model"]),
            effective_model=_to_model_public(settings["effective_model"]),
            last_validated_at=settings["last_validated_at"],
            validation_error=settings["validation_error"],
        )

    except GeminiValidationFailedError as e:
        raise AppError(
            message=e.args[0],
            code=e.code,
            status_code=400,
            details={
                "error": e.code,
                "message": e.args[0],
                "hint": e.hint,
            },
        )
    except GeminiModelNotFoundError as e:
        raise AppError(
            message=e.args[0],
            code=e.code,
            status_code=404,
        )


@router.post(
    "/validate",
    response_model=KeyValidationResult,
    summary="Validate Gemini API key",
    description="Validate a Gemini API key without saving it. "
    "Use this to check a key before updating settings.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
    },
)
async def validate_gemini_key(
    current_user: CurrentUserDep,
    service: GeminiSettingsServiceDep,
    request: ValidateGeminiKeyRequest,
) -> KeyValidationResult:
    """Validate a Gemini API key without saving.

    Returns validation result with:
    - `valid`: Whether the key is valid
    - `error`: Error details if validation failed
    - `available_models`: List of models available with this key
    """
    result = await service.validate_api_key(request.api_key)

    if result.is_valid:
        return KeyValidationResult(
            valid=True,
            error=None,
            available_models=result.available_models,
        )

    return KeyValidationResult(
        valid=False,
        error=GeminiValidationError(
            error=result.error_code or "UNKNOWN_ERROR",
            message=result.error_message or "Validation failed",
            hint=result.error_hint,
        ),
        available_models=None,
    )


@router.delete(
    "",
    response_model=UserGeminiSettingsResponse,
    summary="Revoke Gemini API key",
    description="Revoke the current user's Gemini API key. "
    "This removes the stored key but preserves model selection preference.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
    },
)
async def revoke_gemini_key(
    current_user: CurrentUserDep,
    service: GeminiSettingsServiceDep,
) -> UserGeminiSettingsResponse:
    """Revoke user's Gemini API key.

    - Clears the encrypted API key
    - Sets status to 'not_configured'
    - Preserves model selection preference for when key is re-added
    """
    workspace_id = await _get_user_workspace_id(current_user.user_id)

    settings = await service.revoke_api_key(current_user.user_id, workspace_id)

    # Audit log for security
    await AuditService().log_event(
        event_type=AuditEventType.SETTINGS_CHANGED,
        actor_user_id=current_user.user_id,
        workspace_id=workspace_id,
        target_entity_type="gemini_settings",
        target_entity_id=current_user.user_id,
        details={"action": "api_key_revoked"},
    )

    return UserGeminiSettingsResponse(
        status=settings["status"],
        has_api_key=settings["has_api_key"],
        api_key_masked=settings["api_key_masked"],
        selected_model=_to_model_public(settings["selected_model"]),
        effective_model=_to_model_public(settings["effective_model"]),
        last_validated_at=settings["last_validated_at"],
        validation_error=settings["validation_error"],
    )


# ---------------------------------------------------------------------------
# AI Feature Toggles (T080)
# ---------------------------------------------------------------------------


@router.get(
    "/feature-toggles",
    response_model=AIFeatureTogglesResponse,
    summary="Get AI feature toggles",
    description="Get the current user's AI feature toggle settings.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
    },
)
async def get_feature_toggles(
    current_user: CurrentUserDep,
    service: GeminiSettingsServiceDep,
) -> AIFeatureTogglesResponse:
    """Get user's AI feature toggle settings.

    Returns which AI features are enabled/disabled for this user,
    along with their API key configuration status.
    """
    settings = await service.get_feature_toggles(current_user.user_id)

    return AIFeatureTogglesResponse(
        toggles=AIFeatureToggles(
            photo_analysis=settings["toggles"]["photo_analysis"],
            captions=settings["toggles"]["captions"],
            hashtags=settings["toggles"]["hashtags"],
            gallery_story=settings["toggles"]["gallery_story"],
            smart_curation=settings["toggles"]["smart_curation"],
        ),
        has_api_key=settings["has_api_key"],
        api_status=settings["api_status"],
    )


@router.patch(
    "/feature-toggles",
    response_model=AIFeatureTogglesResponse,
    summary="Update AI feature toggles",
    description="Update the current user's AI feature toggle settings. "
    "Only non-null values are updated.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
    },
)
async def update_feature_toggles(
    current_user: CurrentUserDep,
    service: GeminiSettingsServiceDep,
    request: UpdateAIFeatureTogglesRequest,
) -> AIFeatureTogglesResponse:
    """Update user's AI feature toggle settings.

    - Only non-null values in the request are updated
    - Features default to enabled (True) if not previously set
    - Changes take effect immediately
    """
    toggles = {}
    if request.photo_analysis is not None:
        toggles["photo_analysis"] = request.photo_analysis
    if request.captions is not None:
        toggles["captions"] = request.captions
    if request.hashtags is not None:
        toggles["hashtags"] = request.hashtags
    if request.gallery_story is not None:
        toggles["gallery_story"] = request.gallery_story
    if request.smart_curation is not None:
        toggles["smart_curation"] = request.smart_curation

    settings = await service.update_feature_toggles(
        user_id=current_user.user_id,
        toggles=toggles,
    )

    # Audit log for settings change
    await AuditService().log_event(
        event_type=AuditEventType.SETTINGS_CHANGED,
        actor_user_id=current_user.user_id,
        workspace_id=await _get_user_workspace_id(current_user.user_id),
        target_entity_type="ai_feature_toggles",
        target_entity_id=current_user.user_id,
        details={"updated_toggles": toggles},
    )

    return AIFeatureTogglesResponse(
        toggles=AIFeatureToggles(
            photo_analysis=settings["toggles"]["photo_analysis"],
            captions=settings["toggles"]["captions"],
            hashtags=settings["toggles"]["hashtags"],
            gallery_story=settings["toggles"]["gallery_story"],
            smart_curation=settings["toggles"]["smart_curation"],
        ),
        has_api_key=settings["has_api_key"],
        api_status=settings["api_status"],
    )


# ---------------------------------------------------------------------------
# Models Catalogue Router (T023)
# ---------------------------------------------------------------------------

models_router = APIRouter(
    prefix="/api/v1/gemini-models",
    tags=["gemini-models"],
)


@models_router.get(
    "",
    response_model=GeminiModelsListResponse,
    summary="List available Gemini models",
    description="Get all active Gemini models from the admin-managed catalogue. "
    "Models are sorted by default status first, then by sort order.",
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
    },
)
async def list_gemini_models(
    current_user: CurrentUserDep,
    service: GeminiSettingsServiceDep,
) -> GeminiModelsListResponse:
    """List available Gemini models for selection.

    Returns active models sorted by:
    1. Default model first
    2. Admin-defined sort order
    3. Display name alphabetically

    Includes description and capabilities for each model.
    """
    models = await service.get_active_models()

    return GeminiModelsListResponse(
        models=[
            GeminiModelPublic(
                model_id=m["model_id"],
                identifier=m["identifier"],
                display_name=m["display_name"],
                description=m.get("description"),
                capabilities=m.get("capabilities"),
                is_default=m["is_default"],
            )
            for m in models
        ]
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_model_public(model_dict: Optional[dict]) -> Optional[GeminiModelPublic]:
    """Convert model dict to GeminiModelPublic schema."""
    if not model_dict:
        return None
    return GeminiModelPublic(
        model_id=model_dict["model_id"],
        identifier=model_dict["identifier"],
        display_name=model_dict["display_name"],
        is_default=model_dict.get("is_default", False),
    )
