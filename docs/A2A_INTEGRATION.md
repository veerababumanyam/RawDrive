# A2A (Agent-to-Agent) Integration Documentation

**Phase 4: Google A2A ADKS Integration**
**Implementation**: Lightweight A2A framework using Redis + Kafka
**Version**: v0.3.0+

---

## Overview

The A2A (Agent-to-Agent) integration enables **service-to-service communication** and **external agent access** in RawDrive's microservices architecture. It provides:

- **Service Discovery**: Redis-based service registry with capability-based discovery
- **Fault Tolerance**: Circuit breaker pattern with automatic failover
- **Authentication**: JWT tokens for services, API keys for external agents
- **Event Validation**: JSON Schema-based event payload validation
- **Permission Enforcement**: Scope-based authorization for all calls

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  External AI Agents                         │
│           (Claude Desktop, Custom Agents, etc.)             │
└────────────────────┬───────────────────────────────────────┘
                     │
                     │ API Key Authentication
                     │ (rawdrive_sk_<workspace>_<random>)
                     │
                     ↓
        ┌────────────────────────────┐
        │   Backend API Gateway      │
        │   - A2A Auth Middleware    │
        │   - Permission Validation  │
        │   - Rate Limiting          │
        └────────────┬───────────────┘
                     │
                     │ Service-to-Service (JWT)
                     │
        ┌────────────┴────────────────────────────┐
        │                                         │
        ↓                                         ↓
┌───────────────────┐                  ┌─────────────────────┐
│  Gallery Service  │                  │  AI Service (MCP)   │
│  - Registers:     │                  │  - Registers:       │
│    gallery:read   │                  │    ai:analyze       │
│    gallery:write  │                  │    ai:duplicate     │
└────────┬──────────┘                  └──────────┬──────────┘
         │                                        │
         └────────────┬───────────────────────────┘
                      │
                      ↓
         ┌────────────────────────────┐
         │   Service Registry         │
         │   (Redis)                  │
         │   - Capability Index       │
         │   - Health Monitoring      │
         │   - TTL Heartbeats         │
         └────────────────────────────┘
```

---

## Components

### 1. Service Registry

**File**: `backend/src/app/services/service_registry.py`

Redis-based service registry for capability-based discovery.

#### Features

- **TTL-based Heartbeat**: Services expire after 30 seconds without heartbeat
- **Capability Indexing**: Fast lookups by capability name (e.g., "gallery:read")
- **Health Monitoring**: Track healthy/unhealthy services
- **Workspace Isolation**: Optional workspace-scoped services

#### Usage

```python
from app.services.service_registry import (
    get_service_registry,
    ServiceRegistration,
    ServiceCapability,
)

registry = get_service_registry()

# Register service
registration = ServiceRegistration(
    service_name="gallery-service",
    service_id="gallery-001",
    base_url="http://gallery-service:8004",
    capabilities=[
        ServiceCapability(
            name="gallery:read",
            version="1.0",
            endpoint="/api/v1/galleries",
        ),
        ServiceCapability(
            name="photo:search",
            version="1.0",
            endpoint="/api/v1/search",
        ),
    ],
    health_check_endpoint="/health",
)

service_id = await registry.register(registration, auto_renew=True)
```

#### Auto-Renewal with Background Task

```python
import asyncio
from app.services.service_registry import get_service_registry

async def heartbeat_loop():
    """Send heartbeat every 15 seconds."""
    registry = get_service_registry()
    while True:
        await registry.heartbeat("gallery-service", "gallery-001")
        await asyncio.sleep(15)

# Start background task
asyncio.create_task(heartbeat_loop())
```

#### Discover Services by Capability

```python
# Find all services offering gallery read capability
services = await registry.discover("gallery:read")

for service in services:
    print(f"Service: {service.service_name}")
    print(f"  URL: {service.base_url}")
    print(f"  Healthy: {service.is_healthy}")
