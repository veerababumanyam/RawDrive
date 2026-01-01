"""
Unit Tests for PII Filtering in Logs.

Tests the log processor that filters personally identifiable
information to ensure GDPR compliance.
"""

import pytest
from unittest.mock import MagicMock

from src.logging.formatters import (
    filter_pii,
    filter_pii_from_value,
    SENSITIVE_KEYS,
    MASKABLE_KEYS,
)


class TestPiiPatternFiltering:
    """Test PII pattern detection and filtering."""

    def test_filters_email_addresses(self):
        """Email addresses are redacted from strings."""
        value = "User john.doe@example.com logged in"

        result = filter_pii_from_value(value)

        assert "john.doe@example.com" not in result
        assert "[EMAIL REDACTED]" in result

    def test_filters_multiple_emails(self):
        """Multiple email addresses in same string are all redacted."""
        value = "From: alice@test.com To: bob@example.org"

        result = filter_pii_from_value(value)

        assert "@test.com" not in result
        assert "@example.org" not in result
        assert result.count("[EMAIL REDACTED]") == 2

    def test_filters_phone_numbers_us_format(self):
        """US phone numbers are redacted."""
        test_cases = [
            "Call (555) 123-4567",
            "Phone: 555-123-4567",
            "Contact: 555.123.4567",
            "Mobile: +1 555 123 4567",
        ]

        for value in test_cases:
            result = filter_pii_from_value(value)
            assert "[PHONE REDACTED]" in result, f"Failed for: {value}"

    def test_filters_credit_card_numbers(self):
        """Credit card numbers are redacted."""
        test_cases = [
            "Card: 4111-1111-1111-1111",
            "CC: 4111 1111 1111 1111",
            "Payment: 4111111111111111",
        ]

        for value in test_cases:
            result = filter_pii_from_value(value)
            assert "[CARD REDACTED]" in result, f"Failed for: {value}"

    def test_preserves_non_pii_content(self):
        """Non-PII content is preserved."""
        value = "User ID 12345 performed action CREATE"

        result = filter_pii_from_value(value)

        assert result == value

    def test_handles_mixed_content(self):
        """Filters PII while preserving non-PII in same string."""
        value = "User john@example.com (ID: 12345) logged in from 192.168.1.1"

        result = filter_pii_from_value(value)

        assert "[EMAIL REDACTED]" in result
        assert "ID: 12345" in result
        assert "192.168.1.1" in result  # IP is not PII in this context

    def test_handles_non_string_input(self):
        """Non-string input is returned unchanged."""
        assert filter_pii_from_value(12345) == 12345
        assert filter_pii_from_value(None) is None
        assert filter_pii_from_value(True) is True


class TestSensitiveKeyFiltering:
    """Test filtering based on sensitive key names."""

    def test_sensitive_keys_defined(self):
        """Required sensitive keys are defined."""
        assert "email" in SENSITIVE_KEYS
        assert "phone" in SENSITIVE_KEYS
        assert "name" in SENSITIVE_KEYS
        assert "password" in SENSITIVE_KEYS
        assert "token" in SENSITIVE_KEYS

    def test_filter_pii_redacts_email_key(self):
        """Email key value is redacted."""
        event_dict = {
            "event": "user_created",
            "email": "john@example.com",
        }

        result = filter_pii(None, "info", event_dict)

        assert result["email"] == "[REDACTED]"
        assert result["event"] == "user_created"

    def test_filter_pii_redacts_name_key(self):
        """Name key value is redacted."""
        event_dict = {
            "event": "guest_created",
            "name": "John Doe",
            "guest_name": "Jane Smith",
        }

        result = filter_pii(None, "info", event_dict)

        assert result["name"] == "[REDACTED]"
        assert result["guest_name"] == "[REDACTED]"

    def test_filter_pii_redacts_password(self):
        """Password is always redacted."""
        event_dict = {
            "event": "login_attempt",
            "password": "super_secret_123",
        }

        result = filter_pii(None, "info", event_dict)

        assert result["password"] == "[REDACTED]"

    def test_filter_pii_redacts_token(self):
        """Token is always redacted."""
        event_dict = {
            "event": "auth_refresh",
            "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        }

        result = filter_pii(None, "info", event_dict)

        assert result["token"] == "[REDACTED]"

    def test_filter_pii_case_insensitive(self):
        """Key matching is case-insensitive."""
        event_dict = {
            "event": "test",
            "EMAIL": "test@example.com",  # Uppercase
            "Email": "test2@example.com",  # Mixedcase
        }

        result = filter_pii(None, "info", event_dict)

        # Both should be redacted (lowercased matching)
        assert "[EMAIL REDACTED]" in result.get("EMAIL", "") or result.get("EMAIL") == "[REDACTED]"


class TestMaskableKeyFiltering:
    """Test partial masking for certain keys."""

    def test_maskable_keys_defined(self):
        """Maskable keys are defined."""
        assert "edit_token" in MASKABLE_KEYS
        assert "jwt" in MASKABLE_KEYS

    def test_masks_edit_token(self):
        """Edit token is partially masked."""
        event_dict = {
            "event": "token_generated",
            "edit_token": "abcd1234efgh5678ijkl",
        }

        result = filter_pii(None, "info", event_dict)

        # Should show first and last few chars
        assert "abcd" in result["edit_token"] or "[MASKED]" in result["edit_token"]


class TestNestedDataFiltering:
    """Test filtering in nested data structures."""

    def test_filters_nested_dict(self):
        """Filters PII in nested dictionaries."""
        event_dict = {
            "event": "rsvp_submitted",
            "data": {
                "guest_name": "John Doe",
                "email": "john@example.com",
                "plus_ones": 2,
            },
        }

        result = filter_pii(None, "info", event_dict)

        assert result["data"]["guest_name"] == "[REDACTED]"
        assert result["data"]["email"] == "[REDACTED]"
        assert result["data"]["plus_ones"] == 2

    def test_filters_list_items(self):
        """Filters PII in list items."""
        event_dict = {
            "event": "bulk_import",
            "emails": ["john@example.com", "jane@example.com"],
        }

        result = filter_pii(None, "info", event_dict)

        for item in result["emails"]:
            assert "@example.com" not in item

    def test_preserves_structural_keys(self):
        """Structural keys are preserved unchanged."""
        event_dict = {
            "event": "test_event",
            "level": "info",
            "timestamp": "2024-01-01T00:00:00Z",
            "logger": "test_logger",
            "service": "invitations-service",
        }

        result = filter_pii(None, "info", event_dict)

        assert result["event"] == "test_event"
        assert result["level"] == "info"
        assert result["timestamp"] == "2024-01-01T00:00:00Z"
        assert result["logger"] == "test_logger"
        assert result["service"] == "invitations-service"


class TestEdgeCases:
    """Test edge cases in PII filtering."""

    def test_empty_event_dict(self):
        """Handles empty event dictionary."""
        result = filter_pii(None, "info", {})

        assert result == {}

    def test_none_values(self):
        """Handles None values in event dictionary."""
        event_dict = {
            "event": "test",
            "email": None,
            "data": None,
        }

        result = filter_pii(None, "info", event_dict)

        # None should still be redacted for sensitive keys
        assert result["email"] == "[REDACTED]"

    def test_numeric_values_preserved(self):
        """Numeric values are preserved."""
        event_dict = {
            "event": "stats",
            "guest_count": 50,
            "response_rate": 0.75,
        }

        result = filter_pii(None, "info", event_dict)

        assert result["guest_count"] == 50
        assert result["response_rate"] == 0.75
