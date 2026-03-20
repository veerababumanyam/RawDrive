"""
Unit tests for gallery branded password page and background music fields.

Tests welcome_message, background_music_url fields in schemas and
branding resolution in row_to_gallery_dict.
"""

import pytest
from unittest.mock import MagicMock
from uuid import UUID
from pydantic import ValidationError

from src.schemas.gallery import GalleryUpdateRequest, GalleryResponse


class TestGalleryUpdateRequestBrandingMusic:
    """Tests for welcome_message and background_music_url in GalleryUpdateRequest."""

    def test_accepts_welcome_message(self):
        """GalleryUpdateRequest accepts welcome_message string."""
        req = GalleryUpdateRequest(welcome_message="Welcome to our wedding gallery!")
        assert req.welcome_message == "Welcome to our wedding gallery!"

    def test_welcome_message_max_length(self):
        """GalleryUpdateRequest rejects welcome_message over 500 chars."""
        with pytest.raises(ValidationError):
            GalleryUpdateRequest(welcome_message="x" * 501)

    def test_welcome_message_at_max_length(self):
        """GalleryUpdateRequest accepts welcome_message at exactly 500 chars."""
        req = GalleryUpdateRequest(welcome_message="x" * 500)
        assert len(req.welcome_message) == 500

    def test_accepts_background_music_url(self):
        """GalleryUpdateRequest accepts background_music_url."""
        req = GalleryUpdateRequest(
            background_music_url="https://r2.example.com/music/wedding-waltz.mp3"
        )
        assert req.background_music_url == "https://r2.example.com/music/wedding-waltz.mp3"

    def test_background_music_url_nullable(self):
        """GalleryUpdateRequest accepts null background_music_url to clear it."""
        req = GalleryUpdateRequest(background_music_url=None)
        assert req.background_music_url is None

    def test_welcome_message_nullable(self):
        """GalleryUpdateRequest accepts null welcome_message."""
        req = GalleryUpdateRequest(welcome_message=None)
        assert req.welcome_message is None


class TestGalleryResponseBrandingMusic:
    """Tests for branding and music fields in GalleryResponse."""

    def _minimal_response_data(self, **overrides):
        """Create minimal valid GalleryResponse data."""
        data = {
            "gallery_id": "550e8400-e29b-41d4-a716-446655440000",
            "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
            "title": "Test Gallery",
            "status": "published",
            "created_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
            "created_at": "2024-01-01T00:00:00",
        }
        data.update(overrides)
        return data

    def test_response_includes_welcome_message(self):
        """GalleryResponse includes welcome_message field."""
        resp = GalleryResponse(**self._minimal_response_data(
            welcome_message="Welcome to our gallery!"
        ))
        assert resp.welcome_message == "Welcome to our gallery!"

    def test_response_includes_background_music_url(self):
        """GalleryResponse includes background_music_url field."""
        resp = GalleryResponse(**self._minimal_response_data(
            background_music_url="https://r2.example.com/music.mp3"
        ))
        assert resp.background_music_url == "https://r2.example.com/music.mp3"

    def test_response_includes_branding_logo_url(self):
        """GalleryResponse includes branding_logo_url from company profile."""
        resp = GalleryResponse(**self._minimal_response_data(
            branding_logo_url="https://r2.example.com/logo.png"
        ))
        assert resp.branding_logo_url == "https://r2.example.com/logo.png"

    def test_response_includes_branding_accent_color(self):
        """GalleryResponse includes branding_accent_color from company profile."""
        resp = GalleryResponse(**self._minimal_response_data(
            branding_accent_color="#FF5733"
        ))
        assert resp.branding_accent_color == "#FF5733"

    def test_branding_fields_default_to_none(self):
        """Branding fields default to None when not set."""
        resp = GalleryResponse(**self._minimal_response_data())
        assert resp.welcome_message is None
        assert resp.background_music_url is None
        assert resp.branding_logo_url is None
        assert resp.branding_accent_color is None


class TestRowToGalleryDictBrandingMusic:
    """Tests for branding/music fields in row_to_gallery_dict."""

    def test_includes_welcome_message(self):
        """row_to_gallery_dict includes welcome_message from row."""
        from src.services.gallery_service import row_to_gallery_dict

        row = {
            "gallery_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
            "workspace_id": UUID("550e8400-e29b-41d4-a716-446655440001"),
            "title": "Test Gallery",
            "description": None,
            "client_name": None,
            "client_id": None,
            "shoot_date": None,
            "status": "published",
            "branding_profile_id": None,
            "portal_language": None,
            "layout_style": None,
            "theme": None,
            "download_policy": None,
            "exif_visible": None,
            "password_protected": False,
            "pin_protected": False,
            "email_registration_required": False,
            "expires_at": None,
            "published_at": None,
            "cover_asset_id": None,
            "primary_color": None,
            "gradient_config": None,
            "font_family": None,
            "custom_domain": None,
            "custom_links": [],
            "created_by_user_id": UUID("550e8400-e29b-41d4-a716-446655440002"),
            "created_at": MagicMock(isoformat=lambda: "2024-01-01T00:00:00"),
            "pinned_at": None,
            "last_accessed_at": None,
            "welcome_message": "Welcome to our wedding!",
            "background_music_url": "https://r2.example.com/music.mp3",
        }

        result = row_to_gallery_dict(row, [], None)

        assert result["welcome_message"] == "Welcome to our wedding!"
        assert result["background_music_url"] == "https://r2.example.com/music.mp3"

    def test_welcome_message_defaults_to_none(self):
        """row_to_gallery_dict defaults welcome_message to None if not in row."""
        from src.services.gallery_service import row_to_gallery_dict

        row = {
            "gallery_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
            "workspace_id": UUID("550e8400-e29b-41d4-a716-446655440001"),
            "title": "Test",
            "description": None,
            "client_name": None,
            "client_id": None,
            "shoot_date": None,
            "status": "draft",
            "branding_profile_id": None,
            "portal_language": None,
            "layout_style": None,
            "theme": None,
            "download_policy": None,
            "exif_visible": None,
            "password_protected": False,
            "pin_protected": False,
            "email_registration_required": False,
            "expires_at": None,
            "published_at": None,
            "cover_asset_id": None,
            "primary_color": None,
            "gradient_config": None,
            "font_family": None,
            "custom_domain": None,
            "custom_links": [],
            "created_by_user_id": UUID("550e8400-e29b-41d4-a716-446655440002"),
            "created_at": MagicMock(isoformat=lambda: "2024-01-01T00:00:00"),
            "pinned_at": None,
            "last_accessed_at": None,
        }

        result = row_to_gallery_dict(row, [], None)

        assert result.get("welcome_message") is None
        assert result.get("background_music_url") is None