```

---

### 2. A2A Client

**File**: `backend/src/app/services/a2a_client.py`

Service-to-service communication with circuit breaker pattern.

#### Features

- **Circuit Breaker**: Fault tolerance with CLOSED/OPEN/HALF_OPEN states
- **Automatic Failover**: Try backup services when primary fails
- **Retry Logic**: Exponential backoff (2^attempt seconds)
- **Request Logging**: Track all service calls

#### Circuit Breaker States

| State | Behavior | Threshold |
|-------|----------|-----------|
| **CLOSED** | Normal operation | Failure count < 5 |
| **OPEN** | Reject all calls | Failure count >= 5 |
| **HALF_OPEN** | Test recovery | After 60s timeout |

#### Usage

```python
from app.services.a2a_client import get_a2a_client

client = get_a2a_client()

# Call service by capability
galleries = await client.call_service(
    capability="gallery:read",
    method="GET /galleries",
    params={"page": 1, "limit": 20},
    headers={"Authorization": f"Bearer {jwt_token}"},
)
```

#### Retry with Exponential Backoff

```python
# Automatically retry on failure (max 2 retries)
result = await client.call_with_retry(
    capability="ai:duplicate",
    method="POST /photos/detect-duplicates",
    params={
        "gallery_id": str(gallery_id),
        "similarity_threshold": 0.85,
    },
    headers={"Authorization": f"Bearer {jwt_token}"},
)
```

#### Circuit Breaker Example

```python
from app.services.a2a_client import CircuitBreaker, CircuitBreakerConfig

# Custom circuit breaker configuration
config = CircuitBreakerConfig(
    failure_threshold=10,  # Open after 10 failures
    success_threshold=3,   # Close after 3 successes in half-open
    timeout_seconds=120,   # Wait 2 minutes before half-open
)

breaker = CircuitBreaker(config)
```

---

### 3. A2A Authentication Middleware

**File**: `backend/src/app/middleware/a2a_auth.py`

Authentication and authorization for service-to-service calls and external agents.

#### Supported Authentication Methods

1. **JWT Tokens** (Service-to-Service)
   - Issued by backend with service claims
   - Includes: `service_name`, `service_id`, `workspace_id`, `permissions`

2. **API Keys** (External Agents)
   - Format: `rawdrive_sk_<workspace_id>_<random_32_chars>`
   - SHA-256 hashed in database
   - Scope-based permissions

#### JWT Token Structure

```json
{
  "sub": "user_id",
  "user_id": "user_id",
  "workspace_id": "workspace_id",
  "permissions": ["galleries:read", "photos:write"],
  "service_name": "gallery-service",
  "service_id": "gallery-001",
  "iss": "rawdrive-backend",
  "exp": 1640000000
}
```

#### FastAPI Endpoint with A2A Auth

```python
from typing import Annotated
from fastapi import APIRouter, Depends
from app.middleware.a2a_auth import (
    A2AContextDep,
    require_a2a_permissions,
    require_a2a_workspace_access,
)

router = APIRouter()

@router.get("/galleries")
async def list_galleries(
    context: Annotated[A2AContext, Depends(require_a2a_permissions("galleries:read"))],
):
    """List galleries (requires galleries:read permission)."""
    workspace_id = context.workspace_id
    # ... implementation
```

#### Check Multiple Permissions

```python
# Require ALL permissions
@router.post("/galleries")
async def create_gallery(
    context: Annotated[
        A2AContext,
        Depends(require_a2a_permissions("galleries:write", "photos:write", require_all=True))
    ],
):
    # ... implementation

# Require ANY permission
@router.get("/search")
async def search(
    context: Annotated[
        A2AContext,
        Depends(require_a2a_permissions("galleries:read", "photos:read", require_all=False))
    ],
):
    # ... implementation
```

#### Workspace Access Validation

```python
from app.middleware.a2a_auth import A2AWorkspaceAccessDep

@router.get("/workspaces/{workspace_id}/galleries")
async def get_workspace_galleries(
    workspace_access: A2AWorkspaceAccessDep,
):
    """Automatically validates workspace_id matches token."""
    context, workspace_id = workspace_access
    # workspace_id is validated and extracted
