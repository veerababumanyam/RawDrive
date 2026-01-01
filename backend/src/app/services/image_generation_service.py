"""
Image Generation Settings Service

Provides business logic for managing AI image generation settings and generating
AI-powered background images for digital invitations.

Supports multiple providers:
- Imagen (Google)
- Nano Banana
- DALL-E (OpenAI)
- Midjourney

Feature: 016-save-the-date Phase 10
"""

from __future__ import annotations

import logging
import base64
import os
from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from cryptography.fernet import Fernet

from app.db.postgres import get_postgres_pool
from app.models.image_generation_settings import AIProvider, ImageGenerationSettings

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
        # Encryption key for API keys (in production, use a proper key management service)
        self._fernet_key = os.getenv("ENCRYPTION_KEY", Fernet.generate_key().decode())
        self._fernet = Fernet(self._fernet_key.encode() if isinstance(self._fernet_key, str) else self._fernet_key)

    async def get_user_settings(
        self,
        user_id: UUID,
        provider: Optional[AIProvider] = None,
    ) -> list[dict[str, Any]]:
        """Get image generation settings for a user."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if provider:
                rows = await conn.fetch(
                    """
                    SELECT * FROM image_generation_settings
                    WHERE user_id = $1 AND provider = $2
                    """,
                    user_id,
                    provider.value,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM image_generation_settings
                    WHERE user_id = $1
                    ORDER BY created_at DESC
                    """,
                    user_id,
                )
            return [dict(row) for row in rows]

    async def configure_provider(
        self,
        user_id: UUID,
        provider: AIProvider,
        api_key: str,
    ) -> dict[str, Any]:
        """Configure an AI provider with an API key."""
        # Encrypt the API key
        encrypted_key = self._fernet.encrypt(api_key.encode())
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check if provider already exists for user
            existing = await conn.fetchrow(
                """
                SELECT setting_id FROM image_generation_settings
                WHERE user_id = $1 AND provider = $2
                """,
                user_id,
                provider.value,
            )

            if existing:
                # Update existing settings
                row = await conn.fetchrow(
                    """
                    UPDATE image_generation_settings
                    SET api_key_encrypted = $1, api_key_iv = '', is_validated = FALSE, updated_at = NOW()
                    WHERE user_id = $2 AND provider = $3
                    RETURNING *
                    """,
                    encrypted_key.decode(),
                    user_id,
                    provider.value,
                )
            else:
                # Create new settings
                row = await conn.fetchrow(
                    """
                    INSERT INTO image_generation_settings (
                        setting_id, user_id, provider, api_key_encrypted, api_key_iv,
                        is_validated, is_enabled, credits_used
                    )
                    VALUES ($1, $2, $3, $4, '', FALSE, TRUE, 0)
                    RETURNING *
                    """,
                    uuid4(),
                    user_id,
                    provider.value,
                    encrypted_key.decode(),
                )

            logger.info(f"Configured {provider.value} for user {user_id}")
            return dict(row)

    async def validate_provider(
        self,
        user_id: UUID,
        provider: AIProvider,
    ) -> bool:
        """Validate that the provider API key works."""
        settings = await self.get_user_settings(user_id, provider)
        if not settings:
            raise ProviderNotConfiguredError(f"{provider.value} is not configured")

        # Decrypt and test the API key
        encrypted_key = settings[0]["api_key_encrypted"]
        try:
            api_key = self._fernet.decrypt(encrypted_key.encode()).decode()
        except Exception as e:
            logger.error(f"Failed to decrypt API key: {e}")
            return False

        # Test the API based on provider
        is_valid = await self._test_provider_api(provider, api_key)

        # Update validation status
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE image_generation_settings
                SET is_validated = $1, validated_at = $2, updated_at = NOW()
                WHERE user_id = $3 AND provider = $4
                """,
                is_valid,
                datetime.utcnow() if is_valid else None,
                user_id,
                provider.value,
            )

        return is_valid

    async def _test_provider_api(self, provider: AIProvider, api_key: str) -> bool:
        """Test if an API key works for a given provider."""
        try:
            if provider == AIProvider.IMAGEN:
                # Test Google Imagen API
                # In production, make a simple API call to verify
                return len(api_key) > 10
            elif provider == AIProvider.NANO_BANANA:
                # Test Nano Banana API
                return len(api_key) > 10
            elif provider == AIProvider.DALLE:
                # Test OpenAI DALL-E API
                return len(api_key) > 10
            elif provider == AIProvider.MIDJOURNEY:
                # Midjourney doesn't have a direct API
                return len(api_key) > 10
            return False
        except Exception as e:
            logger.error(f"API test failed for {provider.value}: {e}")
            return False

    async def generate_background(
        self,
        user_id: UUID,
        prompt: str,
        style: str = "elegant",
        color_palette: Optional[list[str]] = None,
        provider: Optional[AIProvider] = None,
    ) -> dict[str, Any]:
        """
        Generate an AI background image.
        
        Returns a dict with:
        - image_url: URL to the generated image
        - provider: The provider used
        - prompt_used: The full prompt sent to the AI
        """
        # Get user's configured provider
        if provider:
            settings = await self.get_user_settings(user_id, provider)
        else:
            # Get the first enabled and validated provider
            all_settings = await self.get_user_settings(user_id)
            settings = [s for s in all_settings if s["is_enabled"] and s["is_validated"]]
            if settings:
                provider = AIProvider(settings[0]["provider"])

        if not settings:
            raise ProviderNotConfiguredError("No AI image generation provider is configured")

        # Build the full prompt
        full_prompt = self._build_prompt(prompt, style, color_palette)

        # Generate based on provider
        result = await self._call_provider_api(provider, settings[0], full_prompt)

        # Update usage stats
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE image_generation_settings
                SET credits_used = credits_used + 1, last_used_at = NOW(), updated_at = NOW()
                WHERE user_id = $1 AND provider = $2
                """,
                user_id,
                provider.value,
            )

        return {
            "image_url": result["image_url"],
            "provider": provider.value,
            "prompt_used": full_prompt,
        }

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

    async def _call_provider_api(
        self,
        provider: AIProvider,
        settings: dict[str, Any],
        prompt: str,
    ) -> dict[str, Any]:
        """Call the AI provider's API to generate an image."""
        # Decrypt API key
        encrypted_key = settings["api_key_encrypted"]
        try:
            api_key = self._fernet.decrypt(encrypted_key.encode()).decode()
        except Exception as e:
            raise ImageGenerationError(f"Failed to decrypt API key: {e}")

        # In a real implementation, this would call the actual provider APIs
        # For now, return a placeholder
        logger.info(f"Generating image with {provider.value}: {prompt[:100]}...")
        
        # Placeholder response - in production, this would make actual API calls
        return {
            "image_url": f"https://placeholder.example.com/generated/{uuid4()}.png",
        }

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

    async def delete_provider_settings(
        self,
        user_id: UUID,
        provider: AIProvider,
    ) -> bool:
        """Delete a provider's settings for a user."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM image_generation_settings
                WHERE user_id = $1 AND provider = $2
                """,
                user_id,
                provider.value,
            )
            return "DELETE 1" in result


# Singleton instance
_image_generation_service: ImageGenerationService | None = None


def get_image_generation_service() -> ImageGenerationService:
    """Get singleton instance."""
    global _image_generation_service
    if _image_generation_service is None:
        _image_generation_service = ImageGenerationService()
    return _image_generation_service
