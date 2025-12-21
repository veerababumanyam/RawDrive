"""Visibility Filter Service for Company Profiles.

Provides granular per-field and per-platform social media visibility filtering
for the Public Profile Editor system.
"""

from typing import Any, Optional
from uuid import UUID
import logging

logger = logging.getLogger(__name__)

# Supported profile fields for visibility control
PROFILE_FIELDS = frozenset({
    "name",
    "tagline",
    "logo_url",
    "email",
    "phone",
    "website",
    "address",  # Maps to address_structured in DB
    "address_structured",  # Legacy/DB field name
    "socials",
    "custom_links",
})

# Supported social media platforms
SOCIAL_PLATFORMS = frozenset({
    "instagram",
    "facebook",
    "whatsapp",
    "tiktok",
    "linkedin",
    "youtube",
    "twitter",
})

# Default visibility presets
VISIBILITY_PRESETS = {
    "full": {
        "name": "Full Profile",
        "field_visibility": {field: True for field in PROFILE_FIELDS},
        "social_visibility": {platform: True for platform in SOCIAL_PLATFORMS},
    },
    "minimal": {
        "name": "Minimal",
        "field_visibility": {
            "name": True,
            "tagline": True,
            "logo_url": True,
            "email": False,
            "phone": False,
            "website": True,
            "address": False,
            "address_structured": False,
            "socials": True,
            "custom_links": False,
        },
        "social_visibility": {
            "instagram": True,
            "facebook": False,
            "whatsapp": False,
            "tiktok": False,
            "linkedin": True,
            "youtube": False,
            "twitter": False,
        },
    },
    "business": {
        "name": "Business Only",
        "field_visibility": {
            "name": True,
            "tagline": True,
            "logo_url": True,
            "email": True,
            "phone": True,
            "website": True,
            "address": True,
            "address_structured": True,
            "socials": True,
            "custom_links": True,
        },
        "social_visibility": {
            "instagram": False,
            "facebook": False,
            "whatsapp": True,
            "tiktok": False,
            "linkedin": True,
            "youtube": False,
            "twitter": False,
        },
    },
}


