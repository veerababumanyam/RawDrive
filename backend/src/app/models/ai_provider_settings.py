"""Models for AI provider settings.

This module defines Pydantic models for managing AI provider configuration:

1. Admin-level AIProviderSettings (ai_provider_settings table):
   - Platform-wide provider configuration with encrypted credentials
   - Rate limiting, timeouts, and failover priority
   - Health status tracking for circuit breaker integration

2. User-level UserAIProviderSettings (user_ai_provider_settings table):
   - Per-user API keys for Cloud Vision, Gemini, Video Intelligence, OpenAI
   - Encrypted storage with validation status tracking

Feature: Face Detection and Identification
Task: T004 - Create AIProviderSettings SQLAlchemy model for encrypted credentials storage
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# =============================================================================
# ENUMS
# =============================================================================


class AIProvider(str, Enum):
    """Supported AI providers for face detection and other AI features.

    Each provider has different capabilities:
    - CLOUD_VISION: Google Cloud Vision API (high accuracy face detection)
    - GEMINI: Google Gemini Flash (fallback, multimodal capabilities)
    - VIDEO_INTELLIGENCE: Google Video Intelligence API (video analysis)
    - OPENAI: OpenAI API (embeddings, CLIP for semantic search)
    """

    CLOUD_VISION = "cloud_vision"
    GEMINI = "gemini"
    VIDEO_INTELLIGENCE = "video_intelligence"
    OPENAI = "openai"


class ProviderStatus(str, Enum):
    """Provider configuration status for user-level settings."""

    NOT_CONFIGURED = "not_configured"
    CONNECTED = "connected"
    VALIDATION_FAILED = "validation_failed"


class ProviderHealthStatus(str, Enum):
    """Health status for admin-level provider configuration.

    Used for circuit breaker integration:
    - HEALTHY: Provider is responding normally
    - UNHEALTHY: Provider is experiencing issues (failover to next provider)
    - UNKNOWN: Health status has not been checked yet
    """

    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class CredentialType(str, Enum):
    """Type of credentials required by provider."""

    API_KEY = "api_key"
    SERVICE_ACCOUNT_JSON = "service_account_json"


class AIProviderInfo(BaseModel):
    """Information about a supported AI provider."""

    provider: AIProvider
    name: str
    description: str
    credential_type: CredentialType
    documentation_url: Optional[str] = None


# =============================================================================
# ADMIN-LEVEL AI PROVIDER SETTINGS (T004)
# =============================================================================


class AIProviderSettings(BaseModel):
    """Admin-level AI Provider Settings Domain Model.

    Represents platform-wide configuration for AI providers used in face
    detection and other AI features. Stored in the `ai_provider_settings` table.

    Key Features:
    - Encrypted credential storage (API keys, service account JSON)
    - Configurable rate limits and timeouts per provider
    - Priority-based failover ordering
    - Health status tracking for circuit breaker integration

    Configuration Precedence:
    1. Admin settings (this model) - highest priority
    2. Environment variables - fallback when admin settings not configured

    Security:
    - Credentials are encrypted using AES-256-GCM
    - Encryption key is derived from the application master key
    - Only server-side code should access decrypted credentials
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary identifier
    id: UUID = Field(..., description="Unique provider settings identifier")

    # Provider identification
    provider_name: str = Field(
        ...,
        max_length=50,
        description="Provider identifier: cloud_vision, gemini, etc.",
    )

    # Encrypted credentials (stored as bytes in database)
    # NULL means credentials should be loaded from environment variables
    credentials_encrypted: Optional[bytes] = Field(
        None,
        description="Encrypted API key or service account JSON (AES-256-GCM)",
    )

    # Provider-specific configuration
    config: dict[str, Any] = Field(
        default_factory=dict,
        description="Provider-specific config: model, project_id, max_results, etc.",
    )

    # Enable/disable toggle
    is_enabled: bool = Field(
        True,
        description="Whether this provider is enabled for use",
    )

    # Priority for failover ordering (lower = higher priority)
    priority: int = Field(
        0,
        ge=0,
        description="Failover priority (0 = primary, 1 = first fallback, etc.)",
    )

    # Rate limiting
    rate_limit_per_minute: Optional[int] = Field(
        None,
        gt=0,
        description="Maximum requests per minute (NULL = no limit)",
    )

    # Request timeout
    timeout_ms: int = Field(
        30000,
        gt=0,
        description="Request timeout in milliseconds",
    )

    # Health status for circuit breaker
    health_status: ProviderHealthStatus = Field(
        ProviderHealthStatus.UNKNOWN,
        description="Current health status for failover decisions",
    )

    # Last health check timestamp
    last_health_check: Optional[datetime] = Field(
        None,
        description="When the last health check was performed",
    )

    # Timestamps
    created_at: datetime = Field(
        ...,
        description="When the provider was configured",
    )
    updated_at: datetime = Field(
        ...,
        description="Last update timestamp",
    )

    # =========================================================================
    # COMPUTED PROPERTIES
    # =========================================================================

    @property
    def has_credentials(self) -> bool:
        """Check if encrypted credentials are stored."""
        return self.credentials_encrypted is not None

    @property
    def is_healthy(self) -> bool:
        """Check if provider is healthy and ready to use."""
        return self.health_status == ProviderHealthStatus.HEALTHY

    @property
    def is_available(self) -> bool:
        """Check if provider is enabled and healthy."""
        return self.is_enabled and self.health_status != ProviderHealthStatus.UNHEALTHY

    @property
    def timeout_seconds(self) -> float:
        """Get timeout as seconds (for httpx/aiohttp)."""
        return self.timeout_ms / 1000.0

    def get_config_value(self, key: str, default: Any = None) -> Any:
        """Get a configuration value with optional default."""
        return self.config.get(key, default)


