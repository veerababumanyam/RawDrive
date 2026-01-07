"""Pydantic models for User entity with language preferences.

This module contains User-related models with comprehensive localization support:
- User: Core user model with language preference fields
- UserLanguageSettings: Language-specific settings for a user
- UserCreate, UserUpdate: Request models for user operations

These models support the localization infrastructure where users can set
language preferences for different contexts (UI, email, notifications, etc.),
with support for fallback languages and regional formatting preferences.

Feature: Localization & Regional Features
Task: T003 - Update User and Workspace models with preferred_language fields
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.language_preference import SupportedLanguage


# =============================================================================
# USER LANGUAGE SETTINGS MODEL
# =============================================================================


class UserLanguageSettings(BaseModel):
    """Language-related settings for a user.

    Encapsulates all language and locale preferences that can be
    set on a user profile for localization.
    """

    # Primary language for UI and content
    preferred_language: str = Field(
        "en-IN",
        max_length=10,
        description="Primary language preference (e.g., 'en', 'hi', 'te')"
    )

    # Fallback language when primary language content is unavailable
    secondary_language: Optional[str] = Field(
        None,
        max_length=10,
        description="Fallback language when primary is unavailable"
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

    # How the language preference was detected/set
    language_detected_from: Optional[str] = Field(
        None,
        max_length=30,
        description="Source of language detection: browser, ip_geolocation, user_selected, etc."
    )


# =============================================================================
# USER MODEL
# =============================================================================


class User(BaseModel):
    """Core User model with language preferences.

    Represents a user in the system with comprehensive language
    and localization support. Maps to the `users` database table.
    """

    model_config = ConfigDict(from_attributes=True)

    # =========================================================================
    # IDENTITY FIELDS
    # =========================================================================

    user_id: UUID = Field(..., description="Unique user identifier")
    email: EmailStr = Field(..., description="User email address")
    display_name: str = Field(..., max_length=255, description="Display name")

    # =========================================================================
    # VERIFICATION STATUS
    # =========================================================================

    email_verified: bool = Field(False, description="Whether email is verified")
    email_verified_at: Optional[datetime] = Field(
        None, description="When email was verified"
    )

    # =========================================================================
    # LANGUAGE PREFERENCES (from T001 migration)
    # =========================================================================

    # Primary language preference (existing column)
    preferred_language: str = Field(
        "en-IN",
        max_length=10,
        description="Primary language preference"
    )

    # Secondary/fallback language (new column from T001)
    secondary_language: Optional[str] = Field(
        None,
        max_length=10,
        description="Fallback language when primary is unavailable"
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

    # Language detection source (new column from T001)
    language_detected_from: Optional[str] = Field(
        None,
        max_length=30,
        description="Source of automatic language detection"
    )

    # =========================================================================
    # TIMESTAMPS
    # =========================================================================

    created_at: datetime = Field(..., description="Account creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    disabled_at: Optional[datetime] = Field(
        None, description="When account was disabled"
    )

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def get_language_settings(self) -> UserLanguageSettings:
        """Extract language settings as a separate model."""
        return UserLanguageSettings(
            preferred_language=self.preferred_language,
            secondary_language=self.secondary_language,
            date_locale=self.date_locale,
            number_locale=self.number_locale,
            language_detected_from=self.language_detected_from,
        )

    def get_effective_language(self) -> SupportedLanguage:
        """Get the effective language for this user.

        Returns the primary language if valid, otherwise falls back
        to secondary language, and finally to English.
        """
        # Try primary language
        try:
            return SupportedLanguage(self.preferred_language.split("-")[0])
        except ValueError:
            pass

        # Try secondary language
        if self.secondary_language:
            try:
                return SupportedLanguage(self.secondary_language.split("-")[0])
            except ValueError:
                pass

        # Default to English
        return SupportedLanguage.EN

    @property
    def is_rtl_user(self) -> bool:
        """Check if user's preferred language is RTL (right-to-left)."""
        from app.models.language_preference import is_rtl_language
        return is_rtl_language(self.get_effective_language())


# =============================================================================
# USER CREATE MODEL
# =============================================================================


class UserCreate(BaseModel):
    """Model for creating a new user."""

    email: EmailStr = Field(..., description="User email address")
    display_name: str = Field(..., min_length=1, max_length=255, description="Display name")

    # Optional language settings (will use defaults if not provided)
    preferred_language: str = Field(
        "en-IN",
        max_length=10,
        description="Primary language preference"
    )
    secondary_language: Optional[str] = Field(
        None,
        max_length=10,
        description="Fallback language"
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
    language_detected_from: Optional[str] = Field(
        None,
        max_length=30,
        description="Source of language detection"
    )


# =============================================================================
# USER UPDATE MODEL
# =============================================================================


class UserUpdate(BaseModel):
    """Model for updating an existing user."""

    display_name: Optional[str] = Field(None, min_length=1, max_length=255)

    # Language preference updates
    preferred_language: Optional[str] = Field(None, max_length=10)
    secondary_language: Optional[str] = Field(None, max_length=10)
    date_locale: Optional[str] = Field(None, max_length=10)
    number_locale: Optional[str] = Field(None, max_length=10)
    language_detected_from: Optional[str] = Field(None, max_length=30)


# =============================================================================
# USER SUMMARY MODEL
# =============================================================================


class UserSummary(BaseModel):
    """Lightweight user summary for lists and references."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    display_name: str
    preferred_language: str = "en-IN"


# =============================================================================
# USER WITH LANGUAGE PREFERENCES MODEL
# =============================================================================


class UserWithLanguagePreferences(User):
    """User model extended with detailed language preferences.

    Includes all context-specific language preferences from the
    language_preferences table in addition to the user's base
    language settings.
    """

    # Context-specific preferences (from language_preferences table)
    ui_language: Optional[SupportedLanguage] = None
    email_language: Optional[SupportedLanguage] = None
    notification_language: Optional[SupportedLanguage] = None

    # Additional metadata
    language_preferences_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional language preference metadata"
    )
