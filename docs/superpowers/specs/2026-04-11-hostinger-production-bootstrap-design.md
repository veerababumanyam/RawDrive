# RawDrive Production Bootstrap — Design

| Field | Value |
|---|---|
| Status | Approved (pending user spec review) |
| Date | 2026-04-11 |
| Author | Claude (agent) + Manyam Prasad (approver) |
| Target environment | 3× Hostinger KVM VPS (Ubuntu 24.04 LTS, 8 GB RAM, 2 vCPU, 96 GB disk) |
| Scale target | 10,000 registered users (~500–1,500 DAU, ~50–200 concurrent peak) |
| Deployment mode | Greenfield. DNS pre-wired, grey-cloud, no existing users |
| Related | `HostingerServerDetails.md`, `AGENTS.md`, `backend/AGENTS.md`, `frontend/AGENTS.md` |

---

## 1. Goal

Bring up the full RawDrive production stack across three fresh Hostinger VPSes in active-active HA with load balancing, built to serve 10,000 registered users without re-architecting, with a documented migration path to a 4-node cluster when defined scaling triggers fire. Every operational task (failover, cert renewal, backup restore, rolling deploy, scaling out) ships with a written runbook.

Success criteria for "ready to host":

1. `https://rawdrive.in`, `https://www.rawdrive.in`, `https://api.rawdrive.in` all return healthy from a cold start via both app nodes.
2. A throwaway user can register → login → fetch `/api/v1/workspace` end-to-end over the real domain.
3. Stopping `backend` on either app node does not drop user traffic (peer-backup upstream failover verified).
4. Promoting the Postgres replica while the primary is stopped produces a fully functional read/write service on the replica host (failover drill verified and failed back).
5. A `pg_dump` artifact from tonight lands in the Cloudflare R2 `rawdrive-backups` bucket and can be round-tripped into a local test container (restore rehearsal).
6. `HostingerServerDetails.md` is removed from git tracking; internal secrets (Postgres, Valkey) are rotated before first go-live.

---

## 2. Context and findings from exploration

### 2.1 Server state (verified via SSH)

| IP | Doc hostname | Actual hostname | OS | Services installed |
|---|---|---|---|---|
| 187.127.142.42 | rawdrive-app1 | srv1548339 | Ubuntu 24.04, kernel 6.8.0-106 | **None** — blank VPS |
| 187.127.142.44 | rawdrive-app2 | srv1548346 | Ubuntu 24.04, kernel 6.8.0-106 | **None** — blank VPS |
| 187.127.142.46 | rawdrive-db | srv1548352 | Ubuntu 24.04, kernel 6.8.0-106 | **None** — blank VPS |

All three boxes have uptime ~7 days, load average 0.00, and no Docker, no `/opt/rawdrive/`, no nginx, nothing the production doc references.

### 2.2 Repository state

The production doc (`HostingerServerDetails.md`) describes a `deploy/` directory with Compose files, Nginx templates, deploy scripts, and per-service Dockerfiles. **None of these exist in the repo.** Glob searches confirm:

- No `deploy/**`
- No `Dockerfile*` anywhere in the tree
- No `docker-compose.prod-*.yml`
- No `backend/Dockerfile` or `frontend/Dockerfile`
- No Nginx templates

All of this must be authored as Phase 0 of this bootstrap. The only `docker-compose.yml` files are the local-dev one at repo root and the `_cobolt-docker/` tooling compose.

### 2.3 DNS state

`rawdrive.in` resolves directly to `187.127.142.42` (single A record).  
`api.rawdrive.in` resolves to both `187.127.142.42` and `187.127.142.44` (two A records, DNS round-robin).  
This is **grey-cloud** direct exposure, not orange-cloud proxy despite the doc stating otherwise. Cloudflare is managing DNS only, not terminating TLS at the edge.

### 2.4 Secret exposure

`HostingerServerDetails.md` is tracked in git (`git ls-files` confirmed exit 0). Every secret in the file must be treated as compromised by anyone who has ever cloned the repo. User decision: rotate internal secrets (Postgres, Valkey), leave external service tokens (R2, Cloudflare, SMTP, MoonShot, OAuth) as-is for this session with explicit follow-up rotation planned.

### 2.5 SSH access

Verified working on all three hosts via `~/.ssh/id_ed25519` (pubkey `AAAA...IG74I...`, comment `manyamprasad@gmail.com`, fingerprint `SHA256:Y2r5k7oJuK6K6GBQsDVkKJLkTVZp1FWmBFRZCbO1/T4`). SSH is key-only, root password auth is disabled.

---

## 3. Architecture

### 3.1 Topology diagram

