"""
Unit Tests for safe_email_content() and HTML Escape Functions.

Tests the core security utilities for XSS prevention.
"""

import pytest

from src.utils.security import (
    is_safe_redirect_url,
    safe_email_content,
    safe_html_escape,
    safe_url,
    sanitize_email_template_data,
    validate_email_recipient_name,
)


class TestSafeHtmlEscape:
    """Unit tests for safe_html_escape function."""

    def test_escapes_less_than(self):
        """Less-than sign is escaped."""
        assert safe_html_escape("<") == "&lt;"

    def test_escapes_greater_than(self):
        """Greater-than sign is escaped."""
        assert safe_html_escape(">") == "&gt;"

    def test_escapes_ampersand(self):
        """Ampersand is escaped."""
        assert safe_html_escape("&") == "&amp;"

    def test_escapes_double_quote(self):
        """Double quote is escaped."""
        assert safe_html_escape('"') == "&quot;"

    def test_escapes_single_quote(self):
        """Single quote is escaped."""
        result = safe_html_escape("'")
        assert result == "&#x27;"

    def test_escapes_all_special_chars(self):
        """All special characters escaped in one string."""
        result = safe_html_escape("<script>alert('xss')&test</script>")
        assert "&lt;" in result
        assert "&gt;" in result
        assert "&amp;" in result
        assert "&#x27;" in result

    def test_none_returns_empty_string(self):
        """None input returns empty string."""
        assert safe_html_escape(None) == ""

    def test_empty_string_unchanged(self):
        """Empty string returns empty string."""
        assert safe_html_escape("") == ""

    def test_normal_text_unchanged(self):
        """Normal text without special chars is unchanged."""
        text = "Hello World 123"
        assert safe_html_escape(text) == text

    def test_unicode_preserved(self):
        """Unicode characters are preserved."""
        text = "Hello 世界 مرحبا"
        result = safe_html_escape(text)
        assert "世界" in result
        assert "مرحبا" in result

    def test_numeric_input_converted(self):
        """Numeric input is converted to string."""
        assert safe_html_escape(123) == "123"
        assert safe_html_escape(99.99) == "99.99"


class TestSafeUrl:
    """Unit tests for safe_url function."""

    def test_blocks_javascript_scheme(self):
        """JavaScript URLs are blocked."""
        assert safe_url("javascript:alert('xss')") == ""

    def test_blocks_javascript_case_variations(self):
        """JavaScript detection is case-insensitive."""
        assert safe_url("JAVASCRIPT:alert('xss')") == ""
        assert safe_url("JavaScript:alert('xss')") == ""
        assert safe_url("jAvAsCrIpT:alert('xss')") == ""

    def test_blocks_data_scheme(self):
        """Data URLs are blocked."""
        assert safe_url("data:text/html,<script>xss</script>") == ""

    def test_blocks_vbscript_scheme(self):
        """VBScript URLs are blocked."""
        assert safe_url("vbscript:msgbox('xss')") == ""

    def test_allows_https(self):
        """HTTPS URLs are allowed."""
        url = "https://example.com/path"
        assert safe_url(url) == url

    def test_allows_http(self):
        """HTTP URLs are allowed."""
        url = "http://example.com/path"
        assert safe_url(url) == url

    def test_allows_mailto(self):
        """Mailto URLs are allowed."""
        url = "mailto:test@example.com"
        assert "mailto:" in safe_url(url)

    def test_escapes_html_in_url(self):
        """HTML characters in URLs are escaped."""
        url = "https://example.com?name=<script>"
        result = safe_url(url)
        assert "&lt;script&gt;" in result
        assert "<script>" not in result

    def test_none_returns_empty(self):
        """None returns empty string."""
        assert safe_url(None) == ""

    def test_empty_returns_empty(self):
        """Empty string returns empty string."""
        assert safe_url("") == ""

    def test_whitespace_trimmed(self):
        """Whitespace is trimmed."""
        url = "  https://example.com  "
        result = safe_url(url)
        assert result.startswith("https://")


