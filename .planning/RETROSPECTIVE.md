# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-19
**Phases:** 9 | **Plans:** 23 | **Commits:** 389

### What Was Built
- Security hardening: timing-safe A2A keys, comment workspace isolation, curation state machine locking with advisory locks
- Email infrastructure: self-hosted Postal deployment, EmailService abstraction, verification/password reset/invitation flows, delivery tracking
- AI/ML pipeline: CLIP ViT-B/32 embeddings, HNSW pgvector index, DBSCAN clustering, duplicate detection, Redis similarity caching
- Rate limiting: Redis sliding window for A2A API keys
- Gallery completion: slideshow branding integration, delivery emails on publish
- Notifications: WebSocket real-time infrastructure, churn intervention and curation event wiring
- Shared packages: api-types (tsup) and database-utils (tsc) builds fixed
- Test coverage: backend integration tests (auth, multi-tenant, email, AI concurrency, security), frontend component tests (upload, auth pages)

### What Worked
- Dependency-ordered phasing (security first, then infrastructure, then features) prevented rework
- Parallelizable early phases (1-4) allowed efficient multi-track execution
- TDD approach caught regression issues early, especially in security hardening
- GSD workflow with research → plan → execute cycle provided consistent delivery
- Lazy import pattern for heavy ML dependencies eliminated crash-loops

### What Was Inefficient
- ROADMAP.md had duplicate phase entries (zero-padded and non-zero-padded) causing inflated stats
- Some summary files lacked one-liner fields, making automated extraction harder
- Phase completion dates in ROADMAP.md were not always updated when plans completed
- Several phases had plans marked as `[ ]` in ROADMAP.md despite having SUMMARY.md files

### Patterns Established
- 3-layer architecture (API → Service → Repository) with mandatory workspace_id filtering
- Lazy imports for heavy ML dependencies in AI services
- Security regression tests accompany every security fix
- Self-hosted infrastructure (Postal, Milvus fallback to pgvector) over external SaaS
- Advisory locks for state machine transitions in concurrent systems

### Key Lessons
1. Stabilize broken features before adding new ones — stubbed implementations create cascading blockers
2. Self-hosted email (Postal) requires DNS lead time — start infrastructure phases early
3. pgvector with HNSW is a pragmatic alternative to dedicated vector DBs for moderate scale
4. AI service startup reliability depends on lazy imports — eager loading of heavy ML libs causes crash-loops
5. Workspace_id isolation must be enforced at the repository layer, not just API middleware

### Cost Observations
- Model mix: Quality profile (Opus for all agents)
- Sessions: ~15 across milestone
- Notable: Research agents saved significant planning time by front-loading domain investigation

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 389 | 9 | Established GSD workflow with TDD, research-first planning |

### Cumulative Quality

| Milestone | Plans | Requirements | All Complete |
|-----------|-------|-------------|--------------|
| v1.0 | 23 | 47 | ✅ Yes |

### Top Lessons (Verified Across Milestones)

1. Fix broken before building new — validated across all 9 phases
2. Infrastructure phases (email, AI) need parallel early starts due to lead times