```

---

### 4. Agent API Keys Management

**Endpoints**: `backend/src/app/api/v1/agent_api_keys.py`

CRUD API for managing external agent API keys.

#### Create API Key

```http
POST /api/v1/workspaces/{workspace_id}/agent-api-keys
Authorization: Bearer <user_jwt_token>

{
  "key_name": "Claude Desktop Agent",
  "scopes": ["galleries:read", "photos:read", "ai:analyze"],
  "rate_limit_rpm": 100,
  "expires_days": 90,
  "description": "API key for Claude Desktop MCP integration"
}
```

**Response** (API key only returned ONCE):

```json
{
  "key_id": "uuid",
  "workspace_id": "uuid",
  "key_name": "Claude Desktop Agent",
  "api_key": "rawdrive_sk_<workspace>_a1b2c3d4...",
  "scopes": ["galleries:read", "photos:read", "ai:analyze"],
  "rate_limit_rpm": 100,
  "is_active": true,
  "created_at": "2026-01-08T12:00:00Z",
  "expires_at": "2026-04-08T12:00:00Z",
  "description": "API key for Claude Desktop MCP integration"
}
```

#### List API Keys

```http
GET /api/v1/workspaces/{workspace_id}/agent-api-keys
Authorization: Bearer <user_jwt_token>
```

**Response**:

```json
{
  "keys": [
    {
      "key_id": "uuid",
      "key_name": "Claude Desktop Agent",
      "scopes": ["galleries:read", "photos:read"],
      "rate_limit_rpm": 100,
      "is_active": true,
      "created_at": "2026-01-08T12:00:00Z",
      "expires_at": "2026-04-08T12:00:00Z",
      "last_used_at": "2026-01-08T14:30:00Z"
    }
  ],
  "total": 1
}
```

#### Delete (Revoke) API Key

```http
DELETE /api/v1/workspaces/{workspace_id}/agent-api-keys/{key_id}
Authorization: Bearer <user_jwt_token>
```

**Response**: `204 No Content`

#### Available Scopes

| Scope | Description |
|-------|-------------|
| `galleries:read` | List and view galleries |
| `galleries:write` | Create and modify galleries |
| `photos:read` | List and view photos |
| `photos:write` | Upload photos |
| `ai:analyze` | AI analysis (emotion, quality scoring) |
| `ai:duplicate` | Duplicate detection |
| `ai:video` | Video highlights |
| `ai:curate` | Smart curation |
| `clients:read` | List and view clients |
| `clients:write` | Create and modify clients |

---

### 5. Event Schema Registry

**File**: `backend/src/app/events/schema_registry.py`

JSON Schema-based validation for Kafka event payloads.

#### Standard Event Types

```python
from app.events.schema_registry import EventType

EventType.PHOTO_UPLOADED       # photo.uploaded
EventType.PHOTO_ANALYZED       # photo.analyzed
EventType.DUPLICATES_DETECTED  # duplicates.detected
EventType.GALLERY_CREATED      # gallery.created
EventType.CLIENT_CREATED       # client.created
```

#### Validate Event

```python
from app.events.schema_registry import EventSchemaRegistry

payload = {
    "asset_id": str(uuid4()),
    "workspace_id": str(uuid4()),
    "file_name": "photo.jpg",
    "file_size": 1024000,
    "uploaded_at": datetime.now(timezone.utc).isoformat(),
}

# Validate against schema
try:
    EventSchemaRegistry.validate_event("photo.uploaded", payload)
    print("Valid event!")
except ValidationError as e:
    print(f"Invalid event: {e}")
```

#### Create Validated Event

```python
from app.events.schema_registry import create_validated_event

event = create_validated_event(
    "photo.uploaded",
    asset_id=str(asset_id),
    workspace_id=str(workspace_id),
    file_name="photo.jpg",
    file_size=1024000,
    uploaded_at=datetime.now(timezone.utc).isoformat(),
)

