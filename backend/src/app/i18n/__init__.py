"""Internationalization (i18n) module for RawDrive backend.

This module provides localization support for backend error messages,
email templates, and notification content.

Components:
- error_messages: Translations for API error messages in 13 languages
- (future) notification_messages: Localized notification templates
- (future) email_templates: Localized email templates

Feature: Localization & Regional Features
"""

from app.i18n.error_messages import (
    ERROR_MESSAGES,
    get_error_message,
    get_error_messages_for_locale,
    ErrorMessageKey,
)

__all__ = [
    "ERROR_MESSAGES",
    "get_error_message",
    "get_error_messages_for_locale",
    "ErrorMessageKey",
]
