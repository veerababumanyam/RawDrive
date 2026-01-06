"""Webhook handlers for Razorpay and Stripe with signature verification."""

import hmac
import hashlib
import logging
from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException, status, Depends

from src.config import settings
from src.database import get_connection

logger = logging.getLogger(__name__)

router = APIRouter()


def verify_razorpay_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify Razorpay webhook signature.

    Args:
        payload: Raw request body bytes
        signature: X-Razorpay-Signature header value
        secret: Razorpay webhook secret

    Returns:
        True if signature valid, False otherwise
    """
    expected_signature = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)


def verify_stripe_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify Stripe webhook signature.

    Stripe sends signature as:
    t=timestamp,v1=signature1,v1=signature2

    Args:
        payload: Raw request body bytes
        signature: Stripe-Signature header value
        secret: Stripe webhook secret

    Returns:
        True if signature valid, False otherwise
    """
    import stripe

    try:
        stripe.Webhook.construct_event(
            payload, signature, secret
        )
        return True
    except stripe.error.SignatureVerificationError:
        return False


@router.post("/razorpay")
async def handle_razorpay_webhook(request: Request):
    """Handle Razorpay webhook with signature verification.

    Processes payment events from Razorpay with idempotency.
    """
    # Get signature from headers
    signature = request.headers.get("X-Razorpay-Signature")
    if not signature:
        logger.warning("Razorpay webhook missing signature")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing signature"
        )

    # Get raw body for signature verification
    body = await request.body()

    # Verify signature
    if not verify_razorpay_signature(body, signature, settings.RAZORPAY_WEBHOOK_SECRET):
        logger.warning("Razorpay webhook signature verification failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature"
        )

    # Parse payload
    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse Razorpay webhook payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload"
        )

    event_type = payload.get("event")
    logger.info(f"Received Razorpay webhook: {event_type}")

    # Generate idempotency key from payment entity ID
    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    payment_id = payment_entity.get("id")

    if not payment_id:
        logger.error("Razorpay webhook missing payment ID")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing payment ID"
        )

    idempotency_key = f"razorpay:{event_type}:{payment_id}"

    # Check if already processed using payment_transactions table
    async with get_connection() as conn:
        existing = await conn.fetchrow(
            "SELECT transaction_id FROM payment_transactions WHERE idempotency_key = $1",
            idempotency_key
        )

        if existing:
            logger.info(f"Duplicate Razorpay webhook {idempotency_key}, skipping")
            return {"status": "duplicate", "message": "Event already processed"}

        # Record transaction
        await conn.execute(
            """
            INSERT INTO payment_transactions (
                provider, event_type, provider_reference_id,
                idempotency_key, payload, processed_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
            """,
            "razorpay",
            event_type,
            payment_id,
            idempotency_key,
            payload
        )

    # Process event based on type
    # TODO: Implement event handlers for different event types
    # - payment.captured -> activate subscription
    # - payment.failed -> mark subscription payment failed
    # - subscription.charged -> record invoice
    # - subscription.cancelled -> cancel subscription

    logger.info(f"Processed Razorpay webhook {idempotency_key}")
    return {"status": "processed", "event": event_type}


@router.post("/stripe")
async def handle_stripe_webhook(request: Request):
    """Handle Stripe webhook with signature verification.

    Processes payment events from Stripe with idempotency.
    """
    # Get signature from headers
    signature = request.headers.get("Stripe-Signature")
    if not signature:
        logger.warning("Stripe webhook missing signature")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing signature"
        )

    # Get raw body for signature verification
    body = await request.body()

    # Verify signature
    if not verify_stripe_signature(body, signature, settings.STRIPE_WEBHOOK_SECRET):
        logger.warning("Stripe webhook signature verification failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature"
        )

    # Parse payload
    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse Stripe webhook payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload"
        )

    event_type = payload.get("type")
    event_id = payload.get("id")

    logger.info(f"Received Stripe webhook: {event_type}")

    if not event_id:
        logger.error("Stripe webhook missing event ID")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing event ID"
        )

    idempotency_key = f"stripe:{event_id}"

    # Check if already processed
    async with get_connection() as conn:
        existing = await conn.fetchrow(
            "SELECT transaction_id FROM payment_transactions WHERE idempotency_key = $1",
            idempotency_key
        )

        if existing:
            logger.info(f"Duplicate Stripe webhook {idempotency_key}, skipping")
            return {"status": "duplicate", "message": "Event already processed"}

        # Record transaction
        await conn.execute(
            """
            INSERT INTO payment_transactions (
                provider, event_type, provider_reference_id,
                idempotency_key, payload, processed_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
            """,
            "stripe",
            event_type,
            event_id,
            idempotency_key,
            payload
        )

    # Process event based on type
    # TODO: Implement event handlers
    # - invoice.payment_succeeded -> activate subscription
    # - invoice.payment_failed -> mark payment failed
    # - customer.subscription.updated -> update subscription status
    # - customer.subscription.deleted -> cancel subscription

    logger.info(f"Processed Stripe webhook {idempotency_key}")
    return {"status": "processed", "event": event_type}