# Publish to Kafka
await kafka_producer.send("photo-events", event)
```

#### Event Schema Example

```python
{
    "type": "object",
    "properties": {
        "asset_id": {"type": "string", "format": "uuid"},
        "workspace_id": {"type": "string", "format": "uuid"},
        "file_name": {"type": "string", "minLength": 1},
        "file_size": {"type": "integer", "minimum": 0},
        "uploaded_at": {"type": "string", "format": "date-time"},
    },
    "required": ["asset_id", "workspace_id", "file_name", "file_size", "uploaded_at"],
}
```

---

## Integration Examples

### Example 1: Gallery Service Calls AI Service

```python
# In gallery-service
from app.services.a2a_client import get_a2a_client

async def detect_duplicates(gallery_id: UUID, workspace_id: UUID):
    """Call AI service to detect photo duplicates."""
    client = get_a2a_client()

    try:
        result = await client.call_with_retry(
            capability="ai:duplicate",
            method="POST /photos/detect-duplicates",
            params={
                "gallery_id": str(gallery_id),
                "workspace_id": str(workspace_id),
                "similarity_threshold": 0.85,
            },
            headers={
                "Authorization": f"Bearer {service_jwt_token}",
                "X-Service-Name": "gallery-service",
            },
        )

        return result["duplicate_groups"]

    except Exception as e:
        logger.error(f"Duplicate detection failed: {e}")
        raise
```

### Example 2: External Agent (Claude Desktop) Access

```bash
# Claude Desktop MCP client configuration
{
  "mcpServers": {
    "rawdrive": {
      "command": "npx",
      "args": ["-y", "@rawdrive/mcp-server"],
      "env": {
        "RAWDRIVE_API_KEY": "rawdrive_sk_<workspace>_<random>",
        "RAWDRIVE_BASE_URL": "https://api.rawdrive.com"
      }
    }
  }
}
```

```python
# MCP server makes authenticated request
import httpx

