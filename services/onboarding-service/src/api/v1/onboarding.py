"""Onboarding API endpoints.

All routes prefixed with /api/v1/onboarding.
These endpoints handle the automated onboarding flow for new users.

Feature: Automated Onboarding System
Tasks: T016-T023 - Create onboarding API endpoints
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from src.services.onboarding_service import (
    get_onboarding_service,
    OnboardingService,
    OnboardingError,
    SessionNotFoundError,
    SessionExpiredError,
    InvalidStepError,
    EmailAlreadyExistsError,
    PlanNotFoundError,
    PaymentRequiredError,
    StartOnboardingRequest,
    SelectPlanRequest,
    RegisterRequest,
    GoogleAuthRequest,
    VerifyEmailRequest,
)


logger = logging.getLogger(__name__)


# =============================================================================
# ROUTER SETUP
# =============================================================================

router = APIRouter(
    prefix="",
    tags=["onboarding"],
)


# =============================================================================
# DEPENDENCIES
# =============================================================================


def _get_onboarding_service() -> OnboardingService:
    """Get onboarding service instance."""
    return get_onboarding_service()


OnboardingServiceDep = Annotated[OnboardingService, Depends(_get_onboarding_service)]

# Cookie name for session token
SESSION_COOKIE_NAME = "onboarding_session"


def get_session_token(
    session_token: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
    x_onboarding_token: Optional[str] = Header(None),
) -> Optional[str]:
    """Extract session token from cookie or header.

    Args:
        session_token: Token from cookie
        x_onboarding_token: Token from X-Onboarding-Token header

    Returns:
        Session token or None
    """
    return x_onboarding_token or session_token


SessionTokenDep = Annotated[Optional[str], Depends(get_session_token)]


# =============================================================================
# RESPONSE MODELS
# =============================================================================


class OnboardingStartResponse(BaseModel):
    """Response from starting onboarding."""

    session_id: str
    current_step: str
    expires_at: str


class OnboardingStatusResponse(BaseModel):
    """Response with full onboarding status."""

    session_id: str
    current_step: str
    steps_completed: dict[str, bool]
    status: str
    plan_id: Optional[str] = None
    billing_interval: str
    currency: str
    email_verified: bool
    payment_status: str
    registration_data: dict = {}
    expires_at: str
    created_at: str


class PaymentIntentResponse(BaseModel):
    """Response with Stripe payment intent."""

    client_secret: str
    payment_intent_id: str
    amount: int
    currency: str


class ConfirmPaymentRequest(BaseModel):
    """Request to confirm payment."""

    payment_intent_id: str


class CompleteOnboardingRequest(BaseModel):
    """Request to complete onboarding."""

    workspace_name: Optional[str] = None


class CompleteOnboardingResponse(BaseModel):
    """Response from completing onboarding."""

    user_id: str
    workspace_id: str
    subscription_id: Optional[str] = None
    redirect_url: str


class ErrorResponse(BaseModel):
    """Error response."""

    error: str
    code: str
    details: Optional[str] = None


# =============================================================================
# ERROR HANDLER
# =============================================================================


def handle_onboarding_error(e: OnboardingError) -> HTTPException:
    """Convert OnboardingError to HTTPException."""
    return HTTPException(
        status_code=e.status,
        detail={"error": e.message, "code": e.code},
    )


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.post(
    "/start",
    response_model=OnboardingStartResponse,
    summary="Start onboarding session",
    description="Create a new onboarding session. Sets a session cookie.",
)
async def start_onboarding(
    request: Request,
    response: Response,
    service: OnboardingServiceDep,
    body: Optional[StartOnboardingRequest] = None,
) -> OnboardingStartResponse:
    """Start a new onboarding session.

    Creates a new session and returns a session token.
    The token is also set as an httpOnly cookie.

    UTM parameters and referrer can be provided for analytics.
    """
    try:
        # Get client info
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        result = await service.start_onboarding(
            request=body or StartOnboardingRequest(),
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # Set session cookie
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=result.session_token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=86400,  # 24 hours
            path="/",
        )

        return OnboardingStartResponse(
            session_id=result.session_id,
            current_step=result.current_step,
            expires_at=result.expires_at,
        )
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.get(
    "/status",
    response_model=OnboardingStatusResponse,
    summary="Get onboarding status",
    description="Get current onboarding session status.",
)
async def get_onboarding_status(
    session_token: SessionTokenDep,
    service: OnboardingServiceDep,
) -> OnboardingStatusResponse:
    """Get current onboarding session status.

    Returns the current step, completed steps, and session data.
    Requires valid session token from cookie or header.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        result = await service.get_session(session_token)
        return OnboardingStatusResponse(**result.model_dump())
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    except SessionExpiredError:
        raise HTTPException(status_code=410, detail="Session has expired")
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.post(
    "/select-plan",
    response_model=OnboardingStatusResponse,
    summary="Select subscription plan",
    description="Select a subscription plan and billing interval.",
)
async def select_plan(
    session_token: SessionTokenDep,
    service: OnboardingServiceDep,
    body: SelectPlanRequest,
) -> OnboardingStatusResponse:
    """Select a subscription plan.

    Sets the selected plan and billing interval (monthly/annual).
    Advances to registration step.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        result = await service.select_plan(session_token, body)
        return OnboardingStatusResponse(**result.model_dump())
    except PlanNotFoundError:
        raise HTTPException(status_code=404, detail="Plan not found")
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.post(
    "/register",
    response_model=OnboardingStatusResponse,
    summary="Register new user",
    description="Register with email and password.",
)
async def register_user(
    session_token: SessionTokenDep,
    service: OnboardingServiceDep,
    body: RegisterRequest,
) -> OnboardingStatusResponse:
    """Register a new user with email/password.

    Creates the registration data and sends verification email.
    Advances to email_verification step.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        result = await service.register(session_token, body)
        return OnboardingStatusResponse(**result.model_dump())
    except InvalidStepError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except EmailAlreadyExistsError:
        raise HTTPException(
            status_code=409,
            detail={"error": "Email already registered", "code": "EMAIL_EXISTS"},
        )
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.post(
    "/register/google",
    response_model=OnboardingStatusResponse,
    summary="Register with Google",
    description="Register using Google OAuth.",
)
async def register_google(
    session_token: SessionTokenDep,
    service: OnboardingServiceDep,
    body: GoogleAuthRequest,
) -> OnboardingStatusResponse:
    """Register a new user via Google OAuth.

    Google users skip email verification as their email is pre-verified.
    Advances directly to payment step.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        result = await service.register_google(session_token, body)
        return OnboardingStatusResponse(**result.model_dump())
    except EmailAlreadyExistsError:
        raise HTTPException(
            status_code=409,
            detail={"error": "Email already registered", "code": "EMAIL_EXISTS"},
        )
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.post(
    "/verify-email",
    response_model=OnboardingStatusResponse,
    summary="Verify email",
    description="Verify email with token from email link.",
)
async def verify_email(
    session_token: SessionTokenDep,
    service: OnboardingServiceDep,
    body: VerifyEmailRequest,
) -> OnboardingStatusResponse:
    """Verify email with token.

    Token is sent via email after registration.
    Advances to payment step on success.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        result = await service.verify_email(session_token, body)
        return OnboardingStatusResponse(**result.model_dump())
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.post(
    "/resend-verification",
    response_model=OnboardingStatusResponse,
    summary="Resend verification email",
    description="Resend email verification (rate limited).",
)
async def resend_verification(
    session_token: SessionTokenDep,
    service: OnboardingServiceDep,
) -> OnboardingStatusResponse:
    """Resend email verification.

    Rate limited to 1 per minute.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        result = await service.resend_verification(session_token)
        return OnboardingStatusResponse(**result.model_dump())
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.post(
    "/payment/create-intent",
    response_model=PaymentIntentResponse,
    summary="Create payment intent",
    description="Create Stripe payment intent for selected plan.",
)
async def create_payment_intent(
    session_token: SessionTokenDep,
    service: OnboardingServiceDep,
) -> PaymentIntentResponse:
    """Create a Stripe payment intent.

    Returns client_secret for Stripe.js to collect payment.
    Requires plan selection and email verification.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        result = await service.create_payment_intent(session_token)
        return PaymentIntentResponse(
            client_secret=result["client_secret"],
            payment_intent_id=result["payment_intent_id"],
            amount=result["amount"],
            currency=result["currency"],
        )
    except InvalidStepError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.post(
    "/payment/confirm",
    response_model=OnboardingStatusResponse,
    summary="Confirm payment",
    description="Confirm payment completion after Stripe.js success.",
)
async def confirm_payment(
    session_token: SessionTokenDep,
    service: OnboardingServiceDep,
    body: ConfirmPaymentRequest,
) -> OnboardingStatusResponse:
    """Confirm payment completion.

    Called after successful Stripe.js payment confirmation.
    Advances to workspace_setup step.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        result = await service.confirm_payment(
            session_token,
            body.payment_intent_id,
        )
        return OnboardingStatusResponse(**result.model_dump())
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.post(
    "/complete",
    response_model=CompleteOnboardingResponse,
    summary="Complete onboarding",
    description="Complete onboarding: create user, workspace, subscription.",
)
async def complete_onboarding(
    session_token: SessionTokenDep,
    response: Response,
    service: OnboardingServiceDep,
    body: Optional[CompleteOnboardingRequest] = None,
) -> CompleteOnboardingResponse:
    """Complete the onboarding process.

    Creates the user account, workspace, and subscription.
    Returns user_id, workspace_id, and redirect URL.
    Clears the onboarding session cookie.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        result = await service.complete_onboarding(
            session_token,
            workspace_name=body.workspace_name if body else None,
        )

        # Clear onboarding session cookie
        response.delete_cookie(SESSION_COOKIE_NAME, path="/")

        return CompleteOnboardingResponse(**result)
    except PaymentRequiredError:
        raise HTTPException(status_code=402, detail="Payment required")
    except OnboardingError as e:
        raise handle_onboarding_error(e)


@router.delete(
    "/abandon",
    summary="Abandon session",
    description="Mark session as abandoned.",
)
async def abandon_session(
    session_token: SessionTokenDep,
    response: Response,
    service: OnboardingServiceDep,
) -> dict:
    """Abandon the current onboarding session.

    Marks the session as abandoned for analytics.
    Clears the session cookie.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="No onboarding session")

    try:
        await service.abandon_session(session_token)
        response.delete_cookie(SESSION_COOKIE_NAME, path="/")
        return {"status": "abandoned"}
    except SessionNotFoundError:
        # Already gone, just clear cookie
        response.delete_cookie(SESSION_COOKIE_NAME, path="/")
        return {"status": "not_found"}
    except OnboardingError as e:
        raise handle_onboarding_error(e)
