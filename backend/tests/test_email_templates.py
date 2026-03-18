"""Tests for email templates including gallery delivery.

Verifies that all required email types exist, have template configs,
and render proper HTML with XSS prevention via html.escape.
"""

import html
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# We need to import EmailService and EmailType from the backend.
# The backend app may require certain env/config; we mock what's needed.
# ---------------------------------------------------------------------------


@pytest.fixture
def email_service():
    """Create an EmailService instance for testing."""
    from app.services.email_service import EmailService
    return EmailService()


@pytest.fixture
def email_type_cls():
    """Return the EmailType enum class."""
    from app.services.email_service import EmailType
    return EmailType


# ---------------------------------------------------------------------------
# Test 1: send_gallery_delivery_email renders HTML with required fields
# ---------------------------------------------------------------------------


class TestGalleryDeliveryTemplate:
    @pytest.mark.asyncio
    async def test_renders_html_with_gallery_name_and_photographer(self, email_service):
        """send_gallery_delivery_email must render HTML containing
        gallery_name, photographer_name, and magic_link_url."""
        with patch.object(email_service, "send_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = MagicMock(
                success=True, message_id="test-1", provider="postal"
            )

            await email_service.send_gallery_delivery_email(
                to_email="client@example.com",
                gallery_name="Summer Wedding",
                photographer_name="Jane Doe",
                magic_link_url="https://app.rawdrive.in/g/abc123",
            )

            mock_send.assert_called_once()
            call_kwargs = mock_send.call_args[1]

            # Verify HTML content contains the key fields
            html_content = call_kwargs["html_content"]
            assert "Summer Wedding" in html_content
            assert "Jane Doe" in html_content
            assert "https://app.rawdrive.in/g/abc123" in html_content
            assert "View Gallery" in html_content


# ---------------------------------------------------------------------------
# Test 2: send_gallery_delivery_email renders plain text fallback
# ---------------------------------------------------------------------------


    @pytest.mark.asyncio
    async def test_renders_plain_text_fallback(self, email_service):
        """Gallery delivery email must include a plain text fallback."""
        with patch.object(email_service, "send_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = MagicMock(
                success=True, message_id="test-2", provider="postal"
            )

            await email_service.send_gallery_delivery_email(
                to_email="client@example.com",
                gallery_name="Summer Wedding",
                photographer_name="Jane Doe",
                magic_link_url="https://app.rawdrive.in/g/abc123",
            )

            call_kwargs = mock_send.call_args[1]
            text_content = call_kwargs["text_content"]
            assert "Summer Wedding" in text_content
            assert "Jane Doe" in text_content
            assert "https://app.rawdrive.in/g/abc123" in text_content


# ---------------------------------------------------------------------------
# Test 3: GALLERY_DELIVERY EmailType exists in enum
# ---------------------------------------------------------------------------


class TestEmailTypeEnum:
    def test_gallery_delivery_type_exists(self, email_type_cls):
        """GALLERY_DELIVERY must be a valid EmailType enum value."""
        assert hasattr(email_type_cls, "GALLERY_DELIVERY")
        assert email_type_cls.GALLERY_DELIVERY.value == "gallery_delivery"


# ---------------------------------------------------------------------------
# Test 4: All 5 email types have TEMPLATES entries
# ---------------------------------------------------------------------------


    def test_all_email_types_have_templates(self, email_service, email_type_cls):
        """All required email types must have entries in TEMPLATES dict."""
        required_types = [
            email_type_cls.VERIFICATION,
            email_type_cls.PASSWORD_RESET,
            email_type_cls.INVITATION,
            email_type_cls.WELCOME,
            email_type_cls.GALLERY_DELIVERY,
        ]
        for etype in required_types:
            assert etype in email_service.TEMPLATES, (
                f"{etype.value} missing from EmailService.TEMPLATES"
            )
            assert "subject" in email_service.TEMPLATES[etype], (
                f"{etype.value} template missing 'subject' key"
            )


# ---------------------------------------------------------------------------
# Test 5: Templates use html.escape for user-provided variables (XSS)
# ---------------------------------------------------------------------------


class TestXSSPrevention:
    @pytest.mark.asyncio
    async def test_gallery_delivery_escapes_user_data(self, email_service):
        """Gallery delivery template must html.escape user-provided fields."""
        xss_payload = '<script>alert("xss")</script>'
        escaped = html.escape(xss_payload)

        with patch.object(email_service, "send_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = MagicMock(
                success=True, message_id="test-xss", provider="postal"
            )

            await email_service.send_gallery_delivery_email(
                to_email="client@example.com",
                gallery_name=xss_payload,
                photographer_name=xss_payload,
                magic_link_url="https://app.rawdrive.in/g/abc123",
                message=xss_payload,
            )

            call_kwargs = mock_send.call_args[1]
            html_content = call_kwargs["html_content"]

            # Raw XSS must NOT appear in HTML
            assert "<script>" not in html_content
            # Escaped version must appear
            assert escaped in html_content
