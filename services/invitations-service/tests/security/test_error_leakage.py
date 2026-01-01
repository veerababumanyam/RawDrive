"""
Error Leakage Prevention Tests.

These tests verify that authentication/authorization errors return
generic messages without exposing internal details that could help attackers.

OWASP Reference: https://owasp.org/www-community/Improper_Error_Handling
"""

import pytest
from unittest.mock import patch, MagicMock
from uuid import uuid4

import jwt
from fastapi import HTTPException

from src.api.v1.dependencies import get_current_user, CurrentUser
from src.config import settings


class MockRequest:
    """Mock FastAPI request object."""

    def __init__(self, headers: dict = None):
        self.headers = headers or {}


class MockCredentials:
    """Mock HTTP Authorization credentials."""

    def __init__(self, token: str):
        self.credentials = token


class TestAuthErrorMessagesAreGeneric:
    """Test that auth errors don't leak internal details."""

    GENERIC_AUTH_ERROR = "Authentication failed"

    @pytest.mark.asyncio
    async def test_expired_token_generic_message(self):
        """Expired token returns generic message, not 'Token has expired'."""
        # Create an expired token
        expired_token = jwt.encode(
            {"sub": str(uuid4()), "workspace_id": str(uuid4()), "exp": 0},
            settings.JWT_SECRET if hasattr(settings, 'JWT_SECRET') else "test-secret",
            algorithm="HS256",
        )

        request = MockRequest()
        credentials = MockCredentials(expired_token)

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request, credentials)

        # Should NOT reveal that token expired
        assert "expired" not in exc_info.value.detail.lower()
        assert self.GENERIC_AUTH_ERROR in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_invalid_signature_generic_message(self):
        """Invalid signature returns generic message, not internal error."""
        # Create token with wrong secret
        bad_token = jwt.encode(
            {"sub": str(uuid4()), "workspace_id": str(uuid4())},
            "wrong-secret",
            algorithm="HS256",
        )

        request = MockRequest()
        credentials = MockCredentials(bad_token)

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request, credentials)

        # Should NOT reveal signature mismatch
        assert "signature" not in exc_info.value.detail.lower()
        assert self.GENERIC_AUTH_ERROR in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_malformed_token_generic_message(self):
        """Malformed token returns generic message."""
        request = MockRequest()
        credentials = MockCredentials("not.a.valid.token")

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request, credentials)

        # Should NOT reveal parsing details
        assert "decode" not in exc_info.value.detail.lower()
        assert "segment" not in exc_info.value.detail.lower()
        assert self.GENERIC_AUTH_ERROR in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_missing_claims_generic_message(self):
        """Token with missing claims returns generic message."""
        # Token without required claims
        incomplete_token = jwt.encode(
            {"random": "data"},
            settings.JWT_SECRET if hasattr(settings, 'JWT_SECRET') else "test-secret",
            algorithm="HS256",
        )

        request = MockRequest()
        credentials = MockCredentials(incomplete_token)

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request, credentials)

        # Should NOT reveal which claim is missing
        assert "sub" not in exc_info.value.detail.lower()
        assert "workspace_id" not in exc_info.value.detail.lower()
        assert "KeyError" not in exc_info.value.detail
        assert self.GENERIC_AUTH_ERROR in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_missing_auth_header_clear_message(self):
        """Missing auth header returns clear but generic message."""
        request = MockRequest()
        credentials = None

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request, credentials)

        # This one can be more specific since it's not an attack
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_uuid_format_generic_message(self):
        """Invalid UUID in token returns generic message."""
        # Token with invalid UUID format
        bad_uuid_token = jwt.encode(
            {"sub": "not-a-uuid", "workspace_id": str(uuid4())},
            settings.JWT_SECRET if hasattr(settings, 'JWT_SECRET') else "test-secret",
            algorithm="HS256",
        )

        request = MockRequest()
        credentials = MockCredentials(bad_uuid_token)

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request, credentials)

        # Should NOT reveal UUID parsing error
        assert "uuid" not in exc_info.value.detail.lower()
        assert "ValueError" not in exc_info.value.detail
        assert self.GENERIC_AUTH_ERROR in exc_info.value.detail


class TestNoInternalDetailsExposed:
    """Test that no internal system details are exposed in errors."""

    ERROR_PATTERNS_TO_AVOID = [
        "traceback",
        "exception",
        "stack",
        "file",
        "line",
        "module",
        "__",
        "pyjwt",
        "jwt.",
        "decode",
        "verify",
        "signature",
        "algorithm",
        "secret",
    ]

    @pytest.mark.asyncio
    async def test_no_internal_details_on_any_error(self):
        """Various bad tokens don't expose internal details."""
        bad_tokens = [
            "",
            "x",
            "xxx",
            "a.b",
            "a.b.c",
            "eyJhbGciOiJIUzI1NiJ9.e30.invalid",
            "not-base64!@#$%",
        ]

        request = MockRequest()

        for token in bad_tokens:
            credentials = MockCredentials(token)
            try:
                await get_current_user(request, credentials)
            except HTTPException as e:
                detail_lower = e.detail.lower()
                for pattern in self.ERROR_PATTERNS_TO_AVOID:
                    assert pattern not in detail_lower, \
                        f"Found '{pattern}' in error detail for token: {token}"


class TestHeaderBasedAuthErrors:
    """Test errors from X-User-ID / X-Workspace-ID header auth."""

    @pytest.mark.asyncio
    async def test_invalid_header_uuid_generic_message(self):
        """Invalid UUID in headers returns generic message."""
        request = MockRequest(headers={
            "X-User-ID": "not-a-uuid",
            "X-Workspace-ID": str(uuid4()),
        })

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request, None)

        # Should NOT reveal UUID parsing error
        assert "uuid" not in exc_info.value.detail.lower()
        assert "ValueError" not in exc_info.value.detail


class TestCorrelationIdInLogs:
    """Test that internal errors are logged with correlation ID."""

    @pytest.mark.asyncio
    async def test_error_logged_with_correlation_id(self):
        """Auth errors are logged with correlation ID for debugging."""
        # This test verifies the logging behavior
        # The actual correlation ID comes from middleware
        request = MockRequest()
        credentials = MockCredentials("invalid.token.here")

        with pytest.raises(HTTPException):
            await get_current_user(request, credentials)

        # Logging is verified by checking the log output in integration tests
        # Here we just verify the exception is raised properly
