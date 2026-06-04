# RawDrive Target Architecture — Cloudflare edge · Patroni HA · B2 · elastic app tier

**Status:** Plan of record for the next production (re)deploy. Authored 2026-06-05 from a live
audit of the running fleet. Supersedes the ad-hoc single-node-pinned topology.

**Goals (in the user's words):** best security (hard to hack), very high performance / blazing
fast, robust connectivity, highly available *without impacting user features*, **fast photo
uploads from mobile / low-bandwidth networks**, **fast gallery loads (CDN)**, and **add-a-VPS
horizontal scaling with minimal effort**.

> **Read alongside:** the rawdrive-deploy skill (`references/rawdrive-prod-map.md` = current ground
> truth; this doc = target). Migration path is §13. Nothing here is live until the cutover in §13.

---

## 1. Design principles

1. **Separate elastic (stateless) from fixed (stateful).** App nodes hold no durable state → they
   can be added/removed freely. All state lives in the data tier (Postgres/Valkey/NATS) + B2.
2. **The edge is the first line of defense and speed.** Cloudflare terminates the public, absorbs
   DDoS/WAF, caches at the edge, and is the only thing the origin firewall trusts.
3. **Originals never transit the origin.** Photos go **browser → object storage directly**
   (presigned multipart). The app servers move metadata, not bytes.
4. **Ciphertext is safe to cache.** E2EE galleries let us serve encrypted blobs from a CDN
   (the key lives in the URL fragment, never reaches server/CDN) → CDN speed *and* E2EE.
5. **Fail closed, fail over automatically.** Every tier survives one node loss with no manual step.
6. **Everything reproducible.** Images from a registry (GHCR), nodes from one provisioning script,
   config in git. Re-creating a node is a command, not a project.

---

## 2. Target topology

```
                          ┌─────────────────────────────────────────────┐
                          │                 CLOUDFLARE                   │
   users (India + global) │  DNS · CDN cache · WAF · DDoS · Brotli/HTTP3 │
        │                 │  Load Balancing (health-checked failover)    │
        ▼                 │  TLS (Full-strict) · Argo (optional)         │
   ┌──────────┐           └───┬───────────────┬───────────────┬─────────┘
   │ browser  │ uploads       │ rawdrive.in    │ api.rawdrive  │ cdn.rawdrive.in
   │  / app   │──────────┐    │ *.rawdrive.in  │               │ (B2 via CF, cached)
   └──────────┘          │    ▼                ▼               ▼
        │ direct         │  ┌────────────────────────────────────┐   ┌──────────────────┐
        │ presigned      │  │     APP TIER (stateless, elastic)   │   │  OBJECT STORAGE   │
        │ multipart      │  │  app-1 … app-N  (Hostinger VPS)     │   │   Backblaze B2    │
        ▼                │  │  nginx · frontend(Next) · backend   │   │  media: rawfolder │
   ┌─────────────┐       │  │  · face-svc   (images pulled GHCR)  │   │  backups: rawdrive│
   │ Backblaze B2│◄──────┘  └───────────────┬────────────────────┘   │           -backups│
   │  (or R2 hot │  origin → HAProxy :5000   │ (reads/writes)         └──────────────────┘
   │   path)     │                           ▼
   └─────────────┘             ┌──────────────────────────────────────────┐
                               │     DATA TIER (fixed, 3-node quorum)      │
                               │  Patroni-Postgres (leader + replicas)     │
                               │  etcd (3 members) · HAProxy (leader VIP)  │
                               │  Valkey (primary + replica / Sentinel)    │
                               │  NATS (3-node cluster)                    │
                               │  pgBackRest → B2 (WAL + incr/diff/full)   │
                               └──────────────────────────────────────────┘
```

**Node roles (start with the 3 VPS you have, grow the app tier only):**

| Role | Count today | Scales? | Runs |
|------|-------------|---------|------|
| **App node** (stateless) | 2 (`.42`,`.44`) | **Yes — add VPS freely** | nginx, frontend, backend, face-svc, local pgbouncer→HAProxy, NATS client |
| **Data node** (fixed) | 3 (`.42`,`.44`,`.46` co-host etcd) | No (quorum-fixed) | Patroni-Postgres, etcd, Valkey, NATS, HAProxy |
| **DB primary host** | 1 (`.46`) | Auto-fails-over | Patroni leader |

> With only 3 VPS, app and data co-locate (etcd on all 3 for quorum; Postgres leader on `.46`,
> replica on `.44`). **Every *new* VPS is app-only and stateless** — that's what makes scaling
> trivial. The original 3 stay the data core.

---

## 3. Edge tier — Cloudflare (security + speed in one)

**DNS / proxy (move NS to Cloudflare; keep registrar at GoDaddy):**

| Host | Records (all 🟠 proxied unless noted) | Purpose |
|------|----------------------------------------|---------|
| `rawdrive.in`, `www` | A → every app node IP | apex site |
| `api.rawdrive.in` | A → every app node IP | backend API |
| `*.rawdrive.in` | A → every app node IP | tenant galleries (Universal SSL covers 1 level) |
| `cdn.rawdrive.in` | → B2 bucket (via Worker/Transform), proxied | **CDN-cached gallery blobs** |
| MX / SPF / DKIM / DMARC | **DNS-only (grey)** | SecureServer email — never proxy |

**Settings:** SSL/TLS **Full (strict)** (origin has a valid LE wildcard cert — never "Flexible");
Always-Use-HTTPS; HTTP/3 + Brotli + TLS1.3 ON; **Load Balancing** add-on (~$5/mo) with an origin
pool of all app nodes health-checked on `/health` → **automatic origin failover** (the free tier's
two-A-records has no health check; LB is what delivers true HA).

**Cache rules:** bypass `api.rawdrive.in`, `/api/*`, `/auth/*`, `/_next/data/*`, `/streams*`;
cache `/_next/static/*` (immutable, 1yr) and `cdn.rawdrive.in/*` (gallery blobs) hard.

**WAF:** free Managed Ruleset + an `/auth/*` rate-limit rule + bot fight mode.

**Origin lock (the security payoff):** after proxying is verified, the app-node firewall accepts
80/443 **only from Cloudflare IP ranges** (`deploy/scripts/cf-origin-lock.sh`, §9) → origin IPs are
hidden, every request must pass Cloudflare's WAF/DDoS. Direct-to-origin attacks become impossible.

**Real client IP:** nginx must restore the visitor IP from `CF-Connecting-IP`
(`deploy/nginx/cloudflare-real-ip.conf`, §9) or rate-limiting/fail2ban would act on Cloudflare's IPs
(= ban everyone). Your nginx log format already carries `cf_ray`/`cf_connecting_ip`.

---

## 4. App tier — stateless & elastic

- Each app node is **identical and stateless**: nginx (edge proxy + cache for static) → frontend
  (Next.js SSR) + backend (Go) + face-svc. No DB/cache/queue *data* lives here.
- Images are **pulled from GHCR** (the `build-images.yml` workflow already tags each commit;
  `DEPLOY_FROM_REGISTRY=1` already exists in `deploy-prod.sh`) → new nodes **pull, don't build**
  → ~3-min provision instead of ~15.
- DB access goes to the **HAProxy leader endpoint** (not a hardcoded `.46`), so a failover is
  transparent to the app. Local pgbouncer (transaction mode, `QueryExecModeExec`,
  `RegisterUUIDTypes`) sits in front.
- Cross-node resilience: Cloudflare LB across all app nodes + the existing nginx peer-backup
  upstream as a second layer.

**This separation is the change that makes scaling trivial** — today app nodes also co-host
Valkey/Postgres replicas, which couples them. New nodes drop the replica role entirely.

---

## 5. Data tier — Patroni Postgres HA (the repo already has it, just inactive)

Assets present in repo: `deploy/docker-compose.patroni.yml`, `deploy/patroni/`, `deploy/etcd/`,
`deploy/haproxy/haproxy.cfg`, `deploy/scripts/patroni-bootstrap.sh`, `patroni-status.sh`.

- **etcd** (3 members across `.42`/`.44`/`.46`) = the distributed consensus store (quorum survives 1
  loss).
- **Patroni** manages Postgres: 1 leader (`.46`) + ≥1 streaming replica (`.44`). On leader failure,
  Patroni promotes a replica automatically and updates etcd.
- **HAProxy** exposes a single leader endpoint (`:5000` read-write, `:5001` read-only) by polling
  Patroni's REST health — apps connect here, never to a fixed node. Read-only `:5001` lets us route
  read-heavy gallery queries to replicas (perf headroom).
- **Valkey**: primary + replica (add Sentinel for auto-failover when it matters; cache is
  rebuildable so this is lower priority than Postgres).
- **NATS**: existing 3-node cluster (already quorum-correct).

Result: **the DB single-point-of-failure is gone** and failover needs no human at 3 a.m.

---

## 6. High-throughput upload path (fast from mobile / low-bandwidth) ⭐

The #1 product requirement. Principle 3: **bytes never touch the app servers.**

**Pattern — resumable parallel multipart, browser → object store directly:**
1. Client asks backend for a **multipart upload session** (presigned part URLs). Backend stores
   session metadata only.
2. Client uploads parts **in parallel, directly to the object store** with **adaptive concurrency
   and chunk size** — detect throughput, scale parallel parts up on Wi-Fi, down on 3G.
3. **Resumability is the mobile killer-feature:** a dropped connection re-uploads only the missing
   parts (S3 multipart's part model), never restarts a 40 MB RAW from 0%. Each part retries with
   backoff. (The repo's chunked/incremental SHA-256 + "don't double-read the file" perf rules stay.)
4. On completion the backend finalizes the multipart + enqueues WebP-derivative generation
   (`thumb_sm/md/lg`, `display` 2400px) server-side. Originals preserved for download.

**Edge proximity (the latency lever for India):** uploading to a US/EU B2 region adds RTT that
hurts TCP ramp-up per part. Two ways to fix, pick per cost/speed:
- **(A) Cloudflare R2 as the hot upload landing** (global edge, low RTT from India), lifecycle-copy
  cold originals to B2. Best speed; small added complexity + R2 cost (R2 egress is free).
- **(B) Stay B2**, lean on resumable parallel multipart + adaptive concurrency to mask latency, and
  put the *download/serving* path behind Cloudflare (B2 Bandwidth Alliance = free egress). Cheapest;
  upload speed limited by RTT to B2's region.

**Recommendation:** ship the resumable-parallel-adaptive client first (biggest win, storage-agnostic);
evaluate R2-hot-path (A) if India upload latency is still the complaint. Either way **uploads never
bottleneck on the app nodes**, so upload speed scales with the client + object store, not your VPS.

---

## 7. Fast gallery delivery (Cloudflare CDN + E2EE) ⭐

Yes — Cloudflare CDN is the answer, *with* one design point because galleries are E2EE.

- **Serve gallery blobs from `cdn.rawdrive.in` (B2 fronted by Cloudflare).** Backblaze B2 is in the
  **Cloudflare Bandwidth Alliance → $0 egress** when served through Cloudflare, and Cloudflare
  **edge-caches** each object near the viewer (Mumbai/Chennai PoPs for your users) → first viewer
  warms the cache, everyone after is edge-fast.
- **E2EE is preserved:** the objects are **ciphertext**; the decryption key lives only in the URL
  **fragment** (`#rd_key=…`) which browsers never send to the server or CDN. So the CDN caches
  encrypted bytes (useless to anyone without the key), the **client decrypts in-browser**. You get
  *both* end-to-end encryption *and* CDN speed — the current per-request authenticated `/storage`
  stream can't be edge-cached, the cacheable-ciphertext model can.
- **Use stable, cacheable derivative URLs** (not per-request presigned, which kills cache hit-rate);
  access is gated at the share/PIN/password layer that controls **key** delivery, not blob fetch.
- Layer the existing client perf wins: **WebP derivatives** (already generated), **responsive sizes**
  (thumb for grid, display for lightbox), **blurhash placeholders**, **windowed/virtualized**
  grids+filmstrips (already in code), connection-aware prefetch. Result: a gallery opens with
  instant blurred placeholders → edge-cached thumbs → sharp, even on mobile.

---

## 8. Storage & backup — B2 (with continuous incremental DB backup)

- **Media:** B2 bucket `rawfolder` (current), served via `cdn.rawdrive.in` (§7).
- **DB backups → B2 bucket `rawdrive-backups`** (separate bucket = a media-key leak can't touch
  backups), three layers (repo has all of it: `deploy/pgbackrest/`, `deploy/scripts/pgbackrest-*.sh`):
  | Layer | Tool | Cadence | RPO |
  |-------|------|---------|-----|
  | Continuous WAL + **incremental** | pgBackRest → B2 | WAL streamed + hourly incr + daily diff + weekly full | **≈60 s** |
  | Logical (portable) | `pg_dump` + `pg-globals-backup.sh` → B2 | nightly | ≤24 h |
  | Streaming standby | Patroni replica | continuous | ≤5 s |
- Repo-encrypted (pgBackRest `aes-256-cbc` + GPG for the logical dump) — leaked B2 creds yield
  nothing readable. **Weekly automated restore-drill** (`pgbackrest-restore-verify.sh`) proves
  backups actually restore.
- **"Other things" to B2:** etcd snapshots (Patroni cluster state), Valkey RDB snapshot (sessions /
  rate-limit state), and the encrypted `platform_settings` export.

---

## 9. Security model — defense in depth (every layer)

| Layer | Control | Status |
|-------|---------|--------|
| Edge | Cloudflare WAF + DDoS + bot mgmt + rate-limit | to enable |
| Origin reachability | firewall 80/443 **only from Cloudflare IPs** (`cf-origin-lock.sh`) | to enable post-cutover |
| Data plane | `DOCKER-USER` peer-allowlist (Postgres/Valkey/NATS/etcd/HAProxy never public) | **DONE** |
| Host | UFW default-deny, fail2ban (SSH + nginx jails), Monarx malware agent, unattended-upgrades | **DONE** (jails added tonight) |
| SSH | key-only deploy key, `permitrootlogin without-password`, maxauthtries 3 | partial (password-auth still on — optional hardening) |
| Transport | TLS Full-strict edge→origin, mTLS optional origin↔origin | to enable |
| App | JWT (`JWTClaimsFromContext`), RLS (`app.workspace_id`), TOTP MFA, OTP reg-only | in place |
| Data at rest | E2EE galleries, envelope-encrypted secrets (`PLATFORM_SETTINGS_KEK`), encrypted backups | in place |
| Cluster | etcd peer auth, Patroni REST auth, Valkey `requirepass`, NATS auth | to verify on cutover |
| Secrets | `platform_settings` → env → fail; `.env.cobolt` gitignored; never in code/logs | in place |

**Never:** sync crypto keys to a new node from the wrong source; expose the DB tier; serve from `.46`.

---

## 10. Performance model — where each millisecond is won

- **Edge:** Cloudflare CDN (static + gallery blobs), Brotli, HTTP/3, Argo Smart Routing (optional,
  speeds dynamic/API through CF's backbone — helps India↔origin).
- **Network:** BBR + fq + TCP tuning **(DONE tonight)** on every node.
- **App:** nginx keepalive/http2 + edge-cached `_next/static`; Go backend; read queries can target
  HAProxy `:5001` (replicas).
- **DB:** already well-tuned (shared_buffers 2 GB, effective_cache_size 6 GB, SSD cost model, JIT,
  100 % cache hit); pgbouncer transaction pooling.
- **Uploads:** direct-to-object-store, resumable parallel multipart (§6).
- **Galleries:** CDN-cached encrypted derivatives + WebP + responsive + blurhash + virtualization (§7).
- **Compute headroom:** you run at ~5-10 % util — performance is edge/architecture-bound, *not*
  server-count-bound. Scale the app tier for *traffic/HA*, not for single-request speed.

---

## 11. Connectivity & failure-mode analysis (what happens when X dies)

| Failure | Result with target architecture |
|---------|-------------------------------|
| One app node dies | Cloudflare LB health-check drops it; traffic to remaining app nodes. **No outage.** |
| App node overloaded | Add a VPS (§12); Cloudflare LB pool picks it up. |
| Postgres leader (`.46`) dies | Patroni promotes `.44` replica via etcd; HAProxy repoints; apps unaffected (they use HAProxy). **No manual step.** |
| etcd loses 1 member | Quorum holds (2/3). Cluster fine. |
| Valkey primary dies | Sentinel/replica promote (or cache rebuilds — non-fatal). |
| Cloudflare edge issue | Rare; can temporarily grey-cloud DNS to origin (origin lock must be lifted first). |
| B2 region blip | Uploads/serving retry; WAL spools locally (pgBackRest async) — no write stall. |
| Whole region / both app nodes | DR: restore from B2 (pgBackRest PITR ≈60 s RPO) onto new nodes. |

---

## 12. Horizontal scaling — "add a VPS with minimal effort"

Hostinger has **no native autoscaler**, so "scale easily" = **one-command provisioning of a
stateless app node**, optionally auto-triggered.

**Manual (the robust default) — `deploy/scripts/add-app-node.sh <new-ip>`:**
1. Provision a fresh Hostinger VPS (Ubuntu 24.04). Add its host key to `deploy/known_hosts`.
2. Run the script → it: installs Docker; applies the security baseline (UFW, fail2ban + jails,
   `rawdrive-docker-fw.sh`, `99-rawdrive-net.conf` BBR, SSH hardening); logs in to GHCR; **pulls**
   the app images; renders configs (nginx, pgbouncer→HAProxy, env from a sealed source); `up -d`
   the **stateless** app stack; health-checks `/health/deep`.
3. Add the node's IP to the **Cloudflare LB origin pool** (one API call / dashboard click) and to
   the peer list. Live in ~3-5 min.

**Assisted auto-scale (optional advanced layer):** a monitor (Prometheus + alertmanager, or a cron
on the `/metrics` the backend now exposes) watches sustained CPU/RPS; on threshold it (a) pages you
to add a node, or (b) calls the **Hostinger API** to create a VPS + runs `add-app-node.sh` + adds it
to the CF LB pool, and scales back down off-peak. Honest note: a fully-autonomous Hostinger
autoscaler is custom work and should be added only once traffic genuinely needs it — the one-command
path covers you long before then.

**Why this works:** app nodes are stateless (§4) and images are pre-built (GHCR), so a new node is a
pull-and-join, never a build-and-migrate.

---

## 13. Migration / redeploy runbook (current → target, no downtime)

Ordered so production is never left broken. Each step is reversible until the one after it.

0. **Pre:** provision B2 `rawdrive-backups` bucket + scoped key; create Cloudflare account; (opt) buy
   CF Load Balancing; (opt) attach Hostinger floating IP. Take a fresh verified backup.
1. **Cloudflare onboarding (DNS-only):** add site, import records, **grey-cloud everything**, move
   GoDaddy NS to Cloudflare. Verify site unchanged + email intact. *(no traffic change yet)*
2. **Origin prep (I deploy):** add `cloudflare-real-ip.conf` to nginx (safe no-op pre-cutover);
   set CF SSL to **Full(strict)**.
3. **Flip proxy on:** orange-cloud one record → verify → the rest (apex, www, api, wildcard, cdn).
   Add the multi-IP A-records / LB pool. Galleries + API verified through CF.
4. **Origin lock (I deploy):** `cf-origin-lock.sh` → 80/443 only from Cloudflare. Re-verify.
5. **CDN for galleries:** stand up `cdn.rawdrive.in` → B2; switch gallery derivative URLs to it;
   confirm edge-cache HITs + client decrypt.
6. **Patroni cutover (watched window, I drive):** stand up etcd (additive) → bootstrap Patroni over
   the existing primary+replica → point pgbouncer at HAProxy → verify failover by killing the
   leader. Backup taken immediately before.
7. **pgBackRest activation:** set `PGBACKREST_*` env, build the pgBackRest Postgres image,
   `archive_mode=on` (one restart), `pgbackrest-init.sh` (stanza+check), first full, install cron +
   the weekly restore-drill.
8. **Upload path:** ship the resumable-parallel-adaptive uploader; (decision) evaluate R2 hot path.
9. **Scaling tooling:** finalize `add-app-node.sh` + GHCR pull deploy (`DEPLOY_FROM_REGISTRY=1`).
10. **Operate:** dashboards/alerts (§14); document; update memory + the deploy skill.

---

## 14. Operations

- **Monitor:** backend `/metrics` (Prometheus), `/health/deep` + `/health/ready`, pgBackRest
  `info` + `pg_stat_archiver`, Patroni `patroni-status.sh`, replica lag, CF analytics, cert expiry,
  fail2ban bans, disk/`pg_wal` headroom (PITR can fill `pg_wal` if archiving stalls — alert on it).
- **Alert** on: failover events, archiving failures, restore-drill FAIL, 5xx rate, CF origin-health.
- **Cost:** unchanged VPS (3, grow as needed) + B2 (storage + free CF egress) + Cloudflare (free, or
  ~$5/mo LB) + optional R2. No big new spend; scaling cost is linear per app VPS.

---

## 15. Prerequisites the owner must supply

1. **GoDaddy DNS access** (or willingness to move NS to Cloudflare) — for the apex/wildcard fix.
2. **Cloudflare account** + (recommended) Load Balancing add-on.
3. **B2 `rawdrive-backups` bucket** + scoped S3 key (for pgBackRest PITR).
4. (Optional) **Hostinger floating IP** and/or **Hostinger API token** (for assisted auto-scale).
5. A **watched maintenance window** for the Patroni cutover (step 6) — the one step with DB-failover
   risk; everything else is no-downtime.
```
