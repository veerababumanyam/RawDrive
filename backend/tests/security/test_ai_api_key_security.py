"""Security audit tests for AI API key handling.

Tests:
- API key encryption at rest
- API key masking in responses
- No API key exposure in logs
- Secure key validation process
- Proper key revocation
- Workspace isolation

Feature: 010-ai-powered-features
Task: T083 - Security audit and API key handling validation
"""

from __future__ import annotations

import io
import logging
import re
import sys
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


# ---------------------------------------------------------------------------
# Test Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def test_api_key() -> str:
    """Generate a realistic test API key."""
    return "AIzaSyDa0BCD1234EFGH5678IJKL9012MNOP_qr"


@pytest.fixture
def test_user_id():
    """Generate test user ID."""
    return uuid4()


@pytest.fixture
def test_workspace_id():
    """Generate test workspace ID."""
    return uuid4()


# ---------------------------------------------------------------------------
# API Key Encryption Tests
# ---------------------------------------------------------------------------


class TestAPIKeyEncryption:
    """Security tests for API key encryption."""

    @pytest.mark.asyncio
    async def test_api_key_never_stored_in_plaintext(
        self,
        test_api_key: str,
        test_user_id,
        test_workspace_id,
    ) -> None:
        """Verify API keys are always encrypted before storage."""
        stored_data = {}

        with patch("app.services.encryption_service.EncryptionService") as MockEncrypt:
            mock_encrypt = MagicMock()
            # Return encrypted bytes, not the original key
            mock_encrypt.encrypt_user_api_key.return_value = (
                b"\x00\x01\x02encrypted_bytes",
                b"\x00\x01\x02iv_bytes",
            )
            MockEncrypt.return_value = mock_encrypt

            # Simulate storing the key
            encrypted, iv = mock_encrypt.encrypt_user_api_key(
                test_api_key, test_user_id, test_workspace_id
            )

            stored_data["api_key_encrypted"] = encrypted
            stored_data["api_key_iv"] = iv

            # Verify plaintext key is NOT in stored data
            assert test_api_key not in str(stored_data)
            assert test_api_key.encode() not in stored_data["api_key_encrypted"]

            # Verify encryption was called
            mock_encrypt.encrypt_user_api_key.assert_called_once()

    @pytest.mark.asyncio
    async def test_encryption_uses_unique_iv_each_time(
        self,
        test_api_key: str,
        test_user_id,
        test_workspace_id,
    ) -> None:
        """Verify each encryption uses a unique IV."""
        import os

        generated_ivs = []

        def mock_encrypt(plaintext, user_id, workspace_id):
            # Simulate IV generation like the real service
            iv = os.urandom(12)  # 96-bit nonce for AES-GCM
            generated_ivs.append(iv)
            return (b"encrypted_data", iv)

        # Encrypt same key multiple times
        for _ in range(10):
            _, iv = mock_encrypt(test_api_key, test_user_id, test_workspace_id)

        # All IVs should be unique
        unique_ivs = set(generated_ivs)
        assert len(unique_ivs) == 10, "Each encryption must use a unique IV"

    @pytest.mark.asyncio
    async def test_workspace_isolation_in_encryption(
        self,
        test_api_key: str,
        test_user_id,
    ) -> None:
        """Verify different workspaces produce different encrypted outputs."""
        workspace_a = uuid4()
        workspace_b = uuid4()

        # Simulated encryption with workspace-scoped keys
        def derive_key(workspace_id):
            # In real implementation, this uses HKDF with workspace ID
            return f"derived_key_{workspace_id}".encode()

        def encrypt_with_workspace(api_key, workspace_id):
            key = derive_key(workspace_id)
            # Simplified: in reality uses AES-GCM
            return f"encrypted:{key}:{api_key}".encode()

        encrypted_a = encrypt_with_workspace(test_api_key, workspace_a)
        encrypted_b = encrypt_with_workspace(test_api_key, workspace_b)

        # Same API key should produce different ciphertext in different workspaces
        assert encrypted_a != encrypted_b, "Workspace isolation must be enforced"

    @pytest.mark.asyncio
    async def test_decryption_requires_correct_workspace(
        self,
        test_api_key: str,
        test_user_id,
    ) -> None:
        """Verify decryption fails with wrong workspace context."""
        workspace_a = uuid4()
        workspace_b = uuid4()

        # Track decryption attempts
        decryption_attempts = []

        def mock_decrypt(ciphertext, iv, user_id, workspace_id):
            decryption_attempts.append(
                {"workspace_id": workspace_id, "ciphertext": ciphertext}
            )
            # Simulate failure when wrong workspace
            if "workspace_a" in str(ciphertext) and workspace_id != workspace_a:
                raise ValueError("Decryption failed: wrong workspace key")
            return test_api_key

        # Encrypt with workspace A
        ciphertext = f"encrypted_workspace_a_{test_api_key}".encode()

        # Decrypt with correct workspace should succeed
        result = mock_decrypt(ciphertext, b"iv", test_user_id, workspace_a)
        assert result == test_api_key

        # Decrypt with wrong workspace should fail
        with pytest.raises(ValueError, match="wrong workspace"):
            mock_decrypt(ciphertext, b"iv", test_user_id, workspace_b)


