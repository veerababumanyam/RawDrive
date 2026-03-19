# Phase 8: Notifications - Research

**Researched:** 2026-03-19
**Domain:** WebSocket real-time notifications, Redis pub/sub, notification wiring
**Confidence:** HIGH

## Summary

Phase 8 connects existing infrastructure into a working real-time notification pipeline. The backend already has a complete WebSocket endpoint (`backend/src/app/api/v1/websocket.py`) that authenticates via JWT, subscribes to Redis pub/sub channels per workspace, and forwards messages to connected clients. The frontend already has a `useSocket` hook with reconnection logic. The notifications-service microservice (port 8010) has a full REST API for notification management. What is missing is: (1) the notifications-service subscribing to Redis and publishing events to WebSocket channels, (2) churn intervention worker actually publishing to Redis instead of logging "Would send", and (3) curation session service emitting status change events via the existing `websocket_service.emit_event` pattern.

This phase is primarily a **wiring** phase -- connecting existing stubs and TODOs to the already-built Redis pub/sub and WebSocket infrastructure. No new libraries or major architectural changes are needed.

**Primary recommendation:** Wire the three existing stub points (notifications-service Redis subscriber, churn intervention publisher, curation session status emitter) using the established `websocket_service.emit_event` and `notification_event_publisher.publish_notification_event` patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices at Claude's discretion.

### Claude's Discretion
- NOTF-01: WebSocket connection on backend for real-time notifications
- NOTF-02: Notifications-service publishes events via Redis pub/sub to connected clients
- NOTF-03: Churn intervention notifications wired (currently stubbed)
- NOTF-04: Curation session status notifications wired (currently stubbed)

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NOTF-01 | WebSocket connection established on backend for real-time notifications | Already implemented in `backend/src/app/api/v1/websocket.py` -- needs verification/hardening only |
| NOTF-02 | Notifications-service publishes events via Redis pub/sub to connected clients | notifications-service needs Redis subscriber + publisher to `ws:workspace:{id}` channels |
| NOTF-03 | Churn intervention notifications wired (currently stubbed) | `churn_intervention_worker.py` lines 519-535 have TODO stubs for email and in-app notifications |
| NOTF-04 | Curation session status notifications wired (currently stubbed) | `curation_session_service.py` line 530 has `# TODO: Send WebSocket notification` |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI WebSocket | built-in | WebSocket endpoint in backend | Already implemented, native FastAPI support |
| redis.asyncio | existing | Redis pub/sub for event distribution | Already used throughout project |
| redis (notifications-service) | existing | Redis client in notifications-service | Already configured with circuit breaker |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| websocket_service.py | existing | emit_event helper for Redis pub/sub | All WebSocket event publishing from backend |
| notification_event_publisher.py | existing | publish_notification_event to Redis | Cross-service notification events |
| useSocket hook | existing | Frontend WebSocket connection | Already auto-connects with JWT auth |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Redis pub/sub | Server-Sent Events (SSE) | Redis pub/sub already wired end-to-end; SSE would require new infrastructure |
| In-process WebSocket | Socket.IO | Adds dependency; native WebSocket already working with reconnect |

**Installation:** No new packages needed. All dependencies already present.

## Architecture Patterns

### Existing Event Flow (Already Built)
```
Backend Service
  -> websocket_service.emit_event(workspace_id, event_type, data)
    -> redis.publish("ws:workspace:{workspace_id}", json_event)
      -> websocket.py forward_messages() loop picks up message
        -> websocket.send_json(event_data) to connected clients
          -> useSocket hook's handleMessage dispatches to React
```

### Notifications-Service Event Flow (To Build for NOTF-02)
```
notifications-service processes notification
  -> redis.publish("ws:workspace:{workspace_id}", json_event)
    -> backend WebSocket endpoint picks up and forwards to client
```

### Event Channel Convention
```
ws:workspace:{workspace_id}     -- workspace-scoped real-time events
notification:events             -- cross-service notification bus (already exists)
```

### Event Type Convention (Existing Pattern)
```python
# Namespace:action format used throughout codebase:
"asset:created"
"asset:processed"
"asset:deleted"
"activity:created"
"upload:progress"
"album:operation"
"design:cursor"

# New events to add:
"notification:new"              -- new notification for in-app display
"curation:status_changed"       -- curation session progress update
"churn:intervention_created"    -- churn intervention triggered
```

