"""Internationalization (i18n) API endpoints.

This module provides API endpoints for managing language preferences
and locale settings for users and workspaces.

Endpoints:
- GET /api/v1/i18n/languages - List all supported languages
- GET /api/v1/i18n/me/preferences - Get current user's language preferences
- PUT /api/v1/i18n/me/preferences/{context} - Update preference for a context
- DELETE /api/v1/i18n/me/preferences/{context} - Delete preference for a context
- GET /api/v1/i18n/me/locale - Get resolved locale for current user
- GET /api/v1/i18n/workspaces/{workspace_id}/preferences - Get workspace preferences
- PUT /api/v1/i18n/workspaces/{workspace_id}/preferences/{context} - Set workspace default

Feature: Localization & Regional Features
Task: T006 - Create i18n API endpoints (GET/PUT preferences, list languages)
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.exceptions import (
    AppError,
    InternalError,
    NotFoundError,
    ValidationAppError,
)
from app.api.schemas import (
    LanguageInfoResponse,
    LanguageListResponse,
    LanguagePreferenceResponse,
    MessageResponse,
    ResolvedLocaleResponse,
    SetLanguageRequest,
    UpdateLanguagePreferenceRequest,
    UserLanguagePreferencesResponse,
)
from app.models.language_preference import LanguageContext
from app.services.i18n_service import (
    I18nService,
    I18nServiceError,
    UnsupportedLanguageError,
    get_i18n_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/i18n", tags=["i18n"])


# =============================================================================
# SERVICE DEPENDENCY
# =============================================================================


def _get_i18n_service() -> I18nService:
    """Get the i18n service instance."""
    return get_i18n_service()


I18nServiceDep = Annotated[I18nService, Depends(_get_i18n_service)]


# =============================================================================
# PUBLIC ENDPOINTS (No Auth Required)
# =============================================================================


@router.get(
    "/languages",
    response_model=LanguageListResponse,
    summary="List supported languages",
    description="Get list of all supported languages with metadata including names, native names, and text direction.",
)
async def list_supported_languages(
    i18n_service: I18nServiceDep,
) -> LanguageListResponse:
    """List all supported languages.

    Returns all 13 supported languages (English + 12 Indian regional languages)
    with their names, native names, text direction, and optional flag emoji.

    No authentication required - this is a public endpoint.
    """
    try:
        languages = i18n_service.get_supported_languages()

        return LanguageListResponse(
            languages=[
                LanguageInfoResponse(
                    code=lang.code.value,
                    name=lang.name,
                    native_name=lang.native_name,
                    direction=lang.direction,
                    flag_emoji=lang.flag_emoji,
                )
                for lang in languages
            ],
            total=len(languages),
        )
    except Exception as e:
        logger.exception("Failed to list supported languages")
        raise InternalError("Failed to retrieve supported languages")


# =============================================================================
# USER PREFERENCE ENDPOINTS
# =============================================================================


@router.get(
    "/me/preferences",
    response_model=UserLanguagePreferencesResponse,
    summary="Get user language preferences",
    description="Get all language preferences for the current authenticated user, along with the resolved UI locale.",
)
async def get_user_preferences(
    current_user: CurrentUserDep,
    i18n_service: I18nServiceDep,
    workspace_id: Optional[UUID] = Query(
        None, description="Optional workspace ID to filter preferences"
    ),
    accept_language: Optional[str] = Header(
        None, alias="Accept-Language", description="Browser language header"
    ),
) -> UserLanguagePreferencesResponse:
    """Get current user's language preferences.

    Returns all stored preferences for the user, optionally filtered by workspace,
    plus the currently resolved UI locale.

    The resolved locale considers:
    1. User-specific preference for workspace+context (if workspace_id provided)
    2. User-level preference for context
    3. Workspace default (if workspace_id provided)
    4. Browser-detected language (from Accept-Language header)
    5. System default (English)
    """
    try:
        # Get stored preferences
        preferences = await i18n_service.get_user_preferences(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
        )

        # Resolve current UI locale
        resolved = await i18n_service.resolve_locale(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            context=LanguageContext.UI,
            accept_language=accept_language,
        )

        return UserLanguagePreferencesResponse(
            preferences=[
                LanguagePreferenceResponse(
                    preference_id=UUID(pref["preference_id"]),
                    context=pref["context"],
                    primary_language=pref["primary_language"],
                    fallback_language=pref["fallback_language"],
                    date_locale=pref.get("date_locale", "en-IN"),
                    number_locale=pref.get("number_locale", "en-IN"),
                    currency_code=pref.get("currency_code", "INR"),
                    timezone=pref.get("timezone", "Asia/Kolkata"),
                    source=pref["source"],
                    is_explicit=pref.get("is_explicit", False),
                    created_at=pref.get("created_at"),
                    updated_at=pref.get("updated_at"),
                )
                for pref in preferences
            ],
            resolved_ui_locale=ResolvedLocaleResponse(
                language=resolved.language.value,
                fallback=resolved.fallback.value,
                source=resolved.source.value,
                is_explicit=resolved.is_explicit,
                date_locale=resolved.date_locale,
                number_locale=resolved.number_locale,
                currency_code=resolved.currency_code,
                timezone=resolved.timezone,
                direction=resolved.direction,
            ),
        )

    except I18nServiceError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to get user language preferences")
        raise InternalError("Failed to retrieve language preferences")


@router.get(
    "/me/locale",
    response_model=ResolvedLocaleResponse,
    summary="Get resolved locale",
    description="Get the resolved locale for the current user following the priority hierarchy.",
)
async def get_resolved_locale(
    current_user: CurrentUserDep,
    i18n_service: I18nServiceDep,
    context: str = Query("ui", description="Context (ui, email, notification, etc.)"),
    workspace_id: Optional[UUID] = Query(None, description="Workspace context"),
    accept_language: Optional[str] = Header(
        None, alias="Accept-Language", description="Browser language header"
    ),
) -> ResolvedLocaleResponse:
    """Get the resolved locale for the current user.

    Resolves the effective language preference following priority:
    1. User-specific preference for workspace+context
    2. User-level preference for context
    3. Workspace default for context
    4. Browser-detected language (Accept-Language header)
    5. System default (English)
    """
    try:
        # Validate context
        try:
            lang_context = LanguageContext(context)
        except ValueError:
            valid_contexts = [c.value for c in LanguageContext]
            raise ValidationAppError(
                f"Invalid context '{context}'. Valid values: {valid_contexts}",
                field="context",
            )

        resolved = await i18n_service.resolve_locale(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            context=lang_context,
            accept_language=accept_language,
        )

        return ResolvedLocaleResponse(
            language=resolved.language.value,
            fallback=resolved.fallback.value,
            source=resolved.source.value,
            is_explicit=resolved.is_explicit,
            date_locale=resolved.date_locale,
            number_locale=resolved.number_locale,
            currency_code=resolved.currency_code,
            timezone=resolved.timezone,
            direction=resolved.direction,
        )

    except ValidationAppError:
        raise
    except I18nServiceError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to resolve locale")
        raise InternalError("Failed to resolve locale")


@router.put(
    "/me/preferences/{context}",
    response_model=LanguagePreferenceResponse,
    summary="Set language preference",
    description="Set or update the language preference for a specific context.",
)
async def set_user_preference(
    context: str,
    request: SetLanguageRequest,
    current_user: CurrentUserDep,
    i18n_service: I18nServiceDep,
    workspace_id: Optional[UUID] = Query(
        None, description="Optional workspace for workspace-specific preference"
    ),
) -> LanguagePreferenceResponse:
    """Set a user's language preference for a context.

    Creates or updates the language preference for the specified context.
    If workspace_id is provided, creates a workspace-specific preference.

    Supported contexts: ui, email, notification, invoice, gallery, invitation, report
    Supported languages: en, hi, te, ta, kn, ml, as, bn, gu, mr, or, pa, ur
    """
    try:
        # Validate context
        try:
            lang_context = LanguageContext(context)
        except ValueError:
            valid_contexts = [c.value for c in LanguageContext]
            raise ValidationAppError(
                f"Invalid context '{context}'. Valid values: {valid_contexts}",
                field="context",
            )

        # Set the language preference
        pref = await i18n_service.set_user_language(
            user_id=current_user.user_id,
            language=request.language,
            context=lang_context,
            workspace_id=workspace_id,
        )

        logger.info(
            "User language preference set",
            extra={
                "user_id": str(current_user.user_id),
                "context": context,
                "language": request.language,
                "workspace_id": str(workspace_id) if workspace_id else None,
            },
        )

        return LanguagePreferenceResponse(
            preference_id=UUID(pref["preference_id"]),
            context=pref["context"],
            primary_language=pref["primary_language"],
            fallback_language=pref["fallback_language"],
            date_locale=pref.get("date_locale", "en-IN"),
            number_locale=pref.get("number_locale", "en-IN"),
            currency_code=pref.get("currency_code", "INR"),
            timezone=pref.get("timezone", "Asia/Kolkata"),
            source=pref["source"],
            is_explicit=pref.get("is_explicit", True),
            created_at=pref.get("created_at"),
            updated_at=pref.get("updated_at"),
        )

    except ValidationAppError:
        raise
    except UnsupportedLanguageError as e:
        raise ValidationAppError(str(e), field="language")
    except I18nServiceError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to set user language preference")
        raise InternalError("Failed to set language preference")


@router.patch(
    "/me/preferences/{context}",
    response_model=LanguagePreferenceResponse,
    summary="Update language preference",
    description="Partially update language preference for a specific context.",
)
async def update_user_preference(
    context: str,
    request: UpdateLanguagePreferenceRequest,
    current_user: CurrentUserDep,
    i18n_service: I18nServiceDep,
    workspace_id: Optional[UUID] = Query(
        None, description="Optional workspace for workspace-specific preference"
    ),
) -> LanguagePreferenceResponse:
    """Update a user's language preference for a context.

    Partially updates the preference - only specified fields are changed.
    If the preference doesn't exist, creates one with the provided values.
    """
    try:
        # Validate context
        try:
            lang_context = LanguageContext(context)
        except ValueError:
            valid_contexts = [c.value for c in LanguageContext]
            raise ValidationAppError(
                f"Invalid context '{context}'. Valid values: {valid_contexts}",
                field="context",
            )

        # Validate primary_language if provided
        if request.primary_language:
            try:
                i18n_service.validate_language(request.primary_language)
            except UnsupportedLanguageError as e:
                raise ValidationAppError(str(e), field="primary_language")

        # Validate fallback_language if provided
        if request.fallback_language:
            try:
                i18n_service.validate_language(request.fallback_language)
            except UnsupportedLanguageError as e:
                raise ValidationAppError(str(e), field="fallback_language")

        # Get existing preference or create new one
        preferences = await i18n_service.get_user_preferences(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
        )

        existing = next(
            (p for p in preferences if p["context"] == context),
            None,
        )

        # Build update data
        language = request.primary_language or (
            existing["primary_language"] if existing else "en"
        )

        # Use service to create/update
        pref = await i18n_service.set_user_language(
            user_id=current_user.user_id,
            language=language,
            context=lang_context,
            workspace_id=workspace_id,
        )

        # Note: Additional fields (date_locale, number_locale, etc.) would need
        # repository-level updates. For MVP, we update primary language through service.

        logger.info(
            "User language preference updated",
            extra={
                "user_id": str(current_user.user_id),
                "context": context,
                "workspace_id": str(workspace_id) if workspace_id else None,
            },
        )

        return LanguagePreferenceResponse(
            preference_id=UUID(pref["preference_id"]),
            context=pref["context"],
            primary_language=pref["primary_language"],
            fallback_language=pref["fallback_language"],
            date_locale=pref.get("date_locale", "en-IN"),
            number_locale=pref.get("number_locale", "en-IN"),
            currency_code=pref.get("currency_code", "INR"),
            timezone=pref.get("timezone", "Asia/Kolkata"),
            source=pref["source"],
            is_explicit=pref.get("is_explicit", True),
            created_at=pref.get("created_at"),
            updated_at=pref.get("updated_at"),
        )

    except ValidationAppError:
        raise
    except I18nServiceError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to update user language preference")
        raise InternalError("Failed to update language preference")


@router.delete(
    "/me/preferences/{context}",
    response_model=MessageResponse,
    summary="Delete language preference",
    description="Delete a user's language preference for a specific context, reverting to default.",
)
async def delete_user_preference(
    context: str,
    current_user: CurrentUserDep,
    i18n_service: I18nServiceDep,
    workspace_id: Optional[UUID] = Query(
        None, description="Optional workspace for workspace-specific deletion"
    ),
) -> MessageResponse:
    """Delete a user's language preference for a context.

    Removes the stored preference, causing the system to fall back to
    the next level in the preference hierarchy.
    """
    try:
        # Validate context
        try:
            lang_context = LanguageContext(context)
        except ValueError:
            valid_contexts = [c.value for c in LanguageContext]
            raise ValidationAppError(
                f"Invalid context '{context}'. Valid values: {valid_contexts}",
                field="context",
            )

        deleted = await i18n_service.delete_user_preference(
            user_id=current_user.user_id,
            context=lang_context,
            workspace_id=workspace_id,
        )

        if not deleted:
            raise NotFoundError("Language preference", f"{context}")

        logger.info(
            "User language preference deleted",
            extra={
                "user_id": str(current_user.user_id),
                "context": context,
                "workspace_id": str(workspace_id) if workspace_id else None,
            },
        )

        return MessageResponse(
            message=f"Language preference for '{context}' deleted successfully",
            success=True,
        )

    except ValidationAppError:
        raise
    except NotFoundError:
        raise
    except I18nServiceError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to delete user language preference")
        raise InternalError("Failed to delete language preference")


# =============================================================================
# WORKSPACE PREFERENCE ENDPOINTS
# =============================================================================


@router.get(
    "/workspaces/{workspace_id}/preferences",
    response_model=list[LanguagePreferenceResponse],
    summary="Get workspace language defaults",
    description="Get the default language preferences for a workspace.",
)
async def get_workspace_preferences(
    workspace_id: UUID,
    workspace_access: WorkspaceAccessDep,
    i18n_service: I18nServiceDep,
) -> list[LanguagePreferenceResponse]:
    """Get workspace default language preferences.

    Returns all stored default preferences for the workspace.
    Requires workspace membership.
    """
    try:
        # The WorkspaceAccessDep already validates access
        preferences = await i18n_service.repository.list_by_workspace_id(
            workspace_id=workspace_id,
            include_user_preferences=False,  # Only workspace defaults
            active_only=True,
        )

        return [
            LanguagePreferenceResponse(
                preference_id=UUID(pref["preference_id"]),
                context=pref["context"],
                primary_language=pref["primary_language"],
                fallback_language=pref["fallback_language"],
                date_locale=pref.get("date_locale", "en-IN"),
                number_locale=pref.get("number_locale", "en-IN"),
                currency_code=pref.get("currency_code", "INR"),
                timezone=pref.get("timezone", "Asia/Kolkata"),
                source=pref["source"],
                is_explicit=pref.get("is_explicit", True),
                created_at=pref.get("created_at"),
                updated_at=pref.get("updated_at"),
            )
            for pref in preferences
        ]

    except I18nServiceError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to get workspace language preferences")
        raise InternalError("Failed to retrieve workspace language preferences")


@router.put(
    "/workspaces/{workspace_id}/preferences/{context}",
    response_model=LanguagePreferenceResponse,
    summary="Set workspace language default",
    description="Set the default language preference for a workspace context.",
)
async def set_workspace_preference(
    workspace_id: UUID,
    context: str,
    request: SetLanguageRequest,
    workspace_access: WorkspaceAccessDep,
    i18n_service: I18nServiceDep,
) -> LanguagePreferenceResponse:
    """Set a workspace's default language preference for a context.

    Creates or updates the default language preference for the workspace.
    This affects all users in the workspace who haven't set their own preference.

    Requires workspace membership (typically admin/owner for settings changes).
    """
    try:
        # Validate context
        try:
            lang_context = LanguageContext(context)
        except ValueError:
            valid_contexts = [c.value for c in LanguageContext]
            raise ValidationAppError(
                f"Invalid context '{context}'. Valid values: {valid_contexts}",
                field="context",
            )

        # Set workspace language preference
        pref = await i18n_service.set_workspace_language(
            workspace_id=workspace_id,
            language=request.language,
            context=lang_context,
        )

        current_user, _ = workspace_access
        logger.info(
            "Workspace language preference set",
            extra={
                "workspace_id": str(workspace_id),
                "context": context,
                "language": request.language,
                "set_by_user_id": str(current_user.user_id),
            },
        )

        return LanguagePreferenceResponse(
            preference_id=UUID(pref["preference_id"]),
            context=pref["context"],
            primary_language=pref["primary_language"],
            fallback_language=pref["fallback_language"],
            date_locale=pref.get("date_locale", "en-IN"),
            number_locale=pref.get("number_locale", "en-IN"),
            currency_code=pref.get("currency_code", "INR"),
            timezone=pref.get("timezone", "Asia/Kolkata"),
            source=pref["source"],
            is_explicit=pref.get("is_explicit", True),
            created_at=pref.get("created_at"),
            updated_at=pref.get("updated_at"),
        )

    except ValidationAppError:
        raise
    except UnsupportedLanguageError as e:
        raise ValidationAppError(str(e), field="language")
    except I18nServiceError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to set workspace language preference")
        raise InternalError("Failed to set workspace language preference")


# =============================================================================
# ADMIN/ANALYTICS ENDPOINTS
# =============================================================================


@router.get(
    "/stats",
    response_model=dict,
    summary="Get language usage statistics",
    description="Get statistics on language usage across the platform.",
    include_in_schema=False,  # Admin endpoint, hidden from public docs
)
async def get_language_stats(
    current_user: CurrentUserDep,
    i18n_service: I18nServiceDep,
) -> dict:
    """Get language usage statistics.

    Returns counts of users by preferred language.
    This is an admin/analytics endpoint.
    """
    try:
        # Note: In production, this should check for admin permissions
        stats = await i18n_service.get_language_usage_stats()

        return {
            "language_distribution": stats,
            "total_preferences": sum(stats.values()),
        }

    except I18nServiceError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to get language statistics")
        raise InternalError("Failed to retrieve language statistics")