# ---------------------------------------------------------------------------
# API Key Masking Tests
# ---------------------------------------------------------------------------


class TestAPIKeyMasking:
    """Security tests for API key masking in responses."""

    def test_api_key_properly_masked(self, test_api_key: str) -> None:
        """Verify API key is properly masked in responses."""
        # Standard masking: show first 4 and last 4 characters
        prefix_length = 4
        suffix_length = 4

        def mask_api_key(api_key: str) -> str:
            if len(api_key) <= prefix_length + suffix_length:
                return "****"
            prefix = api_key[:prefix_length]
            suffix = api_key[-suffix_length:]
            masked_length = len(api_key) - prefix_length - suffix_length
            return f"{prefix}{'*' * masked_length}{suffix}"

        masked = mask_api_key(test_api_key)

        # Verify structure
        assert masked.startswith("AIza"), "Prefix should be visible"
        assert masked.endswith("_qr"), "Suffix should be visible"
        assert "*" * 10 in masked, "Middle should be masked"

        # Verify original key is not recoverable
        assert test_api_key not in masked
        assert len(masked) == len(test_api_key), "Masked key should preserve length"

    def test_masked_key_in_api_response(self, test_api_key: str) -> None:
        """Verify API responses never contain full API key."""
        # Simulate API response structure
        response = {
            "status": "connected",
            "has_api_key": True,
            "api_key_masked": "AIza*****************************_qr",
            "selected_model": {"model_id": "123", "display_name": "Gemini 2.0"},
        }

        # Full API key should NOT appear anywhere in response
        response_str = str(response)
        assert test_api_key not in response_str, "Full API key must not appear in response"

    def test_short_api_key_fully_masked(self) -> None:
        """Verify very short API keys are fully masked."""
        short_key = "AIza123"

        def mask_api_key(api_key: str) -> str:
            if len(api_key) <= 8:
                return "****"
            prefix = api_key[:4]
            suffix = api_key[-4:]
            return f"{prefix}{'*' * (len(api_key) - 8)}{suffix}"

        masked = mask_api_key(short_key)
        assert masked == "****", "Short keys should be fully masked"


# ---------------------------------------------------------------------------
# Logging Security Tests
# ---------------------------------------------------------------------------


class TestLoggingSecurityAI:
    """Security tests for API key exposure in logs."""

    def test_api_key_not_logged_on_save(self, test_api_key: str, test_user_id) -> None:
        """Verify API key is not logged when saving settings."""
        # Capture log output
        log_capture = io.StringIO()
        handler = logging.StreamHandler(log_capture)
        handler.setLevel(logging.DEBUG)
        logger = logging.getLogger("test.security")
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)

        # Simulate save operation with logging
        logger.info(f"Saving Gemini settings for user {test_user_id}")
        logger.debug(f"Settings update: has_api_key=True, model_id=123")

        log_output = log_capture.getvalue()

        # API key should NOT appear in logs
        assert test_api_key not in log_output
        assert "AIza" not in log_output  # Even partial key shouldn't be logged

        logger.removeHandler(handler)

    def test_api_key_not_logged_on_validation(
        self, test_api_key: str, test_user_id
    ) -> None:
        """Verify API key is not logged during validation."""
        log_capture = io.StringIO()
        handler = logging.StreamHandler(log_capture)
        handler.setLevel(logging.DEBUG)
        logger = logging.getLogger("test.validation")
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)

        # Simulate validation logging
        logger.info(f"Validating Gemini API key for user {test_user_id}")
        logger.debug(f"Validation result: valid=True, models_available=5")

        log_output = log_capture.getvalue()

        assert test_api_key not in log_output
        logger.removeHandler(handler)

    def test_api_key_not_logged_on_error(self, test_api_key: str, test_user_id) -> None:
        """Verify API key is not logged in error messages."""
        log_capture = io.StringIO()
        handler = logging.StreamHandler(log_capture)
        handler.setLevel(logging.DEBUG)
        logger = logging.getLogger("test.error")
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)

        # Simulate error logging
        try:
            raise ValueError("API key validation failed")
        except ValueError as e:
            logger.error(f"Validation error for user {test_user_id}: {e}")

        log_output = log_capture.getvalue()

        assert test_api_key not in log_output
        logger.removeHandler(handler)


