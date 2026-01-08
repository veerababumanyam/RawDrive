# A2A Integration Testing Guide

**Phase 4: Complete** | **Testing Status**: Ready for Integration Testing
**Last Updated**: 2026-01-08

---

## Prerequisites

1. **Redis Running**: `docker exec -it rawdrive-redis redis-cli PING` should return `PONG`
2. **Services Running**: At least one microservice should be started
3. **Environment Variables**: Each service needs:
   - `REDIS_URL` - Redis connection string
   - `SERVICE_BASE_URL` - Service's external URL
   - `SERVICE_ID` - Unique service instance ID (optional, auto-generated if not set)

---

## Testing Checklist

### 1. Verify Redis Connection

```bash
docker exec -it rawdrive-redis redis-cli PING
# Expected output: PONG
```

---

### 2. Start Backend Service and Check Registration

```bash
# Start backend service
docker compose -f infrastructure/docker/docker-compose.yml up -d backend

# Watch backend logs for registration
docker compose -f infrastructure/docker/docker-compose.yml logs -f backend | grep "A2A"
```

**Expected Log Output**:
```
Backend service registered in A2A registry: <service-id>
```

---

### 3. Verify Service in Redis

```bash
# Connect to Redis CLI
docker exec -it rawdrive-redis redis-cli

# List all registered services
KEYS "service:*"
# Expected: ["service:backend:<service-id>"]

# Get backend service details
GET "service:backend:<service-id>"
# Expected: JSON with service_name, base_url, capabilities, etc.

# Check capability indexes
SMEMBERS "capability:auth:login"
# Expected: ["service:backend:<service-id>"]

# Check service TTL (should be ~30 seconds, renewing every 15 seconds)
TTL "service:backend:<service-id>"
# Expected: Number between 15-30
```

---

### 4. Start All Services and Verify Registration

```bash
# Start all services
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Watch all logs for A2A registration
docker compose -f infrastructure/docker/docker-compose.yml logs | grep "A2A registry"
```

**Expected Services**:
1. Backend (6 capabilities)
2. Gallery Service (5 capabilities)
3. Upload Service (4 capabilities)
4. Billing Service (5 capabilities)
5. Onboarding Service (3 capabilities)
6. Invitations Service (3 capabilities)
7. AI Service (4 capabilities)

---

### 5. Verify All Services in Redis

```bash
docker exec -it rawdrive-redis redis-cli

# Count registered services
KEYS "service:*" | wc -l
# Expected: 7 (or more if multiple instances)

# List all capability indexes
KEYS "capability:*"
# Expected: 27 capability keys

# Check specific capabilities
SMEMBERS "capability:gallery:read"
SMEMBERS "capability:upload:create"
SMEMBERS "capability:ai:analyze"
SMEMBERS "capability:subscription:write"
```

---

### 6. Test Service Discovery

Create a test script or use Python REPL:

```python
import asyncio
import sys
sys.path.insert(0, '/app/backend/src')

from app.services.service_registry import get_service_registry

async def test_discovery():
    registry = get_service_registry()

    # Discover gallery services
    services = await registry.discover("gallery:read")
    print(f"Found {len(services)} services with gallery:read capability")
    for svc in services:
        print(f"  - {svc.service_name} at {svc.base_url}")

    # Discover upload services
    services = await registry.discover("upload:create")
    print(f"Found {len(services)} services with upload:create capability")

    # Discover AI services
    services = await registry.discover("ai:analyze")
    print(f"Found {len(services)} services with ai:analyze capability")

asyncio.run(test_discovery())
```

---

### 7. Test Heartbeat Mechanism

```bash
# Monitor a service key's TTL over time
docker exec -it rawdrive-redis redis-cli

# Watch TTL for 1 minute (should reset every 15 seconds)
for i in {1..12}; do
  TTL "service:backend:<service-id>"
  sleep 5
done
```

**Expected Behavior**:
- TTL starts at ~30 seconds
- Decreases: 30 → 25 → 20 → 15
- Resets to 30 after heartbeat
- Never reaches 0 while service is running

---

### 8. Test Service Unregistration

```bash
# Stop a service
docker compose -f infrastructure/docker/docker-compose.yml stop gallery-service

# Wait a few seconds, then check Redis
docker exec -it rawdrive-redis redis-cli

# Service key should be gone (TTL expired or explicitly unregistered)
KEYS "service:gallery-service:*"
# Expected: (empty array) or removed after 30 seconds

# Capability index should also be updated
SMEMBERS "capability:gallery:read"
# Expected: No gallery-service entries
```

---

### 9. Test A2A Client Communication

Test service-to-service communication with circuit breaker:

