"""Preferences API endpoints for the Notifications & Communication Microservice.

This module provides REST API endpoints for:
- Managing user notification preferences
- Managing workspace default preferences
- Toggling channels and categories
- Quiet hours and digest configuration
- Unsubscribe/resubscribe workflows
- Bulk preference operations
- Export/import for data portability

All endpoints require JWT authentication and enforce workspace isolation.

Feature: Notifications & Communication Microservice
Task: T027 - Create preferences API router
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from src.log_config import get_logger
from src.middleware.auth import JWTPayload, get_current_user
from src.schemas.notification import NotificationCategory, NotificationChannel, ErrorResponse
from src.schemas.preference import (
    BulkPreferenceUpdateRequest,
    BulkPreferenceUpdateResponse,
    CategoryPreferenceUpdateRequest,
    ChannelToggleRequest,
    DigestSchedule,
    MergedPreferences,
    PreferenceCreateRequest,
    PreferenceExport,
    PreferenceImportRequest,
    PreferenceListResponse,
    PreferenceResponse,
    PreferenceUpdateRequest,
    PreferenceUpdateSource,
    QuietHoursConfig,
    ResubscribeRequest,
    UnsubscribeRequest,
)
from src.services.preference_service import (
    InvalidUnsubscribeTokenError,
    PreferenceAlreadyExistsError,
    PreferenceNotFoundError,
    PreferenceServiceError,
    PreferenceValidationError,
    preference_service,
)

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
    prefix="/api/v1/workspaces/{workspace_id}/preferences",
    tags=["preferences"],
)


# =============================================================================
# User Preferences - Current User
# =============================================================================


@router.get(
    "/me",
    response_model=PreferenceResponse,
    summary="Get my preferences",
    description="Get notification preferences for the current authenticated user.",
)
async def get_my_preferences(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Get notification preferences for the current user.

    Returns the user's preferences or creates them from workspace defaults
    if not yet configured.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: User's notification preferences
    """
    user_id = UUID(current_user.user_id)

    preference = await preference_service.get_or_create_user_preference(
        workspace_id=workspace_id,
        user_id=user_id,
    )

    logger.debug(
        "Retrieved user preferences",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "preference_id": str(preference.preference_id),
        },
    )

    return preference


@router.get(
    "/me/effective",
    response_model=MergedPreferences,
    summary="Get my effective preferences",
    description="Get effective preferences merged from user settings and workspace defaults.",
)
async def get_my_effective_preferences(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> MergedPreferences:
    """
    Get effective preferences for the current user.

    Returns preferences merged from user-specific settings and workspace
    defaults, with user settings taking precedence.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        MergedPreferences: Merged effective preferences
    """
    user_id = UUID(current_user.user_id)

    merged = await preference_service.get_effective_preferences(
        workspace_id=workspace_id,
        user_id=user_id,
    )

    logger.debug(
        "Retrieved effective preferences",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "using_defaults": merged.is_using_defaults,
        },
    )

    return merged


@router.patch(
    "/me",
    response_model=PreferenceResponse,
    summary="Update my preferences",
    description="Update notification preferences for the current user.",
)
async def update_my_preferences(
    request: PreferenceUpdateRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Update notification preferences for the current user.

    Only provided fields are updated. Omitted fields remain unchanged.

    Args:
        request: Preference update request
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: Updated preferences

    Raises:
        HTTPException: 400 for validation errors
    """
    user_id = UUID(current_user.user_id)

    try:
        updated = await preference_service.update_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
            request=request,
            update_source=PreferenceUpdateSource.USER,
        )

        logger.info(
            "Updated user preferences",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
                "preference_id": str(updated.preference_id),
            },
        )

        return updated

    except PreferenceValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )
    except PreferenceServiceError as e:
        logger.error(
            "Preference update failed",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
                "error_code": e.code,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )


# =============================================================================
# Channel Toggles
# =============================================================================


@router.put(
    "/me/channels/{channel}",
    response_model=PreferenceResponse,
    summary="Toggle notification channel",
    description="Enable or disable a specific notification channel.",
)
async def toggle_channel(
    request: ChannelToggleRequest,
    channel: NotificationChannel = Path(..., description="Channel to toggle"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Toggle a notification channel on or off.

    Args:
        request: Toggle request with enabled flag
        channel: Channel to toggle (email, sms, in_app, push)
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: Updated preferences
    """
    user_id = UUID(current_user.user_id)

    updated = await preference_service.toggle_channel(
        workspace_id=workspace_id,
        user_id=user_id,
        channel=channel,
        enabled=request.enabled,
        update_source=PreferenceUpdateSource.USER,
    )

    logger.info(
        f"Toggled channel {channel.value} to {request.enabled}",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "channel": channel.value,
            "enabled": request.enabled,
        },
    )

    return updated


