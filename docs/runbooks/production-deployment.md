# Production Deployment Procedure

**Audience:** the operator running a production deploy.
**Goal:** ship code to `rawdrive.in` / `api.rawdrive.in` with zero downtime,
verify it's actually healthy, and roll back fast if it isn't.

This document is the **sequential procedure**. The mechanics live in
[`rolling-deploy.md`](rolling-deploy.md); the launch-day gate list lives in
[`production-launch-checklist.md`](production-launch-checklist.md). Read
those for context — this doc is the order in which to do things.

---

## Topology Recap

| Node             | IP                | Role         | Public? |
| ---------------- | ----------------- | ------------ | ------- |
| `rawdrive-app1`  | `187.127.142.42`  | app node 1   | yes (80, 443) |
| `rawdrive-app2`  | `187.127.142.44`  | app node 2   | yes (80, 443) |
| `rawdrive-db`    | `187.127.142.46`  | DB / NATS-3  | SSH only |

Cloudflare DNS round-robins both app IPs. Both app nodes run nginx +
backend + frontend + pgbouncer + NATS + a Valkey/Postgres replica. Each
app node's nginx has the **other** app node as a peer-backup upstream, so
one healthy node is always enough to serve traffic. Never deploy directly
to `.46` — it is the database tier and has no app containers.

---

## 0. Decide What You're Shipping

| Change type                          | Procedure to follow                          |
| ------------------------------------ | -------------------------------------------- |
| Application code only                | This document, full sequence                 |
| Application code + reversible migration | This document, full sequence                 |
| Application code + **destructive** migration (`DROP`, incompatible `ALTER TYPE`, etc.) | Schedule a maintenance window first — see § 8 |
| Hotfix on a single user-visible bug  | This document, but feel free to skip § 1     |
| Database / infra-only change         | Out of scope — see `postgres-failover.md` / `scale-out-4th-node.md` |
| Version bump (release tag)           | Run the `cobolt-release` skill **before** this procedure |

If the change includes a migration, also read § 7 (Migrations) before
starting.

---

## 1. Local Pre-Flight Gates

Run from the repo root on your workstation. **All must pass.** Do not
proceed on a red gate.

```bash
# 1. Backend unit + integration tests (real Docker-backed Postgres).
npm run test:backend

# 2. Frontend tests, lint, production build.
(cd frontend && pnpm test && pnpm lint && pnpm build)

# 3. Backend build sanity (catches Go compile errors the test runner skips).
(cd backend && go build ./...)

# 4. Dependency vulnerability scan.
(cd frontend && pnpm audit --audit-level high)
(cd backend && go run golang.org/x/vuln/cmd/govulncheck@v1.3.0 ./...)

# 5. Confirm the working tree is on the commit you intend to ship.
git status
git log --oneline -1
```

If you're shipping migrations, also run the migration tests:

```bash
(cd backend && go test ./internal/database/... -count=1 -timeout 120s)
```

---

## 2. Pre-Flight Configuration Audit (Optional but Recommended)

Verify the production secrets the new code expects already exist. The
authoritative schema is [`deploy/.env.example`](../../deploy/.env.example).
For each new env var your change introduces:

1. Confirm it's in `deploy/.env.example` (so future operators see it).
2. Confirm it's set on both app nodes:
   ```bash
   ssh root@187.127.142.42 'grep -c NEW_VAR_NAME /opt/rawdrive/app/.env || echo MISSING'
   ssh root@187.127.142.44 'grep -c NEW_VAR_NAME /opt/rawdrive/app/.env || echo MISSING'
   ```
3. If `MISSING`, edit `/opt/rawdrive/app/.env` on each app node (mode 600,
   root-owned) **before** the deploy. The tar push will not overwrite it.

**Never** commit secrets. Never paste them into chat. Resolution order
for any service config is `platform_settings` table → env var → fail-with-
warning, per `AGENTS.md`.

---

## 3. Run The Rolling Deploy

The script does push → build → up → health-check on `.42` first, gates on
`.42` returning 2xx on `/health`, then repeats for `.44`.

### From Windows

```powershell
powershell -ExecutionPolicy Bypass -File deploy/scripts/deploy-prod.ps1
```

The wrapper accepts `-SkipPush`, `-NoCache`, `-Pull`. Defaults are
correct for routine deploys — Docker cache enabled, source tar pushed
fresh. Do **not** use `-NoCache` unless you have a concrete reason to
suspect a corrupted layer cache.

### From macOS / Linux

```bash
./deploy/scripts/deploy-prod.sh
```

### Available flags

| Flag           | When to use                                                          |
| -------------- | -------------------------------------------------------------------- |
| `--skip-push`  | Source is already on the nodes (e.g., re-running after a failed health check on a partial deploy). |
| `--pull`       | You want Docker to fetch newer pinned base images before building.   |
| `--no-cache`   | Suspected corrupted Docker cache. Slow. Last resort.                 |

### What the script does

