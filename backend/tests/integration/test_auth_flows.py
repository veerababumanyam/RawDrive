"""
Integration tests for auth flows: login, signup, token refresh, logout.

Tests the full request/response cycle through FastAPI ASGI app using
httpx AsyncClient. All external dependencies (DB, email, audit) are mocked.

Plan: 09-02 Task 1
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.v1.auth import _get_auth_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(
    user_id: uuid.UUID | None = None,
    email: str = "user@example.com",
    display_name: str = "Test User",
    email_verified: bool = False,
    workspace_id: uuid.UUID | None = None,
):
    """Create a mock user object matching AuthService return type."""
    user = MagicMock()
    user.user_id = user_id or uuid.uuid4()
    user.email = email
    user.display_name = display_name
    user.email_verified = email_verified
    user.workspace_id = workspace_id or uuid.uuid4()
    return user


def _make_tokens(
    access_token: str = "access_tok_abc",
    refresh_token: str = "refresh_tok_xyz",
):
    """Create a mock tokens object matching AuthService return type."""
    tokens = MagicMock()
    tokens.access_token = access_token
    tokens.refresh_token = refresh_token
    tokens.token_type = "Bearer"
    tokens.expires_in = 3600
    return tokens


def _mock_settings():
    s = MagicMock()
    s.public_url = "https://app.rawdrive.in"
    return s


# Patch targets for isolating from real services
_PATCH_AUDIT = "app.api.v1.auth.log_auth_event"
_PATCH_EV_CLS = "app.api.v1.auth.EmailVerificationService"
_PATCH_EMAIL_MOD = "app.api.v1.auth.email_service_module"
_PATCH_SETTINGS = "app.api.v1.auth.get_settings"


@pytest.fixture(autouse=True)
def _override_auth_service():
    """Provide a mock AuthService via FastAPI dependency_overrides.

    Each test replaces the mock methods it needs before making requests.
    The mock is yielded so tests can configure it.
    """
    mock_auth = AsyncMock()
    # Default no-ops; tests override specific methods
    mock_auth.login_local = AsyncMock(return_value=(_make_user(), _make_tokens()))
    mock_auth.signup_local = AsyncMock(return_value=(_make_user(), _make_tokens()))
    mock_auth.refresh_token = AsyncMock(return_value=_make_tokens())
    mock_auth.logout = AsyncMock(return_value=None)

    app.dependency_overrides[_get_auth_service] = lambda: mock_auth
    yield mock_auth
    app.dependency_overrides.pop(_get_auth_service, None)


# ---------------------------------------------------------------------------
# Tests: Login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_valid_credentials(_override_auth_service):
    """POST /api/v1/auth/login with valid credentials returns 200 with tokens."""
    mock_user = _make_user(email="valid@example.com")
    mock_tokens = _make_tokens()
    _override_auth_service.login_local = AsyncMock(return_value=(mock_user, mock_tokens))

    with patch(_PATCH_AUDIT, new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/login",
                json={"email": "valid@example.com", "password": "Correct123!"},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["tokens"]["access_token"] == "access_tok_abc"
    assert body["tokens"]["refresh_token"] == "refresh_tok_xyz"
    assert body["user"]["email"] == "valid@example.com"


@pytest.mark.asyncio
async def test_login_invalid_password(_override_auth_service):
    """POST /api/v1/auth/login with wrong password returns 401."""
    from app.services.auth_service import InvalidCredentialsError

    _override_auth_service.login_local = AsyncMock(
        side_effect=InvalidCredentialsError()
    )

    with patch(_PATCH_AUDIT, new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/login",
                json={"email": "user@example.com", "password": "WrongPass!"},
            )

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(_override_auth_service):
    """POST /api/v1/auth/login with unknown email returns 401 (not 404)."""
    from app.services.auth_service import InvalidCredentialsError

    _override_auth_service.login_local = AsyncMock(
        side_effect=InvalidCredentialsError()
    )

    with patch(_PATCH_AUDIT, new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/login",
                json={"email": "ghost@example.com", "password": "Whatever1!"},
            )

    # Must be 401, not 404, to avoid user enumeration
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests: Signup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_signup_creates_user(_override_auth_service):
    """POST /api/v1/auth/signup with valid data returns 201 and user object."""
    mock_user = _make_user(email="new@example.com", display_name="New User")
    mock_tokens = _make_tokens()
    _override_auth_service.signup_local = AsyncMock(return_value=(mock_user, mock_tokens))

    mock_ev = AsyncMock()
    mock_ev.send_verification_email = AsyncMock(return_value="tok123")

    with (
        patch(_PATCH_AUDIT, new_callable=AsyncMock),
        patch(_PATCH_EV_CLS, return_value=mock_ev),
        patch(_PATCH_EMAIL_MOD, MagicMock(send_verification_email=AsyncMock())),
        patch(_PATCH_SETTINGS, return_value=_mock_settings()),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/signup",
                json={
                    "email": "new@example.com",
                    "password": "SecurePass1!",
                    "display_name": "New User",
                },
            )

    assert resp.status_code == 201
    body = resp.json()
    assert body["user"]["email"] == "new@example.com"
    assert "access_token" in body["tokens"]


@pytest.mark.asyncio
async def test_signup_duplicate_email(_override_auth_service):
    """POST /api/v1/auth/signup with existing email returns 409."""
    from app.services.auth_service import UserExistsError

    _override_auth_service.signup_local = AsyncMock(
        side_effect=UserExistsError()
    )

    with patch(_PATCH_AUDIT, new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/signup",
                json={
                    "email": "existing@example.com",
                    "password": "SecurePass1!",
                    "display_name": "Dup User",
                },
            )

    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Tests: Token Refresh
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_token_refresh_valid(_override_auth_service):
    """POST /api/v1/auth/refresh with valid refresh_token returns new tokens."""
    mock_tokens = _make_tokens(access_token="new_access", refresh_token="new_refresh")
    _override_auth_service.refresh_token = AsyncMock(return_value=mock_tokens)

    with patch(_PATCH_AUDIT, new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": "valid_refresh_tok"},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] == "new_access"
    assert body["refresh_token"] == "new_refresh"


@pytest.mark.asyncio
async def test_token_refresh_invalid(_override_auth_service):
    """POST /api/v1/auth/refresh with invalid token returns 401."""
    from app.services.auth_service import TokenInvalidError

    _override_auth_service.refresh_token = AsyncMock(
        side_effect=TokenInvalidError()
    )

    with patch(_PATCH_AUDIT, new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": "bad_token"},
            )

    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests: Logout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout_success(_override_auth_service):
    """POST /api/v1/auth/logout invalidates session and returns success."""
    _override_auth_service.logout = AsyncMock(return_value=None)

    with patch(_PATCH_AUDIT, new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/auth/logout",
                json={"refresh_token": "refresh_tok_xyz"},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert "logged out" in body["message"].lower() or "success" in body["message"].lower()
    _override_auth_service.logout.assert_called_once_with("refresh_tok_xyz")


@pytest.mark.asyncio
async def test_logout_then_refresh_fails(_override_auth_service):
    """After logout, using the same refresh token for refresh should fail."""
    from app.services.auth_service import TokenInvalidError

    _override_auth_service.logout = AsyncMock(return_value=None)
    _override_auth_service.refresh_token = AsyncMock(
        side_effect=TokenInvalidError()
    )

    with patch(_PATCH_AUDIT, new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Logout first
            logout_resp = await client.post(
                "/api/v1/auth/logout",
                json={"refresh_token": "old_refresh"},
            )
            assert logout_resp.status_code == 200

            # Try refreshing with the same token
            refresh_resp = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": "old_refresh"},
            )
            assert refresh_resp.status_code == 401