```
                   Cloudflare (orange-cloud after Phase E)
                   ├─ WAF
                   ├─ Edge cache for /_next/static/*
                   ├─ DDoS protection
                   └─ DNS (two A records per hostname)
                                │
                     ┌──────────┴───────────┐
                     │                      │
                .42 (App1)             .44 (App2)
                ┌──────────┐           ┌──────────┐
                │  nginx   │◄─────────►│  nginx   │  HA upstream: local primary,
                │ :80/443  │           │ :80/443  │  peer backup, proxy_next_upstream
                ├──────────┤           ├──────────┤
                │ backend  │           │ backend  │  Go API → 127.0.0.1:6432 (local pgbouncer)
                ├──────────┤           ├──────────┤
                │pgbouncer │           │pgbouncer │  :6432 transaction mode, pool_size=20
                │          │           │          │  databases.ini → current DB primary
                ├──────────┤           ├──────────┤
                │ frontend │           │ frontend │  Next.js standalone output
                ├──────────┤           ├──────────┤
                │ worker   │           │ worker   │  NATS JetStream consumer
                ├──────────┤           ├──────────┤
                │ NATS-1   │◄─────────►│ NATS-2   │  3-node JetStream cluster
                ├──────────┤           ├──────────┤
                │ valkey   │           │ postgres │  valkey REPLICA   postgres REPLICA
                │ replica  │           │ replica  │  (hot standby)    (hot standby)
                └────┬─────┘           └────┬─────┘
                     │                      │
                     └──────────┬───────────┘
                                │
                           .46 (DB)
                           ┌────────────┐
                           │postgres    │  :5432 PRIMARY, pgvector, WAL sender→.44
                           ├────────────┤
                           │valkey      │  :6379 PRIMARY, AOF, replica→.42
                           ├────────────┤
                           │NATS-3      │  3-node cluster quorum member
                           └──────┬─────┘
                                  │
                         nightly pg_dump +
                         weekly pg_basebackup
                                  │
                                  ▼
                          Cloudflare R2
                     bucket: rawdrive-backups
                     lifecycle: 30 daily, 12 monthly, 7 yearly
```

### 3.2 Component placement with memory budget

| Node | Service | Peak RSS | Notes |
|---|---|---:|---|
| **.42 App1** | nginx | 100 MB | |
| | backend (Go) | 800 MB | pgxpool max 40 conns → local pgbouncer |
| | pgbouncer | 100 MB | transaction pooling, `databases.ini` → current primary |
| | frontend (Next.js) | 1.5 GB | standalone output |
| | worker | 600 MB | image processing |
| | NATS-1 | 300 MB | JetStream cluster node |
| | valkey replica | 400 MB | read-only hot standby |
| | **Total** | **~3.8 GB** | 4.2 GB headroom on 8 GB box |
| **.44 App2** | nginx | 100 MB | |
| | backend (Go) | 800 MB | |
| | pgbouncer | 100 MB | local pooling layer, same pattern as `.42` |
| | frontend (Next.js) | 1.5 GB | |
| | worker | 600 MB | |
| | NATS-2 | 300 MB | |
| | **postgres replica** | 2 GB | shared_buffers=1.5GB |
| | **Total** | **~5.4 GB** | 2.6 GB headroom — tightest node |
| **.46 DB** | postgres PRIMARY | 3 GB | shared_buffers=2GB |
| | valkey PRIMARY | 500 MB | AOF persistence |
| | NATS-3 | 300 MB | |
| | **Total** | **~3.8 GB** | 4.2 GB headroom |

Why Postgres replica on `.44` and Valkey replica on `.42` (not both on the same node): distributes the replication memory cost across both app nodes so neither becomes disproportionately loaded. When `.44` is eventually migrated to a dedicated 4th DB node, `.42` keeps its valkey replica duty without any topology change.

### 3.3 Technology choices (locked)

| Layer | Choice | Version / Image | Rationale |
|---|---|---|---|
| Container runtime | Docker CE + Compose v2 | from `download.docker.com` apt repo | Reproducible, matches doc |
| Reverse proxy | nginx | `nginx:1.27-alpine` | Doc alignment, small footprint |
| Backend runtime | Go 1.23 (build) → Alpine 3.19 (run) | multi-stage | Static binary, ~20 MB image |
| Frontend runtime | Node 20 Alpine (build + run) | multi-stage, Next.js `output: 'standalone'` | Smallest Next.js production image |
| Message bus | NATS JetStream cluster | `nats:2.11-alpine` | 3-node Raft quorum for HA |
| Primary DB | PostgreSQL 17 + pgvector | `pgvector/pgvector:pg17` | Matches doc + AGENTS.md |
| Connection pooler | PgBouncer | `edoburu/pgbouncer:latest` | Transaction-mode pooling, survives upload bursts |
| Cache / session store | Valkey 9 | `valkey/valkey:9.0-alpine` | Matches doc |
| Certs | Let's Encrypt | `certbot/certbot:latest` one-shot | webroot HTTP-01 for initial issuance, DNS-01 via Cloudflare API after orange-cloud flip |
| Firewall | UFW + fail2ban | Ubuntu 24.04 packages | Simple, stock, auditable |
| Unattended patches | unattended-upgrades (security pocket only) | Ubuntu package | Passive patching, won't reboot |
| Backup client | rclone | apt package | R2-compatible, supports lifecycle |
| Observability | stubs only (JSON logs, metrics endpoints) | N/A | Follow-up session |

---

## 4. HA failure matrix

Every failure mode with explicit RTO, RPO, and operator steps.

