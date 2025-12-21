"""Profile Editor API Endpoints.

Provides comprehensive API for the Public Profile Editor including:
- Profile management
- Visibility configuration
- Theme browsing and application
- Theme customization
- Version control
- Preview sharing (placeholder for Phase 4)

All endpoints enforce workspace isolation via WorkspaceAccessDep.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import JSONResponse

from app.api.dependencies.auth import get_current_user
from ...core.dependencies import WorkspaceAccessDep
from ...core.rate_limit import rate_limit
from ...core.audit import audit_log
from ..profile_editor_schemas import (
    ThemeResponse,
    ThemeFilters,
    ThemeCustomizationResponse,
    UpdateColorsRequest,
    UpdateTypographyRequest,
    UpdateLayoutRequest,
    SavePresetRequest,
    ProfileVisibilityConfigResponse,
    UpdateVisibilityRequest,
    SaveVisibilityPresetRequest,
    ProfileVersionResponse,
    CreateSnapshotRequest,
    PublishProfileRequest,
    PublishResult,
)
from ...services.profile_editor_service import (
    get_profile_editor_service,
    ProfileNotFoundError,
    ThemeNotFoundError,
    CustomizationNotFoundError,
    VisibilityConfigNotFoundError,
)

logger = logging.getLogger(__name__)

# =============================================================================
# Router Setup
# =============================================================================

# Workspace-scoped router (requires authentication)
router = APIRouter(
    prefix="/profile-editor",
    tags=["Profile Editor"],
)

# Public themes router (no authentication required for browsing)
public_router = APIRouter(
    prefix="/themes",
    tags=["Themes"],
)


# =============================================================================
# Theme Endpoints (Public - Read Only)
# =============================================================================

@public_router.get(
    "",
    response_model=list[ThemeResponse],
    summary="List all themes",
    description="Get all available themes with optional filtering by category, popularity, etc."
)
async def list_themes(
    category: Optional[str] = Query(None, description="Filter by category"),
    is_premium: Optional[bool] = Query(None, description="Filter by premium status"),
    is_popular: Optional[bool] = Query(None, description="Filter by popularity"),
    supports_dark_mode: Optional[bool] = Query(None, description="Filter by dark mode support"),
    search: Optional[str] = Query(None, max_length=100, description="Search themes")
) -> list[dict[str, Any]]:
    """List all available themes."""
    service = get_profile_editor_service()

    filters = {}
    if category:
        filters["category"] = category
    if is_premium is not None:
        filters["is_premium"] = is_premium
    if is_popular is not None:
        filters["is_popular"] = is_popular
    if supports_dark_mode is not None:
        filters["supports_dark_mode"] = supports_dark_mode
    if search:
        filters["search"] = search

    return await service.get_themes(filters if filters else None)


@public_router.get(
    "/{theme_id}",
    response_model=ThemeResponse,
    summary="Get theme details",
    description="Get detailed information about a specific theme."
)
async def get_theme(theme_id: UUID) -> dict[str, Any]:
    """Get a specific theme by ID."""
    service = get_profile_editor_service()
    theme = await service.get_theme(theme_id)

    if not theme:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Theme {theme_id} not found"
        )

    return theme


@public_router.get(
    "/categories/{category}",
    response_model=list[ThemeResponse],
    summary="Get themes by category",
    description="Get all themes in a specific category."
)
async def get_themes_by_category(
    category: str
) -> list[dict[str, Any]]:
    """Get themes by category."""
    valid_categories = {"minimal", "bold", "elegant", "modern", "creative"}
    if category.lower() not in valid_categories:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}"
        )

    service = get_profile_editor_service()
    return await service.get_themes({"category": category.lower()})


# =============================================================================
# Profile Management Endpoints
# =============================================================================

@router.get(
    "/profile",
    summary="Get profile for editing",
    description="Get the current profile data for editing in the profile editor."
)
@rate_limit(requests_per_minute=60)
async def get_profile(
    workspace: WorkspaceAccessDep,
) -> dict[str, Any]:
    """Get profile for workspace."""
    service = get_profile_editor_service()
    profile = await service.get_profile(workspace.workspace_id)

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found for this workspace"
        )

    return {"data": profile}


@router.patch(
    "/profile",
    summary="Update profile",
    description="Update profile fields. Changes are persisted immediately."
)
@rate_limit(requests_per_minute=30)
async def update_profile(
    workspace: WorkspaceAccessDep,
    updates: dict[str, Any],
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Update profile fields."""
    service = get_profile_editor_service()

    try:
        profile = await service.update_profile(workspace.workspace_id, updates)

        # Audit log
        await audit_log(
            workspace_id=workspace.workspace_id,
            user_id=user.user_id,
            action="profile.update",
            resource_type="company_profile",
            resource_id=profile.get("profile_id"),
            details={"updated_fields": list(updates.keys())}
        )

        return {"data": profile}

    except ProfileNotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post(
    "/publish",
    response_model=PublishResult,
    summary="Publish profile",
    description="Publish the profile to make it publicly visible."
)
@rate_limit(requests_per_minute=10)
async def publish_profile(
    workspace: WorkspaceAccessDep,
    request: PublishProfileRequest,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Publish profile."""
    service = get_profile_editor_service()

    try:
        result = await service.publish_profile(
            workspace.workspace_id,
            create_snapshot=request.create_snapshot,
            snapshot_label=request.snapshot_label
        )

        await audit_log(
            workspace_id=workspace.workspace_id,
            user_id=user.user_id,
            action="profile.publish",
            resource_type="company_profile",
            details={"version_id": result.get("version_id")}
        )

        return result

    except ProfileNotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post(
    "/unpublish",
    summary="Unpublish profile",
    description="Unpublish the profile to hide it from public view."
)
@rate_limit(requests_per_minute=10)
async def unpublish_profile(
    workspace: WorkspaceAccessDep,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Unpublish profile."""
    service = get_profile_editor_service()

    await service.unpublish_profile(workspace.workspace_id)

    await audit_log(
        workspace_id=workspace.workspace_id,
        user_id=user.user_id,
        action="profile.unpublish",
        resource_type="company_profile"
    )

    return {"success": True, "message": "Profile unpublished"}


# =============================================================================
# Visibility Configuration Endpoints
# =============================================================================

@router.get(
    "/visibility",
    response_model=ProfileVisibilityConfigResponse,
    summary="Get visibility configuration",
    description="Get the current visibility settings for the profile."
)
async def get_visibility(
    workspace: WorkspaceAccessDep,
) -> dict[str, Any]:
    """Get visibility configuration."""
    service = get_profile_editor_service()

    # Get profile first to get profile_id
    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found for this workspace"
        )

    config = await service.get_or_create_visibility_config(
        workspace.workspace_id,
        UUID(profile["profile_id"])
    )

    return config