# =============================================================================
# Category Toggles
# =============================================================================


@router.put(
    "/me/categories/{category}",
    response_model=PreferenceResponse,
    summary="Toggle notification category",
    description="Enable or disable a specific notification category.",
)
async def toggle_category(
    request: CategoryPreferenceUpdateRequest,
    category: NotificationCategory = Path(..., description="Category to toggle"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Toggle a notification category on or off.

    Protected categories (billing, system_alerts) cannot be fully disabled.

    Args:
        request: Category preference update
        category: Category to toggle
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: Updated preferences

    Raises:
        HTTPException: 400 if trying to disable a protected category
    """
    user_id = UUID(current_user.user_id)

    try:
        # If enabled field is provided, toggle the category
        if request.enabled is not None:
            updated = await preference_service.toggle_category(
                workspace_id=workspace_id,
                user_id=user_id,
                category=category,
                enabled=request.enabled,
                update_source=PreferenceUpdateSource.USER,
            )
        else:
            # Update other category settings (channels, frequency)
            # Build the update request with just this category
            update_req = _build_category_update_request(category, request)
            updated = await preference_service.update_user_preference(
                workspace_id=workspace_id,
                user_id=user_id,
                request=update_req,
                update_source=PreferenceUpdateSource.USER,
            )

        logger.info(
            f"Updated category {category.value} preferences",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
                "category": category.value,
            },
        )

        return updated

    except PreferenceValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )


def _build_category_update_request(
    category: NotificationCategory,
    update: CategoryPreferenceUpdateRequest,
) -> PreferenceUpdateRequest:
    """Build a PreferenceUpdateRequest for a single category update."""
    from src.schemas.preference import CategoryPreference, DigestFrequency

    # Create a CategoryPreference with the provided fields or sensible defaults
    cat_pref = CategoryPreference(
        enabled=update.enabled if update.enabled is not None else True,
        channels=update.channels if update.channels is not None else [],
        frequency=update.frequency if update.frequency is not None else DigestFrequency.INSTANT,
    )

    # Map category to the correct field
    category_map = {
        NotificationCategory.GALLERY_ACTIVITY: "gallery_activity",
        NotificationCategory.CLIENT_INTERACTIONS: "client_interactions",
        NotificationCategory.SYSTEM_ALERTS: "system_alerts",
        NotificationCategory.BILLING: "billing",
        NotificationCategory.MARKETING: "marketing",
        NotificationCategory.INVITATION: "invitation",
    }

    field_name = category_map.get(category)
    if not field_name:
        raise ValueError(f"Unknown category: {category}")

    return PreferenceUpdateRequest(**{field_name: cat_pref})


# =============================================================================
# Quiet Hours
# =============================================================================


@router.put(
    "/me/quiet-hours",
    response_model=PreferenceResponse,
    summary="Update quiet hours",
    description="Configure Do-Not-Disturb / quiet hours settings.",
)
async def update_quiet_hours(
    request: QuietHoursConfig,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Update quiet hours configuration.

    When quiet hours are enabled, non-urgent notifications are held
    until quiet hours end.

    Args:
        request: Quiet hours configuration
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: Updated preferences
    """
    user_id = UUID(current_user.user_id)

    try:
        updated = await preference_service.update_quiet_hours(
            workspace_id=workspace_id,
            user_id=user_id,
            quiet_hours=request,
            update_source=PreferenceUpdateSource.USER,
        )

        logger.info(
            "Updated quiet hours",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": current_user.user_id,
                "enabled": request.enabled,
            },
        )

        return updated

    except PreferenceValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )


