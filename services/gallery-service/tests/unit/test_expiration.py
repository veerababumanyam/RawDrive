"""Tests for gallery expiration middleware.

Tests the check_gallery_expiration utility function which blocks
public access to expired galleries with a 410 Gone response.
"""

import pytest
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException

from src.middleware.expiration import check_gallery_expiration


class TestCheckGalleryExpiration:
    """Tests for the check_gallery_expiration function."""

    def test_passthrough_when_expires_at_is_none(self):
        """Gallery with no expires_at should pass through (return None)."""
        gallery_data = {
            "gallery_id": "test-id",
            "title": "Wedding Gallery",
            "expires_at": None,
        }
        result = check_gallery_expiration(gallery_data)
        assert result is None

    def test_passthrough_when_expires_at_missing(self):
        """Gallery dict without expires_at key should pass through."""
        gallery_data = {
            "gallery_id": "test-id",
            "title": "Wedding Gallery",
        }
        result = check_gallery_expiration(gallery_data)
        assert result is None

    def test_passthrough_when_expires_at_in_future(self):
        """Gallery with future expires_at should pass through."""
        future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        gallery_data = {
            "gallery_id": "test-id",
            "title": "Wedding Gallery",
            "expires_at": future,
        }
        result = check_gallery_expiration(gallery_data)
        assert result is None

    def test_raises_410_when_expired(self):
        """Gallery with past expires_at should raise HTTPException 410."""
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        gallery_data = {
            "gallery_id": "test-id",
            "title": "Wedding Gallery",
            "name": "Wedding Gallery",
            "photographer_name": "Jane Doe",
            "expires_at": past,
        }
        with pytest.raises(HTTPException) as exc_info:
            check_gallery_expiration(gallery_data)

        assert exc_info.value.status_code == 410
        detail = exc_info.value.detail
        assert detail["error"] == "gallery_expired"
        assert "expired_at" in detail
        assert detail["gallery_name"] == "Wedding Gallery"
        assert detail["photographer_name"] == "Jane Doe"

    def test_raises_410_with_missing_optional_fields(self):
        """410 detail should handle missing gallery_name and photographer_name."""
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        gallery_data = {
            "gallery_id": "test-id",
            "expires_at": past,
        }
        with pytest.raises(HTTPException) as exc_info:
            check_gallery_expiration(gallery_data)

        assert exc_info.value.status_code == 410
        detail = exc_info.value.detail
        assert detail["error"] == "gallery_expired"
        assert detail["gallery_name"] is None
        assert detail["photographer_name"] is None

    def test_days_until_expiry_computation(self):
        """Should correctly compute days until expiry for non-expired galleries."""
        from src.middleware.expiration import compute_days_until_expiry

        future = datetime.now(timezone.utc) + timedelta(days=7, hours=3)
        result = compute_days_until_expiry(future.isoformat())
        assert result == 7

    def test_days_until_expiry_none_for_no_expiration(self):
        """Should return None when no expiration date."""
        from src.middleware.expiration import compute_days_until_expiry

        result = compute_days_until_expiry(None)
        assert result is None

    def test_days_until_expiry_zero_for_today(self):
        """Should return 0 when expiring today."""
        from src.middleware.expiration import compute_days_until_expiry

        today = datetime.now(timezone.utc) + timedelta(hours=2)
        result = compute_days_until_expiry(today.isoformat())
        assert result == 0

    def test_days_until_expiry_negative_for_past(self):
        """Should return negative days for past expiration."""
        from src.middleware.expiration import compute_days_until_expiry

        past = datetime.now(timezone.utc) - timedelta(days=3)
        result = compute_days_until_expiry(past.isoformat())
        assert result == -3
