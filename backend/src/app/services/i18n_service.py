"""Internationalization (i18n) service with locale resolution logic.

This module provides the I18nService class that handles language preference
management and locale resolution for the comprehensive localization system.

The service supports:
- Language preference resolution following a priority hierarchy
- User, workspace, and guest-level preferences
- Context-specific language settings (UI, email, notifications, etc.)
- Browser language detection from Accept-Language headers
- Regional formatting preferences (date, number, currency, timezone)
- Language validation and fallback handling
- Caching of resolved preferences for performance

Resolution Priority (highest to lowest):
1. User-specific preference for workspace+context
2. User-level preference for context (no workspace)
3. Workspace default for context
4. Guest preference (for magic link visitors)
5. Browser-detected language (Accept-Language header)
6. System default (English)

Feature: Localization & Regional Features
Task: T005 - Create i18n service with locale resolution logic
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional
from uuid import UUID

from app.db.redis import get_redis_client
from app.models.language_preference import (
    LanguageContext,
    LanguageInfo,
    LanguagePreferenceSource,
    ResolvedLanguagePreference,
    SupportedLanguage,
    get_text_direction,
    is_rtl_language,
)
from app.repositories.i18n_repository import I18nRepository, get_i18n_repository

logger = logging.getLogger(__name__)


# =============================================================================
# CONSTANTS
# =============================================================================

# Cache settings
CACHE_PREFIX = "i18n"
CACHE_TTL_SECONDS = 300  # 5 minutes
RESOLVED_PREF_CACHE_TTL = 60  # 1 minute for resolved preferences

# Default values
DEFAULT_LANGUAGE = SupportedLanguage.EN
DEFAULT_FALLBACK = SupportedLanguage.EN
DEFAULT_DATE_LOCALE = "en-IN"
DEFAULT_NUMBER_LOCALE = "en-IN"
DEFAULT_CURRENCY = "INR"
DEFAULT_TIMEZONE = "Asia/Kolkata"

# Mapping of full locale codes to supported languages
LOCALE_TO_LANGUAGE: dict[str, SupportedLanguage] = {
    "en": SupportedLanguage.EN,
    "en-IN": SupportedLanguage.EN,
    "en-US": SupportedLanguage.EN,
    "en-GB": SupportedLanguage.EN,
    "hi": SupportedLanguage.HI,
    "hi-IN": SupportedLanguage.HI,
    "te": SupportedLanguage.TE,
    "te-IN": SupportedLanguage.TE,
    "ta": SupportedLanguage.TA,
    "ta-IN": SupportedLanguage.TA,
    "kn": SupportedLanguage.KN,
    "kn-IN": SupportedLanguage.KN,
    "ml": SupportedLanguage.ML,
    "ml-IN": SupportedLanguage.ML,
    "as": SupportedLanguage.AS,
    "as-IN": SupportedLanguage.AS,
    "bn": SupportedLanguage.BN,
    "bn-IN": SupportedLanguage.BN,
    "bn-BD": SupportedLanguage.BN,
    "gu": SupportedLanguage.GU,
    "gu-IN": SupportedLanguage.GU,
    "mr": SupportedLanguage.MR,
    "mr-IN": SupportedLanguage.MR,
    "or": SupportedLanguage.OR,
    "or-IN": SupportedLanguage.OR,
    "pa": SupportedLanguage.PA,
    "pa-IN": SupportedLanguage.PA,
    "ur": SupportedLanguage.UR,
    "ur-PK": SupportedLanguage.UR,
    "ur-IN": SupportedLanguage.UR,
}


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class LocaleResolutionResult:
    """Result of locale resolution with full context.

    Contains the resolved language, fallback, source information,
    regional formatting preferences, and resolution metadata.
    """

    language: SupportedLanguage
    fallback: SupportedLanguage
    source: LanguagePreferenceSource
    is_explicit: bool

    # Regional formatting
    date_locale: str = DEFAULT_DATE_LOCALE
    number_locale: str = DEFAULT_NUMBER_LOCALE
    currency_code: str = DEFAULT_CURRENCY
    timezone: str = DEFAULT_TIMEZONE

    # Text direction
    direction: str = field(default="ltr")

    # Resolution metadata
    resolution_path: list[str] = field(default_factory=list)
    from_cache: bool = False

    def __post_init__(self):
        """Set text direction based on language."""
        self.direction = get_text_direction(self.language)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "language": self.language.value,
            "fallback": self.fallback.value,
            "source": self.source.value,
            "is_explicit": self.is_explicit,
            "date_locale": self.date_locale,
            "number_locale": self.number_locale,
            "currency_code": self.currency_code,
            "timezone": self.timezone,
            "direction": self.direction,
            "resolution_path": self.resolution_path,
            "from_cache": self.from_cache,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LocaleResolutionResult":
        """Create from dictionary."""
        return cls(
            language=SupportedLanguage(data["language"]),
            fallback=SupportedLanguage(data["fallback"]),
            source=LanguagePreferenceSource(data["source"]),
            is_explicit=data["is_explicit"],
            date_locale=data.get("date_locale", DEFAULT_DATE_LOCALE),
            number_locale=data.get("number_locale", DEFAULT_NUMBER_LOCALE),
            currency_code=data.get("currency_code", DEFAULT_CURRENCY),
            timezone=data.get("timezone", DEFAULT_TIMEZONE),
            direction=data.get("direction", "ltr"),
            resolution_path=data.get("resolution_path", []),
            from_cache=True,  # Mark as from cache when deserializing
        )

    def to_resolved_preference(self) -> ResolvedLanguagePreference:
        """Convert to ResolvedLanguagePreference model."""
        return ResolvedLanguagePreference(
            language=self.language,
            fallback=self.fallback,
            source=self.source,
            is_explicit=self.is_explicit,
            date_locale=self.date_locale,
            number_locale=self.number_locale,
            currency_code=self.currency_code,
            timezone=self.timezone,
        )


@dataclass
class AcceptLanguageEntry:
    """Parsed entry from Accept-Language header."""

    language: str
    quality: float = 1.0


# =============================================================================
# EXCEPTIONS
# =============================================================================


class I18nServiceError(Exception):
    """Base exception for i18n service errors."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class UnsupportedLanguageError(I18nServiceError):
    """Language is not supported."""

    def __init__(self, language: str):
        super().__init__(
            f"Language '{language}' is not supported",
            "UNSUPPORTED_LANGUAGE",
            400,
        )
        self.language = language


