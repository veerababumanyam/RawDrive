# CLAUDE.md

**RawDrive** — Enterprise SaaS photography platform. Microservices architecture, React frontend, FastAPI backend, PostgreSQL + pgvector.

## Commands

```bash
# Frontend
cd frontend && pnpm dev                          # Dev server → http://localhost:5173
cd frontend && pnpm test                         # Run all tests
cd frontend && pnpm test src/path/file.test.ts   # Single test
cd frontend && pnpm lint                         # Lint

# Backend (Docker — preferred)
docker exec rawdrive-backend pytest                         # All tests
docker exec rawdrive-backend pytest tests/path/test_file.py # Single test
docker exec rawdrive-backend pytest -k "test_name"          # By name
docker exec rawdrive-backend alembic upgrade head           # Run migrations
docker exec rawdrive-backend alembic revision -m "msg"      # New migration

# Backend (local)
cd backend && uvicorn app.main:app --reload --port 8000
cd backend && ruff check src && mypy src

# Shared packages
pnpm build:packages       # Build all shared packages (must run before frontend if types changed)
pnpm generate:python      # Generate Python types from TypeScript

# Dev environment
.\setup-dev-environment.ps1                                        # One-command setup
docker compose -f infrastructure/docker/docker-compose.yml up -d   # Manual setup
```

**Test login:** `free@test.rawdrive.in` / `Test@123` — See [docs/TEST_USERS.md](docs/TEST_USERS.md) for all 13 test accounts

## Architecture

15 microservices + workers on shared PostgreSQL. All services validate JWT with shared `JWT_SECRET`. Ports configured via `PORT_*` vars in `infrastructure/docker/.env`. See [docs/port-reference.md](docs/port-reference.md) for full mapping.

| Service | Env Var | Default | Container |
|---------|---------|---------|-----------|
| Backend (main API) | PORT_BACKEND | 8000 | rawdrive-backend |
| Gallery | PORT_GALLERY | 8004 | rawdrive-gallery-service |
| Billing | PORT_BILLING | 8005 | rawdrive-billing-service |
| Onboarding | PORT_ONBOARDING | 8006 | rawdrive-onboarding-service |
| Invitations | PORT_INVITATIONS | 8007 | rawdrive-invitations-api |
| Upload | PORT_UPLOAD | 8008 | rawdrive-upload-service |
| Notifications | PORT_NOTIFICATIONS | 8010 | rawdrive-notifications-service |
| Client | PORT_CLIENT | 8011 | rawdrive-client-service |
| AI Processing | PORT_AI_PROCESSING | 8012 | rawdrive-ai-processing |
| AI Service | PORT_AI_SERVICE | 8013 | rawdrive-ai-service-mcp |
| Webhooks | PORT_WEBHOOKS | 8015 | rawdrive-webhooks-service |
| Growth | PORT_FACE_SERVICE | 8016 | rawdrive-growth-service |

**Infrastructure:** PostgreSQL (:5432), Redis (:6379), PgBouncer (:6432), Traefik (:80/:8080)
**Monitoring:** Prometheus (:9090), Grafana (:3000, admin/admin), Loki (:3100), Alertmanager (:9093)
**Vector DB:** Milvus (:19530), etcd (:2379), MinIO (:9000/:9001)

## Critical Rules

<important if="writing any database query, repository method, or API endpoint">

### Multi-tenant isolation (MANDATORY)
Every query MUST filter by `workspace_id`. Extract from JWT — never trust client-provided values.

```python
result = await db.execute(
    select(Asset).where(Asset.workspace_id == workspace_id)
)
```
</important>

### Backend 3-layer architecture
Repository (DB access) → Service (business logic) → API (HTTP). Never put logic in models.

### Never hardcode
API keys, secrets, LLM provider/model names, colors (use design tokens), user-facing strings (use i18n), magic numbers (use constants).

### RBAC
Workspace RBAC and Platform RBAC are separate systems. Download policies: `view_only|web_only|watermarked_only|original_allowed`.

<important if="implementing any feature or bugfix">

### Test-Driven Development (MANDATORY)
Write tests BEFORE implementation code. Every feature and bugfix follows this cycle:

1. **Red** — Write a failing test that defines the expected behavior
2. **Green** — Write the minimum code to make the test pass
3. **Refactor** — Clean up while keeping tests green

