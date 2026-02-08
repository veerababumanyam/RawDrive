# RawDrive Integrations

## Overview

RawDrive integrates with a comprehensive stack of external services, databases, and internal microservices to deliver a professional photography platform with AI-powered features, client management, and seamless workflows.

---

## Database Integrations

### Primary Database
- **PostgreSQL 16**
  - Location: `C:\Users\admin\Desktop\RawDrive2\infrastructure\docker\docker-compose.yml`
  - Connection: `postgresql://rawdrive:rawdrive@postgres:5432/rawdrive`
  - Features: TimescaleDB extension, pgvector for vector search, pgvectorscale for StreamingDiskANN indexes
  - Tables: assets, users, workspaces, clients, galleries, invitations, etc.
  - Connection pooling: PgBouncer for 5000+ concurrent users

### Vector Database
- **Milvus 2.3.4**
  - Purpose: Face and image embeddings storage
  - Configuration: `C:\Users\admin\Desktop\RawDrive2\services\ai-processing-service\src\services\gemini_vision_service.py`
  - Features:
    - Face embedding storage for facial recognition
    - Image similarity search
    - High-performance vector operations
    - Supports various distance metrics (L2, Inner Product, IP, Cosine)

### Cache & Session Storage
- **Redis 7**
  - Location: `C:\Users\admin\Desktop\RawDrive2\infrastructure\docker\docker-compose.yml`
  - Configuration: `redis://redis:6379/0`
  - Uses cases:
    - Session management
    - Rate limiting
    - Celery message broker
    - Multi-tier caching (L1: 5min, L2: 2min, L3: 30sec)
    - WebSocket state management

---

## External Service Integrations

### Cloud Storage
- **Cloudflare R2**
  - Purpose: Object storage for photos, videos, and other assets
  - Configuration:
    - Endpoint: `R2_ENDPOINT` in environment
    - Bucket: `R2_BUCKET_NAME`
    - SDK: Boto3 1.35.0
  - Implementation:
    - Backend: `backend/src/app/services/storage_service.py`
    - Services: Upload, Gallery, Client (all use R2)

### AI & Machine Learning
- **Google Cloud Vision API**
  - Purpose: Face detection, landmark recognition, image labeling
  - Configuration: `GOOGLE_APPLICATION_CREDENTIALS`
  - Implementation: `backend/src/app/services/ai/face_detection_service.py`
  - Features:
    - Face detection and landmarking
    - Image quality assessment
    - Content moderation

- **Google Gemini AI**
  - Purpose: AI content analysis, image tagging, caption generation
  - Configuration: `AI_API_KEY`, `AI_MODEL`
  - Implementation:
    - Backend: `backend/src/app/services/ai/image_analysis_service.py`
    - AI Processing: `services/ai-processing-service/src/services/gemini_vision_service.py`
    - Features:
      - Image captioning
      - Content-based tagging
      - AI-powered search suggestions

### Authentication
- **Google OAuth**
  - Purpose: User authentication and identity verification
  - Configuration: Google Cloud Console credentials
  - Implementation: `backend/src/app/services/oauth_service.py`
  - Features:
    - Social login integration
    - Profile data synchronization
    - Token management and refresh

### Payment Processing
- **Stripe**
  - Purpose: Subscription management, payment processing, invoicing
  - Configuration: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - Implementation: `services/billing-service/src/services/payment_service.py`
  - Features:
    - Subscription billing
    - One-time payments
    - Webhook-based event handling
    - Stripe Connect for partners

- **Razorpay**
  - Purpose: Indian payment gateway integration
  - Configuration: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
  - Implementation: `services/billing-service/src/services/razorpay_service.py`
  - Features:
    - UPI payments
    - Credit/debit card processing
    - Net banking integration

### Email Services
- **SendGrid**
  - Purpose: Transactional emails, notifications, marketing emails
  - Configuration: `SENDGRID_API_KEY`
  - Implementation:
    - Backend: `backend/src/app/services/email_service.py`
    - Services: Notifications, Onboarding, Invitations
  - Features:
    - Template-based email delivery
    - Delivery tracking and analytics
    - Webhook event handling

- **Twilio (Planned)**
  - Purpose: SMS notifications
  - Configuration: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
  - Implementation: `services/notifications-service/src/services/sms_service.py`
  - Status: Placeholder for Phase 1