### Anti-Patterns to Avoid
- **Publishing without workspace_id:** Every Redis publish MUST include workspace_id for tenant isolation
- **Blocking the WebSocket loop:** Never do DB queries inside the forward_messages loop
- **Hardcoded event types:** Use constants, not string literals scattered through code

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket connection | New WebSocket server | Existing `websocket.py` endpoint | Already handles auth, Redis sub, cleanup |
| Event publishing | Custom event bus | `websocket_service.emit_event()` | Already handles try/except, logging, JSON serialization |
| Frontend WS | Custom WebSocket wrapper | Existing `useSocket` hook | Has reconnect, auth token, event dispatch |
| Cross-service notifications | HTTP callbacks | `notification_event_publisher.publish_notification_event()` | Already handles Redis publish with error handling |

**Key insight:** This phase is about wiring, not building. Every component exists -- the task is connecting the dots at the 3-4 stub points identified in the codebase.

## Common Pitfalls

### Pitfall 1: Notifications-Service Redis Channel Mismatch
**What goes wrong:** Notifications-service publishes to wrong Redis channel, messages never reach WebSocket clients
**Why it happens:** Two different channel patterns exist: `ws:workspace:{id}` (for WebSocket forwarding) and `notification:events` (for cross-service events)
**How to avoid:** For real-time client delivery, always publish to `ws:workspace:{workspace_id}`. The `notification:events` channel is for backend-to-notifications-service communication only.
**Warning signs:** Frontend never receives events despite notifications-service confirming publish

### Pitfall 2: Churn Worker Not Having Redis Access
**What goes wrong:** Churn intervention worker uses `app.db.postgres` (asyncpg) but may not initialize Redis
**Why it happens:** Worker was built as standalone with its own FastAPI app and only postgres pool init
**How to avoid:** Ensure `init_redis_client()` is called in the worker's lifespan, or use HTTP call to notifications-service instead
**Warning signs:** `RuntimeError: Redis client has not been initialized`

### Pitfall 3: WebSocket Event Type Not Handled by Frontend
**What goes wrong:** Backend publishes new event types but frontend `useSocket` hook ignores them
**Why it happens:** `WebSocketEvent` TypeScript interface only lists specific event types; new types are silently dropped
**How to avoid:** Extend the `WebSocketEvent` interface in `useSocket.ts` and add `window.dispatchEvent` cases for new types
**Warning signs:** Events visible in browser DevTools Network/WS tab but no UI reaction

### Pitfall 4: Notification Service Redis Client Different from Backend
**What goes wrong:** Notifications-service has its own Redis client (`src/cache/redis_client.py`) with circuit breaker pattern, different from backend's `app/db/redis.py`
**Why it happens:** Microservice isolation -- each service has its own Redis client
**How to avoid:** Use the notifications-service's existing `redis_client` for pub/sub within that service. Ensure both services connect to the same Redis instance (they share `REDIS_URL` env var).

## Code Examples

### Pattern 1: Publishing WebSocket Events from Backend (Existing)
```python
# Source: backend/src/app/services/websocket_service.py
from app.services.websocket_service import emit_event

await emit_event(
    workspace_id=workspace_id,
    event_type="curation:status_changed",
    data={
        "session_id": str(session_id),
        "gallery_id": str(gallery_id),
        "status": new_status,
        "progress": progress_pct,
    },
)
```

### Pattern 2: Publishing Cross-Service Notifications (Existing)
```python
# Source: backend/src/app/services/notification_event_publisher.py
from app.services.notification_event_publisher import publish_notification_event

await publish_notification_event(
    event_type="churn.intervention.triggered",
    workspace_id=workspace_id,
    recipient_email=client_email,
    payload={"client_name": name, "action_type": action_type},
    priority="high",
)
```

### Pattern 3: Notifications-Service Publishing to WebSocket Channel (To Build)
```python
# In notifications-service, after processing a notification:
import json
from src.cache.redis_client import redis_client

channel = f"ws:workspace:{workspace_id}"
event = {
    "type": "notification:new",
    "workspace_id": str(workspace_id),
    "notification_id": str(notification_id),
    "category": category,
    "title": title,
    "body": body_preview,
}
await redis_client._client.publish(channel, json.dumps(event))
```

### Pattern 4: Frontend Handling New Event Types (To Extend)
```typescript
// Source: frontend/src/hooks/useSocket.ts (existing pattern)
// Extend WebSocketEvent interface:
export interface WebSocketEvent {
  type: 'asset:created' | 'asset:processed' | 'asset:deleted'
    | 'activity:created' | 'connected'
    | 'notification:new'           // NEW
    | 'curation:status_changed'    // NEW
    | 'churn:intervention_created' // NEW
    ;
  workspace_id: string;
  // ... existing fields plus new optional fields
  notification_id?: string;
  session_id?: string;
  title?: string;
  body?: string;
}
```

