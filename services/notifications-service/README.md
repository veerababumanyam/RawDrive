# Notifications Microservice

Dedicated FastAPI microservice for RawDrive's multi-channel notifications and communications, supporting email via SendGrid, SMS (placeholder), in-app notifications, and digest aggregation.

## Overview

The notifications service handles all notification delivery for RawDrive, isolated from the main backend to provide:

- **Multi-Channel Delivery**: Email (SendGrid), SMS (Twilio placeholder), in-app, and push notification channels
- **User Preferences**: Granular control over notification frequency and channels per user
- **Template Engine**: Jinja2-based customizable templates with workspace branding
- **Delivery Tracking**: Full audit trail with provider callbacks and engagement metrics
- **Digest Aggregation**: Batch notifications to reduce email fatigue
- **Independent Scaling**: KEDA autoscaling (2-20 replicas) based on queue depth and request rate
- **Retry & Dead Letter**: Automatic retry with exponential backoff and dead letter queue

## Architecture

### Routing Priority

Traefik routes requests to notifications-service with higher priority than backend:

| Priority | Route | Service | Notes |
|----------|-------|---------|-------|
| **147** | `/api/v1/webhooks/sendgrid/*` | **notifications-service** | SendGrid callbacks |
| **146** | `/api/v1/*/notifications/*` | **notifications-service** | Notification API |
| **146** | `/api/v1/*/preferences/*` | **notifications-service** | Preferences API |
| **146** | `/api/v1/*/templates/*` | **notifications-service** | Template API |
| 100 | `/api/*` | backend | Fallback |

### Shared Resources

- **Database**: Same PostgreSQL instance (multi-tenant isolation via `workspace_id`)
- **JWT**: Same `JWT_SECRET` for token validation across all microservices
- **Redis**: Same Redis instance for caching and queue management

### Authentication Flow

**Two-Layer Pattern**:

1. **Traefik Gateway Headers** (Preferred): Extract `workspace_id` from `X-Workspace-Id` header
2. **Direct JWT Validation** (Fallback): Validate JWT directly and extract workspace context

### Notification Categories

- **Transactional**: Billing, security, verification (cannot be disabled)
- **Gallery Activity**: Published galleries, shares, selections
- **Client Interactions**: Comments, favorites, messages
- **Invitations**: Team invites, client access links
- **Marketing**: Promotional content (opt-out available)

## API Endpoints

### Notification Management

```
POST   /api/v1/workspaces/{workspace_id}/notifications           # Send notification
POST   /api/v1/workspaces/{workspace_id}/notifications/batch     # Send batch
GET    /api/v1/workspaces/{workspace_id}/notifications           # List notifications
GET    /api/v1/workspaces/{workspace_id}/notifications/{id}      # Get details
GET    /api/v1/workspaces/{workspace_id}/notifications/{id}/delivery-logs  # Delivery logs
POST   /api/v1/workspaces/{workspace_id}/notifications/{id}/cancel         # Cancel pending
POST   /api/v1/workspaces/{workspace_id}/notifications/{id}/retry          # Retry failed
GET    /api/v1/workspaces/{workspace_id}/notifications/stats/overview      # Statistics
GET    /api/v1/workspaces/{workspace_id}/notifications/user/me             # My notifications
GET    /api/v1/workspaces/{workspace_id}/notifications/correlation/{id}    # Correlated events
```

### User Preferences

```
GET    /api/v1/workspaces/{workspace_id}/preferences                    # Get user preferences
PUT    /api/v1/workspaces/{workspace_id}/preferences                    # Update preferences
GET    /api/v1/workspaces/{workspace_id}/preferences/defaults           # Workspace defaults
PUT    /api/v1/workspaces/{workspace_id}/preferences/defaults           # Update defaults
POST   /api/v1/workspaces/{workspace_id}/preferences/unsubscribe        # Unsubscribe
GET    /api/v1/workspaces/{workspace_id}/preferences/unsubscribe/{token}  # Verify token
```

### Template Management