@router.patch(
    "/visibility",
    response_model=ProfileVisibilityConfigResponse,
    summary="Update visibility",
    description="Update visibility settings. Changes reflect immediately in preview."
)
@rate_limit(requests_per_minute=60)
async def update_visibility(
    workspace: WorkspaceAccessDep,
    request: UpdateVisibilityRequest,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Update visibility configuration."""
    service = get_profile_editor_service()

    # Get profile first
    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found for this workspace"
        )

    config = await service.update_visibility(
        workspace.workspace_id,
        UUID(profile["profile_id"]),
        request.model_dump(exclude_none=True)
    )

    await audit_log(
        workspace_id=workspace.workspace_id,
        user_id=user.user_id,
        action="visibility.update",
        resource_type="profile_visibility",
        resource_id=config.get("visibility_config_id")
    )

    return config


@router.post(
    "/visibility/presets",
    response_model=ProfileVisibilityConfigResponse,
    summary="Save visibility preset",
    description="Save current visibility settings as a named preset."
)
@rate_limit(requests_per_minute=10)
async def save_visibility_preset(
    workspace: WorkspaceAccessDep,
    request: SaveVisibilityPresetRequest,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Save visibility preset."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    try:
        config = await service.save_visibility_preset(
            workspace.workspace_id,
            UUID(profile["profile_id"]),
            request.name
        )

        await audit_log(
            workspace_id=workspace.workspace_id,
            user_id=user.user_id,
            action="visibility.preset_save",
            resource_type="profile_visibility",
            details={"preset_name": request.name}
        )

        return config

    except VisibilityConfigNotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get(
    "/visibility/presets",
    summary="Get available presets",
    description="Get list of available visibility presets."
)
async def get_visibility_presets() -> dict[str, Any]:
    """Get available visibility presets."""
    from ...services.visibility_service import get_visibility_filter_service

    service = get_visibility_filter_service()
    presets = service.get_available_presets()

    return {"presets": presets}


@router.post(
    "/visibility/presets/{preset_key}/apply",
    response_model=ProfileVisibilityConfigResponse,
    summary="Apply visibility preset",
    description="Apply a built-in visibility preset (full, minimal, business)."
)
@rate_limit(requests_per_minute=30)
async def apply_visibility_preset(
    workspace: WorkspaceAccessDep,
    preset_key: str,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Apply a built-in visibility preset."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    try:
        config = await service.apply_visibility_preset(
            workspace.workspace_id,
            UUID(profile["profile_id"]),
            preset_key
        )

        await audit_log(
            workspace_id=workspace.workspace_id,
            user_id=user.user_id,
            action="visibility.preset_apply",
            resource_type="profile_visibility",
            details={"preset_key": preset_key}
        )

        return config

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# =============================================================================
# Theme Application Endpoints
# =============================================================================

@router.post(
    "/theme/apply",
    summary="Apply theme to profile",
    description="Apply a theme to the profile. Theme is immediately visible in preview."
)
@rate_limit(requests_per_minute=30)
async def apply_theme(
    workspace: WorkspaceAccessDep,
    theme_id: UUID = Query(..., description="Theme ID to apply"),
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Apply a theme to the profile."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    try:
        updated_profile = await service.apply_theme(
            workspace.workspace_id,
            UUID(profile["profile_id"]),
            theme_id
        )

        await audit_log(
            workspace_id=workspace.workspace_id,
            user_id=user.user_id,
            action="theme.apply",
            resource_type="company_profile",
            details={"theme_id": str(theme_id)}
        )

        return {"data": updated_profile}

    except ThemeNotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


# =============================================================================
# Theme Customization Endpoints
# =============================================================================

@router.get(
    "/customization",
    response_model=ThemeCustomizationResponse,
    summary="Get current customization",
    description="Get the current theme customization for the profile."
)
async def get_customization(
    workspace: WorkspaceAccessDep,
) -> dict[str, Any]:
    """Get current theme customization."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    if not profile.get("theme_customization_id"):
        # Return empty customization structure
        return {
            "customization_id": None,
            "workspace_id": str(workspace.workspace_id),
            "theme_id": profile.get("theme_id"),
            "custom_colors": None,
            "custom_typography": None,
            "custom_layout": None,
            "is_preset": False
        }

    customization = await service.get_customization(
        workspace.workspace_id,
        UUID(profile["theme_customization_id"])
    )

    if not customization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customization not found"
        )

    return customization