# =============================================================================
# Digest Schedule
# =============================================================================


@router.put(
    "/me/digest-schedule",
    response_model=PreferenceResponse,
    summary="Update digest schedule",
    description="Configure when daily and weekly digests are delivered.",
)
async def update_digest_schedule(
    request: DigestSchedule,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Update digest delivery schedule.

    Controls when daily and weekly notification digests are sent.

    Args:
        request: Digest schedule configuration
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: Updated preferences
    """
    user_id = UUID(current_user.user_id)

    updated = await preference_service.update_digest_schedule(
        workspace_id=workspace_id,
        user_id=user_id,
        digest_schedule=request,
        update_source=PreferenceUpdateSource.USER,
    )

    logger.info(
        "Updated digest schedule",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "daily_time": str(request.daily_digest_time),
            "weekly_day": request.weekly_digest_day.value,
        },
    )

    return updated


# =============================================================================
# Unsubscribe / Resubscribe
# =============================================================================


@router.post(
    "/unsubscribe",
    response_model=PreferenceResponse,
    summary="Process unsubscribe",
    description="Process an unsubscribe request from an email link.",
)
async def process_unsubscribe(
    request: UnsubscribeRequest,
) -> PreferenceResponse:
    """
    Process an unsubscribe request.

    This endpoint does not require authentication as it's accessed
    via email unsubscribe links with a secure token.

    Can unsubscribe from:
    - A specific category (e.g., marketing)
    - All notifications (global unsubscribe)

    Args:
        request: Unsubscribe request with token

    Returns:
        PreferenceResponse: Updated preferences

    Raises:
        HTTPException: 400 if token is invalid
    """
    try:
        updated = await preference_service.process_unsubscribe(request)

        logger.info(
            "Processed unsubscribe",
            extra={
                "category": request.category.value if request.category else "global",
                "reason": request.reason,
            },
        )

        return updated

    except InvalidUnsubscribeTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )


@router.post(
    "/me/resubscribe",
    response_model=PreferenceResponse,
    summary="Resubscribe to notifications",
    description="Resubscribe to notifications after unsubscribing.",
)
async def process_resubscribe(
    request: ResubscribeRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Resubscribe to notifications.

    Clears global unsubscribe and optionally enables specific categories.

    Args:
        request: Resubscribe request with optional category list
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: Updated preferences
    """
    user_id = UUID(current_user.user_id)

    updated = await preference_service.process_resubscribe(
        workspace_id=workspace_id,
        user_id=user_id,
        request=request,
        update_source=PreferenceUpdateSource.USER,
    )

    logger.info(
        "Processed resubscribe",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "categories": [c.value for c in request.categories] if request.categories else "all",
        },
    )

    return updated


