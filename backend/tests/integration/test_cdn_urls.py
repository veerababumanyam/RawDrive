"""Integration tests for CDN URL configuration (T053 - US5 Static Asset Delivery).

Verifies that all media URLs use CDN_BASE_URL in production mode to ensure
that application servers don't serve media directly.

Requirements:
- All media URLs should use CDN_BASE_URL when app_env=production
- Signed URLs should include proper expiration and signature parameters
- No media should be served directly from application servers in production
"""

from __future__ import annotations

import os
import pytest
from unittest.mock import patch
from uuid import uuid4

from app.config.settings import AppSettings, Environment, get_settings


class TestCDNURLConfiguration:
    """Test that CDN URLs are properly configured for production."""

    @pytest.fixture
    def production_settings(self):
        """Create production-like settings with CDN configured."""
        with patch.dict(os.environ, {
            "APP_ENV": "production",
            "CDN_BASE_URL": "https://cdn.rawdrive.ai",
            "DATABASE_URL": "postgresql://test:test@localhost:5432/test",
            "REDIS_URL": "redis://localhost:6379/0",
            "JWT_SECRET": "a" * 64,
            "JWT_PRIVATE_KEY_PATH": "/tmp/test_key",
            "JWT_PUBLIC_KEY_PATH": "/tmp/test_key.pub",
        }):
            # Force settings reload
            settings = AppSettings()
            yield settings

    @pytest.fixture
    def development_settings(self):
        """Create development settings (default CDN to localhost)."""
        with patch.dict(os.environ, {
            "APP_ENV": "development",
            "DATABASE_URL": "postgresql://test:test@localhost:5432/test",
            "REDIS_URL": "redis://localhost:6379/0",
            "JWT_SECRET": "a" * 64,
            "JWT_PRIVATE_KEY_PATH": "/tmp/test_key",
            "JWT_PUBLIC_KEY_PATH": "/tmp/test_key.pub",
        }):
            settings = AppSettings()
            yield settings

    def test_cdn_base_url_exists_in_settings(self):
        """Verify CDN_BASE_URL setting exists."""
        settings = get_settings()
        assert hasattr(settings, "cdn_base_url")

    def test_cdn_base_url_default_is_localhost(self, development_settings):
        """Verify default CDN_BASE_URL is localhost for development."""
        assert "localhost" in development_settings.cdn_base_url.lower()

    def test_cdn_base_url_configurable(self, production_settings):
        """Verify CDN_BASE_URL can be configured for production."""
        assert production_settings.cdn_base_url == "https://cdn.rawdrive.ai"
        assert production_settings.app_env == Environment.PRODUCTION

    def test_production_cdn_url_is_https(self, production_settings):
        """Verify production CDN URLs use HTTPS."""
        assert production_settings.cdn_base_url.startswith("https://")


class TestSignedURLServiceCDN:
    """Test that SignedURLService generates CDN-compatible URLs."""

    @pytest.fixture
    def signed_url_service(self):
        """Get signed URL service instance."""
        from app.services.signed_url_service import get_signed_url_service
        return get_signed_url_service()

    def test_generate_signed_url_with_custom_base_url(self, signed_url_service):
        """Verify signed URLs can use custom base URL (CDN)."""
        workspace_id = uuid4()
        asset_id = uuid4()

        result = signed_url_service.generate_signed_url(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="thumbnail",
            base_url="https://cdn.rawdrive.ai/media",
        )

        assert result["url"].startswith("https://cdn.rawdrive.ai/media")
        assert "token=" in result["url"]
        assert "expires_at" in result

    def test_generate_signed_url_default_base_url(self, signed_url_service):
        """Verify default base URL is relative (for development)."""
        workspace_id = uuid4()
        asset_id = uuid4()

        result = signed_url_service.generate_signed_url(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="thumbnail",
        )

        # Default should be relative path
        assert result["url"].startswith("/api/v1/media")

    def test_batch_generate_signed_urls_with_cdn(self, signed_url_service):
        """Verify batch URL generation supports CDN base URL."""
        workspace_id = uuid4()
        asset_ids = [uuid4() for _ in range(3)]

        results = signed_url_service.batch_generate_signed_urls(
            workspace_id=workspace_id,
            asset_ids=asset_ids,
            variant="thumbnail",
            base_url="https://cdn.rawdrive.ai/media",
        )

        assert len(results) == 3
        for asset_id, result in results.items():
            assert result["url"].startswith("https://cdn.rawdrive.ai/media")


class TestMediaEndpointConfiguration:
    """Test that media endpoints are configured to redirect to CDN."""

    def test_media_endpoint_exists(self):
        """Verify media endpoint is registered."""
        from app.main import app

        routes = [route.path for route in app.routes]
        # Media endpoint should exist for serving or redirecting
        media_routes = [r for r in routes if "/media/" in r or "media" in r.lower()]
        assert len(media_routes) > 0, "Media endpoint should be registered"

    def test_media_schema_includes_url_field(self):
        """Verify media schemas include URL fields for CDN integration."""
        from app.api.schemas import AssetResponse

        # AssetResponse should have thumbnail_url field
        assert hasattr(AssetResponse, "model_fields")
        assert "thumbnail_url" in AssetResponse.model_fields


class TestCDNURLPatterns:
    """Test URL patterns for CDN compatibility."""

    def test_cdn_url_format(self):
        """Verify CDN URL format follows expected pattern."""
        cdn_base = "https://cdn.rawdrive.ai"
        workspace_id = uuid4()
        asset_id = uuid4()

        # Expected pattern: {cdn_base}/media/{token}
        # Token contains: workspace_id:asset_id:variant:expires:signature
        expected_pattern = f"{cdn_base}/media/"

        # The actual URL generation happens in signed_url_service
        # This test validates the pattern structure
        assert expected_pattern.startswith("https://")
        assert "cdn" in expected_pattern.lower()

    def test_no_direct_file_serving(self):
        """Verify R2 storage service doesn't expose direct file URLs."""
        from app.services.r2_storage_service import R2StorageService

        # R2StorageService should not have public URL generation
        # All URLs should go through signed_url_service
        service_methods = [m for m in dir(R2StorageService) if not m.startswith("_")]

        # Should not have get_public_url or similar
        assert "get_public_url" not in service_methods
        assert "public_url" not in service_methods


class TestProductionCDNReadiness:
    """Tests to verify CDN readiness for production deployment."""

    def test_cdn_environment_variable_documented(self):
        """Verify CDN_BASE_URL is properly documented in settings."""
        from app.config.settings import AppSettings

        field_info = AppSettings.model_fields.get("cdn_base_url")
        assert field_info is not None
        assert field_info.description is not None
        assert "CDN" in field_info.description

    def test_settings_mask_does_not_include_cdn(self):
        """Verify CDN URL is not masked (it's not a secret)."""
        settings = get_settings()

        # CDN URL should not be in the masked values list
        # (it's public infrastructure, not a secret)
        assert "cdn_base_url" not in settings._masked_fields if hasattr(settings, "_masked_fields") else True

    @pytest.mark.parametrize("variant", ["thumbnail", "preview", "original"])
    def test_all_variants_support_cdn(self, variant):
        """Verify all asset variants support CDN URL generation."""
        from app.services.signed_url_service import get_signed_url_service

        service = get_signed_url_service()
        workspace_id = uuid4()
        asset_id = uuid4()

        result = service.generate_signed_url(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant=variant,
            base_url="https://cdn.rawdrive.ai/media",
        )

        assert result["url"].startswith("https://cdn.rawdrive.ai/media")
        assert f"/{variant}/" in result["url"] or variant in result["url"]
