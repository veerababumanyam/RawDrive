# Codebase Concerns

**Analysis Date:** 2026-03-18

## Tech Debt

### Unimplemented AI/ML Features
**Area:** Similarity Detection & Image Processing

- **Issue:** Multiple core AI features are scaffolded but not implemented
- **Files:**
  - `backend/src/app/workers/similarity_worker.py` (lines 277-293)
  - `backend/src/app/workers/gallery_export_worker.py` (lines 456-536)
  - `backend/src/app/services/duplicate_detection_service.py` (line 992)
  - `backend/src/app/services/geo_search_service.py` (lines 365, 391)

- **Impact:** Critical features that users expect are non-functional:
  - CLIP model loading returns placeholder (`self._clip_model = "placeholder"`)
  - Batch embedding computation skipped (returns empty embeddings)
  - Clustering algorithm not implemented
  - PDF/slideshow generation stubbed
  - Duplicate detection via hashing depends on image byte fetching that doesn't work

- **Fix approach:**
  - T031: Implement actual CLIP model loading (ViT-B/32) with proper memory management
  - Batch embeddings through GPU-accelerated inference (consider separate AI service)
  - Clustering algorithm implementation (cosine similarity threshold-based)
  - Move image processing to AI Processing service to avoid blocking main backend

### Rate Limiting Not Enforced
**Area:** API Security & A2A Communication

- **Issue:** Redis-based rate limiting for API keys is stubbed with TODO comment
- **Files:** `backend/src/app/middleware/a2a_auth.py` (line 450)

- **Impact:** External agents can exceed configured rate limits without enforcement. Security/denial-of-service risk.

- **Fix approach:**
  - Implement sliding window rate limiter in Redis
  - Check `agent_api_keys.rate_limit_rpm` on each API key request
  - Return 429 when limit exceeded
  - Use rate_limit_key pattern: `a2a:ratelimit:{api_key_id}:{endpoint}`

### Email Sending Stubbed
**Area:** Communication & Notifications

- **Issue:** Multiple email-sending operations are TODO placeholders
- **Files:**
  - `backend/src/app/services/task_queue.py` (lines 499, 523, 630, 754)
  - `backend/src/app/services/auth_service.py` (lines 773, 858)
  - `backend/src/app/services/email_verification_service.py` (line 218)
  - `backend/src/app/services/onboarding_service.py` (line 587)
  - `backend/src/app/services/invitation_auto_deletion_service.py` (line 441)
  - `backend/src/app/api/v1/auth.py` (line 393)