class TestSafeEmailContent:
    """Unit tests for safe_email_content function."""

    def test_basic_substitution(self):
        """Basic placeholder substitution works."""
        template = "<p>Hello {name}!</p>"
        context = {"name": "John"}
        result = safe_email_content(template, context)
        assert result == "<p>Hello John!</p>"

    def test_escapes_dangerous_content(self):
        """Dangerous content is escaped."""
        template = "<p>{content}</p>"
        context = {"content": "<script>xss</script>"}
        result = safe_email_content(template, context)
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_multiple_placeholders(self):
        """Multiple placeholders are all escaped."""
        template = "<p>{a} and {b}</p>"
        context = {"a": "<script>1</script>", "b": "<script>2</script>"}
        result = safe_email_content(template, context)
        assert result.count("&lt;script&gt;") == 2

    def test_url_key_sanitized(self):
        """Keys containing 'url' are sanitized as URLs."""
        template = '<a href="{invitation_url}">Link</a>'
        context = {"invitation_url": "javascript:alert('xss')"}
        result = safe_email_content(template, context)
        assert "javascript:" not in result

    def test_valid_url_preserved(self):
        """Valid URLs are preserved."""
        template = '<a href="{link}">Click</a>'
        context = {"link": "https://example.com/path"}
        result = safe_email_content(template, context)
        assert "https://example.com/path" in result

    def test_none_values_become_empty(self):
        """None values become empty strings."""
        template = "<p>{name}</p>"
        context = {"name": None}
        result = safe_email_content(template, context)
        assert result == "<p></p>"

    def test_escape_urls_disabled(self):
        """URL escaping can be disabled."""
        template = '<a href="{custom_url}">Link</a>'
        context = {"custom_url": "custom://protocol"}
        result = safe_email_content(template, context, escape_urls=False)
        assert "custom://protocol" in result


class TestSanitizeEmailTemplateData:
    """Unit tests for sanitize_email_template_data function."""

    def test_all_values_escaped(self):
        """All string values are HTML-escaped."""
        data = {"name": "<b>Bold</b>", "message": "<script>xss</script>"}
        result = sanitize_email_template_data(data)
        assert "&lt;b&gt;" in result["name"]
        assert "&lt;script&gt;" in result["message"]

    def test_url_keys_sanitized(self):
        """URL-like keys get URL sanitization."""
        data = {"invitation_url": "javascript:alert(1)"}
        result = sanitize_email_template_data(data)
        assert result["invitation_url"] == ""

    def test_numeric_values_stringified(self):
        """Numeric values are converted to strings."""
        data = {"count": 5}
        result = sanitize_email_template_data(data)
        assert result["count"] == "5"

    def test_none_becomes_empty(self):
        """None values become empty strings."""
        data = {"optional": None}
        result = sanitize_email_template_data(data)
        assert result["optional"] == ""


class TestValidateEmailRecipientName:
    """Unit tests for validate_email_recipient_name function."""

    def test_valid_name_returned(self):
        """Valid name is returned unchanged."""
        assert validate_email_recipient_name("John Doe") == "John Doe"

    def test_whitespace_stripped(self):
        """Leading/trailing whitespace is stripped."""
        assert validate_email_recipient_name("  John  ") == "John"

    def test_empty_raises_error(self):
        """Empty name raises ValueError."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_email_recipient_name("")

    def test_whitespace_only_raises_error(self):
        """Whitespace-only name raises ValueError."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_email_recipient_name("   ")

    def test_control_chars_removed(self):
        """Control characters are removed."""
        result = validate_email_recipient_name("John\x00Doe")
        assert "\x00" not in result
        assert "JohnDoe" == result

    def test_max_length_enforced(self):
        """Name is truncated to max length."""
        long_name = "A" * 300
        result = validate_email_recipient_name(long_name, max_length=100)
        assert len(result) == 100


class TestIsSafeRedirectUrl:
    """Unit tests for is_safe_redirect_url function."""

    def test_relative_url_safe(self):
        """Relative URLs are safe."""
        assert is_safe_redirect_url("/dashboard") is True
        assert is_safe_redirect_url("/path/to/page") is True

    def test_protocol_relative_blocked(self):
        """Protocol-relative URLs are blocked."""
        assert is_safe_redirect_url("//evil.com/path") is False

    def test_absolute_url_blocked_by_default(self):
        """Absolute URLs blocked without allowed hosts."""
        assert is_safe_redirect_url("https://example.com") is False

    def test_absolute_url_allowed_with_host(self):
        """Absolute URLs allowed when host is in list."""
        assert is_safe_redirect_url(
            "https://example.com",
            allowed_hosts=["example.com"]
        ) is True

    def test_javascript_url_blocked(self):
        """JavaScript URLs are blocked."""
        assert is_safe_redirect_url("javascript:alert(1)") is False

    def test_empty_url_blocked(self):
        """Empty URLs are blocked."""
        assert is_safe_redirect_url("") is False
        assert is_safe_redirect_url(None) is False

    def test_case_insensitive_host_matching(self):
        """Host matching is case-insensitive."""
        assert is_safe_redirect_url(
            "https://EXAMPLE.COM/path",
            allowed_hosts=["example.com"]
        ) is True