| Failure | User-visible impact | RTO | RPO | Manual steps | Runbook |
|---|---|---|---|---|---|
| `.42` reboots | None — `.44` serves via peer-backup | 0 | 0 | None | — |
| `.44` reboots | None for app users. Postgres replica offline until `.44` returns (primary unaffected) | 0 for app, minutes for replica | 0 | None | — |
| `.46` reboots | Brief DB errors (~2 min). pgbouncer returns errors, backend retries, nginx returns 502 during window | ~2 min | 0 | None | — |
| backend container dies | `unless-stopped` restart. Meanwhile peer takes traffic | <30 s | 0 | None | — |
| Postgres primary disk dies | Promote `.44` replica | 3–5 min | ≤5 s (async replica lag) | `pg_ctl promote` on `.44`, update `pgbouncer/databases.ini` on `.42` to point at `187.127.142.44:5432`, update same on `.44` to point at `127.0.0.1:5432`, `kill -HUP pgbouncer` on both. Backend keeps running; connections re-open transparently. | `postgres-failover.md` |
| Valkey primary dies | Promote `.42` replica | 2 min | Session state only (bounded) | `valkey-cli REPLICAOF NO ONE` on `.42`, update `VALKEY_URL` in `.env` on both app nodes, restart backend | `valkey-failover.md` |
| Both `.46` and `.44` die simultaneously | **Restore from R2** | 30–60 min | ≤24 h (latest nightly dump) | Provision new VPS, install pg, `rclone copy`, `pg_restore`, update `.env`, restart | `disaster-recovery-from-r2.md` |
| Full Hostinger datacenter offline | Same as above, different provider | 60–120 min | ≤24 h | Same as above, different cloud | same runbook, supplier-agnostic |
| Cloudflare R2 outage | Photos unavailable, app metadata still works | Cloudflare SLA | 0 | Wait out the outage. R2 has 99.9%+ SLA | — |
| Let's Encrypt cert expires | nginx refuses HTTPS | Cloudflare keeps serving via edge cert. Origin broken until renewal | 0 | Manual `certbot renew`, nginx reload | `cert-renewal.md` |
| fail2ban bans an admin IP during ops | SSH locked out | Minutes | 0 | Hostinger web console → `fail2ban-client set sshd unbanip <ip>` | covered inline in runbooks |

No silent SPOF in the happy path. Explicit manual-promote choice over automated failover: Patroni / Consul / etcd is inappropriate for 3 nodes and adds more surface area than it removes.

---

## 5. Scope

### 5.1 In scope (this session)

**Infrastructure (all 3 nodes):**
- Base OS hardening: UFW default-deny, explicit port allow-list, fail2ban sshd jail, SSH tightening (`PermitRootLogin prohibit-password`, `MaxAuthTries 3`, `ClientAliveInterval 120`), unattended-upgrades security pocket, hostname set per doc, timezone `Asia/Kolkata`
- Kernel tuning via `/etc/sysctl.d/99-rawdrive.conf`: `net.core.somaxconn=65535`, `net.core.netdev_max_backlog=65535`, `net.ipv4.tcp_max_syn_backlog=65535`, `net.ipv4.tcp_tw_reuse=1`, `net.ipv4.tcp_fin_timeout=30`, `net.ipv4.ip_local_port_range=1024 65535`, `fs.file-max=2097152`, `net.netfilter.nf_conntrack_max=524288`, plus `vm.swappiness=10` and `vm.overcommit_memory=1` for DB node
- 4 GB swapfile on each node (`/swapfile`, swappiness-gated)
- Docker CE + Compose v2 installed from official Docker apt repo
- `/opt/rawdrive/{app,backups}` directory tree

**Local repository scaffolding (Phase 0):**
- `deploy/docker-compose.prod-db.yml`
- `deploy/docker-compose.prod-app.yml` (includes one-shot `migrate` service that runs before `backend`)
- `deploy/nginx/nginx.conf` (main config)
- `deploy/nginx/templates/rawdrive.conf.template` (site config with `${PEER_NODE_IP}` envsubst)
- `deploy/postgres/postgresql.conf` (tuned for 8 GB RAM)
- `deploy/postgres/pg_hba.conf` (restricted to app-node IPs + replica host)
- `deploy/postgres/init/01-create-replication-role.sql`
- `deploy/postgres/init/02-create-extensions.sql` (pgvector, pg_stat_statements)
- `deploy/pgbouncer/pgbouncer.ini`, `deploy/pgbouncer/userlist.txt`, `deploy/pgbouncer/databases.ini` (templated with current primary host)
- `deploy/valkey/valkey.conf` (primary), `deploy/valkey/valkey-replica.conf`
- `deploy/nats/nats-server.conf` (3-node JetStream cluster)
- `backend/Dockerfile` (multi-stage Go build, produces both `api` and `migrate` binaries)
- `backend/cmd/migrate/main.go` (new ~30-line binary that calls `database.NewMigrator(pool, logger).Up(ctx)` and exits with status 0 on success; imports existing migrator, no new dependencies)
- `frontend/Dockerfile` (multi-stage Next.js standalone)
- `deploy/scripts/deploy-app.sh` (rolling deploy driver)
- `deploy/scripts/renew-ssl.sh` (cert renewal wrapper)
- `deploy/scripts/backup-db.sh` (pg_dump + rclone upload)
- `deploy/scripts/promote-postgres-replica.sh` (emergency promotion)
- `deploy/.env.example` (documented env var schema)
- `docker-compose.observability.yml.example` (stub for follow-up)

**Small backend code change required (Phase 0):** `backend/cmd/migrate/main.go` is a new binary. It's ~30 lines of Go that imports the already-existing `backend/internal/database.Migrator`, opens a pgx pool from `DATABASE_URL`, calls `.Up(ctx)`, and exits. This is the only application-code change in this session. The `Migrator` type itself already exists (`backend/internal/database/database.go:16-105`) and is used today only from tests; we're giving it a production entry point. No changes to existing files.