```python
import asyncio
import sys
sys.path.insert(0, '/app/backend/src')

from app.services.a2a_client import A2AClient

async def test_service_call():
    client = A2AClient()

    try:
        # Call gallery service via capability
        result = await client.call_service(
            capability="gallery:read",
            method="GET",
            endpoint="/api/v1/galleries",
            params={"workspace_id": "<workspace-id>", "page": 1}
        )
        print("Service call successful:", result)
    except Exception as e:
        print("Service call failed:", e)

asyncio.run(test_service_call())
```

---

### 10. Test Agent API Keys

#### Create an API Key

```bash
curl -X POST http://localhost/api/v1/workspaces/<workspace-id>/agent-api-keys \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "key_name": "Claude Desktop MCP",
    "scopes": ["galleries:read", "photos:read", "ai:analyze"],
    "rate_limit_rpm": 100,
    "expires_at": null
  }'
```

**Expected Response**:
```json
{
  "key_id": "<uuid>",
  "api_key": "rawdrive_sk_<workspace-id>_<random>",
  "key_name": "Claude Desktop MCP",
  "scopes": ["galleries:read", "photos:read", "ai:analyze"],
  "created_at": "2026-01-08T...",
  "message": "API key will only be shown once. Store it securely."
}
```

#### Use API Key

```bash
curl -X GET http://localhost/api/v1/galleries \
  -H "Authorization: Bearer rawdrive_sk_<workspace-id>_<random>"
```

---

### 11. Test Traefik Routing

#### Verify A2A Endpoints

```bash
# Test A2A registry endpoint (priority 165)
curl -X GET http://localhost/api/v1/a2a/registry/services \
  -H "Authorization: Bearer <jwt-token>"

# Test A2A API keys endpoint (priority 142)
curl -X GET http://localhost/api/v1/workspaces/<workspace-id>/agent-api-keys \
  -H "Authorization: Bearer <jwt-token>"
```

#### Check Traefik Dashboard

```bash
# Open Traefik dashboard
open http://localhost:8080/dashboard/

# Check:
# 1. Routers section - should see a2a-registry-router-local and a2a-api-keys-router-local
# 2. Middlewares section - should see rate-limit-a2a and a2a-headers
# 3. Services section - should see backend-service routing
```

---

### 12. Test Circuit Breaker

Simulate service failure to test circuit breaker:

```python
import asyncio
import sys
sys.path.insert(0, '/app/backend/src')

from app.services.a2a_client import A2AClient

async def test_circuit_breaker():
    client = A2AClient()

    # Make 6 requests to failing service (threshold = 5)
    for i in range(6):
        try:
            result = await client.call_service(
                capability="nonexistent:service",
                method="GET",
                endpoint="/test"
            )
        except Exception as e:
            print(f"Request {i+1} failed: {e}")

    # Circuit should be OPEN after 5 failures
    print("Circuit breaker should now be OPEN")

    # Wait 60 seconds for circuit to go HALF_OPEN
    await asyncio.sleep(60)

    # Try again - circuit will attempt reconnection
    try:
        result = await client.call_service(
            capability="nonexistent:service",
            method="GET",
            endpoint="/test"
        )
    except Exception as e:
        print(f"Circuit HALF_OPEN test: {e}")

asyncio.run(test_circuit_breaker())
```

---

## Integration Test Scenarios

### Scenario 1: Full Registration Flow

**Steps**:
1. Start Redis
2. Start Backend service
3. Verify service appears in Redis within 1 second
4. Verify capability indexes created
5. Verify heartbeat renews TTL every 15 seconds
6. Stop service
7. Verify service removed from Redis (immediately or after 30s TTL)

**Success Criteria**:
- All steps complete without errors
- Service discoverable while running
- Service removed when stopped

---

### Scenario 2: Multi-Instance Registration

**Steps**:
1. Start 3 instances of gallery-service (using different SERVICE_ID env vars)
2. Query Redis for all gallery-service instances
3. Discover "gallery:read" capability - should return 3 services
4. Stop 1 instance
5. Discover again - should return 2 services

**Success Criteria**:
- All instances register with unique service IDs
- Capability discovery returns all healthy instances
- Removed instances don't appear in discovery

---

### Scenario 3: Service-to-Service Communication

**Steps**:
1. Start Backend and Gallery services
2. From Backend, call A2A client to discover and call Gallery service
3. Verify Gallery service receives request
4. Verify response returned to Backend
5. Stop Gallery service
6. Backend should fail over or return error (circuit breaker)

**Success Criteria**:
- Successful service-to-service call via capability
- Circuit breaker opens after failures
- Automatic failover to backup services if available

---

### Scenario 4: External Agent Access

**Steps**:
1. Create API key via backend API
2. Store API key securely
3. Use API key to call MCP tools (AI service)
4. Verify permission scopes enforced
5. Test rate limiting (exceed RPM limit)
6. Revoke API key
7. Verify revoked key rejected

**Success Criteria**:
- API key authenticates successfully
- Scoped permissions enforced
- Rate limiting works
- Revoked keys rejected

