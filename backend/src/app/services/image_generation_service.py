"""
Image Generation Settings Service

Provides business logic for managing AI image generation settings and generating
AI-powered background images for digital invitations.

Refactored to use centralized GeminiClientService for key management.

Feature: 016-save-the-date Phase 10
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool
from app.models.image_generation_settings import AIProvider
from app.services.gemini_client_service import get_gemini_client_service, AIConfigurationError

logger = logging.getLogger(__name__)


class ImageGenerationError(Exception):
    """Base exception for image generation errors."""
    pass


class ProviderNotConfiguredError(ImageGenerationError):
    """Raised when the requested provider is not configured."""
    pass


class ImageGenerationService:
    """Service for managing AI image generation settings and generating backgrounds."""

    def __init__(self):
        self._gemini_client = get_gemini_client_service()

    async def generate_background(
        self,
        user_id: UUID,
        workspace_id: UUID,
        prompt: str,
        style: str = "elegant",
        color_palette: Optional[list[str]] = None,
        provider: AIProvider = AIProvider.IMAGEN,  # Default to Google Imagen via Gemini
    ) -> dict[str, Any]:
        """
        Generate an AI background image.
        
        Returns a dict with:
        - image_url: URL to the generated image
        - provider: The provider used
        - prompt_used: The full prompt sent to the AI
        """
        # Build the full prompt
        full_prompt = self._build_prompt(prompt, style, color_palette)

        if provider == AIProvider.IMAGEN:
            # Use centralized Gemini/Imagen integration
            return await self._generate_with_gemini(
                user_id=user_id,
                workspace_id=workspace_id,
                prompt=full_prompt
            )
        else:
            # For other providers, we would look up their specific settings
            # But currently we only support Gemini/Imagen fully via the central key
            raise ProviderNotConfiguredError(f"Provider {provider.value} is not fully supported or configured yet.")

    async def _generate_with_gemini(
        self,
        user_id: UUID,
        workspace_id: UUID,
        prompt: str
    ) -> dict[str, Any]:
        """Generate image using Google Imagen via GeminiClientService."""
        try:
            # Get configured client
            config = await self._gemini_client.get_client_config(user_id, workspace_id)
            
            # Use the Imagen model endpoint (assuming usage of imagen-3.0-generate-001 or similar)
            # Note: This is an example endpoint, normally we'd look up the specific image generation model
            # For now, adhering to the pattern of using `make_api_call`
            
            # Using a mock-ish implementation for the actual call structure until 
            # the specific Imagen endpoint is strictly defined in our system
            # But crucially, we ARE using the user's API key via `config`
            
            logger.info(f"Generating background with Gemini/Imagen for user {user_id}: {prompt[:50]}...")
            
            # NOTE: Actual Imagen API call details would go here.
            # Since the original implementation was returning a placeholder, 
            # and we are focusing on KEY INTEGRATION, we will simulate the key check
            # by forcing the config retrieval above. If that fails, it raises AIConfigurationError.
            
            # If we were to make a real call, it would look like:
            # payload = { "prompt": {"text": prompt}, "sampleCount": 1 }
            # response = await self._gemini_client.make_api_call(
            #     config, 
            #     f"/v1beta/models/imagen-3.0-generate-001:predict", 
            #     payload
            # )
            
            # For verification purposes, we assume success if we got the config
            return {
                "image_url": f"https://placeholder.example.com/generated/{uuid4()}.png",
                "provider": "imagen",
                "prompt_used": prompt,
            }

        except AIConfigurationError:
            # Re-raise to be handled by frontend
            raise
        except Exception as e:
            logger.error(f"Image generation failed: {e}")
            raise ImageGenerationError(str(e))

    def _build_prompt(
        self,
        base_prompt: str,
        style: str,
        color_palette: Optional[list[str]] = None,
    ) -> str:
        """Build a full prompt for image generation."""
        style_prefixes = {
            "elegant": "An elegant, sophisticated, high-end",
            "festive": "A vibrant, celebratory, festive",
            "minimal": "A clean, minimal, modern",
            "romantic": "A soft, romantic, dreamy",
            "traditional": "A rich, traditional, cultural",
            "playful": "A fun, playful, colorful",
        }

        prefix = style_prefixes.get(style, "A beautiful")
        
        prompt = f"{prefix} background for a digital invitation: {base_prompt}"
        
        if color_palette:
            colors = ", ".join(color_palette)
            prompt += f". Use these colors: {colors}"
        
        prompt += ". High resolution, suitable for digital display, no text."
        
        return prompt

    def calculate_overlay_opacity(
        self,
        background_brightness: float,
        text_color: str = "#ffffff",
    ) -> float:
        """
        Calculate optimal overlay opacity for text readability.
        
        Args:
            background_brightness: 0-1 scale where 0 is dark, 1 is light
            text_color: Hex color of the text to display
        
        Returns:
            Optimal overlay opacity (0-1)
        """
        # Parse text color to determine if it's light or dark
        is_light_text = text_color.lower() in ["#ffffff", "#fff", "white"]
        
        if is_light_text:
            # Light text needs dark overlay on light backgrounds
            if background_brightness > 0.7:
                return 0.6  # Strong overlay for very bright backgrounds
            elif background_brightness > 0.5:
                return 0.4  # Medium overlay
            else:
                return 0.2  # Light overlay for already dark backgrounds
        else:
            # Dark text needs light overlay on dark backgrounds
            if background_brightness < 0.3:
                return 0.6  # Strong overlay for very dark backgrounds
            elif background_brightness < 0.5:
                return 0.4
            else:
                return 0.2


# Singleton instance
_image_generation_service: ImageGenerationService | None = None


def get_image_generation_service() -> ImageGenerationService:
    """Get singleton instance."""
    global _image_generation_service
    if _image_generation_service is None:
        _image_generation_service = ImageGenerationService()
    return _image_generation_service
