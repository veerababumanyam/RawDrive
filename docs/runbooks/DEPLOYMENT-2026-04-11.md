# Production Bootstrap Deployment — 2026-04-11

## Status: LIVE on both app nodes, with documented follow-ups

## What's deployed

Three Hostinger KVM VPSes, Ubuntu 24.04, Docker 29.4.0:

| Node | IP | Role | Containers running | Public? |
|---|---|---|---|---|
| rawdrive-app1 | 187.127.142.42 | App node 1 | nginx, backend, frontend, pgbouncer, nats-1, valkey-replica | Yes (80, 443) |
| rawdrive-app2 | 187.127.142.44 | App node 2 | nginx, backend, frontend, pgbouncer, nats-2, postgres-replica | Yes (80, 443) |
| rawdrive-db | 187.127.142.46 | DB node | postgres, valkey, nats-3 | SSH only |

**Public endpoints confirmed working:**
- `https://rawdrive.in/` — serves the Next.js landing page via Cloudflare DNS round-robin across both app nodes
- `https://www.rawdrive.in/` — redirects to apex
- `https://api.rawdrive.in/health` — returns `{"status":"ok"}`
- `https://api.rawdrive.in/api/v1/states` — returns all 36 Indian states from Postgres via pgbouncer

**TLS:** Let's Encrypt certificate for `rawdrive.in`, `www.rawdrive.in`, `api.rawdrive.in`, expires 2026-07-10. Automated renewal cron at `0 3,15 * * *` on both app nodes via `/opt/rawdrive/renew-ssl.sh` (webroot HTTP-01 mode).

**Data plane:**
- Postgres 17 + pgvector with 107 tables (all backend migrations applied)
- Postgres streaming replication: `.46` → `.44`, `state=streaming`, `replay_lag` near zero
- Valkey 9 primary on `.46`, replica on `.42` with AOF persistence and `master_link_status:up`
- NATS JetStream 3-node cluster across all three VPSes
- PgBouncer on each app node, transaction-mode, SCRAM-SHA-256 auth

**HA verified during Phase D:**
- Backend failover drill PASSED: stopped `deploy-backend-1` on `.42`; `https://rawdrive.in/api/v1/states` continued returning HTTP 200 via `.42`'s nginx → peer backup upstream on `.44`. Zero downtime.

## What's NOT working (see `BOOTSTRAP-KNOWN-ISSUES.md`)

### P0 — Three credential sets from `HostingerServerDetails.md` are dead

Tested during bootstrap, all return auth failures:

| Credential | Failure mode | Impact |
|---|---|---|
| Cloudflare R2 API key | rclone / boto3 `401 Unauthorized` | No backups land in R2; backend photo upload code will fail at runtime |
| Cloudflare Zone API token | `{"success":false,"errors":[{"code":1000,"message":"Invalid API Token"}]}` | No orange-cloud flip; no DNS-01 cert renewal; stays on grey-cloud + webroot |
| SMTP (suspected) | User registration endpoint hangs 60s, likely SMTP send | Registration flow broken end-to-end |

All three were likely rotated after the doc was written (2026-04-02). **Rotate all three, then see `BOOTSTRAP-KNOWN-ISSUES.md` to finish the bootstrap.**

### P1 — Phase E tasks that depend on dead creds

- Cloudflare orange-cloud flip (Task E.8): SKIPPED. Needs valid Zone API token.
- DNS-01 cert renewal (Task E.9): SKIPPED. Stays on webroot HTTP-01 which works with grey-cloud DNS.
- Nightly R2 backup upload (cron installed, will email root on failure every night): cron runs but `rclone copy` fails.

### Other deferred items

- Observability stack not wired. `docker-compose.observability.yml.example` is committed for follow-up.
- Git history purge of `HostingerServerDetails.md`. File is gitignored as of this commit but still in commit history.
- SSH key passphrase — `~/.ssh/id_ed25519` has no passphrase. Workstation compromise = instant prod access. Post-bootstrap rotation recommended.
- Inter-VPS TLS (Postgres/Valkey/NATS) — plaintext behind UFW IP allowlisting. WireGuard mesh recommended for regulated data.

## Commits landed on `feature/prod-bootstrap`

Phase 0 scaffolding:
- `fc7b671` feat(frontend): enable Next.js standalone output
- `50005fb` feat(backend): add cmd/migrate one-shot migration binary
- `b69c813` refactor(backend/cmd/migrate): remove dead TEST_RUN_MAIN branch
- `f823fc1` docs(spec): correct Migrator API signature
- `5f21fa7` build(backend): add multi-stage Dockerfile
- `f338589` fix(backend/Dockerfile): install libwebp-tools + ffmpeg
- `a088c06` polish(backend): pin Dockerfile base images, expand .dockerignore, tune healthcheck
- `8bfa4b5` build(frontend): replace Dockerfile with Next.js 16 standalone output build
- `e8abeff` infra(deploy): add data plane configs
- `b3d13b7` chore: enforce LF line endings for deploy artifacts and shell scripts
- `5468f72` infra(deploy): add nginx config, compose-db, compose-app
- `81419e9` infra(deploy): add deploy scripts, env schema, observability stub