1. Tars the working tree (excluding `node_modules`, `.git`, `.next`,
   `.env*`, `_cobolt-output`, `e2e`, `tests`, etc.) and streams it to
   both app nodes via SSH.
2. Runs `docker compose -f docker-compose.prod-app.yml build` on each.
3. Runs `docker compose up -d`. Compose respects `depends_on`, so the
   order is: pgbouncer → migrate (one-shot) → backend → frontend → nginx.
4. Polls `http://127.0.0.1:8080/health` 30× at 5s intervals on `.42`
   before touching `.44`.
5. Repeats for `.44`.

**Do not bypass the script.** It enforces the "node 1 healthy before
node 2 is touched" invariant. Skipping it has caused outages.

---

## 4. Smoke-Test Each Node Individually

After the script reports complete, verify each node is actually serving
the new code (not just returning healthy `/health`).

```bash
# Node 1 — bypass DNS, hit IP directly.
curl -fsS --resolve rawdrive.in:443:187.127.142.42      https://rawdrive.in/
curl -fsS --resolve api.rawdrive.in:443:187.127.142.42  https://api.rawdrive.in/health

# Node 2.
curl -fsS --resolve rawdrive.in:443:187.127.142.44      https://rawdrive.in/
curl -fsS --resolve api.rawdrive.in:443:187.127.142.44  https://api.rawdrive.in/health
```

All four must return 2xx. If any fail, **stop** — do not move to the
next step. Investigate via `docker logs deploy-backend-1` on the bad
node and either fix-forward or roll back (§ 9).

---

## 5. End-to-End Verification via Public DNS

```bash
curl -fsS https://rawdrive.in/
curl -fsS https://api.rawdrive.in/health
curl -fsS https://api.rawdrive.in/api/v1/states   # exercises Postgres via pgbouncer
```

Then exercise the critical user flows manually in a browser (these
cannot be `curl`ed because of session cookies and OAuth):

- Email-OTP registration → activation (Mailpit only in dev; check real
  inbox in prod).
- Password login (with and without TOTP for an MFA-enrolled test user).
- Refresh-token rotation (leave a tab idle past access-token TTL).
- Create or open a gallery → upload one image from `tests/photos/` →
  confirm WebP derivatives appear (`thumb_sm_webp`, `thumb_md_webp`,
  `thumb_lg_webp`, `display_webp`).
- Authenticated download of an original.
- Open the shared `/g/[slug]` guest gallery URL — verify it renders
  without auth.

If anything is off, capture the failing request and the backend logs
from the node that served it before rolling back.

---

## 6. Watch the First Hour

For the first 60 minutes after a deploy, watch:

- API 5xx rate (target: not higher than the prior hour).
- Upload processing failure rate.
- Auth refresh failure rate.
- Postgres active connection count (pgbouncer transaction-mode caps the
  upstream; spikes mean app-side pool misconfiguration).
- Valkey availability + `master_link_status` on `.42` replica.
- NATS publish errors.
- Disk space on both app nodes (Docker layer cache grows).

The observability stack is not fully wired in production yet (see
`DEPLOYMENT-2026-04-11.md` § "Next steps"). Until it is, use
`docker compose logs --tail 200 backend` on each node, and the
`docker exec`-based query patterns in `docs/runbooks/incident-response.md`.

---

## 7. Migrations (When Your Change Includes Schema)

Migrations are paired `NNN_name.up.sql` + `NNN_name.down.sql` under
`backend/internal/database/migrations/` and run automatically by the
`migrate` one-shot Compose service before `backend` starts. They are
guarded by `schema_migrations` (idempotent) and `pg_advisory_lock`
(safe across both app nodes).

**For reversible migrations** (add column, add index, add table,
backfill via background job, etc.): the standard deploy in § 3 handles
them. Both nodes will attempt the migration; the advisory lock
serializes them and the second one is a no-op.

**For destructive migrations** (`DROP TABLE`, incompatible
`ALTER COLUMN TYPE`, removing a column the previous code still reads):
**stop**. The rolling pattern cannot do these safely. You have two
options:

### 7a. Two-deploy expand/contract (preferred)

1. Deploy **A**: add the new column/table alongside the old one, dual-
   write or backfill.
2. Verify in production that the new shape is correct.
3. Deploy **B**: stop reading the old column, drop it.

This is the only zero-downtime option.

### 7b. Maintenance-window destructive deploy

1. Announce the window.
2. Take a backup: `ssh root@187.127.142.46 'set -a; source /opt/rawdrive/app/.env; set +a; /opt/rawdrive/backup-db.sh'`.
3. Confirm the backup completed (last line of `/opt/rawdrive/backups/backup.log`).
4. Deploy `.42`, wait for migrate to finish.
5. Immediately deploy `.44`.
6. Smoke-test (§ 4-5).
7. End the maintenance window.

Never edit a committed migration — append a new numbered pair.

---

## 8. Rollback

Roll-forward is almost always cheaper. Roll-back if and only if the new
version is actively breaking users and roll-forward needs more than ~10
minutes.

### 8a. Code-only rollback

