"""
Image Generation API Routes

Provides endpoints for AI-powered background image generation.

Feature: 016-save-the-date Phase 10
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.models.image_generation_settings import AIProvider
from app.services.image_generation_service import (
    get_image_generation_service,
    ImageGenerationService,
    ProviderNotConfiguredError,
    ImageGenerationError,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class ConfigureProviderRequest(BaseModel):
    provider: AIProvider
    api_key: str = Field(..., min_length=10)


class GenerateBackgroundRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500)
    style: str = Field("elegant", pattern="^(elegant|festive|minimal|romantic|traditional|playful)$")
    color_palette: Optional[List[str]] = None
    provider: Optional[AIProvider] = None


class ProviderSettingsResponse(BaseModel):
    setting_id: UUID
    provider: str
    is_validated: bool
    is_enabled: bool
    credits_used: int
    last_used_at: Optional[str]


class GenerateBackgroundResponse(BaseModel):
    image_url: str
    provider: str
    prompt_used: str


class OverlayOpacityRequest(BaseModel):
    background_brightness: float = Field(..., ge=0, le=1)
    text_color: str = Field("#ffffff")


class OverlayOpacityResponse(BaseModel):
    opacity: float


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def get_service() -> ImageGenerationService:
    return get_image_generation_service()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=List[ProviderSettingsResponse])
async def list_provider_settings(
    current_user: dict = Depends(get_current_user),
    service: ImageGenerationService = Depends(get_service),
):
    """List all configured AI image generation providers for the user."""
    user_id = current_user.get("user_id")
    settings = await service.get_user_settings(UUID(user_id))
    
    return [
        ProviderSettingsResponse(
            setting_id=s["setting_id"],
            provider=s["provider"],
            is_validated=s["is_validated"],
            is_enabled=s["is_enabled"],
            credits_used=s["credits_used"],
            last_used_at=str(s["last_used_at"]) if s["last_used_at"] else None,
        )
        for s in settings
    ]


@router.post("/settings", response_model=ProviderSettingsResponse, status_code=status.HTTP_201_CREATED)
async def configure_provider(
    request: ConfigureProviderRequest,
    current_user: dict = Depends(get_current_user),
    service: ImageGenerationService = Depends(get_service),
):
    """Configure an AI image generation provider with an API key."""
    user_id = current_user.get("user_id")
    
    result = await service.configure_provider(
        user_id=UUID(user_id),
        provider=request.provider,
        api_key=request.api_key,
    )
    
    return ProviderSettingsResponse(
        setting_id=result["setting_id"],
        provider=result["provider"],
        is_validated=result["is_validated"],
        is_enabled=result["is_enabled"],
        credits_used=result["credits_used"],
        last_used_at=str(result["last_used_at"]) if result.get("last_used_at") else None,
    )


@router.post("/settings/{provider}/validate")
async def validate_provider(
    provider: AIProvider,
    current_user: dict = Depends(get_current_user),
    service: ImageGenerationService = Depends(get_service),
):
    """Validate a configured provider's API key."""
    user_id = current_user.get("user_id")
    
    try:
        is_valid = await service.validate_provider(UUID(user_id), provider)
        return {"is_valid": is_valid}
    except ProviderNotConfiguredError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/settings/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider_settings(
    provider: AIProvider,
    current_user: dict = Depends(get_current_user),
    service: ImageGenerationService = Depends(get_service),
):
    """Delete a provider's settings."""
    user_id = current_user.get("user_id")
    
    deleted = await service.delete_provider_settings(UUID(user_id), provider)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider settings not found",
        )
    return None


@router.post("/generate", response_model=GenerateBackgroundResponse)
async def generate_background(
    request: GenerateBackgroundRequest,
    current_user: dict = Depends(get_current_user),
    service: ImageGenerationService = Depends(get_service),
):
    """Generate an AI background image."""
    user_id = current_user.get("user_id")
    
    try:
        result = await service.generate_background(
            user_id=UUID(user_id),
            prompt=request.prompt,
            style=request.style,
            color_palette=request.color_palette,
            provider=request.provider,
        )
        return GenerateBackgroundResponse(**result)
    except ProviderNotConfiguredError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except ImageGenerationError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/overlay-opacity", response_model=OverlayOpacityResponse)
async def calculate_overlay_opacity(
    request: OverlayOpacityRequest,
    service: ImageGenerationService = Depends(get_service),
):
    """Calculate optimal overlay opacity for text readability."""
    opacity = service.calculate_overlay_opacity(
        background_brightness=request.background_brightness,
        text_color=request.text_color,
    )
    return OverlayOpacityResponse(opacity=opacity)