**Data plane (Phase B + B.5):**
- Postgres PRIMARY on `.46` with tuned config, pgvector extension, pg_stat_statements extension, `wal_level=replica`, `max_wal_senders=5`, `archive_mode=off`, replication slot for `.44`
- Valkey PRIMARY on `.46` with AOF persistence
- PgBouncer on both `.42` and `.44` (not on `.46`) in transaction mode, pool_size=20 per database, `databases.ini` pointing at current primary — `127.0.0.1` is never the primary in happy state (primary is remote at `.46`), but this is what keeps failover restart-free
- Postgres REPLICA on `.44` via `pg_basebackup`, continuously streaming from `.46`
- Valkey REPLICA on `.42` via `replicaof`
- Backend schema migrations applied against the primary via a new one-shot `migrate` container (see Phase 0 code changes below)
- Nightly `pg_dump` → R2 via rclone (cron `0 2 * * *`)
- Weekly `pg_basebackup` → R2 via rclone (cron `0 4 * * 0`)
- R2 bucket `rawdrive-backups` with lifecycle: 30 daily, 12 monthly, 7 yearly
- Restore rehearsal: pull latest dump from R2 into a local test container, verify `SELECT count(*) FROM users`

**App plane (Phase C):**
- Backend + frontend + worker + NATS + nginx containers on both `.42` and `.44`
- NATS JetStream 3-node cluster quorum across `.42` / `.44` / `.46`
- Source code pushed via `tar | ssh | tar -x` (excludes `node_modules`, `.git`, `.next`, `deploy/.env`, `.env*`)
- Images built on-server with `docker compose build --no-cache`
- `/opt/rawdrive/app/.env` on all nodes with rotated internal secrets + external-service creds as-is from `HostingerServerDetails.md`, mode 600, owner root
- `/opt/rawdrive/app/deploy/.env` with `PEER_NODE_IP` per node (never overwritten by tar push)
- Let's Encrypt webroot HTTP-01 issuance for `rawdrive.in`, `www.rawdrive.in`, `api.rawdrive.in` from `.42`, rsync to `.44`, cron renewal at `0 3,15 * * *`
- nginx HA upstream with `proxy_next_upstream error timeout http_502 http_503 http_504`, 32 keepalive backend, 16 keepalive frontend

**Security (Phase C and E):**
- Rotate internal secrets: 48-char hex random Postgres password, 48-char hex random Valkey password. Generated on the provisioning machine via `openssl rand -hex 24` and written only to server-side `.env` files; never committed.
- `git rm --cached HostingerServerDetails.md`
- Add `HostingerServerDetails.md` to `.gitignore`
- Commit removal with message explaining why

**Smoke testing (Phase D):**
- `/api/v1/health` from both hostnames
- `/api/v1/health/ready` (DB + Valkey reachability)
- Full register → login → workspace flow with throwaway user, then delete the user
- HA failover drill: stop `deploy-backend-1` on `.42`, re-run dashboard fetch, confirm `.44` serves. Restart. Stop nginx on `.42`, re-test. Restart.
- **Postgres failover drill**: stop primary, promote `.44` replica, verify app recovers, fail back to original primary. Run on a fresh test user row so there's nothing real to lose.

**Cloudflare migration (Phase E):**
- Flip DNS records from grey-cloud to orange-cloud
- Switch cert renewal to DNS-01 via Cloudflare API token
- Configure edge cache page rules per the doc (API bypass, `_next/static` 1-month TTL, www redirect)
- Verify SSL/TLS mode is "Full (Strict)"

**Documentation (Phase E):**
- `docs/runbooks/postgres-failover.md`
- `docs/runbooks/valkey-failover.md`
- `docs/runbooks/disaster-recovery-from-r2.md`
- `docs/runbooks/cert-renewal.md`
- `docs/runbooks/rolling-deploy.md`
- `docs/runbooks/scale-out-4th-node.md`

### 5.2 Out of scope (explicit follow-ups)

| Item | Why deferred |
|---|---|
| Automated DB failover (Patroni/Stolon/Consul) | Too much operational complexity for 3 nodes |
| Observability stack live (Prometheus/Grafana/Loki/alerting) | Dedicated focused session needed; stubs are in place |
| External service secret rotation (R2, Cloudflare, SMTP, MoonShot, OAuth) | User decision; needs interactive dashboard access |
| Git history purge of `HostingerServerDetails.md` | Destructive operation; needs its own session with coordination |
| GitHub Actions CI/CD pipeline | Doc says "to be added", not this session's scope |
| Decommission of Fly.io / Neon / Upstash | Separate cleanup project |
| DB data migration from previous environment | Greenfield — nothing to migrate |
| Seeding platform test users from `backend/seeds/` | Only if explicitly requested post-smoke-test |
| Dedicated worker node | Current workload fits on app nodes; revisit at scale trigger |
| 4th VPS for dedicated replica | Current workload doesn't justify; runbook documents how to add |

---

## 6. Phased execution plan

### Phase 0 — Local scaffolding (no server touch)

Write all deploy scaffolding and Dockerfiles locally. Validate `docker compose config` where possible. Check backend for:

