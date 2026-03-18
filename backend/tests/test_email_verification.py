"""Tests for email verification flow (MAIL-05).

Tests that signup triggers verification email and verify-email endpoint
validates tokens and marks email as verified.

Pure unit tests - mocks DB and external services.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(
    user_id: uuid.UUID | None = None,
    email: str = "new@example.com",
    display_name: str = "New User",
    email_verified: bool = False,
    workspace_id: uuid.UUID | None = None,
):
    """Create a mock user object."""
    user = MagicMock()
    user.user_id = user_id or uuid.uuid4()
    user.email = email
    user.display_name = display_name
    user.email_verified = email_verified
    user.workspace_id = workspace_id or uuid.uuid4()
    return user


def _make_tokens():
    """Create a mock tokens object."""
    tokens = MagicMock()
    tokens.access_token = "access_token_123"
    tokens.refresh_token = "refresh_token_123"
    tokens.token_type = "Bearer"
    tokens.expires_in = 3600
    return tokens


def _mock_settings():
    """Create mock settings with public_url."""
    s = MagicMock()
    s.public_url = "https://app.rawdrive.in"
    return s


# ---------------------------------------------------------------------------
# Test 1: Signup triggers verification email
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_signup_triggers_verification_email():
    """Signup endpoint calls EmailVerificationService and EmailService to send verification email."""
    from fastapi import Request

    mock_user = _make_user()
    mock_tokens = _make_tokens()
    raw_token = "test_raw_token_abc123"

    # Mock auth service
    mock_auth = AsyncMock()
    mock_auth.signup_local = AsyncMock(return_value=(mock_user, mock_tokens))

    # Mock email verification service
    mock_ev = AsyncMock()
    mock_ev.send_verification_email = AsyncMock(return_value=raw_token)

    # Mock email service module
    mock_email_mod = MagicMock()
    mock_email_mod.send_verification_email = AsyncMock()

    with (
        patch("app.api.v1.auth.EmailVerificationService", return_value=mock_ev),
        patch("app.api.v1.auth.email_service_module", mock_email_mod),
        patch("app.api.v1.auth.get_settings", return_value=_mock_settings()),
        patch("app.api.v1.auth.log_auth_event", new_callable=AsyncMock),
    ):
        from app.api.v1.auth import signup
        from app.api.schemas import SignupRequest

        # Create mock request object
        mock_request = MagicMock(spec=Request)
        mock_request.client = MagicMock()
        mock_request.client.host = "127.0.0.1"
        mock_request.headers = {"user-agent": "test"}

        signup_req = SignupRequest(
            email="new@example.com",
            password="SecurePass123!",
            display_name="New User",
        )

        result = await signup(
            request_obj=mock_request,
            request=signup_req,
            auth_service=mock_auth,
        )

    # Signup succeeded
    assert result.user.email == "new@example.com"

    # Verification service was called
    mock_ev.send_verification_email.assert_called_once_with(
        user_id=mock_user.user_id,
        email=mock_user.email,
        force=True,
    )

    # Email service was called with verification URL
    mock_email_mod.send_verification_email.assert_called_once()
    call_args = mock_email_mod.send_verification_email.call_args
    assert raw_token in call_args.kwargs.get("verification_url", call_args.args[1] if len(call_args.args) > 1 else "")


# ---------------------------------------------------------------------------
# Test 2: Verify email with valid token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verify_email_valid_token():
    """Verify-email endpoint with valid token returns success message."""
    user_id = uuid.uuid4()

    mock_ev = AsyncMock()
    mock_ev.verify_email = AsyncMock(return_value=user_id)

    with patch("app.api.v1.auth.EmailVerificationService", return_value=mock_ev):
        from app.api.v1.auth import verify_email

        result = await verify_email(token="valid_token_123")

    assert "verified" in result.message.lower() or "success" in result.message.lower()
    mock_ev.verify_email.assert_called_once_with("valid_token_123")


# ---------------------------------------------------------------------------
# Test 3: Verify email with expired token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verify_email_expired_token():
    """Verify-email endpoint with expired token raises error."""
    from app.services.email_verification_service import TokenExpiredError as EVTokenExpiredError

    mock_ev = AsyncMock()
    mock_ev.verify_email = AsyncMock(side_effect=EVTokenExpiredError())

    with patch("app.api.v1.auth.EmailVerificationService", return_value=mock_ev):
        from app.api.v1.auth import verify_email

        with pytest.raises(Exception) as exc_info:
            await verify_email(token="expired_token")

        # Should raise an HTTP error (ConflictError or HTTPException)
        assert hasattr(exc_info.value, "status_code") or hasattr(exc_info.value, "code")


# ---------------------------------------------------------------------------
# Test 4: Verify email with already-used token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verify_email_already_used_token():
    """Verify-email endpoint with already-used token raises error."""
    from app.services.email_verification_service import TokenAlreadyUsedError

    mock_ev = AsyncMock()
    mock_ev.verify_email = AsyncMock(side_effect=TokenAlreadyUsedError())

    with patch("app.api.v1.auth.EmailVerificationService", return_value=mock_ev):
        from app.api.v1.auth import verify_email

        with pytest.raises(Exception) as exc_info:
            await verify_email(token="used_token")

        assert hasattr(exc_info.value, "status_code") or hasattr(exc_info.value, "code")


# ---------------------------------------------------------------------------
# Test 5: Signup succeeds even if email sending fails
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_signup_succeeds_even_if_email_fails():
    """Signup returns success even when email verification service throws."""
    from fastapi import Request
    from app.api.schemas import SignupRequest

    mock_user = _make_user()
    mock_tokens = _make_tokens()

    mock_auth = AsyncMock()
    mock_auth.signup_local = AsyncMock(return_value=(mock_user, mock_tokens))

    # Make verification service throw
    mock_ev = AsyncMock()
    mock_ev.send_verification_email = AsyncMock(side_effect=Exception("SMTP down"))

    with (
        patch("app.api.v1.auth.EmailVerificationService", return_value=mock_ev),
        patch("app.api.v1.auth.email_service_module", MagicMock()),
        patch("app.api.v1.auth.get_settings", return_value=_mock_settings()),
        patch("app.api.v1.auth.log_auth_event", new_callable=AsyncMock),
    ):
        from app.api.v1.auth import signup

        mock_request = MagicMock(spec=Request)
        mock_request.client = MagicMock()
        mock_request.client.host = "127.0.0.1"
        mock_request.headers = {"user-agent": "test"}

        signup_req = SignupRequest(
            email="new@example.com",
            password="SecurePass123!",
            display_name="New User",
        )

        # Should not raise even though email service fails
        result = await signup(
            request_obj=mock_request,
            request=signup_req,
            auth_service=mock_auth,
        )

    assert result.user.email == "new@example.com"