class InvalidLocaleError(I18nServiceError):
    """Invalid locale format."""

    def __init__(self, locale: str):
        super().__init__(
            f"Invalid locale format: '{locale}'",
            "INVALID_LOCALE",
            400,
        )
        self.locale = locale


# =============================================================================
# I18N SERVICE
# =============================================================================


class I18nService:
    """Service for internationalization and locale resolution.

    This service handles language preference management and provides
    locale resolution following a priority hierarchy. It supports
    user, workspace, and guest-level preferences with context-specific
    settings and browser language detection.

    Features:
    - Multi-level preference resolution (user > workspace > guest > browser > default)
    - Context-specific language settings (UI, email, notifications, etc.)
    - Accept-Language header parsing and validation
    - Regional formatting preferences
    - Performance caching with Redis
    - Language validation and fallback handling
    """

    def __init__(self, repository: Optional[I18nRepository] = None):
        """Initialize the i18n service.

        Args:
            repository: Optional I18nRepository instance. If not provided,
                       will use the singleton from get_i18n_repository().
        """
        self._repository = repository
        self._redis = None

    @property
    def repository(self) -> I18nRepository:
        """Get the i18n repository instance."""
        if self._repository is None:
            self._repository = get_i18n_repository()
        return self._repository

    async def _get_redis(self):
        """Get Redis client for caching."""
        if self._redis is None:
            self._redis = await get_redis_client()
        return self._redis

    # =========================================================================
    # LANGUAGE VALIDATION
    # =========================================================================

    def is_supported_language(self, language: str) -> bool:
        """Check if a language code is supported.

        Args:
            language: Language code (e.g., 'en', 'hi', 'te')

        Returns:
            True if the language is supported, False otherwise
        """
        # Extract base language code
        base_code = language.split("-")[0].lower()
        try:
            SupportedLanguage(base_code)
            return True
        except ValueError:
            return False

    def validate_language(self, language: str) -> SupportedLanguage:
        """Validate and normalize a language code.

        Args:
            language: Language code to validate

        Returns:
            SupportedLanguage enum value

        Raises:
            UnsupportedLanguageError: If the language is not supported
        """
        base_code = language.split("-")[0].lower()
        try:
            return SupportedLanguage(base_code)
        except ValueError:
            raise UnsupportedLanguageError(language)

    def normalize_language_code(self, language: str) -> str:
        """Normalize a language code to standard format.

        Args:
            language: Language code in any format

        Returns:
            Normalized language code (lowercase base code)
        """
        return language.split("-")[0].lower()

    def get_supported_languages(self) -> list[LanguageInfo]:
        """Get list of all supported languages with metadata.

        Returns:
            List of LanguageInfo objects with name, native name, direction, etc.
        """
        return LanguageInfo.get_all_languages()

    def get_language_info(self, language: SupportedLanguage) -> LanguageInfo:
        """Get detailed information about a specific language.

        Args:
            language: SupportedLanguage enum value

        Returns:
            LanguageInfo with name, native name, direction, etc.
        """
        all_languages = LanguageInfo.get_all_languages()
        for lang_info in all_languages:
            if lang_info.code == language:
                return lang_info
        # Default to English if not found (shouldn't happen)
        return LanguageInfo(
            code=language,
            name=language.value.upper(),
            native_name=language.value.upper(),
            direction="ltr",
        )

    # =========================================================================
    # ACCEPT-LANGUAGE HEADER PARSING
    # =========================================================================

    def parse_accept_language(self, header: str) -> list[AcceptLanguageEntry]:
        """Parse Accept-Language header into sorted list of preferences.

        Args:
            header: Accept-Language header value (e.g., 'en-US,en;q=0.9,hi;q=0.8')

        Returns:
            List of AcceptLanguageEntry sorted by quality (highest first)
        """
        if not header:
            return []

        entries: list[AcceptLanguageEntry] = []
        # Match patterns like "en-US", "en", "en;q=0.9"
        pattern = re.compile(r"([a-zA-Z]{2,3})(?:-[a-zA-Z]{2,3})?(?:;q=([0-9.]+))?")

        for part in header.split(","):
            part = part.strip()
            match = pattern.match(part)
            if match:
                lang = match.group(0).split(";")[0]
                quality_str = match.group(2)
                quality = float(quality_str) if quality_str else 1.0
                entries.append(AcceptLanguageEntry(language=lang, quality=quality))

        # Sort by quality (highest first)
        entries.sort(key=lambda x: x.quality, reverse=True)
        return entries

    def detect_language_from_header(
        self,
        accept_language: str,
        supported_only: bool = True,
    ) -> Optional[SupportedLanguage]:
        """Detect preferred language from Accept-Language header.

        Parses the header and returns the highest-priority language
        that is supported by the system.

        Args:
            accept_language: Accept-Language header value
            supported_only: If True, only return languages that are supported

        Returns:
            SupportedLanguage if a supported language is found, None otherwise
        """
        if not accept_language:
            return None

        entries = self.parse_accept_language(accept_language)

        for entry in entries:
            # Try exact match first (e.g., "hi-IN")
            if entry.language in LOCALE_TO_LANGUAGE:
                return LOCALE_TO_LANGUAGE[entry.language]

            # Try base language (e.g., "hi" from "hi-IN")
            base_lang = entry.language.split("-")[0].lower()
            if base_lang in LOCALE_TO_LANGUAGE:
                return LOCALE_TO_LANGUAGE[base_lang]

            # Try as enum value
            try:
                return SupportedLanguage(base_lang)
            except ValueError:
                continue

        return None

    # =========================================================================
    # LOCALE RESOLUTION
    # =========================================================================

    async def resolve_locale(
        self,
        user_id: Optional[UUID] = None,
        workspace_id: Optional[UUID] = None,
        guest_identifier: Optional[UUID] = None,
        context: LanguageContext = LanguageContext.UI,
        accept_language: Optional[str] = None,
        url_language: Optional[str] = None,
        use_cache: bool = True,
    ) -> LocaleResolutionResult:
        """Resolve the effective locale following priority hierarchy.

        Resolution Priority (highest to lowest):
        1. URL parameter language (if provided and valid)
        2. User-specific preference for workspace+context
        3. User-level preference for context (no workspace)
        4. Workspace default for context
        5. Guest preference (for magic link visitors)
        6. Browser-detected language (Accept-Language header)
        7. System default (English)

        Args:
            user_id: Optional user ID for user-level preferences
            workspace_id: Optional workspace ID for workspace context
            guest_identifier: Optional guest identifier for magic link visitors
            context: Context for which to resolve locale (UI, email, etc.)
            accept_language: Optional Accept-Language header value
            url_language: Optional language code from URL parameter
            use_cache: Whether to use Redis cache for resolved preferences

        Returns:
            LocaleResolutionResult with resolved language and metadata
        """
        resolution_path: list[str] = []

        # Try cache first
        if use_cache:
            cached = await self._get_cached_resolution(
                user_id, workspace_id, guest_identifier, context
            )
            if cached:
                logger.debug(
                    "Locale resolution cache hit",
                    extra={
                        "user_id": str(user_id) if user_id else None,
                        "context": context.value,
                    },
                )
                return cached

        # 1. URL parameter language (highest priority for explicit requests)
        if url_language:
            resolution_path.append("url_param")
            if self.is_supported_language(url_language):
                lang = self.validate_language(url_language)
                result = LocaleResolutionResult(
                    language=lang,
                    fallback=DEFAULT_FALLBACK,
                    source=LanguagePreferenceSource.URL_PARAM,
                    is_explicit=True,
                    resolution_path=resolution_path,
                )
                await self._cache_resolution(
                    result, user_id, workspace_id, guest_identifier, context
                )
                return result

        # 2-4. Database preferences (user > workspace)
        if user_id or guest_identifier:
            resolution_path.append("database")
            db_pref = await self.repository.resolve_preference(
                user_id=user_id,
                workspace_id=workspace_id,
                guest_identifier=guest_identifier,
                context=context.value,
            )

            if db_pref and db_pref.get("source") != "system_default":
                result = LocaleResolutionResult(
                    language=SupportedLanguage(db_pref["language"]),
                    fallback=SupportedLanguage(db_pref.get("fallback", "en")),
                    source=LanguagePreferenceSource(db_pref["source"]),
                    is_explicit=db_pref.get("is_explicit", False),
                    date_locale=db_pref.get("date_locale", DEFAULT_DATE_LOCALE),
                    number_locale=db_pref.get("number_locale", DEFAULT_NUMBER_LOCALE),
                    currency_code=db_pref.get("currency_code", DEFAULT_CURRENCY),
                    timezone=db_pref.get("timezone", DEFAULT_TIMEZONE),
                    resolution_path=resolution_path,
                )
                await self._cache_resolution(
                    result, user_id, workspace_id, guest_identifier, context
                )
                return result

        # 5. Browser language detection
        if accept_language:
            resolution_path.append("accept_language")
            detected = self.detect_language_from_header(accept_language)
            if detected:
                result = LocaleResolutionResult(
                    language=detected,
                    fallback=DEFAULT_FALLBACK,
                    source=LanguagePreferenceSource.BROWSER_DETECTED,
                    is_explicit=False,
                    resolution_path=resolution_path,
                )
                # Don't cache browser-detected preferences (they may change)
                return result

        # 6. System default
        resolution_path.append("system_default")
        result = LocaleResolutionResult(
            language=DEFAULT_LANGUAGE,
            fallback=DEFAULT_FALLBACK,
            source=LanguagePreferenceSource.SYSTEM_DEFAULT,
            is_explicit=False,
            resolution_path=resolution_path,
        )

        return result

    async def resolve_locale_for_email(
        self,
        user_id: Optional[UUID] = None,
        workspace_id: Optional[UUID] = None,
        recipient_email: Optional[str] = None,
    ) -> LocaleResolutionResult:
        """Resolve locale specifically for email communications.

        Uses the EMAIL context and includes additional logic for
        handling recipient preferences.

        Args:
            user_id: Optional user ID
            workspace_id: Optional workspace ID
            recipient_email: Optional recipient email for lookup

        Returns:
            LocaleResolutionResult for email content
        """
        return await self.resolve_locale(
            user_id=user_id,
            workspace_id=workspace_id,
            context=LanguageContext.EMAIL,
            use_cache=True,
        )

    async def resolve_locale_for_notification(
        self,
        user_id: UUID,
        workspace_id: Optional[UUID] = None,
    ) -> LocaleResolutionResult:
        """Resolve locale specifically for notifications.

        Args:
            user_id: User ID to resolve preferences for
            workspace_id: Optional workspace context

        Returns:
            LocaleResolutionResult for notification content
        """
        return await self.resolve_locale(
            user_id=user_id,
            workspace_id=workspace_id,
            context=LanguageContext.NOTIFICATION,
            use_cache=True,
        )

    async def resolve_locale_for_guest(
        self,
        guest_identifier: UUID,
        accept_language: Optional[str] = None,
    ) -> LocaleResolutionResult:
        """Resolve locale for a guest/anonymous user.

        Args:
            guest_identifier: Guest identifier (e.g., from magic link)
            accept_language: Optional Accept-Language header

        Returns:
            LocaleResolutionResult for guest
        """
        return await self.resolve_locale(
            guest_identifier=guest_identifier,
            context=LanguageContext.UI,
            accept_language=accept_language,
            use_cache=True,
        )

    # =========================================================================
    # PREFERENCE MANAGEMENT
    # =========================================================================

    async def set_user_language(
        self,
        user_id: UUID,
        language: str,
        context: LanguageContext = LanguageContext.UI,
        workspace_id: Optional[UUID] = None,
        source: LanguagePreferenceSource = LanguagePreferenceSource.USER_SELECTED,
    ) -> dict[str, Any]:
        """Set a user's language preference.

        Args:
            user_id: User ID
            language: Language code (e.g., 'hi', 'te')
            context: Context for the preference
            workspace_id: Optional workspace for workspace-specific preference
            source: How the preference was set

        Returns:
            Created or updated preference record

        Raises:
            UnsupportedLanguageError: If the language is not supported
        """
        # Validate language
        validated_lang = self.validate_language(language)

        # Create or update preference
        pref = await self.repository.create_or_update(
            user_id=user_id,
            workspace_id=workspace_id,
            context=context.value,
            primary_language=validated_lang.value,
            fallback_language=DEFAULT_FALLBACK.value,
            source=source.value,
            is_explicit=source == LanguagePreferenceSource.USER_SELECTED,
        )

        # Invalidate cache
        await self._invalidate_cache(user_id, workspace_id, None, context)

        logger.info(
            "User language preference set",
            extra={
                "user_id": str(user_id),
                "language": validated_lang.value,
                "context": context.value,
                "workspace_id": str(workspace_id) if workspace_id else None,
            },
        )

        return pref

    async def set_workspace_language(
        self,
        workspace_id: UUID,
        language: str,
        context: LanguageContext = LanguageContext.UI,
    ) -> dict[str, Any]:
        """Set a workspace's default language preference.

        Args:
            workspace_id: Workspace ID
            language: Language code
            context: Context for the preference

        Returns:
            Created or updated preference record

        Raises:
            UnsupportedLanguageError: If the language is not supported
        """
        # Validate language
        validated_lang = self.validate_language(language)

        # Create workspace-level preference (no user_id)
        # Note: The repository requires user_id or guest_identifier,
        # so we use a special approach for workspace defaults
        # by setting a system user marker in metadata
        pref = await self.repository.create_or_update(
            workspace_id=workspace_id,
            guest_identifier=None,
            user_id=None,
            context=context.value,
            primary_language=validated_lang.value,
            fallback_language=DEFAULT_FALLBACK.value,
            source=LanguagePreferenceSource.WORKSPACE_DEFAULT.value,
            is_explicit=True,
            metadata={"workspace_default": True},
        )

        logger.info(
            "Workspace language preference set",
            extra={
                "workspace_id": str(workspace_id),
                "language": validated_lang.value,
                "context": context.value,
            },
        )

        return pref

    async def set_guest_language(
        self,
        guest_identifier: UUID,
        language: str,
        source: LanguagePreferenceSource = LanguagePreferenceSource.USER_SELECTED,
    ) -> dict[str, Any]:
        """Set a guest's language preference.

        Args:
            guest_identifier: Guest identifier
            language: Language code
            source: How the preference was determined

        Returns:
            Created or updated preference record
        """
        validated_lang = self.validate_language(language)

        pref = await self.repository.create_or_update(
            guest_identifier=guest_identifier,
            context=LanguageContext.UI.value,
            primary_language=validated_lang.value,
            fallback_language=DEFAULT_FALLBACK.value,
            source=source.value,
            is_explicit=source == LanguagePreferenceSource.USER_SELECTED,
        )

        await self._invalidate_cache(None, None, guest_identifier, LanguageContext.UI)

        return pref

    async def get_user_preferences(
        self,
        user_id: UUID,
        workspace_id: Optional[UUID] = None,
    ) -> list[dict[str, Any]]:
        """Get all language preferences for a user.

        Args:
            user_id: User ID
            workspace_id: Optional workspace to filter by

        Returns:
            List of preference records
        """
        return await self.repository.list_by_user_id(
            user_id=user_id,
            workspace_id=workspace_id,
            active_only=True,
        )

    async def delete_user_preference(
        self,
        user_id: UUID,
        context: LanguageContext,
        workspace_id: Optional[UUID] = None,
    ) -> bool:
        """Delete a user's language preference for a context.

        Args:
            user_id: User ID
            context: Context to delete preference for
            workspace_id: Optional workspace for workspace-specific deletion

        Returns:
            True if deleted, False if not found
        """
        result = await self.repository.delete_by_user_and_context(
            user_id=user_id,
            context=context.value,
            workspace_id=workspace_id,
        )

        if result:
            await self._invalidate_cache(user_id, workspace_id, None, context)

        return result

    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================

    async def initialize_user_defaults(
        self,
        user_id: UUID,
        detected_language: Optional[str] = None,
        accept_language: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Initialize default language preferences for a new user.

        Detects language from browser if not explicitly provided
        and creates default preferences for all contexts.

        Args:
            user_id: User ID
            detected_language: Explicitly detected language (e.g., from IP)
            accept_language: Accept-Language header for browser detection

        Returns:
            List of created preference records
        """
        # Determine initial language
        language = DEFAULT_LANGUAGE
        source = LanguagePreferenceSource.SYSTEM_DEFAULT

        if detected_language and self.is_supported_language(detected_language):
            language = self.validate_language(detected_language)
            source = LanguagePreferenceSource.USER_SELECTED
        elif accept_language:
            browser_lang = self.detect_language_from_header(accept_language)
            if browser_lang:
                language = browser_lang
                source = LanguagePreferenceSource.BROWSER_DETECTED

        # Create defaults for all contexts
        return await self.repository.bulk_create_defaults(
            user_id=user_id,
            primary_language=language.value,
            source=source.value,
        )

    # =========================================================================
    # ANALYTICS
    # =========================================================================

    async def get_language_usage_stats(self) -> dict[str, int]:
        """Get usage statistics by language.

        Returns:
            Dictionary mapping language codes to user counts
        """
        return await self.repository.count_by_language()

    # =========================================================================
    # CACHING
    # =========================================================================

    def _cache_key(
        self,
        user_id: Optional[UUID],
        workspace_id: Optional[UUID],
        guest_identifier: Optional[UUID],
        context: LanguageContext,
    ) -> str:
        """Generate cache key for resolved preferences."""
        parts = [CACHE_PREFIX, "resolved"]
        parts.append(f"u:{user_id}" if user_id else "u:_")
        parts.append(f"w:{workspace_id}" if workspace_id else "w:_")
        parts.append(f"g:{guest_identifier}" if guest_identifier else "g:_")
        parts.append(f"c:{context.value}")
        return ":".join(parts)

    async def _get_cached_resolution(
        self,
        user_id: Optional[UUID],
        workspace_id: Optional[UUID],
        guest_identifier: Optional[UUID],
        context: LanguageContext,
    ) -> Optional[LocaleResolutionResult]:
        """Get cached resolution result if available."""
        try:
            redis = await self._get_redis()
            if redis is None:
                return None

            key = self._cache_key(user_id, workspace_id, guest_identifier, context)
            cached = await redis.get(key)

            if cached:
                data = json.loads(cached)
                return LocaleResolutionResult.from_dict(data)
        except Exception as e:
            logger.warning(f"Failed to get cached resolution: {e}")

        return None

    async def _cache_resolution(
        self,
        result: LocaleResolutionResult,
        user_id: Optional[UUID],
        workspace_id: Optional[UUID],
        guest_identifier: Optional[UUID],
        context: LanguageContext,
    ) -> None:
        """Cache a resolution result."""
        try:
            redis = await self._get_redis()
            if redis is None:
                return

            key = self._cache_key(user_id, workspace_id, guest_identifier, context)
            await redis.setex(
                key,
                RESOLVED_PREF_CACHE_TTL,
                json.dumps(result.to_dict()),
            )
        except Exception as e:
            logger.warning(f"Failed to cache resolution: {e}")

    async def _invalidate_cache(
        self,
        user_id: Optional[UUID],
        workspace_id: Optional[UUID],
        guest_identifier: Optional[UUID],
        context: LanguageContext,
    ) -> None:
        """Invalidate cached resolution for given parameters."""
        try:
            redis = await self._get_redis()
            if redis is None:
                return

            key = self._cache_key(user_id, workspace_id, guest_identifier, context)
            await redis.delete(key)
        except Exception as e:
            logger.warning(f"Failed to invalidate cache: {e}")

    async def invalidate_user_cache(self, user_id: UUID) -> None:
        """Invalidate all cached resolutions for a user.

        Called when user preferences are bulk-updated.
        """
        try:
            redis = await self._get_redis()
            if redis is None:
                return

            # Delete all keys matching the user pattern
            pattern = f"{CACHE_PREFIX}:resolved:u:{user_id}:*"
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                if keys:
                    await redis.delete(*keys)
                if cursor == 0:
                    break
        except Exception as e:
            logger.warning(f"Failed to invalidate user cache: {e}")


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_i18n_service: Optional[I18nService] = None


def get_i18n_service() -> I18nService:
    """Get the singleton I18nService instance.

    Returns:
        I18nService singleton instance
    """
    global _i18n_service
    if _i18n_service is None:
        _i18n_service = I18nService()
    return _i18n_service
