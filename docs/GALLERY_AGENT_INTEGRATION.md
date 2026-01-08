# Gallery Service: AI Agent Integration

**Status:** 🚧 In Progress (Phase 1 Complete)
**Timeline:** Jan 8 - Feb 26, 2026 (6 weeks)
**Progress:** 17% Complete

---

## Executive Summary

The Gallery Service is being transformed into an **agent-consumable service**, enabling AI agents to interact with gallery operations through standardized protocols:

- **MCP (Model Context Protocol)**: 12 tools for gallery CRUD, assets, Magic Links, and proofing
- **Google A2A**: 3 specialized agent endpoints for complex workflows
- **WebSocket**: Real-time notifications for agent updates
- **Batch Operations**: Efficient bulk operations for agents

**Key Principle:** The gallery service exposes gallery operations to AI agents while delegating all AI intelligence to the existing `ai-service` microservice.

---

## Quick Links

| Document | Description |
|----------|-------------|
| **[Implementation Plan](../C:/Users/admin/.claude/plans/serene-kindling-duckling.md)** | Complete 6-week implementation plan |
| **[Agent Integration Guide](../services/gallery-service/docs/AGENT_INTEGRATION.md)** | Architecture, components, and API docs |
| **[MCP Tools README](../services/gallery-service/src/services/mcp/README.md)** | MCP server documentation and usage |
| **[Implementation Status](../services/gallery-service/docs/IMPLEMENTATION_STATUS.md)** | Real-time progress tracking |

---

## Architecture Overview

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
        │   - MCP Server     ✅     │───┐
        │   - A2A Endpoints  📅     │   │
        │   - WebSocket      📅     │   │ Integration
        │   - Batch Ops      📅     │   │
        │   - Domain Logic   ✅     │   │
        └────────────┬──────────────┘   │
                     │                   │
                     │              ┌────▼──────────┐
                     │              │  AI Service   │
                     └──────────────►  (Existing)   │
                       HTTP Client   │              │
                                    │  - Gemini     │
                                    │  - CLIP       │
                                    │  - Upscaling  │
                                    └───────────────┘
