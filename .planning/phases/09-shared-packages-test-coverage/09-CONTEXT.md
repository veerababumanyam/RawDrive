# Phase 9: Shared Packages & Test Coverage - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix shared package builds (api-types, database-utils) so they produce dist output. Write comprehensive integration and component tests for all critical paths built in Phases 1-8: auth flows, multi-tenant isolation, email sending, AI worker concurrency, security enforcement, gallery viewing, upload workflows, and auth pages.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — infrastructure + testing phase. Specific targets:

- PKG-01: @rawdrive/api-types package built with dist output
- PKG-02: @rawdrive/database-utils package built with dist output
- TEST-01: Backend integration tests for auth flows (login, signup, token refresh, logout)
- TEST-02: Backend integration tests for multi-tenant isolation (workspace_id enforcement)
- TEST-03: Backend integration tests for email sending (verification, reset, invitations)
- TEST-04: Backend tests for AI worker concurrency (CLIP embedding, clustering)
- TEST-05: Frontend component tests for gallery viewing and upload workflows
- TEST-06: Frontend component tests for auth pages (signin, signup, forgot password)
- TEST-07: Security enforcement tests (permission checks, workspace isolation, timing-safe comparison)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/` — pnpm workspace shared packages
- `backend/tests/` — existing test directory with Phase 1-8 tests
- `frontend/src/` — React components to test
- All features from Phases 1-8 are now complete and testable

### Established Patterns
- Backend: pytest inside Docker (`docker exec rawdrive-backend pytest`)
- Frontend: Vitest (`cd frontend && pnpm test`)
- pnpm workspaces for shared packages
- TDD was followed in Phases 3-8

### Integration Points
- Shared packages consumed by frontend via pnpm workspace imports
- Backend tests validate all 8 completed phases
- Frontend tests validate React components and pages

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond REQUIREMENTS.md (PKG-01, PKG-02, TEST-01 through TEST-07).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
