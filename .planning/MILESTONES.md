# Milestones

## v1.1 Profile & Public Page Modernization (Shipped: 2026-03-20)

**Phases completed:** 5 phases, 17 plans, 5 tasks

**Key accomplishments:**

- (none recorded)

---

## v1.0 MVP (Shipped: 2026-03-19)

**Stats:** 9 phases, 23 plans, 389 commits, 92 days (2025-12-17 → 2026-03-19)
**Requirements:** 47/47 complete

**Key accomplishments:**

- Security hardening: timing-safe A2A keys, comment workspace isolation, curation state machine advisory locking
- Email infrastructure: self-hosted Postal deployment with EmailService abstraction, verification/password reset/invitation flows, delivery tracking
- AI/ML pipeline: CLIP ViT-B/32 embeddings, HNSW pgvector index, DBSCAN clustering, duplicate detection, Redis similarity caching
- Rate limiting: Redis sliding window enforcement for A2A API keys
- Gallery completion: slideshow branding integration, delivery emails on publish
- Notifications: WebSocket real-time infrastructure with churn intervention and curation event wiring
- Shared packages: api-types (tsup) and database-utils (tsc) builds fixed
- Test coverage: backend integration + frontend component + AI concurrency + security enforcement tests

**Archives:**

- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0-phases/`

---
