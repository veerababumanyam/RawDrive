# Requirements: RawDrive Stabilization & Completion

**Defined:** 2026-03-18
**Core Value:** Photographers can reliably upload, organize, curate, and deliver photos to clients — every core workflow must function end-to-end without stubbed or broken steps.

## v1 Requirements

### Security Hardening

- [ ] **SEC-01**: A2A API key comparison uses timing-safe hmac.compare_digest instead of string equality
- [ ] **SEC-02**: Comment endpoints enforce workspace_id filtering on all queries
- [ ] **SEC-03**: Curation session state machine uses advisory locks and validates state transitions before updates
- [ ] **SEC-04**: All security fixes verified with regression tests that fail without the fix

### Email Infrastructure

- [ ] **MAIL-01**: Postal deployed as Docker container with MariaDB and RabbitMQ in docker-compose
- [ ] **MAIL-02**: DNS records configured for sending domain (SPF, DKIM, DMARC)
- [ ] **MAIL-03**: EmailService abstraction created as single interface for all email sending (replacing 6+ scattered TODO stubs)
- [ ] **MAIL-04**: Postal HTTP API client integrated into EmailService with retry logic and delivery tracking
- [ ] **MAIL-05**: User receives email verification after signup with secure token link
- [ ] **MAIL-06**: User can reset password via email link with time-limited token
- [ ] **MAIL-07**: Bulk wedding invitation emails sent to guest lists via invitations-service
- [ ] **MAIL-08**: Email templates created for verification, password reset, invitation, and gallery delivery
- [ ] **MAIL-09**: Email delivery status tracked in database with webhook callbacks from Postal

### AI Processing Service

- [ ] **AIS-01**: ai-processing-service container starts and passes health checks (currently crash-looping)
- [ ] **AIS-02**: Milvus dependency resolved — either fix Milvus health check or make it optional with pgvector fallback
- [ ] **AIS-03**: Heavy ML imports (InsightFace, Real-ESRGAN) made lazy-loading to prevent startup crashes

### AI/ML Features

- [ ] **AI-01**: CLIP ViT-B/32 model pre-baked into ai-processing-service Docker image (no runtime download)
- [ ] **AI-02**: CLIPEmbedder wired to backend similarity_worker via Celery task dispatch
- [ ] **AI-03**: Batch embedding computation processes photos asynchronously (non-blocking)
- [ ] **AI-04**: Embeddings stored in pgvector column with HNSW index (m=16, ef_construction=64)
- [ ] **AI-05**: Hash-based duplicate detection fixed — image byte fetching from R2 storage working
- [ ] **AI-06**: Embedding-based duplicate detection using cosine similarity threshold
- [ ] **AI-07**: DBSCAN clustering groups similar photos for culling/curation review
- [ ] **AI-08**: Similarity groups stored in database/Redis (not in-memory)

### Gallery Features

- [ ] **GAL-01**: Slideshow generation implemented for client-viewable gallery playback
- [ ] **GAL-02**: Gallery delivery emails sent to clients when gallery is ready (includes magic link)
- [ ] **GAL-03**: Slideshow respects gallery branding settings (colors, logo, music preference)

### Notifications

- [ ] **NOTF-01**: WebSocket connection established on backend for real-time notifications
- [ ] **NOTF-02**: Notifications-service publishes events via Redis pub/sub to connected clients
- [ ] **NOTF-03**: Churn intervention notifications wired (currently stubbed)
- [ ] **NOTF-04**: Curation session status notifications wired (currently stubbed)

### Rate Limiting

- [ ] **RATE-01**: Redis sliding window rate limiter implemented for A2A API keys (~50 lines)
- [ ] **RATE-02**: Rate limiter checks agent_api_keys.rate_limit_rpm per request
- [ ] **RATE-03**: Returns 429 with Retry-After header when limit exceeded
- [ ] **RATE-04**: Rate limiter deployed in log-only mode first, then enforced after soak period

### Performance

- [ ] **PERF-01**: Image processing moved from main backend request loop to ai-processing-service
- [ ] **PERF-02**: Duplicate detection query uses indexed lookups instead of full table scan
- [ ] **PERF-03**: Similarity groups migrated from in-memory storage to Redis

