"""RazorpayService: Payment integration with Razorpay.

Implements Requirements: 9.3 (Upgrade Plan via Razorpay)
Handles checkout sessions, webhooks, and subscription management.

Feature: 006-user-profile-sidebar
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

import razorpay
from razorpay.errors import BadRequestError, ServerError

from app.config.settings import get_settings
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class RazorpayError(Exception):
    """Base Razorpay error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class RazorpayConfigError(RazorpayError):
    """Razorpay not configured."""

    def __init__(self) -> None:
        super().__init__(
            "Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
            "RAZORPAY_NOT_CONFIGURED",
            503,
        )


class WebhookVerificationError(RazorpayError):
    """Webhook signature verification failed."""

    def __init__(self) -> None:
        super().__init__(
            "Webhook signature verification failed",
            "WEBHOOK_VERIFICATION_FAILED",
            400,
        )


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class CheckoutSession:
    """Razorpay checkout session data."""

    checkout_id: str
    order_id: str
    checkout_url: str
    amount: int  # In paise (INR subunit)
    currency: str
    workspace_id: uuid.UUID
    plan_id: uuid.UUID
    billing_cycle: str
    expires_at: datetime


@dataclass
class WebhookEvent:
    """Parsed webhook event."""

    event_type: str
    payment_id: str | None
    subscription_id: str | None
    order_id: str | None
    amount: int | None
    currency: str | None
    status: str | None
    metadata: dict[str, Any]


# ---------------------------------------------------------------------------
# RazorpayService
# ---------------------------------------------------------------------------


