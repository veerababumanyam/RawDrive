# Hostinger Production Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring up the full RawDrive production stack (Go API + Next.js + pgvector + Valkey + NATS + nginx) across three Hostinger VPSes in active-active HA with load balancing, backed by R2 offsite backups and a documented failover path, targeting 10k registered users.

**Architecture:** Two app nodes (`.42`, `.44`) behind Cloudflare DNS run identical containers (nginx, backend, frontend, worker, pgbouncer, NATS) plus one replica each — `.42` hosts a Valkey replica, `.44` hosts a Postgres streaming replica. Third node (`.46`) hosts the Postgres + Valkey primaries and the 3rd NATS cluster member. HA failover is Nginx `proxy_next_upstream` peer-backup between app nodes, manual-promote replicas on DB side, PgBouncer on each app node to absorb DB failover without backend restart.

**Tech Stack:** Ubuntu 24.04 LTS, Docker CE + Compose v2, PostgreSQL 17 + pgvector, Valkey 9, NATS JetStream 2.11, nginx 1.27-alpine, Go 1.25, Next.js 16.2.2, Let's Encrypt (webroot HTTP-01 → DNS-01), Cloudflare DNS + WAF + edge cache, R2 for offsite backups.

**Spec:** `docs/superpowers/specs/2026-04-11-hostinger-production-bootstrap-design.md` (commit `d6e3168`)

**Execution context:** Run from the local Windows machine with the SSH key at `~/.ssh/id_ed25519` already authorized on all three hosts. Consider using `superpowers:using-git-worktrees` to isolate this work from `feature/landing-redesign`.

---

## File Structure

### Files to CREATE in this repo

| Path | Purpose |
|---|---|
| `backend/cmd/migrate/main.go` | One-shot migration runner binary (new) |
| `backend/Dockerfile` | Multi-stage build producing `api` and `migrate` binaries (REPLACES the pre-existing Dockerfile from commit `c481200` which only built a single `rawdrive-api` from debian:bookworm-slim with webp+ffmpeg runtime deps; those deps are preserved in the new alpine-based variant via `libwebp-tools ffmpeg` apk packages) |
| `frontend/Dockerfile` | Multi-stage Next.js standalone build |
| `deploy/docker-compose.prod-db.yml` | Compose file for `.46` (postgres + valkey + nats-3) |
| `deploy/docker-compose.prod-app.yml` | Compose file for `.42`/`.44` (nginx, backend, frontend, worker, pgbouncer, nats, replicas) |
| `deploy/postgres/postgresql.conf` | Tuned primary config (8 GB box) |
| `deploy/postgres/pg_hba.conf` | Restricted access rules |
| `deploy/postgres/init/01-create-extensions.sql` | pgvector + pg_stat_statements init |
| `deploy/postgres/init/02-create-replication-role.sql` | Replication user for `.44` |
| `deploy/valkey/valkey.conf` | Primary config with AOF |
| `deploy/valkey/valkey-replica.conf` | Replica config for `.42` |
| `deploy/pgbouncer/pgbouncer.ini` | Transaction mode pooler config |
| `deploy/pgbouncer/userlist.txt` | SCRAM-SHA-256 verifier list (fetched from pg_authid at runtime) |
| `deploy/pgbouncer/databases.ini` | DB host routing (mutable during failover) |
| `deploy/nats/nats-server.conf` | 3-node JetStream cluster config |
| `deploy/nginx/nginx.conf` | Main nginx config |
| `deploy/nginx/templates/rawdrive.conf.template` | Site config with `${PEER_NODE_IP}` envsubst |
| `deploy/scripts/deploy-app.sh` | Rolling deploy driver |
| `deploy/scripts/renew-ssl.sh` | Cert renewal wrapper |
| `deploy/scripts/backup-db.sh` | pg_dump + rclone to R2 |
| `deploy/scripts/promote-postgres-replica.sh` | Emergency failover |
| `deploy/.env.example` | Documented env var schema |
| `docker-compose.observability.yml.example` | Future-proofing stub |
| `docs/runbooks/postgres-failover.md` | Phase E runbook |
| `docs/runbooks/valkey-failover.md` | Phase E runbook |
| `docs/runbooks/disaster-recovery-from-r2.md` | Phase E runbook |
| `docs/runbooks/cert-renewal.md` | Phase E runbook |
| `docs/runbooks/rolling-deploy.md` | Phase E runbook |
| `docs/runbooks/scale-out-4th-node.md` | Phase E runbook |

### Files to MODIFY

| Path | Change |
|---|---|
| `frontend/next.config.ts` | Add `output: 'standalone'` to the exported config |
| `.gitignore` | Append `HostingerServerDetails.md` (Phase E) |

### Server-side files (written to VPSes, not in repo)

| Node | Path | Purpose |
|---|---|---|
| all 3 | `/etc/sysctl.d/99-rawdrive.conf` | Kernel tuning |
| all 3 | `/etc/ssh/sshd_config.d/99-rawdrive.conf` | SSH hardening |
| all 3 | `/etc/fail2ban/jail.d/sshd.local` | fail2ban sshd jail |
| all 3 | `/swapfile` | 4 GB swap |
| all 3 | `/opt/rawdrive/app/.env` | Service credentials |
| .42, .44 | `/opt/rawdrive/app/deploy/.env` | `PEER_NODE_IP` (never tar-pushed) |
| .42 | `/opt/rawdrive/renew-ssl.sh` | Cert renewal cron target |
| .44 | `/opt/rawdrive/renew-ssl.sh` | Same |
| .46 | `/opt/rawdrive/backup-db.sh` | Backup cron target |
| .46 | `/root/.config/rclone/rclone.conf` | R2 credentials |

---

## Phase 0 — Local Repository Scaffolding (no server touch)

Every file in this phase is authored locally, committed to git, pushed to servers in later phases via `tar | ssh`.

### Task 0.1: Enable Next.js standalone output

**Files:**
- Modify: `frontend/next.config.ts`

- [ ] **Step 1: Read current config**

Run: `head -5 frontend/next.config.ts`
Expected: TypeScript imports and `const frontendRoot = ...` (confirms this is the right file)

- [ ] **Step 2: Apply edit**

Find this block:
```ts
const nextConfig: NextConfig = {
  turbopack: {
    root: frontendRoot,
  },
```

Replace with:
```ts
const nextConfig: NextConfig = {
  // Production bootstrap (2026-04-11): required for slim Docker image
  // under deploy/docker-compose.prod-app.yml. See docs/superpowers/specs/
  // 2026-04-11-hostinger-production-bootstrap-design.md §3.3.
  output: 'standalone',
  turbopack: {
    root: frontendRoot,
  },
```

- [ ] **Step 3: Verify build works with standalone**

Run: `cd frontend && pnpm install && pnpm build`
Expected: Build succeeds; `.next/standalone/server.js` exists; `.next/standalone/` directory populated.

Verify: `ls frontend/.next/standalone/server.js`
Expected: file exists, ~1–2 KB

- [ ] **Step 4: Commit**

```bash
git add frontend/next.config.ts
git commit -m "feat(frontend): enable Next.js standalone output for prod Docker image"
```

---

### Task 0.2: Create backend migrate binary (TDD)

**Files:**
- Create: `backend/cmd/migrate/main.go`
- Create: `backend/cmd/migrate/main_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/cmd/migrate/main_test.go`:
```go
package main

import (
	"os"
	"testing"
)

// TestExitsOnMissingDSN verifies the binary reports a clear error and
// exits non-zero when DATABASE_URL is absent.
func TestExitsOnMissingDSN(t *testing.T) {
	if os.Getenv("TEST_RUN_MAIN") == "1" {
		os.Unsetenv("DATABASE_URL")
		main()
		return
	}
	// Test harness that re-runs this test binary in a child process
	// is overkill here. Instead just assert runMigrate() returns the
	// expected error when called directly with empty DSN.
	err := runMigrate("")
	if err == nil {
		t.Fatal("expected error for empty DSN, got nil")
	}
	if err.Error() != "DATABASE_URL is required" {
		t.Fatalf("expected 'DATABASE_URL is required', got %q", err.Error())
	}
}
```