### Analytics & Monitoring
- **Prometheus**
  - Purpose: Metrics collection and monitoring
  - Configuration: `C:\Users\admin\Desktop\RawDrive2\infrastructure\docker\docker-compose.yml`
  - Implementation: All services expose `/metrics` endpoints
  - Features:
    - Custom metrics per service
    - Rate limiting metrics
    - Error rate tracking

- **Grafana**
  - Purpose: Visualization and dashboarding
  - Configuration: `C:\Users\admin\Desktop\RawDrive2\infrastructure\docker\docker-compose.yml`
  - Implementation: Pre-configured dashboards for each service
  - Features:
    - Performance monitoring
    - Business metrics
    - Alerting integration

- **Loki**
  - Purpose: Log aggregation and analysis
  - Configuration: `C:\Users\admin\Desktop\RawDrive2\infrastructure\docker\docker-compose.yml`
  - Implementation: Structured logging with labels
  - Features:
    - Context-aware logging
    - Log retention policies
    - Kibana-style queries

---

## Internal Service Integrations

### Service Communication
- **HTTP/REST APIs**
  - Pattern: All services expose RESTful APIs
  - Authentication: JWT tokens with public key verification
  - Configuration: Traefik routing and load balancing

- **WebSocket**
  - Services: Gallery, LiveSync
  - Purpose: Real-time updates, collaboration
  - Implementation: WebSocket API with authentication

- **Kafka (Optional)**
  - Services: Upload, AI Processing, Webhooks
  - Purpose: Event streaming and decoupling
  - Configuration: `KAFKA_BOOTSTRAP_SERVERS`

### Shared Infrastructure
- **Service Registry**
  - Implementation: A2A (Application-to-Application) registry
  - Location: `backend/src/app/services/service_registry.py`
  - Features:
    - Service discovery
    - Health checks
    - Capability advertising

- **Circuit Breaker**
  - Pattern: Hystrix-style circuit breaking
  - Implementation: `services/*/src/services/resilience/circuit_breaker_factory.py`
  - Features:
    - Failure threshold detection
    - Automatic recovery
    - Fallback strategies

### Authentication & Authorization
- **JWT (JSON Web Tokens)**
  - Algorithm: EdDSA (Ed25519) for security
  - Configuration:
    - Private key: `backend/secrets/jwtEd25519.key`
    - Public key: `backend/secrets/ed25519_public_key.pem`
  - Services: All services validate JWT tokens
  - Scopes: Workspace-level permissions

- **RBAC (Role-Based Access Control)**
  - Pattern: Platform RBAC ≠ Workspace RBAC
  - Implementation: `backend/src/app/services/rbac_service.py`
  - Features:
    - Role definitions at platform level
    - Workspace-level permissions
    - Capability-based access for share links

---

## Database Schema Integration

### Core Tables
- **assets**: Photo/video storage with metadata
- **users**: User accounts and preferences
- **workspaces**: Multi-tenant isolation
- **clients**: Client relationship management
- **galleries**: Photo collection organization
- **invitations**: Digital invitation system
- **face_embeddings**: Facial recognition data
- **asset_embeddings_cache**: AI embedding caching

### Relationships
```python
# Multi-tenant pattern enforced everywhere
asset.workspace_id = workspace.id  # Always filter by workspace
client.workspace_id = workspace.id
gallery.workspace_id = workspace.id
```

### Migration System
- **Alembic**: Database migration management
- Location: `backend/migrations/versions/`
- Recent migrations: Face embedding cache, referral system, portfolio recommendations
- Pattern: Versioned migrations with downgrade support

---

## MCP (Model Context Protocol) Integration

### MCP Server
- **Location**: `services/ai-service/src/rawdrive_mcp/`
- **Components**:
  - `server.py`: MCP server implementation
  - `milvus_client.py`: Vector database integration
  - `upload_monitoring.py`: File upload tracking
  - `cache.py`: Response caching
  - `db.py`: Database operations

### MCP Capabilities
1. **Workspace Agent Tools**
   - Upload monitoring
   - Asset management
   - Client interaction
   - Gallery operations

2. **RAG Integration**
   - Knowledge base access
   - Context retrieval
   - Query enhancement

