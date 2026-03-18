# RawDrive — Stabilization & Completion

## What This Is

RawDrive is an enterprise SaaS photography platform for professional photographers, built with a microservices architecture (13+ services), React frontend, FastAPI backend, and PostgreSQL with pgvector. The platform handles gallery management, digital wedding invitations, client CRM, AI-powered photo curation, billing (Stripe/Razorpay), and real-time file sync. This milestone focuses on stabilizing broken features, completing stubbed implementations, hardening security, and shipping a production-ready v1.

## Core Value

Photographers can reliably upload, organize, curate, and deliver photos to clients — every core workflow must function end-to-end without stubbed or broken steps.

## Requirements

### Validated

<!-- Existing capabilities confirmed working in codebase -->

- ✓ User authentication with JWT (login, signup, session management) — existing
- ✓ Workspace creation and multi-tenant isolation — existing
- ✓ Photo upload via TUS resumable uploads — existing
- ✓ Album and gallery CRUD operations — existing
- ✓ Gallery Design Studio with cover templates — existing
- ✓ Public gallery sharing via magic links — existing
- ✓ Digital wedding invitation CRUD with guest management — existing
- ✓ RSVP flow with sub-events (engagement, mehndi, wedding) — existing
- ✓ Client CRM with contact management, favorites, reviews — existing
- ✓ Billing service with Stripe and Razorpay integration — existing
- ✓ Subscription management with plan tiers — existing
- ✓ Admin dashboard with audit logs — existing
- ✓ i18n with 13 languages including Indian regional languages — existing
- ✓ Traefik API gateway with service routing — existing
- ✓ Prometheus metrics and Grafana dashboards — existing
- ✓ Structured logging with Loki — existing
- ✓ React frontend with 60+ pages, TanStack Query, design system — existing
- ✓ Shared packages (types, constants, validation, utils, API) — existing
- ✓ Docker Compose orchestration for all services — existing
- ✓ PWA support with offline indicator — existing
- ✓ Face detection worker infrastructure — existing
- ✓ A2A service registry for inter-service discovery — existing

### Active

<!-- Current scope: fix broken, complete stubbed, harden security -->

- [ ] Email infrastructure — deploy Postal (self-hosted) for transactional email sending
- [ ] Email verification — implement actual email sending for signup verification
- [ ] Password reset — implement full password reset flow with email link
- [ ] Bulk invitation emails — implement email delivery for wedding invitations
- [ ] Account recovery emails — implement recovery email flow
- [ ] AI/ML: CLIP model loading — replace placeholder with actual ViT-B/32 model
- [ ] AI/ML: Batch embedding computation — implement GPU-accelerated inference
- [ ] AI/ML: Similarity clustering — implement cosine similarity threshold-based clustering
- [ ] AI/ML: Duplicate detection — fix image byte fetching for hash-based detection
- [ ] Gallery export: PDF generation — implement actual PDF export
- [ ] Gallery export: Slideshow generation — implement slideshow playback
- [ ] Notification system — implement WebSocket real-time notifications via notifications-service
- [ ] Notification system — wire churn intervention and curation notifications
- [ ] Rate limiting — implement Redis sliding window rate limiter for A2A API keys
- [ ] Security: Permission validation in comments — add workspace_id checks
- [ ] Security: A2A API key comparison — replace string comparison with timing-safe compare
- [ ] Security: Curation session state machine — add row-level locking and state transition validation
- [ ] Performance: Image processing — move to AI Processing service (non-blocking)
- [ ] Performance: Duplicate detection — replace full table scan with indexed queries
- [ ] Performance: Similarity groups — migrate from in-memory to Redis/database storage
- [ ] Shared packages: Build @rawdrive/api-types — generate and compile dist
- [ ] Shared packages: Build @rawdrive/database-utils — compile dist
- [ ] Test coverage: Backend integration tests for critical paths
- [ ] Test coverage: Frontend component tests for core workflows
- [ ] Test coverage: AI worker concurrency and permission enforcement tests

### Out of Scope

- OAuth/social login (Google, GitHub) — defer to v2, email/password sufficient for v1
- Google Search Console integration — not critical for photographer workflows
- Cloud sync (Google Drive, Dropbox) — defer to v2
- Mobile native app — web-first, PWA covers mobile for now
- Real-time collaborative editing — not needed for photography use case
- Video upload/processing — storage/bandwidth costs, defer to v2+

## Context

- **Brownfield project:** Substantial codebase exists with 90+ backend endpoint modules, 14 microservices, 60+ frontend pages. Most scaffolding is complete but many features have stubbed implementations (TODO placeholders).
- **Email gap is critical:** 6+ files have TODO email placeholders. Users cannot verify accounts, reset passwords, or receive invitation emails. This blocks core user journeys.
- **AI features scaffolded but non-functional:** CLIP model returns placeholder, embeddings are empty, clustering not implemented. The ai-processing-service exists but isn't wired to the main backend workers.
- **Security concerns are production blockers:** Missing permission checks in comments, timing-unsafe API key comparison, race conditions in curation state machine.
- **Test coverage is minimal:** ~20 backend test files, minimal frontend tests. Critical paths (auth flows, multi-tenant isolation, AI workers) lack test coverage.
- **Infrastructure mostly solid:** Docker Compose, Traefik, monitoring stack (Prometheus/Grafana/Loki) all configured and working. Adding Postal is the main infrastructure gap.

## Constraints

- **Tech stack**: Must use existing stack — FastAPI, React 18, PostgreSQL 16 + pgvector, Redis, Docker
- **Architecture**: Must follow 3-layer pattern (API → Service → Repository) with workspace_id isolation
- **Email**: Self-hosted Postal (postal.org) for transactional email — no external SaaS dependency
- **AI Models**: Gemini as primary AI provider (already configured), CLIP ViT-B/32 for embeddings
- **Budget**: Minimize external service costs — self-hosted infrastructure preferred
- **Compatibility**: All services share PostgreSQL and validate JWT with shared JWT_SECRET

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Postal for email infrastructure | Purpose-built for transactional email, self-hosted, has web UI + delivery tracking + webhook callbacks. Better fit than full mail servers (Stalwart/docker-mailserver) which are overkill for sending-only | — Pending |
| Fix broken features before new features | Stubbed implementations block core user journeys (email verification, password reset, AI curation). Must stabilize before adding new capabilities | — Pending |
| Move image processing to AI Processing service | Current architecture blocks main request loop. ai-processing-service already exists but isn't wired to backend workers | — Pending |
| Redis for similarity groups (replace in-memory) | In-memory storage won't scale past single instance. Redis already in stack | — Pending |
| Timing-safe comparison for A2A API keys | Current string comparison is vulnerable to timing attacks. Use hmac.compare_digest | — Pending |

---
*Last updated: 2026-03-18 after initialization*
