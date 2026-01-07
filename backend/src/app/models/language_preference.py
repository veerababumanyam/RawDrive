"""Pydantic models for language preference and localization.

This module contains models for the comprehensive localization system:
- SupportedLanguage: Enum of 13 supported Indian regional languages
- LanguageContext: Contexts where language preferences apply
- LanguagePreferenceSource: How a language preference was determined
- LanguagePreference: Stores detailed language preferences per user/workspace/context

These models support the localization infrastructure where users and workspaces
can set language preferences for different contexts (UI, email, notifications, etc.),
with support for fallback languages and regional formatting preferences.

Feature: Localization & Regional Features
Task: T002 - Create LanguagePreference SQLAlchemy model
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# SUPPORTED LANGUAGE ENUM
# =============================================================================


class SupportedLanguage(str, Enum):
    """Supported languages for localization.

    Based on frontend SUPPORTED_LANGUAGES in i18n/config.ts.
    Includes 13 Indian regional languages commonly used by photographers
    and their clients across India.
    """

    # Primary language
    EN = "en"  # English

    # Indian regional languages
    HI = "hi"  # Hindi (हिन्दी)
    TE = "te"  # Telugu (తెలుగు)
    TA = "ta"  # Tamil (தமிழ்)
    KN = "kn"  # Kannada (ಕನ್ನಡ)
    ML = "ml"  # Malayalam (മലയാളം)
    AS = "as"  # Assamese (অসমীয়া)
    BN = "bn"  # Bengali (বাংলা)
    GU = "gu"  # Gujarati (ગુજરાતી)
    MR = "mr"  # Marathi (मराठी)
    OR = "or"  # Odia (ଓଡ଼ିଆ)
    PA = "pa"  # Punjabi (ਪੰਜਾਬੀ)
    UR = "ur"  # Urdu (اردو) - RTL


# =============================================================================
# LANGUAGE CONTEXT ENUM
# =============================================================================


class LanguageContext(str, Enum):
    """Contexts where language preferences can be applied.

    Allows users to set different language preferences for different
    types of content and communication.
    """

    UI = "ui"  # User interface language
    EMAIL = "email"  # Email communications
    NOTIFICATION = "notification"  # In-app notifications
    INVOICE = "invoice"  # Invoices and billing documents
    GALLERY = "gallery"  # Gallery and client-facing content
    INVITATION = "invitation"  # Event invitations
    REPORT = "report"  # Generated reports


# =============================================================================
# LANGUAGE PREFERENCE SOURCE ENUM
# =============================================================================


class LanguagePreferenceSource(str, Enum):
    """How a language preference was determined.

    Tracks the origin of the preference for analytics and debugging,
    and helps with preference resolution logic.
    """

    USER_SELECTED = "user_selected"  # User explicitly chose this language
    BROWSER_DETECTED = "browser_detected"  # Auto-detected from browser settings
    WORKSPACE_DEFAULT = "workspace_default"  # Inherited from workspace
    SYSTEM_DEFAULT = "system_default"  # System fallback
    API_HEADER = "api_header"  # Set via Accept-Language header
    URL_PARAM = "url_param"  # Set via URL parameter
    COOKIE = "cookie"  # Set via cookie preference
    IMPORTED = "imported"  # Imported from external system


# =============================================================================
# LANGUAGE PREFERENCE MODEL
# =============================================================================


class LanguagePreference(BaseModel):
    """Model for language preference with context-specific settings.

    Represents the language_preferences table storing detailed language
    preferences per user, workspace, and context for comprehensive
    localization support.

    A language preference tracks:
    - Ownership (user, workspace, or guest)
    - Context-specific language settings
    - Regional formatting preferences (date, number, currency, timezone)
    - Preference source and detection metadata
    - Priority for preference resolution
    """

    preference_id: UUID

    # =========================================================================
    # OWNERSHIP AND SCOPE
    # =========================================================================

    # User who owns this preference (NULL for guest/anonymous preferences)
    user_id: Optional[UUID] = Field(
        None,
        description="User who owns this preference (NULL for guest preferences)"
    )

    # Workspace context (NULL for user-level preferences)
    workspace_id: Optional[UUID] = Field(
        None,
        description="Workspace context (NULL for user-level preferences)"
    )

    # Guest identifier for anonymous users (e.g., magic link access)
    guest_identifier: Optional[UUID] = Field(
        None,
        description="Guest identifier for magic link visitors or unauthenticated users"
    )

    # =========================================================================
    # LANGUAGE SETTINGS
    # =========================================================================

    # Context for this preference
    context: LanguageContext = Field(
        LanguageContext.UI,
        description="Context where this language preference applies"
    )

    # Primary language preference
    primary_language: SupportedLanguage = Field(
        SupportedLanguage.EN,
        description="Primary language preference (one of 13 supported languages)"
    )

    # Fallback language if primary language content is unavailable
    fallback_language: SupportedLanguage = Field(
        SupportedLanguage.EN,
        description="Fallback language when primary language content is unavailable"
    )

    # =========================================================================
    # REGIONAL FORMATTING PREFERENCES
    # =========================================================================

    # Locale for date formatting (e.g., 'en-IN', 'hi-IN', 'en-US')
    date_locale: str = Field(
        "en-IN",
        max_length=10,
        description="Locale for date formatting (e.g., en-IN for dd/mm/yyyy)"
    )

    # Locale for number/currency formatting
    number_locale: str = Field(
        "en-IN",
        max_length=10,
        description="Locale for number and currency formatting"
    )

    # Preferred currency for display (ISO 4217)
    currency_code: str = Field(
        "INR",
        max_length=3,
        description="Preferred currency for display (ISO 4217 code)"
    )

    # Timezone for date/time display (IANA identifier)
    timezone: str = Field(
        "Asia/Kolkata",
        max_length=100,
        description="Timezone for date/time display (IANA identifier)"
    )

    # =========================================================================
    # DETECTION AND SOURCE
    # =========================================================================

    # How this preference was determined
    source: LanguagePreferenceSource = Field(
        LanguagePreferenceSource.USER_SELECTED,
        description="How this preference was determined"
    )

    # Whether user has explicitly set this preference
    # vs. it being auto-detected or inherited
    is_explicit: bool = Field(
        False,
        description="Whether user explicitly set this preference vs. auto-detected"
    )

    # =========================================================================
    # STATUS AND METADATA
    # =========================================================================

    # Whether this preference is currently active
    is_active: bool = Field(
        True,
        description="Whether this preference is currently active"
    )

    # Priority for preference resolution (lower = higher priority)
    priority: int = Field(
        100,
        description="Priority for preference resolution (lower = higher priority)"
    )

    # Flexible metadata (e.g., detection confidence, A/B test info)
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata: detection confidence, A/B test info, etc."
    )

    # =========================================================================
    # TIMESTAMPS
    # =========================================================================

    created_at: datetime
    updated_at: datetime


# =============================================================================
# HELPER MODELS FOR API REQUESTS/RESPONSES
# =============================================================================


class LanguagePreferenceCreate(BaseModel):
    """Model for creating a new language preference."""

    user_id: Optional[UUID] = None
    workspace_id: Optional[UUID] = None
    guest_identifier: Optional[UUID] = None

    context: LanguageContext = LanguageContext.UI
    primary_language: SupportedLanguage = SupportedLanguage.EN
    fallback_language: SupportedLanguage = SupportedLanguage.EN

    date_locale: str = Field("en-IN", max_length=10)
    number_locale: str = Field("en-IN", max_length=10)
    currency_code: str = Field("INR", max_length=3)
    timezone: str = Field("Asia/Kolkata", max_length=100)

    source: LanguagePreferenceSource = LanguagePreferenceSource.USER_SELECTED
    is_explicit: bool = False
    priority: int = 100
    metadata: dict[str, Any] = Field(default_factory=dict)


class LanguagePreferenceUpdate(BaseModel):
    """Model for updating an existing language preference."""

    primary_language: Optional[SupportedLanguage] = None
    fallback_language: Optional[SupportedLanguage] = None

    date_locale: Optional[str] = Field(None, max_length=10)
    number_locale: Optional[str] = Field(None, max_length=10)
    currency_code: Optional[str] = Field(None, max_length=3)
    timezone: Optional[str] = Field(None, max_length=100)

    source: Optional[LanguagePreferenceSource] = None
    is_explicit: Optional[bool] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None


class LanguagePreferenceSummary(BaseModel):
    """Lightweight language preference summary for API responses."""

    preference_id: UUID
    context: LanguageContext
    primary_language: SupportedLanguage
    fallback_language: SupportedLanguage
    is_explicit: bool
    source: LanguagePreferenceSource


class ResolvedLanguagePreference(BaseModel):
    """Result of language preference resolution.

    Used when resolving the effective language for a user/workspace/context
    following the priority hierarchy.
    """

    language: SupportedLanguage
    fallback: SupportedLanguage
    source: LanguagePreferenceSource
    is_explicit: bool

    # Regional formatting (included for convenience)
    date_locale: str = "en-IN"
    number_locale: str = "en-IN"
    currency_code: str = "INR"
    timezone: str = "Asia/Kolkata"


class LanguageInfo(BaseModel):
    """Information about a supported language.

    Used for listing available languages in the UI.
    """

    code: SupportedLanguage
    name: str = Field(..., description="Language name in English")
    native_name: str = Field(..., description="Language name in its own script")
    direction: str = Field("ltr", description="Text direction: 'ltr' or 'rtl'")
    flag_emoji: Optional[str] = Field(None, description="Optional flag emoji")

    @classmethod
    def get_all_languages(cls) -> list["LanguageInfo"]:
        """Get information about all supported languages."""
        return [
            cls(code=SupportedLanguage.EN, name="English", native_name="English", direction="ltr"),
            cls(code=SupportedLanguage.HI, name="Hindi", native_name="हिन्दी", direction="ltr"),
            cls(code=SupportedLanguage.TE, name="Telugu", native_name="తెలుగు", direction="ltr"),
            cls(code=SupportedLanguage.TA, name="Tamil", native_name="தமிழ்", direction="ltr"),
            cls(code=SupportedLanguage.KN, name="Kannada", native_name="ಕನ್ನಡ", direction="ltr"),
            cls(code=SupportedLanguage.ML, name="Malayalam", native_name="മലയാളം", direction="ltr"),
            cls(code=SupportedLanguage.AS, name="Assamese", native_name="অসমীয়া", direction="ltr"),
            cls(code=SupportedLanguage.BN, name="Bengali", native_name="বাংলা", direction="ltr"),
            cls(code=SupportedLanguage.GU, name="Gujarati", native_name="ગુજરાતી", direction="ltr"),
            cls(code=SupportedLanguage.MR, name="Marathi", native_name="मराठी", direction="ltr"),
            cls(code=SupportedLanguage.OR, name="Odia", native_name="ଓଡ଼ିଆ", direction="ltr"),
            cls(code=SupportedLanguage.PA, name="Punjabi", native_name="ਪੰਜਾਬੀ", direction="ltr"),
            cls(code=SupportedLanguage.UR, name="Urdu", native_name="اردو", direction="rtl"),
        ]


# =============================================================================
# RTL LANGUAGE UTILITIES
# =============================================================================


RTL_LANGUAGES: set[SupportedLanguage] = {SupportedLanguage.UR}


def is_rtl_language(language: SupportedLanguage) -> bool:
    """Check if a language uses right-to-left text direction."""
    return language in RTL_LANGUAGES


def get_text_direction(language: SupportedLanguage) -> str:
    """Get the text direction for a language ('ltr' or 'rtl')."""
    return "rtl" if is_rtl_language(language) else "ltr"