```

**Legend:**
- ✅ Complete
- 🚧 In Progress
- 📅 Planned

---

## Implementation Phases

| Phase | Description | Status | Completion Date |
|-------|-------------|--------|-----------------|
| **1. MCP Tools** | 12 gallery operation tools | ✅ 90% | Jan 22, 2026 |
| **2. A2A Endpoints** | Google A2A protocol support | 📅 Planned | Jan 29, 2026 |
| **3. WebSocket & Batch** | Real-time + bulk operations | 📅 Planned | Feb 5, 2026 |
| **4. AI Integration** | ai-service client + circuit breaker | 📅 Planned | Feb 12, 2026 |
| **5. Infrastructure** | KEDA, Traefik, Prometheus | 📅 Planned | Feb 19, 2026 |
| **6. Production** | Testing + deployment | 📅 Planned | Feb 26, 2026 |

---

## MCP Tools (Phase 1) ✅ Complete

### 12 Tools Implemented

**Gallery CRUD (5 tools):**
1. `get_gallery` - Get gallery details with assets
2. `list_galleries` - List galleries with filtering
3. `create_gallery` - Create new gallery
4. `update_gallery` - Update gallery metadata
5. `delete_gallery` - Soft delete gallery

**Asset Operations (3 tools):**
6. `list_gallery_assets` - List assets in gallery
7. `add_assets_to_gallery` - Add assets to gallery
8. `remove_assets_from_gallery` - Remove assets from gallery

**Magic Links (2 tools):**
9. `create_magic_link` - Create shareable Magic Link
10. `validate_magic_link` - Validate Magic Link token

**Proofing (1 tool):**
11. `get_proofing_selections` - Get client selections/favorites

**Batch (1 tool):**
12. `batch_gallery_operations` - Execute multiple operations

**Authentication:**
- JWT context extraction ✅
- Permission-based access control ✅
- Multi-tenant workspace isolation ✅

**Documentation:**
- [MCP README](../services/gallery-service/src/services/mcp/README.md) ✅
- Usage examples (Python, JavaScript) ✅
- Authentication guide ✅
- Error handling guide ✅

---

## Google A2A Endpoints (Phase 2) 📅 Next

### 3 Specialized Agents

1. **Gallery Manager Agent**
   - `POST /api/v1/agents/gallery-manager/run`
   - Actions: create_gallery, list_galleries, update_gallery, add_assets, create_share_link

2. **Proofing Assistant Agent**
   - `POST /api/v1/agents/proofing-assistant/run`
   - Actions: get_selections, analyze_engagement, export_selections

3. **Batch Processor Agent**
   - `POST /api/v1/agents/batch-processor/run`
   - Actions: bulk_create_galleries, bulk_add_assets, clone_gallery

**Protocol Compliance:**
- A2A request/response schema
- Session management
- Multi-step workflows
- Error recovery

---

## WebSocket & Batch Operations (Phase 3) 📅 Planned

### WebSocket Notifications

**Endpoint:** `WS /ws/agents/{agent_id}`

**Events:**
- `gallery_created`
- `gallery_updated`
- `gallery_deleted`
- `assets_added`
- `assets_removed`
- `proofing_update`
- `magic_link_created`

### Batch Operations

**Capabilities:**
- Bulk gallery creation
- Bulk asset operations
- Gallery cloning
- Transaction consistency

**Performance Target:** 100 items/sec

---

## AI Service Integration (Phase 4) 📅 Planned

### AIServiceClient

**Proxy Methods:**
- `get_smart_recommendations()` - Call ai-service for recommendations
- `search_photos_semantic()` - Semantic search via CLIP
- `generate_captions()` - Gemini Vision captions
- `upscale_image()` - AI super-resolution

**Resilience:**
- Circuit breaker pattern
- Retry logic
- Fallback handling
- Error mapping

---

## Infrastructure Updates (Phase 5) 📅 Planned

### Traefik v3 Routes

```yaml
/mcp/gallery/*        → gallery-service (priority: 150, rate: 100/min)
/api/v1/agents/*      → gallery-service (priority: 148, rate: 50/min)
/api/v1/batch/*       → gallery-service (priority: 147, rate: 20/min)
```

### KEDA Autoscaling

**Triggers:**
- HTTP request rate (Traefik)
- Agent operation rate (Prometheus)
- Batch queue depth (Redis)
- P95 latency (Prometheus)

**Scaling:** 5-30 pods

### Prometheus Metrics

**New Metrics:**
- `gallery_agent_operations_total`
- `gallery_mcp_tool_calls_total`
- `gallery_batch_operations_total`
- `gallery_agent_websocket_connections`

---

## Testing & Production (Phase 6) 📅 Planned

### Test Coverage

| Test Type | Target | Status |
|-----------|--------|--------|
| Unit Tests | >80% coverage | 🚧 In Progress |
| Integration Tests | 100% passing | 📅 Planned |
| E2E Tests | 100% passing | 📅 Planned |
| Load Tests | 1000 ops/min | 📅 Planned |

### Performance Targets

| Metric | Target |
|--------|--------|
| MCP Tool P95 Latency | <500ms |
| A2A Endpoint P95 Latency | <1s |
| Batch Operations Throughput | 100 items/sec |
| WebSocket Connections | 1000 concurrent |
| Error Rate | <0.1% |

### Deployment Strategy

1. Staging deployment
2. Smoke tests
3. Canary rollout (10% → 50% → 100%)
4. Production monitoring

---

## Usage Examples

### MCP Tool Invocation (Python)

```python
from fastmcp import MCPClient

client = MCPClient("http://gallery-service:8004/mcp")

# Get gallery
result = await client.call_tool(
    "get_gallery",
    workspace_id="workspace-uuid",
    gallery_id="gallery-uuid",
    context={
        "auth": {
            "user_id": "user-uuid",
            "workspace_id": "workspace-uuid",
            "permissions": ["galleries:read"]
        }
    }
)

# Create gallery
result = await client.call_tool(
    "create_gallery",
    workspace_id="workspace-uuid",
    gallery_data={"title": "New Wedding Gallery"},
    context={...}
)
```

### A2A Agent Invocation (HTTP)

```bash
curl -X POST http://gallery-service:8004/api/v1/agents/gallery-manager/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": {
      "action": "create_gallery",
      "params": {"title": "New Gallery"}
    },
    "context": {...}
  }'
```

### WebSocket Connection (JavaScript)

```javascript
const ws = new WebSocket('ws://gallery-service:8004/ws/agents/agent-123');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Event:', event.event_type, event.gallery_id);
});
```

---

## Security

### Authentication Model

All operations require JWT context:

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

### Permission Levels

- `galleries:read` - Read operations
- `galleries:write` - Create/update operations
- `galleries:delete` - Delete operations
- `galleries:share` - Magic Link creation
- `galleries:ai:read` - AI insights access
- `*` - Wildcard (all permissions)

### Workspace Isolation

All operations enforce multi-tenant isolation:
1. Extract `workspace_id` from auth
2. Validate against request `workspace_id`
3. Filter all queries by `workspace_id`

---

## Monitoring & Observability

### Health Checks

- `GET /health` - Basic health
- `GET /health/ready` - Readiness (DB + Redis)
- `GET /metrics` - Prometheus metrics

### Grafana Dashboards

**Dashboard:** `infrastructure/monitoring/grafana/dashboards/gallery-agents.json`

**Panels:**
- Agent operations per minute
- MCP tool latency (P50, P95, P99)
- Batch queue depth
- WebSocket connections
- Error rate by type

### Alerts

**Critical:**
- Error rate >1%
- P95 latency >1s
- Queue depth >100
- WebSocket failures >10/min

---

## Files Created

### Source Code

| File | Lines | Description |
|------|-------|-------------|
| `services/gallery-service/src/services/mcp/mcp_server.py` | 650 | MCP server with 12 tools |
| `services/gallery-service/src/services/mcp/auth.py` | 100 | Authentication & authorization |
| `services/gallery-service/src/services/mcp/__init__.py` | 8 | Package initialization |
| `services/gallery-service/src/services/mcp/tools/__init__.py` | 2 | Tools package |

### Documentation

| File | Pages | Description |
|------|-------|-------------|
| `services/gallery-service/src/services/mcp/README.md` | 15 | MCP tools documentation |
| `services/gallery-service/docs/AGENT_INTEGRATION.md` | 20 | Complete integration guide |
| `services/gallery-service/docs/IMPLEMENTATION_STATUS.md` | 10 | Progress tracking |
| `docs/GALLERY_AGENT_INTEGRATION.md` | 8 | This document |

---

## Next Steps

### This Week (Jan 8-15)

1. ✅ Complete MCP server implementation
2. ✅ Write comprehensive documentation
3. 🚧 Write unit tests (80%+ coverage)
4. 📅 Begin A2A endpoint implementation

### Next Week (Jan 15-22)

1. Complete Phase 1 (MCP tools)
2. Begin Phase 2 (A2A endpoints)
3. Update Traefik routing configuration
4. Add initial Prometheus metrics

### Month 1 (Jan 8 - Feb 5)

1. Complete Phases 1-3
2. Infrastructure updates
3. Initial testing
4. Staging deployment

### Month 2 (Feb 5 - Feb 26)

1. Complete Phases 4-6
2. Comprehensive testing
3. Production deployment
4. Monitoring and optimization

---

## Support & Resources

- **Implementation Plan:** `.claude/plans/serene-kindling-duckling.md`
- **MCP Documentation:** `services/gallery-service/src/services/mcp/README.md`
- **Agent Integration:** `services/gallery-service/docs/AGENT_INTEGRATION.md`
- **Status Tracking:** `services/gallery-service/docs/IMPLEMENTATION_STATUS.md`
- **GitHub Issues:** [Report Issues](https://github.com/rawdrive/issues)

---

**Last Updated:** 2026-01-08
**Next Review:** 2026-01-15
**Contact:** Development Team
