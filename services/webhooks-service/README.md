# Webhooks Service

Event-driven webhook delivery microservice for RawDrive.

## Features

- **Webhook Subscriptions**: Create, update, delete webhook endpoints
- **Event Catalog**: 40+ event types across 7 categories
- **Reliable Delivery**: Exponential backoff retry (10s -> 1min -> 5min -> 30min -> 1hr)
- **Circuit Breaker**: Per-endpoint circuit breaker to prevent cascade failures
- **Security**: HMAC-SHA256 signatures with timestamp validation
- **Dead Letter Queue**: Failed deliveries are preserved for manual retry
- **Monitoring**: Prometheus metrics for KEDA autoscaling

## Event Categories

| Category | Events |
|----------|--------|
| workspace | created, updated, deleted, member_added, member_removed, member_role_changed, settings_changed |
| subscription | created, activated, upgraded, downgraded, cancelled, renewed, payment_succeeded, payment_failed, trial_ending, trial_expired |
| user | created, updated, email_verified, password_changed, login, logout |
| asset | uploaded, processed, updated, deleted, downloaded, tagged, face_detected |
| gallery | created, updated, published, unpublished, deleted, shared, viewed, downloaded, expired, selection_submitted, comment_added |
| invitation | created, sent, viewed, rsvp_received, rsvp_updated, expired |
| client | created, updated, deleted, gallery_accessed, photo_favorited, selection_made |

## API Endpoints

### Subscriptions
- `POST /api/v1/webhooks/subscriptions` - Create subscription
- `GET /api/v1/webhooks/subscriptions` - List subscriptions
- `GET /api/v1/webhooks/subscriptions/{id}` - Get subscription details
- `PATCH /api/v1/webhooks/subscriptions/{id}` - Update subscription
- `DELETE /api/v1/webhooks/subscriptions/{id}` - Delete subscription
- `POST /api/v1/webhooks/subscriptions/{id}/test` - Send test webhook
- `POST /api/v1/webhooks/subscriptions/{id}/rotate-secret` - Rotate secret

### Events & Deliveries
- `GET /api/v1/webhooks/events` - List events
- `GET /api/v1/webhooks/events/{id}` - Get event details
- `GET /api/v1/webhooks/events/{id}/deliveries` - List deliveries for event
- `POST /api/v1/webhooks/deliveries/{id}/retry` - Manual retry
- `GET /api/v1/webhooks/subscriptions/{id}/stats` - Delivery statistics

### Event Types
- `GET /api/v1/webhooks/event-types` - List available event types
- `GET /api/v1/webhooks/event-types/{type}` - Get event type details

### Admin (requires admin role)
- `GET /api/v1/admin/webhooks/stats` - Platform-wide statistics
- `GET /api/v1/admin/webhooks/dead-letter-queue` - List DLQ items
- `POST /api/v1/admin/webhooks/dead-letter-queue/{id}/replay` - Replay DLQ item

## Webhook Payload Format

```json
{
  "id": "event-uuid",
  "type": "gallery.published",
  "api_version": "v1",
  "created": "2026-01-09T12:00:00Z",
  "data": {
    "gallery_id": "...",
    "workspace_id": "...",
    "title": "...",
    // Event-specific data
  }
}
```

## Signature Verification

All webhooks are signed using HMAC-SHA256. Headers included:

- `X-RawDrive-Signature`: `t={timestamp},v1={signature}`
- `X-RawDrive-Timestamp`: Unix timestamp
- `X-RawDrive-Event-Type`: Event type
- `X-RawDrive-Delivery-Id`: Unique delivery ID

### Verification Example (Python)

```python
import hmac
import hashlib
import time

def verify_signature(payload: bytes, signature_header: str, secret: str) -> bool:
    parts = dict(p.split("=") for p in signature_header.split(","))
    timestamp = int(parts["t"])
    received_sig = parts["v1"]

    # Check timestamp (5 minute max age)
    if abs(time.time() - timestamp) > 300:
        return False

    # Compute expected signature
    signed_payload = f"{timestamp}.{payload.decode()}"
    expected_sig = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(received_sig, expected_sig)
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `REDIS_URL` | required | Redis connection string |
| `KAFKA_BOOTSTRAP_SERVERS` | optional | Kafka servers (falls back to polling) |
| `JWT_SECRET` | required | Shared JWT secret |
| `PORT` | required | HTTP port (set via PORT_WEBHOOKS in .env) |
| `LOG_LEVEL` | INFO | Logging level |

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally (source .env or set PORT directly)
source ../../infrastructure/docker/.env && uvicorn src.main:app --reload --port $PORT_WEBHOOKS

# Run tests
pytest tests/
```

## Docker

```bash
# Build
docker build -t webhooks-service .

# Run (PORT must be set - matches PORT_WEBHOOKS in .env)
docker run -p $PORT:$PORT \
  -e PORT="$PORT" \
  -e DATABASE_URL="..." \
  -e REDIS_URL="..." \
  -e JWT_SECRET="..." \
  webhooks-service
```

## Metrics

Prometheus metrics available at `/metrics`:

- `webhook_deliveries_total{status,event_type}` - Total deliveries
- `webhook_delivery_duration_seconds` - Delivery latency histogram
- `webhook_pending_deliveries` - Pending queue size
- `webhook_dead_letter_queue_size` - DLQ size
- `webhook_circuit_breaker_state{endpoint_domain}` - Circuit breaker state
- `webhook_events_received_total{event_type}` - Events from Kafka
