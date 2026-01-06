# Billing Microservice

Dedicated FastAPI microservice for RawDrive's subscription management, payment processing, and invoice generation.

## Overview

The billing service handles all subscription and payment operations for RawDrive, isolated from the main backend to provide:

- **Security Isolation**: Sensitive payment data and Stripe/Razorpay integrations contained in dedicated service
- **RBAC Enforcement**: Billing permissions (`billing:read`, `billing:write`) enforced at service boundary
- **Independent Scaling**: Billing workload (webhooks, invoice generation) scales independently via KEDA
- **Zero Frontend Changes**: Transparent routing via Traefik - frontend continues using same `/api/v1/subscription` endpoints

## Architecture

### Routing Priority

Traefik routes requests to billing-service with higher priority than backend:

| Priority | Route | Service | Notes |
|----------|-------|---------|-------|
| **148** | `/webhooks/razorpay`, `/webhooks/stripe` | **billing-service** | Payment webhooks |
| **145** | `/api/v1/subscription/*` | **billing-service** | Billing API |
| 140 | `/api/v1/galleries/*` | gallery-service | Gallery API |
| 100 | `/api/*` | backend | Fallback |

### Shared Resources

- **Database**: Same PostgreSQL instance (multi-tenant isolation via `workspace_id`)
- **JWT**: Same `JWT_SECRET` for token validation across all microservices
- **Redis**: Same Redis instance for distributed caching

### Authentication Flow

**Two-Layer Pattern**:

1. **Traefik Gateway Headers** (Preferred): Extract `workspace_id` from `X-Workspace-Id` header added by Traefik
2. **Direct JWT Validation** (Fallback): If no gateway header, validate JWT directly and extract `workspace_id`

### RBAC Permission Checks

All endpoints enforce workspace-level permissions:

| Endpoint | Required Permission | Roles with Access |
|----------|-------------------|------------------|
| GET endpoints | `billing:read` | owner, admin |
| POST/PUT/DELETE | `billing:write` | owner only |
| Webhooks | None (signature verification) | Public (verified) |

## API Endpoints

### Subscription Management

```
GET    /api/v1/subscription                           # Get subscription status
GET    /api/v1/subscription/plans                     # List plans
POST   /api/v1/subscription/checkout                  # Create checkout session
POST   /api/v1/subscription/cancel                    # Cancel subscription
POST   /api/v1/subscription/reactivate                # Reactivate subscription
PUT    /api/v1/subscription/plan                      # Change plan
```

### Invoice Management

```
GET    /api/v1/subscription/invoices                  # List invoices
GET    /api/v1/subscription/invoices/{invoice_id}     # Get invoice details
GET    /api/v1/subscription/invoices/{invoice_id}/pdf # Download invoice PDF
```

### Payment Methods

```
GET    /api/v1/subscription/payment-methods           # List payment methods
DELETE /api/v1/subscription/payment-methods/{id}      # Delete payment method
```

### Usage & Quotas

```
GET    /api/v1/subscription/usage                     # Get usage stats
```

### Webhooks

```
POST   /webhooks/razorpay                             # Razorpay webhook handler
POST   /webhooks/stripe                               # Stripe webhook handler
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

# Payment Providers
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=your-razorpay-secret
RAZORPAY_WEBHOOK_SECRET=whsec_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Storage (R2) for invoice PDFs
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=rawdrive-prod

# Company Info (for invoices)
GST_NUMBER=YOUR_GST_NUMBER
COMPANY_ADDRESS="Your Company Address"
COMPANY_NAME=RawDrive
```

### Optional (Performance Tuning)

```bash
BILLING_DB_POOL_MIN_SIZE=10
BILLING_DB_POOL_MAX_SIZE=50
BILLING_REDIS_MAX_CONNECTIONS=20

CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RECOVERY_TIMEOUT=30

TRIAL_DAYS=14
GRACE_PERIOD_DAYS=7
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
cd services/billing-service
pip install -r requirements.txt
```

3. **Copy environment file**:

```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Run service**:

```bash
uvicorn src.main:app --reload --port 8005
```

### Docker Compose (Recommended)

```bash
# Start all services including billing-service
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Or for dev mode with hot-reload
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d billing-service
```

**Note**: Dev compose uses port 8006 (not 8005) to avoid conflict with onboarding-service.

### Access

- Health check: http://localhost:8005/health
- Docs (via Traefik): http://localhost/api/v1/subscription/docs
- Metrics: http://localhost:8005/metrics

## Webhook Testing

### Razorpay Webhook

```bash
# 1. Generate signature
PAYLOAD='{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_xxx","amount":99900}}}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$RAZORPAY_WEBHOOK_SECRET" | awk '{print $2}')

# 2. Send webhook
curl -X POST http://localhost/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Stripe Webhook