1. Migration tool in use (goose, sql-migrate, golang-migrate, raw SQL, or Go code). Block on this — if none found, Phase 0 includes writing a minimal migration runner. **This is a Phase 0 gate. Do not proceed to Phase A without resolution.**
2. Next.js `output: 'standalone'` config. If absent, either enable it or fall back to running `next start` with full `node_modules` in the runtime image.
3. Full `.env` variable list that the Go config loader reads. Cross-reference against `HostingerServerDetails.md` — if any required var is missing from the doc, stop and ask before touching Phase A.
4. Whether the current backend publishes upload-processing events to NATS or runs it inline. If inline, the `worker` container pattern is deferred — a Compose-file stub remains but is not started. This is documented as a known limitation with a follow-up.

### Phase A — OS baseline (all 3 nodes)

- `apt update && apt -y dist-upgrade`
- Install: `docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin ufw fail2ban unattended-upgrades rclone curl ca-certificates gnupg lsb-release rsync jq openssl`
- UFW: default deny incoming, allow `22/tcp` from anywhere on all nodes; allow `80/tcp` + `443/tcp` on `.42` + `.44`; allow `5432/tcp`, `6432/tcp`, `6379/tcp` on `.46` **only from** `.42` and `.44`; allow inter-node ports (`4222`, `8222`, `8080`, `3000`) peer-to-peer only
- fail2ban: enable `sshd` jail, 5 retries, 1 h ban
- SSH tightening (`/etc/ssh/sshd_config.d/99-rawdrive.conf`)
- `unattended-upgrades`: enable, security pocket only, no automatic reboot
- Hostname: `rawdrive-app1` / `rawdrive-app2` / `rawdrive-db`
- Timezone: `Asia/Kolkata`
- `/etc/sysctl.d/99-rawdrive.conf` applied (see 5.1)
- 4 GB `/swapfile` created, fstab entry added
- `/opt/rawdrive/{app,backups}` created
- Smoke check: `docker run hello-world` on each node

### Phase B — DB primary (`.46`)

- Push `deploy/docker-compose.prod-db.yml`, `deploy/postgres/`, `deploy/valkey/`, `deploy/nats/` to `.46` via tar (pgbouncer is NOT deployed here — it runs on the app nodes in Phase C)
- Generate internal secrets: `openssl rand -hex 24` for Postgres password, same for Valkey password
- Write `/opt/rawdrive/app/.env` on `.46` (DB server-side values)
- `docker compose -f deploy/docker-compose.prod-db.yml up -d postgres valkey nats`
- Verify: `pg_isready`, `valkey-cli -a <pw> ping`, `psql -c "CREATE EXTENSION IF NOT EXISTS vector"`, `nats-server --version` inside container
- Apply backend migrations against the primary using whatever tool Phase 0 confirmed
- Install `/opt/rawdrive/backup-db.sh` and cron `0 2 * * *` for nightly `pg_dump` → R2
- Install weekly `pg_basebackup` → R2 cron at `0 4 * * 0`
- Configure R2 lifecycle policy on the `rawdrive-backups` bucket
- Manual backup run: verify dump exists in R2, download it, restore into a local test container, `SELECT count(*) FROM users` returns zero (fresh DB)

### Phase B.5 — Postgres replica (`.44`)

- SSH into `.44`, create `/var/lib/postgresql/data` via Docker volume
- Run `pg_basebackup -h 187.127.142.46 -D /var/lib/postgresql/data -U replicator -X stream -P -R`
- Write standby config (`primary_conninfo`, `restore_command`, `hot_standby=on`)
- Start replica via Compose stanza in `docker-compose.prod-app.yml`
- Verify replication lag: `SELECT * FROM pg_stat_replication` on primary returns an entry with state=`streaming`, lag < 5 s
- Verify read queries against replica return data matching primary

### Phase C — App nodes (`.42` then `.44`, sequential)

For each app node:

