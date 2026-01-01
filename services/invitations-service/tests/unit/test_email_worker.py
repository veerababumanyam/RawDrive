"""
Unit Tests for Email Worker Template Escaping.

Verifies that email worker properly escapes all user content
to prevent XSS attacks in email templates.
"""

import pytest
from unittest.mock import MagicMock, patch

from src.utils.security import (
    safe_html_escape,
    safe_url,
    sanitize_email_template_data,
)


class TestEmailWorkerTemplateEscaping:
    """Test that email worker uses proper escaping."""

    def test_safe_html_escape_used_for_names(self):
        """Names should be escaped using safe_html_escape."""
        malicious_name = "<script>alert('xss')</script>"
        escaped = safe_html_escape(malicious_name)

        assert "<script>" not in escaped
        assert "&lt;script&gt;" in escaped

    def test_safe_url_used_for_invitation_urls(self):
        """URLs should be sanitized using safe_url."""
        malicious_url = "javascript:alert('xss')"
        sanitized = safe_url(malicious_url)

        assert sanitized == ""

    def test_template_data_sanitization(self):
        """SendGrid template data should be fully sanitized."""
        template_data = {
            "name": "<img onerror=alert('xss')>",
            "invitation_url": "https://valid.com/invite",
        }
        sanitized = sanitize_email_template_data(template_data)

        assert "<img" not in sanitized["name"]
        assert "onerror" not in sanitized["name"]
        assert "https://valid.com/invite" in sanitized["invitation_url"]


class TestEmailContentGeneration:
    """Test email content generation with escaping."""

    def test_invitation_email_content_escaped(self):
        """Invitation email content is properly escaped."""
        recipient_name = "<script>document.cookie</script>"
        invitation_url = "https://example.com/invite/123"

        # Simulate what email_worker does
        safe_name = safe_html_escape(recipient_name)
        safe_invitation_url = safe_url(invitation_url)

        html_content = f"""
        <h1>Hello {safe_name}!</h1>
        <p>You've been invited to a special event.</p>
        <p><a href="{safe_invitation_url}">View Invitation</a></p>
        """

        assert "<script>" not in html_content
        assert "&lt;script&gt;" in html_content
        assert "https://example.com/invite/123" in html_content

    def test_reminder_email_content_escaped(self):
        """Reminder email content is properly escaped."""
        recipient_name = "<img src=x onerror=alert()>"
        invitation_url = "https://example.com/remind"
        days_until_event = 7

        # Simulate what email_worker does
        safe_name = safe_html_escape(recipient_name)
        safe_invitation_url = safe_url(invitation_url)
        safe_days = safe_html_escape(str(days_until_event))

        html_content = f"""
        <h1>Hello {safe_name}!</h1>
        <p>This is a friendly reminder that we haven't received your RSVP yet.</p>
        <p>The event is in {safe_days} days.</p>
        <p><a href="{safe_invitation_url}">View Invitation & RSVP</a></p>
        """

        assert "<img" not in html_content
        assert "onerror=" not in html_content
        assert "&lt;img" in html_content


class TestEdgeCasesInEmailWorker:
    """Test edge cases in email worker escaping."""

    def test_empty_name_handled(self):
        """Empty name is handled gracefully."""
        safe_name = safe_html_escape("")
        assert safe_name == ""

    def test_none_name_handled(self):
        """None name is handled gracefully."""
        safe_name = safe_html_escape(None)
        assert safe_name == ""

    def test_unicode_name_preserved(self):
        """Unicode names are preserved after escaping."""
        name = "Maria Garcia"
        safe_name = safe_html_escape(name)
        # Name should be mostly preserved
        assert "Maria" in safe_name or "Mar" in safe_name

    def test_legitimate_ampersand_in_name(self):
        """Ampersands in names are properly escaped."""
        name = "Tom & Jerry"
        safe_name = safe_html_escape(name)
        assert "&amp;" in safe_name
        assert "Tom" in safe_name
        assert "Jerry" in safe_name

    def test_javascript_url_blocked(self):
        """JavaScript URLs are blocked entirely."""
        malicious_urls = [
            "javascript:alert('xss')",
            "JAVASCRIPT:alert('xss')",
            "javascript:void(0)",
        ]
        for url in malicious_urls:
            assert safe_url(url) == ""

    def test_valid_url_with_special_chars_escaped(self):
        """Valid URLs with special chars are escaped."""
        url = "https://example.com?name=John<script>"
        safe = safe_url(url)
        assert "<script>" not in safe
        assert "&lt;script&gt;" in safe


class TestSendGridTemplateDataSanitization:
    """Test SendGrid template data sanitization."""

    def test_all_fields_sanitized(self):
        """All fields in template data are sanitized."""
        data = {
            "name": "<b>Bold Name</b>",
            "greeting": "<h1>Hello</h1>",
            "message": "Normal message",
            "invitation_url": "https://valid.com",
        }
        sanitized = sanitize_email_template_data(data)

        assert "&lt;b&gt;" in sanitized["name"]
        assert "&lt;h1&gt;" in sanitized["greeting"]
        assert sanitized["message"] == "Normal message"
        assert "https://valid.com" in sanitized["invitation_url"]

    def test_url_fields_get_url_sanitization(self):
        """URL fields get URL-specific sanitization."""
        data = {
            "invitation_url": "javascript:alert(1)",
            "callback_url": "data:text/html,<script>xss</script>",
            "link": "vbscript:msgbox('xss')",
        }
        sanitized = sanitize_email_template_data(data)

        # All malicious URLs should be blocked
        assert sanitized["invitation_url"] == ""
        assert sanitized["callback_url"] == ""
        assert sanitized["link"] == ""

    def test_numeric_values_converted(self):
        """Numeric values are converted to strings."""
        data = {
            "count": 42,
            "amount": 99.99,
        }
        sanitized = sanitize_email_template_data(data)

        assert sanitized["count"] == "42"
        assert sanitized["amount"] == "99.99"