Use Stripe CLI for local testing:

```bash
stripe listen --forward-to localhost/webhooks/stripe
stripe trigger payment_intent.succeeded
```

## Testing

### Unit Tests

```bash
cd services/billing-service
pytest tests/ -v
```

### Integration Tests

```bash
# Run integration test script
./scripts/test-billing-setup.ps1
```

### Test Coverage

```bash
pytest tests/ --cov=src --cov-report=html
open htmlcov/index.html
```

## Kubernetes Deployment

### Prerequisites

- KEDA installed: `helm install keda kedacore/keda --namespace keda --create-namespace`
- Prometheus for metrics collection
- Secrets configured in `infrastructure/kubernetes/base/billing-service/secrets-template.yaml`

### Deploy

```bash
# 1. Create secrets from template
kubectl create secret generic billing-service-secrets \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=JWT_SECRET="..." \
  # ... (see secrets-template.yaml for all required fields)

# 2. Apply manifests
kubectl apply -k infrastructure/kubernetes/base/billing-service/

# 3. Verify deployment
kubectl get pods -l app=billing-service
kubectl logs -l app=billing-service -f
```

### KEDA Autoscaling

The billing service scales based on:

- **HTTP request rate**: >100 RPS triggers scale-up
- **Webhook processing rate**: >10 webhooks/sec triggers scale-up
- **Request latency**: P95 >500ms triggers scale-up

Min replicas: 2, Max replicas: 20

## Monitoring

### Health Checks

```bash
# Liveness
curl http://localhost:8005/health

# Database connection
curl http://localhost:8005/health | jq '.checks.database'

# Redis connection
curl http://localhost:8005/health | jq '.checks.redis'

# Circuit breaker state
curl http://localhost:8005/health | jq '.circuit_breaker'
```

### Metrics (Prometheus)

Available at `/metrics`:

- `billing_http_requests_total` - Total HTTP requests
- `billing_http_request_duration_seconds` - Request latency histogram
- `billing_webhook_events_total` - Webhook events processed
- `billing_db_pool_size` - Database connection pool size
- `billing_redis_operations_total` - Redis operations count

### Logs

Structured JSON logs with fields:

- `workspace_id` - For workspace-specific filtering
- `user_id` - For user action tracking
- `idempotency_key` - For webhook deduplication
- `provider` - Payment provider (razorpay, stripe)

## Known Issues

### Port Conflict (Dev Compose)

**Issue**: Billing-service configured for port 8005 in production docker-compose.yml, but onboarding-service also uses 8005 in dev compose.

**Workaround**: Dev compose uses port 8006 for billing-service to avoid conflict.

**Resolution**: Choose dedicated port assignments:
- Billing-service: 8005 (production and dev)
- Onboarding-service: 8007 (update dev compose)

### Backend Deprecation Warnings

**Issue**: Backend subscription endpoints marked as `deprecated=True` but still functional.

**Status**: Intentional for rollback safety. Will be removed after 1 week of stable billing-service operation in production.

## Rollback Plan

### Immediate Rollback

If critical issues occur:

```bash
# Stop billing-service
docker compose stop billing-service

# OR in Kubernetes
kubectl scale deployment billing-service --replicas=0
```

Traefik will automatically fallback to backend (priority 100) for subscription endpoints.

### Partial Rollback

Disable specific endpoints by changing Traefik routing priority:

```yaml
# infrastructure/docker/traefik/dynamic.dev.yaml
billing-api-router-local:
  priority: 50  # Lower than backend's 100 = backend handles requests
```

## Security

### Webhook Signature Verification

- **Razorpay**: HMAC SHA256 verification using `RAZORPAY_WEBHOOK_SECRET`
- **Stripe**: Stripe library verification using `STRIPE_WEBHOOK_SECRET`

### Idempotency

All webhook events tracked in `payment_transactions` table with unique `idempotency_key` to prevent duplicate processing.

### RBAC Enforcement

Permission checks at endpoint level using FastAPI dependencies:

```python
@router.get("/subscription", dependencies=[Depends(require_permissions(["billing:read"]))])
```

### Multi-Tenant Isolation

All database queries MUST filter by `workspace_id`:

```python
# GOOD
result = await db.fetchrow(
    "SELECT * FROM workspace_subscriptions WHERE workspace_id = $1",
    workspace_id
)

# BAD - Missing workspace_id filter
result = await db.fetchrow("SELECT * FROM workspace_subscriptions")
```

## Support

- Issues: https://github.com/your-org/rawdrive/issues
- Internal Docs: `docs/BILLING_SERVICE_SETUP_COMPLETE.md`
- Architecture: `docs/ARCHITECTURE.md`

## License

Proprietary - RawDrive Platform