@router.patch(
    "/customization/colors",
    response_model=ThemeCustomizationResponse,
    summary="Update color customization",
    description="Update custom colors for the current theme."
)
@rate_limit(requests_per_minute=60)
async def update_colors(
    workspace: WorkspaceAccessDep,
    request: UpdateColorsRequest,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Update color customization."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    if not profile.get("theme_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No theme applied. Apply a theme first."
        )

    # Get or create customization
    if profile.get("theme_customization_id"):
        customization = await service.update_customization(
            workspace.workspace_id,
            UUID(profile["theme_customization_id"]),
            {"custom_colors": request.model_dump(exclude_none=True)}
        )
    else:
        customization = await service.create_customization(
            workspace.workspace_id,
            UUID(profile["theme_id"]),
            {"custom_colors": request.model_dump(exclude_none=True)}
        )
        # Link to profile
        await service.update_profile(
            workspace.workspace_id,
            {"theme_customization_id": customization["customization_id"]}
        )

    await audit_log(
        workspace_id=workspace.workspace_id,
        user_id=user.user_id,
        action="customization.colors_update",
        resource_type="theme_customization",
        resource_id=customization.get("customization_id")
    )

    return customization


@router.patch(
    "/customization/typography",
    response_model=ThemeCustomizationResponse,
    summary="Update typography customization",
    description="Update custom typography for the current theme."
)
@rate_limit(requests_per_minute=60)
async def update_typography(
    workspace: WorkspaceAccessDep,
    request: UpdateTypographyRequest,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Update typography customization."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    if not profile.get("theme_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No theme applied"
        )

    if profile.get("theme_customization_id"):
        customization = await service.update_customization(
            workspace.workspace_id,
            UUID(profile["theme_customization_id"]),
            {"custom_typography": request.model_dump(exclude_none=True)}
        )
    else:
        customization = await service.create_customization(
            workspace.workspace_id,
            UUID(profile["theme_id"]),
            {"custom_typography": request.model_dump(exclude_none=True)}
        )
        await service.update_profile(
            workspace.workspace_id,
            {"theme_customization_id": customization["customization_id"]}
        )

    await audit_log(
        workspace_id=workspace.workspace_id,
        user_id=user.user_id,
        action="customization.typography_update",
        resource_type="theme_customization",
        resource_id=customization.get("customization_id")
    )

    return customization


