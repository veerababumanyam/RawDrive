"""GeminiSettingsService: Per-user Gemini API key and model configuration.

Implements secure storage and validation of user Gemini API keys with
encrypted storage and model selection from admin-managed catalogue.

Feature: 003-user-gemini-settings
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple
from uuid import UUID

import httpx

from src.database import get_pool as get_postgres_pool
from src.cache.redis_client import redis_client
from src.services.encryption_service import get_encryption_service, EncryptionError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Gemini API validation endpoint
GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1/models"
GEMINI_API_TIMEOUT = 5.0  # 5 second timeout per research.md

# Redis cache settings
GEMINI_MODELS_CACHE_KEY = "gemini:models:active"
GEMINI_MODELS_CACHE_TTL = 300  # 5 minutes - balance freshness vs performance

# API key masking settings (for secure display)
# Gemini keys typically start with "AIza" (4 chars) and are 39 chars total
API_KEY_MASK_PREFIX_LENGTH = 4  # Characters to show at start (e.g., "AIza")
API_KEY_MASK_SUFFIX_LENGTH = 4  # Characters to show at end

# Error code mapping from HTTP status codes
# Format: status_code -> (error_code, message, hint)
ERROR_MAPPING: dict[int, tuple[str, str, str]] = {
    400: (
        "INVALID_KEY",
        "The API key format appears invalid.",
        "Please check that you copied the entire key from Google AI Studio.",
    ),
    401: (
        "KEY_UNAUTHORIZED",
        "This API key is not authorized.",
        "Please verify your key is active in Google AI Studio.",
    ),
    403: (
        "KEY_FORBIDDEN",
        "This API key doesn't have permission to access Gemini.",
        "Check your Google Cloud project settings and API access.",
    ),
    429: (
        "RATE_LIMITED",
        "You've reached your Gemini usage limit.",
        "Please wait a few minutes or check your Google account quota.",
    ),
}

# 5xx errors use this default
SERVICE_UNAVAILABLE = (
    "SERVICE_UNAVAILABLE",
    "Gemini is temporarily unavailable.",
    "Please try again in a few minutes.",
)

NETWORK_ERROR = (
    "NETWORK_ERROR",
    "Unable to connect to Gemini.",
    "Please check your internet connection and try again.",
)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class GeminiSettingsError(Exception):
    """Base Gemini settings error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class GeminiSettingsNotFoundError(GeminiSettingsError):
    """User Gemini settings not found."""

    def __init__(self, user_id: UUID) -> None:
        super().__init__(
            f"Gemini settings not found for user {user_id}",
            "GEMINI_SETTINGS_NOT_FOUND",
            404,
        )


class GeminiModelNotFoundError(GeminiSettingsError):
    """Gemini model not found or inactive."""

    def __init__(self, model_id: UUID) -> None:
        super().__init__(
            f"Gemini model {model_id} not found or inactive",
            "GEMINI_MODEL_NOT_FOUND",
            404,
        )


class GeminiValidationFailedError(GeminiSettingsError):
    """API key validation failed."""

    def __init__(
        self,
        error_code: str,
        message: str,
        hint: Optional[str] = None,
    ) -> None:
        super().__init__(message, error_code, 400)
        self.hint = hint


# ---------------------------------------------------------------------------
# Data classes for validation results
# ---------------------------------------------------------------------------


class ValidationResult:
    """Result of API key validation."""

    def __init__(
        self,
        is_valid: bool,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        error_hint: Optional[str] = None,
        available_models: Optional[list[str]] = None,
    ):
        self.is_valid = is_valid
        self.error_code = error_code
        self.error_message = error_message
        self.error_hint = error_hint
        self.available_models = available_models or []


# ---------------------------------------------------------------------------
# Gemini Settings Service
# ---------------------------------------------------------------------------


