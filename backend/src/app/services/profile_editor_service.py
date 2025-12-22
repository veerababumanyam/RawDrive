"""Profile Editor Service Layer.

Provides comprehensive profile editing capabilities including:
- Profile management (get, update, publish)
- Visibility configuration management
- Theme and customization management
- Version control and snapshots
- Workspace isolation enforcement
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from ..core.database import get_pool
from ..core.exceptions import AppError
from .visibility_service import (
    VisibilityFilterService,
    get_visibility_filter_service,
    PROFILE_FIELDS,
    SOCIAL_PLATFORMS,
)
from .company_profile_service import CompanyProfileService

logger = logging.getLogger(__name__)


# =============================================================================
# Custom Exceptions
# =============================================================================

class ProfileNotFoundError(AppError):
    """Profile not found."""
    def __init__(self, profile_id: UUID):
        super().__init__(
            status_code=404,
            error_code="PROFILE_NOT_FOUND",
            message=f"Profile {profile_id} not found"
        )


class VisibilityConfigNotFoundError(AppError):
    """Visibility configuration not found."""
    def __init__(self, profile_id: UUID):
        super().__init__(
            status_code=404,
            error_code="VISIBILITY_CONFIG_NOT_FOUND",
            message=f"Visibility configuration for profile {profile_id} not found"
        )


class ThemeNotFoundError(AppError):
    """Theme not found."""
    def __init__(self, theme_id: UUID):
        super().__init__(
            status_code=404,
            error_code="THEME_NOT_FOUND",
            message=f"Theme {theme_id} not found"
        )


class CustomizationNotFoundError(AppError):
    """Theme customization not found."""
    def __init__(self, customization_id: UUID):
        super().__init__(
            status_code=404,
            error_code="CUSTOMIZATION_NOT_FOUND",
            message=f"Theme customization {customization_id} not found"
        )


class WorkspaceAccessDeniedError(AppError):
    """Access denied to workspace resources."""
    def __init__(self, workspace_id: UUID):
        super().__init__(
            status_code=403,
            error_code="WORKSPACE_ACCESS_DENIED",
            message="You don't have permission to access this workspace's resources"
        )


# =============================================================================
# Profile Editor Service
# =============================================================================

class ProfileEditorService:
    """Service for profile editing operations.

    Provides:
    - Profile CRUD with workspace isolation
    - Visibility configuration management
    - Theme application and customization
    - Version control and snapshots
    - Publishing workflow
    """

    def __init__(self):
        self._visibility_service = get_visibility_filter_service()

    # =========================================================================
    # Profile Management
    # =========================================================================

    async def get_profile(
        self,
        workspace_id: UUID,
        profile_type: str = "company"
    ) -> Optional[dict[str, Any]]:
        """Get profile for workspace.

        Args:
            workspace_id: Workspace identifier
            profile_type: Type of profile ('company' or 'photographer')

        Returns:
            Profile data dictionary or None if not found.
        """
        pool = await get_pool()

        if profile_type == "company":
            result = await pool.fetchrow(
                """
                SELECT
                    profile_id, workspace_id, name, tagline, slug,
                    logo_url, favicon_url, brand_color, brand_font,
                    email, phone, website, address_structured,
                    socials, custom_links, company_visibility,
                    theme_id, theme_customization_id,
                    color_palette, typography_config, layout_preferences,
                    is_published, published_at,
                    created_at, updated_at
                FROM company_profiles
                WHERE workspace_id = $1
                """,
                workspace_id
            )
        else:
            # Photographer profiles - for future implementation
            result = None

        if not result:
            return None

        return self._map_profile_row(dict(result))

    async def update_profile(
        self,
        workspace_id: UUID,
        updates: dict[str, Any],
        profile_type: str = "company"
    ) -> dict[str, Any]:
        """Update profile fields.

        Args:
            workspace_id: Workspace identifier
            updates: Dictionary of fields to update
            profile_type: Type of profile

        Returns:
            Updated profile data.

        Raises:
            ProfileNotFoundError: If profile doesn't exist.
        """
        pool = await get_pool()

        # Verify profile exists
        existing = await self.get_profile(workspace_id, profile_type)
        if not existing:
            raise ProfileNotFoundError(UUID(str(workspace_id)))

        # Build update query dynamically
        allowed_fields = {
            "name", "tagline", "slug", "logo_url", "favicon_url",
            "brand_color", "brand_font", "email", "phone", "website",
            "address_structured", "socials", "custom_links",
            "company_visibility", "theme_id", "theme_customization_id",
            "color_palette", "typography_config", "layout_preferences",
            "is_published", "published_at"
        }

        set_clauses = []
        params = [workspace_id]
        param_idx = 2

        for field, value in updates.items():
            if field in allowed_fields:
                set_clauses.append(f"{field} = ${param_idx}")
                # Convert dicts to JSON for JSONB fields
                if field in {"address_structured", "socials", "custom_links",
                            "company_visibility", "color_palette",
                            "typography_config", "layout_preferences"}:
                    params.append(json.dumps(value) if value else None)
                else:
                    params.append(value)
                param_idx += 1

        if not set_clauses:
            return existing

        # Add updated_at
        set_clauses.append(f"updated_at = ${param_idx}")
        params.append(datetime.now(timezone.utc))

        query = f"""
            UPDATE company_profiles
            SET {', '.join(set_clauses)}
            WHERE workspace_id = $1
            RETURNING *
        """

        result = await pool.fetchrow(query, *params)
        return self._map_profile_row(dict(result))

    # =========================================================================
    # Visibility Configuration Management
    # =========================================================================

    async def get_visibility_config(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        profile_type: str = "company"
    ) -> Optional[dict[str, Any]]:
        """Get visibility configuration for a profile.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            profile_type: Type of profile

        Returns:
            Visibility configuration or None.
        """
        pool = await get_pool()

        result = await pool.fetchrow(
            """
            SELECT
                visibility_config_id, workspace_id, profile_type, profile_id,
                field_visibility, social_visibility,
                preset_name, is_default,
                created_at, updated_at
            FROM profile_visibility_configs
            WHERE workspace_id = $1 AND profile_type = $2 AND profile_id = $3
            """,
            workspace_id, profile_type, profile_id
        )

        if not result:
            return None

        return self._map_visibility_row(dict(result))

    async def get_or_create_visibility_config(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        profile_type: str = "company"
    ) -> dict[str, Any]:
        """Get existing or create new visibility configuration.

        If no configuration exists, creates one with default visibility settings.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            profile_type: Type of profile

        Returns:
            Visibility configuration.
        """
        existing = await self.get_visibility_config(workspace_id, profile_id, profile_type)
        if existing:
            return existing

        # Create new with defaults
        pool = await get_pool()
        default_field = self._visibility_service.get_default_visibility()
        default_social = self._visibility_service.get_default_social_visibility()

        result = await pool.fetchrow(
            """
            INSERT INTO profile_visibility_configs (
                visibility_config_id, workspace_id, profile_type, profile_id,
                field_visibility, social_visibility, is_default
            ) VALUES ($1, $2, $3, $4, $5, $6, true)
            RETURNING *
            """,
            uuid4(), workspace_id, profile_type, profile_id,
            json.dumps(default_field), json.dumps(default_social)
        )

        return self._map_visibility_row(dict(result))

    async def update_visibility(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        updates: dict[str, Any],
        profile_type: str = "company"
    ) -> dict[str, Any]:
        """Update visibility configuration.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            updates: Visibility updates (field_visibility and/or social_visibility)
            profile_type: Type of profile

        Returns:
            Updated visibility configuration.
        """
        pool = await get_pool()

        # Get or create config
        existing = await self.get_or_create_visibility_config(
            workspace_id, profile_id, profile_type
        )

        # Merge updates with existing
        field_visibility = existing.get("field_visibility", {})
        social_visibility = existing.get("social_visibility", {})

        if "field_visibility" in updates:
            field_visibility.update(updates["field_visibility"])
        if "social_visibility" in updates:
            social_visibility.update(updates["social_visibility"])

        result = await pool.fetchrow(
            """
            UPDATE profile_visibility_configs
            SET
                field_visibility = $1,
                social_visibility = $2,
                is_default = false,
                updated_at = NOW()
            WHERE workspace_id = $3 AND profile_type = $4 AND profile_id = $5
            RETURNING *
            """,
            json.dumps(field_visibility),
            json.dumps(social_visibility),
            workspace_id, profile_type, profile_id
        )

        return self._map_visibility_row(dict(result))

    async def save_visibility_preset(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        preset_name: str,
        profile_type: str = "company"
    ) -> dict[str, Any]:
        """Save current visibility config as a named preset.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            preset_name: Name for the preset
            profile_type: Type of profile

        Returns:
            Updated visibility configuration with preset name.
        """
        pool = await get_pool()

        result = await pool.fetchrow(
            """
            UPDATE profile_visibility_configs
            SET
                preset_name = $1,
                updated_at = NOW()
            WHERE workspace_id = $2 AND profile_type = $3 AND profile_id = $4
            RETURNING *
            """,
            preset_name, workspace_id, profile_type, profile_id
        )

        if not result:
            raise VisibilityConfigNotFoundError(profile_id)

        return self._map_visibility_row(dict(result))

    async def apply_visibility_preset(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        preset_key: str,
        profile_type: str = "company"
    ) -> dict[str, Any]:
        """Apply a built-in visibility preset.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            preset_key: Key of preset to apply ('full', 'minimal', 'business')
            profile_type: Type of profile

        Returns:
            Updated visibility configuration.
        """
        preset = self._visibility_service.get_preset(preset_key)
        if not preset:
            raise AppError(
                status_code=400,
                error_code="INVALID_PRESET",
                message=f"Unknown preset: {preset_key}"
            )

        return await self.update_visibility(
            workspace_id,
            profile_id,
            {
                "field_visibility": preset["field_visibility"],
                "social_visibility": preset["social_visibility"]
            },
            profile_type
        )

    # =========================================================================
    # Theme Management
    # =========================================================================

    async def get_themes(
        self,
        filters: Optional[dict[str, Any]] = None
    ) -> list[dict[str, Any]]:
        """Get all available themes with optional filtering.

        Args:
            filters: Optional filter criteria (category, is_premium, etc.)

        Returns:
            List of theme dictionaries.
        """
        pool = await get_pool()

        where_clauses = []
        params = []
        param_idx = 1

        if filters:
            if filters.get("category"):
                where_clauses.append(f"category = ${param_idx}")
                params.append(filters["category"])
                param_idx += 1
            if filters.get("is_premium") is not None:
                where_clauses.append(f"is_premium = ${param_idx}")
                params.append(filters["is_premium"])
                param_idx += 1
            if filters.get("is_popular") is not None:
                where_clauses.append(f"is_popular = ${param_idx}")
                params.append(filters["is_popular"])
                param_idx += 1
            if filters.get("supports_dark_mode") is not None:
                where_clauses.append(f"supports_dark_mode = ${param_idx}")
                params.append(filters["supports_dark_mode"])
                param_idx += 1
            if filters.get("search"):
                where_clauses.append(f"(name ILIKE ${param_idx} OR description ILIKE ${param_idx})")
                params.append(f"%{filters['search']}%")
                param_idx += 1

        where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        query = f"""
            SELECT *
            FROM themes
            {where_sql}
            ORDER BY is_popular DESC, usage_count DESC, name ASC
        """

        rows = await pool.fetch(query, *params)
        return [self._map_theme_row(dict(row)) for row in rows]

    async def get_theme(self, theme_id: UUID) -> Optional[dict[str, Any]]:
        """Get a specific theme by ID.

        Args:
            theme_id: Theme identifier

        Returns:
            Theme dictionary or None.
        """
        pool = await get_pool()

        result = await pool.fetchrow(
            "SELECT * FROM themes WHERE theme_id = $1",
            theme_id
        )

        if not result:
            return None

        return self._map_theme_row(dict(result))

    async def apply_theme(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        theme_id: UUID,
        profile_type: str = "company"
    ) -> dict[str, Any]:
        """Apply a theme to a profile.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            theme_id: Theme to apply
            profile_type: Type of profile

        Returns:
            Updated profile data.

        Raises:
            ThemeNotFoundError: If theme doesn't exist.
        """
        # Verify theme exists
        theme = await self.get_theme(theme_id)
        if not theme:
            raise ThemeNotFoundError(theme_id)

        pool = await get_pool()

        # Update profile with theme reference
        result = await pool.fetchrow(
            """
            UPDATE company_profiles
            SET
                theme_id = $1,
                updated_at = NOW()
            WHERE workspace_id = $2
            RETURNING *
            """,
            theme_id, workspace_id
        )

        if not result:
            raise ProfileNotFoundError(profile_id)

        # Increment theme usage count
        await pool.execute(
            "UPDATE themes SET usage_count = usage_count + 1 WHERE theme_id = $1",
            theme_id
        )

        return self._map_profile_row(dict(result))

    # =========================================================================
    # Theme Customization
    # =========================================================================

    async def get_customization(
        self,
        workspace_id: UUID,
        customization_id: UUID
    ) -> Optional[dict[str, Any]]:
        """Get a theme customization.

        Args:
            workspace_id: Workspace identifier (for isolation)
            customization_id: Customization identifier

        Returns:
            Customization dictionary or None.
        """
        pool = await get_pool()

        result = await pool.fetchrow(
            """
            SELECT * FROM theme_customizations
            WHERE customization_id = $1 AND workspace_id = $2
            """,
            customization_id, workspace_id
        )

        if not result:
            return None

        return self._map_customization_row(dict(result))

    async def create_customization(
        self,
        workspace_id: UUID,
        theme_id: UUID,
        customization: dict[str, Any]
    ) -> dict[str, Any]:
        """Create a new theme customization.

        Args:
            workspace_id: Workspace identifier
            theme_id: Base theme identifier
            customization: Customization data

        Returns:
            Created customization.
        """
        pool = await get_pool()

        result = await pool.fetchrow(
            """
            INSERT INTO theme_customizations (
                customization_id, workspace_id, theme_id,
                name, custom_colors, custom_typography, custom_layout,
                is_preset
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            uuid4(), workspace_id, theme_id,
            customization.get("name"),
            json.dumps(customization.get("custom_colors")) if customization.get("custom_colors") else None,
            json.dumps(customization.get("custom_typography")) if customization.get("custom_typography") else None,
            json.dumps(customization.get("custom_layout")) if customization.get("custom_layout") else None,
            customization.get("is_preset", False)
        )

        return self._map_customization_row(dict(result))

    async def update_customization(
        self,
        workspace_id: UUID,
        customization_id: UUID,
        updates: dict[str, Any]
    ) -> dict[str, Any]:
        """Update a theme customization.

        Args:
            workspace_id: Workspace identifier
            customization_id: Customization identifier
            updates: Fields to update

        Returns:
            Updated customization.
        """
        pool = await get_pool()

        existing = await self.get_customization(workspace_id, customization_id)
        if not existing:
            raise CustomizationNotFoundError(customization_id)

        # Merge updates
        custom_colors = existing.get("custom_colors", {})
        custom_typography = existing.get("custom_typography", {})
        custom_layout = existing.get("custom_layout", {})

        if "custom_colors" in updates:
            if updates["custom_colors"]:
                custom_colors.update(updates["custom_colors"])
            else:
                custom_colors = updates["custom_colors"]
        if "custom_typography" in updates:
            if updates["custom_typography"]:
                custom_typography.update(updates["custom_typography"])
            else:
                custom_typography = updates["custom_typography"]
        if "custom_layout" in updates:
            if updates["custom_layout"]:
                custom_layout.update(updates["custom_layout"])
            else:
                custom_layout = updates["custom_layout"]

        result = await pool.fetchrow(
            """
            UPDATE theme_customizations
            SET
                custom_colors = $1,
                custom_typography = $2,
                custom_layout = $3,
                name = COALESCE($4, name),
                updated_at = NOW()
            WHERE customization_id = $5 AND workspace_id = $6
            RETURNING *
            """,
            json.dumps(custom_colors) if custom_colors else None,
            json.dumps(custom_typography) if custom_typography else None,
            json.dumps(custom_layout) if custom_layout else None,
            updates.get("name"),
            customization_id, workspace_id
        )

        return self._map_customization_row(dict(result))

    # =========================================================================
    # Publishing Workflow
    # =========================================================================

    async def publish_profile(
        self,
        workspace_id: UUID,
        create_snapshot: bool = True,
        snapshot_label: Optional[str] = None,
        profile_type: str = "company"
    ) -> dict[str, Any]:
        """Publish a profile to make it publicly visible.

        Args:
            workspace_id: Workspace identifier
            create_snapshot: Whether to create a version snapshot
            snapshot_label: Optional label for the snapshot
            profile_type: Type of profile

        Returns:
            Publish result with public URL.
        """
        pool = await get_pool()

        # Get current profile
        profile = await self.get_profile(workspace_id, profile_type)
        if not profile:
            raise ProfileNotFoundError(UUID(str(workspace_id)))

        # Create snapshot if requested
        version_id = None
        if create_snapshot:
            version_id = await self._create_version_snapshot(
                workspace_id,
                profile["profile_id"],
                profile_type,
                label=snapshot_label or "Published",
                is_auto=False
            )

        # Update publish status
        now = datetime.now(timezone.utc)
        await pool.execute(
            """
            UPDATE company_profiles
            SET is_published = true, published_at = $1, updated_at = $1
            WHERE workspace_id = $2
            """,
            now, workspace_id
        )

        return {
            "success": True,
            "published_at": now.isoformat(),
            "public_url": CompanyProfileService.generate_public_url(profile['slug']),
            "version_id": str(version_id) if version_id else None
        }

    async def unpublish_profile(
        self,
        workspace_id: UUID,
        profile_type: str = "company"
    ) -> None:
        """Unpublish a profile to hide it from public view.

        Args:
            workspace_id: Workspace identifier
            profile_type: Type of profile
        """
        pool = await get_pool()

        await pool.execute(
            """
            UPDATE company_profiles
            SET is_published = false, updated_at = NOW()
            WHERE workspace_id = $1
            """,
            workspace_id
        )

    # =========================================================================
    # Version Control
    # =========================================================================

    async def _create_version_snapshot(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        profile_type: str,
        label: Optional[str] = None,
        is_auto: bool = False,
        created_by: Optional[UUID] = None
    ) -> UUID:
        """Create a version snapshot of the current profile state.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            profile_type: Type of profile
            label: Optional label for the version
            is_auto: Whether this is an automatic snapshot
            created_by: User who created the snapshot

        Returns:
            Version identifier.
        """
        pool = await get_pool()

        # Get current profile data
        profile = await self.get_profile(workspace_id, profile_type)
        visibility = await self.get_visibility_config(workspace_id, profile_id, profile_type)

        # Get theme info
        theme_snapshot = {}
        if profile and profile.get("theme_id"):
            theme = await self.get_theme(profile["theme_id"])
            if theme:
                theme_snapshot["theme"] = theme
            if profile.get("theme_customization_id"):
                customization = await self.get_customization(
                    workspace_id,
                    profile["theme_customization_id"]
                )
                if customization:
                    theme_snapshot["customization"] = customization

        # Get next version number
        result = await pool.fetchval(
            """
            SELECT COALESCE(MAX(version_number), 0) + 1
            FROM profile_versions
            WHERE workspace_id = $1 AND profile_type = $2 AND profile_id = $3
            """,
            workspace_id, profile_type, profile_id
        )
        version_number = result or 1

        version_id = uuid4()
        await pool.execute(
            """
            INSERT INTO profile_versions (
                version_id, workspace_id, profile_type, profile_id,
                profile_snapshot, visibility_snapshot, theme_snapshot,
                version_number, label, is_auto_snapshot, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """,
            version_id, workspace_id, profile_type, profile_id,
            json.dumps(profile or {}),
            json.dumps(visibility or {}),
            json.dumps(theme_snapshot),
            version_number, label, is_auto, created_by
        )

        return version_id

    async def create_snapshot(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        label: Optional[str] = None,
        profile_type: str = "company",
        created_by: Optional[UUID] = None
    ) -> dict[str, Any]:
        """Create a manual version snapshot.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            label: Optional label
            profile_type: Type of profile
            created_by: User creating the snapshot

        Returns:
            Created version data.
        """
        version_id = await self._create_version_snapshot(
            workspace_id, profile_id, profile_type,
            label=label, is_auto=False, created_by=created_by
        )

        pool = await get_pool()
        result = await pool.fetchrow(
            "SELECT * FROM profile_versions WHERE version_id = $1",
            version_id
        )

        return self._map_version_row(dict(result))

    async def get_versions(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        profile_type: str = "company",
        limit: int = 30
    ) -> list[dict[str, Any]]:
        """Get version history for a profile.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            profile_type: Type of profile
            limit: Maximum versions to return

        Returns:
            List of version summaries.
        """
        pool = await get_pool()

        rows = await pool.fetch(
            """
            SELECT
                version_id, version_number, label, is_auto_snapshot,
                created_at, created_by
            FROM profile_versions
            WHERE workspace_id = $1 AND profile_type = $2 AND profile_id = $3
            ORDER BY created_at DESC
            LIMIT $4
            """,
            workspace_id, profile_type, profile_id, limit
        )

        return [dict(row) for row in rows]

    async def restore_version(
        self,
        workspace_id: UUID,
        profile_id: UUID,
        version_id: UUID,
        profile_type: str = "company"
    ) -> dict[str, Any]:
        """Restore a profile to a previous version.

        Args:
            workspace_id: Workspace identifier
            profile_id: Profile identifier
            version_id: Version to restore
            profile_type: Type of profile

        Returns:
            Restored profile data.
        """
        pool = await get_pool()

        # Get version
        version = await pool.fetchrow(
            """
            SELECT * FROM profile_versions
            WHERE version_id = $1 AND workspace_id = $2
            """,
            version_id, workspace_id
        )

        if not version:
            raise AppError(
                status_code=404,
                error_code="VERSION_NOT_FOUND",
                message=f"Version {version_id} not found"
            )

        version_data = self._map_version_row(dict(version))

        # Create snapshot of current state before restoring
        await self._create_version_snapshot(
            workspace_id, profile_id, profile_type,
            label="Pre-restore backup", is_auto=True
        )

        # Restore profile data
        profile_snapshot = version_data.get("profile_snapshot", {})
        if profile_snapshot:
            await self.update_profile(workspace_id, profile_snapshot, profile_type)

        # Restore visibility
        visibility_snapshot = version_data.get("visibility_snapshot", {})
        if visibility_snapshot and "field_visibility" in visibility_snapshot:
            await self.update_visibility(
                workspace_id, profile_id,
                {
                    "field_visibility": visibility_snapshot.get("field_visibility", {}),
                    "social_visibility": visibility_snapshot.get("social_visibility", {})
                },
                profile_type
            )

        return await self.get_profile(workspace_id, profile_type)

    # =========================================================================
    # Row Mapping Helpers
    # =========================================================================

    def _map_profile_row(self, row: dict[str, Any]) -> dict[str, Any]:
        """Map a database row to profile dictionary."""
        # Parse JSONB fields
        for field in ["address_structured", "socials", "custom_links",
                     "company_visibility", "color_palette",
                     "typography_config", "layout_preferences"]:
            if field in row and isinstance(row[field], str):
                try:
                    row[field] = json.loads(row[field])
                except (json.JSONDecodeError, TypeError):
                    pass

        # Convert UUIDs to strings
        for field in ["profile_id", "workspace_id", "theme_id", "theme_customization_id"]:
            if field in row and row[field]:
                row[field] = str(row[field])

        # Convert datetimes to ISO format
        for field in ["created_at", "updated_at", "published_at"]:
            if field in row and row[field]:
                row[field] = row[field].isoformat() if hasattr(row[field], 'isoformat') else row[field]

        return row

    def _map_visibility_row(self, row: dict[str, Any]) -> dict[str, Any]:
        """Map a database row to visibility config dictionary."""
        for field in ["field_visibility", "social_visibility"]:
            if field in row and isinstance(row[field], str):
                try:
                    row[field] = json.loads(row[field])
                except (json.JSONDecodeError, TypeError):
                    pass

        for field in ["visibility_config_id", "workspace_id", "profile_id"]:
            if field in row and row[field]:
                row[field] = str(row[field])

        for field in ["created_at", "updated_at"]:
            if field in row and row[field]:
                row[field] = row[field].isoformat() if hasattr(row[field], 'isoformat') else row[field]

        return row

    def _map_theme_row(self, row: dict[str, Any]) -> dict[str, Any]:
        """Map a database row to theme dictionary."""
        for field in ["base_colors", "default_typography", "layout_config", "variants"]:
            if field in row and isinstance(row[field], str):
                try:
                    row[field] = json.loads(row[field])
                except (json.JSONDecodeError, TypeError):
                    pass

        for field in ["theme_id"]:
            if field in row and row[field]:
                row[field] = str(row[field])

        for field in ["created_at", "updated_at"]:
            if field in row and row[field]:
                row[field] = row[field].isoformat() if hasattr(row[field], 'isoformat') else row[field]

        return row

    def _map_customization_row(self, row: dict[str, Any]) -> dict[str, Any]:
        """Map a database row to customization dictionary."""
        for field in ["custom_colors", "custom_typography", "custom_layout"]:
            if field in row and isinstance(row[field], str):
                try:
                    row[field] = json.loads(row[field])
                except (json.JSONDecodeError, TypeError):
                    pass

        for field in ["customization_id", "workspace_id", "theme_id"]:
            if field in row and row[field]:
                row[field] = str(row[field])

        for field in ["created_at", "updated_at"]:
            if field in row and row[field]:
                row[field] = row[field].isoformat() if hasattr(row[field], 'isoformat') else row[field]

        return row

    def _map_version_row(self, row: dict[str, Any]) -> dict[str, Any]:
        """Map a database row to version dictionary."""
        for field in ["profile_snapshot", "visibility_snapshot", "theme_snapshot"]:
            if field in row and isinstance(row[field], str):
                try:
                    row[field] = json.loads(row[field])
                except (json.JSONDecodeError, TypeError):
                    pass

        for field in ["version_id", "workspace_id", "profile_id", "created_by"]:
            if field in row and row[field]:
                row[field] = str(row[field])

        for field in ["created_at"]:
            if field in row and row[field]:
                row[field] = row[field].isoformat() if hasattr(row[field], 'isoformat') else row[field]

        return row


# =============================================================================
# Singleton Instance
# =============================================================================

_profile_editor_service: Optional[ProfileEditorService] = None


def get_profile_editor_service() -> ProfileEditorService:
    """Get singleton instance of ProfileEditorService."""
    global _profile_editor_service
    if _profile_editor_service is None:
        _profile_editor_service = ProfileEditorService()
    return _profile_editor_service