3. **Vector Search**
   - Face similarity search
   - Content-based retrieval
   - Semantic search

---

## Webhook Integration

### Webhooks Service
- **Location**: `services/webhooks-service/`
- **Purpose**: Event-driven integration with external services
- **Features**:
  - HMAC-SHA256 signature verification
  - Exponential backoff retry
  - Circuit breaker pattern
  - Template-based payloads

### Supported Webhooks
- **Stripe**: Payment events, subscription changes
- **SendGrid**: Email delivery events
- **Custom**: Business events from internal services

### Configuration
```python
# services/webhooks-service/src/config/webhook_config.py
WEBHOOK_SIGNATURE_MAX_TIMESTAMP_AGE: 300
DELIVERY_MAX_RETRIES: 5
DELIVERY_RETRY_SCHEDULE: "10,60,300,1800,3600"
```

---

## API Integration Patterns

### Standard Response Format
```typescript
// All APIs follow this pattern
{
  "success": boolean,
  "data": T,
  "message": string, // Optional error message
  "pagination": { // Optional for list responses
    "page": number,
    "limit": number,
    "total": number
  }
}
```

### Error Handling
```python
# Backend exception handling
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "message": exc.detail}
    )
```

### Rate Limiting
- **Implementation**: `backend/src/app/middleware/rate_limit.py`
- **Pattern**: Per-service configuration
- **Redis-based**: Token bucket algorithm
- **Example**: Gallery service: 1000/minute, Upload: 100/minute

---

## Integration Testing

### End-to-End Testing
- **Playwright**: 1.57.0
- **Configuration**: `C:\Users\admin\Desktop\RawDrive2\frontend/package.json`
- **Features**:
  - Multi-browser testing
  - Visual regression testing
  - Performance testing

### Service Testing
```bash
# Backend tests
docker exec rawdrive-backend pytest -v

# Service tests
cd services/gallery-service
docker compose up -d
docker compose exec pytest

# Integration tests
docker compose -f docker-compose.test.yml up
```

### Test Data
- **Fixtures**: `tests/fixtures/` directory
- **Test Users**: `docs/TEST_USERS.md`
- **Mock Services**: Docker-compose test configurations

---

## Security Integrations

### Multi-Layer Security
1. **Transport Layer**: HTTPS with Traefik
2. **Authentication**: JWT with EdDSA
3. **Authorization**: RBAC with workspace isolation
4. **Data Encryption**: AES-256 at rest
5. **Input Validation**: Zod schemas + Pydantic

### CORS Configuration
```python
# Per-service CORS origins
CORS_ORIGINS: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://rawdrive.in"
]
```

### Audit Logging
- **Implementation**: `backend/src/app/services/audit_service.py`
- **Destination**: Loki via structured logs
- **Format**: JSON with correlation IDs
- **Retention**: 30 days

---

## Performance Integrations

### Caching Strategies
1. **Browser PWA**: Cache-first for media, stale-while-revalidate for APIs
2. **Service Cache**: Redis multi-tier (5min/2min/30sec)
3. **CDN**: Cloudflare R2 with custom TTLs

### Database Optimization
- **Connection Pooling**: PgBouncer for 5000+ concurrent users
- **Indexing**: pgvector for similarity search
- **Read Replicas**: Configurable per service

### Load Testing
- **Tools**: Locust, Artillery
- **Metrics**: Response times, error rates, throughput
- **Auto-scaling**: KEDA based on CPU/memory/queue length

---

## Monitoring & Alerting

### Metrics Collection
```python
# Prometheus metrics pattern
from prometheus_client import Counter, Histogram, Gauge

REQUEST_COUNT = Counter('requests_total', 'Total requests')
REQUEST_DURATION = Histogram('request_duration_seconds', 'Request duration')
ACTIVE_CONNECTIONS = Gauge('active_connections', 'Active connections')
```

### Alert Rules
- **Critical**: Database unresponsive, Redis down, payment failures
- **Warning**: High error rates, slow response times, resource exhaustion
- **Info**: Usage patterns, growth trends

### Alertmanager Configuration
- **Notifications**: Email, Slack, PagerDuty
- **Routing**: By severity and service
- **Silences**: Maintenance windows