class GeminiSettingsService:
    """Service for user Gemini settings operations."""

    async def get_user_settings(
        self, user_id: UUID, workspace_id: UUID
    ) -> Optional[dict]:
        """Get user's Gemini settings.

        Args:
            user_id: User UUID
            workspace_id: Workspace UUID (for key derivation)

        Returns:
            Dict with settings or None if not configured
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    ugs.user_id,
                    ugs.api_key_encrypted,
                    ugs.api_key_iv,
                    ugs.api_key_prefix,
                    ugs.api_key_suffix,
                    ugs.selected_model_id,
                    ugs.status,
                    ugs.last_validated_at,
                    ugs.validation_error,
                    ugs.created_at,
                    ugs.updated_at,
                    -- Selected model info
                    sm.model_id as selected_model_id,
                    sm.identifier as selected_model_identifier,
                    sm.display_name as selected_model_display_name,
                    sm.is_default as selected_model_is_default,
                    -- Default model info (for effective_model)
                    dm.model_id as default_model_id,
                    dm.identifier as default_model_identifier,
                    dm.display_name as default_model_display_name
                FROM user_gemini_settings ugs
                LEFT JOIN gemini_models sm ON ugs.selected_model_id = sm.model_id
                    AND sm.is_active = TRUE
                LEFT JOIN gemini_models dm ON dm.is_default = TRUE AND dm.is_active = TRUE
                WHERE ugs.user_id = $1
                """,
                user_id,
            )

            if not row:
                # Return default "not configured" state
                default_model = await self._get_default_model(conn)
                return {
                    "status": "not_configured",
                    "has_api_key": False,
                    "api_key_masked": None,
                    "selected_model": None,
                    "effective_model": default_model,
                    "last_validated_at": None,
                    "validation_error": None,
                }

            # Build masked key if exists
            api_key_masked = None
            if row["api_key_prefix"] and row["api_key_suffix"]:
                api_key_masked = f"{row['api_key_prefix']}...{row['api_key_suffix']}"

            # Build selected model if exists and active
            selected_model = None
            if row["selected_model_id"] and row["selected_model_identifier"]:
                selected_model = {
                    "model_id": row["selected_model_id"],
                    "identifier": row["selected_model_identifier"],
                    "display_name": row["selected_model_display_name"],
                    "is_default": row["selected_model_is_default"],
                }

            # Build effective model (selected if active, else default)
            effective_model = selected_model
            if not effective_model and row["default_model_id"]:
                effective_model = {
                    "model_id": row["default_model_id"],
                    "identifier": row["default_model_identifier"],
                    "display_name": row["default_model_display_name"],
                    "is_default": True,
                }

            return {
                "status": row["status"],
                "has_api_key": row["api_key_encrypted"] is not None,
                "api_key_masked": api_key_masked,
                "selected_model": selected_model,
                "effective_model": effective_model,
                "last_validated_at": row["last_validated_at"],
                "validation_error": row["validation_error"],
            }

    async def _get_default_model(self, conn) -> Optional[dict]:
        """Get the platform default model."""
        row = await conn.fetchrow(
            """
            SELECT model_id, identifier, display_name, is_default
            FROM gemini_models
            WHERE is_default = TRUE AND is_active = TRUE
            LIMIT 1
            """
        )
        if row:
            return {
                "model_id": row["model_id"],
                "identifier": row["identifier"],
                "display_name": row["display_name"],
                "is_default": True,
            }
        return None

    async def validate_api_key(self, api_key: str) -> ValidationResult:
        """Validate a Gemini API key by calling the models endpoint.

        Args:
            api_key: The Gemini API key to validate

        Returns:
            ValidationResult with is_valid, error details, and available_models
        """
        try:
            async with httpx.AsyncClient(timeout=GEMINI_API_TIMEOUT) as client:
                response = await client.get(
                    GEMINI_MODELS_URL,
                    params={"key": api_key},
                )

                if response.status_code == 200:
                    # Parse available models from response
                    data = response.json()
                    models = [
                        m.get("name", "").replace("models/", "")
                        for m in data.get("models", [])
                        if m.get("name")
                    ]
                    return ValidationResult(
                        is_valid=True,
                        available_models=models,
                    )

                # Handle error response
                error_info = ERROR_MAPPING.get(response.status_code)
                if error_info:
                    return ValidationResult(
                        is_valid=False,
                        error_code=error_info[0],
                        error_message=error_info[1],
                        error_hint=error_info[2],
                    )

                # 5xx or unknown status
                if response.status_code >= 500:
                    return ValidationResult(
                        is_valid=False,
                        error_code=SERVICE_UNAVAILABLE[0],
                        error_message=SERVICE_UNAVAILABLE[1],
                        error_hint=SERVICE_UNAVAILABLE[2],
                    )

                # Unknown error
                return ValidationResult(
                    is_valid=False,
                    error_code="UNKNOWN_ERROR",
                    error_message=f"Unexpected response from Gemini (status {response.status_code})",
                    error_hint="Please try again or contact support.",
                )

        except httpx.TimeoutException:
            logger.warning("Gemini API validation timed out")
            return ValidationResult(
                is_valid=False,
                error_code=NETWORK_ERROR[0],
                error_message=NETWORK_ERROR[1],
                error_hint=NETWORK_ERROR[2],
            )
        except httpx.RequestError as e:
            logger.warning(f"Gemini API validation network error: {e}")
            return ValidationResult(
                is_valid=False,
                error_code=NETWORK_ERROR[0],
                error_message=NETWORK_ERROR[1],
                error_hint=NETWORK_ERROR[2],
            )
        except Exception as e:
            logger.error(f"Unexpected error validating Gemini API key: {e}")
            return ValidationResult(
                is_valid=False,
                error_code="UNKNOWN_ERROR",
                error_message="An unexpected error occurred during validation.",
                error_hint="Please try again.",
            )

    async def create_or_update_settings(
        self,
        user_id: UUID,
        workspace_id: UUID,
        api_key: Optional[str] = None,
        selected_model_id: Optional[UUID] = None,
        skip_validation: bool = False,
        update_model_selection: bool = True,
    ) -> dict:
        """Create or update user's Gemini settings.

        Args:
            user_id: User UUID
            workspace_id: Workspace UUID (for encryption key derivation)
            api_key: New API key to store (will be validated first)
            selected_model_id: Model ID to select (None = use platform default)
            skip_validation: Skip API key validation (for internal use only)
            update_model_selection: Whether to update the model selection.
                If True and selected_model_id is None, uses platform default.
                If False, keeps current model selection.

        Returns:
            Updated settings dict

        Raises:
            GeminiValidationFailedError: If API key validation fails
            GeminiModelNotFoundError: If selected model doesn't exist or is inactive
        """
        pool = await get_postgres_pool()
        encryption_service = get_encryption_service()

        async with pool.acquire() as conn:
            # Validate model ID if provided
            if selected_model_id:
                model_exists = await conn.fetchval(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM gemini_models
                        WHERE model_id = $1 AND is_active = TRUE
                    )
                    """,
                    selected_model_id,
                )
                if not model_exists:
                    raise GeminiModelNotFoundError(selected_model_id)

            # Validate API key if provided
            validation_result = None
            if api_key and not skip_validation:
                validation_result = await self.validate_api_key(api_key)
                if not validation_result.is_valid:
                    raise GeminiValidationFailedError(
                        error_code=validation_result.error_code or "UNKNOWN_ERROR",
                        message=validation_result.error_message or "Validation failed",
                        hint=validation_result.error_hint,
                    )

            # Prepare encryption data if API key provided
            api_key_encrypted = None
            api_key_iv = None
            api_key_prefix = None
            api_key_suffix = None

            if api_key:
                # Encrypt the API key
                api_key_encrypted, api_key_iv = encryption_service.encrypt_user_api_key(
                    api_key, user_id, workspace_id
                )
                # Extract prefix and suffix for masked display
                api_key_prefix = (
                    api_key[:API_KEY_MASK_PREFIX_LENGTH]
                    if len(api_key) >= API_KEY_MASK_PREFIX_LENGTH
                    else api_key
                )
                api_key_suffix = (
                    api_key[-API_KEY_MASK_SUFFIX_LENGTH:]
                    if len(api_key) >= API_KEY_MASK_SUFFIX_LENGTH
                    else ""
                )

            # Build update query dynamically
            now = datetime.now(timezone.utc)

            # Check if settings exist
            existing = await conn.fetchval(
                "SELECT user_id FROM user_gemini_settings WHERE user_id = $1",
                user_id,
            )

            if existing:
                # Update existing settings
                updates = ["updated_at = $2"]
                params: list = [user_id, now]
                param_idx = 3

                if api_key:
                    updates.append(f"api_key_encrypted = ${param_idx}")
                    params.append(api_key_encrypted)
                    param_idx += 1

                    updates.append(f"api_key_iv = ${param_idx}")
                    params.append(api_key_iv)
                    param_idx += 1

                    updates.append(f"api_key_prefix = ${param_idx}")
                    params.append(api_key_prefix)
                    param_idx += 1

                    updates.append(f"api_key_suffix = ${param_idx}")
                    params.append(api_key_suffix)
                    param_idx += 1

                    updates.append(f"status = ${param_idx}")
                    params.append("connected")
                    param_idx += 1

                    updates.append(f"last_validated_at = ${param_idx}")
                    params.append(now)
                    param_idx += 1

                    updates.append(f"validation_error = ${param_idx}")
                    params.append(None)
                    param_idx += 1

                if update_model_selection:
                    # Update model selection - None means use platform default
                    updates.append(f"selected_model_id = ${param_idx}")
                    params.append(selected_model_id)
                    param_idx += 1

                await conn.execute(
                    f"""
                    UPDATE user_gemini_settings
                    SET {', '.join(updates)}
                    WHERE user_id = $1
                    """,
                    *params,
                )
            else:
                # Insert new settings
                await conn.execute(
                    """
                    INSERT INTO user_gemini_settings (
                        user_id,
                        api_key_encrypted,
                        api_key_iv,
                        api_key_prefix,
                        api_key_suffix,
                        selected_model_id,
                        status,
                        last_validated_at,
                        validation_error,
                        created_at,
                        updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    """,
                    user_id,
                    api_key_encrypted,
                    api_key_iv,
                    api_key_prefix,
                    api_key_suffix,
                    selected_model_id,
                    "connected" if api_key else "not_configured",
                    now if api_key else None,
                    None,
                    now,
                    now,
                )

        # Return updated settings
        return await self.get_user_settings(user_id, workspace_id)

    async def revoke_api_key(self, user_id: UUID, workspace_id: UUID) -> dict:
        """Revoke user's API key.

        Clears the encrypted key but preserves model selection preference.

        Args:
            user_id: User UUID
            workspace_id: Workspace UUID

        Returns:
            Updated settings dict
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE user_gemini_settings
                SET
                    api_key_encrypted = NULL,
                    api_key_iv = NULL,
                    api_key_prefix = NULL,
                    api_key_suffix = NULL,
                    status = 'not_configured',
                    last_validated_at = NULL,
                    validation_error = NULL,
                    updated_at = $2
                WHERE user_id = $1
                """,
                user_id,
                now,
            )

        return await self.get_user_settings(user_id, workspace_id)

    async def get_decrypted_api_key(
        self, user_id: UUID, workspace_id: UUID
    ) -> Optional[str]:
        """Get the decrypted API key for a user.

        This should only be used server-side for making Gemini API calls.
        NEVER expose this to any API response.

        Args:
            user_id: User UUID
            workspace_id: Workspace UUID

        Returns:
            Decrypted API key or None if not configured
        """
        pool = await get_postgres_pool()
        encryption_service = get_encryption_service()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT api_key_encrypted, api_key_iv
                FROM user_gemini_settings
                WHERE user_id = $1 AND api_key_encrypted IS NOT NULL
                """,
                user_id,
            )

            if not row or not row["api_key_encrypted"]:
                return None

            try:
                return encryption_service.decrypt_user_api_key(
                    row["api_key_encrypted"],
                    row["api_key_iv"],
                    user_id,
                    workspace_id,
                )
            except EncryptionError as e:
                logger.error(f"Failed to decrypt API key for user {user_id}: {e}")
                return None

    async def update_validation_status(
        self,
        user_id: UUID,
        status: str,
        error_message: Optional[str] = None,
    ) -> None:
        """Update the validation status for a user's API key.

        Used when a runtime Gemini call fails to mark the key as potentially invalid.

        Args:
            user_id: User UUID
            status: New status ('connected', 'validation_failed')
            error_message: Optional error message if validation failed
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE user_gemini_settings
                SET
                    status = $2,
                    validation_error = $3,
                    updated_at = $4
                WHERE user_id = $1
                """,
                user_id,
                status,
                error_message,
                now,
            )

    # -------------------------------------------------------------------------
    # Model Catalogue Methods (T022)
    # -------------------------------------------------------------------------

    async def get_active_models(self) -> list[dict]:
        """Get all active Gemini models from the admin-managed catalogue.

        Uses Redis caching to reduce database load for frequently accessed data.
        Cache is invalidated when models are created/updated/deleted.

        Returns:
            List of active models sorted by sort_order, with default model first
        """
        # Try cache first
        try:
            if redis_client._client is None:
                await redis_client.connect()
            cached = await redis_client.get(GEMINI_MODELS_CACHE_KEY)
            if cached:
                logger.debug("Gemini models cache hit")
                return json.loads(cached)
        except Exception as e:
            # Log but don't fail if Redis is unavailable
            logger.warning(f"Redis cache read failed: {e}")

        # Cache miss - fetch from database
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    model_id,
                    identifier,
                    display_name,
                    description,
                    is_default,
                    sort_order,
                    created_at,
                    updated_at
                FROM gemini_models
                WHERE is_active = TRUE
                ORDER BY is_default DESC, sort_order ASC, display_name ASC
                """
            )

            models = [
                {
                    "model_id": str(row["model_id"]),  # Serialize UUID for JSON
                    "identifier": row["identifier"],
                    "display_name": row["display_name"],
                    "description": row["description"],
                    "is_default": row["is_default"],
                    "sort_order": row["sort_order"],
                }
                for row in rows
            ]

        # Update cache
        try:
            if redis_client._client is None:
                await redis_client.connect()
            await redis_client.setex(
                GEMINI_MODELS_CACHE_KEY,
                GEMINI_MODELS_CACHE_TTL,
                json.dumps(models),
            )
            logger.debug("Gemini models cache updated")
        except Exception as e:
            # Log but don't fail if Redis is unavailable
            logger.warning(f"Redis cache write failed: {e}")

        return models

    async def get_default_model(self) -> Optional[dict]:
        """Get the platform default Gemini model.

        Returns:
            Default model dict or None if no default is set
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            return await self._get_default_model(conn)

    async def update_model_selection(
        self,
        user_id: UUID,
        workspace_id: UUID,
        model_id: Optional[UUID],
    ) -> dict:
        """Update user's selected Gemini model.

        Args:
            user_id: User UUID
            workspace_id: Workspace UUID
            model_id: Model ID to select, or None to use platform default

        Returns:
            Updated settings dict

        Raises:
            GeminiModelNotFoundError: If model doesn't exist or is inactive
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            # Validate model if provided
            if model_id:
                model_exists = await conn.fetchval(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM gemini_models
                        WHERE model_id = $1 AND is_active = TRUE
                    )
                    """,
                    model_id,
                )
                if not model_exists:
                    raise GeminiModelNotFoundError(model_id)

            # Check if settings exist
            existing = await conn.fetchval(
                "SELECT user_id FROM user_gemini_settings WHERE user_id = $1",
                user_id,
            )

            if existing:
                # Update model selection
                await conn.execute(
                    """
                    UPDATE user_gemini_settings
                    SET selected_model_id = $2, updated_at = $3
                    WHERE user_id = $1
                    """,
                    user_id,
                    model_id,
                    now,
                )
            else:
                # Create settings with just model selection (no API key yet)
                await conn.execute(
                    """
                    INSERT INTO user_gemini_settings (
                        user_id, selected_model_id, status, created_at, updated_at
                    )
                    VALUES ($1, $2, 'not_configured', $3, $4)
                    """,
                    user_id,
                    model_id,
                    now,
                    now,
                )

        return await self.get_user_settings(user_id, workspace_id)

    # -------------------------------------------------------------------------
    # AI Feature Toggles (T080)
    # -------------------------------------------------------------------------

    async def get_feature_toggles(self, user_id: UUID) -> dict:
        """Get user's AI feature toggle settings.

        Args:
            user_id: User UUID

        Returns:
            Dict with feature toggles and API status
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    api_key_encrypted IS NOT NULL as has_api_key,
                    status,
                    COALESCE(feature_photo_analysis, TRUE) as photo_analysis,
                    COALESCE(feature_captions, TRUE) as captions,
                    COALESCE(feature_hashtags, TRUE) as hashtags,
                    COALESCE(feature_gallery_story, TRUE) as gallery_story,
                    COALESCE(feature_smart_curation, TRUE) as smart_curation
                FROM user_gemini_settings
                WHERE user_id = $1
                """,
                user_id,
            )

            if not row:
                # Return defaults for users without settings
                return {
                    "toggles": {
                        "photo_analysis": True,
                        "captions": True,
                        "hashtags": True,
                        "gallery_story": True,
                        "smart_curation": True,
                    },
                    "has_api_key": False,
                    "api_status": "not_configured",
                }

            return {
                "toggles": {
                    "photo_analysis": row["photo_analysis"],
                    "captions": row["captions"],
                    "hashtags": row["hashtags"],
                    "gallery_story": row["gallery_story"],
                    "smart_curation": row["smart_curation"],
                },
                "has_api_key": row["has_api_key"],
                "api_status": row["status"],
            }

    async def update_feature_toggles(
        self,
        user_id: UUID,
        toggles: dict,
    ) -> dict:
        """Update user's AI feature toggle settings.

        Args:
            user_id: User UUID
            toggles: Dict with feature toggle updates (only non-None values applied)

        Returns:
            Updated feature toggles dict
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            # Check if settings exist
            existing = await conn.fetchval(
                "SELECT user_id FROM user_gemini_settings WHERE user_id = $1",
                user_id,
            )

            if existing:
                # Build dynamic update query
                updates = ["updated_at = $2"]
                params: list = [user_id, now]
                param_idx = 3

                toggle_mapping = {
                    "photo_analysis": "feature_photo_analysis",
                    "captions": "feature_captions",
                    "hashtags": "feature_hashtags",
                    "gallery_story": "feature_gallery_story",
                    "smart_curation": "feature_smart_curation",
                }

                for key, column in toggle_mapping.items():
                    if key in toggles and toggles[key] is not None:
                        updates.append(f"{column} = ${param_idx}")
                        params.append(toggles[key])
                        param_idx += 1

                if param_idx > 3:  # Only update if there are changes
                    await conn.execute(
                        f"""
                        UPDATE user_gemini_settings
                        SET {', '.join(updates)}
                        WHERE user_id = $1
                        """,
                        *params,
                    )
            else:
                # Create settings with feature toggles
                await conn.execute(
                    """
                    INSERT INTO user_gemini_settings (
                        user_id,
                        status,
                        feature_photo_analysis,
                        feature_captions,
                        feature_hashtags,
                        feature_gallery_story,
                        feature_smart_curation,
                        created_at,
                        updated_at
                    )
                    VALUES ($1, 'not_configured', $2, $3, $4, $5, $6, $7, $8)
                    """,
                    user_id,
                    toggles.get("photo_analysis", True),
                    toggles.get("captions", True),
                    toggles.get("hashtags", True),
                    toggles.get("gallery_story", True),
                    toggles.get("smart_curation", True),
                    now,
                    now,
                )

        return await self.get_feature_toggles(user_id)

    async def is_feature_enabled(
        self,
        user_id: UUID,
        feature: str,
    ) -> bool:
        """Check if a specific AI feature is enabled for a user.

        Args:
            user_id: User UUID
            feature: Feature name (photo_analysis, captions, hashtags, gallery_story, smart_curation)

        Returns:
            True if feature is enabled, False otherwise
        """
        feature_column_map = {
            "photo_analysis": "feature_photo_analysis",
            "captions": "feature_captions",
            "hashtags": "feature_hashtags",
            "gallery_story": "feature_gallery_story",
            "smart_curation": "feature_smart_curation",
        }

        column = feature_column_map.get(feature)
        if not column:
            logger.warning(f"Unknown AI feature: {feature}")
            return True  # Default to enabled for unknown features

        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            result = await conn.fetchval(
                f"""
                SELECT COALESCE({column}, TRUE)
                FROM user_gemini_settings
                WHERE user_id = $1
                """,
                user_id,
            )

            # Default to True if no settings exist
            return result if result is not None else True


# ---------------------------------------------------------------------------
# Singleton instance
# ---------------------------------------------------------------------------

_gemini_settings_service: Optional[GeminiSettingsService] = None


def get_gemini_settings_service() -> GeminiSettingsService:
    """Get singleton Gemini settings service instance."""
    global _gemini_settings_service
    if _gemini_settings_service is None:
        _gemini_settings_service = GeminiSettingsService()
    return _gemini_settings_service