- [ ] **Step 2: Run test to verify it fails (package doesn't exist yet)**

Run: `cd backend && go test ./cmd/migrate/...`
Expected: `no Go files in backend/cmd/migrate` or build error — either way, test fails.

- [ ] **Step 3: Write minimal implementation**

Create `backend/cmd/migrate/main.go`:
```go
// Command migrate applies all backend schema migrations to the database
// configured by DATABASE_URL and exits.
//
// Usage: run as a one-shot Docker Compose service before the api service
// starts. Exit codes: 0 success, 1 config error, 2 migration error.
//
// This binary wraps the existing database.Migrator (used today only from
// tests) and gives it a production entry point. See design spec
// docs/superpowers/specs/2026-04-11-hostinger-production-bootstrap-design.md
// §5.1 for rationale.
package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/rawdrive/backend/internal/database"
)

func main() {
	if err := runMigrate(os.Getenv("DATABASE_URL")); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		if errors.Is(err, errMissingDSN) {
			os.Exit(1)
		}
		os.Exit(2)
	}
	fmt.Println("migrations applied successfully")
}

var errMissingDSN = errors.New("DATABASE_URL is required")

func runMigrate(dsn string) error {
	if dsn == "" {
		return errMissingDSN
	}
	migrator := database.NewMigrator(dsn)
	if err := migrator.Up(); err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Update the test to use sentinel error**

Replace the assertion in `main_test.go`:
```go
	err := runMigrate("")
	if !errors.Is(err, errMissingDSN) {
		t.Fatalf("expected errMissingDSN, got %v", err)
	}
```

Add import: `"errors"`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && go test ./cmd/migrate/... -v`
Expected: `PASS: TestExitsOnMissingDSN` (one test, PASS)

- [ ] **Step 6: Verify `go build` compiles the binary**

Run: `cd backend && go build -o /tmp/migrate ./cmd/migrate`
Expected: exit 0, binary produced at `/tmp/migrate`. Delete with `rm /tmp/migrate`.

- [ ] **Step 7: Commit**

```bash
git add backend/cmd/migrate/main.go backend/cmd/migrate/main_test.go
git commit -m "feat(backend): add cmd/migrate one-shot migration binary

Wraps the existing database.Migrator with a production entry point.
Used by the deploy/docker-compose.prod-app.yml migrate service which
runs once before backend starts on each app node. See spec:
docs/superpowers/specs/2026-04-11-hostinger-production-bootstrap-design.md"
```

---

### Task 0.3: Write backend multi-stage Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Write .dockerignore first**

Create `backend/.dockerignore`:
```
**/*.md
**/*_test.go
**/testdata/
.git
.gitignore
coverage/
*.out
tests/

# Windows dev artifacts that sometimes live under backend/ on the
# workstation — do NOT ship into the build context.
*.exe
*.exe~
*.log
*.sh
_cobolt-output/
frontend/

# Seed SQL contains test-user fixtures with known passwords per
# AGENTS.md M7.5 platform roles. Integration tests consume it via
# go test, but prod images must not include it. seeds/ is NOT
# referenced by any go:embed directive (verified), so excluding it
# only trims the build context; the binary is unaffected.
seeds/

# NOTE: migrations/*.sql is NOT excluded — it is required at build
# time by backend/internal/database/database.go line 16's
# //go:embed migrations/*.sql directive. The .sql files get compiled
# into the binary; excluding them would break `go build`.
```

- [ ] **Step 2: Write the Dockerfile**

Create `backend/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
# Pinned to the minor-patch of go.mod (1.26.2). Floating tag
# 'golang:1.26-alpine' would silently drift on every patch release and
# produce compiler-mismatched builds across machines.
FROM golang:1.26.2-alpine AS build

# git + ca-certs needed for go mod download of pinned deps over https
RUN apk add --no-cache git ca-certificates

WORKDIR /src

# Cache deps: copy go.mod/go.sum first so layer is reused across code changes
COPY go.mod go.sum ./
RUN go mod download

# Now copy the rest of the backend source
COPY . .

# Build BOTH binaries with the same toolchain / same vendored deps.
# CGO off ⇒ static binary, works on scratch-like runtime.
# -trimpath strips local filesystem paths from stack traces.
# -ldflags '-s -w' strips symbol + debug tables (smaller image).
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags='-s -w' -o /out/api     ./cmd/api
RUN go build -trimpath -ldflags='-s -w' -o /out/migrate ./cmd/migrate

# ---------- runtime stage ----------
# Pinned to a specific alpine patch for reproducibility.
FROM alpine:3.20.3 AS runtime

# Runtime dependencies:
# - ca-certificates, tzdata: outbound TLS + Asia/Kolkata TZ
# - curl: container HEALTHCHECK
# - libwebp-tools: provides `cwebp`. REQUIRED by thumbnail_service.go which
#   shells out to cwebp via exec.CommandContext to produce WebP derivatives.
#   Per AGENTS.md ("Every uploaded image MUST produce WebP derivatives") this
#   binary is non-negotiable — the image is broken without it.
# - ffmpeg: used by processing_pipeline.go:tryVideoThumbnail for video poster
#   frame extraction. Graceful-degrade in code, but we ship it for feature
#   parity with the pre-existing Dockerfile (commit c481200).
RUN apk add --no-cache ca-certificates tzdata curl libwebp-tools ffmpeg

# Non-root user — drops privileges even if the binary is exploited
RUN addgroup -S rawdrive && adduser -S -G rawdrive rawdrive

# Copy both binaries
COPY --from=build /out/api     /usr/local/bin/api
COPY --from=build /out/migrate /usr/local/bin/migrate

USER rawdrive
WORKDIR /home/rawdrive

# Listen on 8080 inside the container. nginx upstream points here.
EXPOSE 8080

# Healthcheck: containers get marked unhealthy if the API stops responding.
# Compose reads this and nginx peer-backup failover uses the docker-dns
# resolver to notice.
# start-period=30s gives the Go API enough headroom to open its Postgres
# pgxpool, subscribe to NATS JetStream, and connect to Valkey on cold start.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/v1/health || exit 1

# Default command is the API. The migrate service overrides with
# `command: ["/usr/local/bin/migrate"]` in docker-compose.prod-app.yml.
CMD ["/usr/local/bin/api"]
```

- [ ] **Step 3: Validate the Dockerfile builds locally**

Run: `docker build -t rawdrive-backend:local ./backend`
Expected: build succeeds; final image ~200–260 MB (the ffmpeg package is ~100 MB).

Run: `MSYS_NO_PATHCONV=1 docker run --rm rawdrive-backend:local /usr/local/bin/migrate 2>&1 | head -5`
Expected: `DATABASE_URL is required` (exit code 1 from Task 0.2 logic). The `MSYS_NO_PATHCONV=1` prefix is only required on Git Bash for Windows — without it, the shell translates `/usr/local/bin/migrate` into a Windows path before passing to Docker.

Also verify both media tools are on PATH:
```bash
docker run --rm --entrypoint sh rawdrive-backend:local -c 'which cwebp && which ffmpeg'
```
Expected: `/usr/bin/cwebp` and `/usr/bin/ffmpeg` printed.

- [ ] **Step 4: Clean up test image**

Run: `docker rmi rawdrive-backend:local`

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "build(backend): add multi-stage Dockerfile producing api and migrate binaries"
```

---

### Task 0.4: Write frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`

- [ ] **Step 1: Write .dockerignore**

Create `frontend/.dockerignore`:
```
node_modules
.next
.git
.env.local
.env.*.local
coverage
*.log
tests/
```

- [ ] **Step 2: Write the Dockerfile**

Create `frontend/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- deps stage ----------
# Cached on package.json + lockfile changes.
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy only the lockfile + package manifest for cache efficiency.
COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./

# Use whichever lockfile exists. pnpm is the documented tool in
# frontend/AGENTS.md, so it's the happy path; npm fallback is defensive.
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else echo "no lockfile found" && exit 1; fi

# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Copy fully-installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy the rest of the app source
COPY . .

# Disable Next.js telemetry; it phones home unless suppressed.
ENV NEXT_TELEMETRY_DISABLED=1

# next.config.ts already sets `output: 'standalone'` (Task 0.1)
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm build; \
  else npm run build; fi

# ---------- runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# Next.js 16 standalone output: copy the standalone dir, then manually
# copy public/ and .next/static/ — those are NOT auto-copied. Verified
# against frontend/node_modules/next/dist/docs/01-app/03-api-reference/
# 05-config/01-next-config-js/output.md (Next.js 16.2.2 shipped docs).
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

# Next.js 16 standalone ships a minimal server.js at the root.
CMD ["node", "server.js"]
```

- [ ] **Step 3: Validate build**

Run: `cd frontend && docker build -t rawdrive-frontend:local .`
Expected: build succeeds; final image ~200–300 MB.

- [ ] **Step 4: Clean up**

Run: `docker rmi rawdrive-frontend:local`

- [ ] **Step 5: Commit**

```bash
git add frontend/Dockerfile frontend/.dockerignore
git commit -m "build(frontend): add multi-stage Next.js 16 standalone Dockerfile"
```

---

### Task 0.5: Write Postgres configuration files

**Files:**
- Create: `deploy/postgres/postgresql.conf`
- Create: `deploy/postgres/pg_hba.conf`
- Create: `deploy/postgres/init/01-create-extensions.sql`
- Create: `deploy/postgres/init/02-create-replication-role.sql`

- [ ] **Step 1: Write postgresql.conf**

Create `deploy/postgres/postgresql.conf`:
```conf
# PostgreSQL 17 tuning for Hostinger 8 GB / 2 vCPU KVM
# Derived from spec §3.3 table.
# This file is mounted into pgvector/pgvector:pg17 via docker-compose.

listen_addresses = '*'
port = 5432
max_connections = 100

# Memory
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 512MB
wal_buffers = 64MB

# WAL / replication (primary; replica overrides with hot_standby=on)
wal_level = replica
max_wal_senders = 5
max_replication_slots = 5
wal_keep_size = 1GB
synchronous_commit = on

# Query planning
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging — structured, short retention
log_destination = 'stderr'
logging_collector = off
log_min_duration_statement = 500
log_line_prefix = '%m [%p] %q%u@%d '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
log_statement = 'ddl'

# pg_stat_statements — required for observability follow-up
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.max = 10000
pg_stat_statements.track = all

# Timezone
timezone = 'Asia/Kolkata'
log_timezone = 'Asia/Kolkata'

# Autovacuum — more aggressive than default to keep bloat down at 10k users
autovacuum = on
autovacuum_max_workers = 4
autovacuum_naptime = 30s
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05
```

- [ ] **Step 2: Write pg_hba.conf**

Create `deploy/postgres/pg_hba.conf`:
```conf
# PostgreSQL Client Authentication
# =================================
# Restricted to: app-node IPs (.42, .44), replication from .44, local docker.

# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Unix socket for container-local maintenance
local   all             all                                     trust

# Docker internal bridge network (localhost inside container)
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256

# App node 1 (.42) — via pgbouncer to backend
host    rawdrive        rawdrive        187.127.142.42/32       scram-sha-256

# App node 2 (.44) — via pgbouncer to backend AND replication slot to replica
host    rawdrive        rawdrive        187.127.142.44/32       scram-sha-256
host    replication     replicator      187.127.142.44/32       scram-sha-256

# Everything else denied by absence of rule.
```

- [ ] **Step 3: Write extension init script**

Create `deploy/postgres/init/01-create-extensions.sql`:
```sql
-- Initial database extension setup.
-- Runs on first container boot via
-- pgvector/pgvector:pg17's /docker-entrypoint-initdb.d/.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- used by backend for uuid_generate_v4 alternatives
```

- [ ] **Step 4: Write replication role init script**

Create `deploy/postgres/init/02-create-replication-role.sql`:
```sql
-- Replication role for the .44 hot standby.
-- Password is substituted at compose time via POSTGRES_REPLICATION_PASSWORD
-- env var picked up by the init script. See docker-compose.prod-db.yml.

-- We cannot use :'var' substitution here because the init.d scripts run
-- as SQL, not psql. Instead, a thin init script wrapper writes the
-- password before invoking this file. See deploy/scripts/init-replicator.sh
-- (generated at runtime — not committed).

-- This file is intentionally a template that gets sed-replaced at
-- startup. The real implementation uses a shell init script that
-- writes the CREATE ROLE + password then invokes psql. We'll patch
-- this via a companion .sh init script instead:

-- Placeholder — actual role creation happens in 02-create-replication-role.sh
SELECT 1;
```

Delete this file — it's the wrong approach. Replace with a shell init script:

Delete: `deploy/postgres/init/02-create-replication-role.sql`

- [ ] **Step 5: Write replication role init script (shell, so env var works)**

Create `deploy/postgres/init/02-create-replication-role.sh`:
```bash
#!/bin/sh
# Create the replication role used by .44 standby.
# Runs after 01-create-extensions.sql via pgvector image's
# /docker-entrypoint-initdb.d/ scanner. Password from env.

set -euo pipefail

if [ -z "${POSTGRES_REPLICATION_PASSWORD:-}" ]; then
  echo "FATAL: POSTGRES_REPLICATION_PASSWORD env var required for replica init" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '${POSTGRES_REPLICATION_PASSWORD}';
  SELECT pg_create_physical_replication_slot('replica_44');
SQL
```

- [ ] **Step 6: Commit**

```bash
git add deploy/postgres/
git commit -m "infra(deploy): add Postgres 17 tuning, pg_hba, and init scripts

- postgresql.conf tuned for 8 GB / 2 vCPU boxes
- pg_hba.conf restricts access to .42/.44 and replicator from .44
- 01-create-extensions.sql: pgvector + pg_stat_statements + pgcrypto
- 02-create-replication-role.sh: creates replicator role + slot"
```

---

### Task 0.6: Write Valkey configuration files

**Files:**
- Create: `deploy/valkey/valkey.conf`
- Create: `deploy/valkey/valkey-replica.conf`

- [ ] **Step 1: Write primary config**

Create `deploy/valkey/valkey.conf`:
```conf
# Valkey 9 primary (on .46)
# Persistence: AOF (durable, slower write path than RDB but survives crash).

bind 0.0.0.0
port 6379
protected-mode yes

# Password loaded from environment via ${VALKEY_PASSWORD} in the Compose
# service command. Do NOT put the password here — this file is committed.
# The actual `requirepass` comes from the `--requirepass $VALKEY_PASSWORD`
# command-line arg on container start.

# Networking
tcp-backlog 511
tcp-keepalive 300
timeout 0

# Memory
maxmemory 400mb
maxmemory-policy allkeys-lru

# AOF persistence
appendonly yes
appendfilename "valkey.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Disable RDB — AOF is authoritative
save ""

# Replication: primary allows read-write, broadcasts to replicas
replica-read-only yes

# Logging
loglevel notice
logfile ""  # stderr via docker logs

# Slow query log
slowlog-log-slower-than 10000
slowlog-max-len 128
```

- [ ] **Step 2: Write replica config**

Create `deploy/valkey/valkey-replica.conf`:
```conf
# Valkey 9 replica (on .42)
# Reads from primary on .46, acts as hot standby for failover.

bind 0.0.0.0
port 6379
protected-mode yes

# Same memory budget as primary (so promotion is drop-in)
maxmemory 400mb
maxmemory-policy allkeys-lru

# Replica points at primary. Primary address + password come from the
# Compose `command` line — replicaof/primary-user/primary-auth are passed
# as --replicaof, --masterauth args at startup.

# Persistence: AOF so a promoted replica keeps data
appendonly yes
appendfilename "valkey.aof"
appendfsync everysec

save ""

replica-read-only yes
replica-serve-stale-data yes

loglevel notice
logfile ""
```

- [ ] **Step 3: Commit**

```bash
git add deploy/valkey/
git commit -m "infra(deploy): add Valkey 9 primary and replica configs with AOF"
```

---

### Task 0.7: Write PgBouncer configuration files

**Files:**
- Create: `deploy/pgbouncer/pgbouncer.ini`
- Create: `deploy/pgbouncer/databases.ini`
- Create: `deploy/pgbouncer/userlist.txt.example` (real userlist.txt is generated on server)

- [ ] **Step 1: Write pgbouncer.ini**

Create `deploy/pgbouncer/pgbouncer.ini`:
```ini
; PgBouncer 1.23 transaction-mode pooler
; Runs on each app node (.42 and .44), not on .46.
; Backend connects to 127.0.0.1:6432 → pgbouncer → wherever databases.ini points.

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432

; Authenticated against userlist.txt (SCRAM-SHA-256).
; pgbouncer 1.23 supports scram-sha-256; MD5 is dead and should never be
; used for new deployments. userlist.txt format for SCRAM is the literal
; SCRAM verifier from pg_authid.rolpassword, not an MD5 hash.
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

; Transaction-mode pooling: server connections are returned to the pool
; at the end of every transaction. Cheap pool rotation. Required to
; support 200+ client conns against Postgres max_connections=100.
pool_mode = transaction

; Limits
max_client_conn = 500
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3

; Server connections are dropped if idle > this many seconds
server_idle_timeout = 600

; Timeouts
query_timeout = 30
server_lifetime = 3600
server_reset_query = DISCARD ALL

; Logging
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1

; Admin (not exposed publicly)
admin_users = rawdrive
stats_users = rawdrive

; Prepared statements: transaction pooling doesn't support server-side
; prepared statements. Backend must either disable them or use
; pgx's DescribeOnly mode. Already handled in backend pgxpool config
; (standard pattern — no prepared statement cache in pool).
```

- [ ] **Step 2: Write databases.ini (initial state: primary on .46)**

Create `deploy/pgbouncer/databases.ini`:
```ini
; PgBouncer database routing.
; THIS FILE CHANGES DURING FAILOVER. When Postgres primary moves from
; .46 to .44, the `host=` value here gets rewritten and pgbouncer is
; reloaded with SIGHUP. See docs/runbooks/postgres-failover.md.

[databases]
rawdrive = host=187.127.142.46 port=5432 dbname=rawdrive auth_user=rawdrive
```

- [ ] **Step 3: Write userlist template**

Create `deploy/pgbouncer/userlist.txt.example`:
```
; PgBouncer userlist.txt format (SCRAM-SHA-256):
;   "username" "<literal contents of pg_authid.rolpassword>"
;
; For SCRAM, the second field is the full SCRAM verifier string as stored
; in Postgres, which looks like:
;   SCRAM-SHA-256$<iter>:<salt>$<stored_key>:<server_key>
;
; You extract it with:
;   psql -h <pg-host> -U rawdrive -d rawdrive \
;     -tAc "SELECT rolpassword FROM pg_authid WHERE rolname='rawdrive';"
;
; Example (NOT real creds):
;   "rawdrive" "SCRAM-SHA-256$4096:abc==$xyz:qrs"
;
; This file is generated on the server during Phase C from the primary's
; pg_authid. NEVER commit the real userlist.txt.
```

- [ ] **Step 4: Commit**

```bash
git add deploy/pgbouncer/
git commit -m "infra(deploy): add PgBouncer transaction-mode pooler config

databases.ini intentionally points at current primary host and is
mutated during Postgres failover (see postgres-failover.md runbook)."
```

---

### Task 0.8: Write NATS cluster configuration

**Files:**
- Create: `deploy/nats/nats-server.conf`

- [ ] **Step 1: Write the 3-node cluster config**

Create `deploy/nats/nats-server.conf`:
```conf
# NATS JetStream 3-node cluster across the three VPSes.
# All three nodes run identical config; the Compose file sets the
# server_name via -n flag at container start.

# Client port
port: 4222

# HTTP monitoring port (internal only, firewalled from public)
http_port: 8222

# JetStream: durable streams for background work (image derivs, email,
# face detection). Raft quorum requires all 3 nodes online for writes;
# tolerates 1 node failure for reads.
jetstream {
  store_dir: /data/jetstream
  max_memory_store: 256M
  max_file_store: 8G
}

# Cluster topology — each node connects to the other two
cluster {
  name: rawdrive-nats
  port: 6222
  routes: [
    nats-route://187.127.142.42:6222
    nats-route://187.127.142.44:6222
    nats-route://187.127.142.46:6222
  ]
  # Cluster-level auth (not public client auth); generated per-deploy
  # from NATS_CLUSTER_SEED env var in Compose file.
}

# Logging
debug: false
trace: false
logtime: true

# System account for internal ops (JetStream coordination)
system_account: $SYS

# Client connection limits
max_connections: 1000
max_payload: 4MB

# Graceful shutdown
write_deadline: "10s"
```

- [ ] **Step 2: Commit**

```bash
git add deploy/nats/
git commit -m "infra(deploy): add NATS JetStream 3-node cluster config"
```

---

### Task 0.9: Write nginx configuration

**Files:**
- Create: `deploy/nginx/nginx.conf`
- Create: `deploy/nginx/templates/rawdrive.conf.template`

- [ ] **Step 1: Write main nginx.conf**

Create `deploy/nginx/nginx.conf`:
```nginx
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Docker DNS resolver — enables dynamic upstream resolution so we can
    # reference container names and peer IPs that resolve at runtime.
    resolver 127.0.0.11 valid=10s ipv6=off;
    resolver_timeout 5s;

    # Logging — JSON for future log shipping
    log_format json_combined escape=json
      '{'
        '"time":"$time_iso8601",'
        '"remote_addr":"$remote_addr",'
        '"method":"$request_method",'
        '"uri":"$request_uri",'
        '"status":$status,'
        '"bytes":$body_bytes_sent,'
        '"referer":"$http_referer",'
        '"ua":"$http_user_agent",'
        '"req_time":$request_time,'
        '"ups_time":"$upstream_response_time",'
        '"ups_addr":"$upstream_addr",'
        '"ups_status":"$upstream_status",'
        '"cf_ray":"$http_cf_ray",'
        '"cf_ip":"$http_cf_connecting_ip"'
      '}';

    access_log /var/log/nginx/access.log json_combined buffer=64k flush=5s;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens off;

    client_max_body_size 128m;  # photo uploads go direct to R2, but API payloads can be large
    client_body_timeout 60s;
    client_header_timeout 10s;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss
               application/atom+xml image/svg+xml font/woff2;

    # Rate limiting zones (spec: 100 req/s API, 30 req/min auth)
    limit_req_zone $binary_remote_addr zone=api_rate:10m rate=100r/s;
    limit_req_zone $binary_remote_addr zone=auth_rate:10m rate=30r/m;

    # Security headers (applied in site conf)
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    # Include the templated site config (envsubst applied at container start)
    include /etc/nginx/conf.d/*.conf;
}
```

- [ ] **Step 2: Write site template**

Create `deploy/nginx/templates/rawdrive.conf.template`:
```nginx
# Site template — $PEER_NODE_IP is substituted via envsubst on container
# start. See deploy/docker-compose.prod-app.yml nginx service command.

# Upstream: backend API
# Primary is local container; backup is peer node's backend on its
# published port 8080 (peer-only UFW rule permits this).
upstream backend_upstream {
    zone backend_upstream 64k;
    server backend:8080 max_fails=2 fail_timeout=10s;
    server ${PEER_NODE_IP}:8080 backup max_fails=2 fail_timeout=10s;
    keepalive 32;
}

# Upstream: frontend (Next.js)
upstream frontend_upstream {
    zone frontend_upstream 64k;
    server frontend:3000 max_fails=2 fail_timeout=10s;
    server ${PEER_NODE_IP}:3000 backup max_fails=2 fail_timeout=10s;
    keepalive 16;
}

# HTTP → HTTPS redirect + ACME webroot challenge (Phase C only)
server {
    listen 80;
    listen [::]:80;
    server_name rawdrive.in www.rawdrive.in api.rawdrive.in;

    # ACME http-01 challenge (used once in Phase C and then during
    # renewal windows if we ever flip back from DNS-01)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }

    # Everything else: 301 to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# Main HTTPS server for rawdrive.in + www
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name rawdrive.in www.rawdrive.in;

    ssl_certificate     /etc/letsencrypt/live/rawdrive.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rawdrive.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Cross-Origin-Opener-Policy "unsafe-none" always;
    add_header Cross-Origin-Embedder-Policy "unsafe-none" always;

    # www → apex redirect
    if ($host = www.rawdrive.in) {
        return 301 https://rawdrive.in$request_uri;
    }

    # Next.js static assets — long cache
    location /_next/static/ {
        proxy_pass http://frontend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=31536000, immutable";
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }

    # API proxied through the frontend origin (rawdrive.in/api/*) — backend
    location /api/ {
        limit_req zone=api_rate burst=200 nodelay;
        proxy_pass http://backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }

    # Auth endpoints get a tighter rate limit
    location ~ ^/api/v1/auth/(login|register|password/(forgot|reset)) {
        limit_req zone=auth_rate burst=10 nodelay;
        proxy_pass http://backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }

    # Everything else: Next.js
    location / {
        proxy_pass http://frontend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 60s;
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }
}

# api.rawdrive.in — dedicated subdomain for the backend
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name api.rawdrive.in;

    ssl_certificate     /etc/letsencrypt/live/rawdrive.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rawdrive.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        limit_req zone=api_rate burst=200 nodelay;
        proxy_pass http://backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add deploy/nginx/
git commit -m "infra(deploy): add nginx main config + HA site template

Template uses \${PEER_NODE_IP} for envsubst at container start.
proxy_next_upstream fails over from local primary to peer backup on
error/timeout/502/503/504."
```

---

### Task 0.10: Write docker-compose.prod-db.yml

**Files:**
- Create: `deploy/docker-compose.prod-db.yml`

- [ ] **Step 1: Write the Compose file**

Create `deploy/docker-compose.prod-db.yml`:
```yaml
# Docker Compose for VPS 3 (DB node, 187.127.142.46).
# Runs: Postgres primary, Valkey primary, NATS cluster member 3.
# PgBouncer is NOT here — it runs on the app nodes (see prod-app.yml).

name: rawdrive-db

services:
  postgres:
    image: pgvector/pgvector:pg17
    container_name: deploy-postgres-1
    restart: unless-stopped
    command:
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf
      - -c
      - hba_file=/etc/postgresql/pg_hba.conf
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_REPLICATION_PASSWORD: ${POSTGRES_REPLICATION_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - ./postgres/pg_hba.conf:/etc/postgresql/pg_hba.conf:ro
      - ./postgres/init:/docker-entrypoint-initdb.d:ro
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"

  valkey:
    image: valkey/valkey:9.0-alpine
    container_name: deploy-valkey-1
    restart: unless-stopped
    command:
      - valkey-server
      - /etc/valkey/valkey.conf
      - --requirepass
      - ${VALKEY_PASSWORD}
    volumes:
      - valkey_data:/data
      - ./valkey/valkey.conf:/etc/valkey/valkey.conf:ro
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD-SHELL", "valkey-cli -a $${VALKEY_PASSWORD} ping | grep -q PONG"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"

  nats:
    image: nats:2.11-alpine
    container_name: deploy-nats-1
    restart: unless-stopped
    command:
      - -c
      - /etc/nats/nats-server.conf
      - -n
      - nats-3
      - -cluster_name
      - rawdrive-nats
    volumes:
      - nats_data:/data
      - ./nats/nats-server.conf:/etc/nats/nats-server.conf:ro
    ports:
      - "4222:4222"
      - "6222:6222"
      - "8222:8222"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8222/healthz"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"

volumes:
  postgres_data:
    driver: local
  valkey_data:
    driver: local
  nats_data:
    driver: local
```

- [ ] **Step 2: Validate compose syntax**

Run: `docker compose -f deploy/docker-compose.prod-db.yml config --quiet`
Expected: exit 0, no output. (May warn about missing env vars — that's fine, they're set at server runtime from `.env`.)

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.prod-db.yml
git commit -m "infra(deploy): add docker-compose.prod-db.yml for DB node stack"
```

---

### Task 0.11: Write docker-compose.prod-app.yml

**Files:**
- Create: `deploy/docker-compose.prod-app.yml`

- [ ] **Step 1: Write the Compose file**

Create `deploy/docker-compose.prod-app.yml`:
```yaml
# Docker Compose for VPS 1 & VPS 2 (App nodes 187.127.142.42 and .44).
# Runs: pgbouncer, backend, frontend, worker, nginx, NATS cluster member,
# plus a replica (valkey on .42, postgres on .44).
#
# The NODE_NAME env var (set in deploy/.env) distinguishes which node
# this is running on — used by nats -n and by the optional replica services.

name: rawdrive-app

services:
  # One-shot migration runner — must exit 0 before backend starts.
  # Only actually gets invoked on first deploy to a node; Compose handles
  # the "exit 0 means success" semantics via depends_on condition.
  migrate:
    build:
      context: ../backend
      dockerfile: Dockerfile
    image: rawdrive-backend:local
    container_name: deploy-migrate-1
    command: ["/usr/local/bin/migrate"]
    env_file:
      - /opt/rawdrive/app/.env
    restart: "no"
    depends_on: []
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  pgbouncer:
    image: edoburu/pgbouncer:latest
    container_name: deploy-pgbouncer-1
    restart: unless-stopped
    ports:
      - "127.0.0.1:6432:6432"
    volumes:
      - ./pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
      - ./pgbouncer/databases.ini:/etc/pgbouncer/databases.ini:ro
      - /opt/rawdrive/app/deploy/pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt:ro
    environment:
      - DATABASE_URL  # passed through for some edoburu image variants
    healthcheck:
      test: ["CMD-SHELL", "nc -z 127.0.0.1 6432 || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 5
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"

  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    image: rawdrive-backend:local
    container_name: deploy-backend-1
    restart: unless-stopped
    command: ["/usr/local/bin/api"]
    env_file:
      - /opt/rawdrive/app/.env
    ports:
      - "8080:8080"  # exposed for peer failover from the OTHER app node
    depends_on:
      pgbouncer:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8080/api/v1/health"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 20s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"

  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
    image: rawdrive-frontend:local
    container_name: deploy-frontend-1
    restart: unless-stopped
    env_file:
      - /opt/rawdrive/app/.env
    ports:
      - "3000:3000"  # exposed for peer failover
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"

  worker:
    # Worker stub — same image as backend, different command.
    # IMPORTANT: current backend may not have a separate worker entry
    # point. Phase 0 Task 0.11 verifies; if absent, this service is
    # commented out at runtime and image processing runs inline in api.
    image: rawdrive-backend:local
    container_name: deploy-worker-1
    restart: unless-stopped
    command: ["/usr/local/bin/api", "--mode=worker"]
    env_file:
      - /opt/rawdrive/app/.env
    depends_on:
      backend:
        condition: service_healthy
    profiles:
      - worker  # optional — start with `docker compose --profile worker up`
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"

  nats:
    image: nats:2.11-alpine
    container_name: deploy-nats-1
    restart: unless-stopped
    command:
      - -c
      - /etc/nats/nats-server.conf
      - -n
      - ${NATS_NODE_NAME}  # "nats-1" on .42, "nats-2" on .44
    volumes:
      - nats_data:/data
      - ./nats/nats-server.conf:/etc/nats/nats-server.conf:ro
    ports:
      - "4222:4222"
      - "6222:6222"
      - "8222:8222"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8222/healthz"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Valkey replica — only started on .42 via profile
  valkey-replica:
    image: valkey/valkey:9.0-alpine
    container_name: deploy-valkey-replica-1
    restart: unless-stopped
    command:
      - valkey-server
      - /etc/valkey/valkey-replica.conf
      - --replicaof
      - 187.127.142.46
      - "6379"
      - --masterauth
      - ${VALKEY_PASSWORD}
      - --requirepass
      - ${VALKEY_PASSWORD}
    volumes:
      - valkey_replica_data:/data
      - ./valkey/valkey-replica.conf:/etc/valkey/valkey-replica.conf:ro
    profiles:
      - valkey-replica  # only .42 uses this

  # Postgres replica — only started on .44 via profile
  postgres-replica:
    image: pgvector/pgvector:pg17
    container_name: deploy-postgres-replica-1
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_replica_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"  # only peer-open, UFW blocks public
    profiles:
      - postgres-replica  # only .44 uses this

  nginx:
    image: nginx:1.27-alpine
    container_name: deploy-nginx-1
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_healthy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/templates/rawdrive.conf.template:/etc/nginx/templates/rawdrive.conf.template:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro
      - nginx_cache:/var/cache/nginx
    environment:
      - PEER_NODE_IP=${PEER_NODE_IP}
    command: /bin/sh -c "envsubst '$${PEER_NODE_IP}' < /etc/nginx/templates/rawdrive.conf.template > /etc/nginx/conf.d/rawdrive.conf && exec nginx -g 'daemon off;'"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/nginx-health"]
      interval: 10s
      timeout: 3s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "10"

volumes:
  nats_data:
    driver: local
  valkey_replica_data:
    driver: local
  postgres_replica_data:
    driver: local
  nginx_cache:
    driver: local
```

- [ ] **Step 2: Validate**

Run: `docker compose -f deploy/docker-compose.prod-app.yml config --quiet`
Expected: exit 0, config is valid.

- [ ] **Step 3: Inspect backend code for worker mode**

Run: `grep -rn 'mode.*worker\|WorkerMode\|runWorker' backend/cmd/api/ 2>&1 | head -20`

If no matches: The `worker` service will not start (profile not activated). Image processing runs inline in the `api` binary. Document this as a follow-up in the phase E summary; no code change here.

If matches exist: The `worker` profile will be activated in Phase C with `--profile worker`.

- [ ] **Step 4: Commit**

```bash
git add deploy/docker-compose.prod-app.yml
git commit -m "infra(deploy): add docker-compose.prod-app.yml for app node stack

Includes one-shot migrate service, pgbouncer, backend, frontend, nginx,
NATS cluster member, plus optional valkey-replica (.42 only) and
postgres-replica (.44 only) behind Compose profiles."
```

---

### Task 0.12: Write deployment scripts

**Files:**
- Create: `deploy/scripts/deploy-app.sh`
- Create: `deploy/scripts/renew-ssl.sh`
- Create: `deploy/scripts/backup-db.sh`
- Create: `deploy/scripts/promote-postgres-replica.sh`

- [ ] **Step 1: Write backup-db.sh (the most critical one)**

Create `deploy/scripts/backup-db.sh`:
```bash
#!/usr/bin/env bash
# Nightly Postgres backup → symmetric-GPG-encrypted → Cloudflare R2 via rclone.
# Runs on .46 via cron 0 2 * * *.
# Exits non-zero on any failure so cron mails root.
#
# Security: the R2 API keys in the doc grant read access to this bucket, so
# an attacker with leaked R2 creds would otherwise walk out with a plaintext
# DB dump. Symmetric GPG with a passphrase stored ONLY in
# /opt/rawdrive/app/.env (BACKUP_GPG_PASSPHRASE) provides a second lock —
# stealing R2 creds alone is not enough to read the backups.

set -euo pipefail

BACKUP_DIR=/opt/rawdrive/backups
RCLONE_REMOTE="r2:rawdrive-backups"
RETAIN_DAYS=7  # local only — R2 lifecycle handles longer retention

: "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE not set — source /opt/rawdrive/app/.env before running}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP="$BACKUP_DIR/rawdrive_${STAMP}.dump.gpg"
LOG="$BACKUP_DIR/backup.log"

log() {
    echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"
}

log "starting pg_dump → gpg → $DUMP"
docker exec deploy-postgres-1 \
    pg_dump \
    -U "${POSTGRES_USER:-rawdrive}" \
    -d "${POSTGRES_DB:-rawdrive}" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    | gpg --batch --yes --passphrase "$BACKUP_GPG_PASSPHRASE" \
          --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 \
          --s2k-count 65011712 \
          --output "$DUMP"

SIZE=$(stat -c %s "$DUMP")
if [ "$SIZE" -lt 1024 ]; then
    log "FATAL: dump too small ($SIZE bytes) — refusing to upload"
    exit 1
fi
log "encrypted dump size: $SIZE bytes"

log "uploading to R2: $RCLONE_REMOTE/daily/"
rclone copy "$DUMP" "$RCLONE_REMOTE/daily/" --progress

log "verifying remote copy exists"
REMOTE_NAME=$(basename "$DUMP")
rclone lsf "$RCLONE_REMOTE/daily/" | grep -q "^${REMOTE_NAME}$" \
    || { log "FATAL: remote verification failed"; exit 2; }

log "cleaning local dumps older than $RETAIN_DAYS days"
find "$BACKUP_DIR" -name 'rawdrive_*.dump.gpg' -mtime +$RETAIN_DAYS -delete

log "backup complete: $REMOTE_NAME"
```

- [ ] **Step 2: Write renew-ssl.sh**

Create `deploy/scripts/renew-ssl.sh`:
```bash
#!/usr/bin/env bash
# Let's Encrypt cert renewal via certbot.
# Runs on both app nodes via cron 0 3,15 * * *.
# Dual-mode: webroot HTTP-01 (initial) and dns-01 via Cloudflare (post orange-cloud flip).

set -euo pipefail

LOG=/var/log/certbot-renew.log
MODE="${CERTBOT_MODE:-webroot}"  # or "dns-01"

log() {
    echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"
}

log "starting cert renewal (mode=$MODE)"

case "$MODE" in
    webroot)
        docker run --rm \
            -v /etc/letsencrypt:/etc/letsencrypt \
            -v /var/www/certbot:/var/www/certbot \
            certbot/certbot:latest \
            renew --webroot --webroot-path=/var/www/certbot --non-interactive
        ;;
    dns-01)
        docker run --rm \
            -v /etc/letsencrypt:/etc/letsencrypt \
            -v /etc/letsencrypt/cloudflare.ini:/etc/letsencrypt/cloudflare.ini:ro \
            certbot/certbot:latest \
            renew --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini --non-interactive
        ;;
    *)
        log "FATAL: unknown CERTBOT_MODE=$MODE"
        exit 1
        ;;
