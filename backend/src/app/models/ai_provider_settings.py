"""Models for user AI provider settings.

This module defines Pydantic models for managing user-specific AI provider
credentials (Cloud Vision, Gemini, Video Intelligence, OpenAI, etc.).

Feature: Unified AI Provider Settings
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AIProvider(str, Enum):
    """Supported AI providers."""
    CLOUD_VISION = "cloud_vision"
    GEMINI = "gemini"
    VIDEO_INTELLIGENCE = "video_intelligence"
    OPENAI = "openai"


class ProviderStatus(str, Enum):
    """Provider configuration status."""
    NOT_CONFIGURED = "not_configured"
    CONNECTED = "connected"
    VALIDATION_FAILED = "validation_failed"


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


class UserAIProviderSettings(BaseModel):
    """Model for user AI provider settings."""

    setting_id: UUID
    user_id: UUID
    workspace_id: UUID

    # Provider
    provider: AIProvider

    # Encrypted credentials (internal only)
    api_key_encrypted: Optional[str] = None
    api_key_iv: Optional[str] = None
    credentials_json_encrypted: Optional[str] = None
    credentials_iv: Optional[str] = None

    # Masked display
    api_key_prefix: Optional[str] = None
    api_key_suffix: Optional[str] = None

    # Status
    status: ProviderStatus = ProviderStatus.NOT_CONFIGURED
    is_enabled: bool = True
    last_validated_at: Optional[datetime] = None
    validation_error: Optional[str] = None

    # Usage
    credits_used: int = 0
    last_used_at: Optional[datetime] = None

    # Metadata
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        use_enum_values = True


class AIProviderSettingsCreate(BaseModel):
    """Request schema for creating/updating AI provider settings."""

    # For API key providers (Gemini, OpenAI)
    api_key: Optional[str] = Field(None, min_length=1, max_length=500)

    # For service account providers (Cloud Vision, Video Intelligence)
    service_account_json: Optional[dict] = None

    # Validation
    skip_validation: bool = False

    class Config:
        json_schema_extra = {
            "example": {
                "api_key": "AIzaSyD1234567890abcdefghijklmnopqrstuv",
                "skip_validation": False
            }
        }


class AIProviderSettingsResponse(BaseModel):
    """Response schema for AI provider settings."""

    provider: AIProvider
    provider_name: str
    provider_description: str
    credential_type: CredentialType

    # Status
    status: ProviderStatus
    has_credentials: bool
    is_enabled: bool

    # Masked credentials (for display only)
    api_key_masked: Optional[str] = None

    # Validation
    last_validated_at: Optional[datetime] = None
    validation_error: Optional[str] = None

    # Usage
    credits_used: int = 0
    last_used_at: Optional[datetime] = None

    # Metadata
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        use_enum_values = True
        json_schema_extra = {
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
                "last_used_at": "2026-01-08T10:30:00Z"
            }
        }


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