@router.put(
    "/me/global-unsubscribe",
    response_model=PreferenceResponse,
    summary="Set global unsubscribe",
    description="Set or clear global unsubscribe status.",
)
async def set_global_unsubscribe(
    unsubscribe: bool = Query(..., description="Whether to globally unsubscribe"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Set or clear global unsubscribe status.

    When globally unsubscribed, only transactional notifications are sent.

    Args:
        unsubscribe: Whether to globally unsubscribe
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: Updated preferences
    """
    user_id = UUID(current_user.user_id)

    updated = await preference_service.set_global_unsubscribe(
        workspace_id=workspace_id,
        user_id=user_id,
        unsubscribe=unsubscribe,
        update_source=PreferenceUpdateSource.USER,
    )

    logger.info(
        f"Set global unsubscribe to {unsubscribe}",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
        },
    )

    return updated


# =============================================================================
# Export / Import (GDPR Data Portability)
# =============================================================================


@router.get(
    "/me/export",
    response_model=PreferenceExport,
    summary="Export my preferences",
    description="Export notification preferences for data portability (GDPR).",
)
async def export_preferences(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceExport:
    """
    Export notification preferences.

    Provides all preference data in a portable format for GDPR compliance.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceExport: Exportable preference data
    """
    user_id = UUID(current_user.user_id)

    export_data = await preference_service.export_preferences(
        workspace_id=workspace_id,
        user_id=user_id,
    )

    logger.info(
        "Exported user preferences",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
        },
    )

    return export_data


@router.post(
    "/me/import",
    response_model=PreferenceResponse,
    summary="Import preferences",
    description="Import notification preferences from export data.",
)
async def import_preferences(
    request: PreferenceImportRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Import notification preferences.

    Imports preferences from previously exported data. Can optionally
    overwrite existing preferences.

    Args:
        request: Import request with preference data
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: Imported preferences
    """
    user_id = UUID(current_user.user_id)

    imported = await preference_service.import_preferences(
        workspace_id=workspace_id,
        user_id=user_id,
        request=request,
        update_source=PreferenceUpdateSource.API,
    )

    logger.info(
        "Imported user preferences",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": current_user.user_id,
            "overwrite": request.overwrite,
        },
    )

    return imported


# =============================================================================
# Workspace Defaults (Admin Only)
# =============================================================================


@router.get(
    "/defaults",
    response_model=PreferenceResponse,
    summary="Get workspace defaults",
    description="Get workspace default notification preferences.",
)
async def get_workspace_defaults(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> PreferenceResponse:
    """
    Get workspace default preferences.

    New users inherit these defaults when they first configure preferences.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated user

    Returns:
        PreferenceResponse: Workspace default preferences

    Raises:
        HTTPException: 404 if no defaults configured
    """
    defaults = await preference_service.get_workspace_defaults(workspace_id)

    if not defaults:
        # Create and return system defaults
        defaults = await preference_service.create_workspace_defaults(workspace_id)

    logger.debug(
        "Retrieved workspace defaults",
        extra={
            "workspace_id": str(workspace_id),
            "preference_id": str(defaults.preference_id),
        },
    )

    return defaults


@router.put(
    "/defaults",
    response_model=PreferenceResponse,
    summary="Update workspace defaults",
    description="Update workspace default notification preferences (admin only).",
)
async def update_workspace_defaults(
    request: PreferenceUpdateRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
) -> PreferenceResponse:
    """
    Update workspace default preferences.

    Only admins/owners can update workspace defaults. These defaults
    are inherited by new users.

    Args:
        request: Preference update request
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user

    Returns:
        PreferenceResponse: Updated workspace defaults
    """
    try:
        # Get or create workspace defaults
        defaults = await preference_service.get_workspace_defaults(workspace_id)

        if not defaults:
            # Create with the request values
            defaults = await preference_service.create_workspace_defaults(
                workspace_id=workspace_id,
                request=PreferenceCreateRequest(
                    user_id=None,  # Workspace defaults
                    email_enabled=request.email_enabled if request.email_enabled is not None else True,
                    sms_enabled=request.sms_enabled if request.sms_enabled is not None else False,
                    in_app_enabled=request.in_app_enabled if request.in_app_enabled is not None else True,
                    push_enabled=request.push_enabled if request.push_enabled is not None else True,
                ),
            )

        # Update the defaults
        updated = await preference_service.update_preference(
            workspace_id=workspace_id,
            preference_id=defaults.preference_id,
            request=request,
            update_source=PreferenceUpdateSource.ADMIN,
        )

        logger.info(
            "Updated workspace defaults",
            extra={
                "workspace_id": str(workspace_id),
                "admin_user_id": current_user.user_id,
                "preference_id": str(updated.preference_id),
            },
        )

        return updated

    except PreferenceValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )


# =============================================================================
# Admin: User Preference Management
# =============================================================================


@router.get(
    "",
    response_model=PreferenceListResponse,
    summary="List preferences",
    description="List notification preferences for all users in workspace (admin only).",
)
async def list_preferences(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    include_defaults: bool = Query(False, description="Include workspace defaults"),
    email_enabled: Optional[bool] = Query(None, description="Filter by email enabled"),
    global_unsubscribe: Optional[bool] = Query(None, description="Filter by global unsubscribe"),
    language: Optional[str] = Query(None, description="Filter by language"),
) -> PreferenceListResponse:
    """
    List notification preferences for a workspace.

    Returns paginated list of user preferences. Admin only.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user
        page: Page number (1-indexed)
        limit: Items per page (1-100)
        include_defaults: Whether to include workspace defaults
        email_enabled: Filter by email enabled status
        global_unsubscribe: Filter by global unsubscribe status
        language: Filter by language preference

    Returns:
        PreferenceListResponse: Paginated list of preferences
    """
    result = await preference_service.list_preferences(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        include_defaults=include_defaults,
        email_enabled=email_enabled,
        global_unsubscribe=global_unsubscribe,
        language=language,
    )

    logger.debug(
        "Listed preferences",
        extra={
            "workspace_id": str(workspace_id),
            "admin_user_id": current_user.user_id,
            "page": page,
            "total": result.meta.total,
        },
    )

    return result


@router.get(
    "/users/{user_id}",
    response_model=PreferenceResponse,
    summary="Get user preferences",
    description="Get notification preferences for a specific user (admin only).",
)
async def get_user_preferences(
    user_id: UUID = Path(..., description="User ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
) -> PreferenceResponse:
    """
    Get preferences for a specific user.

    Admin only. Returns user's preferences or 404 if not configured.

    Args:
        user_id: User ID to get preferences for
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user

    Returns:
        PreferenceResponse: User's preferences

    Raises:
        HTTPException: 404 if user has no preferences
    """
    preference = await preference_service.get_user_preference(
        workspace_id=workspace_id,
        user_id=user_id,
    )

    if not preference:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="PREFERENCE_NOT_FOUND",
                message=f"No preferences found for user {user_id}",
            ).model_dump(),
        )

    logger.debug(
        "Retrieved user preferences (admin)",
        extra={
            "workspace_id": str(workspace_id),
            "target_user_id": str(user_id),
            "admin_user_id": current_user.user_id,
        },
    )

    return preference


