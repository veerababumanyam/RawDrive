"""Unit tests for UploadService.

Tests file validation, session management, and storage quota checking.
"""

import pytest
from uuid import uuid4, UUID
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.upload_service import (
    UploadService,
    get_upload_service,
    reset_upload_service,
    ValidationError,
    StorageLimitExceededError,
    SessionNotFoundError,
    SessionExpiredError,
    SUPPORTED_IMAGE_MIME_TYPES,
    SUPPORTED_RAW_EXTENSIONS,
    MAX_FILE_SIZE,
    MAX_RAW_SIZE,
    MAX_VIDEO_SIZE,
)


class TestFileValidation:
    """Test file validation logic."""

    def setup_method(self):
        """Reset singleton before each test."""
        reset_upload_service()
        self.service = get_upload_service()

    def test_validate_jpeg_file(self):
        """Test validating a standard JPEG file."""
        file_type, mime_type = self.service.validate_file(
            filename="photo.jpg",
            mime_type="image/jpeg",
            size_bytes=1024 * 1024,  # 1MB
        )
        assert file_type == "photo"
        assert mime_type == "image/jpeg"

    def test_validate_png_file(self):
        """Test validating a PNG file."""
        file_type, mime_type = self.service.validate_file(
            filename="image.png",
            mime_type="image/png",
            size_bytes=5 * 1024 * 1024,  # 5MB
        )
        assert file_type == "photo"
        assert mime_type == "image/png"

    def test_validate_webp_file(self):
        """Test validating a WebP file."""
        file_type, mime_type = self.service.validate_file(
            filename="image.webp",
            mime_type="image/webp",
            size_bytes=2 * 1024 * 1024,
        )
        assert file_type == "photo"
        assert mime_type == "image/webp"

    def test_validate_heic_file(self):
        """Test validating a HEIC file."""
        file_type, mime_type = self.service.validate_file(
            filename="IMG_1234.HEIC",
            mime_type="image/heic",
            size_bytes=3 * 1024 * 1024,
        )
        assert file_type == "photo"
        assert mime_type == "image/heic"

    def test_validate_video_file(self):
        """Test validating a video file."""
        file_type, mime_type = self.service.validate_file(
            filename="video.mp4",
            mime_type="video/mp4",
            size_bytes=50 * 1024 * 1024,  # 50MB
        )
        assert file_type == "video"
        assert mime_type == "video/mp4"

    def test_validate_raw_file_by_extension(self):
        """Test validating RAW file using extension fallback."""
        # CR2 files often come with application/octet-stream
        file_type, mime_type = self.service.validate_file(
            filename="IMG_1234.CR2",
            mime_type="application/octet-stream",
            size_bytes=30 * 1024 * 1024,  # 30MB
        )
        assert file_type == "photo"
        assert mime_type == "image/x-raw-cr2"

    def test_validate_nef_raw_file(self):
        """Test validating Nikon NEF file."""
        file_type, mime_type = self.service.validate_file(
            filename="DSC_0001.NEF",
            mime_type="",  # Empty MIME type
            size_bytes=25 * 1024 * 1024,
        )
        assert file_type == "photo"
        assert mime_type == "image/x-raw-nef"

    def test_validate_sony_arw_file(self):
        """Test validating Sony ARW file."""
        file_type, mime_type = self.service.validate_file(
            filename="DSC00001.ARW",
            mime_type="image/x-sony-arw",
            size_bytes=40 * 1024 * 1024,
        )
        assert file_type == "photo"
        # Should use the provided MIME type
        assert mime_type == "image/x-sony-arw"

    def test_reject_unsupported_file_type(self):
        """Test rejecting unsupported file type."""
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_file(
                filename="document.pdf",
                mime_type="application/pdf",
                size_bytes=1024 * 1024,
            )
        assert "Unsupported file type" in str(exc_info.value)
        assert exc_info.value.code == "INVALID_FILE_TYPE"

    def test_reject_executable_file(self):
        """Test rejecting executable files."""
        with pytest.raises(ValidationError):
            self.service.validate_file(
                filename="malware.exe",
                mime_type="application/x-executable",
                size_bytes=1024,
            )

    def test_reject_file_too_large(self):
        """Test rejecting files that exceed size limit."""
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_file(
                filename="huge.jpg",
                mime_type="image/jpeg",
                size_bytes=150 * 1024 * 1024,  # 150MB exceeds 100MB limit
            )
        assert "File too large" in str(exc_info.value)
        assert exc_info.value.code == "FILE_TOO_LARGE"

    def test_raw_file_allows_larger_size(self):
        """Test that RAW files have higher size limit."""
        # RAW files allow up to 200MB
        file_type, mime_type = self.service.validate_file(
            filename="large.CR2",
            mime_type="application/octet-stream",
            size_bytes=180 * 1024 * 1024,  # 180MB - would fail for JPEG
        )
        assert file_type == "photo"

    def test_reject_zero_size_file(self):
        """Test rejecting zero-size files."""
        with pytest.raises(ValidationError) as exc_info:
            self.service.validate_file(
                filename="empty.jpg",
                mime_type="image/jpeg",
                size_bytes=0,
            )
        assert "greater than 0" in str(exc_info.value)
        assert exc_info.value.code == "INVALID_FILE_SIZE"

    def test_reject_negative_size_file(self):
        """Test rejecting negative file sizes."""
        with pytest.raises(ValidationError):
            self.service.validate_file(
                filename="negative.jpg",
                mime_type="image/jpeg",
                size_bytes=-100,
            )