1. Push full source tree via `tar --exclude=node_modules --exclude=.git --exclude=.next --exclude=deploy/.env --exclude='.env*' | ssh | tar -x`
2. Write `/opt/rawdrive/app/.env` with rotated DB + Valkey URLs (DB URL points at `127.0.0.1:6432` for local pgbouncer, which itself points at the Postgres primary at `.46:5432`) + external credentials from `HostingerServerDetails.md`
3. Write `/opt/rawdrive/app/deploy/.env` with `PEER_NODE_IP` (= the other node's IP)
4. Write `/opt/rawdrive/app/deploy/pgbouncer/databases.ini` with Postgres primary host `187.127.142.46:5432`
5. `docker compose -f deploy/docker-compose.prod-app.yml build --no-cache` (builds `api`, `migrate`, `frontend` images)
6. Start foundational services first: `docker compose -f deploy/docker-compose.prod-app.yml up -d pgbouncer nats`
7. Run the one-shot migration service **on `.42` only** (first time) to apply all schema migrations against the primary: `docker compose -f deploy/docker-compose.prod-app.yml run --rm migrate`. Verify it exits 0 and `schema_migrations` contains the expected rows.
8. Start the rest: `docker compose -f deploy/docker-compose.prod-app.yml up -d backend frontend worker`
9. On `.42` only: run certbot one-shot via webroot HTTP-01 for all three hostnames. Dry-run first.
10. Rsync `/etc/letsencrypt/` from `.42` to `.44`
11. Install `renew-ssl.sh` + cron `0 3,15 * * *` on both
12. Start nginx on both nodes with real cert paths
13. Additional on `.42`: start valkey replica container
14. Additional on `.44`: start postgres replica container (done in Phase B.5, verify here)
15. Verify: `curl https://rawdrive.in/api/v1/health` returns 2xx; `curl https://api.rawdrive.in/api/v1/health/ready` returns `{"status":"ok","db":"ok","valkey":"ok"}`

### Phase D — Smoke test + HA drills

1. **E2E smoke:** `POST /api/v1/auth/password/register` → 2xx, verify user row in DB. `POST /api/v1/auth/password/login` → JWT. `GET /api/v1/workspace` with JWT → 2xx. `DELETE` the throwaway user row.
2. **App HA drill:** `docker stop deploy-backend-1` on `.42`. Re-run `GET /api/v1/workspace` against `rawdrive.in`. Confirm success via `.44` peer backup. `docker start deploy-backend-1`.
3. **Nginx HA drill:** `docker stop deploy-nginx-1` on `.42`. Re-run, confirm DNS round-robin drops `.42` and hits `.44` directly (or fallback behavior as designed).
4. **Postgres failover drill:** Create a test row with a known ID. Stop postgres primary on `.46`. Promote `.44` replica (`docker exec deploy-postgres-replica-1 pg_ctl promote -D /var/lib/postgresql/data`). On `.42`: edit `/opt/rawdrive/app/deploy/pgbouncer/databases.ini` to point `host=187.127.142.44` and `kill -HUP $(pidof pgbouncer)` inside the container (or `docker compose restart pgbouncer`). On `.44`: edit the same file to point `host=127.0.0.1` and reload. Backend is NOT restarted. Verify `SELECT` of the test row works and new inserts succeed (pgbouncer has routed connections to promoted primary). Measure wall-clock time from `docker stop` to next-successful-write. **Fail back:** bring up a fresh Postgres primary on `.46` from a `pg_basebackup` taken off the promoted `.44`, flip pgbouncer `databases.ini` on both app nodes back to `.46`, reload pgbouncer, re-establish replication from `.46` → `.44`. Document exact wall-clock time of each step into `docs/runbooks/postgres-failover.md`.
5. **Backup restore drill:** Pull latest R2 dump on a local machine, restore into a disposable Postgres container, verify schema matches and the test row exists.

### Phase E — Cleanup + Cloudflare migration

1. **Secret hygiene:** `git rm --cached HostingerServerDetails.md`, append to `.gitignore`, commit.
2. **Runbook authoring:** Write all 6 runbooks in `docs/runbooks/` with the exact commands used during Phase D drills.
3. **Cloudflare orange-cloud flip:**
   - Via Cloudflare API (token from doc), flip proxy status on all 6 A records from grey to orange
   - Wait 2 min for propagation
   - Verify `curl -v https://rawdrive.in` shows Cloudflare headers
   - Verify end-to-end flow still works (proxied path)
4. **Switch cert renewal to DNS-01:**
   - Install `certbot-dns-cloudflare` plugin
   - Store Cloudflare API token in `/etc/letsencrypt/cloudflare.ini` mode 600
   - Update `renew-ssl.sh` to use `--dns-cloudflare` instead of `--webroot`
   - Dry-run renewal via DNS-01
5. **Cloudflare edge rules:** Apply the three page rules (API bypass, `/_next/static` cache, www redirect) via Cloudflare API.
6. **Verify SSL/TLS mode** is "Full (Strict)" on Cloudflare.
7. **Final summary report:** What was deployed, where secrets live, what follow-ups remain.

---

## 7. Risks and mitigations

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| 1 | ~~Backend migration tool not discoverable~~ | — | — | **Resolved during self-review.** Migrator exists at `backend/internal/database/database.go:16`; currently only used from tests. Mitigation: author `backend/cmd/migrate/main.go` in Phase 0 (new ~30-line binary), compile alongside `api` in the same multi-stage Dockerfile, run as a one-shot Compose service (`depends_on: postgres`, `restart: no`) before backend starts on each app node. |
| 2 | Next.js config doesn't enable `output: 'standalone'` | Medium | Larger images, slower builds | Phase 0 adjustment: edit `next.config.js` to add standalone output, OR fall back to full `node_modules` runtime. Either works. |
| 3 | Backend reads env vars not documented in `HostingerServerDetails.md` | Medium | Backend container crashes on boot | Phase 0: read `backend/internal/config/...` fully, generate complete `.env.example`, cross-reference with doc. Halt if required var missing. |
| 4 | Let's Encrypt rate limit hit during repeated certbot attempts | Low | Blocks HTTPS for 1 h | `--dry-run` first, then single real run, then rsync to peer. Never re-issue from `.44`. |
| 5 | fail2ban bans the provisioning IP during Phase A | Low | SSH lockout | fail2ban is installed as part of Phase A itself — no bans exist before that point. Also Hostinger web console is available as fallback. |
| 6 | `.44` RAM saturation with postgres replica + full app stack | Medium | Swap thrashing, latency spikes | Budgeted at ~5.3 GB (under 70% of 8 GB). Monitor closely post-go-live. Documented trigger for 4th-node migration. |
| 7 | NATS cluster Raft instability with inter-VPS latency | Low | Queue unavailability under network jitter | All 3 VPSes are in same Hostinger DC — sub-ms latency. Verified during Phase C. If unstable, fall back to NATS single-node on `.46`. |
| 8 | Postgres replica falls too far behind during initial backfill | Low | Failover drill fails | `pg_basebackup` with `-X stream` ensures replica catches up before going online. Verify lag < 5 s before Phase D. |
| 9 | R2 backup upload fails silently | Medium | Invisible data-loss risk | `backup-db.sh` exits non-zero on any failure; cron emails root on failure; Phase D backup restore drill catches misconfiguration at day 1. Follow-up: monitoring alert for "no fresh dump in bucket within 48h". |
| 10 | Cloudflare orange-cloud flip breaks origin port 80 cert renewal | Medium | Renewals fail after 60 days | Pre-emptively switch to DNS-01 in Phase E step 4, BEFORE the first scheduled renewal window. |
| 11 | Worker pattern not present in current backend code | High | Upload processing inline in handlers | Phase 0 discovery. If inline, worker container is omitted from this session; documented as follow-up. Does not block bootstrap. |
| 12 | Running all commands from single Windows host — transient network failure mid-push | Low | Partial state | Use `set -e` in every remote shell snippet. Tar push is idempotent (just re-run). Compose `up -d` is idempotent. |
| 13 | Greenfield assumption wrong — some background workload exists | Very low | Data corruption from concurrent writes | User confirmed greenfield. If I discover evidence of activity during Phase 0, stop and escalate. |

---

## 8. Scaling triggers and migration path

### 8.1 When to add a 4th node

Watch for any of these on the monthly review (once observability lands) or on incident:

- `.44` sustained RAM > 90% over 24 h (postgres replica starving frontend)
- Postgres `pg_stat_replication.replay_lag` > 30 s consistently
- App node p95 latency > 500 ms for > 1 h
- Daily upload count > 50k sustained
- Any health check flapping > 5× per day

### 8.2 Migration runbook outline (documented in full as `docs/runbooks/scale-out-4th-node.md`)

1. Provision `.48` (new Hostinger VPS, Ubuntu 24.04, same size or larger)
2. Run Phase A on `.48` (OS baseline, Docker install, UFW)
3. `pg_basebackup -h .46 -D /var/lib/postgresql/data` on `.48` (new replica)
4. Start postgres replica container on `.48`, verify replication lag < 5 s
5. Stop postgres replica container on `.44`, remove postgres volume on `.44`
6. Reclaim `.44` memory: adjust Compose to raise backend/frontend container limits
7. Update `DATABASE_READ_URL` (if backend supports read routing) to point at `.48`
8. Update all relevant runbooks (failover target, R2 restore target) to reference `.48`
9. Verify nothing regressed; monitor for 24 h

**Total downtime: 0 seconds.** Primary never stops serving writes. Replica swap is additive then subtractive.

---

## 9. Runbook deliverables

All written during Phase E, based on drills executed in Phase D:

| File | Purpose |
|---|---|
| `docs/runbooks/postgres-failover.md` | Primary dies: promote `.44` replica, update `DATABASE_URL`, restart backend |
| `docs/runbooks/valkey-failover.md` | Primary dies: promote `.42` replica, update `VALKEY_URL`, restart backend |
| `docs/runbooks/disaster-recovery-from-r2.md` | Both DB hosts gone: provision fresh VPS, restore from R2, reconfigure |
| `docs/runbooks/cert-renewal.md` | Manual cert renewal steps if cron fails; covers both webroot and DNS-01 modes |
| `docs/runbooks/rolling-deploy.md` | How to deploy new code without downtime (one node at a time, health checks between) |
| `docs/runbooks/scale-out-4th-node.md` | Add a dedicated replica VPS without downtime |

---

## 10. Open questions and assumptions

These assumptions are made by this design. If any turn out false, stop and escalate before proceeding.

1. **All 3 VPSes are in the same Hostinger datacenter.** Required for low-latency inter-node traffic (NATS Raft, Postgres replication, Valkey replication). If not, this design is partially invalid.
2. **Hostinger does not rate-limit or filter internal VPS-to-VPS traffic on ports other than 22.** Required for `.42`↔`.44` peer backup and `.42`/`.44`→`.46` DB access. Standard Hostinger behavior but worth verifying during Phase A.
3. **The Cloudflare R2 `rawdrive` bucket permits creating a sibling `rawdrive-backups` bucket.** Alternatively, backups live in a subfolder of the existing bucket. Either works — decision confirmed in Phase B.
4. **The Cloudflare API token in the doc has permissions to manage DNS records and lifecycle policies.** Needed for the orange-cloud flip and DNS-01 cert renewal. Verified in Phase E.
5. **Port 80 is currently reachable from Let's Encrypt's servers.** Required for initial webroot issuance. True as long as DNS stays grey-cloud until Phase E.
6. **SMTP from `smtp.hostinger.com:465` is reachable from Hostinger VPSes.** Not Hostinger blocking egress to their own SMTP. Standard but worth smoke-testing once backend is up.
7. **Cloudflare R2 account has enough free-tier quota for backup storage** (10 GB free tier). A small rawdrive DB will fit comfortably; if DB grows beyond ~5 GB, switch to paid R2 class.

---

## 11. Approvals

| Decision | Choice | Approved by |
|---|---|---|
| Greenfield vs outage | Greenfield | User |
| Credential rotation strategy | Rotate internal (Postgres, Valkey), keep external as-is | User |
| Credentials file in git | `git rm --cached` + gitignore (no history purge) | Default — user said "proceed" |
| Image build strategy | Build-on-server | Default — user said "proceed" |
| HA primitive | Nginx peer-backup upstream | Default — user said "proceed" |
| Cert strategy | HTTP-01 webroot → DNS-01 after orange-cloud flip | Default — user said "proceed" |
| Secret storage | `.env` files mode 600 | Default — user said "proceed" |
| DB HA topology | Primary on `.46`, streaming replica on `.44`, manual promote | User (explicit) |
| Backup strategy | Nightly `pg_dump` + weekly `pg_basebackup` → R2 with lifecycle | User (explicit) |
| Scale target | 10k registered users, ~500–1.5k DAU, 200 concurrent peak | User (explicit) |
| Cloudflare orange-cloud | Yes, flip during Phase E | Default — user said "proceed" |
| Postgres failover drill | Yes, run in Phase D | Default — user said "proceed" |

---

## 12. Security self-review addendum (added post-approval)

A dedicated security pass after the main design was approved surfaced several items. They are captured here so the spec is the single source of truth for what's in scope, in scope with mitigation, or explicitly deferred.

### Resolved in the plan (upgraded from the spec's baseline)

| ID | Issue | Resolution |
|---|---|---|
| S1 | Real secrets copy-pasted from `HostingerServerDetails.md` into the implementation plan at commit `3ff719b` | Plan file redacted — all literal R2 keys, SMTP password, MoonShot key, Cloudflare API token, R2 account ID, R2 public URL hash replaced with `<PLACEHOLDER>` tokens. Real values are loaded from `HostingerServerDetails.md` at Task B.1 execution time into a gitignored local scratch env var. |
| S2 | `deploy/pgbouncer/pgbouncer.ini` used `auth_type = md5` | Upgraded to `auth_type = scram-sha-256`. `userlist.txt` now contains the literal SCRAM verifier fetched from `pg_authid.rolpassword`, not an MD5 hash. |
| S3 | `backup-db.sh` uploaded raw `pg_dump` output to R2 | Now pipes through `gpg --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512` with a per-deploy random 32-byte passphrase (`BACKUP_GPG_PASSPHRASE`). Restore rehearsal (Task B.9) decrypts before `pg_restore`. Stored only on `.46` in `/opt/rawdrive/app/.env` plus operator's password manager. Loss of the passphrase = backups unrecoverable. |

### In scope but accepted trade-off

| ID | Issue | Mitigation in place | Why not upgraded |
|---|---|---|---|
| S4 | Postgres / Valkey / NATS traffic between VPSes is plaintext (`host` not `hostssl`, no TLS on cache/message bus) | UFW restricts inbound on `.46:5432`, `:6379`, and NATS cluster ports to `.42` and `.44` IPs only. All three VPSes are in the same Hostinger DC. | Enabling TLS on each service requires per-service cert management + rotation. WireGuard mesh is the cleaner answer and should be a dedicated follow-up milestone. For 10k-user greenfield on same-DC nodes with IP allowlisting, the residual risk is Hostinger's own network being compromised — outside our threat model. |
| S5 | SSH private key at `~/.ssh/id_ed25519` has no passphrase | Workstation is single-user. Key is authorized only on three specific VPSes. | Adding a passphrase mid-bootstrap adds friction to every `ssh` and `scp` call. Will be addressed as a post-bootstrap follow-up — add passphrase + `ssh-agent` for the operator. |
| S6 | `pg_hba.conf` uses `host` not `hostssl` (same root cause as S4) | Same UFW + same-DC network mitigation as S4. | Requires TLS on Postgres container — see S4 rationale. |
| S7 | No metrics, no alerting | Health endpoints exist; JSON logs ship via Docker json-file driver with rotation. `docker-compose.observability.yml.example` stub committed for follow-up wiring. | Observability stack is a dedicated project, not a bootstrap step. |
| S9 | Cloudflare API token scope is unknown — the token in `HostingerServerDetails.md` may be over-privileged | N/A | **Verify at start of Phase E.** Use CF API token-verify endpoint, confirm it's scoped to zone `rawdrive.in` with `Zone:Read` + `Zone:DNS:Edit` only. If over-privileged, create a minimally-scoped token, use it, rotate the old one, update followups. |

### Explicit non-goals

- Zero-trust container networking (mTLS between sidecars)
- Hardware security modules for JWT signing
- Automated secret rotation (e.g., Vault)
- SOC 2 / HIPAA controls
- External WAF beyond Cloudflare orange-cloud
- Intrusion detection beyond fail2ban

### Post-bootstrap rotation list

These credentials remain as-is during the bootstrap per user decision, and must be rotated in a follow-up session. None of them are in the new plan file (only in `HostingerServerDetails.md` which is untracked from git at Phase E):

- Cloudflare R2 Access Key ID + Secret Access Key
- Cloudflare Zone API Token
- SMTP password for `noreply@rawdrive.de`
- MoonShot API key
- Google OAuth client secret (if present)
- MSG91 credentials (if present)

---

*End of design document.*