@router.patch(
    "/users/{user_id}",
    response_model=PreferenceResponse,
    summary="Update user preferences",
    description="Update notification preferences for a specific user (admin only).",
)
async def update_user_preferences(
    request: PreferenceUpdateRequest,
    user_id: UUID = Path(..., description="User ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
) -> PreferenceResponse:
    """
    Update preferences for a specific user.

    Admin only. Creates preferences if they don't exist.

    Args:
        request: Preference update request
        user_id: User ID to update preferences for
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user

    Returns:
        PreferenceResponse: Updated preferences
    """
    try:
        updated = await preference_service.update_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
            request=request,
            update_source=PreferenceUpdateSource.ADMIN,
        )

        logger.info(
            "Updated user preferences (admin)",
            extra={
                "workspace_id": str(workspace_id),
                "target_user_id": str(user_id),
                "admin_user_id": current_user.user_id,
            },
        )

        return updated

    except PreferenceValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error=e.code,
                message=str(e),
                details=e.details,
            ).model_dump(),
        )


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete user preferences",
    description="Delete notification preferences for a user (admin only).",
)
async def delete_user_preferences(
    user_id: UUID = Path(..., description="User ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
) -> None:
    """
    Delete preferences for a specific user.

    Admin only. Used for GDPR right to erasure requests.
    User will inherit workspace defaults after deletion.

    Args:
        user_id: User ID to delete preferences for
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user

    Raises:
        HTTPException: 404 if user has no preferences
    """
    deleted = await preference_service.delete_user_preferences(
        workspace_id=workspace_id,
        user_id=user_id,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="PREFERENCE_NOT_FOUND",
                message=f"No preferences found for user {user_id}",
            ).model_dump(),
        )

    logger.info(
        "Deleted user preferences (admin)",
        extra={
            "workspace_id": str(workspace_id),
            "target_user_id": str(user_id),
            "admin_user_id": current_user.user_id,
        },
    )


