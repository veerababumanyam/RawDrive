# Roadmap: RawDrive Stabilization & Completion

## Overview

RawDrive has extensive scaffolding (13 microservices, 60+ pages, 90+ endpoints) but critical features are stubbed or broken. This roadmap stabilizes the platform by fixing security vulnerabilities first, deploying email infrastructure (longest lead time), un-breaking the AI processing service, then wiring the downstream features that depend on these foundations. The final phases complete gallery delivery, notifications, and test coverage to reach production readiness.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Security Hardening** - Fix timing-safe comparison, permission checks, and state machine locking (completed 2026-03-18)
- [ ] **Phase 2: Email Infrastructure** - Deploy Postal and build the EmailService abstraction
- [x] **Phase 3: AI Service Stabilization** - Fix crash-looping ai-processing-service container (completed 2026-03-18)
- [ ] **Phase 4: Rate Limiting** - Implement Redis sliding window rate limiter for A2A API keys
- [ ] **Phase 5: Email Features** - Wire verification, password reset, invitations, and delivery tracking
- [ ] **Phase 6: AI/ML Pipeline** - Wire CLIP model, embeddings, duplicate detection, and clustering
- [ ] **Phase 7: Gallery Completion** - Implement slideshow, delivery emails, and gallery branding
- [ ] **Phase 8: Notifications** - WebSocket real-time notifications and event wiring
- [ ] **Phase 9: Shared Packages & Test Coverage** - Build package dists and add integration/component tests

## Phase Details

### Phase 1: Security Hardening
**Goal**: All known security vulnerabilities are patched and verified with regression tests
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. A2A API key comparison uses hmac.compare_digest and a test proves string equality fails
  2. Comment endpoints return only data belonging to the requesting workspace
  3. Curation session state transitions are atomic with advisory locks preventing race conditions
  4. Each security fix has a regression test that fails when the fix is reverted
**Plans**: 2 plans

Plans:
- [ ] 01-01: Timing-safe A2A comparison and comment permission checks
- [ ] 01-02: Curation state machine locking and security regression tests

### Phase 2: Email Infrastructure
**Goal**: Postal is deployed and a unified EmailService can send emails with delivery tracking
**Depends on**: Nothing (parallelizable with Phase 1 -- DNS lead time)
**Requirements**: MAIL-01, MAIL-02, MAIL-03, MAIL-04
**Success Criteria** (what must be TRUE):
  1. Postal container starts via docker-compose and its web UI is accessible
  2. DNS records (SPF, DKIM, DMARC) are configured and a test email passes deliverability checks
  3. EmailService abstraction exists as single interface replacing all scattered TODO stubs
  4. Email sending via Postal HTTP API works with retry logic and delivery status webhooks
**Plans**: 2 plans

Plans:
- [ ] 02-01: Postal Docker deployment and DNS configuration
- [ ] 02-02: EmailService abstraction and Postal API client integration

### Phase 3: AI Service Stabilization
**Goal**: ai-processing-service starts reliably and passes health checks
**Depends on**: Nothing (parallelizable with Phases 1-2)
**Requirements**: AIS-01, AIS-02, AIS-03
**Success Criteria** (what must be TRUE):
  1. ai-processing-service container starts and /health/live returns 200
  2. Service starts without Milvus or gracefully falls back to pgvector
  3. Heavy ML imports (InsightFace, Real-ESRGAN) load lazily and don't crash startup
**Plans**: 1 plan

Plans:
- [x] 03-01: Fix crash-loop -- health endpoints, lazy imports, Milvus fallback, and requirements cleanup

### Phase 4: Rate Limiting
**Goal**: A2A API keys are rate-limited with Redis sliding window enforcement
**Depends on**: Nothing (parallelizable with Phases 1-3)
**Requirements**: RATE-01, RATE-02, RATE-03, RATE-04
**Success Criteria** (what must be TRUE):
  1. Redis sliding window rate limiter enforces per-key limits from agent_api_keys.rate_limit_rpm
  2. Requests exceeding the limit receive 429 with Retry-After header
  3. Rate limiter can be toggled between log-only and enforcing modes
**Plans**: TBD

Plans:
- [ ] 04-01: Redis sliding window rate limiter implementation and deployment

### Phase 5: Email Features
**Goal**: Users receive transactional emails for verification, password reset, invitations, and gallery delivery
**Depends on**: Phase 2 (Email Infrastructure)
**Requirements**: MAIL-05, MAIL-06, MAIL-07, MAIL-08, MAIL-09
**Success Criteria** (what must be TRUE):
  1. User receives a verification email after signup with a working token link
  2. User can reset their password via an emailed link with a time-limited token
  3. Bulk wedding invitation emails are sent to guest lists through invitations-service
  4. Email templates exist for verification, password reset, invitation, and gallery delivery
  5. Email delivery status is tracked in the database via Postal webhook callbacks
