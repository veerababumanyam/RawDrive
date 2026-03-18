"""Tests for password reset flow (MAIL-06).

Tests that forgot-password generates reset token and sends email,
and reset-password validates token and updates password.

Pure unit tests - mocks DB and external services.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_settings():
    """Create mock settings with public_url."""
    s = MagicMock()
    s.public_url = "https://app.rawdrive.in"
    return s


# ---------------------------------------------------------------------------
# Test 1: request_password_reset with existing email generates token and sends email
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_request_password_reset_sends_email():
    """request_password_reset with existing email generates token and sends email."""
    user_id = uuid.uuid4()
    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value={
        "user_id": user_id,
        "email": "user@example.com",
        "display_name": "Test User",
    })
    mock_pool.execute = AsyncMock()

    mock_redis = AsyncMock()
    mock_redis.ttl = AsyncMock(return_value=-2)  # no cooldown
    mock_redis.setex = AsyncMock()
    mock_redis.delete = AsyncMock()

    mock_email_mod = MagicMock()
    mock_email_mod.send_password_reset_email = AsyncMock()

    with (
        patch("app.services.password_reset_service.get_postgres_pool", AsyncMock(return_value=mock_pool)),
        patch("app.services.password_reset_service.get_redis_client", AsyncMock(return_value=mock_redis)),
        patch("app.services.password_reset_service.email_service_module", mock_email_mod),
        patch("app.services.password_reset_service.get_settings", return_value=_mock_settings()),
    ):
        from app.services.password_reset_service import PasswordResetService

        service = PasswordResetService()
        result = await service.request_password_reset("user@example.com")

    assert result is not None  # returns raw token
    mock_email_mod.send_password_reset_email.assert_called_once()


# ---------------------------------------------------------------------------
# Test 2: request_password_reset with non-existing email returns None
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_request_password_reset_nonexistent_email():
    """request_password_reset with non-existing email returns None silently."""
    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value=None)  # user not found

    mock_redis = AsyncMock()
    mock_redis.ttl = AsyncMock(return_value=-2)

    with (
        patch("app.services.password_reset_service.get_postgres_pool", AsyncMock(return_value=mock_pool)),
        patch("app.services.password_reset_service.get_redis_client", AsyncMock(return_value=mock_redis)),
        patch("app.services.password_reset_service.email_service_module", MagicMock()),
        patch("app.services.password_reset_service.get_settings", return_value=_mock_settings()),
    ):
        from app.services.password_reset_service import PasswordResetService

        service = PasswordResetService()
        result = await service.request_password_reset("nobody@example.com")

    assert result is None


# ---------------------------------------------------------------------------
# Test 3: validate_reset_token with valid token returns user_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_reset_token_valid():
    """validate_reset_token with valid token returns user_id."""
    user_id = uuid.uuid4()
    from datetime import datetime, timedelta, timezone

    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value={
        "token_id": uuid.uuid4(),
        "user_id": user_id,
        "email": "user@example.com",
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "used_at": None,
        "status": "pending",
    })

    with (
        patch("app.services.password_reset_service.get_postgres_pool", AsyncMock(return_value=mock_pool)),
        patch("app.services.password_reset_service.get_redis_client", AsyncMock()),
        patch("app.services.password_reset_service.email_service_module", MagicMock()),
        patch("app.services.password_reset_service.get_settings", return_value=_mock_settings()),
    ):
        from app.services.password_reset_service import PasswordResetService

        service = PasswordResetService()
        result = await service.validate_reset_token("valid_token")

    assert result == user_id


# ---------------------------------------------------------------------------
# Test 4: validate_reset_token with expired token raises TokenExpiredError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_reset_token_expired():
    """validate_reset_token with expired token raises TokenExpiredError."""
    from datetime import datetime, timedelta, timezone

    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value={
        "token_id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "email": "user@example.com",
        "expires_at": datetime.now(timezone.utc) - timedelta(hours=1),  # expired
        "used_at": None,
        "status": "pending",
    })

    with (
        patch("app.services.password_reset_service.get_postgres_pool", AsyncMock(return_value=mock_pool)),
        patch("app.services.password_reset_service.get_redis_client", AsyncMock()),
        patch("app.services.password_reset_service.email_service_module", MagicMock()),
        patch("app.services.password_reset_service.get_settings", return_value=_mock_settings()),
    ):
        from app.services.password_reset_service import PasswordResetService
        from app.services.email_verification_service import TokenExpiredError

        service = PasswordResetService()
        with pytest.raises(TokenExpiredError):
            await service.validate_reset_token("expired_token")


# ---------------------------------------------------------------------------
# Test 5: reset_password with valid token updates password hash and invalidates token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_password_valid_token():
    """reset_password with valid token updates password and invalidates token."""
    user_id = uuid.uuid4()
    from datetime import datetime, timedelta, timezone

    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value={
        "token_id": uuid.uuid4(),
        "user_id": user_id,
        "email": "user@example.com",
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "used_at": None,
        "status": "pending",
    })
    mock_pool.execute = AsyncMock()

    with (
        patch("app.services.password_reset_service.get_postgres_pool", AsyncMock(return_value=mock_pool)),
        patch("app.services.password_reset_service.get_redis_client", AsyncMock()),
        patch("app.services.password_reset_service.email_service_module", MagicMock()),
        patch("app.services.password_reset_service.get_settings", return_value=_mock_settings()),
        patch("app.services.password_reset_service.hash_password", return_value="hashed_new_password"),
    ):
        from app.services.password_reset_service import PasswordResetService

        service = PasswordResetService()
        result = await service.reset_password("valid_token", "NewSecure123!")

    assert result == user_id
    # Verify DB was called to update password and mark token used
    assert mock_pool.execute.call_count >= 2  # update password + mark token


# ---------------------------------------------------------------------------
# Test 6: forgot-password endpoint always returns same message
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_forgot_password_endpoint_consistent_response():
    """forgot-password endpoint returns same message regardless of email existence."""
    mock_service = AsyncMock()
    mock_service.request_password_reset = AsyncMock(return_value=None)  # email not found

    with patch("app.api.v1.auth.PasswordResetService", return_value=mock_service):
        from app.api.v1.auth import forgot_password

        result = await forgot_password(email="nobody@example.com")

    assert "reset link" in result.message.lower() or "if the email" in result.message.lower()


# ---------------------------------------------------------------------------
# Test 7: reset-password endpoint with valid token returns 200
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_password_endpoint_valid():
    """reset-password endpoint with valid token returns success message."""
    mock_service = AsyncMock()
    mock_service.reset_password = AsyncMock(return_value=uuid.uuid4())

    with patch("app.api.v1.auth.PasswordResetService", return_value=mock_service):
        from app.api.v1.auth import reset_password

        result = await reset_password(token="valid_token", new_password="NewSecure123!")

    assert "reset" in result.message.lower() or "success" in result.message.lower()
    mock_service.reset_password.assert_called_once_with("valid_token", "NewSecure123!")


# ---------------------------------------------------------------------------
# Test 8: reset-password endpoint with invalid token returns error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_password_endpoint_invalid_token():
    """reset-password endpoint with invalid token raises error."""
    from app.services.email_verification_service import TokenInvalidError

    mock_service = AsyncMock()
    mock_service.reset_password = AsyncMock(side_effect=TokenInvalidError())

    with patch("app.api.v1.auth.PasswordResetService", return_value=mock_service):
        from app.api.v1.auth import reset_password

        with pytest.raises(Exception) as exc_info:
            await reset_password(token="invalid_token", new_password="NewSecure123!")

        assert hasattr(exc_info.value, "status_code") or hasattr(exc_info.value, "code")
