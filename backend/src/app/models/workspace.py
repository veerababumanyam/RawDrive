"""Pydantic models for Workspace entity with language preferences.

This module contains Workspace-related models with comprehensive localization support:
- Workspace: Core workspace model with language preference fields
- WorkspaceLanguageSettings: Language-specific settings for a workspace
- WorkspaceCreate, WorkspaceUpdate: Request models for workspace operations

These models support the localization infrastructure where workspaces can set
default languages for team members and guests, with support for multi-language
content and regional formatting preferences.

Feature: Localization & Regional Features
Task: T003 - Update User and Workspace models with preferred_language fields
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.language_preference import SupportedLanguage, is_rtl_language


# =============================================================================
# WORKSPACE LANGUAGE SETTINGS MODEL
# =============================================================================


class WorkspaceLanguageSettings(BaseModel):
    """Language-related settings for a workspace.

    Encapsulates all language and locale preferences that can be
    set on a workspace for localization of content and communications.
    """

    # Default language for workspace members
    default_language: str = Field(
        "en-IN",
        max_length=10,
        description="Default language for workspace (e.g., 'en', 'hi', 'te')"
    )

    # Languages enabled for this workspace
    supported_languages: list[str] = Field(
        default=["en"],
        description="Array of language codes enabled for this workspace"
    )

    # Default language for guest/client-facing content
    guest_default_language: str = Field(
        "en",
        max_length=10,
        description="Default language for guest/client-facing content"
    )

    # Regional formatting locales
    date_locale: str = Field(
        "en-IN",
        max_length=10,
        description="Locale for date formatting (e.g., 'en-IN' for dd/mm/yyyy)"
    )

    number_locale: str = Field(
        "en-IN",
        max_length=10,
        description="Locale for number and currency formatting"
    )

    @field_validator("supported_languages", mode="before")
    @classmethod
    def ensure_list(cls, v: Any) -> list[str]:
        """Ensure supported_languages is always a list."""
        if v is None:
            return ["en"]
        if isinstance(v, str):
            return [v]
        return list(v)


# =============================================================================
# WORKSPACE MODEL
# =============================================================================


class Workspace(BaseModel):
    """Core Workspace model with language preferences.

    Represents a workspace in the system with comprehensive language
    and localization support. Maps to the `workspaces` database table.
    """

    model_config = ConfigDict(from_attributes=True)

    # =========================================================================
    # IDENTITY FIELDS
    # =========================================================================

    workspace_id: UUID = Field(..., description="Unique workspace identifier")
    name: str = Field(..., max_length=255, description="Workspace display name")
    slug: str = Field(..., max_length=100, description="URL-friendly slug")
    status: str = Field("active", max_length=50, description="Workspace status")

    # =========================================================================
    # LANGUAGE PREFERENCES (from T001 migration)
    # =========================================================================

    # Default language for workspace members (existing column)
    default_language: str = Field(
        "en-IN",
        max_length=10,
        description="Default language for workspace members"
    )

    # Languages enabled for this workspace (new column from T001)
    supported_languages: list[str] = Field(
        default=["en"],
        description="Array of languages enabled for this workspace"
    )

    # Default language for guest/client content (new column from T001)
    guest_default_language: str = Field(
        "en",
        max_length=10,
        description="Default language for guest/client-facing content"
    )

    # Regional formatting locales (new columns from T001)
    date_locale: str = Field(
        "en-IN",
        max_length=10,
        description="Locale for date formatting (e.g., en-IN for dd/mm/yyyy)"
    )

    number_locale: str = Field(
        "en-IN",
        max_length=10,
        description="Locale for number and currency formatting"
    )

    # =========================================================================
    # TIMESTAMPS
    # =========================================================================

    created_at: datetime = Field(..., description="Workspace creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    # =========================================================================
    # VALIDATORS
    # =========================================================================

    @field_validator("supported_languages", mode="before")
    @classmethod
    def ensure_supported_languages_list(cls, v: Any) -> list[str]:
        """Ensure supported_languages is always a list."""
        if v is None:
            return ["en"]
        if isinstance(v, str):
            return [v]
        return list(v)

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def get_language_settings(self) -> WorkspaceLanguageSettings:
        """Extract language settings as a separate model."""
        return WorkspaceLanguageSettings(
            default_language=self.default_language,
            supported_languages=self.supported_languages,
            guest_default_language=self.guest_default_language,
            date_locale=self.date_locale,
            number_locale=self.number_locale,
        )

    def get_effective_language(self) -> SupportedLanguage:
        """Get the effective default language for this workspace.

        Returns the default language if valid, otherwise falls back to English.
        """
        try:
            return SupportedLanguage(self.default_language.split("-")[0])
        except ValueError:
            return SupportedLanguage.EN

    def get_guest_language(self) -> SupportedLanguage:
        """Get the effective language for guest/client content.

        Returns the guest default language if valid, otherwise falls back
        to workspace default, and finally to English.
        """
        # Try guest default language
        try:
            return SupportedLanguage(self.guest_default_language.split("-")[0])
        except ValueError:
            pass

        # Fall back to workspace default
        return self.get_effective_language()

    def is_language_supported(self, language_code: str) -> bool:
        """Check if a language is enabled for this workspace."""
        # Extract base language code (e.g., "hi" from "hi-IN")
        base_code = language_code.split("-")[0]
        return base_code in self.supported_languages or language_code in self.supported_languages

    @property
    def is_rtl_workspace(self) -> bool:
        """Check if workspace's default language is RTL (right-to-left)."""
        return is_rtl_language(self.get_effective_language())

    @property
    def has_rtl_language(self) -> bool:
        """Check if any supported language is RTL."""
        rtl_codes = {"ur"}  # Urdu is the only RTL language in supported set
        return bool(set(self.supported_languages) & rtl_codes)