class TestStorageQuota:
    """Test storage quota checking."""

    def setup_method(self):
        reset_upload_service()
        self.service = get_upload_service()

    @pytest.mark.asyncio
    async def test_allow_upload_within_quota(self):
        """Test allowing upload when within quota."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            # Simulate 50GB used, 100GB limit
            mock_fetch.return_value = (
                50 * 1024 * 1024 * 1024,  # 50GB used
                100 * 1024 * 1024 * 1024,  # 100GB limit
            )

            allowed, error_msg = await self.service.check_storage_quota(
                workspace_id=uuid4(),
                size_bytes=10 * 1024 * 1024,  # 10MB upload
            )

            assert allowed is True
            assert error_msg is None

    @pytest.mark.asyncio
    async def test_reject_upload_exceeding_quota(self):
        """Test rejecting upload that would exceed quota."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            # Simulate 99GB used, 100GB limit
            mock_fetch.return_value = (
                99 * 1024 * 1024 * 1024,  # 99GB used
                100 * 1024 * 1024 * 1024,  # 100GB limit
            )

            allowed, error_msg = await self.service.check_storage_quota(
                workspace_id=uuid4(),
                size_bytes=2 * 1024 * 1024 * 1024,  # 2GB upload
            )

            assert allowed is False
            assert "Storage limit exceeded" in error_msg

    @pytest.mark.asyncio
    async def test_allow_unlimited_quota(self):
        """Test allowing upload with unlimited quota (limit = 0)."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = (
                500 * 1024 * 1024 * 1024,  # 500GB used
                0,  # 0 means unlimited
            )

            allowed, error_msg = await self.service.check_storage_quota(
                workspace_id=uuid4(),
                size_bytes=100 * 1024 * 1024,
            )

            assert allowed is True
            assert error_msg is None


class TestUploadSession:
    """Test upload session management."""

    def setup_method(self):
        reset_upload_service()
        self.service = get_upload_service()
        self.workspace_id = uuid4()
        self.user_id = uuid4()
        self.gallery_id = uuid4()

    @pytest.mark.asyncio
    async def test_create_upload_session(self):
        """Test creating an upload session."""
        with (
            patch("app.services.upload_service.fetch_one") as mock_fetch,
            patch("app.services.upload_service.execute") as mock_execute,
        ):
            # Mock quota check
            mock_fetch.return_value = (0, 100 * 1024 * 1024 * 1024)

            result = await self.service.create_upload_session(
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                gallery_id=self.gallery_id,
                filename="photo.jpg",
                mime_type="image/jpeg",
                size_bytes=5 * 1024 * 1024,
            )

            assert "upload_id" in result
            assert result["provider"] == "r2"
            assert "upload_url" in result
            assert "expires_at" in result
            mock_execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_session_validates_file(self):
        """Test that session creation validates the file."""
        with pytest.raises(ValidationError):
            await self.service.create_upload_session(
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                gallery_id=self.gallery_id,
                filename="document.pdf",
                mime_type="application/pdf",
                size_bytes=1024,
            )

    @pytest.mark.asyncio
    async def test_create_session_checks_quota(self):
        """Test that session creation checks storage quota."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            # Quota exceeded
            mock_fetch.return_value = (100, 100)  # At limit

            with pytest.raises(StorageLimitExceededError):
                await self.service.create_upload_session(
                    workspace_id=self.workspace_id,
                    user_id=self.user_id,
                    gallery_id=self.gallery_id,
                    filename="photo.jpg",
                    mime_type="image/jpeg",
                    size_bytes=1024,
                )


class TestSupportedFormats:
    """Test supported file format constants."""

    def test_image_mime_types_defined(self):
        """Test that image MIME types are defined."""
        assert "image/jpeg" in SUPPORTED_IMAGE_MIME_TYPES
        assert "image/png" in SUPPORTED_IMAGE_MIME_TYPES
        assert "image/webp" in SUPPORTED_IMAGE_MIME_TYPES
        assert "image/heic" in SUPPORTED_IMAGE_MIME_TYPES

    def test_raw_extensions_defined(self):
        """Test that RAW extensions are defined."""
        assert "cr2" in SUPPORTED_RAW_EXTENSIONS
        assert "cr3" in SUPPORTED_RAW_EXTENSIONS
        assert "nef" in SUPPORTED_RAW_EXTENSIONS
        assert "arw" in SUPPORTED_RAW_EXTENSIONS
        assert "dng" in SUPPORTED_RAW_EXTENSIONS

    def test_file_size_limits(self):
        """Test file size limits are reasonable."""
        assert MAX_FILE_SIZE == 100 * 1024 * 1024  # 100MB
        assert MAX_RAW_SIZE == 200 * 1024 * 1024  # 200MB
        assert MAX_VIDEO_SIZE == 500 * 1024 * 1024  # 500MB
