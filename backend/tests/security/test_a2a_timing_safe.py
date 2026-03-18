"""Regression tests for SEC-01: Timing-safe A2A API key comparison.

These tests verify that:
1. API key comparison uses hmac.compare_digest (not string ==)
2. The SHA-256 hash of the key is compared, not raw key text
3. Reverting to string equality would cause test failures
"""
import hashlib
import hmac
import inspect
from unittest.mock import AsyncMock, patch, MagicMock
import pytest


class TestTimingSafeComparison:
    """Verify A2A key validation uses timing-safe comparison."""

    def test_source_contains_hmac_compare_digest(self):
        """SEC-01 regression: validate_api_key must use hmac.compare_digest."""
        from app.middleware.a2a_auth import validate_api_key
        source = inspect.getsource(validate_api_key)
        assert "hmac.compare_digest" in source, (
            "REGRESSION: validate_api_key must use hmac.compare_digest, "
            "not string equality or SQL crypt()"
        )

    def test_source_does_not_use_crypt(self):
        """SEC-01 regression: validate_api_key must NOT use SQL crypt()."""
        from app.middleware.a2a_auth import validate_api_key
        source = inspect.getsource(validate_api_key)
        assert "crypt(" not in source, (
            "REGRESSION: validate_api_key must not use SQL crypt() — "
            "use Python-side hmac.compare_digest with SHA-256 hash"
        )

    def test_source_does_not_use_string_equality_on_hash(self):
        """SEC-01 regression: key_hash must not be compared with ==."""
        from app.middleware.a2a_auth import validate_api_key
        source = inspect.getsource(validate_api_key)
        # Ensure no `key_hash ==` or `== key_hash` patterns
        assert "key_hash ==" not in source and "== key_hash" not in source, (
            "REGRESSION: key_hash must not be compared with ==, "
            "use hmac.compare_digest for timing safety"
        )

    def test_sha256_hash_matches_key_creation(self):
        """Verify that the hash algorithm matches between creation and validation."""
        from app.api.v1.agent_api_keys import generate_api_key
        import uuid
        workspace_id = uuid.uuid4()
        api_key, key_hash = generate_api_key(workspace_id)
        # The stored hash should be SHA-256 of the key
        expected_hash = hashlib.sha256(api_key.encode()).hexdigest()
        assert key_hash == expected_hash, (
            "Key creation hash must be SHA-256 to match validation logic"
        )

    def test_hmac_compare_digest_catches_mismatch(self):
        """Verify hmac.compare_digest correctly rejects wrong keys."""
        correct_hash = hashlib.sha256(b"correct_key").hexdigest()
        wrong_hash = hashlib.sha256(b"wrong_key").hexdigest()
        assert not hmac.compare_digest(correct_hash, wrong_hash)
        assert hmac.compare_digest(correct_hash, correct_hash)
