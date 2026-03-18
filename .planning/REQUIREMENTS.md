# Requirements: RawDrive Stabilization & Completion

**Defined:** 2026-03-18
**Core Value:** Photographers can reliably upload, organize, curate, and deliver photos to clients — every core workflow must function end-to-end without stubbed or broken steps.

## v1 Requirements

### Security Hardening

- [x] **SEC-01**: A2A API key comparison uses timing-safe hmac.compare_digest instead of string equality
- [x] **SEC-02**: Comment endpoints enforce workspace_id filtering on all queries
- [x] **SEC-03**: Curation session state machine uses advisory locks and validates state transitions before updates
- [x] **SEC-04**: All security fixes verified with regression tests that fail without the fix

### Email Infrastructure

- [x] **MAIL-01**: Postal deployed as Docker container with MariaDB and RabbitMQ in docker-compose
- [x] **MAIL-02**: DNS records configured for sending domain (SPF, DKIM, DMARC)
- [x] **MAIL-03**: EmailService abstraction created as single interface for all email sending (replacing 6+ scattered TODO stubs)
- [x] **MAIL-04**: Postal HTTP API client integrated into EmailService with retry logic and delivery tracking
- [x] **MAIL-05**: User receives email verification after signup with secure token link
- [x] **MAIL-06**: User can reset password via email link with time-limited token
- [x] **MAIL-07**: Bulk wedding invitation emails sent to guest lists via invitations-service
- [x] **MAIL-08**: Email templates created for verification, password reset, invitation, and gallery delivery
- [x] **MAIL-09**: Email delivery status tracked in database with webhook callbacks from Postal

### AI Processing Service

- [x] **AIS-01**: ai-processing-service container starts and passes health checks (currently crash-looping)
- [x] **AIS-02**: Milvus dependency resolved — either fix Milvus health check or make it optional with pgvector fallback
- [x] **AIS-03**: Heavy ML imports (InsightFace, Real-ESRGAN) made lazy-loading to prevent startup crashes

### AI/ML Features

- [x] **AI-01**: CLIP ViT-B/32 model pre-baked into ai-processing-service Docker image (no runtime download)
- [x] **AI-02**: CLIPEmbedder wired to backend similarity_worker via Celery task dispatch
- [x] **AI-03**: Batch embedding computation processes photos asynchronously (non-blocking)
- [x] **AI-04**: Embeddings stored in pgvector column with HNSW index (m=16, ef_construction=64)
- [x] **AI-05**: Hash-based duplicate detection fixed — image byte fetching from R2 storage working
- [x] **AI-06**: Embedding-based duplicate detection using cosine similarity threshold
- [x] **AI-07**: DBSCAN clustering groups similar photos for culling/curation review
- [x] **AI-08**: Similarity groups stored in database/Redis (not in-memory)

### Gallery Features

- [x] **GAL-01**: Slideshow generation implemented for client-viewable gallery playback
- [x] **GAL-02**: Gallery delivery emails sent to clients when gallery is ready (includes magic link)
- [x] **GAL-03**: Slideshow respects gallery branding settings (colors, logo, music preference)

### Notifications

- [x] **NOTF-01**: WebSocket connection established on backend for real-time notifications
- [x] **NOTF-02**: Notifications-service publishes events via Redis pub/sub to connected clients
- [x] **NOTF-03**: Churn intervention notifications wired (currently stubbed)
- [x] **NOTF-04**: Curation session status notifications wired (currently stubbed)

### Rate Limiting

- [x] **RATE-01**: Redis sliding window rate limiter implemented for A2A API keys (~50 lines)
- [x] **RATE-02**: Rate limiter checks agent_api_keys.rate_limit_rpm per request
- [x] **RATE-03**: Returns 429 with Retry-After header when limit exceeded
- [x] **RATE-04**: Rate limiter deployed in log-only mode first, then enforced after soak period

### Performance

- [x] **PERF-01**: Image processing moved from main backend request loop to ai-processing-service
- [x] **PERF-02**: Duplicate detection query uses indexed lookups instead of full table scan
- [x] **PERF-03**: Similarity groups migrated from in-memory storage to Redis

### Shared Packages

- [x] **PKG-01**: @rawdrive/api-types package built with dist output
- [x] **PKG-02**: @rawdrive/database-utils package built with dist output

### Test Coverage

- [ ] **TEST-01**: Backend integration tests for auth flows (login, signup, token refresh, logout)
- [ ] **TEST-02**: Backend integration tests for multi-tenant isolation (workspace_id enforcement)
- [ ] **TEST-03**: Backend integration tests for email sending (verification, reset, invitations)
- [x] **TEST-04**: Backend tests for AI worker concurrency (CLIP embedding, clustering)
- [x] **TEST-05**: Frontend component tests for gallery viewing and upload workflows
- [x] **TEST-06**: Frontend component tests for auth pages (signin, signup, forgot password)
- [x] **TEST-07**: Security enforcement tests — permission checks, workspace isolation, timing-safe comparison

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
| PDF gallery export | Deferred to v2 -- slideshow covers presentation need |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |
| MAIL-01 | Phase 2 | Complete |
| MAIL-02 | Phase 2 | Complete |
| MAIL-03 | Phase 2 | Complete |
| MAIL-04 | Phase 2 | Complete |
| AIS-01 | Phase 3 | Complete |
| AIS-02 | Phase 3 | Complete |
| AIS-03 | Phase 3 | Complete |
| RATE-01 | Phase 4 | Complete |
| RATE-02 | Phase 4 | Complete |
| RATE-03 | Phase 4 | Complete |
| RATE-04 | Phase 4 | Complete |
| MAIL-05 | Phase 5 | Complete |
| MAIL-06 | Phase 5 | Complete |
| MAIL-07 | Phase 5 | Complete |
| MAIL-08 | Phase 5 | Complete |
| MAIL-09 | Phase 5 | Complete |
| AI-01 | Phase 6 | Complete |
| AI-02 | Phase 6 | Complete |
| AI-03 | Phase 6 | Complete |
| AI-04 | Phase 6 | Complete |
| AI-05 | Phase 6 | Complete |
| AI-06 | Phase 6 | Complete |
| AI-07 | Phase 6 | Complete |
| AI-08 | Phase 6 | Complete |
| PERF-01 | Phase 6 | Complete |
| PERF-02 | Phase 6 | Complete |
| PERF-03 | Phase 6 | Complete |
| GAL-01 | Phase 7 | Complete |
| GAL-02 | Phase 7 | Complete |
| GAL-03 | Phase 7 | Complete |
| NOTF-01 | Phase 8 | Complete |
| NOTF-02 | Phase 8 | Complete |
| NOTF-03 | Phase 8 | Complete |
| NOTF-04 | Phase 8 | Complete |
| PKG-01 | Phase 9 | Complete |
| PKG-02 | Phase 9 | Complete |
| TEST-01 | Phase 9 | Pending |
| TEST-02 | Phase 9 | Pending |
| TEST-03 | Phase 9 | Pending |
| TEST-04 | Phase 9 | Complete |
| TEST-05 | Phase 9 | Complete |
| TEST-06 | Phase 9 | Complete |
| TEST-07 | Phase 9 | Complete |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after roadmap creation*
