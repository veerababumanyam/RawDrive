"""InvitationTemplateService: Template management for digital invitations.

This service provides template operations:
- Template listing and filtering
- Template rendering with customization
- Content internationalization
- Default template content

Feature: 016-save-the-date
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from app.repositories.invitation_repository import (
    InvitationRepository,
    get_invitation_repository,
)


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


class TemplateCategoryNotFoundError(TemplateError):
    """Template category not found."""

    def __init__(self, category: str):
        super().__init__(
            message=f"No templates found for category: {category}",
            code="CATEGORY_NOT_FOUND",
            status_code=404,
        )


# ---------------------------------------------------------------------------
# Default Template Layouts
# ---------------------------------------------------------------------------


# Default layout configurations for different template categories
DEFAULT_LAYOUTS: dict[str, dict[str, Any]] = {
    "wedding": {
        "sections": ["header", "hero", "details", "venue", "rsvp", "footer"],
        "fonts": {
            "heading": "Playfair Display",
            "body": "Inter",
            "accent": "Great Vibes",
        },
        "colors": {
            "primary": "#D4AF37",  # Gold
            "secondary": "#1a1a2e",
            "background": "#faf8f5",
            "text": "#1a1a2e",
            "accent": "#8b7355",
        },
        "positions": {
            "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "hero": {"x": 0, "y": 0, "width": "100%", "height": "60vh"},
            "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "venue": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        },
        "assets": {},
    },
    "birthday": {
        "sections": ["header", "hero", "details", "gallery", "rsvp", "footer"],
        "fonts": {
            "heading": "Poppins",
            "body": "Inter",
            "accent": "Pacifico",
        },
        "colors": {
            "primary": "#FF6B6B",
            "secondary": "#4ECDC4",
            "background": "#ffffff",
            "text": "#2d3436",
            "accent": "#FFE66D",
        },
        "positions": {
            "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "hero": {"x": 0, "y": 0, "width": "100%", "height": "50vh"},
            "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "gallery": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        },
        "assets": {},
    },
    "festival": {
        "sections": ["header", "hero", "details", "schedule", "rsvp", "footer"],
        "fonts": {
            "heading": "Raleway",
            "body": "Open Sans",
            "accent": "Dancing Script",
        },
        "colors": {
            "primary": "#FF9933",  # Saffron
            "secondary": "#128807",  # India Green
            "background": "#fffef0",
            "text": "#333333",
            "accent": "#FFD700",
        },
        "positions": {
            "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "hero": {"x": 0, "y": 0, "width": "100%", "height": "55vh"},
            "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "schedule": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        },
        "assets": {},
    },
    "corporate": {
        "sections": ["header", "hero", "details", "agenda", "rsvp", "footer"],
        "fonts": {
            "heading": "Montserrat",
            "body": "Roboto",
            "accent": "Montserrat",
        },
        "colors": {
            "primary": "#2563EB",
            "secondary": "#0F172A",
            "background": "#ffffff",
            "text": "#1e293b",
            "accent": "#06B6D4",
        },
        "positions": {
            "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "hero": {"x": 0, "y": 0, "width": "100%", "height": "40vh"},
            "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "agenda": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
            "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        },
        "assets": {},
    },
}


# Default i18n content for templates
DEFAULT_CONTENT_I18N: dict[str, dict[str, dict[str, str]]] = {
    "wedding": {
        "en": {
            "heading": "Together with their families",
            "subheading": "request the pleasure of your company",
            "event_label": "Wedding Ceremony",
            "date_label": "Date & Time",
            "venue_label": "Venue",
            "rsvp_heading": "RSVP",
            "rsvp_description": "Please let us know if you can make it",
            "attending_label": "Will you be attending?",
            "yes_label": "Joyfully Accept",
            "no_label": "Respectfully Decline",
            "maybe_label": "Not Sure Yet",
            "footer_text": "We look forward to celebrating with you",
        },
        "hi": {
            "heading": "अपने परिवारों के साथ",
            "subheading": "आपकी उपस्थिति का अनुरोध करते हैं",
            "event_label": "विवाह समारोह",
            "date_label": "तारीख और समय",
            "venue_label": "स्थान",
            "rsvp_heading": "उत्तर दें",
            "rsvp_description": "कृपया हमें बताएं कि क्या आप आ सकते हैं",
            "attending_label": "क्या आप शामिल होंगे?",
            "yes_label": "हर्षपूर्वक स्वीकार",
            "no_label": "सम्मानपूर्वक अस्वीकार",
            "maybe_label": "अभी निश्चित नहीं",
            "footer_text": "हम आपके साथ जश्न मनाने के लिए उत्सुक हैं",
        },
    },
    "birthday": {
        "en": {
            "heading": "You're Invited!",
            "subheading": "Join us for a birthday celebration",
            "event_label": "Birthday Party",
            "date_label": "When",
            "venue_label": "Where",
            "rsvp_heading": "RSVP",
            "rsvp_description": "Let us know if you can join the fun!",
            "attending_label": "Can you make it?",
            "yes_label": "Count me in!",
            "no_label": "Can't make it",
            "maybe_label": "Maybe",
            "footer_text": "Let's party!",
        },
        "hi": {
            "heading": "आप आमंत्रित हैं!",
            "subheading": "जन्मदिन समारोह में शामिल हों",
            "event_label": "जन्मदिन पार्टी",
            "date_label": "कब",
            "venue_label": "कहाँ",
            "rsvp_heading": "उत्तर दें",
            "rsvp_description": "हमें बताएं कि क्या आप मज़े में शामिल हो सकते हैं!",
            "attending_label": "क्या आप आ सकते हैं?",
            "yes_label": "मुझे गिनो!",
            "no_label": "नहीं आ पाऊंगा",
            "maybe_label": "शायद",
            "footer_text": "चलो पार्टी करें!",
        },
    },
    "festival": {
        "en": {
            "heading": "Festival Celebration",
            "subheading": "You are cordially invited",
            "event_label": "Festival Event",
            "date_label": "Date & Time",
            "venue_label": "Venue",
            "rsvp_heading": "RSVP",
            "rsvp_description": "Please confirm your attendance",
            "attending_label": "Will you attend?",
            "yes_label": "Yes, I'll be there",
            "no_label": "Sorry, can't make it",
            "maybe_label": "Not sure",
            "footer_text": "See you there!",
        },
    },
    "corporate": {
        "en": {
            "heading": "You're Invited",
            "subheading": "Please join us for",
            "event_label": "Corporate Event",
            "date_label": "Date & Time",
            "venue_label": "Location",
            "rsvp_heading": "Registration",
            "rsvp_description": "Please confirm your attendance",
            "attending_label": "Will you be attending?",
            "yes_label": "Confirm Attendance",
            "no_label": "Cannot Attend",
            "maybe_label": "Tentative",
            "footer_text": "We look forward to seeing you",
        },
    },
}


# ---------------------------------------------------------------------------
# Invitation Template Service
# ---------------------------------------------------------------------------


class InvitationTemplateService:
    """Service for managing invitation templates.

    Provides:
    - Template listing and filtering
    - Template rendering with customization
    - Default layout and content generation
    - Multi-language content support
    """

    # Supported categories
    CATEGORIES = [
        "wedding",
        "birthday",
        "anniversary",
        "baby_shower",
        "engagement",
        "festival",
        "corporate",
        "other",
    ]

    # Supported languages
    LANGUAGES = ["en", "hi", "ta", "te", "kn", "ml"]

    def __init__(
        self,
        invitation_repo: Optional[InvitationRepository] = None,
    ):
        self.repo = invitation_repo or get_invitation_repository()

    # =========================================================================
    # TEMPLATE CRUD
    # =========================================================================

    async def create_template(
        self,
        name: str,
        category: str,
        workspace_id: Optional[UUID] = None,
        description: Optional[str] = None,
        subcategory: Optional[str] = None,
        tags: Optional[list[str]] = None,
        layout: Optional[dict[str, Any]] = None,
        content_i18n: Optional[dict[str, dict[str, str]]] = None,
        supported_languages: Optional[list[str]] = None,
        preview_image_url: Optional[str] = None,
        thumbnail_url: Optional[str] = None,
        is_premium: bool = False,
    ) -> dict[str, Any]:
        """Create a new template.

        Args:
            name: Template name
            category: Template category
            workspace_id: Optional workspace ID (None for global templates)
            description: Template description
            subcategory: Optional subcategory
            tags: Template tags for filtering
            layout: Layout configuration
            content_i18n: Internationalized content
            supported_languages: Languages this template supports
            preview_image_url: Full preview image URL
            thumbnail_url: Thumbnail URL
            is_premium: Whether template requires premium subscription

        Returns:
            Created template
        """
        template_id = uuid4()

        # Use default layout if not provided
        final_layout = layout or DEFAULT_LAYOUTS.get(category, DEFAULT_LAYOUTS["wedding"])

        # Use default i18n content if not provided
        final_i18n = content_i18n or DEFAULT_CONTENT_I18N.get(category, DEFAULT_CONTENT_I18N["wedding"])

        # Default supported languages
        final_languages = supported_languages or ["en"]

        template = await self.repo.create_template(
            template_id=template_id,
            workspace_id=workspace_id,
            name=name,
            description=description,
            category=category,
            subcategory=subcategory,
            tags=tags or [],
            layout=final_layout,
            content_i18n=final_i18n,
            supported_languages=final_languages,
            preview_image_url=preview_image_url,
            thumbnail_url=thumbnail_url,
            is_premium=is_premium,
        )

        logger.info(
            "Template created",
            extra={
                "template_id": str(template_id),
                "name": name,
                "category": category,
            },
        )

        return template

    async def get_template(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Get a template by ID.

        Args:
            template_id: Template ID
            workspace_id: Optional workspace ID for workspace-specific templates

        Returns:
            Template data

        Raises:
            TemplateNotFoundError: Template not found
        """
        template = await self.repo.get_template(
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
        subcategory: Optional[str] = None,
        tags: Optional[list[str]] = None,
        layout: Optional[dict[str, Any]] = None,
        content_i18n: Optional[dict[str, dict[str, str]]] = None,
        supported_languages: Optional[list[str]] = None,
        preview_image_url: Optional[str] = None,
        thumbnail_url: Optional[str] = None,
        is_active: Optional[bool] = None,
        is_premium: Optional[bool] = None,
    ) -> dict[str, Any]:
        """Update a template.

        Args:
            template_id: Template ID
            workspace_id: Workspace ID for workspace-specific templates
            ... (update fields)

        Returns:
            Updated template

        Raises:
            TemplateNotFoundError: Template not found
        """
        updates: dict[str, Any] = {}

        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description
        if category is not None:
            updates["category"] = category
        if subcategory is not None:
            updates["subcategory"] = subcategory
        if tags is not None:
            updates["tags"] = tags
        if layout is not None:
            updates["layout"] = layout
        if content_i18n is not None:
            updates["content_i18n"] = content_i18n
        if supported_languages is not None:
            updates["supported_languages"] = supported_languages
        if preview_image_url is not None:
            updates["preview_image_url"] = preview_image_url
        if thumbnail_url is not None:
            updates["thumbnail_url"] = thumbnail_url
        if is_active is not None:
            updates["is_active"] = is_active
        if is_premium is not None:
            updates["is_premium"] = is_premium

        if not updates:
            return await self.get_template(template_id, workspace_id)

        template = await self.repo.update_template(
            template_id=template_id,
            workspace_id=workspace_id,
            **updates,
        )

        if not template:
            raise TemplateNotFoundError(str(template_id))

        logger.info(
            "Template updated",
            extra={
                "template_id": str(template_id),
                "fields": list(updates.keys()),
            },
        )

        return template

    async def delete_template(
        self,
        template_id: UUID,
        workspace_id: Optional[UUID] = None,
    ) -> bool:
        """Delete a template (soft delete via is_active=False).

        Args:
            template_id: Template ID
            workspace_id: Workspace ID for workspace-specific templates

        Returns:
            True if deleted

        Raises:
            TemplateNotFoundError: Template not found
        """
        template = await self.repo.update_template(
            template_id=template_id,
            workspace_id=workspace_id,
            is_active=False,
        )

        if not template:
            raise TemplateNotFoundError(str(template_id))

        logger.info(
            "Template deleted",
            extra={"template_id": str(template_id)},
        )

        return True

    # =========================================================================
    # TEMPLATE LISTING
    # =========================================================================

    async def list_templates(
        self,
        workspace_id: Optional[UUID] = None,
        category: Optional[str] = None,
        subcategory: Optional[str] = None,
        language: Optional[str] = None,
        tags: Optional[list[str]] = None,
        is_premium: Optional[bool] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        """List templates with filtering.

        Args:
            workspace_id: Optional workspace ID (includes workspace and global templates)
            category: Filter by category
            subcategory: Filter by subcategory
            language: Filter by supported language
            tags: Filter by tags (any match)
            is_premium: Filter by premium status
            search: Search in name/description
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Paginated template list
        """
        return await self.repo.list_templates(
            workspace_id=workspace_id,
            category=category,
            subcategory=subcategory,
            language=language,
            tags=tags,
            is_premium=is_premium,
            search=search,
            page=page,
            limit=limit,
        )

    async def list_categories(self) -> list[dict[str, Any]]:
        """List available template categories with counts.

        Returns:
            List of categories with template counts
        """
        categories = []
        for category in self.CATEGORIES:
            result = await self.repo.list_templates(
                category=category,
                page=1,
                limit=1,
            )
            categories.append({
                "category": category,
                "count": result.get("total", 0),
            })
        return categories

    # =========================================================================
    # TEMPLATE RENDERING
    # =========================================================================

    def get_default_layout(self, category: str) -> dict[str, Any]:
        """Get default layout for a category.

        Args:
            category: Template category

        Returns:
            Default layout configuration
        """
        return DEFAULT_LAYOUTS.get(category, DEFAULT_LAYOUTS["wedding"]).copy()

    def get_default_content(
        self,
        category: str,
        language: str = "en",
    ) -> dict[str, str]:
        """Get default content for a category and language.

        Args:
            category: Template category
            language: Language code

        Returns:
            Default content strings
        """
        category_content = DEFAULT_CONTENT_I18N.get(category, DEFAULT_CONTENT_I18N["wedding"])
        return category_content.get(language, category_content.get("en", {})).copy()

    def render_template(
        self,
        template: dict[str, Any],
        customization: dict[str, Any],
        language: str = "en",
    ) -> dict[str, Any]:
        """Render a template with customization applied.

        Merges template defaults with user customization.

        Args:
            template: Template data
            customization: User customization overrides
            language: Content language

        Returns:
            Rendered template configuration
        """
        # Start with template layout
        layout = template.get("layout", {}).copy()

        # Apply customization overrides
        custom_colors = customization.get("colors", {})
        if custom_colors and "colors" in layout:
            layout["colors"] = {**layout["colors"], **custom_colors}

        custom_fonts = customization.get("fonts", {})
        if custom_fonts and "fonts" in layout:
            layout["fonts"] = {**layout["fonts"], **custom_fonts}

        # Get content in requested language
        content_i18n = template.get("content_i18n", {})
        content = content_i18n.get(language, content_i18n.get("en", {})).copy()

        # Apply content customization
        custom_content = customization.get("content", {})
        content = {**content, **custom_content}

        return {
            "layout": layout,
            "content": content,
            "language": language,
            "supported_languages": template.get("supported_languages", ["en"]),
        }

    # =========================================================================
    # LANGUAGE SUPPORT
    # =========================================================================

    def get_supported_languages(self) -> list[dict[str, str]]:
        """Get list of supported languages.

        Returns:
            List of language info with codes and names
        """
        language_names = {
            "en": "English",
            "hi": "हिन्दी (Hindi)",
            "ta": "தமிழ் (Tamil)",
            "te": "తెలుగు (Telugu)",
            "kn": "ಕನ್ನಡ (Kannada)",
            "ml": "മലയാളം (Malayalam)",
        }
        return [
            {"code": code, "name": language_names.get(code, code)}
            for code in self.LANGUAGES
        ]

    def get_font_for_language(self, language: str) -> str:
        """Get recommended font for a language.

        Args:
            language: Language code

        Returns:
            Font family name
        """
        language_fonts = {
            "en": "Inter",
            "hi": "Noto Sans Devanagari",
            "ta": "Noto Sans Tamil",
            "te": "Noto Sans Telugu",
            "kn": "Noto Sans Kannada",
            "ml": "Noto Sans Malayalam",
        }
        return language_fonts.get(language, "Inter")


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------


def get_invitation_template_service() -> InvitationTemplateService:
    """Get an InvitationTemplateService instance."""
    return InvitationTemplateService()
