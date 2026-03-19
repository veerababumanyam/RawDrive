"""Integration tests for personal profile HTML shell and OG image endpoints.

Tests verify that the HTML shell endpoint returns correct meta tags
and the OG image endpoint returns valid PNG images.
"""

import io
import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.api.v1.personal_profile import public_router
from app.api.exceptions import AppError


@pytest.fixture
def app():
    """Create a test FastAPI app with the public router mounted."""
    app = FastAPI()
    app.include_router(public_router, prefix="/api/v1/u")

    @app.exception_handler(AppError)
    async def app_error_handler(request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message, "code": exc.code},
        )

    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


def _mock_profile_data(slug: str = "test-user") -> dict:
    """Return mock profile data as returned by get_public_profile."""
    return {
        "profile_id": str(uuid4()),
        "workspace_id": str(uuid4()),
        "user_id": str(uuid4()),
        "display_name": "Test User",
        "profile_title": "Wedding Photographer",
        "slug": slug,
        "avatar_url": "https://cdn.rawdrive.ai/test.jpg",
        "bio": "Award-winning photographer based in NYC.",
        "location": "New York, NY",
        "email": "test@example.com",
        "phone": "+1-555-0100",
        "website": "https://testuser.com",
        "secondary_emails": [],
        "secondary_phones": [],
        "address_structured": None,
        "service_areas": ["New York", "Brooklyn"],
        "socials": {"instagram": "https://instagram.com/testuser"},
        "custom_links": [],
        "embedded_media": None,
        "featured_gallery_id": None,
        "categories": ["Wedding Services", "Portrait Photography"],
        "brand_color": "#E91E63",
        "background_theme": "theme-golden-hour",
        "visibility_config": {},
        "is_public": True,
        "seo_metadata": None,
        "is_verified": False,
        "badges": [],
        "booking_calendar_url": None,
        "created_at": "2025-01-01T00:00:00",
        "updated_at": "2025-06-01T00:00:00",
        "show_qr_code": True,
        "show_vcard": True,
        "public_url": "https://rawdrive.ai/u/test-user",
    }


class TestHTMLShellEndpoint:
    """Tests for GET /api/v1/u/{slug}/page."""

    @patch("app.api.v1.personal_profile.get_personal_profile_service")
    @patch("app.services.seo_service.get_seo_service")
    def test_html_shell_returns_html_with_og_title(self, mock_seo_svc, mock_service_fn, client):
        """HTML shell should contain og:title meta tag with profile name."""
        mock_service = MagicMock()
        mock_service.get_public_profile = AsyncMock(return_value=_mock_profile_data())
        mock_service_fn.return_value = mock_service

        seo_svc = MagicMock()
        seo_svc.is_profile_indexable = AsyncMock(return_value=True)
        mock_seo_svc.return_value = seo_svc

        response = client.get("/api/v1/u/test-user/page")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert 'og:title' in response.text
        assert "Test User" in response.text

    @patch("app.api.v1.personal_profile.get_personal_profile_service")
    @patch("app.services.seo_service.get_seo_service")
    def test_html_shell_contains_json_ld(self, mock_seo_svc, mock_service_fn, client):
        """HTML shell should contain JSON-LD script tag."""
        mock_service = MagicMock()
        mock_service.get_public_profile = AsyncMock(return_value=_mock_profile_data())
        mock_service_fn.return_value = mock_service

        seo_svc = MagicMock()
        seo_svc.is_profile_indexable = AsyncMock(return_value=True)
        mock_seo_svc.return_value = seo_svc

        response = client.get("/api/v1/u/test-user/page")
        assert response.status_code == 200
        assert "application/ld+json" in response.text

    @patch("app.api.v1.personal_profile.get_personal_profile_service")
    @patch("app.services.seo_service.get_seo_service")
    def test_html_shell_contains_twitter_card(self, mock_seo_svc, mock_service_fn, client):
        """HTML shell should contain twitter:card meta tag."""
        mock_service = MagicMock()
        mock_service.get_public_profile = AsyncMock(return_value=_mock_profile_data())
        mock_service_fn.return_value = mock_service

        seo_svc = MagicMock()
        seo_svc.is_profile_indexable = AsyncMock(return_value=True)
        mock_seo_svc.return_value = seo_svc

        response = client.get("/api/v1/u/test-user/page")
        assert response.status_code == 200
        assert "twitter:card" in response.text
        assert "summary_large_image" in response.text

    @patch("app.api.v1.personal_profile.get_personal_profile_service")
    def test_html_shell_404_for_nonexistent_slug(self, mock_service_fn, client):
        """HTML shell should return 404 for non-existent profile slug."""
        from app.services.personal_profile_service import PublicProfileNotFoundError

        mock_service = MagicMock()
        mock_service.get_public_profile = AsyncMock(side_effect=PublicProfileNotFoundError("test"))
        mock_service_fn.return_value = mock_service

        response = client.get("/api/v1/u/nonexistent/page")
        assert response.status_code == 404

    @patch("app.api.v1.personal_profile.get_personal_profile_service")
    @patch("app.services.seo_service.get_seo_service")
    def test_html_shell_noindex_when_not_indexable(self, mock_seo_svc, mock_service_fn, client):
        """Non-indexable profiles should include robots noindex meta tag."""
        mock_service = MagicMock()
        mock_service.get_public_profile = AsyncMock(return_value=_mock_profile_data())
        mock_service_fn.return_value = mock_service

        seo_svc = MagicMock()
        seo_svc.is_profile_indexable = AsyncMock(return_value=False)
        mock_seo_svc.return_value = seo_svc

        response = client.get("/api/v1/u/test-user/page")
        assert response.status_code == 200
        assert "noindex" in response.text


class TestOGImageEndpoint:
    """Tests for GET /api/v1/u/{slug}/og-image."""

    @patch("app.api.v1.personal_profile.get_personal_profile_service")
    def test_og_image_returns_png(self, mock_service_fn, client):
        """OG image endpoint should return image/png content type."""
        mock_service = MagicMock()
        mock_service.get_public_profile = AsyncMock(return_value=_mock_profile_data())
        mock_service.get_avatar_image_by_slug = AsyncMock(return_value=None)
        mock_service_fn.return_value = mock_service

        response = client.get("/api/v1/u/test-user/og-image")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        # Verify PNG magic bytes
        assert response.content[:4] == b"\x89PNG"

    @patch("app.api.v1.personal_profile.get_personal_profile_service")
    def test_og_image_404_for_nonexistent(self, mock_service_fn, client):
        """OG image endpoint should return 404 for non-existent slug."""
        from app.services.personal_profile_service import PublicProfileNotFoundError

        mock_service = MagicMock()
        mock_service.get_public_profile = AsyncMock(side_effect=PublicProfileNotFoundError("test"))
        mock_service_fn.return_value = mock_service

        response = client.get("/api/v1/u/nonexistent/og-image")
        assert response.status_code == 404

    @patch("app.api.v1.personal_profile.get_personal_profile_service")
    def test_og_image_has_cache_header(self, mock_service_fn, client):
        """OG image should have Cache-Control header for CDN caching."""
        mock_service = MagicMock()
        mock_service.get_public_profile = AsyncMock(return_value=_mock_profile_data())
        mock_service.get_avatar_image_by_slug = AsyncMock(return_value=None)
        mock_service_fn.return_value = mock_service

        response = client.get("/api/v1/u/test-user/og-image")
        assert response.status_code == 200
        assert "max-age=86400" in response.headers.get("cache-control", "")