esac

log "reloading nginx"
docker exec deploy-nginx-1 nginx -s reload

log "cert renewal complete"
```

- [ ] **Step 3: Write deploy-app.sh**

Create `deploy/scripts/deploy-app.sh`:
```bash
#!/usr/bin/env bash
# Rolling app deploy driver — run from a local workstation.
# Usage: ./deploy-app.sh <node-ip>
# Pushes source, rebuilds images, rolls containers with health gates.

set -euo pipefail

NODE_IP="${1:-}"
if [ -z "$NODE_IP" ]; then
    echo "usage: $0 <node-ip>" >&2
    exit 1
fi

echo "==> pushing source to $NODE_IP"
tar --exclude=node_modules --exclude=.git --exclude=.next \
    --exclude='deploy/.env' --exclude='.env*' -cf - . \
    | ssh "root@$NODE_IP" 'tar -xf - -C /opt/rawdrive/app'

echo "==> building images on $NODE_IP"
ssh "root@$NODE_IP" \
    'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml build --no-cache'

echo "==> rolling up (respects dependency order: pgbouncer → migrate → backend → frontend → nginx)"
ssh "root@$NODE_IP" \
    'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d'

echo "==> verifying health"
ssh "root@$NODE_IP" 'curl -fsS http://127.0.0.1:8080/api/v1/health' \
    || { echo "backend health check failed on $NODE_IP"; exit 2; }

