"""Gemini Client Service.

Provides configured Gemini API clients for users with their decrypted API keys
and resolved model selection.
Feature: 003-user-gemini-settings
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

import httpx

from app.db.postgres import get_postgres_pool
from app.services.gemini_settings_service import (
    get_gemini_settings_service,
    GeminiSettingsService,
)
from app.services.encryption_service import get_encryption_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class AIConfigurationError(Exception):
    """Raised when AI is not configured for a user."""

    def __init__(self, message: str, code: str = "AI_NOT_CONFIGURED"):
        super().__init__(message)
        self.code = code
        self.message = message


class AIRuntimeError(Exception):
    """Raised when an AI call fails at runtime."""

    def __init__(
        self,
        message: str,
        code: str,
        hint: Optional[str] = None,
        should_invalidate: bool = False,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint
        self.should_invalidate = should_invalidate


# ---------------------------------------------------------------------------
# Error Code Mapping
# ---------------------------------------------------------------------------

# Map Gemini API errors to user-friendly codes
GEMINI_ERROR_MAP = {
    400: ("INVALID_REQUEST", "The request to the AI service was invalid.", None),
    401: ("KEY_UNAUTHORIZED", "Your API key is not authorized.", "Please check your key in Google AI Studio."),
    403: ("KEY_FORBIDDEN", "Your API key doesn't have permission to access this model.", "Check your Google Cloud project settings."),
    429: ("RATE_LIMITED", "You've reached your AI usage limit.", "Please wait a moment or check your Google account quota."),
    500: ("SERVICE_ERROR", "The AI service encountered an error.", "Please try again in a few moments."),
    503: ("SERVICE_UNAVAILABLE", "The AI service is temporarily unavailable.", "Please try again in a few minutes."),
}

# Errors that should invalidate the user's key
INVALIDATING_ERRORS = {"KEY_UNAUTHORIZED", "KEY_FORBIDDEN", "INVALID_KEY"}


# ---------------------------------------------------------------------------
# Gemini Client Data
# ---------------------------------------------------------------------------


@dataclass
class GeminiClientConfig:
    """Configuration for a Gemini API client."""

    api_key: str
    model_identifier: str
    model_display_name: str
    user_id: UUID
    workspace_id: UUID


# ---------------------------------------------------------------------------
# Client Service
# ---------------------------------------------------------------------------


class GeminiClientService:
    """Service for obtaining configured Gemini API clients for users."""

    def __init__(self, settings_service: Optional[GeminiSettingsService] = None):
        self._settings_service = settings_service

    class _GeminiClient:
        """Minimal Gemini client wrapper used by services and tests."""

        def __init__(self, service: "GeminiClientService", config: GeminiClientConfig) -> None:
            self._service = service
            self._config = config
            self.model = config.model_identifier

        async def generate_content(self, contents: list[dict[str, Any]], **kwargs) -> Any:
            endpoint = f"/v1beta/models/{self.model}:generateContent"
            payload = {"contents": contents}
            response = await self._service.make_api_call(self._config, endpoint, payload)
            return type("GeminiResponse", (), {"text": json.dumps(response)})()

    @property
    def settings_service(self) -> GeminiSettingsService:
        if self._settings_service is None:
            self._settings_service = get_gemini_settings_service()
        return self._settings_service

    async def get_client_config(
        self, user_id: UUID, workspace_id: UUID
    ) -> GeminiClientConfig:
        """Get Gemini client configuration for a user.

        Resolves user settings, decrypts API key, and determines effective model.

        Args:
            user_id: The user's ID
            workspace_id: The workspace ID for key derivation

        Returns:
            GeminiClientConfig with decrypted API key and resolved model

        Raises:
            AIConfigurationError: If user has no API key configured
        """
        pool = await get_postgres_pool()

        # Fetch user settings
        row = await pool.fetchrow(
            """
            SELECT api_key_encrypted, api_key_iv, selected_model_id, status
            FROM user_gemini_settings
            WHERE user_id = $1
            """,
            user_id,
        )

        if not row or not row["api_key_encrypted"]:
            raise AIConfigurationError(
                message="Gemini AI is not configured. Please add your API key in Settings > AI.",
                code="AI_NOT_CONFIGURED",
            )

        if row["status"] == "validation_failed":
            raise AIConfigurationError(
                message="Your Gemini API key is no longer valid. Please update it in Settings > AI.",
                code="AI_KEY_INVALID",
            )

        # Decrypt the API key
        try:
            encryption_service = get_encryption_service()
            api_key = encryption_service.decrypt_user_api_key(
                row["api_key_encrypted"],
                row["api_key_iv"],
                user_id,
                workspace_id,
            )
        except Exception as e:
            logger.error(
                "Failed to decrypt API key",
                extra={"user_id": str(user_id), "error": str(e)},
            )
            raise AIConfigurationError(
                message="Unable to access your AI configuration. Please re-configure your API key.",
                code="DECRYPTION_FAILED",
            )

        # Get effective model
        effective_model = await self._get_effective_model(row["selected_model_id"])

        return GeminiClientConfig(
            api_key=api_key,
            model_identifier=effective_model["identifier"],
            model_display_name=effective_model["display_name"],
            user_id=user_id,
            workspace_id=workspace_id,
        )

    async def get_client_for_user(
        self, user_id: UUID, workspace_id: Optional[UUID] = None
    ) -> "GeminiClientService._GeminiClient":
        """Return a ready-to-use Gemini client for the given user."""

        workspace = workspace_id or user_id
        config = await self.get_client_config(user_id, workspace)
        return self._GeminiClient(self, config)

    async def _get_effective_model(self, selected_model_id: Optional[UUID]) -> dict:
        """Get the effective model (selected or platform default)."""
        pool = await get_postgres_pool()

        if selected_model_id:
            # Try to get selected model
            model = await pool.fetchrow(
                """
                SELECT model_id, identifier, display_name
                FROM gemini_models
                WHERE model_id = $1 AND is_active = TRUE
                """,
                selected_model_id,
            )
            if model:
                return dict(model)
            # Selected model no longer active, fall through to default

        # Get platform default
        model = await pool.fetchrow(
            """
            SELECT model_id, identifier, display_name
            FROM gemini_models
            WHERE is_default = TRUE AND is_active = TRUE
            """
        )

        if not model:
            # No default model - get any active model
            model = await pool.fetchrow(
                """
                SELECT model_id, identifier, display_name
                FROM gemini_models
                WHERE is_active = TRUE
                ORDER BY sort_order ASC
                LIMIT 1
                """
            )

        if not model:
            raise AIConfigurationError(
                message="No AI models are currently available. Please contact support.",
                code="NO_MODELS_AVAILABLE",
            )

        return dict(model)

    async def make_api_call(
        self,
        config: GeminiClientConfig,
        endpoint: str,
        payload: dict[str, Any],
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        """Make an API call to Gemini.

        Handles errors and maps them to user-friendly codes.

        Args:
            config: The client configuration
            endpoint: API endpoint path (e.g., "/v1beta/models/{model}:generateContent")
            payload: Request payload
            timeout: Request timeout in seconds

        Returns:
            API response data

        Raises:
            AIRuntimeError: On API errors
        """
        url = f"https://generativelanguage.googleapis.com{endpoint}"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": config.api_key,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, json=payload, headers=headers)

                if response.status_code == 200:
                    return response.json()

                # Handle error response
                error_info = GEMINI_ERROR_MAP.get(
                    response.status_code,
                    ("API_ERROR", f"AI request failed (HTTP {response.status_code})", None),
                )
                code, message, hint = error_info
                should_invalidate = code in INVALIDATING_ERRORS

                # Update user status if key is invalid
                if should_invalidate:
                    await self._mark_key_invalid(config.user_id, code, message)

                raise AIRuntimeError(
                    message=message,
                    code=code,
                    hint=hint,
                    should_invalidate=should_invalidate,
                )

        except httpx.TimeoutException:
            raise AIRuntimeError(
                message="The AI request timed out. Please try again.",
                code="TIMEOUT",
                hint="Large requests may take longer to process.",
            )
        except httpx.NetworkError:
            raise AIRuntimeError(
                message="Unable to connect to the AI service.",
                code="NETWORK_ERROR",
                hint="Please check your internet connection and try again.",
            )

    async def _mark_key_invalid(
        self, user_id: UUID, error_code: str, error_message: str
    ) -> None:
        """Mark user's API key as invalid."""
        pool = await get_postgres_pool()
        await pool.execute(
            """
            UPDATE user_gemini_settings
            SET status = 'validation_failed',
                validation_error = $2,
                updated_at = NOW()
            WHERE user_id = $1
            """,
            user_id,
            error_code,
        )
        logger.warning(
            "Marked user API key as invalid",
            extra={
                "user_id": str(user_id),
                "error_code": error_code,
                "error_message": error_message,
            },
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_service_instance: Optional[GeminiClientService] = None


def get_gemini_client_service() -> GeminiClientService:
    """Get singleton instance of GeminiClientService."""
    global _service_instance
    if _service_instance is None:
        _service_instance = GeminiClientService()
    return _service_instance