```bash
# Frontend (Vitest)
cd frontend && pnpm test src/path/file.test.ts --watch

# Backend (pytest inside Docker)
docker exec rawdrive-backend pytest tests/path/test_file.py -x
```

No PR or commit should include implementation code without corresponding tests. If fixing a bug, first write a test that reproduces it.
</important>

## File Structure

```
frontend/src/{components/ui|features|layout, pages/, hooks/, services/, contexts/, utils/}
backend/src/app/{api/v1/, models/, repositories/, services/, middleware/, workers/}
services/[name]/src/{api/v1/, services/, repositories/, schemas/, observability/, config.py}
```

## Shared Packages (pnpm workspaces)

| Package | Purpose |
|---------|---------|
| `@rawdrive/shared-types` | Domain types (`InvitationStatus`, `GalleryStatus`) |
| `@rawdrive/shared-constants` | Config (`API_BASE`, `STORAGE`, `AI_THRESHOLDS`) |
| `@rawdrive/shared-validation` | Validation (`isValidHexColor`, `sanitizeHtml`) |
| `@rawdrive/shared-utils` | Utilities (`formatRelativeDate`, `formatFileSize`) |

Backend Python equivalents: `from app.shared.types import ...`

## Skills (auto-loaded by context)

36 skills in `.claude/skills/`:

**Core Architecture:** `multi-tenant-security` | `fastapi-services` | `react-frontend` | `database-migrations` | `microservice-development` | `api-design`
**Features:** `gallery-features` | `invitations` | `client-management` | `billing-payments` | `ai-ml-integration` | `storage-uploads` | `album-proofing` | `notification-system` | `webhook-development`
**Search & Discovery:** `search-discovery` | `analytics-engagement`
**Real-Time & Offline:** `real-time-collaboration` | `pwa-offline`
**Compliance & Onboarding:** `compliance-legal` | `onboarding-flow`
**Quality & Ops:** `testing-patterns` | `performance-optimization` | `design-system` | `observability` | `traefik-infrastructure` | `git-workflow`
**Workflow & Shipping:** `qa-testing` | `design-audit` | `pre-landing-review` | `ship-release` | `doc-sync` | `engineering-retro`
**Cross-cutting:** `i18n-localization` | `shared-packages` | `lightbox-image-fitting`

## Hooks (auto-enforced guardrails)

6 custom hooks in `.claude/hooks/`:

| Hook | Event | Purpose |
|------|-------|---------|
| `workspace-id-guard` | PreToolUse (Write/Edit) | Flags database queries missing workspace_id isolation |
| `docker-health-check` | PreToolUse (Bash) | Verifies Docker containers are running before exec |
| `migration-safety` | PreToolUse (Write/Edit) | Validates Alembic migrations for destructive operations |
| `secret-detection` | PreToolUse (Write/Edit) | Blocks secrets/credentials from being written to code |
| `test-coverage-gate` | PostToolUse (Write/Edit) | Reminds about missing test files for modified code |
| `i18n-string-check` | PostToolUse (Write/Edit) | Flags hardcoded user-facing strings in React components |

## Gotchas

- Docker container name is `rawdrive-backend` — all `docker exec` commands need this exact name
- Shared packages must be built (`pnpm build:packages`) before frontend can use updated types
- Alembic migrations run inside Docker: `docker exec rawdrive-backend alembic ...`
- Gallery-service is the reference implementation for new microservices — copy its patterns
- All services need `/health/live`, `/health/ready`, and Prometheus `/metrics` endpoints
- Some scaffolding is incomplete — verify package manifests before assuming scripts exist
- Tech specs live in `docs/TechnicalSpecs/*.json` (validated by `_schema.json`) — update `lastUpdated` when changing behavior

## Key Environment Variables

`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL`, `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`

## References

- **[PRD](.claude/PRD.md)** — Product requirements, architecture, tech stack
- **[Test Users](docs/TEST_USERS.md)** — All test accounts, credentials, API examples, seeding commands
- **[Deployment Checklist](docs/deployment-checklist.md)** — Pre-deployment verification steps
- **[Best practices](.claude/reference/)** — 24 technical guides
- **[Coding standards](.claude/reference/coding-standards.md)** — Naming, patterns, file rules
- **[Security](.claude/reference/security-best-practices.md)** — Auth, encryption, compliance

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
