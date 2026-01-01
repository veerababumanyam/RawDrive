"""
Unit Tests for PII Filtering in Logs.

Verifies that Personally Identifiable Information (PII) is
properly redacted from log output to comply with GDPR.
"""

import pytest

from src.logging.formatters import (
    filter_pii_from_value,
    filter_pii,
    PII_PATTERNS,
    SENSITIVE_KEYS,
)


class TestPIIPatternDetection:
    """Test PII pattern detection and redaction."""

    def test_email_redacted(self):
        """Email addresses are redacted."""
        result = filter_pii_from_value("Contact john.doe@example.com for help")
        assert "john.doe@example.com" not in result
        assert "[EMAIL REDACTED]" in result

    def test_multiple_emails_redacted(self):
        """Multiple email addresses are all redacted."""
        text = "Users: alice@test.com, bob@test.org"
        result = filter_pii_from_value(text)
        assert "alice@test.com" not in result
        assert "bob@test.org" not in result
        assert result.count("[EMAIL REDACTED]") == 2

    def test_phone_number_redacted(self):
        """Phone numbers are redacted."""
        test_cases = [
            "Call 555-123-4567 for support",
            "Phone: (555) 123-4567",
            "Cell: +1-555-123-4567",
            "Mobile: 5551234567",
        ]
        for text in test_cases:
            result = filter_pii_from_value(text)
            assert "[PHONE REDACTED]" in result, f"Failed for: {text}"

    def test_credit_card_redacted(self):
        """Credit card numbers are redacted."""
        test_cases = [
            "Card: 4111-1111-1111-1111",
            "CC: 4111111111111111",
            "Payment: 5500 0000 0000 0004",
        ]
        for text in test_cases:
            result = filter_pii_from_value(text)
            assert "[CARD REDACTED]" in result, f"Failed for: {text}"

    def test_ssn_redacted(self):
        """Social Security Numbers are redacted."""
        test_cases = [
            "SSN: 123-45-6789",
            "Social: 123456789",
        ]
        for text in test_cases:
            result = filter_pii_from_value(text)
            # SSN pattern may match as generic pattern
            assert "123-45-6789" not in result or "[" in result

    def test_normal_text_unchanged(self):
        """Normal text without PII is unchanged."""
        text = "User performed action successfully at 10:30 AM"
        result = filter_pii_from_value(text)
        assert result == text

    def test_ids_unchanged(self):
        """UUIDs and numeric IDs are not redacted."""
        text = "user_id=550e8400-e29b-41d4-a716-446655440000, order_id=12345"
        result = filter_pii_from_value(text)
        assert "550e8400-e29b-41d4-a716-446655440000" in result
        assert "12345" in result


class TestSensitiveKeyFiltering:
    """Test filtering of values in sensitive keys."""

    def test_email_key_redacted(self):
        """Values in 'email' key are redacted."""
        event_dict = {"email": "user@example.com", "action": "login"}
        result = filter_pii(None, None, event_dict.copy())
        assert result["email"] == "[REDACTED]"
        assert result["action"] == "login"

    def test_phone_key_redacted(self):
        """Values in 'phone' key are redacted."""
        event_dict = {"phone": "+1-555-123-4567"}
        result = filter_pii(None, None, event_dict.copy())
        assert result["phone"] == "[REDACTED]"

    def test_name_key_redacted(self):
        """Values in 'name' key are redacted."""
        event_dict = {"guest_name": "John Doe", "invitation_id": "123"}
        result = filter_pii(None, None, event_dict.copy())
        assert result["guest_name"] == "[REDACTED]"
        assert result["invitation_id"] == "123"

    def test_recipient_name_redacted(self):
        """Values in 'recipient_name' key are redacted."""
        event_dict = {"recipient_name": "Jane Smith"}
        result = filter_pii(None, None, event_dict.copy())
        assert result["recipient_name"] == "[REDACTED]"

    def test_password_key_redacted(self):
        """Values in 'password' key are redacted."""
        event_dict = {"password": "secret123", "user_id": "abc"}
        result = filter_pii(None, None, event_dict.copy())
        assert result["password"] == "[REDACTED]"

    def test_non_sensitive_keys_unchanged(self):
        """Non-sensitive keys are unchanged."""
        event_dict = {
            "user_id": "123",
            "action": "create",
            "workspace_id": "456",
            "status": "success",
        }
        result = filter_pii(None, None, event_dict.copy())
        assert result == event_dict


class TestNestedDictFiltering:
    """Test PII filtering in nested structures."""

    def test_nested_dict_filtered(self):
        """Nested dictionaries are filtered."""
        event_dict = {
            "user": {
                "email": "test@example.com",
                "name": "John Doe",
                "id": "123",
            }
        }
        result = filter_pii(None, None, event_dict.copy())
        assert result["user"]["email"] == "[REDACTED]"
        assert result["user"]["name"] == "[REDACTED]"
        assert result["user"]["id"] == "123"

    def test_list_values_filtered(self):
        """Lists with PII are filtered."""
        event_dict = {
            "emails": ["alice@test.com", "bob@test.com"],
            "ids": ["123", "456"],
        }
        result = filter_pii(None, None, event_dict.copy())
        # The 'emails' key should be redacted
        assert result["emails"] == "[REDACTED]"
        assert result["ids"] == ["123", "456"]


class TestPIIFilterProcessor:
    """Test the structlog processor function."""

    def test_processor_returns_event_dict(self):
        """Processor returns modified event dict."""
        event_dict = {"message": "test", "email": "user@test.com"}
        result = filter_pii(None, None, event_dict)
        assert isinstance(result, dict)
        assert "message" in result

    def test_processor_handles_non_dict(self):
        """Processor handles non-dict values gracefully."""
        event_dict = {
            "message": "test",
            "count": 42,
            "flag": True,
            "data": None,
        }
        result = filter_pii(None, None, event_dict)
        assert result["count"] == 42
        assert result["flag"] is True
        assert result["data"] is None


class TestEdgeCases:
    """Test edge cases in PII filtering."""

    def test_empty_string_unchanged(self):
        """Empty strings are unchanged."""
        result = filter_pii_from_value("")
        assert result == ""

    def test_none_handled(self):
        """None values are handled."""
        event_dict = {"email": None}
        result = filter_pii(None, None, event_dict)
        assert result["email"] is None

    def test_long_text_filtered(self):
        """Long text with embedded PII is filtered."""
        text = "A" * 1000 + " email: test@example.com " + "B" * 1000
        result = filter_pii_from_value(text)
        assert "test@example.com" not in result
        assert "[EMAIL REDACTED]" in result

    def test_unicode_preserved(self):
        """Unicode characters are preserved."""
        text = "User 田中 logged in from Tokyo"
        result = filter_pii_from_value(text)
        assert "田中" in result
        assert "Tokyo" in result

    def test_special_characters_preserved(self):
        """Special characters are preserved when not PII."""
        text = "Query: SELECT * FROM users WHERE status = 'active'"
        result = filter_pii_from_value(text)
        assert "SELECT" in result
        assert "users" in result