```
GET    /api/v1/workspaces/{workspace_id}/templates                 # List templates
POST   /api/v1/workspaces/{workspace_id}/templates                 # Create template
GET    /api/v1/workspaces/{workspace_id}/templates/{id}            # Get template
PUT    /api/v1/workspaces/{workspace_id}/templates/{id}            # Update template
DELETE /api/v1/workspaces/{workspace_id}/templates/{id}            # Delete template
GET    /api/v1/workspaces/{workspace_id}/templates/{id}/versions   # List versions
POST   /api/v1/workspaces/{workspace_id}/templates/{id}/preview    # Preview rendered
POST   /api/v1/workspaces/{workspace_id}/templates/{id}/test       # Send test email
```

### Webhooks

```
POST   /api/v1/webhooks/sendgrid/events      # SendGrid delivery events
POST   /api/v1/webhooks/sendgrid/inbound     # SendGrid inbound (future)
GET    /api/v1/webhooks/health               # Webhook health check
```

### Health & Metrics

```
GET    /health           # Basic health check
GET    /health/live      # Kubernetes liveness
GET    /health/ready     # Kubernetes readiness
GET    /ready            # Readiness with dependency checks
GET    /metrics          # Prometheus metrics
```

## Environment Variables

### Required

```bash
# Database (shared with backend)
DATABASE_URL=postgresql://rawdrive:rawdrive@postgres:5432/rawdrive

# Redis
REDIS_URL=redis://redis:6379/0

# JWT (must match backend)
JWT_SECRET=<64-byte-hex-secret>
JWT_ALGORITHM=HS256

# Email Provider - SendGrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@rawdrive.io
SENDGRID_FROM_NAME=RawDrive
SENDGRID_WEBHOOK_SIGNING_KEY=your-webhook-verification-key
```

### Optional (Performance Tuning)

```bash
# Service
SERVICE_PORT=8007
SERVICE_HOST=0.0.0.0
DEBUG=false
LOG_LEVEL=INFO

# Database Pool
DB_POOL_MIN_SIZE=10
DB_POOL_MAX_SIZE=50
DB_COMMAND_TIMEOUT=60

# Redis
REDIS_MAX_CONNECTIONS=30
REDIS_KEY_PREFIX=notifications:

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT=100/minute
RATE_LIMIT_SEND_NOTIFICATION=50/minute
RATE_LIMIT_WEBHOOK=500/minute

# Cache TTLs (seconds)
CACHE_TTL_PREFERENCES=300
CACHE_TTL_TEMPLATE=600
CACHE_TTL_DELIVERY_STATUS=120

# Queue Settings
QUEUE_BATCH_SIZE=100
QUEUE_RETRY_MAX_ATTEMPTS=3
QUEUE_RETRY_DELAY_SECONDS=60
QUEUE_DEAD_LETTER_TTL_DAYS=7

# Digest Settings
DIGEST_ENABLED=true
DIGEST_MIN_INTERVAL_MINUTES=60
DIGEST_MAX_ITEMS=20

# Worker Settings
WORKER_CONCURRENCY=10
WORKER_PREFETCH_COUNT=20

# Circuit Breaker
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RECOVERY_TIMEOUT=30

# SMS Provider - Twilio (placeholder for Phase 2)
TWILIO_ACCOUNT_SID=ACxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+1234567890
SMS_ENABLED=false
```

## Development Setup

### Prerequisites

- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)
- Redis 7 (via Docker)

### Local Development

1. **Start infrastructure**:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis
```

2. **Install dependencies**:

```bash
cd services/notifications-service
pip install -r requirements.txt
```

3. **Copy environment file**:

```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Run migrations** (from backend):

```bash
cd backend
alembic upgrade head
```

5. **Run service**:

```bash
uvicorn src.main:app --reload --port 8007
```

### Docker Compose

```bash
# Start all services including notifications-service
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Or just the notifications service
docker compose -f infrastructure/docker/docker-compose.yml up -d notifications-service
```

### Access

- Health check: http://localhost:8007/health
- API Docs (dev only): http://localhost:8007/docs
- Metrics: http://localhost:8007/metrics