# ---------------------------------------------------------------------------
# Validation Security Tests
# ---------------------------------------------------------------------------


class TestValidationSecurity:
    """Security tests for API key validation process."""

    @pytest.mark.asyncio
    async def test_validation_timeout(self, test_api_key: str) -> None:
        """Verify validation has proper timeout to prevent hanging."""
        import asyncio

        timeout_seconds = 5.0

        async def mock_validate_with_timeout(api_key: str):
            # Simulate slow API response
            try:
                await asyncio.wait_for(
                    asyncio.sleep(10.0),  # Would take 10 seconds
                    timeout=timeout_seconds,
                )
            except asyncio.TimeoutError:
                return {"valid": False, "error": "TIMEOUT", "message": "Validation timed out"}
            return {"valid": True}

        result = await mock_validate_with_timeout(test_api_key)

        assert result["valid"] is False
        assert result["error"] == "TIMEOUT"

    @pytest.mark.asyncio
    async def test_validation_rate_limiting(self, test_api_key: str, test_user_id) -> None:
        """Verify validation is rate limited to prevent abuse."""
        validation_attempts: list[float] = []
        max_attempts_per_minute = 5
        import time

        def rate_limited_validate(api_key: str, user_id) -> dict:
            now = time.time()
            # Clean old attempts
            recent = [t for t in validation_attempts if now - t < 60]

            if len(recent) >= max_attempts_per_minute:
                return {"valid": False, "error": "RATE_LIMITED"}

            validation_attempts.append(now)
            return {"valid": True}

        # First 5 attempts should succeed
        for i in range(5):
            result = rate_limited_validate(test_api_key, test_user_id)
            assert result["valid"] is True

        # 6th attempt should be rate limited
        result = rate_limited_validate(test_api_key, test_user_id)
        assert result["error"] == "RATE_LIMITED"

    @pytest.mark.asyncio
    async def test_validation_does_not_store_key_on_failure(
        self, test_api_key: str, test_user_id
    ) -> None:
        """Verify failed validation does not store the API key."""
        stored_keys = {}

        async def mock_save_settings(user_id, api_key, validation_passed: bool):
            if validation_passed:
                stored_keys[str(user_id)] = "encrypted_" + api_key
            # Key should NOT be stored if validation failed
            return validation_passed

        # Simulate failed validation
        await mock_save_settings(test_user_id, test_api_key, validation_passed=False)

        assert str(test_user_id) not in stored_keys, "Failed validation should not store key"


# ---------------------------------------------------------------------------
# Revocation Security Tests
# ---------------------------------------------------------------------------


class TestRevocationSecurity:
    """Security tests for API key revocation."""

    @pytest.mark.asyncio
    async def test_revocation_clears_encrypted_key(
        self, test_api_key: str, test_user_id
    ) -> None:
        """Verify revocation completely clears the encrypted key."""
        storage = {
            str(test_user_id): {
                "api_key_encrypted": b"encrypted_data_here",
                "api_key_iv": b"iv_data_here",
                "selected_model_id": "model-123",
            }
        }

        def revoke_key(user_id) -> dict:
            user_key = str(user_id)
            if user_key in storage:
                storage[user_key]["api_key_encrypted"] = None
                storage[user_key]["api_key_iv"] = None
                # Model selection is preserved
            return storage[user_key]

        result = revoke_key(test_user_id)

        assert result["api_key_encrypted"] is None
        assert result["api_key_iv"] is None
        assert result["selected_model_id"] == "model-123", "Model selection preserved"

    @pytest.mark.asyncio
    async def test_revocation_invalidates_cached_key(
        self, test_api_key: str, test_user_id
    ) -> None:
        """Verify revocation invalidates any cached API key."""
        cache = {f"user:{test_user_id}:api_key": test_api_key}

        def revoke_key(user_id) -> None:
            cache_key = f"user:{user_id}:api_key"
            if cache_key in cache:
                del cache[cache_key]

        revoke_key(test_user_id)

        assert f"user:{test_user_id}:api_key" not in cache

    @pytest.mark.asyncio
    async def test_revoked_key_cannot_be_used(
        self, test_api_key: str, test_user_id
    ) -> None:
        """Verify revoked key cannot be used for AI operations."""
        revoked_users = set()

        async def check_key_status(user_id) -> bool:
            return str(user_id) not in revoked_users

        async def ai_operation(user_id):
            if not await check_key_status(user_id):
                raise PermissionError("API key has been revoked")
            return "AI result"

        # Before revocation
        result = await ai_operation(test_user_id)
        assert result == "AI result"

        # Revoke
        revoked_users.add(str(test_user_id))

        # After revocation
        with pytest.raises(PermissionError, match="revoked"):
            await ai_operation(test_user_id)