@router.patch(
    "/customization/layout",
    response_model=ThemeCustomizationResponse,
    summary="Update layout customization",
    description="Update custom layout preferences for the current theme."
)
@rate_limit(requests_per_minute=60)
async def update_layout(
    workspace: WorkspaceAccessDep,
    request: UpdateLayoutRequest,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Update layout customization."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    if not profile.get("theme_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No theme applied"
        )

    if profile.get("theme_customization_id"):
        customization = await service.update_customization(
            workspace.workspace_id,
            UUID(profile["theme_customization_id"]),
            {"custom_layout": request.model_dump(exclude_none=True)}
        )
    else:
        customization = await service.create_customization(
            workspace.workspace_id,
            UUID(profile["theme_id"]),
            {"custom_layout": request.model_dump(exclude_none=True)}
        )
        await service.update_profile(
            workspace.workspace_id,
            {"theme_customization_id": customization["customization_id"]}
        )

    await audit_log(
        workspace_id=workspace.workspace_id,
        user_id=user.user_id,
        action="customization.layout_update",
        resource_type="theme_customization",
        resource_id=customization.get("customization_id")
    )

    return customization


@router.post(
    "/customization/presets",
    response_model=ThemeCustomizationResponse,
    summary="Save customization as preset",
    description="Save current theme customization as a reusable preset."
)
@rate_limit(requests_per_minute=10)
async def save_customization_preset(
    workspace: WorkspaceAccessDep,
    request: SavePresetRequest,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Save customization as preset."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile or not profile.get("theme_customization_id"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No customization found to save"
        )

    customization = await service.update_customization(
        workspace.workspace_id,
        UUID(profile["theme_customization_id"]),
        {"name": request.name, "is_preset": True}
    )

    await audit_log(
        workspace_id=workspace.workspace_id,
        user_id=user.user_id,
        action="customization.preset_save",
        resource_type="theme_customization",
        details={"preset_name": request.name}
    )

    return customization