## Event Types

The service supports 80+ notification event types organized by domain:

### Gallery Events
- `gallery.published` - New gallery available
- `gallery.shared` - Gallery shared with someone
- `gallery.updated` - Photos added to gallery
- `gallery.expiring` - Gallery expires soon
- `gallery.selection_submitted` - Client submitted selections

### Billing Events
- `billing.payment_success` - Payment confirmed
- `billing.payment_failed` - Payment failed (urgent)
- `billing.subscription_created` - New subscription
- `billing.trial_ending` - Trial expires soon
- `billing.invoice_overdue` - Invoice past due

### Security Events
- `security.login_new_device` - Login from new device
- `security.password_changed` - Password updated
- `security.password_reset_requested` - Reset link sent
- `security.suspicious_activity` - Potential security issue

### Invitation Events
- `invitation.sent` - Invitation sent to recipient
- `invitation.accepted` - Invitation accepted
- `invitation.reminder` - Reminder to respond

See `src/events/catalog.py` for the complete event catalog with payload schemas.

## Rate Limits

| Endpoint | Limit | Notes |
|----------|-------|-------|
| Send notification | 50/min per user | Prevents spam |
| Batch notifications | 50/min per user | Same as single |
| List/Get operations | 100/min per user | Read operations |
| Webhook callbacks | 500/min global | High for SendGrid |
| Preference updates | 100/min per user | Standard |

## KEDA Autoscaling

Scaling triggers:

- **HTTP request rate**: >100 RPS per replica triggers scale-up
- **Pending queue depth**: >100 pending notifications triggers scale-up
- **Email delivery rate**: >50 emails/sec triggers scale-up
- **P95 latency**: >500ms triggers scale-up
- **Webhook rate**: >20 webhooks/sec triggers scale-up

Configuration:
- Min replicas: 2
- Max replicas: 20
- Scale down stabilization: 180 seconds
- Polling interval: 15 seconds

## SendGrid Webhook Integration

### Setup

1. Configure webhook URL in SendGrid:
   ```
   https://your-domain.com/api/v1/webhooks/sendgrid/events
   ```

2. Enable events:
   - Delivered
   - Opened
   - Clicked
   - Bounced
   - Dropped
   - Spam Report
   - Unsubscribe

3. Set `SENDGRID_WEBHOOK_SIGNING_KEY` for signature verification

### Event Processing

Webhooks update notification delivery status:
- `delivered` → Updates delivery log with timestamp
- `open` → Tracks engagement metrics
- `click` → Tracks link engagement
- `bounce` → Marks as failed, triggers retry or dead letter
- `spam` → Updates preference to unsubscribed
- `unsubscribe` → Updates user preferences

## Testing

### Unit Tests

```bash
cd services/notifications-service
pytest tests/unit -v
```

### Integration Tests

```bash
pytest tests/integration -v
```

### Test Coverage

```bash
pytest tests/ --cov=src --cov-report=html
open htmlcov/index.html
```

### Manual Testing

```bash
# Send a test notification
curl -X POST http://localhost:8007/api/v1/workspaces/{workspace_id}/notifications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "gallery.published",
    "channel": "email",
    "category": "gallery_activity",
    "recipient": {
      "email": "test@example.com",
      "name": "Test User"
    },
    "payload": {
      "gallery_id": "123e4567-e89b-12d3-a456-426614174000",
      "gallery_name": "Wedding Photos",
      "gallery_url": "https://gallery.rawdrive.io/abc123"
    }
  }'
```

## Kubernetes Deployment

### Prerequisites

- KEDA installed: `helm install keda kedacore/keda --namespace keda`
- Prometheus for metrics collection
- Secrets configured

### Deploy

```bash
# 1. Create secrets
kubectl create secret generic notifications-service-secrets \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=JWT_SECRET="..." \
  --from-literal=SENDGRID_API_KEY="SG.xxx"

# 2. Apply manifests
kubectl apply -k infrastructure/kubernetes/base/notifications-service/

# 3. Verify deployment
kubectl get pods -l app=notifications-service
kubectl logs -l app=notifications-service -f
```

