# Phase 8: Notifications - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement real-time notifications: WebSocket connection on backend, Redis pub/sub for event distribution, and wire churn intervention + curation session status notifications that are currently stubbed.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion. Specific targets:

- NOTF-01: WebSocket connection on backend for real-time notifications
- NOTF-02: Notifications-service publishes events via Redis pub/sub to connected clients
- NOTF-03: Churn intervention notifications wired (currently stubbed)
- NOTF-04: Curation session status notifications wired (currently stubbed)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/notifications-service/` — notification management service (port 8010)
- `backend/src/app/events/` — event system module
- `backend/src/app/services/smart_curation_service.py` — curation service (Phase 1 hardened, Phase 6 enhanced)
- Redis available for pub/sub

### Established Patterns
- 3-layer architecture
- Redis for caching and pub/sub
- Celery workers for async processing
- JWT auth for WebSocket connections

### Integration Points
- WebSocket endpoint on backend for client connections
- Notifications-service publishes to Redis channels
- Curation workers emit session status events
- Growth/engagement service may emit churn signals

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond REQUIREMENTS.md (NOTF-01 through NOTF-04).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