**Plans**: TBD

Plans:
- [ ] 05-01: Email verification and password reset flows
- [ ] 05-02: Invitation emails, gallery delivery emails, and templates
- [ ] 05-03: Delivery tracking via Postal webhooks

### Phase 6: AI/ML Pipeline
**Goal**: Photos are automatically embedded, deduplicated, and clustered for curation
**Depends on**: Phase 3 (AI Service Stabilization)
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, AI-07, AI-08, PERF-01, PERF-02, PERF-03
**Success Criteria** (what must be TRUE):
  1. CLIP ViT-B/32 model is pre-baked in the Docker image and computes embeddings on uploaded photos
  2. Embeddings are stored in pgvector with HNSW index and queried for similarity
  3. Duplicate photos are detected via both hash-based and embedding-based methods
  4. DBSCAN clustering groups similar photos for curation review
  5. Similarity groups persist in database/Redis instead of in-memory storage
**Plans**: TBD

Plans:
- [ ] 06-01: CLIP model integration and Celery task wiring
- [ ] 06-02: Embedding storage with pgvector HNSW index
- [ ] 06-03: Duplicate detection (hash-based and embedding-based)
- [ ] 06-04: DBSCAN clustering and similarity group persistence
- [ ] 06-05: Image processing offload to ai-processing-service

### Phase 7: Gallery Completion
**Goal**: Photographers can deliver galleries to clients with slideshow and branded experience
**Depends on**: Phase 5 (Email Features for delivery emails)
**Requirements**: GAL-01, GAL-02, GAL-03
**Success Criteria** (what must be TRUE):
  1. Client can view a slideshow of gallery photos via the public gallery link
  2. Photographer receives a delivery email notification when gallery is published (with magic link for client)
  3. Slideshow respects gallery branding settings (colors, logo, music preference)
**Plans**: TBD

Plans:
- [ ] 07-01: Slideshow generation and gallery delivery emails

### Phase 8: Notifications
**Goal**: Users receive real-time notifications for platform events
**Depends on**: Phase 5 (Email channel), Phase 6 (AI events for curation notifications)
**Requirements**: NOTF-01, NOTF-02, NOTF-03, NOTF-04
**Success Criteria** (what must be TRUE):
  1. WebSocket connection delivers real-time notifications to connected clients
  2. Notifications-service publishes events via Redis pub/sub
  3. Churn intervention and curation session status notifications fire when triggered
**Plans**: TBD

Plans:
- [ ] 08-01: WebSocket notification infrastructure
- [ ] 08-02: Churn intervention and curation notification wiring

### Phase 9: Shared Packages & Test Coverage
**Goal**: Shared packages build cleanly and critical paths have integration/component test coverage
**Depends on**: Phases 1-8 (tests validate completed features)
**Requirements**: PKG-01, PKG-02, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07
**Success Criteria** (what must be TRUE):
  1. @rawdrive/api-types and @rawdrive/database-utils build with dist output and are consumable
  2. Backend integration tests cover auth flows, multi-tenant isolation, and email sending
  3. Backend tests cover AI worker concurrency and security enforcement
  4. Frontend component tests cover gallery viewing, upload workflows, and auth pages
**Plans**: TBD

Plans:
- [ ] 09-01: Shared package builds (api-types, database-utils)
- [ ] 09-02: Backend integration tests (auth, tenant isolation, email, AI workers)
- [ ] 09-03: Frontend component tests (gallery, upload, auth pages)
- [ ] 09-04: Security enforcement tests

## Progress

**Execution Order:**
Phases 1-4 are parallelizable. Phases 5+ follow dependency chains: 2->5->7, 3->6->8, then 9 last.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Hardening | 2/2 | Complete   | 2026-03-18 |
| 2. Email Infrastructure | 0/2 | Not started | - |
| 3. AI Service Stabilization | 0/1 | Not started | - |
| 4. Rate Limiting | 0/1 | Not started | - |
| 5. Email Features | 0/3 | Not started | - |
| 6. AI/ML Pipeline | 0/5 | Not started | - |
| 7. Gallery Completion | 0/1 | Not started | - |
| 8. Notifications | 0/2 | Not started | - |
| 9. Shared Packages & Test Coverage | 0/4 | Not started | - |