## Stub Locations (Exact Lines to Wire)

| File | Line | Current State | Action Needed |
|------|------|---------------|---------------|
| `backend/src/app/services/curation_session_service.py` | 530 | `# TODO: Send WebSocket notification` | Call `websocket_service.emit_event` with curation status |
| `backend/src/app/workers/churn_intervention_worker.py` | 519-535 | `# TODO: Integrate with notifications-service` + logger.info "Would send" | Call `publish_notification_event` or `emit_event` |
| `backend/src/app/workers/churn_intervention_worker.py` | 569-600 | `_create_in_app_notification` writes to DB only | Also publish to WebSocket channel for real-time display |
| `frontend/src/hooks/useSocket.ts` | 12-18 | Limited event types in interface | Extend with notification/curation/churn event types |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling for notifications | WebSocket + Redis pub/sub | Already implemented | Real-time delivery, no polling overhead |
| Separate WS libraries (Socket.IO) | Native FastAPI WebSocket | Project inception | No extra dependency, simpler deployment |

## Open Questions

1. **Notifications-service Redis subscriber lifecycle**
   - What we know: notifications-service has Redis client with circuit breaker; backend WebSocket subscribes per-connection
   - What's unclear: Should notifications-service subscribe to `notification:events` channel on startup to process cross-service events, or rely on existing REST API calls?
   - Recommendation: Add a background task in notifications-service lifespan that subscribes to `notification:events` and processes incoming events. This completes the event-driven architecture.

2. **In-app notification persistence**
   - What we know: `client_notifications` table exists (used by churn worker). Notifications-service has `notification_repository`.
   - What's unclear: Whether in-app notifications should be stored in notifications-service DB or backend DB
   - Recommendation: Use notifications-service repository (it owns the notification domain). Backend publishes events; notifications-service persists and broadcasts.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (backend), vitest (frontend) |
| Config file | backend/pytest.ini, frontend/vitest.config.ts |
| Quick run command | `docker exec rawdrive-backend pytest tests/ -x -q --timeout=30` |
| Full suite command | `docker exec rawdrive-backend pytest tests/ --timeout=60` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTF-01 | WebSocket connects with JWT, receives events | integration | `docker exec rawdrive-backend pytest tests/test_websocket.py -x` | Needs creation (Wave 0) |
| NOTF-02 | Notifications-service publishes to Redis, client receives | integration | `docker exec rawdrive-backend pytest tests/test_notification_pubsub.py -x` | Needs creation (Wave 0) |
| NOTF-03 | Churn worker publishes notification events | unit | `docker exec rawdrive-backend pytest tests/test_churn_notification_wiring.py -x` | Needs creation (Wave 0) |
| NOTF-04 | Curation session emits status WebSocket events | unit | `docker exec rawdrive-backend pytest tests/test_curation_notification_wiring.py -x` | Needs creation (Wave 0) |

### Sampling Rate
- **Per task commit:** `docker exec rawdrive-backend pytest tests/test_websocket.py tests/test_notification_pubsub.py -x -q`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_websocket.py` -- covers NOTF-01 WebSocket connection and event forwarding
- [ ] `tests/test_notification_pubsub.py` -- covers NOTF-02 Redis pub/sub to WebSocket pipeline
- [ ] `tests/test_churn_notification_wiring.py` -- covers NOTF-03 churn intervention notification publish
- [ ] `tests/test_curation_notification_wiring.py` -- covers NOTF-04 curation session status events

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of existing files (all paths verified via Read tool)
- `backend/src/app/api/v1/websocket.py` -- complete WebSocket endpoint implementation
- `backend/src/app/services/websocket_service.py` -- emit_event helper with Redis pub/sub
- `backend/src/app/services/notification_event_publisher.py` -- cross-service notification publisher
- `backend/src/app/workers/churn_intervention_worker.py` -- churn stubs at lines 519-535
- `backend/src/app/services/curation_session_service.py` -- curation stub at line 530
- `frontend/src/hooks/useSocket.ts` -- frontend WebSocket hook
- `services/notifications-service/src/main.py` -- notifications-service app

### Secondary (MEDIUM confidence)
- Inferred notification-service Redis pub/sub pattern from existing collaboration_service.py usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new dependencies
- Architecture: HIGH - patterns established by websocket_service.py and notification_event_publisher.py
- Pitfalls: HIGH - identified from direct code inspection of stub points and dual Redis clients

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- no external dependencies changing)
