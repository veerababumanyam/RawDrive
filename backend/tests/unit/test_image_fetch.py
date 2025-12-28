"""Unit tests for image fetch utility.

Tests SSRF protection, timeouts, and size limits.
Feature: 010-ai-powered-features
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.utils.image_fetch import (
    validate_url,
    is_private_ip,
    fetch_image_bytes,
    fetch_image_base64,
    InvalidURLError,
    ImageTooLargeError,
    FetchTimeoutError,
    ImageFetchError,
)


class TestURLValidation:
    """Test URL validation for SSRF protection."""

    def test_valid_https_url(self) -> None:
        """Test that valid HTTPS URLs pass validation."""
        validate_url("https://example.com/image.jpg")
        validate_url("https://cdn.example.com/photos/123.png")

    def test_valid_http_url(self) -> None:
        """Test that valid HTTP URLs pass validation."""
        validate_url("http://example.com/image.jpg")

    def test_invalid_scheme_ftp(self) -> None:
        """Test that FTP scheme is blocked."""
        with pytest.raises(InvalidURLError, match="scheme.*not allowed"):
            validate_url("ftp://example.com/file.jpg")

    def test_invalid_scheme_file(self) -> None:
        """Test that file:// scheme is blocked."""
        with pytest.raises(InvalidURLError, match="scheme.*not allowed"):
            validate_url("file:///etc/passwd")

    def test_localhost_blocked(self) -> None:
        """Test that localhost is blocked."""
        with pytest.raises(InvalidURLError, match="blocked"):
            validate_url("https://localhost/image.jpg")

    def test_loopback_ip_blocked(self) -> None:
        """Test that 127.0.0.1 is blocked."""
        with pytest.raises(InvalidURLError, match="blocked"):
            validate_url("https://127.0.0.1/image.jpg")

    def test_cloud_metadata_blocked(self) -> None:
        """Test that cloud metadata IP is blocked."""
        with pytest.raises(InvalidURLError, match="blocked"):
            validate_url("http://169.254.169.254/latest/meta-data/")

    def test_private_ip_10_blocked(self) -> None:
        """Test that 10.x.x.x range is blocked."""
        with pytest.raises(InvalidURLError, match="Private IP"):
            validate_url("http://10.0.0.1/image.jpg")

    def test_private_ip_172_blocked(self) -> None:
        """Test that 172.16.x.x range is blocked."""
        with pytest.raises(InvalidURLError, match="Private IP"):
            validate_url("http://172.16.0.1/image.jpg")

    def test_private_ip_192_blocked(self) -> None:
        """Test that 192.168.x.x range is blocked."""
        with pytest.raises(InvalidURLError, match="Private IP"):
            validate_url("http://192.168.1.1/image.jpg")

    def test_empty_hostname(self) -> None:
        """Test that empty hostname is rejected."""
        with pytest.raises(InvalidURLError, match="hostname"):
            validate_url("https:///image.jpg")


class TestPrivateIPDetection:
    """Test private IP detection."""

    def test_loopback(self) -> None:
        """Test 127.0.0.1 is detected as private."""
        assert is_private_ip("127.0.0.1") is True

    def test_private_10(self) -> None:
        """Test 10.x.x.x is detected as private."""
        assert is_private_ip("10.0.0.1") is True
        assert is_private_ip("10.255.255.255") is True

    def test_private_172(self) -> None:
        """Test 172.16-31.x.x is detected as private."""
        assert is_private_ip("172.16.0.1") is True
        assert is_private_ip("172.31.255.255") is True
        # 172.32.x.x is public
        assert is_private_ip("172.32.0.1") is False

    def test_private_192(self) -> None:
        """Test 192.168.x.x is detected as private."""
        assert is_private_ip("192.168.0.1") is True
        assert is_private_ip("192.168.255.255") is True

    def test_public_ip(self) -> None:
        """Test public IPs are not detected as private."""
        assert is_private_ip("8.8.8.8") is False
        assert is_private_ip("1.1.1.1") is False
        assert is_private_ip("93.184.216.34") is False  # example.com


class TestFetchImageBytes:
    """Test image fetching with security protections."""

    @pytest.mark.asyncio
    async def test_fetch_success(self) -> None:
        """Test successful image fetch."""
        image_data = b"fake image content"

        with patch("app.utils.image_fetch.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            # HEAD request
            mock_head_response = MagicMock()
            mock_head_response.headers = {"content-length": "100"}
            mock_client.head.return_value = mock_head_response

            # GET request
            mock_get_response = MagicMock()
            mock_get_response.content = image_data
            mock_get_response.raise_for_status = MagicMock()
            mock_client.get.return_value = mock_get_response

            result = await fetch_image_bytes("https://example.com/photo.jpg")

            assert result == image_data

    @pytest.mark.asyncio
    async def test_fetch_blocked_url(self) -> None:
        """Test that blocked URLs raise InvalidURLError."""
        with pytest.raises(InvalidURLError):
            await fetch_image_bytes("http://localhost/image.jpg")

    @pytest.mark.asyncio
    async def test_fetch_too_large_from_header(self) -> None:
        """Test that oversized images are rejected via Content-Length header."""
        with patch("app.utils.image_fetch.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            # HEAD indicates file is too large
            mock_head_response = MagicMock()
            mock_head_response.headers = {"content-length": "50000000"}  # 50MB
            mock_client.head.return_value = mock_head_response

            with pytest.raises(ImageTooLargeError):
                await fetch_image_bytes("https://example.com/large.jpg")

    @pytest.mark.asyncio
    async def test_fetch_too_large_from_content(self) -> None:
        """Test that oversized images are rejected after download."""
        with patch("app.utils.image_fetch.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            # HEAD doesn't indicate size
            mock_client.head.side_effect = Exception("HEAD not supported")

            # GET returns oversized content
            mock_get_response = MagicMock()
            mock_get_response.content = b"x" * (25 * 1024 * 1024)  # 25MB
            mock_get_response.raise_for_status = MagicMock()
            mock_client.get.return_value = mock_get_response

            with pytest.raises(ImageTooLargeError):
                await fetch_image_bytes("https://example.com/large.jpg")


class TestFetchImageBase64:
    """Test base64 image fetching."""

    @pytest.mark.asyncio
    async def test_fetch_base64_success(self) -> None:
        """Test successful base64 fetch."""
        image_data = b"fake image"

        with patch("app.utils.image_fetch.fetch_image_bytes") as mock_fetch:
            mock_fetch.return_value = image_data

            result = await fetch_image_base64("https://example.com/photo.jpg")

            # Verify it's valid base64
            import base64
            decoded = base64.b64decode(result)
            assert decoded == image_data
