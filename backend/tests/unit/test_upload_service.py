"""Tests for upload service."""

import os
import pytest
from unittest.mock import patch
from uuid import uuid4
from app.services.upload_service import UploadService, UploadError


@pytest.fixture
def upload_service(monkeypatch):
    """Create upload service instance.
    
    Uses actual environment variables from .env file (production-ready).
    Only sets test values if env vars are not already present.
    """
    # Use actual environment variables from .env if available
    # Only set test defaults if not present (for CI/CD environments)
    env_vars = {
        "R2_ACCESS_KEY_ID": os.getenv("R2_ACCESS_KEY_ID", "test-key"),
        "R2_SECRET_ACCESS_KEY": os.getenv("R2_SECRET_ACCESS_KEY", "test-secret"),
        "R2_BUCKET_NAME": os.getenv("R2_BUCKET_NAME", "test-bucket"),
        "R2_ENDPOINT_URL": os.getenv("R2_ENDPOINT_URL", "https://test-account-id.r2.cloudflarestorage.com"),
        "R2_ACCOUNT_ID": os.getenv("R2_ACCOUNT_ID", "test-account-id"),
        "ENCRYPTION_MASTER_KEY": os.getenv("ENCRYPTION_MASTER_KEY", "0" * 64),  # 32 bytes = 64 hex chars
        "SIGNED_URL_SECRET": os.getenv("SIGNED_URL_SECRET", "0" * 64),  # Required by settings
    }
    
    # Set environment variables (will use actual values from .env if present)
    for key, value in env_vars.items():
        monkeypatch.setenv(key, value)
    
    # Clear settings cache and service singletons
    from app.config.settings import get_settings
    get_settings.cache_clear()
    from app.services.encryption_service import _encryption_service
    import app.services.encryption_service
    app.services.encryption_service._encryption_service = None
    from app.services.upload_service import _upload_service
    import app.services.upload_service
    app.services.upload_service._upload_service = None
    
    return UploadService()


def test_validate_file_type_image(upload_service):
    """Test Property 10: File Type Validation - valid image types are accepted."""
    # Valid image types
    valid_types = [
        ("image.jpg", "image/jpeg", 1024),
        ("image.png", "image/png", 1024),
        ("image.webp", "image/webp", 1024),
        ("image.heic", "image/heic", 1024),
    ]
    
    for filename, mime_type, size in valid_types:
        file_type, normalized = upload_service.validate_file(filename, mime_type, size)
        assert file_type == "photo"
        assert normalized in ["image/jpeg", "image/png", "image/webp", "image/heic"]


def test_validate_file_type_video(upload_service):
    """Test video file validation."""
    valid_types = [
        ("video.mp4", "video/mp4", 1024),
        ("video.mov", "video/mov", 1024),
        ("video.mov", "video/quicktime", 1024),
    ]
    
    for filename, mime_type, size in valid_types:
        file_type, normalized = upload_service.validate_file(filename, mime_type, size)
        assert file_type == "video"


def test_validate_file_type_invalid(upload_service):
    """Test invalid file types are rejected."""
    invalid_types = [
        ("file.pdf", "application/pdf", 1024),
        ("file.txt", "text/plain", 1024),
        ("file.exe", "application/x-msdownload", 1024),
    ]
    
    for filename, mime_type, size in invalid_types:
        with pytest.raises(UploadError, match="Unsupported file type"):
            upload_service.validate_file(filename, mime_type, size)


def test_validate_file_size_image(upload_service):
    """Test image file size limits."""
    # Valid size (100MB limit)
    upload_service.validate_file("image.jpg", "image/jpeg", 100 * 1024 * 1024)
    
    # Too large
    with pytest.raises(UploadError, match="File too large"):
        upload_service.validate_file("image.jpg", "image/jpeg", 101 * 1024 * 1024)


def test_validate_file_size_video(upload_service):
    """Test video file size limits."""
    # Valid size (500MB limit)
    upload_service.validate_file("video.mp4", "video/mp4", 500 * 1024 * 1024)
    
    # Too large
    with pytest.raises(UploadError, match="File too large"):
        upload_service.validate_file("video.mp4", "video/mp4", 501 * 1024 * 1024)

