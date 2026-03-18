# Domain Pitfalls

**Domain:** Brownfield microservices SaaS stabilization (photography platform)
**Researched:** 2026-03-18

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or production outages.

### Pitfall 1: Postal Email Server — DNS Misconfiguration Kills Deliverability

**What goes wrong:** Self-hosted Postal is deployed and "works" in dev (sends emails), but emails land in spam or get rejected in production. Gmail and Outlook enforce SPF, DKIM, and DMARC strictly in 2026 — issues that previously caused deferrals now cause outright rejection.

**Why it happens:** Postal requires SPF, DKIM, and DMARC DNS records on the sending domain. Common mistakes: (1) SPF record exceeds 10 DNS lookups and fails silently, (2) DKIM signing uses Postal's domain instead of rawdrive.in causing alignment failure, (3) DMARC set to `p=none` which provides zero protection and minimal deliverability benefit, (4) reverse DNS (PTR record) not configured on the sending IP.

**Consequences:** Users never receive verification emails, password reset links, or invitation emails. The entire email infrastructure appears broken even though Postal is running correctly. 6+ stubbed email flows remain functionally broken despite code changes.

**Prevention:**
- Before writing any email-sending code, configure DNS: SPF (include Postal's IP, keep under 10 lookups), DKIM (sign with rawdrive.in domain, not Postal default), DMARC (`p=quarantine` minimum), PTR record on sending IP.
- Use Postal's built-in delivery tracking and bounce webhooks to monitor deliverability from day one.
- Test with mail-tester.com or similar before considering email "done."
- Send from a subdomain (e.g., `mail.rawdrive.in`) to protect root domain reputation during initial warmup.

**Detection:** Emails "sent successfully" in logs but users report never receiving them. Postal dashboard shows high bounce/defer rates. SPF/DKIM check failures in Postal's message detail view.

**Phase relevance:** Email infrastructure phase — DNS setup must be the FIRST task, not an afterthought after code is written.

---

### Pitfall 2: Postal Infrastructure Dependencies Bloat Docker Compose

**What goes wrong:** Postal requires MySQL (not PostgreSQL), RabbitMQ, and its own worker processes. Adding Postal to an already-heavy Docker Compose (13 services + PostgreSQL + Redis + monitoring stack) creates resource contention, port conflicts, and startup ordering issues.

**Why it happens:** Teams assume Postal is "just another container" but it's actually 4+ containers (web, worker, SMTP, cron) plus MySQL and RabbitMQ. The existing stack already uses PostgreSQL and Redis — now there are two database engines to manage.

**Consequences:** Dev machines run out of RAM. CI/CD pipelines timeout. MySQL competes with PostgreSQL for disk I/O. Startup ordering failures cause intermittent test failures.

**Prevention:**
- Run Postal in a separate Docker Compose file (`docker-compose.postal.yml`) with its own network, bridged to the main stack.
- Set memory limits on Postal containers (web: 512MB, worker: 256MB, SMTP: 256MB).
- Use Postal's HTTP API from backend services rather than SMTP relay — simpler integration, better error handling, and avoids SMTP port conflicts.
- Document the separate startup sequence clearly.

**Detection:** `docker stats` showing >80% memory usage. Services failing health checks after adding Postal. MySQL container restarting in loops.

**Phase relevance:** Email infrastructure phase — architecture decision needed before implementation.

---

### Pitfall 3: CLIP Model Download Fails Inside Docker at Startup

**What goes wrong:** The ai-processing-service container starts, attempts to download CLIP ViT-B/32 (~340MB) on first run, and either times out (Docker health check kills it after 30s), fails due to network restrictions, or succeeds but doubles container startup time on every restart.

**Why it happens:** OpenAI's CLIP library downloads the model on first `clip.load()` call. In Docker, there's no persistent model cache by default. Corporate firewalls or air-gapped environments block Hugging Face / OpenAI CDN. The model download is synchronous and blocks the FastAPI startup.

**Consequences:** AI service appears broken in production. Container enters restart loop. Health checks fail. Other services waiting for AI embeddings time out.

**Prevention:**
- Pre-bake the model into the Docker image during build: `RUN python -c "import clip; clip.load('ViT-B/32', device='cpu')"` in Dockerfile.
- Mount a persistent volume for `~/.cache/clip` so models survive container restarts.
- Load model in a background task, not in the startup path. Serve a degraded response ("embeddings unavailable") until model is ready.
- Add a dedicated `/health/model` endpoint that reports model loading status separately from service health.

**Detection:** AI service health check fails. Container logs show download progress bars. `docker inspect` shows repeated restarts.

**Phase relevance:** AI/ML phase — Dockerfile changes must happen before any embedding code is written.

---

### Pitfall 4: CLIP on CPU Is Too Slow for Production Batch Processing

**What goes wrong:** CLIP ViT-B/32 runs on CPU (no GPU in Docker setup), and batch embedding of photos takes 2-5 seconds per image. A gallery upload of 500 photos means 20-40 minutes of processing, during which the worker is blocked and no other AI tasks can execute.

**Why it happens:** CLIP's `convert_weights` converts to fp16 by default, which causes errors on CPU (`softmax_lastdim_kernel_impl` for Half precision). Developers fix this by forcing fp32, which doubles memory usage and is even slower. The ai-processing-service likely has a single worker processing sequentially.

**Consequences:** AI features (similarity clustering, duplicate detection, face grouping) are practically unusable for real workloads. Users see "processing" forever. Worker queue backs up. Memory usage grows linearly with batch size.

**Prevention:**
- Force fp32 explicitly: `model, preprocess = clip.load("ViT-B/32", device="cpu"); model = model.float()`.
- Process in small batches (8-16 images) with explicit memory cleanup between batches.
- Use `torch.no_grad()` context manager for all inference to halve memory usage.
- Set realistic expectations: CPU inference is ~0.5-1s per image. Design the UX around async processing with progress indicators, not synchronous results.
- Consider ONNX Runtime quantized model for 3-5x CPU speedup if latency is unacceptable.
- Run multiple worker replicas (Celery workers or separate containers) for horizontal scaling.

**Detection:** Worker queue depth growing over time. AI task completion times >1s per image. Memory usage climbing during batch jobs.

**Phase relevance:** AI/ML phase — must decide CPU performance strategy before implementing batch embedding pipeline.

---

### Pitfall 5: Curation Session Race Conditions — FOR UPDATE Isn't Enough

**What goes wrong:** Two concurrent requests modify the same curation session (e.g., photographer marks photos while client submits selections). `SELECT ... FOR UPDATE` is added but the state machine still produces invalid transitions because the lock scope is wrong or the transaction boundary is too narrow.

**Why it happens:** Three distinct failure modes: (1) The lock is acquired but the state validation and state update happen in different transactions. (2) Long-running transactions with FOR UPDATE promote row locks to table locks, blocking all curation sessions. (3) In async SQLAlchemy, thread-safe patterns are NOT async-safe — using sync locking primitives in async code causes deadlocks on the event loop.

**Consequences:** Curation sessions enter impossible states (e.g., "completed" session accepts new selections). Data corruption. Client sees stale state. Photographer's work is lost.

**Prevention:**
- Use a single atomic transaction: `SELECT ... FOR UPDATE` + validate state + update state + commit, all in one `async with session.begin()` block.
- Define allowed state transitions explicitly in code (state machine enum), reject invalid transitions before touching the database.
- Keep locked transactions short (<100ms) — do all validation before acquiring the lock, only hold the lock for the state check + update.
- Use PostgreSQL advisory locks (`pg_advisory_xact_lock`) keyed on session_id for cross-request coordination rather than row locks when multiple tables are involved.
- Never use `asyncio.Lock()` as a substitute for database-level locking — it only works within a single process, not across multiple workers/replicas.

**Detection:** Inconsistent session states in database (sessions in states that shouldn't be reachable). Slow query logs showing lock waits >1s. Deadlock errors in PostgreSQL logs.

**Phase relevance:** Security/state machine phase — must be designed carefully before implementing, not patched incrementally.

---

### Pitfall 6: Retrofitting Rate Limiting Breaks Existing Service-to-Service Calls

**What goes wrong:** Redis sliding window rate limiting is added to API endpoints, and internal A2A (service-to-service) calls start getting rate-limited. The gallery-service batch-fetching assets from the backend hits the rate limit during normal operation. Health checks from monitoring get throttled.

**Why it happens:** Rate limiting is applied globally at the middleware level without distinguishing between external user requests and internal service requests. A2A API keys are treated identically to user sessions. Burst patterns from legitimate internal services (e.g., gallery-service fetching 100 assets on page load) exceed conservative rate limits designed for human users.

**Consequences:** Internal services intermittently fail. Cascading failures across microservices. Monitoring shows false "service down" alerts because health check requests are throttled.

**Prevention:**
- Implement separate rate limit tiers: external users (strict), A2A service keys (generous or exempt for known services), health checks (exempt).
- Use the existing A2A service registry to whitelist known service keys.
- Start with rate limiting in **log-only mode** (count but don't reject) for 1-2 weeks to establish baseline traffic patterns before enforcing.
- Return proper `429 Too Many Requests` with `Retry-After` header so clients can back off gracefully.
- Use Lua scripts for atomic Redis operations: `ZREMRANGEBYSCORE` + `ZCARD` + `ZADD` in a single `EVAL` to prevent race conditions in the rate limiter itself.

**Detection:** Sudden spike in 429 responses after deploying rate limiting. A2A service error rates increase. Health check endpoints returning 429.

**Phase relevance:** Rate limiting phase — must audit all internal callers before enforcing limits.

---

### Pitfall 7: Testing a Brownfield Codebase — Writing Tests That Can't Fail

**What goes wrong:** Team writes tests for existing code, tests pass, team gains false confidence. But the tests are tautological — they assert what the code does rather than what it should do. Tests pass even when critical logic is commented out.

**Why it happens:** When retrofitting tests onto existing code, developers naturally write assertions that match current behavior. Without a spec to test against, the test becomes a mirror of the implementation. Common pattern: mocking so aggressively that the test only verifies mock setup, not actual behavior.

**Consequences:** Test suite provides zero regression protection. Refactoring breaks nothing (in tests) even when it breaks everything (in production). Team believes they have coverage when they have ceremony.

**Prevention:**
- For every new test, verify it can fail: comment out the core logic line, confirm the test fails. If it still passes, the test is worthless.
- Start with characterization tests (document current behavior) but clearly label them as such — they're a safety net, not a specification.
- Prioritize integration tests over unit tests for brownfield code: test the API endpoint response, not the internal service method. These catch real regressions.
- Focus test effort on the specific bugs being fixed: every bug fix must include a test that fails without the fix and passes with it.
- For multi-tenant isolation, write negative tests: "user A CANNOT access user B's data" is more valuable than "user A CAN access their own data."

**Detection:** Code coverage increases but production bug rate doesn't decrease. Tests never fail in CI. Developers skip running tests because "they always pass."

**Phase relevance:** Testing phase — testing strategy must be decided before writing any tests. Must run in parallel with all other phases (every fix gets a test).

## Moderate Pitfalls

### Pitfall 8: Email Sending Code Scattered Across 6+ Files — Inconsistent Integration

**What goes wrong:** Each of the 6+ TODO email placeholders is implemented independently. One uses SMTP, another uses Postal's HTTP API, a third hardcodes the sender address. Error handling varies: some swallow exceptions silently, others crash the request.

**Prevention:**
- Create a single `EmailService` in the backend with a unified interface: `send_email(to, template, context)`. All 6+ call sites use this one service.
- Use email templates (Jinja2) stored in a templates directory, not inline HTML strings.
- All email sending must be async (background task or Celery worker) — never block the HTTP request on email delivery.
- Implement a dead letter queue for failed emails with retry logic.

**Phase relevance:** Email phase — the service abstraction must be built FIRST, then all 6+ call sites are wired to it.

---

### Pitfall 9: Duplicate Detection Full Table Scan — Index Doesn't Fix the Query

**What goes wrong:** An index is added to the image hash column, but the query still does a full table scan because it uses a function on the column (e.g., `WHERE lower(hash) = ...`), uses `LIKE '%hash%'`, or the query planner chooses a sequential scan due to low estimated selectivity.

**Prevention:**
- Use `EXPLAIN ANALYZE` on the actual query before and after adding the index to verify index usage.
- For perceptual hash similarity (hamming distance), use a GiST index with the `pg_trgm` extension, or store hashes as fixed-length bytea and use exact match indexes.
- Partition the hash comparison: compute a coarse hash bucket first (fast indexed lookup), then compare fine-grained hashes within the bucket.
- For pgvector-based similarity (which is already in the stack), use IVFFlat or HNSW indexes on embedding columns — these are purpose-built for approximate nearest neighbor search.

**Phase relevance:** Performance phase — requires query analysis before choosing an indexing strategy.

---

### Pitfall 10: In-Memory Similarity Groups — Data Loss on Container Restart

**What goes wrong:** Similarity groups are migrated from Python dict to Redis, but without persistence configuration. Redis restarts (during deployment or OOM) and all computed similarity groups are lost. Re-computation requires re-running CLIP inference on all images.

**Prevention:**
- Enable Redis persistence (AOF with `appendfsync everysec`) or use Redis with RDB snapshots.
- Better: store similarity groups in PostgreSQL as the source of truth, use Redis only as a cache. If Redis is cold, recompute from database, not from CLIP.
- Design the similarity group schema to be incrementally updatable — adding one new photo should only require comparing against existing group centroids, not reprocessing all photos.

**Phase relevance:** Performance phase — storage design must account for durability requirements.

---

### Pitfall 11: Timing-Safe Comparison — Applying It Inconsistently

**What goes wrong:** `hmac.compare_digest()` is used for A2A API key comparison in one middleware, but other auth paths (webhook signature verification, magic link token validation, password reset token comparison) still use `==`. The security fix is incomplete.

**Prevention:**
- Audit ALL token/secret comparisons across all 13+ services, not just the one reported.
- Create a shared utility function `secure_compare(a, b)` wrapping `hmac.compare_digest()` and use it everywhere.
- Add a linting rule or code review checklist item: "no bare `==` on secrets/tokens."

**Phase relevance:** Security phase — must be a comprehensive audit, not a point fix.

---

### Pitfall 12: Image Processing Blocks Main Loop — Moving to Background Creates Orphaned Jobs

**What goes wrong:** Image processing is moved from the synchronous request path to a background worker (Celery/asyncio task), but there's no mechanism to track job status. The frontend still expects synchronous results. Failed jobs are silently dropped. Retries process the same image multiple times, creating duplicate entries.

**Prevention:**
- Implement a job status table in PostgreSQL with states: `pending`, `processing`, `completed`, `failed`.
- Return a job ID to the frontend immediately, provide a polling endpoint or WebSocket update for completion.
- Implement idempotency: use image hash as deduplication key so retries don't create duplicates.
- Set job timeouts and implement a dead letter queue for jobs that fail after max retries.
- Wire job status to the notification service for real-time progress updates.

**Phase relevance:** Performance phase — requires coordinated changes across backend API, worker, and frontend.

## Minor Pitfalls

### Pitfall 13: Missing Permission Validation in Comments — Incomplete Fix

**What goes wrong:** `workspace_id` filtering is added to the comment query, but the fix misses that comments can reference assets across galleries. A user in workspace A can still create a comment referencing an asset_id from workspace B if the asset_id is guessable (sequential integers).

**Prevention:**
- Validate both `workspace_id` on the comment AND `workspace_id` on the referenced entity (asset, gallery, album).
- Use UUIDs instead of sequential IDs for all entity references to prevent enumeration.
- Write negative tests: "creating a comment with asset_id from another workspace returns 403."

**Phase relevance:** Security phase.

---

### Pitfall 14: Shared Package Build Order Creates CI Flakiness

**What goes wrong:** `pnpm build:packages` must run before frontend build, but CI runs them in parallel or in wrong order. Frontend compilation fails with "module not found" for `@rawdrive/shared-types`.

**Prevention:**
- Explicitly declare package build order in CI pipeline.
- Use pnpm workspace `dependsOn` configuration in `turbo.json` or pipeline config.
- Add a smoke test: frontend build step should fail fast if shared packages aren't compiled.

**Phase relevance:** Shared packages phase — must be resolved before any CI-dependent work.

---

### Pitfall 15: Test Database State Leaks Between Tests

**What goes wrong:** Integration tests for multi-tenant isolation work individually but fail when run together. Test A creates data in workspace 1, test B runs in workspace 2 but finds test A's data because transactions aren't properly rolled back or test databases aren't isolated.

**Prevention:**
- Use database transactions with rollback for each test (pytest fixture with `async_session` that rolls back after each test).
- Generate unique workspace_ids per test (UUIDs) rather than using fixed test fixtures.
- Run tests with `--forked` or in isolated database schemas if transaction rollback is insufficient.
- Never rely on database being empty — always filter by the test's own workspace_id.

**Phase relevance:** Testing phase — test infrastructure must be set up before writing integration tests.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Email Infrastructure | DNS misconfiguration (#1), resource bloat (#2), inconsistent integration (#8) | Configure DNS first, separate Compose file, build unified EmailService before wiring call sites |
| AI/ML Completion | Model download failure (#3), CPU performance (#4) | Pre-bake model in Docker image, design for async batch processing with progress tracking |
| Security Hardening | Race conditions (#5), incomplete timing-safe fix (#11), permission gaps (#13) | Atomic transactions with advisory locks, audit ALL services for timing-unsafe comparisons |
| Rate Limiting | Breaking internal calls (#6) | Deploy in log-only mode first, separate tiers for A2A vs external |
| Performance Fixes | Full table scan not fixed by index (#9), data loss on restart (#10), orphaned jobs (#12) | EXPLAIN ANALYZE before/after, PostgreSQL as source of truth with Redis cache, job status tracking |
| Test Coverage | Unfailable tests (#7), state leaks (#15), shared package build order (#14) | Verify tests can fail, transaction rollback per test, fix CI build order first |

## Sources

- [SPF DKIM DMARC 2026 Guide](https://datainnovation.io/en/blog/dmarc-dkim-spf-in-2026-the-no-bs-technical-guide-for-email-senders/)
- [Email Deliverability 2026 Checklist](https://www.egenconsulting.com/blog/email-deliverability-2026.html)
- [How to Run Postal in Docker](https://oneuptime.com/blog/post/2026-02-08-how-to-run-postal-mail-server-in-docker/view)
- [CLIP ViT-B/32 Memory Requirements](https://huggingface.co/openai/clip-vit-base-patch32/discussions/11)
- [CLIP CPU Device Issue](https://github.com/openai/CLIP/issues/209)
- [SQLAlchemy Race Conditions and Advisory Locks](https://blog.blasphemess.com/sqlalchemy-race-conditions-and-postgresql-advisory-locks/)
- [FastAPI Concurrency Trap](https://datasciocean.com/en/other/fastapi-race-condition/)
- [SQLAlchemy Database Locks with FastAPI](https://medium.com/@mojimich2015/sqlalchemy-database-locks-using-fastapi-a-simple-guide-3e7dcd552d87)
- [Redis Sliding Window Rate Limiting](https://redis.io/tutorials/howtos/ratelimiting/)
- [API Rate Limiting Best Practices 2025](https://zuplo.com/learning-center/10-best-practices-for-api-rate-limiting-in-2025)
- [Testing Untested Legacy Code](https://understandlegacycode.com/blog/best-way-to-start-testing-untested-code/)
- [Brownfield Codebase Challenges](https://utkrusht.ai/blog/challenges-with-brownfield-development-codebases)
- [Legacy Application Code Coverage](https://about.codecov.io/blog/how-to-incorporate-code-coverage-for-a-legacy-application/)
- [End-to-End Testing for Microservices 2025](https://www.bunnyshell.com/blog/end-to-end-testing-for-microservices-a-2025-guide/)