class AIProviderSettingsCreate(BaseModel):
    """Schema for creating admin-level AI provider settings.

    Used when an admin configures a new AI provider for the platform.
    """

    # Required fields
    provider_name: str = Field(
        ...,
        max_length=50,
        description="Provider identifier: cloud_vision, gemini, etc.",
    )

    # Credentials (one of these should be provided)
    api_key: Optional[str] = Field(
        None,
        min_length=1,
        max_length=500,
        description="API key for key-based providers",
    )
    service_account_json: Optional[dict] = Field(
        None,
        description="Service account JSON for Google Cloud providers",
    )

    # Optional configuration
    config: dict[str, Any] = Field(
        default_factory=dict,
        description="Provider-specific configuration",
    )
    is_enabled: bool = Field(
        True,
        description="Whether to enable this provider",
    )
    priority: int = Field(
        0,
        ge=0,
        description="Failover priority (lower = higher priority)",
    )
    rate_limit_per_minute: Optional[int] = Field(
        None,
        gt=0,
        description="Rate limit (requests per minute)",
    )
    timeout_ms: int = Field(
        30000,
        gt=0,
        description="Request timeout in milliseconds",
    )

    @field_validator("provider_name")
    @classmethod
    def validate_provider_name(cls, v: str) -> str:
        """Validate provider name is a known provider."""
        valid_providers = {"cloud_vision", "gemini", "video_intelligence", "openai"}
        if v not in valid_providers:
            raise ValueError(f"Invalid provider: {v}. Must be one of: {valid_providers}")
        return v


class AIProviderSettingsUpdate(BaseModel):
    """Schema for updating admin-level AI provider settings.

    All fields are optional. Use this to update configuration,
    credentials, or enable/disable a provider.
    """

    # Credential updates
    api_key: Optional[str] = Field(
        None,
        min_length=1,
        max_length=500,
        description="New API key (will be encrypted)",
    )
    service_account_json: Optional[dict] = Field(
        None,
        description="New service account JSON (will be encrypted)",
    )
    clear_credentials: bool = Field(
        False,
        description="Set to True to clear stored credentials (use env vars)",
    )

    # Configuration updates
    config: Optional[dict[str, Any]] = Field(
        None,
        description="Updated provider configuration",
    )
    is_enabled: Optional[bool] = Field(
        None,
        description="Enable or disable provider",
    )
    priority: Optional[int] = Field(
        None,
        ge=0,
        description="Update failover priority",
    )
    rate_limit_per_minute: Optional[int] = Field(
        None,
        gt=0,
        description="Update rate limit",
    )
    timeout_ms: Optional[int] = Field(
        None,
        gt=0,
        description="Update timeout",
    )

    # Health status (usually updated by health check service)
    health_status: Optional[ProviderHealthStatus] = Field(
        None,
        description="Update health status",
    )


