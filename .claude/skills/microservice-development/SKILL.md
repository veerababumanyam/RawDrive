---
name: microservice-development
description: "Creating and modifying RawDrive microservices (gallery-service, billing-service, upload-service, ai-service, etc.). Use this skill when building new microservices, adding endpoints to existing services, implementing inter-service communication, resilience patterns (circuit breakers, retries), health checks, or service discovery. Also use when working in the services/ directory or asking about the microservice architecture, event-driven patterns, saga patterns, or distributed tracing. Triggers on: microservice, service communication, circuit breaker, health check, event-driven, saga, distributed tracing, inter-service."
---

# Microservice Development

RawDrive has 15 microservices in `services/`. Each follows a consistent structure and shares the PostgreSQL cluster with logical isolation.

## Service Template Structure

```
services/[service-name]/
├── src/
│   ├── api/v1/          # API endpoints
│   │   └── endpoints/   # Route handlers
│   ├── services/        # Business logic
│   ├── repositories/    # Database access
│   ├── schemas/         # Pydantic schemas
│   ├── middleware/      # Auth, CORS, tracing
│   ├── observability/   # Health checks, metrics
│   ├── config.py        # Service configuration
│   └── main.py          # FastAPI app entrypoint
├── tests/
│   ├── unit/
│   └── integration/
├── Dockerfile
└── requirements.txt
```

## Mandatory Service Requirements

### 1. Health Checks
```python
@router.get("/health/live")
async def liveness():
    return {"status": "ok"}

@router.get("/health/ready")
async def readiness(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception:
        raise HTTPException(503, detail="Database unavailable")
```

### 2. JWT Validation
Every service validates JWT tokens using the shared `JWT_SECRET`:
```python
# middleware/auth.py
async def verify_token(token: str) -> dict:
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    return payload  # Contains sub, workspace_id, role
```

### 3. Prometheus Metrics
```python
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator(
    should_group_status_codes=False,
    excluded_handlers=["/health/.*", "/metrics"],
).instrument(app).expose(app)
```

### 4. Workspace Isolation
Every query filters by `workspace_id` from JWT — same rule as the main backend.

## Inter-Service Communication

### Synchronous (HTTP)
```python
import httpx

async def fetch_user(user_id: UUID) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(
            f"http://backend:8000/api/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {service_token}"}
        )
        response.raise_for_status()
        return response.json()
```

- Service discovery via Docker/K8s DNS: `http://service-name:port`
- Always set timeouts (fail fast)
- Implement retries with exponential backoff

### Asynchronous (Events)
```python
# Event emission (Redis Streams)
await redis.xadd("events:gallery", {
    "type": "GALLERY_CREATED",
    "workspace_id": str(workspace_id),
    "gallery_id": str(gallery_id),
    "timestamp": datetime.utcnow().isoformat(),
})
```

Key events: `GALLERY_CREATED`, `ASSET_UPLOADED`, `SUBSCRIPTION_UPDATED`, `WORKSPACE_DELETING`

## Resilience Patterns

### Circuit Breaker
```python
import pybreaker

ai_breaker = pybreaker.CircuitBreaker(
    fail_max=5,
    reset_timeout=30,
    exclude=[httpx.HTTPStatusError]  # Don't trip on 4xx
)

@ai_breaker
async def call_ai_service(payload):
    async with httpx.AsyncClient(timeout=10.0) as client:
        return await client.post("http://ai-service:8011/api/v1/analyze", json=payload)
```

### Idempotency
```python
# Check idempotency key before processing
idempotency_key = request.headers.get("Idempotency-Key")
if idempotency_key:
    cached = await redis.get(f"idempotent:{idempotency_key}")
    if cached:
        return json.loads(cached)
# Process and cache result with 24h TTL
```

## Port Assignments

| Service | Port | Use as reference |
|---------|------|-----------------|
| Backend | 8000 | Main API |
| Gallery | 8004 | Best example of service patterns |
| Billing | 8005 | Payment processing |
| Upload | 8008 | TUS resumable uploads |
| AI | 8011 | AI orchestration |

**Deep dive:** Read `.claude/reference/microservices-patterns.md`
