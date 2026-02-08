"""Gemini Client Service.

Provides configured Gemini API clients for users with their decrypted API keys
and resolved model selection.
Feature: 003-user-gemini-settings
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

import httpx
from pydantic import BaseModel, Field

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.services.gemini_settings_service import (
    get_gemini_settings_service,
    GeminiSettingsService,
)
from app.services.encryption_service import get_encryption_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SearchIntent Schema for GEO Search
# ---------------------------------------------------------------------------


class TechnicalFilters(BaseModel):
    """EXIF-based technical filters for photo search."""

    iso_min: Optional[int] = Field(None, description="Minimum ISO value")
    iso_max: Optional[int] = Field(None, description="Maximum ISO value")
    aperture_min: Optional[float] = Field(None, description="Minimum aperture (f-number)")
    aperture_max: Optional[float] = Field(None, description="Maximum aperture (f-number)")
    focal_length_min: Optional[int] = Field(None, description="Minimum focal length in mm")
    focal_length_max: Optional[int] = Field(None, description="Maximum focal length in mm")
    shutter_speed_min: Optional[str] = Field(None, description="Minimum shutter speed (e.g., '1/1000')")
    shutter_speed_max: Optional[str] = Field(None, description="Maximum shutter speed (e.g., '1/60')")


class DateRange(BaseModel):
    """Date range filter for search queries."""

    start: Optional[str] = Field(None, description="Start date in ISO format")
    end: Optional[str] = Field(None, description="End date in ISO format")


class SearchIntent(BaseModel):
    """Parsed search intent from natural language query.

    This model represents the extracted semantic meaning from a user's
    natural language search query for GEO (Gemini Enhanced Orchestration) search.

    Example:
        Query: "outdoor wedding photos with bride smiling at golden hour"
        Result:
            intent: "search_photos"
            scene: ["outdoor", "wedding"]
            people: ["bride"]
            expressions: ["smiling"]
            visual_attributes: ["golden hour"]
    """

    intent: str = Field(
        default="search_photos",
        description="The primary search intent (search_photos, browse_gallery, find_similar)",
    )
    scene: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Scene descriptors (e.g., ceremony, reception, portraits, outdoor, beach)",
    )
    people: list[str] = Field(
        default_factory=list,
        max_length=3,
        description="Specific people mentioned (e.g., bride, groom, flower girl, couple)",
    )
    expressions: list[str] = Field(
        default_factory=list,
        max_length=3,
        description="Emotions or expressions (e.g., smiling, laughing, crying, candid)",
    )
    visual_attributes: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Visual style attributes (e.g., golden hour, bokeh, dramatic, silhouette)",
    )
    technical_filters: TechnicalFilters = Field(
        default_factory=TechnicalFilters,
        description="EXIF-based technical filters",
    )
    gallery_name: Optional[str] = Field(
        None,
        description="Specific gallery name if mentioned",
    )
    date_range: Optional[DateRange] = Field(
        None,
        description="Date/time range if mentioned",
    )
    quality_min: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Minimum quality score if mentioned (0.0 to 1.0)",
    )


# Cache TTL for parsed search intents (24 hours)
SEARCH_INTENT_CACHE_TTL = 86400
SEARCH_INTENT_CACHE_PREFIX = "ai:search_intent"


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

    # -----------------------------------------------------------------------
    # GEO Search: Query Parsing
    # -----------------------------------------------------------------------

    async def parse_search_query(
        self,
        query: str,
        config: GeminiClientConfig,
    ) -> SearchIntent:
        """Parse a natural language search query into structured SearchIntent.

        Uses Gemini 1.5 Flash with structured output to extract semantic meaning
        from user search queries for GEO (Gemini Enhanced Orchestration) search.

        Args:
            query: Natural language search query (e.g., "outdoor wedding photos
                   with bride smiling at golden hour")
            config: Gemini client configuration with API key and model

        Returns:
            SearchIntent with extracted intent, scene descriptors, people,
            expressions, visual attributes, and technical filters

        Examples:
            >>> intent = await service.parse_search_query(
            ...     "outdoor wedding photos with bride smiling",
            ...     config
            ... )
            >>> intent.scene
            ['outdoor', 'wedding']
            >>> intent.people
            ['bride']
            >>> intent.expressions
            ['smiling']

            >>> intent = await service.parse_search_query(
            ...     "portraits with bokeh shot at f/1.4",
            ...     config
            ... )
            >>> intent.scene
            ['portraits']
            >>> intent.visual_attributes
            ['bokeh']
            >>> intent.technical_filters.aperture_max
            1.4

        Notes:
            - Uses low temperature (0.1) for consistent parsing
            - Cached in Redis for 24 hours using MD5(query.lower())
            - Returns default broad search intent on errors
            - Timeout after 5 seconds
        """
        # Normalize query for caching
        normalized_query = query.strip().lower()
        if not normalized_query:
            logger.debug("Empty search query, returning default intent")
            return SearchIntent()

        # Check cache first
        cache_key = self._get_search_intent_cache_key(normalized_query)
        cached_intent = await self._get_cached_search_intent(cache_key)
        if cached_intent is not None:
            logger.debug(
                "Search intent cache hit",
                extra={"query": query[:50], "cache_key": cache_key},
            )
            return cached_intent

        # Build the prompt for structured output
        system_prompt = self._build_search_intent_prompt()

        # Prepare the request payload with structured output schema
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"Parse this photo search query: {query}"}],
                }
            ],
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "generationConfig": {
                "temperature": 0.1,  # Low temperature for consistency
                "responseMimeType": "application/json",
                "responseSchema": self._get_search_intent_schema(),
            },
        }

        # Use Gemini 1.5 Flash for fast parsing
        # Override model to use flash variant for speed
        flash_model = "gemini-1.5-flash"
        endpoint = f"/v1beta/models/{flash_model}:generateContent"

        try:
            # Make API call with 5 second timeout
            response = await asyncio.wait_for(
                self._make_search_api_call(config, endpoint, payload),
                timeout=5.0,
            )

            # Parse the response
            intent = self._parse_gemini_response(response)

            # Cache the result
            await self._cache_search_intent(cache_key, intent)

            logger.info(
                "Parsed search query successfully",
                extra={
                    "query": query[:50],
                    "intent": intent.intent,
                    "scene_count": len(intent.scene),
                    "people_count": len(intent.people),
                },
            )

            return intent

        except asyncio.TimeoutError:
            logger.warning(
                "Search query parsing timed out",
                extra={"query": query[:50]},
            )
            return self._get_default_search_intent(query)

        except (AIRuntimeError, AIConfigurationError) as e:
            logger.warning(
                "Gemini API error during search parsing",
                extra={"query": query[:50], "error": str(e)},
            )
            return self._get_default_search_intent(query)

        except Exception as e:
            logger.error(
                "Unexpected error parsing search query",
                extra={"query": query[:50], "error": str(e)},
                exc_info=True,
            )
            return self._get_default_search_intent(query)

    def _build_search_intent_prompt(self) -> str:
        """Build the system prompt for search query parsing."""
        return """You are a search query parser for a professional photography platform.
Your task is to extract structured search intent from natural language queries.

Extract the following from user queries:
1. **intent**: The primary search action (search_photos, browse_gallery, find_similar)
2. **scene**: Up to 5 scene descriptors (e.g., ceremony, reception, portraits, outdoor, beach, church, sunset, first dance, cake cutting)
3. **people**: Up to 3 people mentioned (e.g., bride, groom, couple, flower girl, bridesmaids, groomsmen, family, guests)
4. **expressions**: Up to 3 emotions/expressions (e.g., smiling, laughing, crying, candid, serious, romantic, joyful)
5. **visual_attributes**: Up to 5 visual style attributes (e.g., golden hour, bokeh, dramatic, silhouette, black and white, moody, bright, airy)
6. **technical_filters**: EXIF-based filters if mentioned:
   - iso_min/iso_max: ISO range
   - aperture_min/aperture_max: f-number range (lower = wider aperture)
   - focal_length_min/focal_length_max: focal length in mm
   - shutter_speed_min/shutter_speed_max: shutter speed strings like "1/1000"
7. **gallery_name**: Specific gallery name if mentioned
8. **date_range**: Date range if mentioned (start/end in ISO format)
9. **quality_min**: Minimum quality score (0.0-1.0) if quality is mentioned

Guidelines:
- Be conservative: only extract what is explicitly or clearly implied
- Normalize terms (e.g., "bride and groom" -> ["bride", "groom"] in people)
- Handle ambiguous queries gracefully with minimal extraction
- For technical terms like "f/1.4" extract as aperture_max=1.4 (smaller f-number = wider aperture)
- For "ISO 100-800" extract as iso_min=100, iso_max=800
- Default intent is "search_photos" unless browsing or similarity is indicated"""

    def _get_search_intent_schema(self) -> dict[str, Any]:
        """Get the JSON schema for SearchIntent structured output."""
        return {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "enum": ["search_photos", "browse_gallery", "find_similar"],
                },
                "scene": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 5,
                },
                "people": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 3,
                },
                "expressions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 3,
                },
                "visual_attributes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 5,
                },
                "technical_filters": {
                    "type": "object",
                    "properties": {
                        "iso_min": {"type": "integer"},
                        "iso_max": {"type": "integer"},
                        "aperture_min": {"type": "number"},
                        "aperture_max": {"type": "number"},
                        "focal_length_min": {"type": "integer"},
                        "focal_length_max": {"type": "integer"},
                        "shutter_speed_min": {"type": "string"},
                        "shutter_speed_max": {"type": "string"},
                    },
                },
                "gallery_name": {"type": "string"},
                "date_range": {
                    "type": "object",
                    "properties": {
                        "start": {"type": "string"},
                        "end": {"type": "string"},
                    },
                },
                "quality_min": {"type": "number"},
            },
            "required": ["intent"],
        }

    async def _make_search_api_call(
        self,
        config: GeminiClientConfig,
        endpoint: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Make API call for search parsing (simplified, no key invalidation)."""
        url = f"https://generativelanguage.googleapis.com{endpoint}"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": config.api_key,
        }

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code == 200:
                return response.json()

            # For search parsing, we don't invalidate keys - just fail gracefully
            error_info = GEMINI_ERROR_MAP.get(
                response.status_code,
                ("API_ERROR", f"AI request failed (HTTP {response.status_code})", None),
            )
            code, message, hint = error_info
            raise AIRuntimeError(message=message, code=code, hint=hint)

    def _parse_gemini_response(self, response: dict[str, Any]) -> SearchIntent:
        """Parse Gemini response into SearchIntent model."""
        try:
            # Extract text from response
            candidates = response.get("candidates", [])
            if not candidates:
                logger.warning("No candidates in Gemini response")
                return SearchIntent()

            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                logger.warning("No parts in Gemini response content")
                return SearchIntent()

            text = parts[0].get("text", "{}")

            # Parse JSON response
            data = json.loads(text)

            # Build TechnicalFilters if present
            tech_data = data.get("technical_filters", {})
            technical_filters = TechnicalFilters(
                iso_min=tech_data.get("iso_min"),
                iso_max=tech_data.get("iso_max"),
                aperture_min=tech_data.get("aperture_min"),
                aperture_max=tech_data.get("aperture_max"),
                focal_length_min=tech_data.get("focal_length_min"),
                focal_length_max=tech_data.get("focal_length_max"),
                shutter_speed_min=tech_data.get("shutter_speed_min"),
                shutter_speed_max=tech_data.get("shutter_speed_max"),
            )

            # Build DateRange if present
            date_data = data.get("date_range")
            date_range = None
            if date_data:
                date_range = DateRange(
                    start=date_data.get("start"),
                    end=date_data.get("end"),
                )

            # Limit arrays to max sizes
            scene = data.get("scene", [])[:5]
            people = data.get("people", [])[:3]
            expressions = data.get("expressions", [])[:3]
            visual_attributes = data.get("visual_attributes", [])[:5]

            return SearchIntent(
                intent=data.get("intent", "search_photos"),
                scene=scene,
                people=people,
                expressions=expressions,
                visual_attributes=visual_attributes,
                technical_filters=technical_filters,
                gallery_name=data.get("gallery_name"),
                date_range=date_range,
                quality_min=data.get("quality_min"),
            )

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse Gemini JSON response: {e}")
            return SearchIntent()
        except Exception as e:
            logger.warning(f"Error parsing Gemini response: {e}")
            return SearchIntent()

    def _get_default_search_intent(self, query: str) -> SearchIntent:
        """Get a default broad search intent for fallback cases.

        Performs basic keyword extraction without AI for graceful degradation.
        """
        # Simple keyword-based extraction for common terms
        query_lower = query.lower()
        scene = []
        people = []
        expressions = []

        # Common scene keywords
        scene_keywords = {
            "ceremony": "ceremony",
            "reception": "reception",
            "outdoor": "outdoor",
            "indoor": "indoor",
            "beach": "beach",
            "church": "church",
            "garden": "garden",
            "sunset": "sunset",
            "portrait": "portraits",
            "portraits": "portraits",
            "wedding": "wedding",
            "engagement": "engagement",
        }

        # Common people keywords
        people_keywords = {
            "bride": "bride",
            "groom": "groom",
            "couple": "couple",
            "bridesmaids": "bridesmaids",
            "groomsmen": "groomsmen",
            "flower girl": "flower girl",
            "ring bearer": "ring bearer",
            "family": "family",
        }

        # Common expression keywords
        expression_keywords = {
            "smiling": "smiling",
            "smile": "smiling",
            "laughing": "laughing",
            "laugh": "laughing",
            "crying": "crying",
            "happy": "happy",
            "candid": "candid",
            "romantic": "romantic",
        }

        for keyword, value in scene_keywords.items():
            if keyword in query_lower and value not in scene:
                scene.append(value)
                if len(scene) >= 5:
                    break

        for keyword, value in people_keywords.items():
            if keyword in query_lower and value not in people:
                people.append(value)
                if len(people) >= 3:
                    break

        for keyword, value in expression_keywords.items():
            if keyword in query_lower and value not in expressions:
                expressions.append(value)
                if len(expressions) >= 3:
                    break

        return SearchIntent(
            intent="search_photos",
            scene=scene,
            people=people,
            expressions=expressions,
        )

    def _get_search_intent_cache_key(self, normalized_query: str) -> str:
        """Generate cache key for search intent using MD5 hash."""
        query_hash = hashlib.md5(normalized_query.encode()).hexdigest()
        return f"{SEARCH_INTENT_CACHE_PREFIX}:{query_hash}"

    async def _get_cached_search_intent(self, cache_key: str) -> Optional[SearchIntent]:
        """Get cached search intent from Redis."""
        try:
            redis = await get_redis_client()
            cached = await redis.get(cache_key)
            if cached:
                data = json.loads(cached)
                # Reconstruct nested models
                tech_data = data.get("technical_filters", {})
                data["technical_filters"] = TechnicalFilters(**tech_data)
                date_data = data.get("date_range")
                if date_data:
                    data["date_range"] = DateRange(**date_data)
                return SearchIntent(**data)
            return None
        except Exception as e:
            logger.warning(f"Failed to get cached search intent: {e}")
            return None

    async def _cache_search_intent(self, cache_key: str, intent: SearchIntent) -> None:
        """Cache search intent to Redis with 24-hour TTL."""
        try:
            redis = await get_redis_client()
            # Convert to dict for JSON serialization
            data = intent.model_dump(mode="json")
            await redis.setex(cache_key, SEARCH_INTENT_CACHE_TTL, json.dumps(data))
            logger.debug(f"Cached search intent: {cache_key}")
        except Exception as e:
            logger.warning(f"Failed to cache search intent: {e}")

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