class AIProviderSettingsSummary(BaseModel):
    """Lightweight summary of AI provider settings for list responses.

    Excludes encrypted credentials for security.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    provider_name: str
    has_credentials: bool = Field(
        False,
        description="Whether credentials are configured",
    )
    config: dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True
    priority: int = 0
    rate_limit_per_minute: Optional[int] = None
    timeout_ms: int = 30000
    health_status: ProviderHealthStatus = ProviderHealthStatus.UNKNOWN
    last_health_check: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class DecryptedProviderCredentials(BaseModel):
    """Decrypted admin-level provider credentials.

    WARNING: This model contains sensitive data and should NEVER be
    exposed in API responses. Only use server-side for making provider calls.

    This is separate from DecryptedCredentials which is for user-level credentials.
    """

    provider_name: str = Field(
        ...,
        description="Provider identifier",
    )

    # Credential type and value
    credential_type: CredentialType = Field(
        ...,
        description="Type of credential stored",
    )

    # For API key providers
    api_key: Optional[str] = Field(
        None,
        description="Decrypted API key",
    )

    # For service account providers
    service_account_json: Optional[dict] = Field(
        None,
        description="Decrypted service account JSON",
    )

    # Configuration for provider
    config: dict[str, Any] = Field(
        default_factory=dict,
        description="Provider configuration",
    )

    # Rate limiting info
    rate_limit_per_minute: Optional[int] = None
    timeout_ms: int = 30000

    @property
    def has_valid_credentials(self) -> bool:
        """Check if credentials are present and valid."""
        if self.credential_type == CredentialType.API_KEY:
            return self.api_key is not None and len(self.api_key) > 0
        elif self.credential_type == CredentialType.SERVICE_ACCOUNT_JSON:
            return self.service_account_json is not None
        return False


class ProviderFailoverConfig(BaseModel):
    """Configuration for provider failover behavior.

    Used by ProviderManager to determine failover strategy.
    """

    # Maximum number of retries before failing over
    max_retries: int = Field(
        3,
        ge=1,
        description="Max retries before failover",
    )

    # Timeout for individual requests (overrides provider timeout if set)
    request_timeout_ms: Optional[int] = Field(
        None,
        gt=0,
        description="Request timeout override",
    )

    # Circuit breaker settings
    failure_threshold: int = Field(
        5,
        ge=1,
        description="Failures before marking unhealthy",
    )
    recovery_timeout_seconds: int = Field(
        60,
        ge=1,
        description="Seconds to wait before retrying unhealthy provider",
    )

    # Health check interval
    health_check_interval_seconds: int = Field(
        300,
        ge=60,
        description="Seconds between health checks",
    )


# =============================================================================
# USER-LEVEL AI PROVIDER SETTINGS
# =============================================================================


class UserAIProviderSettings(BaseModel):
    """User-level AI Provider Settings Domain Model.

    Represents per-user API key configuration for AI providers.
    Stored in the `user_ai_provider_settings` table.

    Enables users to use their own API keys instead of platform-level
    credentials, giving them control over AI budgets and quotas.

    Security:
    - API keys are encrypted using AES-256-GCM with user-scoped keys
    - IV (initialization vector) is stored separately for each credential
    - Only prefix/suffix are stored unencrypted for display purposes
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary identifiers
    setting_id: UUID = Field(..., description="Unique settings identifier")
    user_id: UUID = Field(..., description="User who owns these credentials")
    workspace_id: UUID = Field(..., description="Workspace context")

    # Provider identification
    provider: AIProvider = Field(..., description="AI provider type")

    # Encrypted credentials (internal only - never expose in API responses)
    api_key_encrypted: Optional[bytes] = Field(
        None,
        description="Encrypted API key (AES-256-GCM)",
    )
    api_key_iv: Optional[bytes] = Field(
        None,
        description="IV for API key encryption",
    )
    credentials_json_encrypted: Optional[bytes] = Field(
        None,
        description="Encrypted service account JSON",
    )
    credentials_iv: Optional[bytes] = Field(
        None,
        description="IV for credentials JSON encryption",
    )

    # Masked display (safe for API responses)
    api_key_prefix: Optional[str] = Field(
        None,
        max_length=10,
        description="First few characters for display (e.g., 'AIza')",
    )
    api_key_suffix: Optional[str] = Field(
        None,
        max_length=10,
        description="Last few characters for display (e.g., 'stuv')",
    )

    # Status tracking
    status: ProviderStatus = Field(
        ProviderStatus.NOT_CONFIGURED,
        description="Current configuration status",
    )
    is_enabled: bool = Field(
        True,
        description="Whether user has enabled this provider",
    )
    last_validated_at: Optional[datetime] = Field(
        None,
        description="When credentials were last validated",
    )
    validation_error: Optional[str] = Field(
        None,
        description="Error message from last failed validation",
    )

    # Usage tracking
    credits_used: int = Field(
        0,
        ge=0,
        description="Number of API credits used",
    )
    last_used_at: Optional[datetime] = Field(
        None,
        description="When credentials were last used",
    )

    # Timestamps
    created_at: datetime = Field(..., description="When settings were created")
    updated_at: datetime = Field(..., description="Last update timestamp")

    # =========================================================================
    # COMPUTED PROPERTIES
    # =========================================================================

    @property
    def has_credentials(self) -> bool:
        """Check if any credentials are stored."""
        return (
            self.api_key_encrypted is not None
            or self.credentials_json_encrypted is not None
        )

    @property
    def is_connected(self) -> bool:
        """Check if provider is connected and validated."""
        return self.status == ProviderStatus.CONNECTED

    @property
    def api_key_masked(self) -> Optional[str]:
        """Get masked API key for display."""
        if self.api_key_prefix and self.api_key_suffix:
            return f"{self.api_key_prefix}...{self.api_key_suffix}"
        return None


