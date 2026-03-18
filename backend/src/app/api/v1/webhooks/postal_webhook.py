"""Postal delivery webhook endpoint.

Receives delivery status callbacks from Postal and updates
email tracking status in Redis.
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.config.settings import get_settings
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Map Postal events to our tracking statuses
POSTAL_EVENT_MAP: dict[str, str] = {
    "MessageDelivered": "delivered",
    "MessageBounced": "bounced",
    "MessageDeliveryFailed": "failed",
    "MessageHeld": "pending",
    "MessageSent": "sent",
}


@router.post("/postal")
async def postal_webhook(request: Request) -> dict[str, str]:
    """Handle Postal delivery webhook callbacks.

    Postal sends webhook events for message delivery status changes.
    We validate the webhook signature (if configured) and update
    the email tracking status in Redis.
    """
    settings = get_settings()
    body = await request.body()

    # Validate webhook signature if secret is configured
    if settings.postal_webhook_secret:
        signature = request.headers.get("X-Postal-Signature", "")
        secret = settings.postal_webhook_secret.get_secret_value()
        expected = hmac.new(
            secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload: dict[str, Any] = json.loads(body)

    event_type = payload.get("event", "")
    event_payload = payload.get("payload", {})
    message_data = event_payload.get("message", {})

    postal_message_id = str(message_data.get("id", ""))

    status = POSTAL_EVENT_MAP.get(event_type)
    if not status:
        logger.debug("Ignoring unknown Postal event", extra={"event": event_type})
        return {"status": "ignored"}

    # Update tracking in Redis
    redis = await get_redis_client()
    email_key = f"email_tracking:{postal_message_id}"

    await redis.hset(
        email_key,
        mapping={
            "status": status,
            f"event_{event_type}": datetime.now(timezone.utc).isoformat(),
            "last_event": event_type,
        },
    )

    logger.info(
        "Processed Postal webhook",
        extra={
            "event": event_type,
            "postal_message_id": postal_message_id,
            "status": status,
        },
    )

    return {"status": "ok"}