async def list_galleries(workspace_id: str, api_key: str):
    """List galleries using API key authentication."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.rawdrive.com/api/v1/workspaces/{workspace_id}/galleries",
            headers={
                "Authorization": f"Bearer {api_key}",  # API key in Bearer header
            },
        )
        return response.json()
```

### Example 3: Service Registration on Startup

```python
# In service main.py
from app.services.service_registry import get_service_registry, ServiceRegistration, ServiceCapability
import asyncio

async def register_service():
    """Register service on startup."""
    registry = get_service_registry()

    registration = ServiceRegistration(
        service_name="gallery-service",
        service_id=os.getenv("SERVICE_ID", str(uuid4())),
        base_url=os.getenv("SERVICE_BASE_URL", "http://gallery-service:8004"),
        capabilities=[
            ServiceCapability(
                name="gallery:read",
                version="1.0",
                endpoint="/api/v1/galleries",
            ),
            ServiceCapability(
                name="gallery:write",
                version="1.0",
                endpoint="/api/v1/galleries",
            ),
        ],
        health_check_endpoint="/health",
    )

    service_id = await registry.register(registration)
    logger.info(f"Service registered: {service_id}")

    # Start heartbeat loop
    asyncio.create_task(heartbeat_loop(service_id))

@app.on_event("startup")
async def startup_event():
    await register_service()
```

---

## Best Practices

### 1. Always Use Circuit Breakers

```python
# GOOD: Use A2A client with circuit breaker
from app.services.a2a_client import get_a2a_client

client = get_a2a_client()
result = await client.call_service(capability="gallery:read", method="GET /galleries")

# BAD: Direct HTTP call without circuit breaker
async with httpx.AsyncClient() as http_client:
    response = await http_client.get("http://gallery-service:8004/galleries")
```

### 2. Validate Workspace Isolation

```python
# GOOD: Enforce workspace matching
from app.middleware.a2a_auth import A2AWorkspaceAccessDep

@router.get("/workspaces/{workspace_id}/galleries")
async def list_galleries(
    workspace_access: A2AWorkspaceAccessDep,  # Validates workspace_id
):
    context, workspace_id = workspace_access
    # workspace_id is validated

# BAD: Trust client-provided workspace_id
@router.get("/workspaces/{workspace_id}/galleries")
async def list_galleries(workspace_id: UUID):
    # No validation! Potential security issue
```

### 3. Use Specific Permissions

```python
# GOOD: Specific scope
@router.post("/galleries")
async def create_gallery(
    context: Annotated[A2AContext, Depends(require_a2a_permissions("galleries:write"))],
):
    # ...

# BAD: Overly broad scope
@router.post("/galleries")
async def create_gallery(
    context: Annotated[A2AContext, Depends(require_a2a_permissions("admin"))],
):
    # Too permissive!
```

### 4. Send Regular Heartbeats

```python
# GOOD: Heartbeat every 15 seconds (TTL is 30s)
async def heartbeat_loop():
    while True:
        await registry.heartbeat(service_name, service_id)
        await asyncio.sleep(15)

# BAD: Heartbeat too infrequent
async def heartbeat_loop():
    while True:
        await registry.heartbeat(service_name, service_id)
        await asyncio.sleep(35)  # Service will expire!
```

### 5. Validate Events Before Publishing

```python
# GOOD: Validate before publishing to Kafka
from app.events.schema_registry import create_validated_event

event = create_validated_event(
    "photo.uploaded",
    asset_id=str(asset_id),
    workspace_id=str(workspace_id),
    file_name="photo.jpg",
    file_size=1024000,
    uploaded_at=datetime.now(timezone.utc).isoformat(),
)
await kafka_producer.send("photo-events", event)

# BAD: Publish without validation
await kafka_producer.send("photo-events", {
    "asset_id": str(asset_id),
    # Missing required fields!
})
```

---

## Troubleshooting

### Service Discovery Fails

**Problem**: `No services found for capability 'gallery:read'`

**Solutions**:
1. Check service registered: `redis-cli SMEMBERS "capability:gallery:read"`
2. Check service heartbeat: `redis-cli TTL "service:gallery-service:gallery-001"`
3. Verify capability name matches exactly (case-sensitive)

### Circuit Breaker Stuck Open

**Problem**: All calls rejected with "Circuit breaker open"

**Solutions**:
1. Check service health: `curl http://gallery-service:8004/health`
2. Wait for timeout (default 60s) to allow half-open state
3. Manually reset circuit breaker (requires code change or Redis flush)

### API Key Validation Fails

**Problem**: `Invalid API key` error

**Solutions**:
1. Verify API key format: `rawdrive_sk_<workspace_id>_<random_32_chars>`
2. Check key is active: `SELECT * FROM agent_api_keys WHERE key_id = '<uuid>'`
3. Verify workspace_id matches: Key's workspace_id must match path parameter
4. Check expiration: `expires_at` must be NULL or future date

### Rate Limiting Exceeded

**Problem**: `429 Too Many Requests`

**Solutions**:
1. Check rate limit: `SELECT rate_limit_rpm FROM agent_api_keys WHERE key_id = '<uuid>'`
2. Increase rate limit for API key (update database)
3. Implement client-side rate limiting
4. Use multiple API keys for different agents

---

## Security Considerations

### 1. API Key Storage

- **NEVER** commit API keys to version control
- Store in environment variables or secure secret management (Vault, AWS Secrets Manager)
- Rotate keys regularly (every 90 days recommended)
- Use separate keys for dev/staging/production

### 2. Permission Scopes

- **Principle of Least Privilege**: Only grant minimum required scopes
- Avoid broad scopes like `*:*` or `admin`
- Regularly audit API key scopes
- Revoke unused keys immediately

### 3. Rate Limiting

- Set conservative rate limits initially (100 RPM default)
- Monitor usage patterns
- Implement graduated rate limiting based on plan tier
- Alert on rate limit violations

### 4. Workspace Isolation

- **ALWAYS** validate workspace_id in tokens matches path/query parameters
- Use `A2AWorkspaceAccessDep` for automatic validation
- Never trust client-provided workspace_id without verification
- Log all cross-workspace access attempts

---

## Monitoring

### Metrics to Track

1. **Service Registry**:
   - Active services count
   - Service discovery latency
   - Heartbeat success rate
   - Service expiration rate

2. **A2A Client**:
   - Request success rate by capability
   - Circuit breaker state transitions
   - Retry count histogram
   - Failover events

3. **API Keys**:
   - Active keys count per workspace
   - API key usage distribution
   - Rate limit violations
   - Expired keys count

4. **Events**:
   - Event validation failures
   - Event throughput by type
   - Schema version distribution

### Prometheus Queries

```promql
# Service discovery success rate
sum(rate(service_registry_discovery_total{status="success"}[5m]))
/ sum(rate(service_registry_discovery_total[5m]))

# Circuit breaker open count
sum(circuit_breaker_state{state="open"}) by (service_name)

# API key usage by scope
sum(rate(api_key_requests_total[5m])) by (scope)

# Event validation failures
sum(rate(event_validation_failures_total[5m])) by (event_type)
```

---

## Migration Guide

### Existing Services to A2A

1. **Add Service Registration**:
   ```python
   # In service startup
   from app.services.service_registry import get_service_registry

   @app.on_event("startup")
   async def register():
       registry = get_service_registry()
       await registry.register(registration)
   ```

2. **Replace Direct HTTP Calls**:
   ```python
   # Before
   async with httpx.AsyncClient() as client:
       response = await client.get("http://gallery-service:8004/galleries")

   # After
   from app.services.a2a_client import get_a2a_client
   client = get_a2a_client()
   result = await client.call_service(
       capability="gallery:read",
       method="GET /galleries",
   )
   ```

3. **Add A2A Authentication**:
   ```python
   # Add to endpoints
   from app.middleware.a2a_auth import A2AContextDep, require_a2a_permissions

   @router.get("/galleries")
   async def list_galleries(
       context: A2AContextDep,  # Require authentication
   ):
       # ...
   ```

4. **Validate Events**:
   ```python
   # Before
   await kafka.send("photo-events", raw_payload)

   # After
   from app.events.schema_registry import create_validated_event
   event = create_validated_event("photo.uploaded", **payload)
   await kafka.send("photo-events", event)
   ```

---

## FAQ

**Q: What's the difference between JWT tokens and API keys?**

A: JWT tokens are for service-to-service calls (trusted internal services). API keys are for external agents (Claude Desktop, custom integrations) with limited, scope-based permissions.

**Q: Can I use multiple API keys for the same workspace?**

A: Yes! Create separate API keys for different agents or purposes (e.g., one for Claude Desktop, one for Zapier integration).

**Q: How do I know if a service is healthy?**

A: Use `ServiceRegistry.discover()` - it returns `is_healthy` status based on recent heartbeats.

**Q: What happens when circuit breaker opens?**

A: All calls to that service are rejected immediately until the timeout expires (default 60s), then the circuit enters half-open state to test recovery.

**Q: Can I customize circuit breaker thresholds?**

A: Yes! Create a custom `CircuitBreakerConfig` with your thresholds when initializing the circuit breaker.

**Q: Are events validated automatically?**

A: No, you must explicitly call `EventSchemaRegistry.validate_event()` or use `create_validated_event()` helper.

---

## References

- [Service Registry Implementation](../backend/src/app/services/service_registry.py)
- [A2A Client Implementation](../backend/src/app/services/a2a_client.py)
- [A2A Auth Middleware](../backend/src/app/middleware/a2a_auth.py)
- [Agent API Keys API](../backend/src/app/api/v1/agent_api_keys.py)
- [Event Schema Registry](../backend/src/app/events/schema_registry.py)
- [Integration Tests](../backend/tests/integration/test_a2a_communication.py)

---

**Last Updated**: 2026-01-08
**Authors**: RawDrive Engineering Team
**Status**: Production Ready
