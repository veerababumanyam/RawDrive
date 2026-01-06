"""Service for orchestrating the onboarding flow.

This module provides the OnboardingService class that handles all business logic
for the automated onboarding flow including:
- Session management
- Plan selection
- User registration
- Email verification
- Payment processing
- Workspace setup

Feature: Automated Onboarding System
Task: T014 - Create OnboardingService for flow orchestration
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from src.repositories.onboarding_repository import get_onboarding_repository
from src.repositories.plan_repository import get_plan_repository
from src.repositories.subscription_repository import get_subscription_repository


logger = logging.getLogger(__name__)


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


class StartOnboardingRequest(BaseModel):
    """Request to start a new onboarding session."""

    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_content: Optional[str] = None
    utm_term: Optional[str] = None
    referrer_url: Optional[str] = None
    landing_page: Optional[str] = None
    promo_code: Optional[str] = None


class StartOnboardingResponse(BaseModel):
    """Response from starting onboarding session."""

    session_token: str
    session_id: str
    current_step: str
    expires_at: str


class SelectPlanRequest(BaseModel):
    """Request to select a subscription plan."""

    plan_id: str
    billing_interval: str = Field(default="monthly", pattern="^(monthly|annual)$")


class RegisterRequest(BaseModel):
    """Request to register a new user."""

    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=200)
    business_name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = None
    accept_terms: bool = True
    accept_privacy: bool = True
    marketing_consent: bool = False


class GoogleAuthRequest(BaseModel):
    """Request to register via Google OAuth."""

    access_token: str
    id_token: Optional[str] = None
    accept_terms: bool = True
    accept_privacy: bool = True
    marketing_consent: bool = False


class VerifyEmailRequest(BaseModel):
    """Request to verify email with token."""

    token: str


class OnboardingSessionResponse(BaseModel):
    """Full onboarding session response."""

    session_id: str
    current_step: str
    steps_completed: dict[str, bool]
    status: str
    plan_id: Optional[str] = None
    billing_interval: str
    currency: str
    email_verified: bool
    payment_status: str
    registration_data: dict[str, Any] = {}
    expires_at: str
    created_at: str


# =============================================================================
# EXCEPTIONS
# =============================================================================


class OnboardingError(Exception):
    """Base exception for onboarding errors."""

    def __init__(self, message: str, code: str = "ONBOARDING_ERROR", status: int = 400):
        self.message = message
        self.code = code
        self.status = status
        super().__init__(message)


class SessionNotFoundError(OnboardingError):
    """Session not found or expired."""

    def __init__(self, message: str = "Onboarding session not found or expired"):
        super().__init__(message, "SESSION_NOT_FOUND", 404)


class SessionExpiredError(OnboardingError):
    """Session has expired."""

    def __init__(self, message: str = "Onboarding session has expired"):
        super().__init__(message, "SESSION_EXPIRED", 410)


class InvalidStepError(OnboardingError):
    """Invalid step transition."""

    def __init__(self, message: str = "Invalid step transition"):
        super().__init__(message, "INVALID_STEP", 400)


class EmailAlreadyExistsError(OnboardingError):
    """Email already registered."""

    def __init__(self, message: str = "Email is already registered"):
        super().__init__(message, "EMAIL_EXISTS", 409)


class PlanNotFoundError(OnboardingError):
    """Plan not found."""

    def __init__(self, message: str = "Subscription plan not found"):
        super().__init__(message, "PLAN_NOT_FOUND", 404)


class PaymentRequiredError(OnboardingError):
    """Payment required to proceed."""

    def __init__(self, message: str = "Payment is required to proceed"):
        super().__init__(message, "PAYMENT_REQUIRED", 402)


# =============================================================================
# ONBOARDING SERVICE
# =============================================================================


class OnboardingService:
    """Service for managing the onboarding flow.

    This service orchestrates the complete onboarding process:
    1. Session creation and management
    2. Plan selection
    3. User registration (email/password or OAuth)
    4. Email verification
    5. Payment processing
    6. Workspace creation and setup

    Thread-safe and suitable for concurrent use.
    """

    # Step order for validation
    STEP_ORDER = [
        "plan_selection",
        "registration",
        "email_verification",
        "payment",
        "workspace_setup",
        "completed",
    ]

    def __init__(self):
        """Initialize the onboarding service."""
        self._onboarding_repo = get_onboarding_repository()
        self._plan_repo = get_plan_repository()
        self._subscription_repo = get_subscription_repository()

    # =========================================================================
    # SESSION MANAGEMENT
    # =========================================================================

    async def start_onboarding(
        self,
        request: StartOnboardingRequest,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> StartOnboardingResponse:
        """Start a new onboarding session.

        Args:
            request: Start onboarding request with UTM params
            ip_address: Client IP address
            user_agent: Client user agent

        Returns:
            StartOnboardingResponse with session token
        """
        session, token = await self._onboarding_repo.create(
            ip_address=ip_address,
            user_agent=user_agent,
            utm_source=request.utm_source,
            utm_medium=request.utm_medium,
            utm_campaign=request.utm_campaign,
            utm_content=request.utm_content,
            utm_term=request.utm_term,
            referrer_url=request.referrer_url,
            landing_page=request.landing_page,
            promo_code=request.promo_code,
        )

        return StartOnboardingResponse(
            session_token=token,
            session_id=session["session_id"],
            current_step=session["current_step"],
            expires_at=session["expires_at"],
        )

    async def get_session(self, session_token: str) -> OnboardingSessionResponse:
        """Get current onboarding session status.

        Args:
            session_token: Session token from cookie/header

        Returns:
            OnboardingSessionResponse with current status

        Raises:
            SessionNotFoundError: If session not found or expired
        """
        session = await self._onboarding_repo.get_by_token(session_token)
        if not session:
            raise SessionNotFoundError()

        # Sanitize registration data (remove password)
        reg_data = session.get("registration_data", {}).copy()
        reg_data.pop("password", None)
        reg_data.pop("password_hash", None)

        return OnboardingSessionResponse(
            session_id=session["session_id"],
            current_step=session["current_step"],
            steps_completed=session["steps_completed"],
            status=session["status"],
            plan_id=session.get("plan_id"),
            billing_interval=session["billing_interval"],
            currency=session["currency"],
            email_verified=session["email_verified"],
            payment_status=session["payment_status"],
            registration_data=reg_data,
            expires_at=session["expires_at"],
            created_at=session["created_at"],
        )

    async def _get_session_or_fail(self, session_token: str) -> dict[str, Any]:
        """Get session or raise error.

        Args:
            session_token: Session token

        Returns:
            Session dict

        Raises:
            SessionNotFoundError: If not found
            SessionExpiredError: If expired
        """
        session = await self._onboarding_repo.get_by_token(session_token)
        if not session:
            raise SessionNotFoundError()

        if session["status"] == "expired":
            raise SessionExpiredError()

        if session["status"] != "active":
            raise OnboardingError(
                f"Session is {session['status']}",
                "SESSION_INVALID",
                400,
            )

        return session

    # =========================================================================
    # PLAN SELECTION
    # =========================================================================

    async def select_plan(
        self,
        session_token: str,
        request: SelectPlanRequest,
    ) -> OnboardingSessionResponse:
        """Select a subscription plan.

        Args:
            session_token: Session token
            request: Plan selection request

        Returns:
            Updated session response

        Raises:
            SessionNotFoundError: If session not found
            PlanNotFoundError: If plan not found
        """
        session = await self._get_session_or_fail(session_token)

        # Validate plan exists and is active
        plan = await self._plan_repo.get_by_id(UUID(request.plan_id))
        if not plan or plan.get("status") != "active":
            raise PlanNotFoundError()

        # Determine price based on billing interval and currency
        currency = session.get("currency", "INR")
        if request.billing_interval == "annual":
            price_key = "price_annual_usd" if currency == "USD" else "price_annual"
        else:
            price_key = "price_monthly_usd" if currency == "USD" else "price_monthly"

        amount = plan.get(price_key) or plan.get("price_monthly")

        # Update session with plan selection
        updated = await self._onboarding_repo.update(
            session_id=UUID(session["session_id"]),
            plan_id=UUID(request.plan_id),
            billing_interval=request.billing_interval,
            current_step="registration",
            steps_completed={
                **session["steps_completed"],
                "plan_selection": True,
            },
            metadata={
                **session.get("metadata", {}),
                "selected_plan_code": plan.get("code"),
                "selected_plan_name": plan.get("name"),
                "selected_amount": str(amount),
            },
        )

        return await self.get_session(session_token)

    # =========================================================================
    # USER REGISTRATION
    # =========================================================================

    async def register(
        self,
        session_token: str,
        request: RegisterRequest,
    ) -> OnboardingSessionResponse:
        """Register a new user with email/password.

        Args:
            session_token: Session token
            request: Registration request

        Returns:
            Updated session response

        Raises:
            SessionNotFoundError: If session not found
            InvalidStepError: If not at registration step
            EmailAlreadyExistsError: If email already registered
        """
        session = await self._get_session_or_fail(session_token)

        # Validate step
        if not session["steps_completed"].get("plan_selection"):
            raise InvalidStepError("Please select a plan first")

        # Check if email already exists
        from src.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                "SELECT user_id FROM users WHERE email = $1",
                request.email.lower(),
            )
            if existing:
                raise EmailAlreadyExistsError()

        # Hash password for storage
        import argon2

        hasher = argon2.PasswordHasher()
        password_hash = hasher.hash(request.password)

        # Store registration data
        registration_data = {
            "email": request.email.lower(),
            "full_name": request.full_name,
            "business_name": request.business_name,
            "phone": request.phone,
            "password_hash": password_hash,
            "accept_terms": request.accept_terms,
            "accept_privacy": request.accept_privacy,
            "marketing_consent": request.marketing_consent,
        }

        # Update session
        await self._onboarding_repo.update(
            session_id=UUID(session["session_id"]),
            registration_method="email",
            registration_data=registration_data,
            current_step="email_verification",
            steps_completed={
                **session["steps_completed"],
                "registration": True,
            },
        )

        # Send verification email
        await self._send_verification_email(
            session_id=UUID(session["session_id"]),
            email=request.email.lower(),
        )

        return await self.get_session(session_token)

    async def register_google(
        self,
        session_token: str,
        request: GoogleAuthRequest,
    ) -> OnboardingSessionResponse:
        """Register a new user via Google OAuth.

        Args:
            session_token: Session token
            request: Google auth request

        Returns:
            Updated session response

        Raises:
            SessionNotFoundError: If session not found
            InvalidStepError: If not at registration step
            OnboardingError: If Google auth fails
        """
        session = await self._get_session_or_fail(session_token)

        # Validate step
        if not session["steps_completed"].get("plan_selection"):
            raise InvalidStepError("Please select a plan first")

        # Verify Google token and get user info
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests as google_requests

            # Verify the ID token
            idinfo = id_token.verify_oauth2_token(
                request.id_token or request.access_token,
                google_requests.Request(),
            )

            email = idinfo.get("email")
            full_name = idinfo.get("name", "")
            google_user_id = idinfo.get("sub")

            if not email:
                raise OnboardingError(
                    "Could not get email from Google",
                    "GOOGLE_AUTH_ERROR",
                    400,
                )

        except Exception as e:
            logger.error(f"Google auth error: {e}")
            raise OnboardingError(
                "Google authentication failed",
                "GOOGLE_AUTH_ERROR",
                400,
            )

        # Check if email already exists
        from src.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                "SELECT user_id FROM users WHERE email = $1",
                email.lower(),
            )
            if existing:
                raise EmailAlreadyExistsError()

        # Store registration data
        registration_data = {
            "email": email.lower(),
            "full_name": full_name,
            "google_user_id": google_user_id,
            "accept_terms": request.accept_terms,
            "accept_privacy": request.accept_privacy,
            "marketing_consent": request.marketing_consent,
        }

        # Update session - Google users skip email verification
        await self._onboarding_repo.update(
            session_id=UUID(session["session_id"]),
            registration_method="google",
            registration_data=registration_data,
            email_verified=True,  # Google emails are pre-verified
            current_step="payment",
            steps_completed={
                **session["steps_completed"],
                "registration": True,
                "email_verification": True,
            },
        )

        return await self.get_session(session_token)

    # =========================================================================
    # EMAIL VERIFICATION
    # =========================================================================

    async def _send_verification_email(
        self,
        session_id: UUID,
        email: str,
    ) -> None:
        """Send email verification.

        Args:
            session_id: Onboarding session ID
            email: Email to verify
        """
        # Generate verification token
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        from src.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Create verification record
            await conn.execute(
                """
                INSERT INTO email_verifications (
                    verification_id, user_id, email, token_hash,
                    verification_type, onboarding_session_id, expires_at
                ) VALUES (
                    gen_random_uuid(), gen_random_uuid(), $1, $2, 'email_verification', $3,
                    NOW() + INTERVAL '24 hours'
                )
                """,
                email,
                token_hash,
                session_id,
            )

        # Update session
        await self._onboarding_repo.update(
            session_id=session_id,
            email_verification_sent_at=datetime.now(timezone.utc),
        )

        # TODO: Send actual email via email service
        # For now, log the token for development
        logger.info(
            f"Email verification token for {email}: {token}",
            extra={"email": email, "session_id": str(session_id)},
        )

    async def verify_email(
        self,
        session_token: str,
        request: VerifyEmailRequest,
    ) -> OnboardingSessionResponse:
        """Verify email with token.

        Args:
            session_token: Session token
            request: Verification request with token

        Returns:
            Updated session response

        Raises:
            SessionNotFoundError: If session not found
            OnboardingError: If verification fails
        """
        session = await self._get_session_or_fail(session_token)

        # Hash the provided token
        token_hash = hashlib.sha256(request.token.encode()).hexdigest()

        # Look up verification record
        from src.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            verification = await conn.fetchrow(
                """
                SELECT * FROM email_verifications
                WHERE token_hash = $1
                  AND onboarding_session_id = $2
                  AND status = 'pending'
                  AND expires_at > NOW()
                """,
                token_hash,
                UUID(session["session_id"]),
            )

            if not verification:
                await self._onboarding_repo.increment_error(
                    UUID(session["session_id"]),
                    "Invalid or expired verification token",
                )
                raise OnboardingError(
                    "Invalid or expired verification token",
                    "INVALID_TOKEN",
                    400,
                )

            # Mark verification as complete
            await conn.execute(
                """
                UPDATE email_verifications
                SET status = 'verified', verified_at = NOW()
                WHERE verification_id = $1
                """,
                verification["verification_id"],
            )

        # Update session
        await self._onboarding_repo.update(
            session_id=UUID(session["session_id"]),
            email_verified=True,
            current_step="payment",
            steps_completed={
                **session["steps_completed"],
                "email_verification": True,
            },
        )

        return await self.get_session(session_token)

    async def resend_verification(
        self,
        session_token: str,
    ) -> OnboardingSessionResponse:
        """Resend email verification.

        Args:
            session_token: Session token

        Returns:
            Updated session response

        Raises:
            SessionNotFoundError: If session not found
            OnboardingError: If cannot resend
        """
        session = await self._get_session_or_fail(session_token)

        if session["email_verified"]:
            raise OnboardingError("Email already verified", "ALREADY_VERIFIED", 400)

        email = session.get("registration_data", {}).get("email")
        if not email:
            raise OnboardingError("No email to verify", "NO_EMAIL", 400)

        # Rate limit: 1 per minute
        last_sent = session.get("email_verification_sent_at")
        if last_sent:
            last_sent_dt = datetime.fromisoformat(last_sent)
            if datetime.now(timezone.utc) - last_sent_dt < timedelta(minutes=1):
                raise OnboardingError(
                    "Please wait before requesting another verification email",
                    "RATE_LIMITED",
                    429,
                )

        await self._send_verification_email(
            session_id=UUID(session["session_id"]),
            email=email,
        )

        return await self.get_session(session_token)

    # =========================================================================
    # PAYMENT
    # =========================================================================

    async def create_payment_intent(
        self,
        session_token: str,
    ) -> dict[str, Any]:
        """Create a Stripe payment intent for the selected plan.

        Args:
            session_token: Session token

        Returns:
            Dict with client_secret and payment_intent_id

        Raises:
            SessionNotFoundError: If session not found
            InvalidStepError: If not ready for payment
            OnboardingError: If payment creation fails
        """
        session = await self._get_session_or_fail(session_token)

        # Validate prerequisites
        if not session.get("plan_id"):
            raise InvalidStepError("Please select a plan first")

        if not session["email_verified"]:
            raise InvalidStepError("Please verify your email first")

        # Get plan details
        plan = await self._plan_repo.get_by_id(UUID(session["plan_id"]))
        if not plan:
            raise PlanNotFoundError()

        # Calculate amount
        currency = session.get("currency", "INR")
        billing_interval = session.get("billing_interval", "monthly")

        if billing_interval == "annual":
            price_key = "price_annual_usd" if currency == "USD" else "price_annual"
        else:
            price_key = "price_monthly_usd" if currency == "USD" else "price_monthly"

        amount = plan.get(price_key) or plan.get("price_monthly")

        # Convert to smallest currency unit (paise for INR, cents for USD)
        amount_in_cents = int(float(amount) * 100)

        # Create Stripe payment intent
        try:
            import stripe
            import os

            stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

            if not stripe.api_key:
                raise OnboardingError(
                    "Payment processing not configured",
                    "PAYMENT_CONFIG_ERROR",
                    503,
                )

            email = session.get("registration_data", {}).get("email")
            full_name = session.get("registration_data", {}).get("full_name", "")

            # Create or get Stripe customer
            customers = stripe.Customer.list(email=email, limit=1)
            if customers.data:
                customer = customers.data[0]
            else:
                customer = stripe.Customer.create(
                    email=email,
                    name=full_name,
                    metadata={
                        "onboarding_session_id": session["session_id"],
                    },
                )

            # Create payment intent
            payment_intent = stripe.PaymentIntent.create(
                amount=amount_in_cents,
                currency=currency.lower(),
                customer=customer.id,
                metadata={
                    "onboarding_session_id": session["session_id"],
                    "plan_id": session["plan_id"],
                    "plan_code": plan.get("code"),
                    "billing_interval": billing_interval,
                },
                automatic_payment_methods={"enabled": True},
            )

            # Update session with payment intent
            await self._onboarding_repo.update(
                session_id=UUID(session["session_id"]),
                stripe_payment_intent_id=payment_intent.id,
                payment_status="pending",
            )

            return {
                "client_secret": payment_intent.client_secret,
                "payment_intent_id": payment_intent.id,
                "amount": amount_in_cents,
                "currency": currency,
                "customer_id": customer.id,
            }

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error: {e}")
            raise OnboardingError(
                "Payment processing failed",
                "PAYMENT_ERROR",
                500,
            )

    async def confirm_payment(
        self,
        session_token: str,
        payment_intent_id: str,
    ) -> OnboardingSessionResponse:
        """Confirm payment completion and update session.

        Called after Stripe payment confirmation on frontend.

        Args:
            session_token: Session token
            payment_intent_id: Stripe payment intent ID

        Returns:
            Updated session response

        Raises:
            SessionNotFoundError: If session not found
            OnboardingError: If payment not confirmed
        """
        session = await self._get_session_or_fail(session_token)

        # Verify payment with Stripe
        try:
            import stripe
            import os

            stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

            payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)

            if payment_intent.status != "succeeded":
                raise OnboardingError(
                    f"Payment not completed: {payment_intent.status}",
                    "PAYMENT_INCOMPLETE",
                    400,
                )

            # Verify it matches our session
            if payment_intent.metadata.get("onboarding_session_id") != session["session_id"]:
                raise OnboardingError(
                    "Payment intent mismatch",
                    "PAYMENT_MISMATCH",
                    400,
                )

        except stripe.error.StripeError as e:
            logger.error(f"Stripe verification error: {e}")
            raise OnboardingError(
                "Could not verify payment",
                "PAYMENT_VERIFICATION_ERROR",
                500,
            )

        # Update session
        await self._onboarding_repo.update(
            session_id=UUID(session["session_id"]),
            payment_status="succeeded",
            current_step="workspace_setup",
            steps_completed={
                **session["steps_completed"],
                "payment": True,
            },
        )

        return await self.get_session(session_token)

    # =========================================================================
    # WORKSPACE SETUP / COMPLETION
    # =========================================================================

    async def complete_onboarding(
        self,
        session_token: str,
        workspace_name: Optional[str] = None,
    ) -> dict[str, Any]:
        """Complete onboarding: create user, workspace, and subscription.

        Args:
            session_token: Session token
            workspace_name: Optional workspace name (defaults to business name)

        Returns:
            Dict with user_id, workspace_id, and redirect URL

        Raises:
            SessionNotFoundError: If session not found
            InvalidStepError: If prerequisites not met
        """
        session = await self._get_session_or_fail(session_token)

        # Validate all steps completed
        if session["payment_status"] != "succeeded":
            raise PaymentRequiredError()

        reg_data = session.get("registration_data", {})
        email = reg_data.get("email")
        full_name = reg_data.get("full_name", "")
        password_hash = reg_data.get("password_hash")
        business_name = reg_data.get("business_name") or workspace_name or full_name

        from src.db.postgres import get_postgres_pool
        from uuid import uuid4

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Create user
                user_id = uuid4()
                await conn.execute(
                    """
                    INSERT INTO users (
                        user_id, email, password_hash, full_name,
                        email_verified, is_active, created_at
                    ) VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
                    """,
                    user_id,
                    email,
                    password_hash,
                    full_name,
                    session["email_verified"],
                )

                # Create workspace
                workspace_id = uuid4()
                await conn.execute(
                    """
                    INSERT INTO workspaces (
                        workspace_id, name, owner_id, created_at
                    ) VALUES ($1, $2, $3, NOW())
                    """,
                    workspace_id,
                    business_name,
                    user_id,
                )

                # Add user as workspace owner
                await conn.execute(
                    """
                    INSERT INTO workspace_members (
                        workspace_id, user_id, role, created_at
                    ) VALUES ($1, $2, 'owner', NOW())
                    """,
                    workspace_id,
                    user_id,
                )

        # Create subscription
        plan_id = UUID(session["plan_id"])
        billing_interval = session.get("billing_interval", "monthly")
        plan = await self._plan_repo.get_by_id(plan_id)

        # Calculate billing period
        now = datetime.now(timezone.utc)
        if billing_interval == "annual":
            period_end = now + timedelta(days=365)
        else:
            period_end = now + timedelta(days=30)

        subscription = await self._subscription_repo.create(
            workspace_id=workspace_id,
            plan_id=plan_id,
            status="active",
            billing_interval=billing_interval,
            currency=session.get("currency", "INR"),
            current_period_start=now,
            current_period_end=period_end,
            stripe_customer_id=session.get("registration_data", {}).get("stripe_customer_id"),
            metadata={
                "onboarding_session_id": session["session_id"],
                "utm_source": session.get("utm_source"),
                "utm_campaign": session.get("utm_campaign"),
                "promo_code": session.get("promo_code"),
            },
        )

        # Mark session as completed
        await self._onboarding_repo.complete(
            session_id=UUID(session["session_id"]),
            user_id=user_id,
            workspace_id=workspace_id,
        )

        # Record user consents
        await self._record_consents(
            user_id=user_id,
            session_id=UUID(session["session_id"]),
            reg_data=reg_data,
        )

        logger.info(
            "Onboarding completed",
            extra={
                "session_id": session["session_id"],
                "user_id": str(user_id),
                "workspace_id": str(workspace_id),
                "plan_code": plan.get("code") if plan else None,
            },
        )

        return {
            "user_id": str(user_id),
            "workspace_id": str(workspace_id),
            "subscription_id": subscription.get("subscription_id"),
            "redirect_url": "/workspace",
        }

    async def _record_consents(
        self,
        user_id: UUID,
        session_id: UUID,
        reg_data: dict[str, Any],
    ) -> None:
        """Record user consents for GDPR compliance.

        Args:
            user_id: User ID
            session_id: Onboarding session ID
            reg_data: Registration data with consent flags
        """
        from src.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        consents = []

        if reg_data.get("accept_terms"):
            consents.append(("terms_of_service", True, True))
        if reg_data.get("accept_privacy"):
            consents.append(("privacy_policy", True, True))
        if reg_data.get("marketing_consent"):
            consents.append(("marketing_emails", True, False))

        async with pool.acquire() as conn:
            for consent_type, granted, required in consents:
                await conn.execute(
                    """
                    INSERT INTO user_consents (
                        consent_id, user_id, consent_type, document_version,
                        consent_granted, is_required, onboarding_session_id,
                        consent_source, capture_method, status
                    ) VALUES (
                        gen_random_uuid(), $1, $2, '1.0', $3, $4, $5,
                        'onboarding', 'checkbox', 'active'
                    )
                    """,
                    user_id,
                    consent_type,
                    granted,
                    required,
                    session_id,
                )

    # =========================================================================
    # ABANDON SESSION
    # =========================================================================

    async def abandon_session(self, session_token: str) -> None:
        """Mark a session as abandoned.

        Args:
            session_token: Session token

        Raises:
            SessionNotFoundError: If session not found
        """
        session = await self._onboarding_repo.get_by_token(session_token)
        if not session:
            raise SessionNotFoundError()

        await self._onboarding_repo.abandon(UUID(session["session_id"]))


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_onboarding_service: Optional[OnboardingService] = None


def get_onboarding_service() -> OnboardingService:
    """Get the singleton OnboardingService instance.

    Returns:
        OnboardingService singleton instance
    """
    global _onboarding_service
    if _onboarding_service is None:
        _onboarding_service = OnboardingService()
    return _onboarding_service