---

## Troubleshooting

### Service Not Registering

**Problem**: Service starts but doesn't appear in Redis

**Check**:
```bash
# 1. Check service logs
docker compose logs <service-name> | grep "A2A"

# 2. Verify Redis connection from service
docker exec -it <service-container> redis-cli -h redis PING

# 3. Check Redis is reachable
docker exec -it <service-container> env | grep REDIS_URL

# 4. Verify import path
docker exec -it <service-container> python -c "import sys; sys.path.insert(0, '/app/backend/src'); from app.services.service_registry import get_service_registry; print('OK')"
```

---

### Heartbeat Failing

**Problem**: Service disappears from Redis after 30 seconds

**Check**:
```bash
# 1. Check for heartbeat task errors in logs
docker compose logs <service-name> | grep "Heartbeat"

# 2. Monitor TTL manually
docker exec -it rawdrive-redis redis-cli
TTL "service:<service-name>:<service-id>"
# Run multiple times - should reset to ~30 every 15 seconds
```

**Solutions**:
- Verify heartbeat task is created and running
- Check for asyncio cancellation or exceptions
- Ensure Redis connection doesn't timeout

---

### Service Discovery Returns Empty

**Problem**: `discover()` returns no services

**Check**:
```bash
# 1. Verify capability name is correct (case-sensitive)
docker exec -it rawdrive-redis redis-cli
KEYS "capability:*"  # List all capabilities

# 2. Check if service is healthy
GET "service:<service-name>:<service-id>"
# Look for "is_healthy": true

# 3. Verify service hasn't expired
TTL "service:<service-name>:<service-id>"
# Should be > 0
```

---

### Circuit Breaker Not Opening

**Problem**: Circuit breaker doesn't open after failures

**Check**:
```python
# Print circuit breaker state
import asyncio
from app.services.a2a_client import A2AClient

async def check_circuit():
    client = A2AClient()
    # Make failing requests
    for i in range(10):
        try:
            await client.call_service("nonexistent:service", "GET", "/test")
        except Exception:
            pass

    # Check circuit breaker state
    cb = client._get_circuit_breaker("nonexistent:service")
    print(f"Circuit state: {cb.state}")
    print(f"Failure count: {cb.failure_count}")

asyncio.run(check_circuit())
```

**Expected**: State should be OPEN after 5 failures

---

## Performance Benchmarks

### Expected Latencies

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Service Registration | < 50ms | < 100ms |
| Service Discovery | < 10ms | < 50ms |
| Heartbeat | < 20ms | < 50ms |
| A2A Service Call | < 100ms | < 500ms |
| Circuit Breaker Check | < 1ms | < 5ms |

### Load Testing

```bash
# Test service registration under load (100 services)
for i in {1..100}; do
  # Register test service
  docker exec -it backend python -c "
import asyncio
from app.services.service_registry import get_service_registry, ServiceRegistration, ServiceCapability

async def test():
    registry = get_service_registry()
    await registry.register(ServiceRegistration(
        service_name='test-$i',
        service_id='test-$i',
        base_url='http://test-$i:9999',
        capabilities=[ServiceCapability(name='test:$i', version='1.0', endpoint='/test')],
        health_check_endpoint='/health'
    ))
    print('Registered test-$i')

asyncio.run(test())
"
done

# Count registered services
docker exec -it rawdrive-redis redis-cli KEYS "service:*" | wc -l
# Expected: >= 100
```

---

## Monitoring

### Prometheus Metrics

**Available Metrics**:
- `a2a_service_registrations_total` - Total service registrations
- `a2a_service_discoveries_total` - Total service discoveries
- `a2a_heartbeats_total` - Total heartbeats sent
- `a2a_circuit_breaker_state` - Circuit breaker states (0=closed, 1=open, 2=half-open)
- `a2a_service_calls_total` - Total service-to-service calls
- `a2a_service_call_duration_seconds` - Service call latency

**Query Examples**:
```promql
# Service registration rate
rate(a2a_service_registrations_total[5m])

# Service discovery latency
histogram_quantile(0.95, rate(a2a_service_discovery_duration_seconds_bucket[5m]))

# Circuit breaker open count
sum(a2a_circuit_breaker_state == 1)

# Failed service calls
rate(a2a_service_calls_total{status="failed"}[5m])
```

---

## Next Steps

1. **Add Grafana Dashboards** - Visualize A2A metrics
2. **Performance Testing** - Load test with 1000+ service instances
3. **Production Deployment** - Deploy to staging/production
4. **Kubernetes Testing** - Test with multiple pod replicas
5. **Security Audit** - Review JWT validation, API key security
6. **Documentation** - Add OpenAPI specs for A2A endpoints

---

**Document Status**: Ready for Testing
**Phase 4 Status**: Complete
**Next Review**: After integration testing