## Monitoring

### Health Checks

```bash
# Liveness
curl http://localhost:8007/health

# Readiness with dependency status
curl http://localhost:8007/ready | jq '.checks'

# Database status
curl http://localhost:8007/ready | jq '.checks.database'

# Redis status
curl http://localhost:8007/ready | jq '.checks.redis'
```

### Metrics (Prometheus)

Available at `/metrics`:

- `notifications_http_requests_total` - Total HTTP requests by endpoint
- `notifications_http_request_duration_seconds` - Request latency histogram
- `notifications_emails_sent_total` - Emails sent by status
- `notifications_sms_sent_total` - SMS sent by status
- `notifications_queue_depth` - Pending notifications count
- `notifications_delivery_latency_seconds` - Time to delivery
- `notifications_template_render_duration_seconds` - Template rendering time
- `notifications_cache_hits_total` / `notifications_cache_misses_total` - Cache performance
- `notifications_webhook_events_total` - Webhook events processed

### Logs

Structured JSON logs with fields:

- `workspace_id` - For workspace-specific filtering
- `user_id` - For user action tracking
- `event_id` - Notification event ID
- `correlation_id` - Request correlation ID
- `channel` - Notification channel (email, sms, etc.)

PII filtering automatically redacts:
- Email addresses
- Phone numbers
- Names (when in payload)

## Graceful Degradation

The service operates in degraded mode when optional dependencies fail:

| Dependency | On Failure | Impact |
|------------|------------|--------|
| PostgreSQL | Service unavailable | Critical - returns 503 |
| Redis | Degraded mode | No caching, rate limits may be inaccurate |
| SendGrid | Queue + retry | Notifications queued for retry |

## Rollback Plan

### Immediate Rollback

If critical issues occur:

```bash
# Stop notifications-service
docker compose stop notifications-service

# OR in Kubernetes
kubectl scale deployment notifications-service --replicas=0
```

The backend notification service will continue to function as fallback.

### Partial Rollback

Disable specific endpoints by changing Traefik routing priority:

```yaml
# infrastructure/docker/traefik/dynamic.yaml
notifications-api-router:
  priority: 50  # Lower than backend's 100
```

## Security

### Multi-Tenant Isolation

All database queries MUST filter by `workspace_id`:

```python
# GOOD
result = await db.fetchrow(
    "SELECT * FROM notification_events WHERE workspace_id = $1 AND event_id = $2",
    workspace_id, event_id
)

# BAD - Missing workspace_id filter
result = await db.fetchrow("SELECT * FROM notification_events WHERE event_id = $1", event_id)
```

### Webhook Security

SendGrid webhooks are verified using signature validation:

```python
# Request signature is validated against SENDGRID_WEBHOOK_SIGNING_KEY
if not verify_sendgrid_signature(request):
    raise HTTPException(status_code=401)
```

### Rate Limiting

Sliding window rate limiting via Redis prevents abuse:
- Per-user limits for send operations
- Per-IP limits for public endpoints
- Global limits for webhooks

### PII Protection

- Structured logging with automatic PII filtering
- Sensitive fields redacted from logs
- Email content not logged (only metadata)

## Database Schema

### Tables

- `notification_events` - Core notification records
- `notification_templates` - Custom templates per workspace
- `notification_preferences` - User preference settings
- `notification_delivery_log` - Delivery attempts and provider responses

### Key Indexes

- `notification_events(workspace_id, created_at DESC)` - List queries
- `notification_events(workspace_id, status)` - Status filtering
- `notification_events(idempotency_key)` - Duplicate prevention
- `notification_preferences(workspace_id, user_id)` - Preference lookup

## Support

- Issues: https://github.com/your-org/rawdrive/issues
- Internal Docs: `docs/NOTIFICATIONS_SERVICE.md`
- Architecture: `docs/ARCHITECTURE.md`

## License

Proprietary - RawDrive Platform