@router.post(
    "/customization/reset",
    summary="Reset customization",
    description="Reset theme customization to theme defaults."
)
@rate_limit(requests_per_minute=30)
async def reset_customization(
    workspace: WorkspaceAccessDep,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Reset theme customization to defaults."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    if profile.get("theme_customization_id"):
        # Clear customization by setting all custom fields to None
        await service.update_customization(
            workspace.workspace_id,
            UUID(profile["theme_customization_id"]),
            {
                "custom_colors": None,
                "custom_typography": None,
                "custom_layout": None
            }
        )

    await audit_log(
        workspace_id=workspace.workspace_id,
        user_id=user.user_id,
        action="customization.reset",
        resource_type="theme_customization"
    )

    return {"success": True, "message": "Customization reset to theme defaults"}


# =============================================================================
# Version Control Endpoints
# =============================================================================

@router.post(
    "/versions/snapshot",
    response_model=ProfileVersionResponse,
    summary="Create snapshot",
    description="Create a manual version snapshot of the current profile state."
)
@rate_limit(requests_per_minute=10)
async def create_snapshot(
    workspace: WorkspaceAccessDep,
    request: CreateSnapshotRequest,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Create manual snapshot."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    version = await service.create_snapshot(
        workspace.workspace_id,
        UUID(profile["profile_id"]),
        label=request.label,
        created_by=user.user_id
    )

    await audit_log(
        workspace_id=workspace.workspace_id,
        user_id=user.user_id,
        action="version.snapshot_create",
        resource_type="profile_version",
        resource_id=version.get("version_id"),
        details={"label": request.label}
    )

    return version


@router.get(
    "/versions",
    response_model=list[ProfileVersionResponse],
    summary="Get version history",
    description="Get version history for the profile."
)
async def get_versions(
    workspace: WorkspaceAccessDep,
    limit: int = Query(30, ge=1, le=100, description="Maximum versions to return"),
) -> list[dict[str, Any]]:
    """Get version history."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    versions = await service.get_versions(
        workspace.workspace_id,
        UUID(profile["profile_id"]),
        limit=limit
    )

    return versions


@router.post(
    "/versions/{version_id}/restore",
    summary="Restore version",
    description="Restore the profile to a previous version."
)
@rate_limit(requests_per_minute=10)
async def restore_version(
    workspace: WorkspaceAccessDep,
    version_id: UUID,
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Restore to a previous version."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    try:
        restored = await service.restore_version(
            workspace.workspace_id,
            UUID(profile["profile_id"]),
            version_id
        )

        await audit_log(
            workspace_id=workspace.workspace_id,
            user_id=user.user_id,
            action="version.restore",
            resource_type="profile_version",
            resource_id=str(version_id)
        )

        return {"data": restored, "message": "Profile restored to previous version"}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# =============================================================================
# Export/Import Endpoints
# =============================================================================

@router.post(
    "/export",
    summary="Export profile configuration",
    description="Export profile configuration as JSON for backup."
)
async def export_profile(
    workspace: WorkspaceAccessDep,
) -> dict[str, Any]:
    """Export profile configuration."""
    service = get_profile_editor_service()

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found"
        )

    visibility = await service.get_visibility_config(
        workspace.workspace_id,
        UUID(profile["profile_id"])
    )

    customization = None
    if profile.get("theme_customization_id"):
        customization = await service.get_customization(
            workspace.workspace_id,
            UUID(profile["theme_customization_id"])
        )

    from datetime import datetime, timezone

    return {
        "version": "1.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile_data": profile,
        "visibility_config": visibility or {},
        "theme_customization": customization
    }


@router.post(
    "/import",
    summary="Import profile configuration",
    description="Import profile configuration from JSON backup."
)
@rate_limit(requests_per_minute=5)
async def import_profile(
    workspace: WorkspaceAccessDep,
    import_data: dict[str, Any],
    user = Depends(get_current_user),
) -> dict[str, Any]:
    """Import profile configuration."""
    service = get_profile_editor_service()

    # Validate import format
    if "version" not in import_data or "profile_data" not in import_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid import format"
        )

    profile = await service.get_profile(workspace.workspace_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile found. Create a profile first."
        )

    # Create backup before import
    await service.create_snapshot(
        workspace.workspace_id,
        UUID(profile["profile_id"]),
        label="Pre-import backup",
        created_by=user.user_id
    )

    # Import profile data (excluding IDs and timestamps)
    profile_data = import_data.get("profile_data", {})
    importable_fields = {
        "name", "tagline", "logo_url", "favicon_url",
        "brand_color", "brand_font", "email", "phone", "website",
        "address_structured", "socials", "custom_links"
    }
    updates = {k: v for k, v in profile_data.items() if k in importable_fields}

    if updates:
        await service.update_profile(workspace.workspace_id, updates)

    # Import visibility
    visibility_data = import_data.get("visibility_config", {})
    if visibility_data:
        await service.update_visibility(
            workspace.workspace_id,
            UUID(profile["profile_id"]),
            {
                "field_visibility": visibility_data.get("field_visibility", {}),
                "social_visibility": visibility_data.get("social_visibility", {})
            }
        )

    await audit_log(
        workspace_id=workspace.workspace_id,
        user_id=user.user_id,
        action="profile.import",
        resource_type="company_profile",
        details={"imported_fields": list(updates.keys())}
    )

    return {"success": True, "message": "Profile imported successfully"}
