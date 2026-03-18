# Architecture Patterns

**Domain:** Enterprise SaaS photography platform (stabilization & completion)
**Researched:** 2026-03-18
**Confidence:** HIGH (based on direct codebase analysis of 14 existing microservices)

## Current Architecture Overview

RawDrive is a brownfield microservices platform with 14 FastAPI services behind a Traefik v3 gateway, sharing PostgreSQL 16 (with pgvector/TimescaleDB), Redis 7, and PgBouncer. Services communicate via:

1. **Traefik routing** -- external HTTP traffic routed by path prefix to individual services
2. **A2A service registry** -- Redis-backed discovery with capability-based lookup and circuit breakers
3. **Direct HTTP** -- internal service-to-service calls via Docker network hostnames (e.g., `http://invitations-api:8007`)
4. **Redis pub/sub + Celery** -- async task dispatch (ai-processing-service uses Celery with Redis broker)

## Recommended Architecture for New Capabilities

### Integration Map

```
                         EXTERNAL
                            |
                      [Traefik :80/443]
                    rate-limit middlewares
                            |
        +-------------------+-------------------+
        |                   |                   |
   [Frontend]         [Backend :8000]    [Gallery :8004]
                            |
        +--------+----------+----------+--------+
        |        |          |          |        |
   [Notif.   [Webhooks  [AI Svc   [Upload  [Billing
    :8010]    :8003]     :8011]    :8008]   :8005]
        |                  |
        |            [AI Processing :8012]
        |              (Celery workers)
        |
   [Postal :25/80]
    (Docker container)
```

### Component Boundaries

| Component | Responsibility | Communicates With | Protocol |
|-----------|---------------|-------------------|----------|
| **Traefik** | Gateway, TLS, path routing, rate limiting (L7) | All services (downstream) | HTTP reverse proxy |
| **Backend** | Core API, auth, admin, workers (similarity, curation) | PostgreSQL, Redis, AI Processing, Notifications | HTTP, SQL, Redis |
| **Notifications Service** | Multi-channel dispatch (email, SMS, in-app, push), preferences, templates, delivery tracking | Postal (SMTP/API), Redis, PostgreSQL | SMTP, HTTP, SQL |
| **Webhooks Service** | External webhook subscriptions, event delivery with retry, circuit breaker, dead letter queue | PostgreSQL, Redis, external endpoints | HTTP, SQL |
| **AI Processing Service** | CLIP embeddings, face detection, duplicate detection, content moderation (GPU-heavy) | PostgreSQL, Redis (Celery broker), R2 storage | Celery tasks, SQL |
| **AI Service** | AI orchestration, smart tagging, LLM coordination | AI Processing (Celery dispatch), Gemini API | HTTP, Celery |
| **Postal** | Transactional email delivery, bounce handling, delivery webhooks | Notifications Service (receives SMTP/API), sends to internet | SMTP, HTTP API |
| **Redis** | Session cache, rate limit counters, service registry, Celery broker, pub/sub | All services | Redis protocol |
| **PostgreSQL** | Persistent storage, pgvector embeddings, shared across all services | All services via PgBouncer | SQL |

## Data Flow Diagrams

### 1. Email via Postal

```
User action (signup/password-reset/invitation)
  --> Backend API
    --> POST /api/v1/notifications/send (A2A internal call)
      --> Notifications Service
        --> Check user preferences (PostgreSQL)
        --> Render template (Jinja2)
        --> Queue to email_worker (Redis)
          --> Email Worker
            --> Postal HTTP API (http://postal:5000/api/v1/send/message)
              --> Postal MTA --> Internet --> Recipient
            --> Postal fires delivery webhook
              --> Notifications Service /webhooks/postal
                --> Update delivery status (PostgreSQL)
```

**Key decisions:**
- Notifications-service owns ALL email sending. Backend never sends email directly.
- Replace SendGrid HTTP client in `email_delivery_service.py` with Postal API client. The interface (`send_email`, `check_delivery_status`) stays the same.
- Postal runs as a Docker container in the compose stack with its own MariaDB (Postal requirement) and exposes port 25 (SMTP) + port 5000 (HTTP API) on the Docker network only.
- Postal webhook callbacks go to `notifications-service /api/v1/notifications/webhooks/postal` for bounce/delivery tracking.

### 2. CLIP Model Serving

```
Curation session triggered (user clicks "Smart Curate")
  --> Backend API creates curation_session record
    --> similarity_worker polls for pending sessions
      --> Dispatches Celery task to ai-processing-service
        --> ai-processing-service Celery worker:
          1. Fetches photo URLs from PostgreSQL
          2. Downloads images from R2
          3. Loads CLIP ViT-B/32 (lazy singleton)
          4. Batch-computes 512-dim embeddings
          5. Stores embeddings in PostgreSQL (pgvector column)
          6. Returns task result via Redis
      --> similarity_worker reads embeddings from PostgreSQL
      --> Runs cosine similarity clustering in-process
      --> Stores similarity_groups in PostgreSQL (not in-memory)
      --> Selects best shot per group using quality scores
```

