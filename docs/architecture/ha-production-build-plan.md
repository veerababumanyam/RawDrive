# RawDrive HA Production — Master Build & Activation Plan

**Audience:** the build terminal. **Goal:** take RawDrive from "single-leader, manual-failover" to
**HA + robust + fast + secure** — Patroni auto-failover, PITR, Cloudflare edge (LB/WAF/CDN), elastic
app tier — by **activating IaC that already exists** in the repo, in a safe, gated, reversible order.

> This plan **sequences and references** the detailed runbooks; it does not duplicate them. Each phase
> says: what it delivers, owner prereqs, the exact scripts/configs (already in the repo), the gate to
> pass before moving on, and the rollback. Do phases in order; each is independently reversible.

---

## 0. Ground truth (reconciled to current reality — 2026-06-06)

**Topology (3 Hostinger VPS):** `.42`/`.44` = app tier (nginx, frontend, backend, worker, face-svc,
pgbouncer, NATS, replicas); `.46` = data tier (Postgres leader, Valkey primary, NATS) — SSH-only,
never deployed to directly.

**Canonical B2 buckets (CHANGED — use these, not the old names in older docs):**
- Media: **`rawdriveclientfiles`** (was `rawfolder`, now DELETED). App reads/writes via scoped key.
- Backups + pgBackRest repo: **`rawdriveadminfiles`** (was `rawfolder/db-backups`). Scoped admin key.

**Already ACTIVE:** streaming replica on `.44` (slot `replica_44`, synchronous), nginx peer-failover
(2s), fail2ban jails, LE wildcard TLS 1.2/1.3, `cloudflare-real-ip.conf`, rate limiting, KEK envelope
crypto, `/health` + `/health/deep` + `/health/ready` (migration-head gated), `/metrics`
(pgxpool + valkey-fallback + RUM web-vitals), hardened `deploy-prod.sh` (pre-migration backup +
readiness gate + replica-lag guard + smoke), GHCR per-commit images, CI gates
(`production-gates.yml`), **CDN worker `rawdrive-cdn-worker` LIVE** on `cdn.rawdrive.in`.

**Built but INERT (this plan activates them):** pgBackRest PITR (`archive_mode` commented in
`deploy/postgres/postgresql.conf`), Patroni/etcd/HAProxy (`deploy/docker-compose.patroni.yml`,
profile-gated, separate compose project), Cloudflare LB + WAF + origin-lock enforcement.

**Known credential debt (fix during Phase 1):** the Cloudflare Zone API token and the old R2 key are
dead (`docs/runbooks/PROD-UAT-FINDINGS-2026-04-13.md`) — recreate the CF token (needed for DNS-01
cert renewal + API automation); R2 is irrelevant post-B2.

**Single points of failure today:** Postgres leader `.46`, Valkey primary `.46` (Phases 3–4 fix DB;
Valkey failover is manual via `valkey-failover.md`, acceptable — cache is rebuildable).

---

## Build order (dependency DAG)

```
Phase 1  Cloudflare edge (LB + WAF + origin-lock + TLS Full-strict)   ── independent, do first
Phase 2  CDN backend minter (edge already live; wire the app)         ── needs Phase 1 proxy on
Phase 3  pgBackRest PITR activation (offsite RPO ~60s)                 ── independent; do before Patroni
Phase 4  Patroni auto-failover cutover (RTO ~30–60s, RPO 0)           ── needs Phase 3 (replica method = pgBackRest)
Phase 5  Elastic app tier (add nodes → CF LB pool)                    ── needs Phase 1 LB
Phase 6  Observability (Prometheus + Grafana + alerts)                ── any time after Phase 1
Phase 7  Security final-hardening + GHCR-runner CD                    ── last; enforce origin-lock, KEK-mandatory
```
Phases 1, 3, 6 can run in parallel. **Phase 4 (Patroni) is the only one needing a watched
maintenance window** (brief write pause during cutover).

---

## Phase 1 — Cloudflare edge: LB + WAF + origin lock + TLS Full-strict
**Delivers:** cross-node failover at the edge, DDoS/WAF, real client IPs, origin reachable only via CF.
**Status:** real-IP + TLS partly active; LB/WAF/origin-lock to enable. Ref: target-arch §3/§9/§13,
`deploy/nginx/cloudflare-real-ip.conf`, `deploy/scripts/cf-origin-lock.sh`.

**Owner prereqs:** Cloudflare account with the zone `rawdrive.in` (NS already delegated — domain stays
at GoDaddy); **Load Balancing add-on** (~$5/mo); recreate the dead **CF Zone API token** (DNS:Edit +
Zone:Read + LB:Edit) → store as `CLOUDFLARE_API_TOKEN` in `.env.cobolt`.

**Build steps (gated):**
1. Confirm zone Active + records imported, **grey-cloud** everything. Gate: site + email (MX/SPF/DKIM)
   unchanged.
2. Ensure `cloudflare-real-ip.conf` is included on **both** app nodes' nginx (it is — verify). Set CF
   SSL = **Full (strict)**; enable HTTP/3, Brotli, TLS1.3, Always-Use-HTTPS. Gate: nginx logs show
   real visitor IPs via `CF-Connecting-IP` (not CF IPs) — or fail2ban will ban Cloudflare = ban everyone.