class VisibilityFilterService:
    """Service to handle visibility filtering of company profile data.

    Provides:
    - Per-field visibility filtering
    - Per-platform social media visibility filtering
    - Visibility presets (Full, Minimal, Business Only)
    - Default visibility for new profiles
    """

    @staticmethod
    def filter_visible(
        data: dict[str, Any],
        visibility_config: Optional[dict[str, bool]] = None
    ) -> dict[str, Any]:
        """
        Filter a dictionary based on a visibility configuration map.

        Args:
            data: The source data dictionary (e.g. profile dict).
            visibility_config: Map of field_name -> is_visible (boolean).

        Returns:
            A new dictionary containing only fields where visibility is not explicitly False.
            Defaults to True (visible) if field is missing from config.
        """
        # If no config, everything is visible
        if not visibility_config:
            return data.copy()

        filtered = {}
        for key, value in data.items():
            # Check visibility
            # Logic: If key is present in config, use value. If not present, default to True (Visible).
            if visibility_config.get(key, True):
                filtered[key] = value

        return filtered

    @staticmethod
    def filter_socials(
        socials: Optional[dict[str, str]],
        social_visibility: Optional[dict[str, bool]] = None
    ) -> dict[str, str]:
        """
        Filter social media links based on per-platform visibility.

        Args:
            socials: Dict mapping platform name to URL (e.g., {"instagram": "https://..."})
            social_visibility: Dict mapping platform name to visibility boolean

        Returns:
            Dict containing only visible social platforms.
            Hidden platforms are completely omitted (no placeholders).

        Requirement 1.4: When a social platform visibility is disabled,
        THE System SHALL completely omit it from public rendering.
        """
        if not socials:
            return {}

        # If no visibility config, all socials are visible
        if not social_visibility:
            return socials.copy()

        filtered = {}
        for platform, url in socials.items():
            # Platform is visible if not explicitly set to False
            platform_lower = platform.lower()
            if social_visibility.get(platform_lower, True):
                filtered[platform] = url

        return filtered

    @staticmethod
    def filter_profile_complete(
        profile_data: dict[str, Any],
        field_visibility: Optional[dict[str, bool]] = None,
        social_visibility: Optional[dict[str, bool]] = None
    ) -> dict[str, Any]:
        """
        Apply complete visibility filtering including per-platform social filtering.

        This method handles:
        1. Field-level visibility (name, email, phone, etc.)
        2. Per-platform social media visibility (Instagram, Facebook, etc.)

        Args:
            profile_data: Complete profile data dictionary
            field_visibility: Field-level visibility configuration
            social_visibility: Per-platform social visibility configuration

        Returns:
            Filtered profile with hidden fields and social platforms removed.
        """
        # First apply field-level filtering
        filtered = VisibilityFilterService.filter_visible(profile_data, field_visibility)

        # Then apply per-platform social filtering if socials are still present
        if "socials" in filtered and filtered["socials"]:
            filtered["socials"] = VisibilityFilterService.filter_socials(
                filtered["socials"],
                social_visibility
            )

        return filtered

    @staticmethod
    def get_default_visibility() -> dict[str, bool]:
        """Get default visibility configuration for new profiles.

        Returns sensible defaults based on field type:
        - Name, tagline, logo: Visible (branding elements)
        - Contact info: Visible but can be hidden
        - Social/links: Visible
        """
        return {
            "name": True,
            "tagline": True,
            "logo_url": True,
            "email": True,
            "phone": True,
            "website": True,
            "address": True,
            "address_structured": True,
            "socials": True,
            "custom_links": True
        }

    @staticmethod
    def get_default_social_visibility() -> dict[str, bool]:
        """Get default social media visibility for new profiles.

        All platforms default to visible.
        """
        return {platform: True for platform in SOCIAL_PLATFORMS}

    @staticmethod
    def get_preset(preset_key: str) -> Optional[dict[str, Any]]:
        """Get a visibility preset by key.

        Args:
            preset_key: One of 'full', 'minimal', 'business'

        Returns:
            Preset configuration or None if not found.
        """
        return VISIBILITY_PRESETS.get(preset_key.lower())

    @staticmethod
    def get_available_presets() -> list[dict[str, str]]:
        """Get list of available visibility presets.

        Returns:
            List of preset info with key and name.
        """
        return [
            {"key": key, "name": preset["name"]}
            for key, preset in VISIBILITY_PRESETS.items()
        ]

    @staticmethod
    def apply_bulk_visibility(
        visibility_config: dict[str, bool],
        visible: bool
    ) -> dict[str, bool]:
        """Apply bulk show/hide to all fields.

        Args:
            visibility_config: Current visibility config
            visible: True for "Show All", False for "Hide All"

        Returns:
            Updated visibility config with all fields set to the given value.

        Requirement 1.6: THE System SHALL provide "Show All" and "Hide All" bulk controls.
        """
        return {field: visible for field in PROFILE_FIELDS}

    @staticmethod
    def apply_bulk_social_visibility(
        social_visibility: dict[str, bool],
        visible: bool
    ) -> dict[str, bool]:
        """Apply bulk show/hide to all social platforms.

        Args:
            social_visibility: Current social visibility config
            visible: True for "Show All", False for "Hide All"

        Returns:
            Updated social visibility config with all platforms set to the given value.
        """
        return {platform: visible for platform in SOCIAL_PLATFORMS}

    @staticmethod
    def validate_field_visibility(visibility_config: dict[str, bool]) -> bool:
        """Validate that visibility config only contains known fields.

        Args:
            visibility_config: Field visibility configuration to validate

        Returns:
            True if valid, False if contains unknown fields.
        """
        return all(field in PROFILE_FIELDS for field in visibility_config.keys())

    @staticmethod
    def validate_social_visibility(social_visibility: dict[str, bool]) -> bool:
        """Validate that social visibility config only contains known platforms.

        Args:
            social_visibility: Social visibility configuration to validate

        Returns:
            True if valid, False if contains unknown platforms.
        """
        return all(platform in SOCIAL_PLATFORMS for platform in social_visibility.keys())


# Singleton instance getter
_visibility_filter_service: Optional[VisibilityFilterService] = None


def get_visibility_filter_service() -> VisibilityFilterService:
    """Get singleton instance of VisibilityFilterService."""
    global _visibility_filter_service
    if _visibility_filter_service is None:
        _visibility_filter_service = VisibilityFilterService()
    return _visibility_filter_service