### Shared Packages

- [ ] **PKG-01**: @rawdrive/api-types package built with dist output
- [ ] **PKG-02**: @rawdrive/database-utils package built with dist output

### Test Coverage

- [ ] **TEST-01**: Backend integration tests for auth flows (login, signup, token refresh, logout)
- [ ] **TEST-02**: Backend integration tests for multi-tenant isolation (workspace_id enforcement)
- [ ] **TEST-03**: Backend integration tests for email sending (verification, reset, invitations)
- [ ] **TEST-04**: Backend tests for AI worker concurrency (CLIP embedding, clustering)
- [ ] **TEST-05**: Frontend component tests for gallery viewing and upload workflows
- [ ] **TEST-06**: Frontend component tests for auth pages (signin, signup, forgot password)
- [ ] **TEST-07**: Security enforcement tests — permission checks, workspace isolation, timing-safe comparison

## v2 Requirements

### Gallery Exports

- **GAL-V2-01**: PDF album generation from gallery photos (WeasyPrint)
- **GAL-V2-02**: Gallery download with watermark controls

### Advanced Notifications

- **NOTF-V2-01**: SMS notification channel (Twilio integration)
- **NOTF-V2-02**: Push notifications for PWA
- **NOTF-V2-03**: User-configurable notification preferences

### OAuth

- **AUTH-V2-01**: Google OAuth login
- **AUTH-V2-02**: Cloud sync (Google Drive, Dropbox)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Marketing email automation | Enormous scope (Pic-Time spent years). Focus on transactional only |
| Video upload/processing | Storage/bandwidth costs, not core to photography workflow |
| Mobile native app | Web-first, PWA covers mobile adequately |
| Google Search Console integration | Not critical for photographer workflows |
| Real-time collaborative editing | Not needed for photography use case |
| Email receiving/inbox | Postal used for sending only, not full mailbox |
| PDF gallery export | Deferred to v2 — slideshow covers presentation need |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AIS-01 | TBD | Pending |
| AIS-02 | TBD | Pending |
| AIS-03 | TBD | Pending |
| SEC-01 | TBD | Pending |
| SEC-02 | TBD | Pending |
| SEC-03 | TBD | Pending |
| SEC-04 | TBD | Pending |
| MAIL-01 | TBD | Pending |
| MAIL-02 | TBD | Pending |
| MAIL-03 | TBD | Pending |
| MAIL-04 | TBD | Pending |
| MAIL-05 | TBD | Pending |
| MAIL-06 | TBD | Pending |
| MAIL-07 | TBD | Pending |
| MAIL-08 | TBD | Pending |
| MAIL-09 | TBD | Pending |
| AI-01 | TBD | Pending |
| AI-02 | TBD | Pending |
| AI-03 | TBD | Pending |
| AI-04 | TBD | Pending |
| AI-05 | TBD | Pending |
| AI-06 | TBD | Pending |
| AI-07 | TBD | Pending |
| AI-08 | TBD | Pending |
| GAL-01 | TBD | Pending |
| GAL-02 | TBD | Pending |
| GAL-03 | TBD | Pending |
| NOTF-01 | TBD | Pending |
| NOTF-02 | TBD | Pending |
| NOTF-03 | TBD | Pending |
| NOTF-04 | TBD | Pending |
| RATE-01 | TBD | Pending |
| RATE-02 | TBD | Pending |
| RATE-03 | TBD | Pending |
| RATE-04 | TBD | Pending |
| PERF-01 | TBD | Pending |
| PERF-02 | TBD | Pending |
| PERF-03 | TBD | Pending |
| PKG-01 | TBD | Pending |
| PKG-02 | TBD | Pending |
| TEST-01 | TBD | Pending |
| TEST-02 | TBD | Pending |
| TEST-03 | TBD | Pending |
| TEST-04 | TBD | Pending |
| TEST-05 | TBD | Pending |
| TEST-06 | TBD | Pending |
| TEST-07 | TBD | Pending |

**Coverage:**
- v1 requirements: 45 total
- Mapped to phases: 0
- Unmapped: 45 ⚠️

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after initial definition*
