# Phase 1: Security Hardening - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Patch all known security vulnerabilities (timing-safe API key comparison, workspace isolation on comments, atomic curation state transitions) and verify each fix with regression tests that fail without it.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — pure infrastructure/security phase. Specific targets:

- SEC-01: A2A API key comparison in `backend/src/app/api/v1/agent_api_keys.py` must use `hmac.compare_digest`
- SEC-02: Comment endpoints in `backend/src/app/api/v1/comments.py` must enforce `workspace_id` filtering on all queries
- SEC-03: Curation session state machine in `backend/src/app/services/curation_session_service.py` and `backend/src/app/services/smart_curation_service.py` must use PostgreSQL advisory locks and validate state transitions
- SEC-04: Each fix requires a regression test that fails when the fix is reverted

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/app/api/v1/agent_api_keys.py` — existing A2A key management endpoint
- `backend/src/app/api/v1/comments.py` — existing comment CRUD endpoints
- `backend/src/app/services/curation_session_service.py` — curation session lifecycle service
- `backend/src/app/services/smart_curation_service.py` — AI-driven curation logic
- `backend/src/app/workers/curation_worker.py` — async curation processing
- `backend/src/app/middleware/rate_limit.py` — existing rate limit middleware (related but separate phase)

### Established Patterns
- 3-layer architecture: API (routes) -> Service (logic) -> Repository (DB)
- All queries must filter by `workspace_id` extracted from JWT
- Backend runs in Docker container `rawdrive-backend`
- Tests run via `docker exec rawdrive-backend pytest`

### Integration Points
- Agent API key verification is called on A2A requests
- Comment endpoints are part of the album collaboration feature set
- Curation sessions are triggered by workers and managed via service layer

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure/security phase with clear technical targets from REQUIREMENTS.md (SEC-01 through SEC-04).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
