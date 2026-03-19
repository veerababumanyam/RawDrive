# RawDrive — Enterprise SaaS Photography Platform

## What This Is

RawDrive is an enterprise SaaS photography platform for professional photographers, built with a microservices architecture (15 services + workers), React frontend, FastAPI backend, and PostgreSQL with pgvector. The platform handles gallery management with slideshow delivery, digital wedding invitations, client CRM, AI-powered photo curation (CLIP embeddings, DBSCAN clustering, duplicate detection), billing (Stripe/Razorpay), real-time WebSocket notifications, and self-hosted email infrastructure (Postal). v1.0 stabilized all core workflows from upload through delivery.

## Core Value

Photographers can reliably upload, organize, curate, and deliver photos to clients — every core workflow functions end-to-end with AI assistance and real-time feedback.

## Requirements

### Validated

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
- ✓ Security: Timing-safe A2A API key comparison — v1.0
- ✓ Security: Comment workspace isolation — v1.0
- ✓ Security: Curation state machine advisory locking — v1.0
- ✓ Security: Permission regression tests — v1.0
- ✓ Email: Postal self-hosted deployment — v1.0
- ✓ Email: EmailService abstraction with delivery tracking — v1.0
- ✓ Email: Verification and password reset flows — v1.0
- ✓ Email: Invitation email migration and gallery templates — v1.0
- ✓ Email: Delivery log database persistence — v1.0
- ✓ AI: Service stabilization with lazy imports — v1.0
- ✓ AI: CLIP ViT-B/32 embedding service — v1.0
- ✓ AI: HNSW pgvector index and embedding repository — v1.0
- ✓ AI: Celery embedding worker integration — v1.0
- ✓ AI: DBSCAN photo clustering — v1.0
- ✓ AI: Redis similarity group persistence — v1.0
- ✓ Rate limiting: Redis sliding window for A2A keys — v1.0
- ✓ Gallery: Slideshow branding integration — v1.0
- ✓ Gallery: Delivery email on publish — v1.0
- ✓ Notifications: WebSocket real-time infrastructure — v1.0
- ✓ Notifications: Churn intervention and curation wiring — v1.0
- ✓ Shared packages: api-types and database-utils build — v1.0
- ✓ Test coverage: Backend integration tests (auth, multi-tenant, email) — v1.0
- ✓ Test coverage: Frontend component tests (upload, auth pages) — v1.0
- ✓ Test coverage: AI concurrency and security enforcement tests — v1.0

### Active

## Current Milestone: v1.1 Profile & Public Page Modernization

**Goal:** Fix broken functionality and redesign both personal photographer profile (`/u/:slug`) and company/branding profile (`/p/:slug`) pages — editors, live previews, and public views — to be modern, responsive, and premium (Linktree/Bento-level polish).

**Target features:**
- Fix avatar loading, broken UI/UX, and non-functional features across both profile systems
- Modernize public pages (`/u/:slug` personal, `/p/:slug` company) with premium design
- Redesign profile editors (`/workspace/profile`, `/workspace/branding`) with working live preview
- Deep research into Linktree, Bento, and similar link-in-bio platforms for design inspiration
- Responsive, elegant, attractive design across all devices
- Consolidate and fix theme engine, social links, custom links, vCard/QR exports

### Out of Scope

- OAuth/social login (Google, GitHub) — defer to v2, email/password sufficient
- Google Search Console integration — not critical for photographer workflows
- Cloud sync (Google Drive, Dropbox) — defer to v2
- Mobile native app — web-first, PWA covers mobile
- Real-time collaborative editing — not needed for photography use case
- Video upload/processing — storage/bandwidth costs, defer to v2+

## Context

- **v1.0 shipped:** 389 commits over 92 days (2025-12-17 → 2026-03-19)
- **Architecture:** 15 microservices + workers on shared PostgreSQL, all validating JWT with shared JWT_SECRET
- **AI pipeline operational:** CLIP embeddings, DBSCAN clustering, duplicate detection, Redis similarity caching
- **Email infrastructure:** Self-hosted Postal with delivery tracking webhooks
- **Test coverage:** Backend integration tests (auth, multi-tenant, email, AI concurrency, security), frontend component tests (upload, auth pages)
- **Tech stack:** FastAPI, React 18, PostgreSQL 16 + pgvector, Redis, Docker, Traefik, Prometheus/Grafana/Loki

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Postal for email infrastructure | Purpose-built for transactional email, self-hosted, has web UI + delivery tracking + webhook callbacks | ✓ Good |
| Fix broken features before new features | Stubbed implementations blocked core user journeys | ✓ Good |
| Move image processing to AI Processing service | Prevented blocking main request loop | ✓ Good |
| Redis for similarity groups (replace in-memory) | In-memory won't scale past single instance | ✓ Good |
| Timing-safe comparison for A2A API keys | hmac.compare_digest prevents timing attacks | ✓ Good |
| CLIP ViT-B/32 pre-baked in Docker image | Eliminates download latency on cold start | ✓ Good |
| pgvector HNSW over Milvus for embeddings | Fewer moving parts, graceful fallback from Milvus | ✓ Good |
| DBSCAN for photo clustering | Doesn't require pre-specifying cluster count | ✓ Good |
| Lazy imports for heavy ML dependencies | Prevents startup crash-loops in ai-processing-service | ✓ Good |

## Constraints

- **Tech stack**: FastAPI, React 18, PostgreSQL 16 + pgvector, Redis, Docker
- **Architecture**: 3-layer pattern (API → Service → Repository) with workspace_id isolation
- **Email**: Self-hosted Postal for transactional email
- **AI Models**: Gemini as primary AI provider, CLIP ViT-B/32 for embeddings
- **Budget**: Minimize external service costs — self-hosted infrastructure preferred
- **Compatibility**: All services share PostgreSQL and validate JWT with shared JWT_SECRET

---
*Last updated: 2026-03-19 after v1.1 milestone started*
