# Gallery Service: AI Agent Integration

## Overview

The Gallery Service has been enhanced to become an **agent-consumable service**, enabling AI agents to interact with gallery operations through standardized protocols (MCP and Google A2A). This integration allows external AI systems, automation workflows, and chatbots to manage galleries, assets, Magic Links, and proofing operations.

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                         AI Agents                            │
│  (External AI systems, automation, chatbots, workflows)      │
└────────────┬────────────────────────────────┬────────────────┘
             │                                │
             │ MCP Tools                      │ Google A2A
             │                                │
        ┌────▼────────────────────────────────▼─────┐
        │         Traefik v3 Gateway                │
        │   /mcp/gallery/*  /api/v1/agents/*        │
        └────────────┬──────────────────────────────┘
                     │
        ┌────────────▼──────────────┐
        │   Gallery Service         │
        │   (Agent-Consumable)      │
        │                           │
        │   - MCP Server            │───┐
        │   - A2A Endpoints         │   │
        │   - WebSocket Events      │   │ Integration
        │   - Batch Operations      │   │
        │   - Gallery Domain Logic  │   │
        └────────────┬──────────────┘   │
                     │                   │
                     │ PostgreSQL        │
                     │ Redis             │
                     │                   │
                     │              ┌────▼──────────┐
                     │              │  AI Service   │
                     └──────────────►  (Existing)   │
                       HTTP Client   │              │
                                    │  - Gemini     │
                                    │  - CLIP       │
                                    │  - Upscaling  │
                                    │  - MCP Tools  │
                                    └───────────────┘
```

### Design Principles

**What Gallery Service IS:**
- ✅ **Agent-consumable service** - Exposes gallery operations via MCP + A2A
- ✅ **Gallery domain expert** - Manages galleries, assets, Magic Links, proofing
- ✅ **Integration layer** - Calls ai-service for AI operations
- ✅ **Real-time updates** - WebSocket notifications for agents
- ✅ **Batch operations** - Efficient bulk operations for agents

**What Gallery Service IS NOT:**
- ❌ **AI provider** - ai-service handles all AI intelligence
- ❌ **Image processor** - ai-service handles upscaling, analysis, etc.
- ❌ **Duplicate logic** - Reuses existing ai-service capabilities

## Components

### 1. MCP Server (Phase 1) ✅ COMPLETED

**Location:** `src/services/mcp/`

**Features:**
- 12 MCP tools for gallery operations
- Authentication and workspace isolation
- Permission-based access control
- FastMCP framework integration

**Tools:**
1. `get_gallery` - Get gallery details with assets
2. `list_galleries` - List galleries with filtering
3. `create_gallery` - Create new gallery
4. `update_gallery` - Update gallery metadata
5. `delete_gallery` - Soft delete gallery
6. `list_gallery_assets` - List assets in gallery
7. `add_assets_to_gallery` - Add assets to gallery
8. `remove_assets_from_gallery` - Remove assets from gallery
9. `create_magic_link` - Create shareable Magic Link
10. `validate_magic_link` - Validate Magic Link token
11. `get_proofing_selections` - Get client selections/favorites
12. `batch_gallery_operations` - Execute multiple operations

**Documentation:** [MCP README](../src/services/mcp/README.md)

### 2. Google A2A Endpoints (Phase 2) 🚧 IN PROGRESS

**Location:** `src/api/v1/agents.py`

**Features:**
- A2A protocol compliance
- 3 specialized agent endpoints
- Session management
- Multi-step workflows

**Endpoints:**
- `POST /api/v1/agents/gallery-manager/run` - Gallery CRUD operations
- `POST /api/v1/agents/proofing-assistant/run` - Proofing operations
- `POST /api/v1/agents/batch-processor/run` - Bulk operations

### 3. WebSocket Notifications (Phase 3) 📅 PLANNED

**Location:** `src/api/v1/websocket_agents.py`

**Features:**
- Real-time agent notifications
- Event-driven updates
- Multiple agent connections
- Event filtering

**Events:**
- `gallery_created`
- `gallery_updated`
- `gallery_deleted`
- `assets_added`
- `assets_removed`
- `proofing_update`
- `magic_link_created`

### 4. Batch Operations (Phase 3) 📅 PLANNED

**Location:** `src/services/batch/`

**Features:**
- Bulk gallery creation
- Bulk asset operations
- Gallery cloning
- Transaction consistency

### 5. AI Service Integration (Phase 4) 📅 PLANNED

**Location:** `src/services/ai_client/`

**Features:**
- HTTP client for ai-service
- Circuit breaker pattern
- Retry logic
- Error handling

**Capabilities:**
- Smart recommendations
- Semantic search
- Quality analysis
- Caption generation
- Image upscaling

## Implementation Status

### Phase 1: MCP Tools (Weeks 1-2) ✅ COMPLETED

**Tasks:**
- [x] Create MCP server structure
- [x] Implement 12 MCP tools
- [x] Add authentication and workspace isolation
- [ ] Write unit tests (80%+ coverage) - IN PROGRESS

**Deliverables:**
- [x] MCP server running
- [x] 12 MCP tools functional
- [x] Authentication working
- [ ] Unit tests passing

### Phase 2: Google A2A Endpoints (Weeks 2-3) 🚧 NEXT

**Tasks:**
- [ ] Create A2A endpoint structure
- [ ] Implement 3 agent endpoints
- [ ] Add A2A request/response validation
- [ ] Write A2A integration tests

### Phase 3: WebSocket & Batch (Weeks 3-4) 📅 PLANNED

**Tasks:**
- [ ] Implement WebSocket notifications
- [ ] Create batch operation service
- [ ] Add Redis queue for batch processing
- [ ] Write WebSocket and batch tests

### Phase 4: AI Service Integration (Weeks 4-5) 📅 PLANNED

**Tasks:**
- [ ] Create AIServiceClient
- [ ] Implement proxy methods
- [ ] Add circuit breaker
- [ ] Write integration tests

### Phase 5: KEDA & Infrastructure (Week 5) 📅 PLANNED

**Tasks:**
- [ ] Update KEDA ScaledObject
- [ ] Update Traefik configuration
- [ ] Add Prometheus scrape configs
- [ ] Update Docker Compose

### Phase 6: Testing & Documentation (Week 6) 📅 PLANNED

**Tasks:**
- [ ] E2E tests
- [ ] Load tests
- [ ] Documentation
- [ ] Staging deployment

## API Documentation

### MCP Endpoints

Base URL: `http://gallery-service:8004/mcp/`

**Tool Invocation:**
```http
POST /mcp/tools/{tool_name}
Content-Type: application/json

{
  "workspace_id": "uuid",
  "gallery_id": "uuid",
  "context": {
    "auth": {
      "user_id": "uuid",
      "workspace_id": "uuid",
      "permissions": ["galleries:read"]
    }
  }
}
```

**Health Check:**
```http
GET /mcp/health
GET /mcp/health/ready
```

### A2A Endpoints

Base URL: `http://gallery-service:8004/api/v1/agents/`

**Agent Invocation:**
```http
POST /api/v1/agents/{agent_name}/run
Content-Type: application/json

{
  "task": {
    "action": "create_gallery",
    "params": {"title": "New Gallery"}
  },
  "session_id": "optional-session-id",
  "context": {...}
}
```

### WebSocket

**Connection:**
```
WS ws://gallery-service:8004/ws/agents/{agent_id}
```

**Message Format:**
```json
{
  "event_type": "gallery_created",
  "gallery_id": "uuid",
  "timestamp": "2026-01-08T...",
  "data": {...}
}
```

## Authentication & Authorization

### Authentication Context

All API calls require authentication context:

```json
{
  "auth": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:read", "galleries:write"],
    "email": "user@example.com"
  }
}
```

### Permission Model

- `galleries:read` - Read gallery and asset data
- `galleries:write` - Create and update galleries
- `galleries:delete` - Delete galleries
- `galleries:share` - Create Magic Links
- `galleries:ai:read` - Access AI insights
- `*` - Wildcard (all permissions)

### Workspace Isolation

All operations enforce multi-tenant isolation:
1. Extract `workspace_id` from auth context
2. Verify it matches requested `workspace_id`
3. All database queries filter by `workspace_id`

## Infrastructure

### Traefik v3 Routing

**Routes:**
- `/mcp/gallery/*` → gallery-service (priority: 150)
- `/api/v1/agents/*` → gallery-service (priority: 148)
- `/api/v1/batch/*` → gallery-service (priority: 147)

**Rate Limits:**
- MCP tools: 100 req/min
- A2A endpoints: 50 req/min
- Batch operations: 20 req/min

**Configuration:** `infrastructure/docker/traefik/dynamic.yaml`

### KEDA Autoscaling

**Scaling Triggers:**
1. HTTP request rate (Traefik metrics)
2. Agent operation rate (Prometheus)
3. Batch operation queue depth (Redis)
4. P95 latency (Prometheus)

**Scaling Range:**
- Min: 5 replicas
- Max: 30 replicas
- Polling: 15 seconds
- Cooldown: 60 seconds

**Configuration:** `infrastructure/keda/scaledobject.yaml`

### Prometheus Metrics

**New Metrics:**
- `gallery_agent_operations_total{workspace_id, agent_type, operation, status}`
- `gallery_agent_operation_duration_seconds{agent_type, operation}`
- `gallery_mcp_tool_calls_total{tool_name, status}`
- `gallery_mcp_tool_duration_seconds{tool_name}`
- `gallery_batch_operations_total{operation_type, status}`
- `gallery_agent_websocket_connections{agent_type}`

**Configuration:** `infrastructure/monitoring/prometheus/prometheus.yaml`

## Testing

### Unit Tests

**Location:** `tests/unit/test_mcp_tools.py`

**Coverage Target:** 80%+

**Command:**
```bash
pytest tests/unit/test_mcp_tools.py -v --cov=src/services/mcp
```

### Integration Tests

**Location:** `tests/integration/test_mcp_endpoints.py`

**Tests:**
- MCP tool invocation with authentication
- A2A endpoint protocol compliance
- WebSocket event delivery
- Batch operation consistency

### E2E Tests

**Location:** `tests/e2e/test_agent_workflow.py`

**Scenarios:**
- Multi-step agent workflows
- Gallery creation and asset management
- Magic Link creation and validation
- Proofing workflow

### Load Tests

**Tool:** K6

**Targets:**
- 100 concurrent agents
- 1000 MCP tool calls/min
- 50 batch operations/min
- 1000 WebSocket connections

## Deployment

### Docker Compose

```yaml
services:
  gallery-mcp:
    build: ./services/gallery-service
    ports:
      - "8005:8005"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
    command: uvicorn src.services.mcp.mcp_server:app --port 8005
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gallery-service
spec:
  replicas: 5
  template:
    spec:
      containers:
      - name: gallery-service
        image: gallery-service:latest
        ports:
        - containerPort: 8004  # Main API
        - containerPort: 8005  # MCP server
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: gallery-secrets
              key: database-url
```

## Monitoring

### Health Checks

**Kubernetes Probes:**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8004
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8004
  initialDelaySeconds: 5
  periodSeconds: 10
```

### Grafana Dashboards

**Dashboard:** `infrastructure/monitoring/grafana/dashboards/gallery-agents.json`

**Panels:**
- Agent operations per minute
- MCP tool latency (P50, P95, P99)
- Batch operation queue depth
- WebSocket connections
- Error rate by operation type

### Alerts

**Critical Alerts:**
- Agent operation error rate >1%
- MCP tool P95 latency >1s
- Batch queue depth >100
- WebSocket connection failures >10/min

## Security

### Best Practices

1. **Authentication Required** - All tools require valid auth context
2. **Workspace Isolation** - Multi-tenant data separation
3. **Permission Checks** - Fine-grained access control
4. **Rate Limiting** - Prevent abuse and DoS
5. **Audit Logging** - All operations logged
6. **No PII in Logs** - Sensitive data filtered

### Threat Model

**Mitigated Threats:**
- Cross-workspace data access
- Unauthorized gallery operations
- Rate limit bypass
- Session hijacking

**Monitoring:**
- Failed authentication attempts
- Permission denial patterns
- Unusual batch operation sizes

## Troubleshooting

### Common Issues

**MCPAuthError: Missing user_id**
- **Cause:** Authentication context not provided
- **Solution:** Include `context.auth` with `user_id` and `workspace_id`

**MCPPermissionError: Workspace ID mismatch**
- **Cause:** Requested workspace_id doesn't match auth context
- **Solution:** Verify user has access to the workspace

**Tool invocation timeout**
- **Cause:** Database connection pool exhausted
- **Solution:** Check connection pool settings, scale up replicas

**WebSocket connection refused**
- **Cause:** Service not ready or port not exposed
- **Solution:** Check readiness probe, verify port configuration

### Debug Mode

Enable detailed logging:
```python
import logging
logging.getLogger('src.services.mcp').setLevel(logging.DEBUG)
```

## Roadmap

- [x] **Phase 1:** MCP Tools (Weeks 1-2)
- [ ] **Phase 2:** Google A2A Endpoints (Weeks 2-3)
- [ ] **Phase 3:** WebSocket & Batch Operations (Weeks 3-4)
- [ ] **Phase 4:** AI Service Integration (Weeks 4-5)
- [ ] **Phase 5:** KEDA & Infrastructure (Week 5)
- [ ] **Phase 6:** Testing & Production (Week 6)

## Contributing

### Adding New MCP Tools

1. Add tool function to `src/services/mcp/mcp_server.py`
2. Add `@mcp.tool()` decorator
3. Implement authentication checks
4. Add workspace isolation
5. Write unit tests
6. Update documentation

### Adding New A2A Endpoints

1. Create endpoint in `src/api/v1/agents.py`
2. Implement A2A request/response schema
3. Add action handlers
4. Write integration tests
5. Update API documentation

## Support

- **Documentation:** `services/gallery-service/docs/`
- **MCP README:** `src/services/mcp/README.md`
- **Issues:** GitHub Issues
- **Runbook:** `docs/runbooks/gallery-agent-integration.md`

## License

Copyright © 2026 RawDrive. All rights reserved.
