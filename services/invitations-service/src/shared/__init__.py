"""Shared module for invitations-service.

Contains constants, types, and validation utilities used across the service.
"""

from src.shared.constants import (
    # API Constants
    API_VERSION,
    API_BASE,
    WORKSPACE_PATHS,
    PUBLIC_PATHS,
    STORAGE,
    FILE_LIMITS,
    STORAGE_KEYS,
    AI_THRESHOLDS,
    PAGINATION,
    RATE_LIMITS,
    # Multi-Language Support (T001)
    LANGUAGE_CODES,
    DEFAULT_LANGUAGE,
    DEFAULT_LOCALE,
    SUPPORTED_LANGUAGES,
    VALID_LANGUAGE_CODES,
    SCRIPT_LANGUAGES,
    SCRIPT_FONTS,
    LANGUAGE_CULTURAL_CONTEXT,
    INVITATION_UI_LABELS,
    SupportedLanguage,
    get_language_config,
    get_font_for_language,
    get_ui_labels,
    get_cultural_context,
    is_valid_language,
    get_all_languages,
)

__all__ = [
    # API Constants
    "API_VERSION",
    "API_BASE",
    "WORKSPACE_PATHS",
    "PUBLIC_PATHS",
    "STORAGE",
    "FILE_LIMITS",
    "STORAGE_KEYS",
    "AI_THRESHOLDS",
    "PAGINATION",
    "RATE_LIMITS",
    # Multi-Language Support (T001)
    "LANGUAGE_CODES",
    "DEFAULT_LANGUAGE",
    "DEFAULT_LOCALE",
    "SUPPORTED_LANGUAGES",
    "VALID_LANGUAGE_CODES",
    "SCRIPT_LANGUAGES",
    "SCRIPT_FONTS",
    "LANGUAGE_CULTURAL_CONTEXT",
    "INVITATION_UI_LABELS",
    "SupportedLanguage",
    "get_language_config",
    "get_font_for_language",
    "get_ui_labels",
    "get_cultural_context",
    "is_valid_language",
    "get_all_languages",
]