# =============================================================================
# Bulk Operations (Admin Only)
# =============================================================================


@router.post(
    "/bulk",
    response_model=BulkPreferenceUpdateResponse,
    summary="Bulk update preferences",
    description="Bulk update preferences for multiple users (admin only).",
)
async def bulk_update_preferences(
    request: BulkPreferenceUpdateRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
) -> BulkPreferenceUpdateResponse:
    """
    Bulk update preferences for multiple users.

    Admin only. Applies the same updates to all specified users.

    Args:
        request: Bulk update request with user IDs and updates
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user

    Returns:
        BulkPreferenceUpdateResponse: Results with success/failure counts
    """
    result = await preference_service.bulk_update_preferences(
        workspace_id=workspace_id,
        request=request,
        update_source=PreferenceUpdateSource.ADMIN,
    )

    logger.info(
        "Bulk updated preferences",
        extra={
            "workspace_id": str(workspace_id),
            "admin_user_id": current_user.user_id,
            "total_users": len(request.user_ids),
            "updated": result.updated,
            "failed": result.failed,
        },
    )

    return result


# =============================================================================
# Statistics (Admin Only)
# =============================================================================


@router.get(
    "/stats",
    response_model=dict[str, Any],
    summary="Get preference statistics",
    description="Get notification preference statistics for the workspace (admin only).",
)
async def get_preference_stats(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
) -> dict[str, Any]:
    """
    Get preference statistics for a workspace.

    Returns aggregate statistics including:
    - Total users with preferences
    - Channel enablement rates
    - Global unsubscribe count
    - Category distribution

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user

    Returns:
        Statistics dictionary
    """
    stats = await preference_service.get_preference_stats(workspace_id)

    logger.debug(
        "Retrieved preference stats",
        extra={
            "workspace_id": str(workspace_id),
            "admin_user_id": current_user.user_id,
        },
    )

    return stats


@router.get(
    "/stats/languages",
    response_model=list[dict[str, Any]],
    summary="Get language distribution",
    description="Get language distribution for workspace preferences (admin only).",
)
async def get_language_distribution(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
) -> list[dict[str, Any]]:
    """
    Get language distribution for preferences.

    Returns language codes with user counts for targeting.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user

    Returns:
        List of language codes with counts
    """
    distribution = await preference_service.get_language_distribution(workspace_id)

    logger.debug(
        "Retrieved language distribution",
        extra={
            "workspace_id": str(workspace_id),
            "admin_user_id": current_user.user_id,
        },
    )

    return distribution


@router.get(
    "/marketing-enabled",
    response_model=list[UUID],
    summary="Get marketing enabled users",
    description="Get list of users with marketing enabled (admin only).",
)
async def get_marketing_enabled_users(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(require_admin_role),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum users to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
) -> list[UUID]:
    """
    Get users with marketing notifications enabled.

    Used for marketing campaign targeting.

    Args:
        workspace_id: Workspace ID from path
        current_user: Current authenticated admin user
        limit: Maximum users to return
        offset: Pagination offset

    Returns:
        List of user IDs with marketing enabled
    """
    users = await preference_service.get_marketing_enabled_users(
        workspace_id=workspace_id,
        limit=limit,
        offset=offset,
    )

    logger.debug(
        "Retrieved marketing enabled users",
        extra={
            "workspace_id": str(workspace_id),
            "admin_user_id": current_user.user_id,
            "count": len(users),
        },
    )

    return users