**Key decisions:**
- The `similarity_worker` in backend should NOT load CLIP itself. It should dispatch embedding computation to `ai-processing-service` via Celery tasks, then read results from PostgreSQL.
- `ai-processing-service` already has `CLIPEmbedder` class with proper lazy loading, batch processing, and device detection (CUDA/MPS/CPU). This code is functional -- it just needs to be wired as a Celery task.
- Add a new Celery task `compute_clip_embeddings` in ai-processing-service alongside existing `face_detection_worker`. Route to a `clip_embeddings` queue.
- Embeddings stored in PostgreSQL using pgvector `vector(512)` column on assets table. Use StreamingDiskANN index (available via pgvectorscale in the TimescaleDB image) for similarity search at scale.
- Similarity groups move from in-memory dict to PostgreSQL table (already has `similarity_groups` table) with Redis cache for hot lookups during active sessions.

### 3. Real-Time Notifications

```
Event occurs (upload complete, curation done, invitation RSVP)
  --> Backend publishes to Redis channel: "notifications:{workspace_id}"
    --> Notifications Service subscribes to Redis channels
      --> Persists notification event (PostgreSQL)
      --> Checks user preferences
      --> Routes to channels:
        [in-app] --> Redis pub/sub --> Backend WebSocket handler
                   --> Frontend receives via existing WS connection
        [email]  --> Queue to email_worker --> Postal
        [push]   --> Queue to push_worker (future)
```

**Key decisions:**
- WebSocket connections stay on Backend (port 8000) because Traefik already routes `/api/v1/ws` there (priority 160). Do NOT add WebSocket to notifications-service.
- Backend maintains WebSocket connections. Notifications-service publishes to Redis pub/sub. Backend's WebSocket handler subscribes and forwards to connected clients.
- This avoids the complexity of routing WebSocket connections to a separate service and keeps the existing Traefik config intact.
- Notifications-service is the orchestrator (decides what to send, to whom, via which channel). Backend is the WebSocket transport for in-app notifications.
- The `digest_worker` in notifications-service already exists for batching -- use it for non-urgent notifications.

### 4. Rate Limiting Across A2A Service Mesh

```
                    Layer 1: Traefik (L7)
                    ----------------------
                    Per-route rate limits via middleware
                    (rate-limit-api, rate-limit-uploads, etc.)
                    Applied to external traffic only
                            |
                    Layer 2: Service Middleware (Application)
                    -----------------------------------------
                    Redis sliding window per (workspace_id, endpoint)
                    Each service has rate_limiter.py middleware
                    Applied to both external and A2A traffic
                            |
                    Layer 3: A2A API Key Rate Limits
                    --------------------------------
                    Per API key quotas stored in Redis
                    Enforced in a2a_auth.py middleware
                    Applied to inter-service calls only
```

**Key decisions:**
- Two-tier rate limiting is already partially implemented. Traefik handles L7 rate limiting for external traffic. Each service has `rate_limiter.py` middleware with Redis sliding window.
- For A2A (service-to-service) calls: use the existing `a2a_auth.py` middleware with timing-safe API key comparison (`hmac.compare_digest`). Add per-key rate limits stored in Redis.
- Rate limit config lives in each service's `config.py` (not centralized). This is correct -- each service knows its own capacity.
- Shared rate limit library: extract the `rate_limiter.py` pattern (already identical across notifications-service and webhooks-service) into a shared Python package to avoid drift.
- Redis key pattern: `ratelimit:{service}:{workspace_id}:{endpoint}:{window}` for application-level limits, `ratelimit:a2a:{api_key_id}:{window}` for A2A limits.

## Patterns to Follow

### Pattern 1: Celery Task Dispatch for Heavy Computation

**What:** Offload CPU/GPU-intensive work to ai-processing-service via Celery tasks through Redis broker.

**When:** Any operation involving CLIP inference, face detection, image processing, or batch operations exceeding 500ms.

**Example:**
```python
# In backend similarity_worker.py -- dispatch to ai-processing-service
from celery import Celery

celery_app = Celery("backend", broker=settings.REDIS_URL)

async def _compute_embeddings(self, session_id: UUID, photo_ids: list[UUID]):
    """Dispatch embedding computation to ai-processing-service."""
    result = celery_app.send_task(
        "workers.clip_worker.compute_batch_embeddings",
        args=[str(session_id), [str(pid) for pid in photo_ids]],
        queue="clip_embeddings",
    )
    # Poll for result or use callback
    return result.id
```

### Pattern 2: Event-Driven Notifications via Redis Pub/Sub

**What:** Services publish domain events to Redis channels. Notifications-service subscribes and orchestrates delivery.

**When:** Any user-visible event that may trigger email, in-app, or push notification.

**Example:**
```python
# In any service -- publish event
await redis.publish(
    f"events:{workspace_id}",
    json.dumps({
        "type": "gallery.published",
        "workspace_id": str(workspace_id),
        "actor_id": str(user_id),
        "payload": {"gallery_id": str(gallery_id), "gallery_name": name},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
)
```

### Pattern 3: A2A Internal HTTP with Circuit Breaker

**What:** Service-to-service calls use the existing `A2AClient` with circuit breaker, timeout, and retry.

