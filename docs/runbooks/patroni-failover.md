# Patroni Automatic Failover — Architecture, Cutover & Operations Runbook

> ⚠️ **STATUS: PLANNED CUTOVER — INERT UNTIL DELIBERATELY ACTIVATED.**
> The Patroni subsystem (etcd + Patroni + HAProxy) described here is **not yet
> live**. Until the cutover in [§4](#4-activation--cutover-procedure-maintenance-window)
> is performed inside a maintenance window, the **manual** failover model in
> [`postgres-failover.md`](./postgres-failover.md) remains in force. Once cut
> over, this runbook **SUPERSEDES** both `postgres-failover.md` and
> `deploy/scripts/promote-postgres-replica.sh` (see [§9](#9-what-this-supersedes)).

**Owner:** Platform / DB on-call.
**Goal:** Replace the manual "promote replica + hand-edit `pgbouncer/databases.ini`
+ reload" failover with **automatic leader election + failover** so pgbouncer
always reaches the current primary with **no human in the loop**.

---

## 1. Architecture

Three Hostinger KVM VPS (8 GB / 2 vCPU each):

| Node | IP | Role today | Patroni-subsystem services |
|------|----|-----------|----------------------------|
| `.42` | `187.127.142.42` | app | **etcd**, **HAProxy** |
| `.44` | `187.127.142.44` | app + DB standby | **etcd**, **HAProxy**, **Patroni** (Postgres) |
| `.46` | `187.127.142.46` | DB primary | **etcd**, **Patroni** (Postgres) |

```
                         WRITES                          READS (optional)
   backend (.42)            │                                  │
      └─ pgbouncer ─────────┤                                  │
         (unix socket)      ▼                                  ▼
                    ┌──────────────────┐            ┌──────────────────┐
                    │ HAProxy  :5432   │            │ HAProxy  :5433   │
                    │ (local, .42/.44) │            │ (local, .42/.44) │
                    │ httpchk /primary │            │ httpchk /replica │
                    └────────┬─────────┘            └────────┬─────────┘
                             │ only the node whose            │ any node whose
                             │ /primary == 200                │ /replica == 200
              ┌──────────────┴───────────────┐   ┌────────────┴───────────────┐
              ▼                              ▼   ▼                            ▼
     ┌─────────────────┐            ┌─────────────────┐
     │ Patroni  .46    │            │ Patroni  .44    │   Patroni REST :8008 on
     │ Postgres 17     │◀──stream───│ Postgres 17     │   each node answers
     │ LEADER (today)  │  (sync)    │ REPLICA (today) │   /primary, /replica,
     │ REST :8008      │            │ REST :8008      │   /health, /cluster
     └────────┬────────┘            └────────┬────────┘
              │ archive_command (pgBackRest) │
              ▼                              ▼
        WAL archive → pgBackRest repo (PITR, parallel subsystem)

                 ┌───────────── etcd (DCS) ─────────────┐
                 │  member on .42   .44   .46            │
                 │  Raft quorum = 2 (tolerates 1 down)   │
                 │  holds the LEADER key (lease, TTL 30) │
                 └──────────────────────────────────────┘
```

**Control loop, in one sentence:** each Patroni renews a TTL-bounded *leader
lease* in etcd; HAProxy health-checks every Patroni's REST `/primary`; exactly
one node holds the lease and returns `200`, so HAProxy `:5432` always forwards to
the current leader — and pgbouncer, pointed at the **local HAProxy**, never has
to change on failover.

### Component roles

- **etcd (DCS):** the single source of truth for "who is the leader". 3 members
  (one per host) → Raft quorum of 2 → survives losing any one node, **including
  the DB node** (the whole reason etcd also runs on the app nodes). Config:
  `deploy/etcd/etcd.conf.yml.template`.
- **Patroni:** Python supervisor inside the Postgres container; owns Postgres
  start/stop/promote/reinit, writes `postgresql.conf`/`pg_hba.conf`, runs the
  election against etcd, exposes REST `:8008`. Config:
  `deploy/patroni/patroni.yml.template`, image `deploy/patroni/Dockerfile`.
- **HAProxy:** transparent leader router on the app nodes; `:5432` → leader
  (write), `:5433` → replica pool (read), `:7000` stats. Config:
  `deploy/haproxy/haproxy.cfg`.
- **Overlay compose:** `deploy/docker-compose.patroni.yml` (project
  `rawdrive-patroni`, profile-gated, never auto-started by the normal deploy).

---

## 2. Data-safety model (READ THIS)

Two knobs in `bootstrap.dcs` (`deploy/patroni/patroni.yml.template`) decide
whether failover can lose committed-looking writes.

### `synchronous_mode: true` — zero-data-loss failover (RPO = 0)

With synchronous mode **on**, the primary will **not acknowledge a `COMMIT`** to
the application until at least one standby has the WAL, and Patroni will **only
promote a standby that was synchronous**. So the node it promotes has *every*
acknowledged commit. **RPO = 0.**

**The tradeoff (be honest about it):**

- **Write latency rises.** Every commit now waits for a network round-trip to the
  synchronous standby on `.44` (cross-VPS). Bulk writes (uploads, AI tagging)
  feel this most.
- **If no healthy synchronous standby exists,** what happens depends on
  `synchronous_mode_strict`:
  - `false` (our setting): Patroni temporarily falls back to **async** on the
    primary so writes are **not frozen** during a single-standby outage. There is
    a brief window where RPO > 0 — **alert on it** (see [§8](#8-monitoring--alerts)).
  - `true`: writes **block** until a sync standby returns. Stricter durability,
    but a standby outage becomes a full **write outage**. We deliberately keep it
    `false`.

The **old manual model accepted async** replication: `postgres-failover.md`
states "RPO: ≤5 seconds of write loss". Patroni with `synchronous_mode` removes
that window for acknowledged commits — that is the upgrade.

### `maximum_lag_on_failover: 1048576` (1 MiB)

A standby lagging more than 1 MiB of WAL behind the last-known leader position is
**not eligible for promotion**. Patroni would rather **refuse** an unsafe
failover than promote a far-behind replica and silently discard the gap. With
synchronous mode on, the sync standby is caught up by definition; this is the
backstop for async candidates and edge cases.

### Summary

| | Manual model (today) | Patroni (after cutover) |
|---|---|---|
| Detection | human notices, SSH in | etcd lease TTL (~30s) |
| Promotion | `pg_ctl promote` by hand | automatic, election-driven |
| Routing | edit `databases.ini` ×2 + reload | HAProxy reroutes, no edit |
| RPO | ≤ ~5 s (async) | **0** (sync) — async only in a degraded, alerted window |
| RTO | 3–5 min (human) | ~30–60 s (TTL + reroute) |

---

## 3. Files in this subsystem

| File | Purpose |
|------|---------|
| `deploy/patroni/Dockerfile` | Patroni-capable Postgres image (pgvector pg17 + pgbackrest + Patroni 4.0.4, pinned). |
| `deploy/patroni/patroni.yml.template` | Patroni config; mirrors `deploy/postgres/postgresql.conf` tuning into `bootstrap.dcs.postgresql.parameters`. |
| `deploy/etcd/etcd.conf.yml.template` | 3-member etcd v3.5.x config (one per host). |
| `deploy/haproxy/haproxy.cfg` | Leader router (`:5432` write, `:5433` read, `:7000` stats). |
| `deploy/docker-compose.patroni.yml` | Profile-gated overlay (`rawdrive-patroni`), **never** auto-started. |
| `deploy/scripts/patroni-bootstrap.sh` | The careful, confirm-gated cutover driver. |
| `deploy/scripts/patroni-status.sh` | Read-only status (patronictl / etcd / HAProxy / lag). |

All secrets/IPs come from `/opt/rawdrive/app/.env` — never hardcoded. New env
vars are listed in [§7](#7-required-env-vars).

---

## 4. Activation / cutover procedure (MAINTENANCE WINDOW)

> **This is not hot-swappable.** Patroni seizes the Postgres lifecycle and
> rewrites `postgresql.conf`/`pg_hba.conf`. There **will** be a brief write
> outage while the primary is stopped, adopted by Patroni, and the leader key is
> established. **Announce a maintenance window. Do it deliberately.**

### Pre-flight (the bootstrap script enforces all of these)

1. **Fresh, verified pgBackRest full backup** for stanza `rawdrive` (the rollback
   floor). Verify with `pgbackrest --stanza=rawdrive info`. See `pitr-restore.md`.
2. **`.44` standby healthy and streaming** (`pg_stat_replication` shows
   `state='streaming'`).
3. **All new env vars set** on **each** node with the **correct per-node
   identity** (`PATRONI_NAME`/`ETCD_NAME`/`*_NODE_IP` differ per host — see §7).
4. **Maintenance window announced**, no other cluster work in flight.

### Run it

Run **on `.46`** (the current primary). The script SSHes to `.42`/`.44` for the
remote steps and **requires an explicit `y` at every irreversible step**:

```bash
sudo bash deploy/scripts/patroni-bootstrap.sh
```

Ordered steps the script performs (each gated):

1. **Pre-flight** — all checks above; aborts on any failure.
2. **Start etcd** on `.42`/`.44`/`.46`; wait for a 3-member quorum.
3. **Adopt `.46` primary data dir under Patroni** *(irreversible / write-impacting)* —
   cleanly stop the standalone primary, start Patroni on the **same** data
   volume; wait for `.46` to take the leader role.
4. **Bring `.44` under Patroni** *(irreversible)* — stop the standalone standby,
   start Patroni; it rebuilds via **pgBackRest** (fallback `basebackup`) and
   streams from the leader; wait for a healthy replica.
5. **Start HAProxy** on `.42`/`.44`; verify `:5432` routes to a **writable**
   leader on each app node (refuses to continue otherwise).
6. **Repoint pgbouncer at the local HAProxy** *(the one-time `databases.ini`
   change)* — first allow the app bridge to HAProxy's private host-network
   listeners, then back up `databases.ini`, rewrite
   `host=host.docker.internal port=5432`, and recreate pgbouncer on both app
   nodes so Compose installs the `host.docker.internal:host-gateway` mapping.
   **After this, failover never touches pgbouncer again.**
7. **Validate** — `patronictl list` (one Leader + one Replica) and app health.

### Post-cutover verification

```bash
bash deploy/scripts/patroni-status.sh
# Expect: one Leader, one Replica (Sync Standby), etcd 3/3 healthy,
#         HAProxy pg_primary_backend has exactly ONE server UP.
curl -fsS https://api.rawdrive.in/health/deep
```

PgBouncer is a bridge container, while HAProxy is host-networked. On each app
node, UFW INPUT must allow the app Docker bridge CIDR to the private HAProxy
listeners:

```bash
bridge_subnet="$(docker network inspect rawdrive-app_default -f '{{(index .IPAM.Config 0).Subnet}}')"
ufw allow in proto tcp from "$bridge_subnet" to any port 5432,5433 comment docker-bridge-haproxy
```

Then prove the full local route:

```bash
docker exec deploy-pgbouncer-1 sh -c 'getent hosts host.docker.internal && nc -vz -w 3 host.docker.internal 5432'
docker run --rm --network host -e PGPASSWORD="$POSTGRES_PASSWORD" pgvector/pgvector:pg17 \
  psql -h 127.0.0.1 -p 6432 -U rawdrive -d rawdrive -tAc 'SELECT pg_is_in_recovery();'
# expect: f
```

### Rollback **during the window** (if the cutover misbehaves)

The standalone data volume is untouched (Patroni *adopted* it; it didn't
re-init), so rollback is fast:

1. On **both** app nodes: restore pgbouncer routing and reload:
   ```bash
   cp $COMPOSE_DIR/pgbouncer/databases.ini.pre-patroni.bak $COMPOSE_DIR/pgbouncer/databases.ini
   docker compose -f docker-compose.prod-app.yml restart pgbouncer
   ```
2. Stop the Patroni subsystem (on each node it runs):
   ```bash
   docker compose -f docker-compose.patroni.yml --profile patroni --profile haproxy --profile etcd down
   ```
3. Restart the standalone primary on `.46`:
   ```bash
   docker compose -f docker-compose.prod-db.yml up -d postgres
   ```
4. Restart the standalone standby on `.44` (it resumes streaming from `.46`):
   ```bash
   docker compose -f docker-compose.prod-app.yml --profile postgres-replica up -d postgres-replica
   ```
5. The **manual** model (`postgres-failover.md`) is back in force. Investigate
   before re-attempting the cutover.

> After a **successful, settled** cutover, rolling back is a *new* maintenance
> window (you'd be demoting a live Patroni cluster) — not the quick path above.

---

## 5. What automatic failover does on primary death

No human action required:

1. The leader (`.46`) stops renewing its **lease** in etcd.
2. After `ttl` (30 s) the lease expires; etcd (quorum on the survivors) declares
   the leader key empty.
3. Patroni on the eligible standby (`.44`) sees the empty key, confirms it is
   **caught up** (`maximum_lag_on_failover`, sync state) and on the right
   timeline, and **promotes** itself by grabbing the leader key.
4. `.44`'s REST `/primary` flips to `200`; `.46`'s (if reachable) returns `503`.
5. **HAProxy** on the app nodes marks `.46` DOWN, `.44` UP (`fall 3`/`rise 2`,
   plus `on-marked-down shutdown-sessions` kills stale connections), and routes
   `:5432` → `.44`.
6. **pgbouncer is unaffected** — it still points at `host.docker.internal:5432`
   (the host-local HAProxy). The pool transparently reconnects to the new
   leader. **No `databases.ini` edit, no pgbouncer restart, no human.**

Typical end-to-end: **~30–60 s** (TTL + a couple of HAProxy check intervals).

When the old `.46` returns, Patroni uses **`pg_rewind`** (enabled,
`wal_log_hints=on`) to rewind it onto the new timeline and rejoin it as a standby
**without a full base backup**. If rewind isn't possible, it rebuilds via
pgBackRest/basebackup.

---

## 6. Planned switchover (zero-surprise, operator-initiated)

For maintenance on the current leader (kernel patch, resize), do a **controlled
switchover** — picks a moment with no lag, promotes cleanly:

```bash
# On any node running Patroni:
docker exec deploy-patroni-1 patronictl -c /etc/patroni/patroni.yml switchover
#   Master? [.46]   Candidate? [.44]   When? [now]   Confirm? y
```

Patroni waits for the candidate to be caught up, demotes the old leader, promotes
the candidate, and HAProxy reroutes — all within seconds, **no data loss**, and
again **pgbouncer is untouched**. Verify with `patroni-status.sh`.

To rebuild a member from scratch (e.g. a corrupted standby):
`patronictl reinit rawdrive <member>`.

---

## 7. Required env vars

Per-node values in `/opt/rawdrive/app/.env` (documented in `deploy/.env.example`
— see the integration notes). **Identity vars differ per host:**

| Var | `.42` | `.44` | `.46` | Meaning |
|-----|-------|-------|-------|---------|
| `PATRONI_NAME` | — | `pg-44` | `pg-46` | unique Patroni member name (DB nodes only) |
| `PATRONI_NODE_IP` | — | `…44` | `…46` | this node's Postgres/REST IP |
| `PATRONI_SCOPE` | `rawdrive` | `rawdrive` | `rawdrive` | cluster scope (same everywhere) |
| `ETCD_NAME` | `etcd-42` | `etcd-44` | `etcd-46` | unique etcd member name |
| `ETCD_NODE_IP` | `…42` | `…44` | `…46` | this etcd member's IP |
| `ETCD_NODE_42_IP` / `_44_IP` / `_46_IP` | the three IPs | same | same | cluster roster (same everywhere) |
| `ETCD_INITIAL_CLUSTER_TOKEN` | shared secret | same | same | binds the 3 into one cluster |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | — | from `.env` | from `.env` | superuser (existing var) |
| `POSTGRES_REPLICATION_PASSWORD` | — | from `.env` | from `.env` | replication role (existing var) |

`POSTGRES_*` reuse the existing rotated secrets — **no new passwords**.

---

## 8. Monitoring / alerts

Run `patroni-status.sh` for an at-a-glance view. Wire these alerts:

- **No leader** — `patronictl list` shows zero `Leader`, or HAProxy
  `pg_primary_backend` has **zero** UP servers → writes are down. **Page.**
- **No synchronous standby** while `synchronous_mode=true` — the cluster is in
  the degraded **async-fallback** window (`synchronous_mode_strict=false`), so
  RPO is briefly > 0. Alert from the Patroni `/patroni` REST field
  (`sync_standby` count) — see `patroni-status.sh`.
- **etcd quorum loss** — fewer than 2 etcd members healthy → failover is
  **frozen** (safe, but no protection until quorum returns). **Page.**
- **Replication lag** > `maximum_lag_on_failover` (1 MiB) for a sustained period
  → the standby would be **ineligible** to promote. Investigate.
- **WAL archive lag** — `pg_stat_archiver` failing → PITR repo falling behind;
  ties into the pgBackRest subsystem (`pitr-restore.md`).

---

## 9. Split-brain safeguards (why two leaders can't happen)

Split brain = two nodes both believing they are primary and both accepting
writes. It is the worst outcome (irreconcilable divergent data). Defenses, in
layers:

1. **etcd quorum (the primary guard).** Promotion requires grabbing the leader
   key in etcd, which requires a Raft **majority**. With 3 members the majority
   is 2. A partitioned node that cannot reach a majority **cannot** win the key,
   so it **cannot** promote. If quorum is lost entirely, etcd goes read-only and
   Patroni **freezes** the topology — no promotion at all (correctly preferring
   unavailability over split brain).
2. **`synchronous_mode` + `maximum_lag_on_failover`.** Only a caught-up
   (synchronous, within-lag, same-timeline) standby is promotable, so a stale or
   diverged node is excluded.
3. **`check_timeline: true` + `use_pg_rewind`.** A returning old leader is
   rewound onto the new timeline before it can rejoin — it comes back as a
   **standby**, never a second primary.
4. **HAProxy single-UP invariant.** `:5432` forwards only to the node whose
   `/primary` returns `200`; exactly one node ever does, so even a routing-layer
   mistake cannot send writes to two backends.

**Operational rule:** **NEVER** start a second standalone primary "to be safe",
**never** run `pg_ctl promote` by hand on a Patroni-managed node, and **never**
edit `pgbouncer/databases.ini` to bypass HAProxy after cutover. All of those
re-introduce the split-brain risk Patroni exists to prevent. Use `patronictl`.

> **Watchdog note:** hardware watchdog fencing is **off** (`watchdog: mode: off`)
> because Docker on a shared VPS has no dedicated `/dev/watchdog`, and rebooting
> the whole VPS to fence one container would also kill the co-located app tier on
> `.44`. etcd quorum + synchronous mode + lag/timeline checks are the
> split-brain defense instead. This is a deliberate, accepted tradeoff.

---

## 10. What this supersedes

Once **cut over**, this runbook is authoritative and the manual model is retired:

- **`docs/runbooks/postgres-failover.md`** — superseded. Add a banner at the top:
  *"⚠️ SUPERSEDED by patroni-failover.md once the Patroni cutover is complete.
  Use this ONLY if the cluster has been deliberately rolled back to the manual
  model."* **Do not delete it** — it is the rollback target.
- **`deploy/scripts/promote-postgres-replica.sh`** — superseded. Add a header
  banner: *"⚠️ SUPERSEDED by Patroni automatic failover (deploy/scripts/patroni-*.sh,
  docs/runbooks/patroni-failover.md). Manual promotion on a Patroni-managed node
  causes split brain. Use `patronictl switchover/failover` instead. Kept only for
  the rolled-back manual model."* **Do not delete it.**

**Until cutover, the manual model remains in force** and these two artifacts are
still the correct procedure.
