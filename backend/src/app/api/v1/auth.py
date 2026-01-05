"""Authentication API endpoints.

All routes prefixed with /api/v1/auth.
Implements Requirements: 3.1, 3.2, 3.4, 4.1, 4.2, 22.1, 22.2
"""

from __future__ import annotations

import hashlib
import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import RedirectResponse
from urllib.parse import urlencode


def _hash_email_for_audit(email: str) -> str:
    """Hash email for audit logs to comply with GDPR/SOC2 - no PII in logs."""
    return hashlib.sha256(email.lower().encode()).hexdigest()[:16]

from app.api.schemas import (
    AuthResponse,
    ErrorResponse,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshTokenRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)
from app.config.settings import get_settings
from app.services.auth_service import (
    AuthError,
    AuthService,
    InvalidCredentialsError,
    SessionRevokedError,
    TokenExpiredError,
    TokenInvalidError,
    UserExistsError,
)
from app.api.exceptions import ConflictError, UnauthorizedError, InternalError
from app.services.audit_service import (
    AuditEventType,
    log_auth_event,
)
from app.services.oauth_service import (
    GoogleOAuthService,
    OAuthCodeExchangeError,
    OAuthStateMismatchError,
    OAuthUserInfoError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _get_auth_service() -> AuthService:
    return AuthService()



def _get_oauth_service() -> GoogleOAuthService:
    return GoogleOAuthService()


AuthServiceDep = Annotated[AuthService, Depends(_get_auth_service)]
OAuthServiceDep = Annotated[GoogleOAuthService, Depends(_get_oauth_service)]


# ---------------------------------------------------------------------------
# Local auth endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorResponse}},
    summary="Register new user",
    description="Create a new user account with email and password.",
)
async def signup(
    request_obj: Request,
    request: SignupRequest,
    auth_service: AuthServiceDep,
) -> AuthResponse:
    """Register a new user with email/password."""
    ip_address = request_obj.client.host if request_obj.client else None
    user_agent = request_obj.headers.get("user-agent")
    
    try:
        user, tokens = await auth_service.signup_local(
            email=request.email,
            password=request.password,
            display_name=request.display_name,
        )
        # Log successful signup
        await log_auth_event(
            event_type=AuditEventType.AUTH_SIGNUP,
            user_id=user.user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"email_hash": _hash_email_for_audit(user.email), "outcome": "success"},
        )
    except UserExistsError as e:
        # Log failed signup attempt
        await log_auth_event(
            event_type=AuditEventType.AUTH_SIGNUP,
            user_id=None,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"email_hash": _hash_email_for_audit(request.email), "outcome": "failure", "reason": "user_exists"},
        )
        raise ConflictError(message=str(e), code=e.code)

    return AuthResponse(
        user=UserResponse(
            user_id=user.user_id,
            email=user.email,
            display_name=user.display_name,
            email_verified=user.email_verified,
            workspace_id=user.workspace_id,
        ),
        tokens=TokenResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            token_type=tokens.token_type,
            expires_in=tokens.expires_in,
        ),
    )


@router.post(
    "/login",
    response_model=AuthResponse,
    responses={401: {"model": ErrorResponse}},
    summary="Login with email/password",
    description="Authenticate user with email and password.",
)
async def login(
    request_obj: Request,
    request: LoginRequest,
    auth_service: AuthServiceDep,
) -> AuthResponse:
    """Authenticate with email/password."""
    ip_address = request_obj.client.host if request_obj.client else None
    user_agent = request_obj.headers.get("user-agent")
    
    try:
        user, tokens = await auth_service.login_local(
            email=request.email,
            password=request.password,
            workspace_id=request.workspace_id,
        )
        # Log successful login (non-blocking, don't fail on error)
        try:
            await log_auth_event(
                event_type=AuditEventType.AUTH_LOGIN,
                user_id=user.user_id,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"email_hash": _hash_email_for_audit(user.email), "outcome": "success", "workspace_id": str(user.workspace_id)},
            )
        except Exception as log_error:
            logger.warning(f"Failed to log auth event: {log_error}")
    except (InvalidCredentialsError, AuthError) as e:
        # Log failed login attempt (non-blocking)
        try:
            await log_auth_event(
                event_type=AuditEventType.AUTH_LOGIN,
                user_id=None,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"email_hash": _hash_email_for_audit(request.email), "outcome": "failure", "reason": e.code},
            )
        except Exception:
            pass  # Don't fail on audit log errors
        raise UnauthorizedError(message=str(e), code=e.code)
    except Exception as e:
        logger.error(f"CRITICAL LOGIN ERROR: {type(e).__name__}: {repr(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise InternalError(f"Login failed: {type(e).__name__} - {str(e)}")

    return AuthResponse(
        user=UserResponse(
            user_id=user.user_id,
            email=user.email,
            display_name=user.display_name,
            email_verified=user.email_verified,
            workspace_id=user.workspace_id,
        ),
        tokens=TokenResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            token_type=tokens.token_type,
            expires_in=tokens.expires_in,
        ),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    responses={401: {"model": ErrorResponse}},
    summary="Refresh access token",
    description="Exchange refresh token for new token pair.",
)
async def refresh_token(
    request_obj: Request,
    request: RefreshTokenRequest,
    auth_service: AuthServiceDep,
) -> TokenResponse:
    """Refresh access token using refresh token."""
    ip_address = request_obj.client.host if request_obj.client else None
    user_agent = request_obj.headers.get("user-agent")
    
    try:
        tokens = await auth_service.refresh_token(request.refresh_token)
        # Log successful token refresh
        await log_auth_event(
            event_type=AuditEventType.AUTH_TOKEN_REFRESH,
            user_id=None,  # We don't have user_id here without decoding
            ip_address=ip_address,
            user_agent=user_agent,
            details={"outcome": "success"},
        )
    except (TokenExpiredError, TokenInvalidError, SessionRevokedError) as e:
        # Log failed token refresh
        await log_auth_event(
            event_type=AuditEventType.AUTH_TOKEN_REFRESH,
            user_id=None,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"outcome": "failure", "reason": e.code},
        )
        raise UnauthorizedError(message=str(e), code=e.code)

    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
        expires_in=tokens.expires_in,
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout",
    description="Invalidate refresh token and session.",
)
async def logout(
    request_obj: Request,
    request: LogoutRequest,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    """Logout and invalidate session."""
    ip_address = request_obj.client.host if request_obj.client else None
    user_agent = request_obj.headers.get("user-agent")
    
    await auth_service.logout(request.refresh_token)
    
    # Log logout event
    await log_auth_event(
        event_type=AuditEventType.AUTH_LOGOUT,
        user_id=None,  # We don't have user_id here without decoding
        ip_address=ip_address,
        user_agent=user_agent,
        details={"outcome": "success"},
    )
    
    return MessageResponse(message="Logged out successfully")


# ---------------------------------------------------------------------------
# Google OAuth endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/oauth/google/start",
    summary="Start Google OAuth",
    description="Redirect to Google OAuth authorization URL.",
)
async def oauth_google_start(
    oauth_service: OAuthServiceDep,
    redirect_uri: Optional[str] = Query(None, description="Frontend URL to redirect to after OAuth"),
) -> RedirectResponse:
    """Redirect to Google OAuth authorization URL."""
    url, state = await oauth_service.get_authorization_url(redirect_uri)
    return RedirectResponse(url=url, status_code=302)


