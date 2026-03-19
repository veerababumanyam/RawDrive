---
name: webhook-development
description: "Webhook development patterns for RawDrive: the webhooks-service microservice (port 8015), event delivery, webhook registration, payload templates, retry logic, signature verification, and webhook management UI. Use this skill when implementing webhook endpoints, creating event dispatchers, building webhook configuration UIs, handling webhook delivery/retry, implementing signature verification (HMAC), or working with the webhooks-service. Also use for webhook event schemas, delivery logs, and third-party integration via webhooks. Triggers on: webhook, webhooks-service, event delivery, webhook registration, webhook signature, HMAC, webhook retry, webhook payload, webhook template, event dispatch, callback URL, webhook log."
---

# Webhook Development Patterns

The webhooks-service (port 8015) enables RawDrive workspaces to receive real-time HTTP callbacks when events occur — gallery shared, photo uploaded, payment received, etc.

## Service Architecture

```
services/webhooks-service/src/
├── api/v1/
│   ├── webhooks.py          # CRUD for webhook registrations
│   ├── events.py            # Event ingestion from other services
│   └── logs.py              # Delivery log queries
├── services/
│   ├── webhook_service.py       # Registration management
│   ├── dispatch_service.py      # Event routing + delivery
│   ├── signature_service.py     # HMAC signature generation
│   └── retry_service.py         # Failed delivery retry
├── workers/
│   ├── delivery_worker.py       # Async HTTP delivery
│   └── cleanup_worker.py        # Log rotation
├── schemas/
│   ├── webhook_schemas.py
│   └── event_schemas.py
└── config.py
```

## Webhook Registration

```python
class WebhookRegistration(Base):
    __tablename__ = "webhook_registrations"
    id: UUID
    workspace_id: UUID
    url: str                       # Callback URL (HTTPS required)
    secret: str                    # Shared secret for HMAC signing
    events: list[str]              # Event types to subscribe to
    is_active: bool = True
    created_by: UUID
    created_at: datetime
    # Delivery stats
    last_delivery_at: datetime | None
    failure_count: int = 0
    # Auto-disable after 10 consecutive failures
    auto_disabled_at: datetime | None

class WebhookService:
    async def register(
        self, workspace_id: UUID, data: WebhookCreate, user_id: UUID
    ) -> WebhookRegistration:
        # 1. Validate URL (HTTPS, reachable, not internal)
        await self._validate_url(data.url)
        # 2. Generate signing secret
        secret = secrets.token_urlsafe(32)
        # 3. Create registration
        webhook = WebhookRegistration(
            workspace_id=workspace_id,
            url=data.url,
            secret=secret,
            events=data.events,
            created_by=user_id,
        )
        # 4. Send test event to verify endpoint
        await self.dispatch_service.send_test(webhook)
        return webhook
```

## Event Dispatch

```python
class DispatchService:
    async def dispatch(self, event: WebhookEvent):
        """Route event to all matching webhook registrations."""
        registrations = await self.webhook_repo.get_active_by_event(
            workspace_id=event.workspace_id,
            event_type=event.type,
        )
        for reg in registrations:
            await self.task_queue.enqueue("deliver_webhook", {
                "registration_id": str(reg.id),
                "event": event.to_dict(),
            })

class DeliveryWorker:
    async def deliver(self, registration_id: UUID, event: dict):
        reg = await self.webhook_repo.get(registration_id)
        payload = json.dumps(event, default=str)

        # Generate HMAC signature
        signature = self.signature_service.sign(payload, reg.secret)

        headers = {
            "Content-Type": "application/json",
            "X-RawDrive-Signature": f"sha256={signature}",
            "X-RawDrive-Event": event["type"],
            "X-RawDrive-Delivery": str(uuid4()),
            "X-RawDrive-Timestamp": str(int(time.time())),
        }

        # Deliver with timeout
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(reg.url, content=payload, headers=headers)
            success = 200 <= response.status_code < 300
        except Exception as e:
            success = False

        # Log delivery attempt
        await self.log_repo.create(DeliveryLog(
            registration_id=reg.id,
            event_type=event["type"],
            status_code=response.status_code if success else None,
            success=success,
            response_body=response.text[:1000] if success else str(e),
        ))

        if not success:
            await self._handle_failure(reg)
```

## Signature Verification (Consumer Side)

```python
# Example: How webhook consumers verify signatures
import hmac
import hashlib

def verify_webhook_signature(
    payload: bytes, signature: str, secret: str
) -> bool:
    expected = hmac.new(
        secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    received = signature.removeprefix("sha256=")
    return hmac.compare_digest(expected, received)
```

## Event Schema

```python
class WebhookEvent:
    """Standard event payload structure."""
    id: str              # Unique event ID (for idempotency)
    type: str            # e.g., "gallery.shared"
    workspace_id: str
    timestamp: str       # ISO 8601
    data: dict           # Event-specific payload

# Event types
WEBHOOK_EVENTS = {
    "gallery.created": "New gallery created",
    "gallery.shared": "Gallery shared with client",
    "gallery.deleted": "Gallery deleted",
    "asset.uploaded": "Photo uploaded",
    "asset.processed": "Photo processing complete",
    "client.favorites": "Client updated favorites",
    "client.download": "Client downloaded photos",
    "payment.received": "Payment received",
    "subscription.changed": "Subscription plan changed",
    "invitation.rsvp": "Guest RSVP received",
}
```

## Retry Strategy

```python
# Exponential backoff: 1min, 5min, 30min, 2hr, 12hr
RETRY_DELAYS = [60, 300, 1800, 7200, 43200]

async def _handle_failure(self, reg: WebhookRegistration):
    reg.failure_count += 1
    if reg.failure_count >= 10:
        # Auto-disable and notify workspace owner
        reg.is_active = False
        reg.auto_disabled_at = datetime.utcnow()
        await self.notification_service.send(
            workspace_id=reg.workspace_id,
            notification_type=NotificationType.WEBHOOK_DISABLED,
            data={"url": reg.url, "reason": "10 consecutive failures"},
        )
```

## Frontend Webhook Management

```typescript
// Key components:
// WebhookList — registered webhooks with status indicators
// WebhookForm — URL, event selection, test button
// DeliveryLogs — paginated log table with response details
// WebhookTest — manual test event sender
```
