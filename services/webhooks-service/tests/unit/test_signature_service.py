"""
Unit tests for the Webhook Signature Service.
Tests HMAC-SHA256 signing and verification.
"""

import time
import pytest
from src.services.signature_service import WebhookSignatureService


class TestWebhookSignatureService:
    """Test suite for signature service."""

    @pytest.fixture
    def service(self):
        """Create signature service instance."""
        return WebhookSignatureService()

    @pytest.fixture
    def test_secret(self):
        """Test secret key."""
        return "test_secret_key_123"

    @pytest.fixture
    def test_payload(self):
        """Test webhook payload."""
        return b'{"event": "test.event", "data": {"id": "123"}}'

    def test_generate_secret(self, service):
        """Test secret generation produces valid hex string."""
        secret = service.generate_secret()

        assert secret is not None
        assert len(secret) == 64  # 32 bytes = 64 hex chars
        assert all(c in '0123456789abcdef' for c in secret)

    def test_generate_secret_unique(self, service):
        """Test that generated secrets are unique."""
        secrets = [service.generate_secret() for _ in range(100)]
        assert len(set(secrets)) == 100

    def test_generate_signature_format(self, service, test_payload, test_secret):
        """Test signature format is correct."""
        timestamp = int(time.time())
        signature = service.generate_signature(test_payload, test_secret, timestamp)

        assert signature.startswith(f"t={timestamp},v1=")
        parts = signature.split(",")
        assert len(parts) == 2
        assert parts[0].startswith("t=")
        assert parts[1].startswith("v1=")

    def test_generate_signature_deterministic(self, service, test_payload, test_secret):
        """Test same inputs produce same signature."""
        timestamp = 1700000000

        sig1 = service.generate_signature(test_payload, test_secret, timestamp)
        sig2 = service.generate_signature(test_payload, test_secret, timestamp)

        assert sig1 == sig2

    def test_generate_signature_different_secrets(self, service, test_payload):
        """Test different secrets produce different signatures."""
        timestamp = int(time.time())

        sig1 = service.generate_signature(test_payload, "secret1", timestamp)
        sig2 = service.generate_signature(test_payload, "secret2", timestamp)

        assert sig1 != sig2

    def test_generate_signature_different_payloads(self, service, test_secret):
        """Test different payloads produce different signatures."""
        timestamp = int(time.time())

        sig1 = service.generate_signature(b'payload1', test_secret, timestamp)
        sig2 = service.generate_signature(b'payload2', test_secret, timestamp)

        assert sig1 != sig2

    def test_generate_signature_different_timestamps(self, service, test_payload, test_secret):
        """Test different timestamps produce different signatures."""
        sig1 = service.generate_signature(test_payload, test_secret, 1700000000)
        sig2 = service.generate_signature(test_payload, test_secret, 1700000001)

        assert sig1 != sig2

    def test_verify_signature_valid(self, service, test_payload, test_secret):
        """Test verification of valid signature."""
        timestamp = int(time.time())
        signature = service.generate_signature(test_payload, test_secret, timestamp)

        is_valid, message = service.verify_signature(test_payload, signature, test_secret)

        assert is_valid is True
        assert message == "valid"

    def test_verify_signature_invalid_format(self, service, test_payload, test_secret):
        """Test verification fails for invalid signature format."""
        is_valid, message = service.verify_signature(
            test_payload, "invalid_signature", test_secret
        )

        assert is_valid is False
        assert "invalid format" in message.lower()

    def test_verify_signature_expired(self, service, test_payload, test_secret):
        """Test verification fails for expired timestamp."""
        old_timestamp = int(time.time()) - 400  # More than 5 minutes ago
        signature = service.generate_signature(test_payload, test_secret, old_timestamp)

        is_valid, message = service.verify_signature(test_payload, signature, test_secret)

        assert is_valid is False
        assert "timestamp" in message.lower() or "expired" in message.lower()

    def test_verify_signature_wrong_secret(self, service, test_payload, test_secret):
        """Test verification fails with wrong secret."""
        timestamp = int(time.time())
        signature = service.generate_signature(test_payload, test_secret, timestamp)

        is_valid, message = service.verify_signature(
            test_payload, signature, "wrong_secret"
        )

        assert is_valid is False
        assert "mismatch" in message.lower() or "invalid" in message.lower()

    def test_verify_signature_tampered_payload(self, service, test_payload, test_secret):
        """Test verification fails if payload is tampered."""
        timestamp = int(time.time())
        signature = service.generate_signature(test_payload, test_secret, timestamp)

        tampered_payload = b'{"event": "test.event", "data": {"id": "456"}}'
        is_valid, message = service.verify_signature(
            tampered_payload, signature, test_secret
        )

        assert is_valid is False

    def test_verify_signature_tampered_timestamp(self, service, test_payload, test_secret):
        """Test verification fails if timestamp in signature is tampered."""
        timestamp = int(time.time())
        signature = service.generate_signature(test_payload, test_secret, timestamp)

        # Tamper with the timestamp in signature
        tampered_signature = signature.replace(f"t={timestamp}", f"t={timestamp + 1}")

        is_valid, message = service.verify_signature(
            test_payload, tampered_signature, test_secret
        )

        assert is_valid is False

    def test_headers(self, service):
        """Test that header constants are defined."""
        assert hasattr(service, 'SIGNATURE_HEADER')
        assert hasattr(service, 'TIMESTAMP_HEADER')
        assert service.SIGNATURE_HEADER == "X-RawDrive-Signature"
        assert service.TIMESTAMP_HEADER == "X-RawDrive-Timestamp"
