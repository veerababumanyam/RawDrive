"""
Security utilities for the Invitations Microservice.

Provides XSS prevention through HTML escaping for email templates.
All user-provided content MUST be sanitized before inclusion in HTML.
"""

import html
import re
from typing import Any, Dict, Optional
from urllib.parse import quote, urlparse


def safe_html_escape(value: Optional[str]) -> str:
    """
    Escape HTML special characters to prevent XSS attacks.

    Converts: < > & " ' to their HTML entity equivalents.

    Args:
        value: String to escape. None returns empty string.

    Returns:
        HTML-escaped string safe for inclusion in HTML content.

    Example:
        >>> safe_html_escape("<script>alert('xss')</script>")
        '&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;'
    """
    if value is None:
        return ""
    return html.escape(str(value), quote=True)


def safe_url(url: Optional[str], allow_javascript: bool = False) -> str:
    """
    Sanitize a URL for safe inclusion in href attributes.

    Validates URL scheme and encodes special characters.
    Blocks javascript: and data: URLs by default.

    Args:
        url: URL to sanitize. None returns empty string.
        allow_javascript: If True, allows javascript: URLs (DANGEROUS).

    Returns:
        Sanitized URL safe for href attributes.

    Example:
        >>> safe_url("javascript:alert('xss')")
        ''
        >>> safe_url("https://example.com/path?name=John Doe")
        'https://example.com/path?name=John%20Doe'
    """
    if url is None:
        return ""

    url = str(url).strip()

    # Block dangerous URL schemes
    dangerous_schemes = ["javascript", "data", "vbscript"]
    if not allow_javascript:
        url_lower = url.lower()
        for scheme in dangerous_schemes:
            if url_lower.startswith(f"{scheme}:"):
                return ""

    # Parse and validate URL structure
    try:
        parsed = urlparse(url)

        # Only allow http, https, and mailto schemes
        if parsed.scheme and parsed.scheme.lower() not in ["http", "https", "mailto"]:
            if not allow_javascript:
                return ""

        # Encode the path and query components
        # Keep the URL mostly intact but escape HTML-dangerous characters
        return html.escape(url, quote=True)

    except Exception:
        # If URL parsing fails, escape and return
        return html.escape(url, quote=True)


def safe_email_content(
    template: str,
    context: Dict[str, Any],
    escape_urls: bool = True,
) -> str:
    """
    Safely interpolate user content into an email template.

    All values in context are HTML-escaped before substitution.
    URLs are validated and sanitized.

    Args:
        template: HTML template string with {placeholder} markers.
        context: Dictionary of values to substitute.
        escape_urls: If True, also validates/sanitizes URL values.

    Returns:
        HTML string with safely escaped content.

    Example:
        >>> template = "<h1>Hello {name}!</h1><a href='{url}'>Click</a>"
        >>> context = {"name": "<script>xss</script>", "url": "https://example.com"}
        >>> safe_email_content(template, context)
        "<h1>Hello &lt;script&gt;xss&lt;/script&gt;!</h1><a href='https://example.com'>Click</a>"
    """
    # URL-like keys that should be treated as URLs
    url_keys = {"url", "link", "href", "invitation_url", "rsvp_url", "callback_url"}

    safe_context = {}
    for key, value in context.items():
        if value is None:
            safe_context[key] = ""
        elif escape_urls and key.lower() in url_keys:
            # Sanitize URLs
            safe_context[key] = safe_url(value)
        elif escape_urls and key.lower().endswith("_url"):
            # Any key ending in _url is treated as a URL
            safe_context[key] = safe_url(value)
        else:
            # Escape HTML for all other content
            safe_context[key] = safe_html_escape(value)

    return template.format(**safe_context)


def sanitize_email_template_data(data: Dict[str, Any]) -> Dict[str, str]:
    """
    Sanitize all values in a template data dictionary.

    Suitable for SendGrid dynamic_template_data where all values
    should be pre-escaped before sending to the email service.

    Args:
        data: Dictionary of template variables.

    Returns:
        Dictionary with all string values HTML-escaped.

    Example:
        >>> sanitize_email_template_data({"name": "<b>John</b>", "count": 5})
        {"name": "&lt;b&gt;John&lt;/b&gt;", "count": "5"}
    """
    url_keys = {"url", "link", "href", "invitation_url", "rsvp_url", "callback_url"}

    sanitized = {}
    for key, value in data.items():
        if value is None:
            sanitized[key] = ""
        elif key.lower() in url_keys or key.lower().endswith("_url"):
            sanitized[key] = safe_url(value)
        else:
            sanitized[key] = safe_html_escape(value)

    return sanitized


# Additional validation helpers


def validate_email_recipient_name(name: str, max_length: int = 200) -> str:
    """
    Validate and sanitize recipient name for email display.

    Removes potentially dangerous characters and limits length.

    Args:
        name: Recipient name to validate.
        max_length: Maximum allowed length.

    Returns:
        Sanitized name string.

    Raises:
        ValueError: If name is empty or invalid.
    """
    if not name or not name.strip():
        raise ValueError("Recipient name cannot be empty")

    # Remove control characters
    name = "".join(char for char in name if ord(char) >= 32)

    # Limit length
    name = name.strip()[:max_length]

    if not name:
        raise ValueError("Recipient name cannot be empty after sanitization")

    return name


def is_safe_redirect_url(url: str, allowed_hosts: Optional[list] = None) -> bool:
    """
    Check if a URL is safe for redirecting (open redirect prevention).

    Args:
        url: URL to validate.
        allowed_hosts: List of allowed hostnames. If None, only relative URLs allowed.

    Returns:
        True if URL is safe for redirect.

    Example:
        >>> is_safe_redirect_url("/dashboard")
        True
        >>> is_safe_redirect_url("https://evil.com")
        False
        >>> is_safe_redirect_url("https://example.com", allowed_hosts=["example.com"])
        True
    """
    if not url:
        return False

    # Relative URLs are safe
    if url.startswith("/") and not url.startswith("//"):
        return True

    try:
        parsed = urlparse(url)

        # Block javascript and data URLs
        if parsed.scheme.lower() in ["javascript", "data", "vbscript"]:
            return False

        # If no allowed hosts specified, reject all absolute URLs
        if not allowed_hosts:
            return False

        # Check if host is in allowed list
        return parsed.netloc.lower() in [h.lower() for h in allowed_hosts]

    except Exception:
        return False