```bash
git log --oneline -10                          # find the previous good SHA
git checkout <PREVIOUS_GOOD_SHA>
./deploy/scripts/deploy-app.sh 187.127.142.42  # not deploy-prod.sh — one node at a time on rollback
# Verify .42 is healthy via curl --resolve, then:
./deploy/scripts/deploy-app.sh 187.127.142.44
```

Then `git checkout main` on the workstation to leave the tree clean.

### 8b. Code + migration rollback

If the deploy applied a destructive migration, **code rollback alone is
not enough** — the old code does not understand the new schema. You
must:

1. Restore from the most recent B2 backup: see `disaster-recovery-from-r2.md`.
2. Replay any non-destructive writes that occurred between the backup
   and the bad deploy.
3. Roll back the code as in § 8a.

This is why § 7 strongly prefers the expand/contract pattern.

### 8c. Credential-leak rollback

If the deploy or rollback exposed credentials (logs, screenshots,
chat, leaked `.env`), **immediately** rotate the affected secret before
doing anything else. Then continue the rollback. Memory entry
`feedback_credentials_in_chat.md` documents this pattern.

---

## 9. Post-Deploy Hygiene

Once the deploy is green and the watch window has passed:

1. **Tag the release** if this was a planned ship — via `cobolt-release`
   skill, which keeps `package.json`, `cobolt-state.json`, and git tags
   in sync.
2. **Push the tag**: `git push origin --tags`.
3. **Write a one-line deploy log** entry to your team's deploy log (the
   `DEPLOYMENT-YYYY-MM-DD.md` file in `docs/runbooks/` is the long-form
   pattern; one line per routine deploy is fine).
4. **If anything surprising happened** during the deploy: capture it in
   `docs/runbooks/<topic>.md` so the next operator inherits it. This is
   how the `BOOTSTRAP-KNOWN-ISSUES.md` and `DEPLOYMENT-2026-04-11.md`
   files came to exist.

---

## When Something Goes Wrong

| Symptom                                         | First runbook to open                          |
| ----------------------------------------------- | ---------------------------------------------- |
| Health check fails on one node after deploy     | `rolling-deploy.md` § "Manual Deploy" + `incident-response.md` |
| Both nodes serve 5xx after deploy               | This doc § 8 (Rollback)                        |
| Postgres primary dies                           | `postgres-failover.md`                         |
| Valkey primary dies                             | `valkey-failover.md`                           |
| TLS cert near expiry / renewal failing          | `cert-renewal.md`                              |
| Both DB hosts gone — full restore               | `disaster-recovery-from-r2.md`                 |
| Upload-screening alerts firing                  | `upload-screening-alerts.md`                   |
| Streaming/commercial flag needs rollback        | `streaming-commercial-v1-rollback.md`          |

---

## Hard Don'ts

These are load-bearing — every one of them has caused a real outage or
near-miss. Listed in `AGENTS.md`; reproduced here so they're inline with
the procedure.

- **Don't deploy directly to `.46`.** It runs Postgres / Valkey / NATS-3,
  not app containers.
- **Don't bypass `deploy-prod.sh` / `deploy-prod.ps1`** by `ssh`-ing and
  running `docker compose up` ad-hoc. The script enforces the
  one-healthy-node invariant.
- **Don't run `deploy-prod.sh` under WSL bash.** Use Git Bash via the
  PowerShell wrapper. The script will refuse to run under WSL.
- **Don't hardcode secrets** anywhere in code. `platform_settings` table
  → env → fail-with-warning is the only allowed order.
- **Don't set `STORAGE_DRIVER=local`** in production. The backend
  fatal-exits on it. All tiers use managed Backblaze B2 via the `s3`
  driver; enterprise BYOS overrides go through `workspace_storage_configs`.
- **Don't edit a committed migration.** Append a new numbered pair.
- **Don't push secrets into chat/PR/logs.** If you must paste during an
  incident, **rotate the secret afterward**.
- **Don't deploy the same change twice** if the first attempt left the
  cluster in a degraded state — diagnose first.

---

## Quick-Reference Cheat Sheet

```bash
# Full rolling deploy (Windows operator).
powershell -ExecutionPolicy Bypass -File deploy/scripts/deploy-prod.ps1

# Full rolling deploy (mac/Linux operator).
./deploy/scripts/deploy-prod.sh

# Single-node deploy (rollback or targeted fix).
./deploy/scripts/deploy-app.sh 187.127.142.42
./deploy/scripts/deploy-app.sh 187.127.142.44

# Per-node smoke test (replace IP).
curl -fsS --resolve rawdrive.in:443:187.127.142.42 https://rawdrive.in/
curl -fsS --resolve api.rawdrive.in:443:187.127.142.42 https://api.rawdrive.in/health

# DB backup (on .46).
ssh root@187.127.142.46 'set -a; source /opt/rawdrive/app/.env; set +a; /opt/rawdrive/backup-db.sh'

# Tail backend logs on a node.
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml logs --tail 200 backend'
```

---

**Last updated:** 2026-05-19.
