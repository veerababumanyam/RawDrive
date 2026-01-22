"""Gallery Design Template Service.

Manages custom and system Gallery Design Studio templates.

Features:
- CRUD operations (Create, Read, Update, Delete)
- Template listing with filtering (workspace, category, tags)
- Two-tier template system (system + custom per workspace)
- Soft-delete via is_active flag
- Thumbnail generation via Playwright
- Template search and categorization

Feature: Enhancement 3 - Custom Templates
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Error Types
# ---------------------------------------------------------------------------


class TemplateError(Exception):
    """Base exception for template errors."""

    def __init__(
        self,
        message: str,
        code: str,
        status_code: int = 400,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class TemplateNotFoundError(TemplateError):
    """Template not found."""

    def __init__(self, template_id: Optional[str] = None):
        super().__init__(
            message="Template not found" + (f": {template_id}" if template_id else ""),
            code="TEMPLATE_NOT_FOUND",
            status_code=404,
        )


class TemplateAlreadyExistsError(TemplateError):
    """Template with this name already exists in workspace."""

    def __init__(self, name: str):
        super().__init__(
            message=f"Template with name '{name}' already exists in this workspace",
            code="TEMPLATE_ALREADY_EXISTS",
            status_code=409,
        )


class InvalidDesignConfigError(TemplateError):
    """Invalid design configuration."""

    def __init__(self, reason: str):
        super().__init__(
            message=f"Invalid design configuration: {reason}",
            code="INVALID_DESIGN_CONFIG",
            status_code=400,
        )


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


TEMPLATE_CATEGORIES = [
    "wedding",
    "portrait",
    "event",
    "product",
    "landscape",
    "other",
]

# Default category for templates
DEFAULT_CATEGORY = "other"


# ---------------------------------------------------------------------------
# Gallery Design Template Service
# ---------------------------------------------------------------------------


class GalleryDesignTemplateService:
    """Service for managing Gallery Design Studio templates.

    Handles:
    - Template CRUD operations
    - System and workspace-specific templates
    - Thumbnail generation
    - Filtering and search
    - Soft-delete pattern
    """

    def __init__(self, db_session: Optional[Any] = None, repository: Optional[Any] = None):
        """Initialize the template service.

        Args:
            db_session: SQLAlchemy database session
            repository: GalleryDesignTemplateRepository instance
        """
        self.db = db_session
        self.repository = repository

    # =========================================================================
    # TEMPLATE CRUD
    # =========================================================================

    async def create_template(
        self,
        workspace_id: Optional[UUID],
        name: str,
        design_config: dict[str, Any],
        category: str = DEFAULT_CATEGORY,
        description: Optional[str] = None,
        tags: Optional[list[str]] = None,
        is_system: bool = False,
        generate_thumbnail: bool = True,
    ) -> dict[str, Any]:
        """Create a new template.

        Args:
            workspace_id: Workspace ID (None for system templates)
            name: Template name (unique per workspace)
            design_config: Complete GalleryDesignConfig as dict
            category: Template category (wedding, portrait, event, etc.)
            description: Optional template description
            tags: Optional searchable tags
            is_system: Whether this is a system template
            generate_thumbnail: Whether to generate thumbnail preview

        Returns:
            Created template with all metadata

        Raises:
            TemplateAlreadyExistsError: If template name exists in workspace
            InvalidDesignConfigError: If design_config is invalid
        """
        # Validate category
        if category not in TEMPLATE_CATEGORIES:
            raise InvalidDesignConfigError(
                f"Category '{category}' not in allowed list: {TEMPLATE_CATEGORIES}"
            )

        # Validate design_config structure
        self._validate_design_config(design_config)

        # Generate template ID
        template_id = uuid4()

        # Generate thumbnail if requested
        thumbnail_url = None
        thumbnail_asset_id = None
        if generate_thumbnail:
            thumbnail_url, thumbnail_asset_id = await self._generate_thumbnail(
                template_id=template_id,
                design_config=design_config,
                workspace_id=workspace_id,
            )

        logger.info(
            "Creating gallery design template",
            extra={
                "template_id": str(template_id),
                "workspace_id": str(workspace_id) if workspace_id else "system",
                "name": name,
                "category": category,
            },
        )

        # Create template via repository
        template = await self.repository.create_template(
            template_id=template_id,
            workspace_id=workspace_id,
            name=name,
            description=description,
            category=category,
            tags=tags or [],
            design_config=design_config,
            thumbnail_url=thumbnail_url,
            thumbnail_asset_id=thumbnail_asset_id,
            is_system=is_system,
            created_by_user_id=None,  # Will be set by API layer
        )

        return template

    async def get_template(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Get template by ID.

        Args:
            template_id: Template ID
            workspace_id: Workspace ID for permission checking

        Returns:
            Template data with all fields

        Raises:
            TemplateNotFoundError: Template not found or not accessible
        """
        template = await self.repository.get_by_id(
            template_id=template_id,
            workspace_id=workspace_id,
        )

        if not template:
            raise TemplateNotFoundError(str(template_id))

        return template

    async def update_template(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[list[str]] = None,
        design_config: Optional[dict[str, Any]] = None,
        is_active: Optional[bool] = None,
    ) -> dict[str, Any]:
        """Update an existing template.

        Args:
            template_id: Template ID to update
            workspace_id: Workspace ID for permission checking
            name: New template name (optional)
            description: New description (optional)
            category: New category (optional)
            tags: New tags list (optional)
            design_config: New design configuration (optional)
            is_active: Active status (optional)

        Returns:
            Updated template

        Raises:
            TemplateNotFoundError: Template not found
            TemplateAlreadyExistsError: New name already exists
            InvalidDesignConfigError: Invalid design config
        """
        # Get existing template
        existing = await self.get_template(template_id, workspace_id)

        # Validate design_config if provided
        if design_config:
            self._validate_design_config(design_config)

        # Validate category if provided
        if category and category not in TEMPLATE_CATEGORIES:
            raise InvalidDesignConfigError(
                f"Category '{category}' not in allowed list: {TEMPLATE_CATEGORIES}"
            )

        # Build updates dict
        updates: dict[str, Any] = {}
        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description
        if category is not None:
            updates["category"] = category
        if tags is not None:
            updates["tags"] = tags
        if design_config is not None:
            updates["design_config"] = design_config
        if is_active is not None:
            updates["is_active"] = is_active

        # Add timestamp
        updates["updated_at"] = datetime.now(timezone.utc)

        # Update via repository
        updated_template = await self.repository.update(
            template_id=template_id,
            workspace_id=workspace_id,
            updates=updates,
        )

        logger.info(
            "Updated gallery design template",
            extra={
                "template_id": str(template_id),
                "updated_fields": list(updates.keys()),
            },
        )

        return updated_template

    async def delete_template(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID] = None,
        hard_delete: bool = False,
    ) -> None:
        """Delete a template (soft-delete by default).

        Args:
            template_id: Template ID to delete
            workspace_id: Workspace ID for permission checking
            hard_delete: If True, permanently delete. If False, soft-delete.
        """
        if hard_delete:
            await self.repository.delete_hard(
                template_id=template_id,
                workspace_id=workspace_id,
            )
            logger.info(
                "Hard-deleted gallery design template",
                extra={"template_id": str(template_id)},
            )
        else:
            # Soft-delete by setting is_active=False
            await self.repository.update(
                template_id=template_id,
                workspace_id=workspace_id,
                updates={"is_active": False, "updated_at": datetime.now(timezone.utc)},
            )
            logger.info(
                "Soft-deleted gallery design template",
                extra={"template_id": str(template_id)},
            )

    # =========================================================================
    # TEMPLATE LISTING & FILTERING
    # =========================================================================

    async def list_templates(
        self,
        workspace_id: Optional[UUID] = None,
        category: Optional[str] = None,
        search: Optional[str] = None,
        tags: Optional[list[str]] = None,
        page: int = 1,
        limit: int = 20,
        include_system: bool = True,
    ) -> dict[str, Any]:
        """List templates with optional filtering.

        Args:
            workspace_id: Filter by workspace (None = system + workspace templates)
            category: Filter by category
            search: Search by name or description (case-insensitive)
            tags: Filter by tags (AND logic - must have all tags)
            page: Page number (1-indexed)
            limit: Results per page (max 100)
            include_system: Include system templates in results

        Returns:
            Paginated template list with metadata
        """
        # Validate category if provided
        if category and category not in TEMPLATE_CATEGORIES:
            raise InvalidDesignConfigError(
                f"Category '{category}' not in allowed list: {TEMPLATE_CATEGORIES}"
            )

        # Ensure reasonable pagination
        limit = min(limit, 100)
        page = max(page, 1)

        # Call repository with filters
        result = await self.repository.list_with_filters(
            workspace_id=workspace_id,
            category=category,
            search=search,
            tags=tags,
            page=page,
            limit=limit,
            include_system=include_system,
            only_active=True,  # Only return is_active=True templates
        )

        return result

    async def search_templates(
        self,
        workspace_id: Optional[UUID],
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Quick search templates by name or tags.

        Args:
            workspace_id: Workspace ID
            query: Search query
            limit: Max results

        Returns:
            List of matching templates
        """
        results = await self.repository.search(
            workspace_id=workspace_id,
            query=query,
            limit=min(limit, 50),
            only_active=True,
        )
        return results

    # =========================================================================
    # TEMPLATE APPLICATION
    # =========================================================================

    async def apply_template(
        self,
        template_id: UUID,
        current_config: dict[str, Any],
        workspace_id: Optional[UUID] = None,
        preserve_cover_asset: bool = True,
    ) -> dict[str, Any]:
        """Apply template by merging with current config.

        Args:
            template_id: Template to apply
            current_config: Current gallery design config
            workspace_id: Workspace ID
            preserve_cover_asset: If True, keep current cover asset

        Returns:
            Merged design configuration

        Raises:
            TemplateNotFoundError: Template not found
        """
        template = await self.get_template(template_id, workspace_id)
        template_config = template.get("design_config", {})

        # Merge configurations
        merged_config = {
            **template_config,
        }

        # Preserve cover asset and image URL if requested
        if preserve_cover_asset and "cover" in current_config:
            current_cover = current_config["cover"]
            if "asset_id" in current_cover or "imageUrl" in current_cover:
                merged_config["cover"] = {
                    **merged_config.get("cover", {}),
                    "asset_id": current_cover.get("asset_id"),
                    "imageUrl": current_cover.get("imageUrl"),
                }

        logger.info(
            "Applied gallery design template",
            extra={
                "template_id": str(template_id),
                "workspace_id": str(workspace_id) if workspace_id else "system",
            },
        )

        return merged_config

    # =========================================================================
    # VALIDATION
    # =========================================================================

    def _validate_design_config(self, config: dict[str, Any]) -> None:
        """Validate design configuration structure.

        Args:
            config: Design configuration dict

        Raises:
            InvalidDesignConfigError: If validation fails
        """
        required_sections = ["cover", "typography", "theme", "grid"]

        for section in required_sections:
            if section not in config:
                raise InvalidDesignConfigError(f"Missing required section: {section}")

            if not isinstance(config[section], dict):
                raise InvalidDesignConfigError(
                    f"Section '{section}' must be an object, got {type(config[section])}"
                )

        # Basic cover validation
        cover = config.get("cover", {})
        if "focalPoint" in cover:
            fp = cover["focalPoint"]
            if not isinstance(fp, dict) or "x" not in fp or "y" not in fp:
                raise InvalidDesignConfigError(
                    "focalPoint must have x and y properties (0-100)"
                )

            if not (0 <= fp.get("x", 0) <= 100) or not (0 <= fp.get("y", 0) <= 100):
                raise InvalidDesignConfigError(
                    "focalPoint x and y must be between 0 and 100"
                )

    # =========================================================================
    # THUMBNAIL GENERATION
    # =========================================================================

    async def _generate_thumbnail(
        self,
        template_id: UUID,
        design_config: dict[str, Any],
        workspace_id: Optional[UUID],
    ) -> tuple[Optional[str], Optional[UUID]]:
        """Generate template thumbnail via Playwright.

        This method would:
        1. Render the cover style with sample data
        2. Capture screenshot at 640x360px (16:9)
        3. Upload to R2 storage
        4. Return thumbnail URL and asset_id

        For now, returns None (to be implemented with Playwright integration)

        Args:
            template_id: Template ID
            design_config: Design configuration
            workspace_id: Workspace ID

        Returns:
            Tuple of (thumbnail_url, thumbnail_asset_id)
        """
        # TODO: Implement Playwright-based thumbnail generation
        # See: backend/src/app/services/invitation_preview_service.py
        #
        # Steps:
        # 1. Create headless browser context
        # 2. Render HTML with cover style + design config
        # 3. Capture screenshot: width=640, height=360, type="webp"
        # 4. Upload to R2: workspaces/{workspace_id}/templates/{template_id}/thumbnail.webp
        # 5. Generate signed URL (1hr TTL)
        # 6. Return (thumbnail_url, thumbnail_asset_id)

        logger.debug(
            "Thumbnail generation not yet implemented",
            extra={"template_id": str(template_id)},
        )

        return None, None


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------


def get_gallery_design_template_service(
    db_session: Optional[Any] = None,
    repository: Optional[Any] = None,
) -> GalleryDesignTemplateService:
    """Get or create Gallery Design Template Service instance.

    Args:
        db_session: Database session
        repository: Repository instance

    Returns:
        GalleryDesignTemplateService instance
    """
    return GalleryDesignTemplateService(
        db_session=db_session,
        repository=repository,
    )
