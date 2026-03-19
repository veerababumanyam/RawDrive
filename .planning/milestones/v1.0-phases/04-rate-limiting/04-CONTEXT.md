# Phase 4: Rate Limiting - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement Redis sliding window rate limiting for A2A API keys, with per-key RPM enforcement, 429 responses with Retry-After headers, and a log-only/enforcing toggle for safe rollout.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — pure infrastructure phase. Specific targets:

- RATE-01: Redis sliding window rate limiter (~50 lines) for A2A API keys
- RATE-02: Rate limiter checks agent_api_keys.rate_limit_rpm per request
- RATE-03: Returns 429 with Retry-After header when limit exceeded
- RATE-04: Rate limiter deployed in log-only mode first, then enforced after soak period

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/app/middleware/a2a_auth.py` — A2A authentication middleware (Phase 1 hardened)
- `backend/src/app/middleware/rate_limit.py` — existing rate limit middleware (may have patterns to reuse)
- `backend/src/app/services/rate_limit_service.py` — existing rate limit service
- `backend/src/app/api/v1/agent_api_keys.py` — agent API key management with rate_limit_rpm field

### Established Patterns
- 3-layer architecture: API -> Service -> Repository
- Redis available at REDIS_URL for distributed state
- A2A auth already validates API keys in middleware layer
- Health check endpoints required on all services

### Integration Points
- Rate limiter hooks into A2A authentication flow in middleware
- agent_api_keys table has rate_limit_rpm column
- Redis connection already configured for the backend

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase with clear technical targets from REQUIREMENTS.md (RATE-01 through RATE-04).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