@router.get(
    "/oauth/google/callback",
    summary="Google OAuth callback",
    description="Handle Google OAuth callback and redirect to frontend with tokens.",
)
async def oauth_google_callback(
    request_obj: Request,
    code: str = Query(..., description="Authorization code from Google"),
    state: str = Query(..., description="State parameter for CSRF protection"),
    oauth_service: OAuthServiceDep = None,
) -> RedirectResponse:
    """Handle Google OAuth callback and redirect to frontend."""
    ip_address = request_obj.client.host if request_obj.client else None
    user_agent = request_obj.headers.get("user-agent")

    if oauth_service is None:
        oauth_service = _get_oauth_service()

    # Get default frontend URL from config (uses public_url setting)
    settings = get_settings()
    default_frontend = f"{settings.public_url}/workspace"

    # Initialize frontend_redirect before try block to fix variable scope
    frontend_redirect: str = ""

    try:
        user, tokens, frontend_redirect = await oauth_service.handle_callback(code=code, state=state)
        # Log successful OAuth login
        await log_auth_event(
            event_type=AuditEventType.AUTH_OAUTH_CALLBACK,
            user_id=user.user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"provider": "google", "email_hash": _hash_email_for_audit(user.email), "outcome": "success"},
        )
    except (OAuthStateMismatchError, OAuthCodeExchangeError, OAuthUserInfoError, AuthError) as e:
        # Log failed OAuth attempt
        await log_auth_event(
            event_type=AuditEventType.AUTH_OAUTH_CALLBACK,
            user_id=None,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"provider": "google", "outcome": "failure", "reason": e.code},
        )
        # Redirect to frontend with error (use stored redirect or default)
        error_redirect = frontend_redirect if frontend_redirect else default_frontend
        error_params = urlencode({"error": e.code, "error_description": str(e)})
        return RedirectResponse(url=f"{error_redirect}?{error_params}", status_code=302)

    # Build redirect URL with tokens
    redirect_url = frontend_redirect or default_frontend
    params = urlencode({
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "token_type": tokens.token_type,
        "expires_in": tokens.expires_in,
        "user_id": str(user.user_id),
        "email": user.email,
        "display_name": user.display_name,
        "workspace_id": str(user.workspace_id) if user.workspace_id else "",
    })

    return RedirectResponse(url=f"{redirect_url}?{params}", status_code=302)


# ---------------------------------------------------------------------------
# Email verification (placeholder - full impl in email service)
# ---------------------------------------------------------------------------


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    responses={400: {"model": ErrorResponse}},
    summary="Verify email",
    description="Verify email address with token.",
)
async def verify_email(
    token: str = Query(..., description="Email verification token"),
) -> MessageResponse:
    """Verify email with token."""
    # TODO: Implement email verification service
    return MessageResponse(message="Email verification not yet implemented")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request password reset",
    description="Send password reset email.",
)
async def forgot_password(
    email: str = Query(..., description="User email address"),
) -> MessageResponse:
    """Request password reset."""
    # TODO: Implement password reset flow
    return MessageResponse(message="If the email exists, a reset link has been sent")


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    responses={400: {"model": ErrorResponse}},
    summary="Reset password",
    description="Reset password using token.",
)
async def reset_password(
    token: str = Query(..., description="Password reset token"),
    new_password: str = Query(..., min_length=8, description="New password"),
) -> MessageResponse:
    """Reset password with token."""
    # TODO: Implement password reset
    return MessageResponse(message="Password reset not yet implemented")