**When:** Synchronous cross-service calls (e.g., backend asking notifications-service to send an email).

**Example:**
```python
from app.services.a2a_client import get_a2a_client

client = get_a2a_client()
response = await client.call_service(
    capability="notification:send",
    method="POST",
    path="/api/v1/notifications/send",
    json={"event_type": "email.verification", "recipient_id": str(user_id), ...},
)
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Backend Loading ML Models Directly

**What:** Importing CLIP/torch/transformers in the backend process.
**Why bad:** Backend serves API requests. Loading a 600MB model blocks the event loop, consumes RAM on the API server, and cannot leverage GPU workers. The similarity_worker currently tries to do this.
**Instead:** Dispatch to ai-processing-service via Celery. Read results from PostgreSQL.

### Anti-Pattern 2: Each Service Sending Email Independently

**What:** Backend, invitations-service, or onboarding-service each having their own SMTP/email logic.
**Why bad:** Inconsistent templates, no centralized delivery tracking, duplicate suppression list management, rate limit bypass.
**Instead:** All email goes through notifications-service. Other services call it via A2A HTTP or publish events to Redis.

### Anti-Pattern 3: In-Memory State for Multi-Instance Services

**What:** Storing similarity groups, rate limit counters, or session state in Python dicts.
**Why bad:** Lost on restart, not shared across instances, breaks horizontal scaling.
**Instead:** PostgreSQL for durable state, Redis for ephemeral/cache state.

### Anti-Pattern 4: WebSocket on Every Service

**What:** Adding WebSocket endpoints to notifications-service, gallery-service, etc.
**Why bad:** Traefik routing complexity, connection management overhead, client must maintain multiple WS connections.
**Instead:** Single WebSocket endpoint on backend. Other services publish to Redis pub/sub. Backend fans out to connected clients.

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| Email volume | Postal single instance, no queue needed | Postal with Redis queue, 2 email workers | Postal cluster, dedicated queue service, domain reputation management |
| CLIP inference | CPU on single ai-processing worker | GPU instance, 2-3 Celery workers, batch size 64 | Multiple GPU workers, model sharding, embedding cache in Redis |
| WebSocket connections | Backend handles directly | Backend with Redis pub/sub adapter, sticky sessions | Dedicated WebSocket gateway, Redis Streams for fan-out |
| Rate limiting | In-memory counters acceptable | Redis sliding window (current design) | Redis Cluster, distributed rate limit with Lua scripts |
| PostgreSQL connections | Direct connections fine | PgBouncer (already configured, max 300 connections) | PgBouncer + read replicas, connection routing by service |

## Suggested Build Order (Dependencies)

The integration work has clear dependencies that dictate phase ordering:

```
Phase 1: Security Hardening (no dependencies)
  - timing-safe A2A key comparison
  - workspace_id permission checks
  - curation state machine locking
  |
Phase 2: Rate Limiting (depends on: security hardening for A2A auth)
  - Extract shared rate_limiter.py package
  - Add A2A per-key rate limits in a2a_auth.py
  - Verify Traefik L7 limits cover all routes
  |
Phase 3: Email Infrastructure (depends on: nothing, can parallel with Phase 2)
  - Deploy Postal container in docker-compose
  - Replace SendGrid client in notifications-service with Postal API
  - Wire backend email_service.py to call notifications-service via A2A
  - Implement verification, password reset, invitation email flows
  |
Phase 4: CLIP Model Serving (depends on: nothing, can parallel with Phase 2-3)
  - Add clip_worker.py Celery task in ai-processing-service
  - Add clip_embeddings queue to celery_app.py config
  - Modify similarity_worker to dispatch via Celery instead of inline
  - Store embeddings in pgvector column, add StreamingDiskANN index
  - Move similarity_groups from in-memory to PostgreSQL + Redis cache
  |
Phase 5: Real-Time Notifications (depends on: Phase 3 for email channel)
  - Implement Redis pub/sub publisher in backend for domain events
  - Implement Redis subscriber in notifications-service
  - Wire backend WebSocket handler to forward in-app notifications
  - Connect existing digest_worker for batched notifications
  - Wire churn intervention and curation completion notifications
  |
Phase 6: Integration Testing & Hardening (depends on: all above)
  - End-to-end tests for email flows
  - Load test CLIP pipeline
  - WebSocket reconnection and failover testing
  - Rate limit validation across service mesh
```

**Parallelization opportunities:** Phases 2, 3, and 4 have no mutual dependencies and can be built concurrently by different engineers.

## Sources

- Direct codebase analysis of existing service implementations
- `infrastructure/docker/docker-compose.yml` -- service definitions and networking
- `infrastructure/docker/traefik/dynamic.dev.yaml` -- routing and rate limit middleware config
- `services/notifications-service/src/` -- email delivery, notification orchestration, rate limiting
- `services/ai-processing-service/src/` -- CLIP embedder, Celery config, face detection workers
- `services/webhooks-service/src/` -- delivery service with circuit breaker pattern
- `backend/src/app/services/` -- A2A client, service registry, email service
- `backend/src/app/workers/` -- similarity worker, curation worker patterns