3. Create the **Load Balancer** pool: origins `187.127.142.42` + `.44`, health monitor `GET /health`
   (the app's liveness), steering = off/round-robin, both proxied (orange). Point apex + `api` +
   `*.rawdrive.in` at the LB. Gate: apex, `api/health`, a `*.rawdrive.in` gallery, and a test email all
   verified **through** CF.
4. **Origin lock** (last): run `deploy/scripts/cf-origin-lock.sh` on `.42`/`.44` to restrict 80/443 to
   Cloudflare IP ranges (DOCKER-USER chain). Gate: direct-to-origin-IP request blocked; via-CF works.
5. Enable CF **WAF** managed rules + rate-limiting rules + bot-fight.

**Rollback:** grey-cloud the records (proxy off) / remove origin-lock; nginx serves direct as today.

---

## Phase 2 — CDN backend minter (the edge is already live)
**Delivers:** galleries actually served from `cdn.rawdrive.in` (edge-cached) instead of the app origin.
**Status:** Worker LIVE + verified; **backend minter is the remaining slice.**
**Build:** follow **`docs/architecture/cdn-backend-minter-build-task.md`** verbatim — add the Go
`SignedCDNURL` helper, wire it into the gallery derivative-URL path behind flag `CDN_SIGNED_URLS`
(default off), add the Go⇄Worker parity test, ship, deploy, then flip the flag on the nodes.
**Gate:** browser Network tab shows gallery images from `cdn.rawdrive.in`, 2nd load `CF-Cache-Status:
HIT`, gated galleries still 403 without a session. **Rollback:** `CDN_SIGNED_URLS=false` + roll backend.
**Phase 2b (later):** re-encrypt derivatives SSE-C → SSE-B2 to drop the SSE-C key out of the Worker.

---

## Phase 3 — pgBackRest PITR activation (offsite, RPO ~60s)
**Delivers:** continuous WAL archiving + physical incremental backups to B2 `rawdriveadminfiles`,
point-in-time recovery, weekly automated restore-drill. **Status:** INERT (`archive_mode` commented).
**Authoritative runbook: `docs/runbooks/pitr-restore.md` §(a).** IaC: `deploy/pgbackrest/pgbackrest.conf`
(repo bucket already = `rawdriveadminfiles`), `deploy/postgres/postgresql.conf` (archive block
commented), `deploy/scripts/pgbackrest-{init,backup,restore-verify}.sh`, postgres Dockerfile pins
pgBackRest 2.58.

**Owner prereqs:** B2 `rawdriveadminfiles` bucket (DONE) + scoped key (DONE — `rawdrive-admin-s3`
`…0006`, already wired into `.46` `.env` as `PGBACKREST_REPO1_S3_KEY`/`_SECRET`); set
`PGBACKREST_REPO1_CIPHER_PASS` (`openssl rand -hex 32`, store off-box).

**Build steps (on `.46`, low-traffic window — needs one Postgres restart):**
1. Uncomment `archive_mode=on` + `archive_command` + `archive_timeout` in `deploy/postgres/postgresql.conf`.
2. Rebuild postgres image + recreate the container (restart, not reload — `archive_mode` needs it).
3. `pgbackrest-init.sh` (stanza-create + check — proves WAL reaches B2 end-to-end). **Gate: green `check`.**
4. First full backup (`pgbackrest-backup.sh --type=full`).
5. Install crons (full Sun / diff Mon–Sat / hourly incr + the weekly restore-drill). Gate: `pgbackrest
   info` shows the backup + WAL range; `pg_stat_archiver` `failed_count` flat.

**Rollback:** re-comment the archive block + restart → archiving stops; the nightly logical
`backup-db.sh` (already running to `rawdriveadminfiles`) remains the safety net.

---

## Phase 4 — Patroni automatic failover cutover (RTO ~30–60s, RPO 0)
**Delivers:** zero-human DB failover — etcd quorum (3 nodes), Patroni promotes the `.44` replica,
HAProxy reroutes, pgbouncer unaffected. Replaces the manual model.
**Status:** INERT, profile-gated, separate compose project (never started by rolling deploy).
**Authoritative runbook: `docs/runbooks/patroni-failover.md` (cutover §).** IaC:
`deploy/docker-compose.patroni.yml`, `deploy/patroni/patroni.yml.template`,
`deploy/etcd/etcd.conf.yml.template`, `deploy/haproxy/haproxy.cfg` (:5432 write / :5433 read),
`deploy/scripts/patroni-bootstrap.sh` (the cutover driver), `patroni-status.sh`. Safety:
`synchronous_mode=true` (RPO 0 for acked commits), `maximum_lag_on_failover=1MiB`, `use_pg_rewind=true`.

**⚠️ Maintenance window required** (brief write pause). **Take a fresh verified backup first** (Phase 3
makes this trivial).

**Build steps:** follow `patroni-failover.md` cutover: bootstrap etcd (3 members) → bring Postgres
under Patroni on `.46` (leader) + `.44` (sync standby) via `patroni-bootstrap.sh` → start HAProxy on
`.42`/`.44` → **re-point pgbouncer `databases.ini` from `host=187.127.142.46` to the HAProxy leader
endpoint** (this is the line that makes failover automatic) → restart pgbouncer.
**Gate (prove it before declaring done):** `patroni-status.sh` shows leader + healthy sync standby;
trigger a **controlled** `patronictl switchover`, watch the app reconnect through HAProxy with no config
edit, then switch back. **Rollback:** `postgres-failover.md` (manual model) — stop Patroni, point
pgbouncer back at `.46`, promote by hand if needed.

---

## Phase 5 — Elastic app tier (scale horizontally)
**Delivers:** add app-only VPS in ~5 min; CF LB spreads load + survives a node loss.
**Status:** ACTIVE tooling. IaC: `deploy/scripts/add-app-node.sh` (installs Docker/ufw/fail2ban, pushes
security baseline + sealed env, pulls per-commit images from GHCR, health-checks), `scale-out-4th-node.md`
(move the replica to a dedicated `.48` to free app-node RAM).
**Owner prereq:** one `docker login ghcr.io` per node (GHCR pull). **Build:** `add-app-node.sh <new-ip>
<image-tag>` → add the new origin to the Phase-1 CF LB pool. **Gate:** new node `/health/ready` 200 +
appears healthy in the LB. **Rollback:** drain from LB pool, tear down the VPS.

---

## Phase 6 — Observability (Prometheus + Grafana + alerts)
**Delivers:** dashboards + paging. **Status:** `/metrics` exists (pgxpool saturation, valkey-fallback,
web-vitals RUM) + `/api/v1/admin/system-health`; **no Prometheus/Grafana stack deployed yet.**
**Build:** stand up Prometheus (scrape `:8080/metrics` on `.42`/`.44` + node-exporter + the Patroni
REST + pgBackRest exporter) and Grafana on `.46` (or a small 4th box), behind CF Access. Alert rules:
no-leader, no sync-standby, etcd quorum loss, WAL-archive `failed_count` climbing, restore-drill FAILED,
replica lag, 5xx rate, cert expiry, `pg_wal`/disk headroom. Wire cron `MAILTO`/webhook to on-call.
**Gate:** kill a backend → alert fires; force a WAL-archive failure → alert fires.

---

## Phase 7 — Security final-hardening + one-click CD
**Delivers:** least-exposure prod + a deploy button. **Status:** baseline active; finishing items:
- **Enforce** Phase-1 origin lock + CF WAF (move from "to-enable" to "verified-enforced").
- Make `PLATFORM_SETTINGS_KEK` **mandatory** in prod (fatal if missing) — already configured; flip the guard.
- SSH hardening: disable password auth (key-only), confirm `deploy/known_hosts` pins all 3 nodes
  (CI `known-hosts-guard` already asserts this).
- Stand up the self-hosted GHCR runner + GitHub `production` Environment so `cd-production.yml`
  (currently inert) gives a gated one-click deploy; until then `npm run deploy:prod` is the path.
- Rotate any credential touched during the build (`secret-rotation.md`); confirm gitleaks/trivy gates green.

---

## Master checklist (tick as you go)
- [ ] **P1** CF LB pool live (`.42`+`.44`, `/health` monitor); SSL Full-strict; origin-locked; WAF on; CF token recreated
- [ ] **P2** `SignedCDNURL` shipped behind flag → flag on → galleries serve from `cdn.rawdrive.in` (HIT)
- [ ] **P3** `archive_mode=on`; stanza check green; first full backup; crons + weekly restore-drill installed
- [ ] **P4** etcd quorum + Patroni leader/sync-standby; pgbouncer → HAProxy leader; controlled switchover proven
- [ ] **P5** `add-app-node.sh` validated; new node in LB pool
- [ ] **P6** Prometheus+Grafana scraping; alert rules firing on injected failures
- [ ] **P7** origin-lock enforced; KEK mandatory; SSH key-only; CD runner + `production` env (optional)

## Verification = the system survives each failure (target-arch §11)
After the build, prove HA by injection: kill one app node (CF LB drops it, site stays up) · `patronictl
switchover` (auto-promote, no edits) · stop etcd on one node (quorum holds) · force WAL-archive failure
(alert, writes continue via async spool) · weekly restore-drill PASSES. If any fails, that phase isn't done.

## Cross-references (don't duplicate — execute these)
`rawdrive-target-architecture.md` (the why + topology) · `pitr-restore.md` (P3) · `patroni-failover.md`
(P4) · `postgres-failover.md` (P4 rollback) · `scale-out-4th-node.md` (P5) · `cdn-b2-signed-urls.md`
+ `cdn-backend-minter-build-task.md` (P2) · `production-deployment.md` + `cicd.md` (deploy mechanics) ·
`incident-response.md` + `secret-rotation.md` (P7) · `valkey-failover.md` / `disaster-recovery-from-r2.md`
(secondary DR).
