"""API endpoints for user AI provider settings management.

Allows users to configure their own API keys for AI providers:
- Google Cloud Vision
- Google Gemini
- Google Video Intelligence
- OpenAI

Feature: Unified AI Provider Settings
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.models.ai_provider_settings import (
    AIProvider,
    AIProviderSettingsCreate,
    AIProviderSettingsResponse,
    ValidationResult,
)
from app.models.user import User
from app.services.ai_provider_settings_service import (
    get_ai_provider_settings_service,
    AIProviderSettingsService,
    UnsupportedProviderError,
    ValidationFailedError,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/ai-providers", tags=["AI Provider Settings"])


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class AIProviderListResponse(BaseModel):
    """Response for listing all providers."""
    providers: List[AIProviderSettingsResponse]


class ValidateCredentialsRequest(BaseModel):
    """Request to validate credentials without saving."""
    api_key: str | None = Field(None, min_length=1, max_length=500)
    service_account_json: dict | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=AIProviderListResponse,
    summary="List all AI providers",
    description="Get list of all supported AI providers with user's configuration status",
)
async def list_providers(
    workspace_id: UUID,
    current_user: User = Depends(get_current_user),
    service: AIProviderSettingsService = Depends(get_ai_provider_settings_service),
):
    """List all AI providers with user's configuration status.

    Returns:
        List of providers with status, masked credentials, and metadata
    """
    try:
        providers = await service.list_user_providers(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
        )

        return AIProviderListResponse(providers=providers)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list providers: {str(e)}",
        )


@router.get(
    "/{provider}",
    response_model=AIProviderSettingsResponse,
    summary="Get provider settings",
    description="Get user's configuration for a specific AI provider",
)
async def get_provider_settings(
    workspace_id: UUID,
    provider: AIProvider,
    current_user: User = Depends(get_current_user),
    service: AIProviderSettingsService = Depends(get_ai_provider_settings_service),
):
    """Get user's settings for a specific provider.

    Args:
        workspace_id: Workspace UUID
        provider: Provider name (cloud_vision, gemini, video_intelligence, openai)
        current_user: Authenticated user

    Returns:
        Provider settings with masked credentials and status
    """
    try:
        settings = await service.get_provider_settings(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            provider=provider,
        )

        return AIProviderSettingsResponse(**settings)

    except UnsupportedProviderError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get provider settings: {str(e)}",
        )


@router.post(
    "/{provider}",
    response_model=AIProviderSettingsResponse,
    status_code=status.HTTP_200_OK,
    summary="Configure provider",
    description="Configure or update user's API credentials for a provider",
)
async def configure_provider(
    workspace_id: UUID,
    provider: AIProvider,
    settings_data: AIProviderSettingsCreate,
    current_user: User = Depends(get_current_user),
    service: AIProviderSettingsService = Depends(get_ai_provider_settings_service),
):
    """Configure or update user's provider credentials.

    Args:
        workspace_id: Workspace UUID
        provider: Provider name
        settings_data: Credentials to configure (API key or service account JSON)
        current_user: Authenticated user

    Returns:
        Updated provider settings

    Raises:
        400: Invalid credentials or validation failed
        500: Internal server error
    """
    try:
        settings = await service.create_or_update_settings(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            provider=provider,
            api_key=settings_data.api_key,
            service_account_json=settings_data.service_account_json,
            skip_validation=settings_data.skip_validation,
        )

        return AIProviderSettingsResponse(**settings)

    except ValidationFailedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": e.code,
                "message": str(e),
                "hint": e.hint,
                "provider": e.provider.value,
            },
        )
    except UnsupportedProviderError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to configure provider: {str(e)}",
        )


@router.delete(
    "/{provider}",
    response_model=AIProviderSettingsResponse,
    summary="Revoke provider credentials",
    description="Delete user's API credentials for a provider",
)
async def revoke_provider(
    workspace_id: UUID,
    provider: AIProvider,
    current_user: User = Depends(get_current_user),
    service: AIProviderSettingsService = Depends(get_ai_provider_settings_service),
):
    """Revoke user's credentials for a provider.

    This removes the encrypted credentials but preserves the settings record.

    Args:
        workspace_id: Workspace UUID
        provider: Provider name
        current_user: Authenticated user

    Returns:
        Updated provider settings (status: not_configured)
    """
    try:
        settings = await service.revoke_credentials(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            provider=provider,
        )

        return AIProviderSettingsResponse(**settings)

    except UnsupportedProviderError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke provider: {str(e)}",
        )


@router.post(
    "/{provider}/validate",
    response_model=ValidationResult,
    summary="Validate credentials",
    description="Validate API credentials without saving them",
)
async def validate_credentials(
    workspace_id: UUID,
    provider: AIProvider,
    credentials: ValidateCredentialsRequest,
    current_user: User = Depends(get_current_user),
    service: AIProviderSettingsService = Depends(get_ai_provider_settings_service),
):
    """Validate credentials without saving.

    Useful for testing credentials before committing them to storage.

    Args:
        workspace_id: Workspace UUID
        provider: Provider name
        credentials: Credentials to validate
        current_user: Authenticated user

    Returns:
        Validation result with success/error details
    """
    try:
        result = await service.validate_credentials(
            provider=provider,
            api_key=credentials.api_key,
            service_account_json=credentials.service_account_json,
        )

        return result

    except UnsupportedProviderError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate credentials: {str(e)}",
        )


@router.get(
    "/supported",
    response_model=List[dict],
    summary="Get supported providers",
    description="Get list of all supported AI providers with metadata",
)
async def get_supported_providers(
    workspace_id: UUID,
    current_user: User = Depends(get_current_user),
    service: AIProviderSettingsService = Depends(get_ai_provider_settings_service),
):
    """Get list of all supported providers.

    Returns:
        List of providers with name, description, credential type, docs URL
    """
    return service.get_supported_providers()