Phase E cleanup (this commit):
- docs(runbooks): 6 operational runbooks + BOOTSTRAP-KNOWN-ISSUES.md + DEPLOYMENT-2026-04-11.md; untrack HostingerServerDetails.md; add inline fixes from Phase C (NATS `$SYS` removal, pgbouncer `%include`, Compose healthcheck corrections, removal of nginx default.conf)

## Secret generation record

All internal secrets were generated on the workstation via `openssl rand -hex N` and stashed in `/tmp/rawdrive-secrets.env` (mode 600, local scratch, deleted at end of session). The real values are now ONLY in:

- `/opt/rawdrive/app/.env` on each server (mode 600, root-owned)
- `/opt/rawdrive/app/deploy/.env` on `.42` and `.44` (deploy-time vars)
- `/root/.config/rclone/rclone.conf` on `.46` (dead R2 creds, will be replaced during rotation)
- `/opt/rawdrive/app/deploy/pgbouncer/userlist.txt` on `.42` and `.44` (SCRAM verifier from `pg_authid`, mode 644 for pgbouncer container read access)

The `BACKUP_GPG_PASSPHRASE` used for R2-bound backups is ONLY on `.46:/opt/rawdrive/app/.env`. If `.46` is lost and R2 creds are never rotated, you have nothing. **Write this passphrase to your password manager.** It is in `/opt/rawdrive/app/.env` on `.46`, line starting `BACKUP_GPG_PASSPHRASE=`.

## Surprises that got fixed inline during execution

1. **Pre-existing Dockerfiles** for both `backend/` and `frontend/` from commit `c481200` (brownfield hardening wave merged in via `feature/landing-redesign → main`). Backend one had critical `webp` + `ffmpeg` runtime deps preserved in the new Alpine Dockerfile.
2. **`pnpm-workspace.yaml` in `frontend/`** is a misuse of workspace config. Dockerfile deletes the file after `COPY . .` so pnpm 9.x doesn't reject it.
3. **Node 22.11's corepack** has an outdated signing key store. Fix: `npm install -g corepack@latest` before `corepack enable`.
4. **Backend health endpoint is `/health`, not `/api/v1/health`** — plan doc typo. Compose healthcheck corrected.
5. **Frontend runtime has `curl` not `wget`** — Compose healthcheck corrected.
6. **NATS `system_account: $SYS`** directive causes NATS to parse `$SYS` as a variable reference and fail. Line removed; JetStream clustering works fine without it.
7. **pgbouncer `userlist.txt` permission** — edoburu/pgbouncer runs as postgres UID 70; chmod 644 needed.
8. **pgbouncer missing `%include databases.ini`** — without it, `[databases]` section never loaded and pgbouncer returned "no such database".
9. **`DATABASE_URL` hostname** — plan used `127.0.0.1:6432` but backend runs in a container. Changed to `pgbouncer:6432` (service name, Compose DNS).
10. **`TRUSTED_PROXY_MODE=true`** — backend refuses to boot in production without TLS cert paths OR this flag. Added.
11. **ACME HTTP-01 challenge** — temporary nginx on `.44` proxies `/.well-known/acme-challenge/` to `.42` during the challenge window so whichever A-record LE picks resolves.
12. **`.44`'s `deploy/.env` was a symlink** from Phase B.5 — `cat >` wrote through it and overwrote the main env file. Fixed by deleting the symlink.
13. **nginx alpine `default.conf`** — base image ships a `server localhost` block that catches requests. Compose command now `rm -f /etc/nginx/conf.d/default.conf` before envsubst.
14. **One-shot migrate container re-runs on every `up -d`** — this is actually fine because migrations are idempotent (schema_migrations table + pg_advisory_lock).

## Next steps (in order of urgency)

1. **Rotate the three dead credentials** (R2 key pair, CF Zone API token, probably SMTP password too). Follow `BOOTSTRAP-KNOWN-ISSUES.md`.
2. **Run the first real backup** once R2 is reachable: `ssh root@187.127.142.46 'set -a; source /opt/rawdrive/app/.env; set +a; /opt/rawdrive/backup-db.sh'`
3. **Run the restore rehearsal** (Task B.9 in the plan) to confirm the backup round-trips.
4. **Run the Postgres failover drill** (Phase D Task D.4). This validates `docs/runbooks/postgres-failover.md`.
5. **Flip Cloudflare to orange-cloud** (Phase E Task E.8) once the new CF token is in place.
6. **Wire observability.** Pick Grafana Cloud (free tier), Datadog, or self-hosted. Start with `docker-compose.observability.yml.example`.
7. **Rotate SSH key to have a passphrase** and load via `ssh-agent`.
8. **Consider WireGuard mesh** between the three VPSes if you need inter-node TLS.

## Runbook index

- `docs/runbooks/BOOTSTRAP-KNOWN-ISSUES.md` — read this first, especially the R2 P0
- `docs/runbooks/postgres-failover.md` — primary dies, promote `.44` replica
- `docs/runbooks/valkey-failover.md` — primary dies, promote `.42` replica
- `docs/runbooks/disaster-recovery-from-r2.md` — both DB hosts dead, restore from R2 (blocked on credential rotation)
- `docs/runbooks/cert-renewal.md` — manual + automatic cert renewal, mode switching
- `docs/runbooks/rolling-deploy.md` — ship new code without downtime
- `docs/runbooks/scale-out-4th-node.md` — add `.48` as a dedicated DB replica node

Bootstrap session end: 2026-04-11.