- **Impact:** Critical user journeys broken:
  - Email verification not sent (users can't verify new emails)
  - Password reset emails not sent
  - Bulk invitation emails not sent
  - Account recovery emails not sent
  - Invitation deletion notifications not sent

- **Fix approach:**
  - Integrate SendGrid/SES API client (referenced but unused)
  - Queue email tasks through task queue with retry logic
  - Template system for each email type
  - Track email delivery status in database

### Incomplete Notification System
**Area:** Real-time & Async Communication

- **Issue:** Notification service integration is stubbed in churn intervention and curation workflows
- **Files:**
  - `backend/src/app/workers/churn_intervention_worker.py` (line 529)
  - `backend/src/app/services/curation_session_service.py` (line 496)

- **Impact:** Users don't receive important notifications about:
  - Churn intervention opportunities
  - Curation session status updates
  - Smart AI recommendations

- **Fix approach:**
  - Implement WebSocket handler for real-time notifications
  - Queue notifications through notifications-service (port 8010)
  - Add SMS integration (line 634: Twilio SMS stubbed)

---

## Known Bugs

### Debug Logging Left in Production Code
**Area:** Frontend Performance & Observability

- **Issue:** Temporary debug logging in `useClientAvatars` hook left in codebase
- **Files:** `frontend/src/hooks/useClientAvatars.ts` (lines 71-79, 101-117)

- **Symptoms:**
  - Console spam when avatars fetch (multiple clients listed in every render)
  - Performance degradation on lists with many clients
  - Debugging information leaked to production users

- **Workaround:** Client browser consoles show debug output; disable in browser console settings

- **Trigger:** Render any page with `useClientAvatars` hook (ClientsList, PeoplePage, etc.)

---

## Security Considerations

### Missing Permission Validation in Comments
**Area:** Multi-tenant Data Access Control

- **Risk:** Comments API endpoint doesn't validate user's admin status before setting `is_admin` flag
- **Files:** `backend/src/app/api/v1/comments.py` (lines 261-266)

- **Current mitigation:**
  - Hard-coded `is_admin=False` fallback prevents privilege escalation
  - TODO comment flags the gap
  - Requests are still scoped to workspace (workspace_id isolation intact)

- **Recommendations:**
  - Implement proper RBAC check: `await rbac_service.can_perform("comments:admin", user_id, workspace_id)`
  - Test with non-admin users to ensure they can't set is_admin flag via API

### A2A API Key Database Query Uses String Comparison
**Area:** Cryptographic Authentication

- **Risk:** API key validation uses `crypt()` function in SQL query, but no explicit bcrypt/argon2 verification
- **Files:** `backend/src/app/middleware/a2a_auth.py` (line 196)

- **Current mitigation:**
  - SQL uses PostgreSQL's `crypt()` function for hash comparison
  - Keys are hashed with pgcrypto before storage

- **Recommendations:**
  - Verify bcrypt library version and iteration count
  - Add audit logging when API key validation fails (currently logs but no alert)
  - Implement key rotation policy enforcement

---

## Performance Bottlenecks

### Image Processing Blocks Main Request Loop
**Area:** Asset Processing & Scalability

- **Problem:** Gallery exports and asset processing run synchronously in worker
- **Files:**
  - `backend/src/app/workers/gallery_export_worker.py` (full file)
  - `backend/src/app/workers/similarity_worker.py` (embedding computation)

- **Cause:**
  - CLIP model loading happens in-process
  - No batch queueing to external service
  - Memory usage unbounded for large galleries (all embeddings in RAM)

- **Improvement path:**
  - Move CLIP model to separate AI Processing service (port 8012)
  - Implement streaming/chunking for embeddings (process 100 at a time vs all)
  - Add memory limits and circuit breaker

### Duplicate Detection Full Table Scan
**Area:** Database Query Performance

- **Problem:** Finding duplicates requires scanning all clients for name similarity
- **Files:** `backend/src/app/services/duplicate_detection_service.py` (lines 132-150)

- **Cause:**
  - No full-text search index on client names
  - Levenshtein distance computed in application code (not SQL)
  - No pagination for large result sets

- **Improvement path:**
  - Add PostgreSQL trigram indexes on `full_name` column
  - Use SQL `similarity()` function instead of Python loop
  - Implement limit/offset pagination (currently returns all up to 20)

---

## Fragile Areas

### Curation Session State Machine
**Area:** Complex Workflow Management

- **Files:**
  - `backend/src/app/services/curation_session_service.py`
  - `backend/src/app/workers/similarity_worker.py`
  - `backend/src/app/workers/churn_intervention_worker.py`

- **Why fragile:**
  - Multiple workers depend on shared session state (progress_stage, status)
  - No locking/versioning on state transitions
  - Race condition if two workers update same session simultaneously
  - Status transitions not validated (can jump from any state to any state)

- **Safe modification:**
  - Add state machine validator before transitions
  - Use database row-level locking for concurrent updates
  - Test with concurrent worker instances
  - Add state-to-transition whitelist (e.g., only `analyzing` → `grouping`, not `grouping` → `analyzing`)

- **Test coverage:**
  - Concurrent session processing not tested
  - Edge case: session deleted while worker processing
  - Edge case: worker crash during embedding computation (orphaned state)

### JWT Token Claim Extraction
**Area:** Authentication & Authorization

- **Files:** `backend/src/app/middleware/a2a_auth.py` (lines 125-141)

- **Why fragile:**
  - Multiple fallback claim names (`sub` or `user_id`, `perms` or `permissions`)
  - If JWT format changes, silent fallback to empty permissions
  - No validation that required claims exist before use
  - Service name extracted from `iss` or falls back to "unknown"

- **Safe modification:**
  - Define strict JWT schema upfront
  - Fail early if required claims missing (don't fallback)
  - Add validation tests for each claim combination
  - Deprecate alternative claim names after service migration

- **Test coverage:**
  - Missing tests for malformed JWTs
  - Missing tests for missing optional claims
  - Missing tests for service_id extraction

---

## Scaling Limits

### Similarity Groups In-Memory Storage
**Area:** Large Gallery Processing

- **Current capacity:** Tested up to 500 photos per gallery
- **Limit:**
  - CLIP embeddings (512-dim float32) = 2KB per photo
  - 5000 photos = 10MB embeddings + clustering overhead
  - Worker memory ~500MB becomes bottleneck at ~1000 photos

- **Scaling path:**
  - Move embeddings to PostgreSQL pgvector column
  - Batch query embeddings (100 at a time)
  - Use Milvus/Weaviate for vector similarity search (scales to millions)
  - Stream results instead of loading all into memory

### Database Connection Pool
**Area:** Concurrent Requests

- **Current capacity:** Default pool size 10 connections
- **Limit:** ~100 concurrent requests before connection exhaustion

- **Scaling path:**
  - Increase pool size based on worker concurrency (`TASK_WORKER_CONCURRENCY` env var)
  - Implement connection pooling at Traefik level
  - Monitor pool utilization in Grafana

---

## Dependencies at Risk

### CLIP Model Download & Caching
**Area:** AI Model Management

- **Risk:**
  - No offline fallback if HuggingFace/model CDN down
  - Model binary not cached (re-downloads on container restart)
  - No version pinning for model updates

- **Impact:** Worker startup fails, curation features unavailable

- **Migration plan:**
  - Pre-download model into Docker image (adds 500MB, but guaranteed availability)
  - Or: use model from local S3-compatible bucket as fallback
  - Pin model version explicitly (not `latest`)

### SendGrid/Email Service Integration
**Area:** External Communication

- **Risk:**
  - No fallback if SendGrid down (emails silently drop)
  - Rate limits not enforced by client (relies on API rate limiting)

- **Impact:** Users can't receive password resets, invitations, notifications

- **Migration plan:**
  - Implement queue + retry logic (exponential backoff)
  - Add circuit breaker pattern (fail-open or fail-closed?)
  - Support multiple email providers (SendGrid primary, SES fallback)

---

## Missing Critical Features

### PDF Export Not Implemented
**Area:** Gallery Features

- **Problem:** Users expect to download galleries as PDF but feature is stubbed
- **Blocks:** Gallery export workflows, print functionality

- **Files:** `backend/src/app/workers/gallery_export_worker.py` (line 456)

### Slideshow Generation Not Implemented
**Area:** Gallery Features

- **Problem:** Users expect slideshow playback but feature is stubbed
- **Blocks:** Presentation mode, client viewing experience

- **Files:** `backend/src/app/workers/gallery_export_worker.py` (line 497)

### OAuth/Cloud Sync Not Implemented
**Area:** Gallery Features

- **Problem:** Export to Google Drive, Dropbox, etc. is stubbed
- **Blocks:** Integration workflows, data portability

- **Files:**
  - `backend/src/app/api/v1/gallery_exports.py` (lines 517, 534)
  - `backend/src/app/workers/gallery_export_worker.py` (line 536)

### Google Search Console Integration Not Implemented
**Area:** SEO & Analytics

- **Problem:** Gallery SEO monitoring not functional
- **Blocks:** SEO features, organic discovery tracking

- **Files:** `backend/src/app/api/v1/search_console.py` (lines 108, 178)

### Password Reset Flow Not Implemented
**Area:** User Authentication

- **Problem:** Users can't reset forgotten passwords
- **Blocks:** Account recovery, critical user journey

- **Files:** `backend/src/app/api/v1/auth.py` (lines 407, 423)

---

## Test Coverage Gaps

### AI Worker Concurrency Not Tested
**Area:** Similarity & Curation Workers

- **What's not tested:**
  - Two workers processing same session simultaneously
  - Race conditions on state transitions
  - Worker crash during embedding computation (orphaned state recovery)
  - Memory limits exceeded with large galleries

- **Files:** `backend/src/app/workers/similarity_worker.py`

- **Risk:**
  - Silent data corruption (same photo in multiple groups)
  - Infinite loops if worker hangs
  - Orphaned sessions if worker crashes

- **Priority:** High (affects all Smart Curate features)

### Permission Enforcement Not Tested
**Area:** Authorization

- **What's not tested:**
  - Non-admin users trying to set is_admin flag
  - API key scope validation
  - Cross-workspace access attempts

- **Files:**
  - `backend/src/app/api/v1/comments.py`
  - `backend/src/app/middleware/a2a_auth.py`

- **Risk:**
  - Privilege escalation vulnerabilities
  - Multi-tenant data leakage

- **Priority:** Critical

### Email Service Not Tested
**Area:** Communication

- **What's not tested:**
  - Email sending actually queued
  - Retry logic on failures
  - Template rendering with user data

- **Files:** `backend/src/app/services/task_queue.py`

- **Risk:**
  - Silent email failures
  - No audit trail of attempts

- **Priority:** High (affects user onboarding)

---

*Concerns audit: 2026-03-18*