class RazorpayService:
    """Service for Razorpay payment integration.

    Handles:
    - Creating checkout sessions (hosted checkout page)
    - Verifying webhook signatures
    - Processing payment events
    - Managing subscriptions
    """

    def __init__(self):
        self._settings = get_settings()
        self._client: razorpay.Client | None = None

    # -----------------------------------------------------------------------
    # Properties
    # -----------------------------------------------------------------------

    @property
    def is_configured(self) -> bool:
        """Check if Razorpay credentials are configured."""
        return bool(
            self._settings.RAZORPAY_KEY_ID
            and self._settings.RAZORPAY_KEY_SECRET
        )

    @property
    def client(self) -> razorpay.Client:
        """Get or create Razorpay client."""
        if not self.is_configured:
            raise RazorpayConfigError()

        if self._client is None:
            self._client = razorpay.Client(
                auth=(
                    self._settings.RAZORPAY_KEY_ID,
                    self._settings.RAZORPAY_KEY_SECRET,
                )
            )
        return self._client

    # -----------------------------------------------------------------------
    # Checkout Session
    # -----------------------------------------------------------------------

    async def create_checkout_session(
        self,
        workspace_id: uuid.UUID,
        plan_id: uuid.UUID,
        billing_cycle: Literal["monthly", "annual"],
        success_url: str,
        cancel_url: str,
        customer_email: str | None = None,
        customer_name: str | None = None,
    ) -> CheckoutSession:
        """Create a Razorpay checkout session for plan upgrade.

        Creates an order and returns a checkout URL for the user to complete payment.

        Args:
            workspace_id: Workspace performing upgrade
            plan_id: Target plan UUID
            billing_cycle: 'monthly' or 'annual'
            success_url: Redirect URL on success
            cancel_url: Redirect URL on cancel
            customer_email: Optional customer email for receipt
            customer_name: Optional customer name

        Returns:
            CheckoutSession with order details and checkout URL
        """
        if not self.is_configured:
            raise RazorpayConfigError()

        pool = await get_postgres_pool()

        # Get plan details
        plan_row = await pool.fetchrow(
            """
            SELECT plan_id, code, name, price_monthly, price_annual, currency
            FROM plans WHERE plan_id = $1
            """,
            plan_id,
        )

        if not plan_row:
            raise RazorpayError(
                f"Plan {plan_id} not found",
                "PLAN_NOT_FOUND",
                404,
            )

        # Calculate amount based on billing cycle
        if billing_cycle == "annual" and plan_row["price_annual"]:
            amount = plan_row["price_annual"]
            description = f"{plan_row['name']} Plan - Annual"
        else:
            amount = plan_row["price_monthly"]
            description = f"{plan_row['name']} Plan - Monthly"

        # Convert to paise (1 INR = 100 paise)
        amount_paise = int(amount * 100)
        currency = plan_row["currency"]

        # Create Razorpay order
        try:
            order = self.client.order.create({
                "amount": amount_paise,
                "currency": currency.upper(),
                "receipt": f"ws_{workspace_id}_{plan_row['code']}_{billing_cycle}",
                "notes": {
                    "workspace_id": str(workspace_id),
                    "plan_id": str(plan_id),
                    "plan_code": plan_row["code"],
                    "billing_cycle": billing_cycle,
                    "success_url": success_url,
                    "cancel_url": cancel_url,
                },
            })
        except (BadRequestError, ServerError) as e:
            logger.error(
                "Failed to create Razorpay order",
                extra={
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                },
            )
            raise RazorpayError(
                "Failed to create checkout session",
                "RAZORPAY_ORDER_FAILED",
                502,
            )

        order_id = order["id"]
        expires_at = datetime.now(timezone.utc).replace(
            hour=23, minute=59, second=59
        )  # Orders expire EOD

        # Store checkout session in database for tracking
        checkout_id = str(uuid.uuid4())
        await pool.execute(
            """
            INSERT INTO checkout_sessions (
                checkout_id, workspace_id, plan_id, order_id,
                billing_cycle, amount, currency, status,
                success_url, cancel_url, expires_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            ON CONFLICT (checkout_id) DO NOTHING
            """,
            uuid.UUID(checkout_id),
            workspace_id,
            plan_id,
            order_id,
            billing_cycle,
            amount,
            currency,
            "pending",
            success_url,
            cancel_url,
            expires_at,
        )

        # Build checkout URL (Razorpay hosted checkout)
        # In production, this would redirect to a hosted checkout page
        # For custom implementation, frontend uses Razorpay.js with order_id
        checkout_url = self._build_checkout_url(
            order_id=order_id,
            key_id=self._settings.RAZORPAY_KEY_ID,
            amount=amount_paise,
            currency=currency,
            name="RawDrive",
            description=description,
            prefill_email=customer_email,
            prefill_name=customer_name,
            callback_url=success_url,
        )

        logger.info(
            "Created Razorpay checkout session",
            extra={
                "workspace_id": str(workspace_id),
                "order_id": order_id,
                "plan_code": plan_row["code"],
                "amount": str(amount),
            },
        )

        return CheckoutSession(
            checkout_id=checkout_id,
            order_id=order_id,
            checkout_url=checkout_url,
            amount=amount_paise,
            currency=currency,
            workspace_id=workspace_id,
            plan_id=plan_id,
            billing_cycle=billing_cycle,
            expires_at=expires_at,
        )

    def _build_checkout_url(
        self,
        order_id: str,
        key_id: str,
        amount: int,
        currency: str,
        name: str,
        description: str,
        prefill_email: str | None = None,
        prefill_name: str | None = None,
        callback_url: str | None = None,
    ) -> str:
        """Build Razorpay checkout URL with order parameters.

        Note: Razorpay typically uses client-side JS for checkout.
        This builds a URL that the frontend can use to initialize checkout.
        For server-to-server, we'd use Payment Links API instead.
        """
        # In practice, frontend initializes Razorpay.js with these params
        # Return a placeholder that includes the order_id
        # The frontend will extract order_id and call Razorpay.open()
        params = f"order_id={order_id}&key={key_id}"
        if callback_url:
            params += f"&callback_url={callback_url}"

        # This is a custom URL format that frontend interprets
        # Real implementation would use Payment Links for hosted checkout
        return f"razorpay://checkout?{params}"

    # -----------------------------------------------------------------------
    # Payment Verification
    # -----------------------------------------------------------------------

    async def verify_payment(
        self,
        order_id: str,
        payment_id: str,
        signature: str,
    ) -> bool:
        """Verify payment signature after checkout.

        Called by frontend after successful payment to verify authenticity.

        Args:
            order_id: Razorpay order ID
            payment_id: Razorpay payment ID
            signature: Signature from Razorpay callback

        Returns:
            True if signature is valid
        """
        if not self.is_configured:
            raise RazorpayConfigError()

        # Verify signature using HMAC SHA256
        body = f"{order_id}|{payment_id}"
        expected_signature = hmac.new(
            self._settings.RAZORPAY_KEY_SECRET.encode(),
            body.encode(),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(expected_signature, signature)

    async def confirm_payment(
        self,
        order_id: str,
        payment_id: str,
        signature: str,
    ) -> dict[str, Any]:
        """Confirm and process a successful payment.

        Verifies signature, updates subscription, and creates invoice.

        Args:
            order_id: Razorpay order ID
            payment_id: Razorpay payment ID
            signature: Signature from Razorpay callback

        Returns:
            Updated subscription status
        """
        # Verify signature
        if not await self.verify_payment(order_id, payment_id, signature):
            raise WebhookVerificationError()

        pool = await get_postgres_pool()

        # Get checkout session
        session = await pool.fetchrow(
            """
            SELECT workspace_id, plan_id, billing_cycle, amount, currency
            FROM checkout_sessions
            WHERE order_id = $1 AND status = 'pending'
            """,
            order_id,
        )

        if not session:
            raise RazorpayError(
                "Checkout session not found or already processed",
                "SESSION_NOT_FOUND",
                404,
            )

        workspace_id = session["workspace_id"]
        plan_id = session["plan_id"]

        # Update checkout session status
        await pool.execute(
            """
            UPDATE checkout_sessions SET
                status = 'completed',
                payment_id = $2,
                updated_at = NOW()
            WHERE order_id = $1
            """,
            order_id,
            payment_id,
        )

        # Update subscription
        from app.services.subscription_service import SubscriptionService

        subscription_service = SubscriptionService()

        # Get plan code
        plan = await pool.fetchrow(
            "SELECT code FROM plans WHERE plan_id = $1",
            plan_id,
        )

        status = await subscription_service.change_plan(
            workspace_id=workspace_id,
            new_plan_code=plan["code"],
            billing_provider="razorpay",
            billing_subscription_id=payment_id,
        )

        # Create invoice
        await self._create_invoice(
            workspace_id=workspace_id,
            payment_id=payment_id,
            amount=session["amount"],
            currency=session["currency"],
            plan_id=plan_id,
        )

        logger.info(
            "Payment confirmed and subscription updated",
            extra={
                "workspace_id": str(workspace_id),
                "payment_id": payment_id,
                "plan_id": str(plan_id),
            },
        )

        return {
            "status": "success",
            "workspace_id": str(workspace_id),
            "plan_id": str(plan_id),
        }

    async def _create_invoice(
        self,
        workspace_id: uuid.UUID,
        payment_id: str,
        amount: Decimal,
        currency: str,
        plan_id: uuid.UUID,
    ) -> None:
        """Create invoice record for successful payment."""
        pool = await get_postgres_pool()

        invoice_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        # Generate invoice number
        year_month = now.strftime("%Y%m")
        count_result = await pool.fetchrow(
            """
            SELECT COUNT(*) + 1 as num
            FROM invoices
            WHERE invoice_number LIKE $1
            """,
            f"INV-{year_month}%",
        )
        invoice_num = count_result["num"] if count_result else 1
        invoice_number = f"INV-{year_month}-{invoice_num:04d}"

        # Get subscription ID
        sub_row = await pool.fetchrow(
            "SELECT subscription_id FROM workspace_subscriptions WHERE workspace_id = $1",
            workspace_id,
        )

        await pool.execute(
            """
            INSERT INTO invoices (
                invoice_id, invoice_number, workspace_id, subscription_id,
                status, amount, currency, tax_amount,
                billing_period_start, billing_period_end,
                paid_at, razorpay_payment_id, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, NOW()
            )
            """,
            invoice_id,
            invoice_number,
            workspace_id,
            sub_row["subscription_id"] if sub_row else None,
            "paid",
            amount,
            currency,
            Decimal("0"),  # Tax handled separately if needed
            now,
            now.replace(day=1),  # Period end is next month
            now,
            payment_id,
        )

    # -----------------------------------------------------------------------
    # Webhook Handling
    # -----------------------------------------------------------------------

    def verify_webhook_signature(
        self,
        body: bytes,
        signature: str,
    ) -> bool:
        """Verify Razorpay webhook signature.

        Args:
            body: Raw request body bytes
            signature: X-Razorpay-Signature header value

        Returns:
            True if signature is valid
        """
        if not self._settings.RAZORPAY_WEBHOOK_SECRET:
            logger.warning("RAZORPAY_WEBHOOK_SECRET not configured")
            return False

        expected_signature = hmac.new(
            self._settings.RAZORPAY_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(expected_signature, signature)

    def parse_webhook_event(self, payload: dict[str, Any]) -> WebhookEvent:
        """Parse Razorpay webhook payload into structured event.

        Args:
            payload: Webhook JSON payload

        Returns:
            Parsed WebhookEvent
        """
        event_type = payload.get("event", "")
        entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        subscription = payload.get("payload", {}).get("subscription", {}).get("entity", {})

        return WebhookEvent(
            event_type=event_type,
            payment_id=entity.get("id"),
            subscription_id=subscription.get("id"),
            order_id=entity.get("order_id"),
            amount=entity.get("amount"),
            currency=entity.get("currency"),
            status=entity.get("status"),
            metadata=entity.get("notes", {}),
        )

    async def handle_webhook(
        self,
        body: bytes,
        signature: str,
    ) -> dict[str, Any]:
        """Process Razorpay webhook event.

        Verifies signature and routes to appropriate handler.

        Args:
            body: Raw request body
            signature: X-Razorpay-Signature header

        Returns:
            Processing result
        """
        # Verify signature
        if not self.verify_webhook_signature(body, signature):
            raise WebhookVerificationError()

        import json

        payload = json.loads(body)
        event = self.parse_webhook_event(payload)

        logger.info(
            "Processing Razorpay webhook",
            extra={
                "event_type": event.event_type,
                "payment_id": event.payment_id,
            },
        )

        # Route to handler based on event type
        handlers = {
            "payment.captured": self._handle_payment_captured,
            "payment.failed": self._handle_payment_failed,
            "subscription.charged": self._handle_subscription_charged,
            "subscription.cancelled": self._handle_subscription_cancelled,
            "subscription.paused": self._handle_subscription_paused,
            "subscription.resumed": self._handle_subscription_resumed,
        }

        handler = handlers.get(event.event_type)
        if handler:
            return await handler(event)

        logger.debug(f"Unhandled webhook event type: {event.event_type}")
        return {"status": "ignored", "event": event.event_type}

    async def _handle_payment_captured(self, event: WebhookEvent) -> dict[str, Any]:
        """Handle successful payment capture."""
        if not event.order_id:
            return {"status": "skipped", "reason": "no order_id"}

        pool = await get_postgres_pool()

        # Find checkout session
        session = await pool.fetchrow(
            """
            SELECT workspace_id, plan_id, status
            FROM checkout_sessions
            WHERE order_id = $1
            """,
            event.order_id,
        )

        if not session:
            logger.warning(f"No checkout session for order {event.order_id}")
            return {"status": "skipped", "reason": "session_not_found"}

        if session["status"] == "completed":
            return {"status": "skipped", "reason": "already_processed"}

        # Update session and subscription
        await pool.execute(
            """
            UPDATE checkout_sessions SET
                status = 'completed',
                payment_id = $2,
                updated_at = NOW()
            WHERE order_id = $1
            """,
            event.order_id,
            event.payment_id,
        )

        # Update subscription
        from app.services.subscription_service import SubscriptionService

        subscription_service = SubscriptionService()
        plan = await pool.fetchrow(
            "SELECT code FROM plans WHERE plan_id = $1",
            session["plan_id"],
        )

        if plan:
            await subscription_service.change_plan(
                workspace_id=session["workspace_id"],
                new_plan_code=plan["code"],
                billing_provider="razorpay",
                billing_subscription_id=event.payment_id,
            )

        logger.info(
            "Payment captured - subscription updated",
            extra={
                "workspace_id": str(session["workspace_id"]),
                "payment_id": event.payment_id,
            },
        )

        return {"status": "processed", "event": "payment.captured"}

    async def _handle_payment_failed(self, event: WebhookEvent) -> dict[str, Any]:
        """Handle failed payment."""
        if not event.order_id:
            return {"status": "skipped", "reason": "no order_id"}

        pool = await get_postgres_pool()

        await pool.execute(
            """
            UPDATE checkout_sessions SET
                status = 'failed',
                updated_at = NOW()
            WHERE order_id = $1
            """,
            event.order_id,
        )

        logger.warning(
            "Payment failed",
            extra={"order_id": event.order_id, "payment_id": event.payment_id},
        )

        return {"status": "processed", "event": "payment.failed"}

    async def _handle_subscription_charged(self, event: WebhookEvent) -> dict[str, Any]:
        """Handle recurring subscription charge."""
        # Create invoice for recurring payment
        if event.subscription_id:
            pool = await get_postgres_pool()

            # Find workspace by subscription ID
            workspace_row = await pool.fetchrow(
                """
                SELECT workspace_id, plan_id
                FROM workspace_subscriptions
                WHERE billing_subscription_id = $1
                """,
                event.subscription_id,
            )

            if workspace_row and event.amount:
                await self._create_invoice(
                    workspace_id=workspace_row["workspace_id"],
                    payment_id=event.payment_id or "",
                    amount=Decimal(event.amount) / 100,
                    currency=event.currency or "INR",
                    plan_id=workspace_row["plan_id"],
                )

        return {"status": "processed", "event": "subscription.charged"}

    async def _handle_subscription_cancelled(self, event: WebhookEvent) -> dict[str, Any]:
        """Handle subscription cancellation from Razorpay side."""
        if event.subscription_id:
            pool = await get_postgres_pool()

            await pool.execute(
                """
                UPDATE workspace_subscriptions SET
                    status = 'canceled',
                    cancel_at_period_end = FALSE,
                    updated_at = NOW()
                WHERE billing_subscription_id = $1
                """,
                event.subscription_id,
            )

            logger.info(
                "Subscription cancelled via webhook",
                extra={"subscription_id": event.subscription_id},
            )

        return {"status": "processed", "event": "subscription.cancelled"}

    async def _handle_subscription_paused(self, event: WebhookEvent) -> dict[str, Any]:
        """Handle subscription pause."""
        if event.subscription_id:
            pool = await get_postgres_pool()

            await pool.execute(
                """
                UPDATE workspace_subscriptions SET
                    status = 'past_due',
                    updated_at = NOW()
                WHERE billing_subscription_id = $1
                """,
                event.subscription_id,
            )

        return {"status": "processed", "event": "subscription.paused"}

    async def _handle_subscription_resumed(self, event: WebhookEvent) -> dict[str, Any]:
        """Handle subscription resume."""
        if event.subscription_id:
            pool = await get_postgres_pool()

            await pool.execute(
                """
                UPDATE workspace_subscriptions SET
                    status = 'active',
                    updated_at = NOW()
                WHERE billing_subscription_id = $1
                """,
                event.subscription_id,
            )

        return {"status": "processed", "event": "subscription.resumed"}


# ---------------------------------------------------------------------------
# Singleton instance
# ---------------------------------------------------------------------------


_razorpay_service: RazorpayService | None = None


def get_razorpay_service() -> RazorpayService:
    """Get singleton RazorpayService instance."""
    global _razorpay_service
    if _razorpay_service is None:
        _razorpay_service = RazorpayService()
    return _razorpay_service