echo "==> deploy complete: $NODE_IP"
```

- [ ] **Step 4: Write promote-postgres-replica.sh**

Create `deploy/scripts/promote-postgres-replica.sh`:
```bash
#!/usr/bin/env bash
# Emergency: promote the .44 postgres replica to primary.
# Run on .44 after primary .46 is confirmed dead.
# Does NOT update pgbouncer — see docs/runbooks/postgres-failover.md
# for the full procedure including the pgbouncer databases.ini flip.

set -euo pipefail

echo "==> PRE-FLIGHT CHECKS"
docker exec deploy-postgres-replica-1 pg_isready -U rawdrive -d rawdrive \
    || { echo "FATAL: replica is not ready"; exit 1; }

echo "==> Current replication status (should show we are a standby):"
docker exec deploy-postgres-replica-1 \
    psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();" 2>&1

read -rp "Proceed with promotion? This is IRREVERSIBLE without rebuilding. [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Aborted."
    exit 1
fi

echo "==> Promoting replica"
docker exec deploy-postgres-replica-1 pg_ctl promote -D /var/lib/postgresql/data

echo "==> Verifying promotion"
sleep 3
docker exec deploy-postgres-replica-1 \
    psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();" 2>&1

echo "==> Promotion complete. NEXT STEPS:"
echo "  1. On .42: edit /opt/rawdrive/app/deploy/pgbouncer/databases.ini → host=187.127.142.44"
echo "  2. On .42: docker compose -f docker-compose.prod-app.yml restart pgbouncer"
echo "  3. On .44: edit /opt/rawdrive/app/deploy/pgbouncer/databases.ini → host=127.0.0.1"
echo "  4. On .44: docker compose -f docker-compose.prod-app.yml restart pgbouncer"
echo "  5. Verify writes work: curl https://api.rawdrive.in/api/v1/health/ready"
echo ""
echo "Full runbook: docs/runbooks/postgres-failover.md"
```

- [ ] **Step 5: Make all scripts executable and commit**

```bash
chmod +x deploy/scripts/*.sh
git add deploy/scripts/
git commit -m "infra(deploy): add backup, renewal, deploy, and failover scripts"
```

---

### Task 0.13: Write deploy/.env.example

**Files:**
- Create: `deploy/.env.example`

- [ ] **Step 1: Write the example file**

Create `deploy/.env.example`:
```bash
# RawDrive production environment — EXAMPLE FILE
# =================================================
# The real file at /opt/rawdrive/app/.env is generated on each server during
# Phase B/C. It is NOT committed. This file documents the full schema.

# --- Postgres (rotated during Phase B, stored in DB-node .env only) ---
POSTGRES_USER=rawdrive
POSTGRES_PASSWORD=<openssl rand -hex 24>
POSTGRES_DB=rawdrive
POSTGRES_REPLICATION_PASSWORD=<openssl rand -hex 24>

# --- Backup encryption (rotated during Phase B, stored in DB-node .env only) ---
# Used by /opt/rawdrive/backup-db.sh to symmetric-encrypt pg_dump output
# before upload to R2. Loss of this passphrase means the backups in R2
# are unrecoverable — store a copy in your password manager.
BACKUP_GPG_PASSPHRASE=<openssl rand -hex 32>

# --- Backend connection (app nodes only) ---
# Points at the LOCAL pgbouncer on 127.0.0.1:6432. Pgbouncer itself
# forwards to whatever host is listed in pgbouncer/databases.ini.
DATABASE_URL=postgresql://rawdrive:<POSTGRES_PASSWORD>@127.0.0.1:6432/rawdrive?sslmode=disable

# --- Valkey (rotated during Phase B) ---
VALKEY_PASSWORD=<openssl rand -hex 24>
VALKEY_URL=redis://:<VALKEY_PASSWORD>@187.127.142.46:6379

# --- Cloudflare R2 (from HostingerServerDetails.md — NOT rotated) ---
R2_BUCKET_NAME=rawdrive
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
R2_REGION=auto
R2_PUBLIC_URL=https://pub-<R2_PUBLIC_URL_HASH>.r2.dev
R2_ACCOUNT_ID=<R2_ACCOUNT_ID>

# --- SMTP (from HostingerServerDetails.md — NOT rotated) ---
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USERNAME=noreply@rawdrive.de
SMTP_PASSWORD=...
SMTP_FROM=RawDrive <noreply@rawdrive.de>

# --- NATS ---
NATS_URL=nats://localhost:4222
NATS_NODE_NAME=nats-1   # nats-1 on .42, nats-2 on .44, nats-3 on .46
NATS_CLUSTER_SEED=<openssl rand -hex 16>

# --- App config ---
JWT_SECRET=<openssl rand -hex 32>
APP_ENV=production
LOG_LEVEL=info
TZ=Asia/Kolkata

# --- MoonShot (from HostingerServerDetails.md — NOT rotated) ---
MOONSHOT_API_KEY=<MOONSHOT_API_KEY>

# --- Platform settings KEK (envelope encryption per AGENTS.md F-005) ---
PLATFORM_SETTINGS_KEK=<openssl rand -hex 32>

# === Deploy-time vars (written to deploy/.env separately) ===
# These are NEVER overwritten by the tar push.
PEER_NODE_IP=187.127.142.44   # on .42; set to .42 on .44; unused on .46
```

- [ ] **Step 2: Commit**

```bash
git add deploy/.env.example
git commit -m "infra(deploy): add documented .env schema

Real /opt/rawdrive/app/.env is generated per-server with rotated
internal secrets and never committed."
```

---

### Task 0.14: Write observability stub

**Files:**
- Create: `docker-compose.observability.yml.example`

- [ ] **Step 1: Write the stub file**

Create `docker-compose.observability.yml.example`:
```yaml
# EXAMPLE FILE — renamed .example to prevent accidental `up`.
# Observability stack stubs. Requires a Grafana Cloud / Datadog / self-hosted
# Prometheus+Grafana+Loki setup as a follow-up project.
#
# To use: cp docker-compose.observability.yml.example docker-compose.observability.yml,
# edit the env vars for your provider, then:
#   docker compose -f docker-compose.observability.yml up -d

name: rawdrive-observability

services:
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:v0.15.0
    container_name: rawdrive-postgres-exporter
    environment:
      DATA_SOURCE_NAME: "postgresql://rawdrive:${POSTGRES_PASSWORD}@postgres:5432/rawdrive?sslmode=disable"
    ports:
      - "127.0.0.1:9187:9187"

  redis-exporter:
    image: oliver006/redis_exporter:v1.66.0
    container_name: rawdrive-valkey-exporter
    environment:
      REDIS_ADDR: "redis://valkey:6379"
      REDIS_PASSWORD: "${VALKEY_PASSWORD}"
    ports:
      - "127.0.0.1:9121:9121"

  nats-exporter:
    image: natsio/prometheus-nats-exporter:0.14.0
    container_name: rawdrive-nats-exporter
    command: ["-varz", "-jsz=all", "http://nats:8222"]
    ports:
      - "127.0.0.1:7777:7777"
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.observability.yml.example
git commit -m "infra: add observability stack stub for follow-up wiring"
```

---

### Task 0.15: Final Phase 0 validation

- [ ] **Step 1: Verify all scaffolding files exist**

Run:
```bash
ls -la backend/cmd/migrate/main.go backend/Dockerfile frontend/Dockerfile \
    deploy/docker-compose.prod-db.yml deploy/docker-compose.prod-app.yml \
    deploy/nginx/nginx.conf deploy/nginx/templates/rawdrive.conf.template \
    deploy/postgres/postgresql.conf deploy/postgres/pg_hba.conf \
    deploy/valkey/valkey.conf deploy/pgbouncer/pgbouncer.ini \
    deploy/nats/nats-server.conf deploy/.env.example
```
Expected: all files present, none missing.

- [ ] **Step 2: Run backend test suite to confirm nothing regressed**

Run: `cd backend && go test ./... -count=1 -timeout 120s`
Expected: all tests pass. The new migrate package should have 1 passing test (from Task 0.2).

- [ ] **Step 3: Run frontend unit tests**

Run: `cd frontend && pnpm test`
Expected: existing test suite passes.

- [ ] **Step 4: Validate both compose files**

Run:
```bash
docker compose -f deploy/docker-compose.prod-db.yml config --quiet
docker compose -f deploy/docker-compose.prod-app.yml config --quiet
```
Expected: both exit 0.

- [ ] **Step 5: Git status should be clean**

Run: `git status`
Expected: nothing staged, nothing unstaged, working tree clean. All Phase 0 commits landed.

---

## Phase A — OS Baseline (all 3 nodes)

This phase runs the same commands on all three servers. Use the `SERVERS` shell array pattern below for parallel-safe execution from the local workstation.

### Task A.1: Verify initial state

- [ ] **Step 1: SSH smoke check on all three**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  echo "=== $ip ==="
  ssh -o BatchMode=yes root@$ip 'hostname; uptime; lsb_release -a 2>/dev/null | grep Description'
done
```
Expected: three blocks, each showing `srv1548...`, 7-day uptime, `Description: Ubuntu 24.04...`

- [ ] **Step 2: Confirm none already have Docker / /opt/rawdrive**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  ssh -o BatchMode=yes root@$ip 'which docker 2>/dev/null; ls /opt/rawdrive 2>/dev/null'
done
```
Expected: no output (Docker not installed, /opt/rawdrive does not exist). If ANY node shows existing Docker or /opt/rawdrive, STOP and investigate — we're no longer greenfield.

---

### Task A.2: Apt update and install baseline packages

- [ ] **Step 1: Apt update + upgrade**

Run on each server:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  echo "=== $ip ==="
  ssh root@$ip 'export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get -y dist-upgrade'
done
```
Expected: all three complete without error. Some may print "X packages upgraded".

- [ ] **Step 2: Install baseline packages**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  echo "=== $ip ==="
  ssh root@$ip 'export DEBIAN_FRONTEND=noninteractive && apt-get install -y \
    ufw fail2ban unattended-upgrades rclone \
    curl ca-certificates gnupg lsb-release rsync jq openssl'
done
```
Expected: all three succeed, packages installed.

---

### Task A.3: Set hostnames

- [ ] **Step 1: Apply hostnames**

Run:
```bash
ssh root@187.127.142.42 'hostnamectl set-hostname rawdrive-app1'
ssh root@187.127.142.44 'hostnamectl set-hostname rawdrive-app2'
ssh root@187.127.142.46 'hostnamectl set-hostname rawdrive-db'
```

- [ ] **Step 2: Verify**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  ssh root@$ip hostname
done
```
Expected: `rawdrive-app1`, `rawdrive-app2`, `rawdrive-db` (one per line).

---

### Task A.4: Timezone

- [ ] **Step 1: Set Asia/Kolkata on all nodes**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  ssh root@$ip 'timedatectl set-timezone Asia/Kolkata'
done
```

- [ ] **Step 2: Verify**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  ssh root@$ip 'timedatectl | grep "Time zone"'
done
```
Expected: three lines each showing `Time zone: Asia/Kolkata`

---

### Task A.5: 4 GB swapfile

- [ ] **Step 1: Create, format, enable, persist**

Run on each:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  echo "=== $ip ==="
  ssh root@$ip 'bash -c "
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q \"^/swapfile\" /etc/fstab || echo \"/swapfile none swap sw 0 0\" >> /etc/fstab
  "'
done
```

- [ ] **Step 2: Verify**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  ssh root@$ip 'swapon --show'
done
```
Expected: each shows `/swapfile file 4G 0B -2`.

---

### Task A.6: Sysctl tuning

- [ ] **Step 1: Write sysctl file on all nodes**

Run:
```bash
SYSCTL='
# RawDrive kernel tuning (spec §5.1)
net.core.somaxconn=65535
net.core.netdev_max_backlog=65535
net.ipv4.tcp_max_syn_backlog=65535
net.ipv4.tcp_tw_reuse=1
net.ipv4.tcp_fin_timeout=30
net.ipv4.ip_local_port_range=1024 65535
fs.file-max=2097152
net.netfilter.nf_conntrack_max=524288
vm.swappiness=10
vm.overcommit_memory=1
'
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  echo "=== $ip ==="
  ssh root@$ip "cat > /etc/sysctl.d/99-rawdrive.conf" <<< "$SYSCTL"
  ssh root@$ip 'sysctl -p /etc/sysctl.d/99-rawdrive.conf'
done
```

- [ ] **Step 2: Verify**

Run: `ssh root@187.127.142.42 'sysctl net.core.somaxconn'`
Expected: `net.core.somaxconn = 65535`

---

### Task A.7: UFW on app nodes (.42, .44)

- [ ] **Step 1: Configure .42**

Run:
```bash
ssh root@187.127.142.42 'bash -c "
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment ssh
  ufw allow 80/tcp comment http
  ufw allow 443/tcp comment https
  # Peer failover ports from .44 only
  ufw allow from 187.127.142.44 to any port 8080 proto tcp comment backend-peer
  ufw allow from 187.127.142.44 to any port 3000 proto tcp comment frontend-peer
  ufw allow from 187.127.142.44 to any port 4222 proto tcp comment nats-peer
  ufw allow from 187.127.142.44 to any port 6222 proto tcp comment nats-cluster-peer
  ufw allow from 187.127.142.44 to any port 8222 proto tcp comment nats-monitor-peer
  # DB node for NATS cluster
  ufw allow from 187.127.142.46 to any port 4222 proto tcp comment nats-db
  ufw allow from 187.127.142.46 to any port 6222 proto tcp comment nats-cluster-db
  ufw allow from 187.127.142.46 to any port 8222 proto tcp comment nats-monitor-db
  ufw --force enable
  ufw status verbose
"'
```

- [ ] **Step 2: Configure .44 (symmetric, peer=.42)**

Run the same block with `187.127.142.42` and `187.127.142.44` swapped:
```bash
ssh root@187.127.142.44 'bash -c "
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment ssh
  ufw allow 80/tcp comment http
  ufw allow 443/tcp comment https
  ufw allow from 187.127.142.42 to any port 8080 proto tcp comment backend-peer
  ufw allow from 187.127.142.42 to any port 3000 proto tcp comment frontend-peer
  ufw allow from 187.127.142.42 to any port 4222 proto tcp comment nats-peer
  ufw allow from 187.127.142.42 to any port 6222 proto tcp comment nats-cluster-peer
  ufw allow from 187.127.142.42 to any port 8222 proto tcp comment nats-monitor-peer
  ufw allow from 187.127.142.46 to any port 4222 proto tcp comment nats-db
  ufw allow from 187.127.142.46 to any port 6222 proto tcp comment nats-cluster-db
  ufw allow from 187.127.142.46 to any port 8222 proto tcp comment nats-monitor-db
  ufw --force enable
"'
```

- [ ] **Step 3: Verify from outside**

Run: `curl -m 5 -v http://187.127.142.42:8080 2>&1 | head -5`
Expected: `Connection refused` or `Connection timed out` — port is firewalled to non-peer IPs. Same for `.44`.

---

### Task A.8: UFW on DB node (.46)

- [ ] **Step 1: Configure .46**

Run:
```bash
ssh root@187.127.142.46 'bash -c "
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment ssh
  # Postgres primary — only from app nodes
  ufw allow from 187.127.142.42 to any port 5432 proto tcp comment pg-from-app1
  ufw allow from 187.127.142.44 to any port 5432 proto tcp comment pg-from-app2
  # Valkey primary — only from app nodes
  ufw allow from 187.127.142.42 to any port 6379 proto tcp comment valkey-from-app1
  ufw allow from 187.127.142.44 to any port 6379 proto tcp comment valkey-from-app2
  # NATS cluster — both peers
  ufw allow from 187.127.142.42 to any port 4222 proto tcp
  ufw allow from 187.127.142.42 to any port 6222 proto tcp
  ufw allow from 187.127.142.42 to any port 8222 proto tcp
  ufw allow from 187.127.142.44 to any port 4222 proto tcp
  ufw allow from 187.127.142.44 to any port 6222 proto tcp
  ufw allow from 187.127.142.44 to any port 8222 proto tcp
  ufw --force enable
  ufw status verbose
"'
```

- [ ] **Step 2: Verify Postgres port is closed from outside**

Run: `nc -w 3 -z 187.127.142.46 5432; echo exit=$?`
Expected: non-zero exit (connection refused from non-allowed IP). If it succeeds, UFW didn't apply — investigate.

---

### Task A.9: fail2ban sshd jail

- [ ] **Step 1: Write jail.local on all nodes**

Run:
```bash
JAIL='[sshd]
enabled = true
port = ssh
backend = systemd
maxretry = 5
findtime = 600
bantime = 3600
'
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  ssh root@$ip "cat > /etc/fail2ban/jail.d/sshd.local" <<< "$JAIL"
  ssh root@$ip 'systemctl restart fail2ban'
done
```

- [ ] **Step 2: Verify**

Run: `ssh root@187.127.142.42 'fail2ban-client status sshd'`
Expected: `Status for the jail: sshd` with `Currently banned: 0` (or a small number if random scanners triggered it).

---

### Task A.10: SSH hardening

- [ ] **Step 1: Write sshd drop-in**

Run:
```bash
SSHD='# RawDrive hardening
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 120
ClientAliveCountMax 3
'
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  ssh root@$ip "cat > /etc/ssh/sshd_config.d/99-rawdrive.conf" <<< "$SSHD"
done
```

- [ ] **Step 2: Validate config and restart sshd**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  echo "=== $ip ==="
  ssh root@$ip 'sshd -t && systemctl reload ssh && echo "reloaded"'
done
```
Expected: `reloaded` from each. If `sshd -t` fails, the drop-in has a syntax error — fix before reload, because a broken reload kills your SSH access.

- [ ] **Step 3: Verify from a fresh connection**

Run: `ssh -o PasswordAuthentication=yes root@187.127.142.42 'echo ok'`
Expected: succeeds via pubkey (PasswordAuth is advertised off, pubkey wins).

---

### Task A.11: unattended-upgrades (security only)

- [ ] **Step 1: Configure security-only**

Run:
```bash
UU='APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
'
UAU='Unattended-Upgrade::Allowed-Origins {
        "${distro_id}:${distro_codename}-security";
        "${distro_id}ESMApps:${distro_codename}-apps-security";
        "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
'
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  ssh root@$ip "cat > /etc/apt/apt.conf.d/20auto-upgrades" <<< "$UU"
  ssh root@$ip "cat > /etc/apt/apt.conf.d/50unattended-upgrades" <<< "$UAU"
  ssh root@$ip 'systemctl restart unattended-upgrades'
done
```

- [ ] **Step 2: Verify**

Run: `ssh root@187.127.142.42 'systemctl is-active unattended-upgrades'`
Expected: `active`

---

### Task A.12: Install Docker CE + Compose v2

- [ ] **Step 1: Add Docker apt repo and install**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  echo "=== $ip ==="
  ssh root@$ip 'bash -c "
    set -e
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(lsb_release -cs) stable\" > /etc/apt/sources.list.d/docker.list
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin
    systemctl enable --now docker
  "'
done
```

- [ ] **Step 2: Verify hello-world**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  echo "=== $ip ==="
  ssh root@$ip 'docker run --rm hello-world 2>&1 | grep "Hello from Docker"'
done
```
Expected: three `Hello from Docker!` lines.

- [ ] **Step 3: Create /opt/rawdrive/{app,backups}**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  ssh root@$ip 'mkdir -p /opt/rawdrive/app /opt/rawdrive/backups /var/www/certbot'
done
```

---

## Phase B — Database Primary (.46)

### Task B.1: Generate internal secrets

- [ ] **Step 1: Generate random values locally**

Run:
```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "POSTGRES_REPLICATION_PASSWORD=$(openssl rand -hex 24)"
echo "VALKEY_PASSWORD=$(openssl rand -hex 24)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "PLATFORM_SETTINGS_KEK=$(openssl rand -hex 32)"
echo "NATS_CLUSTER_SEED=$(openssl rand -hex 16)"
echo "BACKUP_GPG_PASSPHRASE=$(openssl rand -hex 32)"
```
Expected: seven lines each with a hex string.

**Critical:** copy `BACKUP_GPG_PASSPHRASE` to your password manager IMMEDIATELY. Losing it means the R2 backups are unrecoverable.

- [ ] **Step 2: Save the values to a local scratch file OUTSIDE the repo**

Run: `tee /tmp/rawdrive-secrets.env` (paste the six lines, Ctrl-D)
Expected: scratch file exists; `chmod 600 /tmp/rawdrive-secrets.env`. This file is for the local workstation only, deleted at end of Phase E.

---

### Task B.2: Push DB-node deploy files to .46

- [ ] **Step 1: Tar the DB-node subset and push**

Run:
```bash
tar -cf - deploy/docker-compose.prod-db.yml deploy/postgres/ deploy/valkey/ deploy/nats/ \
    | ssh root@187.127.142.46 'mkdir -p /opt/rawdrive/app/deploy && tar -xf - -C /opt/rawdrive/app'
```

- [ ] **Step 2: Verify files landed**

Run:
```bash
ssh root@187.127.142.46 'find /opt/rawdrive/app/deploy -type f | sort'
```
Expected: lists at least `docker-compose.prod-db.yml`, `postgres/postgresql.conf`, `postgres/pg_hba.conf`, `postgres/init/01-create-extensions.sql`, `postgres/init/02-create-replication-role.sh`, `valkey/valkey.conf`, `nats/nats-server.conf`.

---

### Task B.3: Write /opt/rawdrive/app/.env on .46

- [ ] **Step 1: Write the .env with the real secrets from Task B.1**

Run (replace `<POSTGRES_PASSWORD>` etc. with the actual values from Task B.1):
```bash
ssh root@187.127.142.46 'cat > /opt/rawdrive/app/.env' <<'ENV_EOF'
POSTGRES_USER=rawdrive
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
POSTGRES_DB=rawdrive
POSTGRES_REPLICATION_PASSWORD=<POSTGRES_REPLICATION_PASSWORD>
VALKEY_PASSWORD=<VALKEY_PASSWORD>
BACKUP_GPG_PASSPHRASE=<BACKUP_GPG_PASSPHRASE>
TZ=Asia/Kolkata
ENV_EOF
ssh root@187.127.142.46 'chmod 600 /opt/rawdrive/app/.env'
```

- [ ] **Step 2: Verify perms**

Run: `ssh root@187.127.142.46 'ls -la /opt/rawdrive/app/.env'`
Expected: `-rw------- 1 root root ... /opt/rawdrive/app/.env`

---

### Task B.4: Start Postgres + Valkey + NATS-3

- [ ] **Step 1: Symlink .env into the deploy dir for Compose**

Run:
```bash
ssh root@187.127.142.46 'ln -sf /opt/rawdrive/app/.env /opt/rawdrive/app/deploy/.env'
```

- [ ] **Step 2: Start the DB stack**

Run:
```bash
ssh root@187.127.142.46 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-db.yml up -d'
```
Expected: three containers created and started. Output lines for `postgres`, `valkey`, `nats`.

- [ ] **Step 3: Wait for healthy**

Run:
```bash
ssh root@187.127.142.46 'for i in 1 2 3 4 5 6; do
  echo "attempt $i:"
  docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-db.yml ps
  sleep 5
done'
```
Expected: within ~30 seconds, all three containers show `healthy` status.

---

### Task B.5: Verify Postgres + Valkey + NATS are up

- [ ] **Step 1: Postgres**

Run: `ssh root@187.127.142.46 'docker exec deploy-postgres-1 pg_isready -U rawdrive -d rawdrive'`
Expected: `/var/run/postgresql:5432 - accepting connections`

- [ ] **Step 2: pgvector extension exists**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT extname FROM pg_extension WHERE extname IN (\"vector\", \"pg_stat_statements\", \"pgcrypto\");"'
```
Expected: three rows — `vector`, `pg_stat_statements`, `pgcrypto`.

- [ ] **Step 3: Replication role exists**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT rolname, rolreplication FROM pg_roles WHERE rolname=\"replicator\";"'
```
Expected: one row, `replicator | t`.

- [ ] **Step 4: Valkey ping**

Run:
```bash
ssh root@187.127.142.46 'source /opt/rawdrive/app/.env && docker exec deploy-valkey-1 valkey-cli -a "$VALKEY_PASSWORD" ping'
```
Expected: `PONG`

- [ ] **Step 5: NATS monitor endpoint**

Run: `ssh root@187.127.142.46 'curl -fsS http://127.0.0.1:8222/varz | head -20'`
Expected: JSON output with `"server_name":"nats-3"` and `"cluster":{...}`.

---

### Task B.6: Configure rclone for R2

- [ ] **Step 1: Write rclone config on .46**

Run (substitute R2 creds from `HostingerServerDetails.md`):
```bash
ssh root@187.127.142.46 'mkdir -p /root/.config/rclone && cat > /root/.config/rclone/rclone.conf' <<'RCLONE_EOF'
[r2]
type = s3
provider = Cloudflare
access_key_id = <R2_ACCESS_KEY_ID>
secret_access_key = <R2_SECRET_ACCESS_KEY>
endpoint = https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
acl = private
RCLONE_EOF
ssh root@187.127.142.46 'chmod 600 /root/.config/rclone/rclone.conf'
```

- [ ] **Step 2: Verify rclone can list the R2 account**

Run: `ssh root@187.127.142.46 'rclone lsd r2:'`
Expected: lists at least one bucket (`rawdrive`).

- [ ] **Step 3: Create the backups bucket if missing**

Run:
```bash
ssh root@187.127.142.46 'rclone mkdir r2:rawdrive-backups && rclone lsd r2:'
```
Expected: both `rawdrive` and `rawdrive-backups` listed.

---

### Task B.7: Install backup script and run first manual backup

- [ ] **Step 1: Install the backup script**

Run:
```bash
scp deploy/scripts/backup-db.sh root@187.127.142.46:/opt/rawdrive/backup-db.sh
ssh root@187.127.142.46 'chmod +x /opt/rawdrive/backup-db.sh'
```

- [ ] **Step 2: Run it manually to validate**

Run:
```bash
ssh root@187.127.142.46 'set -a && source /opt/rawdrive/app/.env && set +a && /opt/rawdrive/backup-db.sh'
```
Expected: log lines about pg_dump, size >1024, upload to R2, verification pass, "backup complete".

- [ ] **Step 3: Verify the dump landed in R2**

Run: `ssh root@187.127.142.46 'rclone ls r2:rawdrive-backups/daily/'`
Expected: one file, `rawdrive_<timestamp>.dump`, size matches the local dump.

---

### Task B.8: Apply R2 lifecycle policy for backup retention

- [ ] **Step 1: Write the lifecycle rules to a JSON file locally**

Create (locally, not committed): `/tmp/r2-backup-lifecycle.json`:
```json
{
  "Rules": [
    {
      "ID": "daily-retention",
      "Status": "Enabled",
      "Filter": {"Prefix": "daily/"},
      "Expiration": {"Days": 30}
    },
    {
      "ID": "weekly-retention",
      "Status": "Enabled",
      "Filter": {"Prefix": "weekly/"},
      "Expiration": {"Days": 365}
    }
  ]
}
```

- [ ] **Step 2: Apply via rclone-compatible S3 API from .46**

Run:
```bash
ssh root@187.127.142.46 'apt-get install -y awscli 2>/dev/null || true'
scp /tmp/r2-backup-lifecycle.json root@187.127.142.46:/tmp/
ssh root@187.127.142.46 'AWS_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID> AWS_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY> aws --endpoint-url=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com s3api put-bucket-lifecycle-configuration --bucket rawdrive-backups --lifecycle-configuration file:///tmp/r2-backup-lifecycle.json'
```
Expected: no output, exit 0.

Note: R2 lifecycle policies have limited coverage vs full S3 — if this fails with "not supported", document it as a follow-up to configure via Cloudflare Dashboard UI instead. Do not block on it.

- [ ] **Step 3: Clean up local tempfile**

Run: `rm /tmp/r2-backup-lifecycle.json`

---

### Task B.9: Restore rehearsal

- [ ] **Step 1: Download latest encrypted dump, decrypt locally on .46**

Run:
```bash
ssh root@187.127.142.46 'rclone lsf r2:rawdrive-backups/daily/ --include "*.dump.gpg" | sort | tail -1' > /tmp/latest_dump_name.txt
LATEST=$(cat /tmp/latest_dump_name.txt)
echo "Latest dump: $LATEST"
ssh root@187.127.142.46 "rclone cat r2:rawdrive-backups/daily/$LATEST > /tmp/restore-test.dump.gpg"
ssh root@187.127.142.46 'source /opt/rawdrive/app/.env && gpg --batch --yes --passphrase "$BACKUP_GPG_PASSPHRASE" --decrypt --output /tmp/restore-test.dump /tmp/restore-test.dump.gpg'
ssh root@187.127.142.46 'ls -la /tmp/restore-test.dump'
```
Expected: the decrypted `.dump` file exists and is larger than the `.dump.gpg` (GPG overhead is small; plaintext is the bigger file).

- [ ] **Step 2: Restore into a disposable local container**

Run:
```bash
ssh root@187.127.142.46 'docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=test -p 127.0.0.1:5433:5432 pgvector/pgvector:pg17'
sleep 10
ssh root@187.127.142.46 'docker exec pg-restore-test createdb -U postgres rawdrive_restore'
ssh root@187.127.142.46 'docker exec -i pg-restore-test pg_restore -U postgres -d rawdrive_restore --no-owner --no-privileges < /tmp/restore-test.dump 2>&1 | tail -5'
```

- [ ] **Step 3: Verify schema exists**

Run:
```bash
ssh root@187.127.142.46 'docker exec pg-restore-test psql -U postgres -d rawdrive_restore -c "SELECT count(*) FROM information_schema.tables WHERE table_schema=\"public\";"'
```
Expected: count > 0 (schema exists even though the greenfield DB has no rows yet — tables from migrations should be present if migrations already ran, or count=0 if Phase B has not yet applied migrations; document which).

- [ ] **Step 4: Cleanup test container**

Run:
```bash
ssh root@187.127.142.46 'docker rm -f pg-restore-test && rm -f /tmp/restore-test.dump /tmp/restore-test.dump.gpg'
rm /tmp/latest_dump_name.txt
```

---

### Task B.10: Install backup cron

- [ ] **Step 1: Add crontab entries**

Run:
```bash
ssh root@187.127.142.46 '(crontab -l 2>/dev/null || true; echo "0 2 * * * /opt/rawdrive/backup-db.sh >> /var/log/rawdrive-backup.log 2>&1") | crontab -'
ssh root@187.127.142.46 'crontab -l'
```
Expected: the new line appears in crontab.

---

## Phase B.5 — Postgres Replica on .44

### Task B5.1: pg_basebackup from .46 to .44

- [ ] **Step 1: Create the replica data directory on .44**

Run:
```bash
ssh root@187.127.142.44 'mkdir -p /var/lib/rawdrive/postgres-replica && chmod 700 /var/lib/rawdrive/postgres-replica'
```

- [ ] **Step 2: Run pg_basebackup inside a one-shot container**

Run (substitute `<POSTGRES_REPLICATION_PASSWORD>` with value from B.1):
```bash
ssh root@187.127.142.44 'docker run --rm \
    -v /var/lib/rawdrive/postgres-replica:/var/lib/postgresql/data \
    -e PGPASSWORD=<POSTGRES_REPLICATION_PASSWORD> \
    pgvector/pgvector:pg17 \
    pg_basebackup \
    -h 187.127.142.46 \
    -U replicator \
    -D /var/lib/postgresql/data \
    -X stream \
    -P -R'
```
Expected: `NOTICE:  base backup completed` or similar. Data directory is populated.

- [ ] **Step 3: Verify standby.signal exists**

Run: `ssh root@187.127.142.44 'ls /var/lib/rawdrive/postgres-replica/standby.signal'`
Expected: file exists (confirms `-R` flag worked).

---

### Task B5.2: Start postgres-replica container on .44

- [ ] **Step 1: Push deploy files to .44 (subset)**

Run:
```bash
tar -cf - deploy/docker-compose.prod-app.yml deploy/postgres/ \
    | ssh root@187.127.142.44 'tar -xf - -C /opt/rawdrive/app'
```

- [ ] **Step 2: Write the postgres-replica override for .44**

Note: The Compose file's `postgres-replica` service uses a named volume. We need to instead bind-mount the `pg_basebackup` output directory. Create a small override file on .44:
```bash
ssh root@187.127.142.44 'cat > /opt/rawdrive/app/deploy/docker-compose.postgres-replica.override.yml' <<'OVR_EOF'
services:
  postgres-replica:
    volumes:
      - /var/lib/rawdrive/postgres-replica:/var/lib/postgresql/data
OVR_EOF
```

- [ ] **Step 3: Write minimal .env on .44 for Compose**

Run:
```bash
ssh root@187.127.142.44 'cat > /opt/rawdrive/app/.env' <<'ENV_EOF'
POSTGRES_USER=rawdrive
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
POSTGRES_DB=rawdrive
ENV_EOF
ssh root@187.127.142.44 'chmod 600 /opt/rawdrive/app/.env && ln -sf /opt/rawdrive/app/.env /opt/rawdrive/app/deploy/.env'
```

- [ ] **Step 4: Start replica via profile**

Run:
```bash
ssh root@187.127.142.44 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml -f docker-compose.postgres-replica.override.yml --profile postgres-replica up -d postgres-replica'
```

- [ ] **Step 5: Verify replica is running and in recovery mode**

Run:
```bash
ssh root@187.127.142.44 'sleep 10 && docker exec deploy-postgres-replica-1 psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();"'
```
Expected: `pg_is_in_recovery | t` (true — in recovery = replica mode).

---

### Task B5.3: Verify streaming replication is live

- [ ] **Step 1: Check replication status on primary**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT client_addr, state, sync_state, replay_lag FROM pg_stat_replication;"'
```
Expected: one row with `client_addr=187.127.142.44`, `state=streaming`, `replay_lag` NULL or `00:00:00`.

- [ ] **Step 2: Write a test row on primary, read from replica**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "CREATE TABLE IF NOT EXISTS replication_test (ts timestamptz DEFAULT now()); INSERT INTO replication_test VALUES (DEFAULT);"'
sleep 2
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 psql -U rawdrive -d rawdrive -c "SELECT * FROM replication_test;"'
```
Expected: the row inserted on primary appears on replica within 2 seconds.

- [ ] **Step 3: Clean up test table**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "DROP TABLE replication_test;"'
```

---

## Phase C — App Nodes

### Task C1.1: Push source to .42

- [ ] **Step 1: Tar and ship (from local workstation)**

Run:
```bash
cd /c/Users/admin/Desktop/RawDriveCobolt
tar --exclude='node_modules' --exclude='.git' --exclude='.next' \
    --exclude='deploy/.env' --exclude='.env*' \
    --exclude='*.log' --exclude='frontend/.next' \
    -cf - . | ssh root@187.127.142.42 'tar -xf - -C /opt/rawdrive/app'
```

- [ ] **Step 2: Verify size**

Run: `ssh root@187.127.142.42 'du -sh /opt/rawdrive/app'`
Expected: 100-500 MB (depending on test assets). If it's 10+ GB, something is wrong (node_modules leaked).

---

### Task C1.2: Write .env files on .42

- [ ] **Step 1: Write /opt/rawdrive/app/.env with full credentials**

Run (substitute all `<...>` with real values from B.1 and `HostingerServerDetails.md`):
```bash
ssh root@187.127.142.42 'cat > /opt/rawdrive/app/.env' <<'ENV_EOF'
# App node .42 — full credential set
POSTGRES_USER=rawdrive
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
POSTGRES_DB=rawdrive

# Local pgbouncer → current primary
DATABASE_URL=postgresql://rawdrive:<POSTGRES_PASSWORD>@127.0.0.1:6432/rawdrive?sslmode=disable

VALKEY_PASSWORD=<VALKEY_PASSWORD>
VALKEY_URL=redis://:<VALKEY_PASSWORD>@187.127.142.46:6379

# R2 (external, not rotated)
R2_BUCKET_NAME=rawdrive
R2_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
R2_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
R2_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
R2_REGION=auto
R2_PUBLIC_URL=https://pub-<R2_PUBLIC_URL_HASH>.r2.dev
R2_ACCOUNT_ID=<R2_ACCOUNT_ID>

# SMTP (external, not rotated)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USERNAME=noreply@rawdrive.de
SMTP_PASSWORD=<SMTP_PASSWORD>
SMTP_FROM=RawDrive <noreply@rawdrive.de>

# NATS
NATS_URL=nats://127.0.0.1:4222
NATS_NODE_NAME=nats-1
NATS_CLUSTER_SEED=<NATS_CLUSTER_SEED>

# App
JWT_SECRET=<JWT_SECRET>
APP_ENV=production
LOG_LEVEL=info
TZ=Asia/Kolkata
PLATFORM_SETTINGS_KEK=<PLATFORM_SETTINGS_KEK>
MOONSHOT_API_KEY=<MOONSHOT_API_KEY>
ENV_EOF
ssh root@187.127.142.42 'chmod 600 /opt/rawdrive/app/.env'
```

- [ ] **Step 2: Write deploy/.env with PEER_NODE_IP**

Run:
```bash
ssh root@187.127.142.42 'cat > /opt/rawdrive/app/deploy/.env' <<'DEPLOY_EOF'
PEER_NODE_IP=187.127.142.44
NATS_NODE_NAME=nats-1
DEPLOY_EOF
ssh root@187.127.142.42 'chmod 600 /opt/rawdrive/app/deploy/.env'
```

---

### Task C1.3: Write pgbouncer userlist and databases.ini on .42

- [ ] **Step 1: Fetch the SCRAM verifier from the primary**

The Postgres primary on `.46` stores `rawdrive`'s password as a SCRAM-SHA-256 verifier in `pg_authid.rolpassword`. PgBouncer's `userlist.txt` expects that exact string verbatim — no transformation.

Run (from the workstation, via .46):
```bash
SCRAM_VERIFIER=$(ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -tAc "SELECT rolpassword FROM pg_authid WHERE rolname='"'"'rawdrive'"'"';"')
echo "Verifier: $SCRAM_VERIFIER"
```
Expected: a string starting with `SCRAM-SHA-256$4096:`. Save it — you'll reuse it on `.44` (same verifier, same user).

- [ ] **Step 2: Write userlist.txt on .42**

Run:
```bash
ssh root@187.127.142.42 'mkdir -p /opt/rawdrive/app/deploy/pgbouncer'
ssh root@187.127.142.42 "printf '%s\n' '\"rawdrive\" \"${SCRAM_VERIFIER}\"' > /opt/rawdrive/app/deploy/pgbouncer/userlist.txt"
ssh root@187.127.142.42 'chmod 600 /opt/rawdrive/app/deploy/pgbouncer/userlist.txt && head /opt/rawdrive/app/deploy/pgbouncer/userlist.txt'
```
Expected: `"rawdrive" "SCRAM-SHA-256$4096:..."` printed from the `head` call.

- [ ] **Step 3: Confirm databases.ini points at .46**

Run: `ssh root@187.127.142.42 'cat /opt/rawdrive/app/deploy/pgbouncer/databases.ini'`
Expected: `rawdrive = host=187.127.142.46 port=5432 dbname=rawdrive auth_user=rawdrive`

---

### Task C1.4: Build images on .42

- [ ] **Step 1: Run docker compose build**

Run:
```bash
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml build --no-cache'
```
Expected: both `backend` (contains api + migrate) and `frontend` images build successfully. Takes 5–10 minutes.

- [ ] **Step 2: Verify images exist**

Run: `ssh root@187.127.142.42 'docker images | grep rawdrive'`
Expected: `rawdrive-backend` and `rawdrive-frontend` both listed.

---

### Task C1.5: Start pgbouncer + NATS-1 on .42

- [ ] **Step 1: Start both services**

Run:
```bash
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d pgbouncer nats'
```

- [ ] **Step 2: Wait for healthy**

Run:
```bash
ssh root@187.127.142.42 'sleep 10 && docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml ps'
```
Expected: both services `healthy`.

- [ ] **Step 3: Test pgbouncer → primary**

Run:
```bash
ssh root@187.127.142.42 'PGPASSWORD=<POSTGRES_PASSWORD> psql -h 127.0.0.1 -p 6432 -U rawdrive -d rawdrive -c "SELECT 1;"'
```
Expected: `?column?` `1` row. Confirms pgbouncer → .46 primary works.

---

### Task C1.6: Run migrate one-shot on .42

- [ ] **Step 1: Execute the migrate service**

Run:
```bash
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml run --rm migrate'
```
Expected: `migrations applied successfully` and exit 0. This populates the schema_migrations table and creates all tables on the primary (.46 — migrations flow through pgbouncer).

- [ ] **Step 2: Verify tables exist on primary**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "\dt" | head -20'
```
Expected: many tables listed (`users`, `workspaces`, `galleries`, `assets`, ...).

- [ ] **Step 3: Verify tables replicated to standby**

Run:
```bash
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 psql -U rawdrive -d rawdrive -c "\dt" | head -20'
```
Expected: same table list, proving replication caught up.

---

### Task C1.7: Start backend + frontend on .42

- [ ] **Step 1: Bring up the main services**

Run:
```bash
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d backend frontend'
```

- [ ] **Step 2: Wait for healthy**

Run:
```bash
ssh root@187.127.142.42 'sleep 30 && docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml ps'
```
Expected: `backend` and `frontend` both `healthy`.

- [ ] **Step 3: Smoke test backend locally on .42**

Run: `ssh root@187.127.142.42 'curl -fsS http://127.0.0.1:8080/api/v1/health'`
Expected: `{"status":"ok"}` or similar 2xx JSON.

---

### Task C1.8: Start valkey-replica on .42

- [ ] **Step 1: Start via profile**

Run:
```bash
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml --profile valkey-replica up -d valkey-replica'
```

- [ ] **Step 2: Verify replica is connected**

Run:
```bash
ssh root@187.127.142.42 'docker exec deploy-valkey-replica-1 valkey-cli -a <VALKEY_PASSWORD> INFO replication | head -15'
```
Expected: `role:slave`, `master_host:187.127.142.46`, `master_link_status:up`.

---

### Task C1.9: Issue Let's Encrypt cert from .42 (webroot HTTP-01)

- [ ] **Step 1: Prepare webroot**

Run: `ssh root@187.127.142.42 'mkdir -p /var/www/certbot'`

- [ ] **Step 2: Start a bare nginx container to serve the ACME challenge**

Run:
```bash
ssh root@187.127.142.42 'docker run -d --name certbot-temp-nginx -p 80:80 -v /var/www/certbot:/usr/share/nginx/html:ro nginx:1.27-alpine'
```

- [ ] **Step 3: Dry-run certbot first**

Run:
```bash
ssh root@187.127.142.42 'docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/www/certbot:/var/www/certbot \
    certbot/certbot:latest \
    certonly --webroot --webroot-path=/var/www/certbot \
    --email support@rawdrive.in --agree-tos --no-eff-email \
    --dry-run \
    -d rawdrive.in -d www.rawdrive.in -d api.rawdrive.in'
```
Expected: `The dry run was successful.`

- [ ] **Step 4: Real run**

Run the same command without `--dry-run`:
```bash
ssh root@187.127.142.42 'docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/www/certbot:/var/www/certbot \
    certbot/certbot:latest \
    certonly --webroot --webroot-path=/var/www/certbot \
    --email support@rawdrive.in --agree-tos --no-eff-email \
    -d rawdrive.in -d www.rawdrive.in -d api.rawdrive.in'
```
Expected: `Successfully received certificate.` Cert files appear under `/etc/letsencrypt/live/rawdrive.in/`.

- [ ] **Step 5: Stop temp nginx**

Run: `ssh root@187.127.142.42 'docker rm -f certbot-temp-nginx'`

---

### Task C1.10: Start the real nginx on .42

- [ ] **Step 1: Bring up nginx**

Run:
```bash
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d nginx'
```

- [ ] **Step 2: Verify nginx is listening on 443**

Run: `ssh root@187.127.142.42 'ss -lnt | grep -E ":(80|443)"'`
Expected: two LISTEN lines, 0.0.0.0:80 and 0.0.0.0:443.

- [ ] **Step 3: Smoke test HTTPS to .42 directly**

Run: `curl -fsS --resolve rawdrive.in:443:187.127.142.42 https://rawdrive.in/api/v1/health`
Expected: 2xx JSON response. `--resolve` forces DNS to .42 specifically, bypassing any DNS round-robin.

---

### Task C1.11: Verify .42 is fully healthy

- [ ] **Step 1: All containers healthy**

Run:
```bash
ssh root@187.127.142.42 'docker ps --format "{{.Names}}\t{{.Status}}"'
```
Expected: `deploy-pgbouncer-1`, `deploy-nats-1`, `deploy-backend-1`, `deploy-frontend-1`, `deploy-valkey-replica-1`, `deploy-nginx-1` — all `Up X seconds (healthy)`.

---

### Task C2.1: Push source to .44

- [ ] **Step 1: Tar and ship from local workstation**

Run:
```bash
cd /c/Users/admin/Desktop/RawDriveCobolt
tar --exclude='node_modules' --exclude='.git' --exclude='.next' \
    --exclude='deploy/.env' --exclude='.env*' \
    --exclude='*.log' --exclude='frontend/.next' \
    -cf - . | ssh root@187.127.142.44 'tar -xf - -C /opt/rawdrive/app'
```

- [ ] **Step 2: Verify size**

Run: `ssh root@187.127.142.44 'du -sh /opt/rawdrive/app'`
Expected: 100–500 MB. Matches what landed on `.42`.

---

### Task C2.2: Write /opt/rawdrive/app/.env on .44

- [ ] **Step 1: Write .env with same credentials as .42**

App nodes are symmetric — same secrets work on both. Substitute all `<...>` with real values from Task B.1 and `HostingerServerDetails.md`:

```bash
ssh root@187.127.142.44 'cat > /opt/rawdrive/app/.env' <<'ENV_EOF'
POSTGRES_USER=rawdrive
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
POSTGRES_DB=rawdrive

DATABASE_URL=postgresql://rawdrive:<POSTGRES_PASSWORD>@127.0.0.1:6432/rawdrive?sslmode=disable

VALKEY_PASSWORD=<VALKEY_PASSWORD>
VALKEY_URL=redis://:<VALKEY_PASSWORD>@187.127.142.46:6379

R2_BUCKET_NAME=rawdrive
R2_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
R2_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
R2_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
R2_REGION=auto
R2_PUBLIC_URL=https://pub-<R2_PUBLIC_URL_HASH>.r2.dev
R2_ACCOUNT_ID=<R2_ACCOUNT_ID>

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USERNAME=noreply@rawdrive.de
SMTP_PASSWORD=<SMTP_PASSWORD>
SMTP_FROM=RawDrive <noreply@rawdrive.de>

NATS_URL=nats://127.0.0.1:4222
NATS_NODE_NAME=nats-2
NATS_CLUSTER_SEED=<NATS_CLUSTER_SEED>

JWT_SECRET=<JWT_SECRET>
APP_ENV=production
LOG_LEVEL=info
TZ=Asia/Kolkata
PLATFORM_SETTINGS_KEK=<PLATFORM_SETTINGS_KEK>
MOONSHOT_API_KEY=<MOONSHOT_API_KEY>
ENV_EOF
ssh root@187.127.142.44 'chmod 600 /opt/rawdrive/app/.env'
```

**Critical difference from `.42`:** `NATS_NODE_NAME=nats-2` (not `nats-1`). Everything else is identical.

---

### Task C2.3: Write deploy/.env on .44

- [ ] **Step 1: Write with peer pointing back at .42**

Run:
```bash
ssh root@187.127.142.44 'cat > /opt/rawdrive/app/deploy/.env' <<'DEPLOY_EOF'
PEER_NODE_IP=187.127.142.42
NATS_NODE_NAME=nats-2
DEPLOY_EOF
ssh root@187.127.142.44 'chmod 600 /opt/rawdrive/app/deploy/.env'
```

Note: `PEER_NODE_IP=187.127.142.42` — this is the inverse of `.42`'s file, which pointed at `.44`.

---

### Task C2.4: Write pgbouncer userlist and databases.ini on .44

- [ ] **Step 1: Reuse the SCRAM verifier from Task C1.3**

The SCRAM verifier is a property of the Postgres user's stored password. Since both app nodes authenticate as the same `rawdrive` user against the same primary, the verifier is identical. Reuse the value captured in Task C1.3 Step 1. If it's no longer in your shell:
```bash
SCRAM_VERIFIER=$(ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -tAc "SELECT rolpassword FROM pg_authid WHERE rolname='"'"'rawdrive'"'"';"')
```

- [ ] **Step 2: Write userlist.txt on .44**

Run:
```bash
ssh root@187.127.142.44 'mkdir -p /opt/rawdrive/app/deploy/pgbouncer'
ssh root@187.127.142.44 "printf '%s\n' '\"rawdrive\" \"${SCRAM_VERIFIER}\"' > /opt/rawdrive/app/deploy/pgbouncer/userlist.txt"
ssh root@187.127.142.44 'chmod 600 /opt/rawdrive/app/deploy/pgbouncer/userlist.txt && head /opt/rawdrive/app/deploy/pgbouncer/userlist.txt'
```
Expected: matches `.42`'s userlist content.

- [ ] **Step 3: Confirm databases.ini still points at primary on .46**

Run: `ssh root@187.127.142.44 'cat /opt/rawdrive/app/deploy/pgbouncer/databases.ini'`
Expected: `rawdrive = host=187.127.142.46 port=5432 dbname=rawdrive auth_user=rawdrive`

---

### Task C2.5: Build images on .44

- [ ] **Step 1: Run docker compose build**

Run:
```bash
ssh root@187.127.142.44 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml build --no-cache'
```
Expected: `rawdrive-backend` and `rawdrive-frontend` images built. Takes 5–10 minutes.

- [ ] **Step 2: Verify images**

Run: `ssh root@187.127.142.44 'docker images | grep rawdrive'`
Expected: both images listed.

---

### Task C2.6: Start pgbouncer + NATS-2 on .44

- [ ] **Step 1: Start services**

Run:
```bash
ssh root@187.127.142.44 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d pgbouncer nats'
```

- [ ] **Step 2: Wait for healthy**

Run:
```bash
ssh root@187.127.142.44 'sleep 10 && docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml ps'
```
Expected: both services `healthy`.

- [ ] **Step 3: Verify pgbouncer routes to primary on .46**

Run:
```bash
ssh root@187.127.142.44 'PGPASSWORD=<POSTGRES_PASSWORD> psql -h 127.0.0.1 -p 6432 -U rawdrive -d rawdrive -c "SELECT 1;"'
```
Expected: `?column?` `1` row. Confirms pgbouncer → `.46` works through the same connection pattern `.42` uses.

---

### Task C2.7: Start backend + frontend on .44 (no migrate)

The `migrate` service is NOT run on `.44`. Migrations were already applied to the shared primary during Task C1.6 via `.42`'s one-shot container. The `schema_migrations` table on `.46` records which migrations have been applied; if we run migrate again from `.44`, the `database.Migrator` checks `schema_migrations` and skips everything — but we also have the pg_advisory_lock to prevent concurrent runs. Skipping is cleaner and faster.

- [ ] **Step 1: Bring up backend + frontend only**

Run:
```bash
ssh root@187.127.142.44 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d backend frontend'
```

Note: Compose's `depends_on: migrate: service_completed_successfully` in `docker-compose.prod-app.yml` will try to run migrate first. This is acceptable — migrate will run, connect via pgbouncer to the primary, find all migrations already applied in `schema_migrations`, and exit 0 within a few seconds. The idempotent migration design makes this safe. If you want to skip entirely, use `--no-deps backend frontend` explicitly.

- [ ] **Step 2: Wait for healthy**

Run:
```bash
ssh root@187.127.142.44 'sleep 30 && docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml ps'
```
Expected: `backend` and `frontend` both `healthy`; `migrate` in state `exited (0)`.

- [ ] **Step 3: Smoke test backend locally**

Run: `ssh root@187.127.142.44 'curl -fsS http://127.0.0.1:8080/api/v1/health'`
Expected: `{"status":"ok"}`.

---

### Task C2.8: Verify postgres replica is already running on .44

The postgres replica on `.44` was started back in Task B5.2 under the `postgres-replica` Compose profile. Confirm it's still healthy and streaming.

- [ ] **Step 1: Replica process check**

Run:
```bash
ssh root@187.127.142.44 'docker ps --filter name=deploy-postgres-replica-1 --format "{{.Status}}"'
```
Expected: `Up X hours (healthy)` or similar.

- [ ] **Step 2: Replication lag check on primary**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT client_addr, state, replay_lag FROM pg_stat_replication;"'
```
Expected: one row, `client_addr=187.127.142.44`, `state=streaming`, `replay_lag` NULL or near zero.

---

### Task C2.9: Rsync certs from .42 to .44

- [ ] **Step 1: Transfer `/etc/letsencrypt` via tar pipe**

Run:
```bash
ssh root@187.127.142.42 'tar -cf - /etc/letsencrypt' | ssh root@187.127.142.44 'tar -xf - -C /'
```

- [ ] **Step 2: Verify cert files exist on .44**

Run: `ssh root@187.127.142.44 'ls -la /etc/letsencrypt/live/rawdrive.in/'`
Expected: `fullchain.pem`, `privkey.pem`, `cert.pem`, `chain.pem` — all present.

---

### Task C2.10: Start nginx on .44

- [ ] **Step 1: Bring up nginx**

Run:
```bash
ssh root@187.127.142.44 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d nginx'
```

- [ ] **Step 2: Verify nginx is listening**

Run: `ssh root@187.127.142.44 'ss -lnt | grep -E ":(80|443)"'`
Expected: two LISTEN lines on 0.0.0.0:80 and 0.0.0.0:443.

- [ ] **Step 3: Smoke test HTTPS directly to .44**

Run: `curl -fsS --resolve rawdrive.in:443:187.127.142.44 https://rawdrive.in/api/v1/health`
Expected: 2xx JSON. Confirms `.44`'s nginx serves TLS with the rsync'd certs and proxies to the local backend.

---

### Task C2.11: Verify .44 is fully healthy

- [ ] **Step 1: All containers healthy**

Run:
```bash
ssh root@187.127.142.44 'docker ps --format "{{.Names}}\t{{.Status}}"'
```
Expected containers on `.44`:
- `deploy-pgbouncer-1`
- `deploy-nats-1` (note: container name is still `deploy-nats-1` even though the NATS server name is `nats-2` — Compose uses service name for container name, not the `-n` flag)
- `deploy-backend-1`
- `deploy-frontend-1`
- `deploy-postgres-replica-1`
- `deploy-nginx-1`

All `Up X (healthy)`.

Note: no `deploy-valkey-replica-1` on `.44` — that runs on `.42` (Task C1.8).

### Task C2.12: Rsync certs from .42 to .44

- [ ] **Step 1: Rsync**

Run:
```bash
ssh root@187.127.142.42 'tar -cf - /etc/letsencrypt' | ssh root@187.127.142.44 'tar -xf - -C /'
```

- [ ] **Step 2: Verify cert exists on .44**

Run: `ssh root@187.127.142.44 'ls -la /etc/letsencrypt/live/rawdrive.in/'`
Expected: `fullchain.pem`, `privkey.pem`, etc. — all present.

---

### Task C2.13: Start nginx on .44

- [ ] **Step 1: Bring up nginx**

Run:
```bash
ssh root@187.127.142.44 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d nginx'
```

- [ ] **Step 2: Smoke test**

Run: `curl -fsS --resolve rawdrive.in:443:187.127.142.44 https://rawdrive.in/api/v1/health`
Expected: 2xx JSON.

---

### Task C.14: Install cert renewal cron on both nodes

- [ ] **Step 1: Install script + cron on .42**

Run:
```bash
scp deploy/scripts/renew-ssl.sh root@187.127.142.42:/opt/rawdrive/renew-ssl.sh
ssh root@187.127.142.42 'chmod +x /opt/rawdrive/renew-ssl.sh && (crontab -l 2>/dev/null; echo "0 3,15 * * * CERTBOT_MODE=webroot /opt/rawdrive/renew-ssl.sh >> /var/log/certbot-renew.log 2>&1") | crontab -'
```

- [ ] **Step 2: Same on .44**

Run:
```bash
scp deploy/scripts/renew-ssl.sh root@187.127.142.44:/opt/rawdrive/renew-ssl.sh
ssh root@187.127.142.44 'chmod +x /opt/rawdrive/renew-ssl.sh && (crontab -l 2>/dev/null; echo "0 3,15 * * * CERTBOT_MODE=webroot /opt/rawdrive/renew-ssl.sh >> /var/log/certbot-renew.log 2>&1") | crontab -'
```

---

## Phase D — Smoke Test and HA Drills

### Task D.1: End-to-end register / login / workspace

- [ ] **Step 1: Register a throwaway user via the real domain**

Run (from local workstation):
```bash
curl -fsS -X POST https://api.rawdrive.in/api/v1/auth/password/register \
    -H 'Content-Type: application/json' \
    -d '{"name":"Test Bootstrap","email":"bootstrap-test@rawdrive.de","password":"BootstrapTest2026!","state":"TS"}'
```
Expected: 2xx JSON response with user ID and/or token.

- [ ] **Step 2: Login**

Run:
```bash
TOKEN=$(curl -fsS -X POST https://api.rawdrive.in/api/v1/auth/password/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"bootstrap-test@rawdrive.de","password":"BootstrapTest2026!"}' \
    | jq -r '.access_token // .token')
echo "Token: ${TOKEN:0:30}..."
```
Expected: a JWT prefix printed. If empty/null, inspect the raw response.

- [ ] **Step 3: Fetch workspace**

Run:
```bash
curl -fsS https://api.rawdrive.in/api/v1/workspace \
    -H "Authorization: Bearer $TOKEN"
```
Expected: 2xx JSON with workspace object.

- [ ] **Step 4: Delete the test user directly in DB**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "DELETE FROM users WHERE email='bootstrap-test@rawdrive.de';"'
```
Expected: `DELETE 1`

---

### Task D.2: Backend HA drill on .42

- [ ] **Step 1: Stop backend on .42**

Run: `ssh root@187.127.142.42 'docker stop deploy-backend-1'`

- [ ] **Step 2: Verify peer backup serves traffic**

Run:
```bash
curl -fsS --resolve rawdrive.in:443:187.127.142.42 https://rawdrive.in/api/v1/health
```
Expected: 2xx. The nginx on .42 proxies to local backend (unhealthy) and falls back to peer backup on .44:8080. Fails over within ~1s.

- [ ] **Step 3: Restart backend on .42**

Run: `ssh root@187.127.142.42 'docker start deploy-backend-1 && sleep 10 && docker ps --filter name=deploy-backend-1'`
Expected: backend running and healthy again.

---

### Task D.3: Nginx HA drill on .42

- [ ] **Step 1: Stop nginx on .42**

Run: `ssh root@187.127.142.42 'docker stop deploy-nginx-1'`

- [ ] **Step 2: Verify DNS round-robin serves from .44**

Run: `curl -fsS --resolve rawdrive.in:443:187.127.142.44 https://rawdrive.in/api/v1/health`
Expected: 2xx. The DNS record for `rawdrive.in` has both `.42` and `.44`; clients retry on connection refused. On .44, nginx serves normally.

- [ ] **Step 3: Restart nginx on .42**

Run: `ssh root@187.127.142.42 'docker start deploy-nginx-1'`

---

### Task D.4: Postgres failover drill (controlled)

- [ ] **Step 1: Seed a known row into the primary**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "CREATE TABLE IF NOT EXISTS failover_drill (id int primary key, note text); INSERT INTO failover_drill VALUES (1, \"before-failover\");"'
```

- [ ] **Step 2: Wait for replication to catch up**

Run:
```bash
sleep 3
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 psql -U rawdrive -d rawdrive -c "SELECT * FROM failover_drill;"'
```
Expected: the row is visible on replica.

- [ ] **Step 3: Record start time, stop primary**

Run:
```bash
echo "FAILOVER START: $(date -u +%FT%TZ)" | tee /tmp/failover-drill.log
ssh root@187.127.142.46 'docker stop deploy-postgres-1'
```

- [ ] **Step 4: Promote replica on .44**

Run:
```bash
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 pg_ctl promote -D /var/lib/postgresql/data'
sleep 3
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();"'
```
Expected: `pg_is_in_recovery | f` (false — now primary).

- [ ] **Step 5: Flip pgbouncer on .42 to point at .44**

Run:
```bash
ssh root@187.127.142.42 'sed -i "s/host=187.127.142.46/host=187.127.142.44/" /opt/rawdrive/app/deploy/pgbouncer/databases.ini && docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml restart pgbouncer'
```

- [ ] **Step 6: Flip pgbouncer on .44 to point at local (127.0.0.1)**

Run:
```bash
ssh root@187.127.142.44 'sed -i "s/host=187.127.142.46/host=127.0.0.1/" /opt/rawdrive/app/deploy/pgbouncer/databases.ini && docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml restart pgbouncer'
```

- [ ] **Step 7: Verify writes succeed on the new primary**

Run:
```bash
ssh root@187.127.142.42 'PGPASSWORD=<POSTGRES_PASSWORD> psql -h 127.0.0.1 -p 6432 -U rawdrive -d rawdrive -c "INSERT INTO failover_drill VALUES (2, \"after-failover\"); SELECT * FROM failover_drill;"'
echo "FAILOVER END: $(date -u +%FT%TZ)" | tee -a /tmp/failover-drill.log
```
Expected: insert succeeds, both rows visible.

- [ ] **Step 8: Verify backend still serves traffic**

Run: `curl -fsS https://api.rawdrive.in/api/v1/health/ready`
Expected: 2xx, `db: ok`.

- [ ] **Step 9: Measure wall-clock time**

Run: `cat /tmp/failover-drill.log`
Expected: two timestamps — failover start and end. Compute elapsed.

---

### Task D.5: Postgres failback drill

- [ ] **Step 1: Start fresh Postgres on .46 as a new replica of .44**

Run:
```bash
ssh root@187.127.142.46 'docker rm -f deploy-postgres-1 2>/dev/null; docker volume rm rawdrive-db_postgres_data 2>/dev/null; true'
ssh root@187.127.142.46 'mkdir -p /var/lib/rawdrive/postgres-new && chmod 700 /var/lib/rawdrive/postgres-new'
ssh root@187.127.142.46 'docker run --rm \
    -v /var/lib/rawdrive/postgres-new:/var/lib/postgresql/data \
    -e PGPASSWORD=<POSTGRES_REPLICATION_PASSWORD> \
    pgvector/pgvector:pg17 \
    pg_basebackup -h 187.127.142.44 -U replicator -D /var/lib/postgresql/data -X stream -P -R'
```

- [ ] **Step 2: Start new container using bind-mount to the new data dir**

Create an override file on .46:
```bash
ssh root@187.127.142.46 'cat > /opt/rawdrive/app/deploy/docker-compose.postgres-restart.override.yml' <<'OVR_EOF'
services:
  postgres:
    volumes:
      - /var/lib/rawdrive/postgres-new:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - ./postgres/pg_hba.conf:/etc/postgresql/pg_hba.conf:ro
OVR_EOF
ssh root@187.127.142.46 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-db.yml -f docker-compose.postgres-restart.override.yml up -d postgres'
```

- [ ] **Step 3: Wait for streaming replication to be caught up**

Run:
```bash
sleep 20
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 psql -U rawdrive -d rawdrive -c "SELECT client_addr, state, replay_lag FROM pg_stat_replication;"'
```
Expected: one row, `client_addr=187.127.142.46`, `state=streaming`.

- [ ] **Step 4: Promote .46 back to primary**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 pg_ctl promote -D /var/lib/postgresql/data'
```

- [ ] **Step 5: Flip pgbouncer on both app nodes back to .46**

Run:
```bash
ssh root@187.127.142.42 'sed -i "s/host=187.127.142.44/host=187.127.142.46/" /opt/rawdrive/app/deploy/pgbouncer/databases.ini && docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml restart pgbouncer'
ssh root@187.127.142.44 'sed -i "s/host=127.0.0.1/host=187.127.142.46/" /opt/rawdrive/app/deploy/pgbouncer/databases.ini && docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml restart pgbouncer'
```

- [ ] **Step 6: Re-bootstrap .44 as a replica of .46**

Run:
```bash
ssh root@187.127.142.44 'docker stop deploy-postgres-replica-1 && rm -rf /var/lib/rawdrive/postgres-replica/* && docker run --rm \
    -v /var/lib/rawdrive/postgres-replica:/var/lib/postgresql/data \
    -e PGPASSWORD=<POSTGRES_REPLICATION_PASSWORD> \
    pgvector/pgvector:pg17 \
    pg_basebackup -h 187.127.142.46 -U replicator -D /var/lib/postgresql/data -X stream -P -R && docker start deploy-postgres-replica-1'
```

- [ ] **Step 7: Verify replication lag on .46**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT client_addr, state, replay_lag FROM pg_stat_replication;"'
```
Expected: one row, `client_addr=187.127.142.44`, `state=streaming`.

- [ ] **Step 8: Drop the drill table**

Run:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "DROP TABLE failover_drill;"'
```

---

## Phase E — Cleanup, Runbooks, and Cloudflare Migration

### Task E.1: Untrack HostingerServerDetails.md

- [ ] **Step 1: Remove from git index**

Run:
```bash
git rm --cached HostingerServerDetails.md
```

- [ ] **Step 2: Add to .gitignore**

Run:
```bash
echo '' >> .gitignore
echo '# Production credentials — committed accidentally on the initial commit,' >> .gitignore
echo '# untracked during prod bootstrap (2026-04-11). Values inside have been' >> .gitignore
echo '# rotated where applicable; external service tokens remain valid until' >> .gitignore
echo '# a follow-up rotation session.' >> .gitignore
echo 'HostingerServerDetails.md' >> .gitignore
```

- [ ] **Step 3: Verify ignore works**

Run: `git status HostingerServerDetails.md`
Expected: no output (file is ignored and not in index).

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: untrack HostingerServerDetails.md and add to .gitignore

Production credentials were committed to git at repo creation. Internal
secrets (Postgres, Valkey) have been rotated during bootstrap. External
service tokens (R2, Cloudflare, SMTP, MoonShot) remain as-is pending a
follow-up rotation session. The file stays on disk for local reference
but will not be re-committed.

History purge (filter-repo / BFG) is explicitly deferred — anyone who
cloned the repo before this commit still has the old values. Rotate
external credentials as a separate focused session."
```

---

### Task E.2–E.7: Write runbooks

Each runbook is a new markdown file under `docs/runbooks/`. They should contain the EXACT commands used during Phase D drills, with copy-paste-ready blocks.

- [ ] **Task E.2: Write `docs/runbooks/postgres-failover.md`**

Content: the step-by-step from Phase D Task D.4 (failover) + D.5 (failback), with your actual measured wall-clock times from the drill.

Commit: `git add docs/runbooks/postgres-failover.md && git commit -m "docs(runbook): postgres primary failover to .44 replica"`

- [ ] **Task E.3: Write `docs/runbooks/valkey-failover.md`**

Content: manual promote of valkey replica on .42, `VALKEY_URL` update in `.env`, backend restart. Short — it's 3 commands.

- [ ] **Task E.4: Write `docs/runbooks/disaster-recovery-from-r2.md`**

Content: provision new VPS, install Postgres, `rclone copy r2:rawdrive-backups/daily/<latest>.dump`, `pg_restore`, update pgbouncer databases.ini on app nodes, verify.

- [ ] **Task E.5: Write `docs/runbooks/cert-renewal.md`**

Content: how `/opt/rawdrive/renew-ssl.sh` works, how to run it manually, how to switch between webroot and DNS-01 modes, how to debug failures (rate limit, DNS propagation, etc.).

- [ ] **Task E.6: Write `docs/runbooks/rolling-deploy.md`**

Content: use `deploy/scripts/deploy-app.sh`, deploy to .42 first, verify healthy via `/api/v1/health/ready`, then deploy to .44. What to do if health check fails mid-deploy.

- [ ] **Task E.7: Write `docs/runbooks/scale-out-4th-node.md`**

Content: the 9-step migration from spec §8.2. Provision .48, run Phase A on it, pg_basebackup from .46 to .48, flip replica role from .44 to .48 via Compose profiles, decommission .44 replica, update all runbooks to reference .48.

- [ ] **Step 8: Commit all runbooks**

```bash
git add docs/runbooks/
git commit -m "docs(runbooks): add 6 operational runbooks for bootstrapped prod stack"
```

---

### Task E.8: Cloudflare orange-cloud flip

- [ ] **Step 1: Get the Cloudflare zone ID**

Run:
```bash
CF_TOKEN="<CLOUDFLARE_API_TOKEN>"
ZONE_ID=$(curl -fsS -X GET "https://api.cloudflare.com/client/v4/zones?name=rawdrive.in" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.result[0].id')
echo "Zone: $ZONE_ID"
```
Expected: a 32-char hex string.

- [ ] **Step 2: List current DNS records**

Run:
```bash
curl -fsS -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A" \
    -H "Authorization: Bearer $CF_TOKEN" \
    | jq '.result[] | {id, name, content, proxied}'
```
Expected: 6 records (apex × 2, www × 2, api × 2), all `proxied: false`.

- [ ] **Step 3: Flip each record to proxied**

Run for each record ID from Step 2 (let's assume you capture them in a variable):
```bash
RECORDS=$(curl -fsS -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A" \
    -H "Authorization: Bearer $CF_TOKEN" | jq -r '.result[] | "\(.id) \(.name) \(.content)"')

while read -r ID NAME CONTENT; do
    echo "Flipping $NAME ($CONTENT) to proxied..."
    curl -fsS -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$ID" \
        -H "Authorization: Bearer $CF_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"proxied\": true}" | jq '.result.proxied'
done <<< "$RECORDS"
```
Expected: six `true` outputs.

- [ ] **Step 4: Wait 2 min for propagation, then verify CF headers**

Run:
```bash
sleep 120
curl -fsSI https://rawdrive.in/ | grep -i 'cf-ray\|server:\|cf-cache'
```
Expected: `cf-ray`, `server: cloudflare`, `cf-cache-status` headers present.

- [ ] **Step 5: End-to-end smoke through CF proxy**

Run: `curl -fsS https://api.rawdrive.in/api/v1/health`
Expected: still 2xx JSON — CF proxy forwards to origin transparently.

---

### Task E.9: Switch cert renewal to DNS-01

- [ ] **Step 1: Write Cloudflare API token file on both app nodes**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44; do
  ssh root@$ip 'mkdir -p /etc/letsencrypt && cat > /etc/letsencrypt/cloudflare.ini' <<'CF_EOF'
dns_cloudflare_api_token = <CLOUDFLARE_API_TOKEN>
CF_EOF
  ssh root@$ip 'chmod 600 /etc/letsencrypt/cloudflare.ini'
done
```

- [ ] **Step 2: Dry-run DNS-01 renewal from .42**

Run:
```bash
ssh root@187.127.142.42 'docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    certbot/certbot:latest \
    renew --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    --dry-run'
```
Expected: `The dry run was successful.`

- [ ] **Step 3: Update cron to use DNS-01 mode**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44; do
  ssh root@$ip 'crontab -l | sed "s|CERTBOT_MODE=webroot|CERTBOT_MODE=dns-01|" | crontab -'
  ssh root@$ip 'crontab -l | grep renew-ssl'
done
```
Expected: cron lines now include `CERTBOT_MODE=dns-01`.

---

### Task E.10: Apply Cloudflare edge rules

- [ ] **Step 1: API bypass rule for api.rawdrive.in**

Cloudflare "Rules → Cache Rules" cannot be cleanly set via the same simple API; this step is often easier via the dashboard. If so, document in the Phase E summary that you configured them manually:

- Cache Rule 1: Hostname `api.rawdrive.in` → Cache level: Bypass
- Cache Rule 2: URI Path starts_with `/_next/static/` → Cache level: Cache Everything, Edge TTL: 1 month
- Page Rule: `www.rawdrive.in/*` → Forwarding URL 301 → `https://rawdrive.in/$1`

Mark this step complete when done via the dashboard. (Scripted API call omitted — CF dashboard is faster and more reliable for page rules.)

- [ ] **Step 2: Verify SSL/TLS mode**

Run:
```bash
curl -fsS -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/ssl" \
    -H "Authorization: Bearer $CF_TOKEN" | jq '.result.value'
```
Expected: `"full"` or `"strict"`. If anything else, PATCH it to `strict`.

---

### Task E.11: Final verification

- [ ] **Step 1: Full smoke test through Cloudflare**

Run:
```bash
curl -fsS https://rawdrive.in/ | head -10
curl -fsS https://api.rawdrive.in/api/v1/health
curl -fsS https://api.rawdrive.in/api/v1/health/ready
```
Expected: all 2xx. `/health/ready` shows `db: ok`, `valkey: ok`.

- [ ] **Step 2: Verify all containers healthy on both app nodes and DB node**

Run:
```bash
for ip in 187.127.142.42 187.127.142.44 187.127.142.46; do
  echo "=== $ip ==="
  ssh root@$ip 'docker ps --format "table {{.Names}}\t{{.Status}}"'
done
```
Expected: all containers show `Up X (healthy)`.

- [ ] **Step 3: Delete the local scratch secrets file**

Run: `shred -u /tmp/rawdrive-secrets.env 2>/dev/null || rm -f /tmp/rawdrive-secrets.env`

- [ ] **Step 4: Final commit of any remaining docs**

Run: `git status && git log --oneline -20`
Expected: clean tree, recent commits include the spec, Phase 0 scaffolding, Phase E runbooks, and the HostingerServerDetails.md untrack.

- [ ] **Step 5: Write the final deployment summary**

Create `docs/runbooks/DEPLOYMENT-2026-04-11.md` summarizing:
- What was deployed
- Measured Phase D drill times (failover RTO, etc.)
- Known deferred items (worker container if not enabled, R2 lifecycle if manual, observability stub)
- Credentials location (`.env` on each server, never committed)
- Next recommended follow-ups (rotate external creds, observability stack, history purge)

Commit: `git add docs/runbooks/DEPLOYMENT-2026-04-11.md && git commit -m "docs: production bootstrap deployment summary 2026-04-11"`

---

## Self-Review Checklist

- [x] **Spec coverage:** Every spec section maps to at least one task. §3.1 topology → Phase 0 scaffolding + Phase B/C bring-up. §4 HA matrix → Phase D drills. §5.1 in-scope items → Phases 0–E. §8 scaling triggers → E.7 scale-out runbook. §9 runbooks → Tasks E.2–E.7. §11 approvals → context header.
- [x] **Placeholder scan:** No TBD, TODO, FIXME, or "implement later" markers. The few `<POSTGRES_PASSWORD>` markers are intentional placeholders for runtime-generated secrets — they are NOT code placeholders, they're escape points where the operator substitutes real values from Task B.1.
- [x] **Type consistency:** `Migrator` has no context argument (verified against `backend/internal/database/database.go:27`). pgbouncer placement is on app nodes throughout (not on .46). `PEER_NODE_IP` is consistently `.44` on `.42` and `.42` on `.44`. NATS node names are `nats-1`, `nats-2`, `nats-3`. All cross-task references use these exact names.
- [x] **Script permissions:** All shell scripts get `chmod +x` before commit or use (Task 0.12 Step 5; T1.7 Step 1; T0.12 step for promote script).

**Known plan shortcuts (accepted trade-offs):**
- Task E.10 (Cloudflare page rules) defers to the CF dashboard rather than scripting the API. CF Rules API is inconsistent and manual is faster.
- Worker container in `docker-compose.prod-app.yml` is behind a `--profile worker` flag and may be unused if the backend has no `--mode=worker` flag. Task 0.11 Step 3 checks this; if absent, the profile is simply never activated and image processing remains inline. Documented as follow-up.
- R2 lifecycle policy (Task B.8) may fail if R2's S3 API doesn't support `PutBucketLifecycleConfiguration` — the task tolerates this and defers to the CF dashboard.

**Fixed during self-review:** Tasks C2.1–C2.11 were originally abbreviated as "same as C1.x with substitutions". Now fully expanded with every command, per the writing-plans skill's prohibition on "Similar to Task N" shortcuts.

---

*End of implementation plan.*