# =============================================================================
# WORKSPACE CREATE MODEL
# =============================================================================


class WorkspaceCreate(BaseModel):
    """Model for creating a new workspace."""

    name: str = Field(..., min_length=1, max_length=255, description="Workspace name")
    slug: Optional[str] = Field(
        None,
        min_length=3,
        max_length=100,
        description="URL-friendly slug (auto-generated if not provided)"
    )

    # Language settings (will use defaults if not provided)
    default_language: str = Field(
        "en-IN",
        max_length=10,
        description="Default language for workspace"
    )
    supported_languages: list[str] = Field(
        default=["en"],
        description="Languages enabled for this workspace"
    )
    guest_default_language: str = Field(
        "en",
        max_length=10,
        description="Default language for guest content"
    )
    date_locale: str = Field(
        "en-IN",
        max_length=10,
        description="Locale for date formatting"
    )
    number_locale: str = Field(
        "en-IN",
        max_length=10,
        description="Locale for number/currency formatting"
    )


# =============================================================================
# WORKSPACE UPDATE MODEL
# =============================================================================


class WorkspaceUpdate(BaseModel):
    """Model for updating an existing workspace."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, min_length=3, max_length=100)

    # Language preference updates
    default_language: Optional[str] = Field(None, max_length=10)
    supported_languages: Optional[list[str]] = Field(None)
    guest_default_language: Optional[str] = Field(None, max_length=10)
    date_locale: Optional[str] = Field(None, max_length=10)
    number_locale: Optional[str] = Field(None, max_length=10)


# =============================================================================
# WORKSPACE SUMMARY MODEL
# =============================================================================


class WorkspaceSummary(BaseModel):
    """Lightweight workspace summary for lists and references."""

    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    name: str
    slug: str
    status: str = "active"
    default_language: str = "en-IN"


# =============================================================================
# WORKSPACE WITH LANGUAGE PREFERENCES MODEL
# =============================================================================


class WorkspaceWithLanguagePreferences(Workspace):
    """Workspace model extended with detailed language preferences.

    Includes all context-specific language preferences from the
    language_preferences table in addition to the workspace's base
    language settings.
    """

    # Context-specific preferences (from language_preferences table)
    email_language: Optional[SupportedLanguage] = None
    notification_language: Optional[SupportedLanguage] = None
    invoice_language: Optional[SupportedLanguage] = None
    gallery_language: Optional[SupportedLanguage] = None

    # Additional metadata
    language_preferences_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional language preference metadata"
    )

    # Statistics
    member_language_stats: dict[str, int] = Field(
        default_factory=dict,
        description="Count of members by preferred language"
    )