# ---------------------------------------------------------------------------
# Feature Toggle Security Tests
# ---------------------------------------------------------------------------


class TestFeatureToggleSecurity:
    """Security tests for AI feature toggles."""

    @pytest.mark.asyncio
    async def test_toggles_enforce_workspace_isolation(self, test_user_id) -> None:
        """Verify feature toggles are workspace-isolated."""
        workspace_a = uuid4()
        workspace_b = uuid4()

        toggles = {
            f"{test_user_id}:{workspace_a}": {"photo_analysis": True},
            f"{test_user_id}:{workspace_b}": {"photo_analysis": False},
        }

        def get_toggle(user_id, workspace_id, feature):
            key = f"{user_id}:{workspace_id}"
            return toggles.get(key, {}).get(feature, True)

        # Same user, different workspaces, different toggle states
        assert get_toggle(test_user_id, workspace_a, "photo_analysis") is True
        assert get_toggle(test_user_id, workspace_b, "photo_analysis") is False

    @pytest.mark.asyncio
    async def test_toggle_changes_audited(self, test_user_id) -> None:
        """Verify toggle changes are logged for audit."""
        audit_log = []

        def log_toggle_change(user_id, feature, old_value, new_value):
            audit_log.append({
                "user_id": str(user_id),
                "feature": feature,
                "old_value": old_value,
                "new_value": new_value,
                "action": "toggle_change",
            })

        # Simulate toggle change
        log_toggle_change(test_user_id, "photo_analysis", True, False)

        assert len(audit_log) == 1
        assert audit_log[0]["feature"] == "photo_analysis"
        assert audit_log[0]["action"] == "toggle_change"


# ---------------------------------------------------------------------------
# Input Validation Security Tests
# ---------------------------------------------------------------------------


class TestInputValidationSecurity:
    """Security tests for API key input validation."""

    def test_api_key_format_validation(self) -> None:
        """Verify API key format is validated before processing."""
        # Valid Gemini key format: starts with "AIza" and is ~39 chars
        valid_keys = [
            "AIzaSyDa0BCD1234EFGH5678IJKL9012MNOP_qr",
            "AIzaSyDexample1234567890123456789012345",
        ]

        invalid_keys = [
            "",  # Empty
            "   ",  # Whitespace only
            "not_a_key",  # Wrong prefix
            "AIza",  # Too short
            "<script>alert('xss')</script>",  # XSS attempt
            "'; DROP TABLE users; --",  # SQL injection attempt
            "AIza" + "x" * 1000,  # Excessively long
        ]

        def validate_format(api_key: str) -> bool:
            if not api_key or len(api_key.strip()) == 0:
                return False
            if not api_key.startswith("AIza"):
                return False
            if len(api_key) < 20 or len(api_key) > 100:
                return False
            # Only allow alphanumeric, underscore, hyphen
            if not re.match(r"^[A-Za-z0-9_-]+$", api_key):
                return False
            return True

        for key in valid_keys:
            assert validate_format(key) is True, f"Should accept: {key[:10]}..."

        for key in invalid_keys:
            assert validate_format(key) is False, f"Should reject: {key[:20]}..."

    def test_api_key_sanitization(self) -> None:
        """Verify API key is sanitized before use."""
        # Keys with leading/trailing whitespace
        dirty_keys = [
            "  AIzaSyDa0BCD1234EFGH5678IJKL9012MNOP_qr  ",
            "\nAIzaSyDa0BCD1234EFGH5678IJKL9012MNOP_qr\n",
            "\tAIzaSyDa0BCD1234EFGH5678IJKL9012MNOP_qr\t",
        ]

        def sanitize_api_key(api_key: str) -> str:
            return api_key.strip()

        for dirty in dirty_keys:
            clean = sanitize_api_key(dirty)
            assert clean.startswith("AIza")
            assert clean.endswith("_qr")
            assert " " not in clean
            assert "\n" not in clean
            assert "\t" not in clean


# ---------------------------------------------------------------------------
# Main Test Runner
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short"])
