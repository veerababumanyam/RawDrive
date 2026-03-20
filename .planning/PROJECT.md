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

- ✓ Avatar R2 storage pipeline with lazy migration fallback — v1.1
- ✓ AvatarDisplay component with initials fallback — v1.1
- ✓ UnifiedThemeEngine with CSS custom properties (legacy themes deleted) — v1.1
- ✓ Shared PublicProfileRenderer with section registry — v1.1
- ✓ Responsive Bento grid (1→4 column reflow) with glassmorphism — v1.1
- ✓ 4 animated theme backgrounds (gradient shift, particles, wave, aurora) — v1.1
- ✓ Dark mode via prefers-color-scheme + theme variants — v1.1
- ✓ SEO HTML shell with OG images, JSON-LD, meta tags — v1.1
- ✓ Profile editor with live preview via PublicProfileRenderer — v1.1
- ✓ Drag-and-drop section reordering with @dnd-kit — v1.1
- ✓ Gradient/solid color picker for theme customization — v1.1
- ✓ Device frame preview (mobile/tablet/desktop) — v1.1
- ✓ Auto-save with 2s debounce — v1.1
- ✓ Gallery preview block (2x2 cover grid) — v1.1
- ✓ Booking CTA button with calendar icon — v1.1
- ✓ Testimonials block with star ratings — v1.1
- ✓ Social links with Threads/Bluesky + platform hover colors — v1.1
- ✓ LazyMotion code-splitting + LQIP blur-up + lazy embeds — v1.1

### Active

(None — next milestone requirements TBD via `/gsd:new-milestone`)

## Next Milestone: v1.2 Public Gallery & Gallery Player Modernization

**Goal:** Research competitor photography platforms and completely modernize the public gallery viewing experience and gallery player — making it modern, trendy, attractive, feature-rich, and on par with or exceeding Pixieset, ShootProof, Pic-Time, SmugMug, Zenfolio, Pass, and Narrative.

**Target features:**
- Research and benchmark against top photography gallery platforms (Pixieset, ShootProof, Pic-Time, SmugMug, Zenfolio, Pass, Narrative)
- Modern gallery layouts (masonry, grid, justified, slideshow, filmstrip, mosaic)
- Fullscreen gallery player with touch gestures, keyboard navigation, and swipe support
- Client favorites/selections workflow within public galleries
- Polished download flows (single, batch, full gallery) with progress indicators
- Social sharing (Open Graph previews, direct share links, embed codes)
- Responsive mobile-first design with fluid animations and transitions
- Modern lightbox with zoom, pan, EXIF display, and filmstrip navigation
- LQIP/blur-up progressive image loading for perceived performance
- Password protection UX with branded entry pages
- Gallery branding customization (colors, logos, fonts, watermark positioning)
- Dark/light mode gallery themes with customizable accent colors
- Client comments and proofing interactions within galleries
- Gallery expiration and download policies with clear client communication

## Future Milestone: v1.3 Monetization, Onboarding & Growth

**Goal:** Transform RawDrive from a feature-complete tool into a growth-ready business by adding pricing transparency, guided onboarding, business analytics, third-party integrations, and feature discovery — addressing the monetization (5/10) and market readiness (6/10) gaps identified in the BA review.

**Target features:**
- Public pricing page with tier comparison matrix and feature limits
- Contextual upgrade prompts on premium features (themes, AI credits, storage)
- Guided onboarding wizard for new user activation (upload, gallery, profile)
- Adaptive "next steps" dashboard cards based on feature adoption
- Conversion funnel analytics (gallery view -> download -> inquiry -> booking)
- Client lifecycle tracking (lead, active, completed, churned)
- Revenue metrics dashboard (MRR, plan distribution, upgrade trends)
- Email marketing integration (Mailchimp/ConvertKit client sync)
- Calendar integration for booking availability on public profiles
- Cloud storage import (Google Drive/Dropbox -> galleries)
- Zapier/webhook triggers for third-party automation
- In-app help center with searchable knowledge base
- Interactive feature tooltips and video walkthroughs in empty states

### Out of Scope

- OAuth/social login (Google, GitHub) — defer to v2, email/password sufficient
- Google Search Console integration — not critical for photographer workflows
- Mobile native app — web-first, PWA covers mobile
- Real-time collaborative editing — not needed for photography use case
- Video upload/processing — storage/bandwidth costs, defer to v2+
- Commerce/print sales — Stan Store territory, not core photography
- White-label B2B — requires critical mass first
- Community/marketplace — platform play, defer to v2+

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
*Last updated: 2026-03-20 after v1.1 milestone complete*
