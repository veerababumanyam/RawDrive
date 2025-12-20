"""Visibility Filter Service for Company Profiles."""

from typing import Any, TypeVar

T = TypeVar("T", bound=dict[str, Any])

class VisibilityFilterService:
    """Service to handle visibility filtering of company profile data."""

    @staticmethod
    def filter_visible(data: dict[str, Any], visibility_config: dict[str, bool]) -> dict[str, Any]:
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
    def get_default_visibility() -> dict[str, bool]:
        """Get default visibility configuration for new profiles."""
        return {
            "name": True,
            "tagline": True,
            "logo_url": True,
            "email": True,
            "phone": True,
            "website": True,
            "address_structured": True,
            "socials": True,
            "custom_links": True
        }
