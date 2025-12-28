"""Secure Image Fetching Utility.

Provides secure image fetching with SSRF protection, timeouts, and size limits.
Feature: 010-ai-powered-features
"""

from __future__ import annotations

import base64
import ipaddress
import logging
from urllib.parse import urlparse
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum image size in bytes (20 MB)
MAX_IMAGE_SIZE = 20 * 1024 * 1024

# HTTP timeout in seconds
HTTP_TIMEOUT = 30.0

# Allowed URL schemes
ALLOWED_SCHEMES = {"http", "https"}

# Blocked private IP ranges (SSRF protection)
PRIVATE_IP_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # Link-local
    ipaddress.ip_network("::1/128"),  # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),  # IPv6 private
    ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
]


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ImageFetchError(Exception):
    """Base exception for image fetching errors."""
    pass


class InvalidURLError(ImageFetchError):
    """Raised when URL is invalid or blocked."""
    pass


class ImageTooLargeError(ImageFetchError):
    """Raised when image exceeds size limit."""
    pass


class FetchTimeoutError(ImageFetchError):
    """Raised when fetch times out."""
    pass


# ---------------------------------------------------------------------------
# Validation Functions
# ---------------------------------------------------------------------------


def is_private_ip(ip_str: str) -> bool:
    """Check if an IP address is in a private/blocked range.

    Args:
        ip_str: IP address string

    Returns:
        True if IP is private/blocked
    """
    try:
        ip = ipaddress.ip_address(ip_str)
        for network in PRIVATE_IP_RANGES:
            if ip in network:
                return True
        return False
    except ValueError:
        return False


def validate_url(url: str) -> None:
    """Validate URL for SSRF protection.

    Args:
        url: URL to validate

    Raises:
        InvalidURLError: If URL is invalid or potentially unsafe
    """
    try:
        parsed = urlparse(url)
    except Exception as e:
        raise InvalidURLError(f"Invalid URL format: {e}")

    # Check scheme
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise InvalidURLError(f"URL scheme '{parsed.scheme}' not allowed")

    # Check for empty host
    if not parsed.hostname:
        raise InvalidURLError("URL must have a hostname")

    # Check for internal hostnames
    hostname = parsed.hostname.lower()
    blocked_hostnames = {
        "localhost",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
        "metadata.google.internal",
        "169.254.169.254",  # Cloud metadata
    }
    if hostname in blocked_hostnames:
        raise InvalidURLError(f"Hostname '{hostname}' is blocked")

    # Check if hostname is an IP address in private range
    try:
        if is_private_ip(hostname):
            raise InvalidURLError(f"Private IP addresses are blocked")
    except ValueError:
        # Not an IP address, that's fine
        pass


# ---------------------------------------------------------------------------
# Fetch Functions
# ---------------------------------------------------------------------------


async def fetch_image_bytes(
    url: str,
    max_size: int = MAX_IMAGE_SIZE,
    timeout: float = HTTP_TIMEOUT,
) -> bytes:
    """Fetch image bytes from URL with security protections.

    Args:
        url: URL to fetch image from
        max_size: Maximum allowed size in bytes
        timeout: Request timeout in seconds

    Returns:
        Image bytes

    Raises:
        InvalidURLError: If URL is invalid or blocked
        ImageTooLargeError: If image exceeds size limit
        FetchTimeoutError: If request times out
        ImageFetchError: For other fetch errors
    """
    # Validate URL first
    validate_url(url)

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout),
            follow_redirects=True,
            max_redirects=5,
        ) as client:
            # First, do a HEAD request to check content-length
            try:
                head_response = await client.head(url)
                content_length = head_response.headers.get("content-length")
                if content_length and int(content_length) > max_size:
                    raise ImageTooLargeError(
                        f"Image size {int(content_length)} exceeds limit {max_size}"
                    )
            except ImageTooLargeError:
                raise
            except Exception:
                # HEAD might not be supported, continue with GET
                pass

            # Fetch the image
            response = await client.get(url)
            response.raise_for_status()

            # Check actual content length
            if len(response.content) > max_size:
                raise ImageTooLargeError(
                    f"Image size {len(response.content)} exceeds limit {max_size}"
                )

            return response.content

    except httpx.TimeoutException:
        raise FetchTimeoutError(f"Request timed out after {timeout}s")
    except httpx.HTTPStatusError as e:
        raise ImageFetchError(f"HTTP error {e.response.status_code}: {e}")
    except (InvalidURLError, ImageTooLargeError, FetchTimeoutError):
        raise
    except Exception as e:
        raise ImageFetchError(f"Failed to fetch image: {e}")


async def fetch_image_base64(
    url: str,
    max_size: int = MAX_IMAGE_SIZE,
    timeout: float = HTTP_TIMEOUT,
) -> str:
    """Fetch image and return as base64 encoded string.

    Args:
        url: URL to fetch image from
        max_size: Maximum allowed size in bytes
        timeout: Request timeout in seconds

    Returns:
        Base64 encoded image string

    Raises:
        Same as fetch_image_bytes
    """
    image_bytes = await fetch_image_bytes(url, max_size, timeout)
    return base64.b64encode(image_bytes).decode("utf-8")