class UserAIProviderSettingsCreate(BaseModel):
    """Request schema for creating/updating user AI provider settings.

    Used when a user configures their own API key for a provider.
    """

    # For API key providers (Gemini, OpenAI)
    api_key: Optional[str] = Field(
        None,
        min_length=1,
        max_length=500,
        description="API key for the provider",
    )

    # For service account providers (Cloud Vision, Video Intelligence)
    service_account_json: Optional[dict] = Field(
        None,
        description="Service account JSON credentials",
    )

    # Validation options
    skip_validation: bool = Field(
        False,
        description="Skip credential validation (not recommended)",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "api_key": "AIzaSyD1234567890abcdefghijklmnopqrstuv",
                "skip_validation": False,
            }
        }
    )


class UserAIProviderSettingsResponse(BaseModel):
    """Response schema for user AI provider settings.

    Safe for API responses - contains only masked credentials and status.
    """

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "provider": "gemini",
                "provider_name": "Google Gemini",
                "provider_description": "Google's multimodal AI model for vision and text",
                "credential_type": "api_key",
                "status": "connected",
                "has_credentials": True,
                "is_enabled": True,
                "api_key_masked": "AIza...stuv",
                "last_validated_at": "2026-01-08T10:30:00Z",
                "validation_error": None,
                "credits_used": 150,
                "last_used_at": "2026-01-08T10:30:00Z",
            }
        },
    )

    # Provider identification
    provider: AIProvider = Field(..., description="Provider type")
    provider_name: str = Field(..., description="Human-readable provider name")
    provider_description: str = Field(..., description="Provider description")
    credential_type: CredentialType = Field(
        ..., description="Type of credentials required"
    )

    # Status
    status: ProviderStatus = Field(..., description="Configuration status")
    has_credentials: bool = Field(..., description="Whether credentials are stored")
    is_enabled: bool = Field(..., description="Whether provider is enabled")

    # Masked credentials (safe for display)
    api_key_masked: Optional[str] = Field(
        None,
        description="Masked API key for display (e.g., 'AIza...stuv')",
    )

    # Validation info
    last_validated_at: Optional[datetime] = Field(
        None,
        description="When credentials were last validated",
    )
    validation_error: Optional[str] = Field(
        None,
        description="Last validation error message",
    )

    # Usage tracking
    credits_used: int = Field(0, description="API credits used")
    last_used_at: Optional[datetime] = Field(None, description="Last usage timestamp")

    # Timestamps
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")


# Alias for backward compatibility
AIProviderSettingsResponse = UserAIProviderSettingsResponse


class ValidationResult(BaseModel):
    """Result of API key/credentials validation."""

    is_valid: bool
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    error_hint: Optional[str] = None
    available_models: list[str] = Field(default_factory=list)
    provider_info: Optional[dict] = None


class DecryptedCredentials(BaseModel):
    """Decrypted credentials for making API calls.

    WARNING: This model contains sensitive data and should NEVER be
    exposed in API responses. Only use server-side for making provider calls.
    """

    provider: AIProvider
    credential_type: CredentialType

    # API key (for Gemini, OpenAI)
    api_key: Optional[str] = None

    # Service account (for Cloud Vision, Video Intelligence)
    service_account_json: Optional[dict] = None

    # Metadata
    user_id: UUID
    workspace_id: UUID
    last_validated_at: Optional[datetime] = None


# Provider metadata catalog
PROVIDER_CATALOG = {
    AIProvider.CLOUD_VISION: AIProviderInfo(
        provider=AIProvider.CLOUD_VISION,
        name="Google Cloud Vision",
        description="Face detection, emotion analysis, label detection",
        credential_type=CredentialType.SERVICE_ACCOUNT_JSON,
        documentation_url="https://cloud.google.com/vision/docs/setup"
    ),
    AIProvider.GEMINI: AIProviderInfo(
        provider=AIProvider.GEMINI,
        name="Google Gemini",
        description="Multimodal AI for vision and text generation",
        credential_type=CredentialType.API_KEY,
        documentation_url="https://ai.google.dev/gemini-api/docs"
    ),
    AIProvider.VIDEO_INTELLIGENCE: AIProviderInfo(
        provider=AIProvider.VIDEO_INTELLIGENCE,
        name="Google Video Intelligence",
        description="Scene detection, video analysis, highlight generation",
        credential_type=CredentialType.SERVICE_ACCOUNT_JSON,
        documentation_url="https://cloud.google.com/video-intelligence/docs"
    ),
    AIProvider.OPENAI: AIProviderInfo(
        provider=AIProvider.OPENAI,
        name="OpenAI",
        description="CLIP embeddings for semantic search and similarity",
        credential_type=CredentialType.API_KEY,
        documentation_url="https://platform.openai.com/docs"
    ),
}
