# Patroni Auto-Failover Cutover — Execution Runbook

**Status (2026-06-06): PREP DONE + CORE VALIDATED, LIVE CUTOVER HELD.** The Patroni stack was coded
but had **never been run**; attempting it live surfaced **7 distinct never-tested bugs** (all now
fixed below). The 3-node etcd cluster and single-node leader **adoption + promotion** are validated
in an isolated self-test, but the **full multi-node cutover** (`.44` replica rebuild → HAProxy →
pgbouncer repoint) is **NOT yet validated** and almost certainly hides more issues. Three live
attempts each briefly degraded the primary (≤90 s outage / read-only) and were **cleanly rolled back
with zero data loss**. Per "production is sacred," the live cutover is **deferred until a full
isolated multi-node rehearsal passes** — do NOT run it live before that.

## Bugs found & fixed (the stack had never executed end-to-end)
1. **etcd** image is distroless (no `/bin/sh`) — the `sh -c envsubst` entrypoint could never start.
   Fixed: configure etcd via **native `ETCD_*` env vars**, exec-form healthcheck.
2. **`deploy/.env`** was a 226-byte per-node file on `.42/.44` (not the symlink `.46` had), so the
   patroni compose interpolated etcd/patroni vars to **empty**. Fixed: symlink → main `.env`, and
   moved the per-node `API_BASE/NATS_BIND_IP/PEER_NODE_IP` into the main `.env`.
3. **`envsubst` missing** from the patroni image → entrypoint can't render config. Fixed: add `gettext-base`.
4. **`/etc/patroni` root-owned** but entrypoint runs as `postgres` → `Permission denied` writing the
   rendered config. Fixed: `mkdir -p /etc/patroni && chown postgres` in the Dockerfile.
5. **`su postgres -c`** from the already-`postgres` user → "Authentication failure" (passwordless su).
   Fixed: `exec patroni` directly (no su).
6. **Postgres bound IPv4 only** (`listen: 0.0.0.0`) but patroni health-probes `localhost`(→`::1`) →
   refused → patroni judges itself unhealthy → **won't promote → read-only**. Fixed:
   `listen: "*:5432"` + `use_unix_socket: true` (socket path authorised by the `local all rawdrive
   trust` pg_hba). **Validated**: self-test now becomes a read-write Leader.
7. **patroni on the bridge network** can't reach etcd at the nodes' public IPs (hairpin NAT timeout) →
   loses DCS → read-only. Fixed: `network_mode: host` (matches the working self-test). NOTE: host
   listeners use UFW INPUT — add UFW allows for `8008` (+ existing `5432`) on `.46/.44` before activation.

## Remaining validation before going live (MANDATORY)
Stand up a **full isolated rehearsal** (real data restored to a throwaway volume via `pgbackrest
restore`, on non-conflicting ports/scope, all 3 etcd + 2 patroni + 2 haproxy) and prove: leader
adoption read-write, `.44` replica rebuild + streaming, HAProxy routes write→leader / read→replica,
pgbouncer→HAProxy, and a `patronictl switchover` failover. Only then schedule the live window.

---

This is the procedure that converts the manual Postgres failover model (single primary `.46` +
manual-promote streaming replica `.44`) into an automatic **Patroni + etcd + HAProxy** cluster,
integrated with the live **pgBackRest PITR** layer.

> Supersedes the manual model in `deploy/scripts/promote-postgres-replica.sh` /
> `docs/runbooks/postgres-failover.md`. Companion: `docs/runbooks/patroni-failover.md` (ops),
> `references/target-architecture.md`.

## Topology
| Node | IP | Patroni roles |
|------|-----|---------------|
| app1 | `187.127.142.42` | etcd, haproxy |
| app2 | `187.127.142.44` | etcd, haproxy, **patroni** (standby) |
| db   | `187.127.142.46` | etcd, **patroni** (leader / today's primary) |

Apps reach Postgres via `pgbouncer` (on `.42`/`.44`) → **local HAProxy `127.0.0.1:5432`** (write,
always the current leader) / `:5433` (read, any replica). Failover is then transparent — pgbouncer
never needs editing again.

## Integration fixes that MUST be in place first (done — PR #196)
The coded Patroni stack predated pgBackRest. Without these the daily B2 backup breaks under Patroni:
1. `patroni.yml.template` `pg_hba` includes `local all rawdrive trust` (pgBackRest connects as
   `rawdrive` over the local socket; `archive-push` needs no DB auth but `backup`/`check` do).
2. Backup scripts auto-detect the live container `deploy-(patroni|postgres)-1` (it becomes
   `deploy-patroni-1` after cutover).
The patroni service loads the full `.env` via `env_file`, so `PGBACKREST_REPO1_*` reach the
container; the data volume is `external: true name: rawdrive-db_postgres_data` so Patroni **adopts**
the live PGDATA (never re-inits).

## Phase B — Additive prep (ZERO downtime, fully abortable)
1. **Build images** on `.46` AND `.44`: `rawdrive-postgres:local` (pgvector+pgbackrest) then
   `rawdrive-patroni:local` (`deploy/patroni/Dockerfile`, context = repo root).
2. **Per-node env** in `/opt/rawdrive/app/.env` (back up `.env` first):
   - `.46`: `PATRONI_NAME=pg-46 PATRONI_NODE_IP=.46 PATRONI_SCOPE=rawdrive PATRONI_RESTAPI_PORT=8008
     ETCD_NAME=etcd-46 ETCD_NODE_IP=.46` + shared block.
   - `.44`: `PATRONI_NAME=pg-44 PATRONI_NODE_IP=.44 … ETCD_NAME=etcd-44 ETCD_NODE_IP=.44` + shared,
     **plus** `POSTGRES_REPLICATION_PASSWORD` + `PGBACKREST_REPO1_S3_KEY/_SECRET/_CIPHER_PASS`
     (copied from `.46` — `.44` lacked them).
   - `.42`: `ETCD_NAME=etcd-42 ETCD_NODE_IP=.42` + shared (etcd+haproxy only; no PATRONI_*).
   - shared block (identical on all 3): `ETCD_NODE_42_IP=.42 ETCD_NODE_44_IP=.44 ETCD_NODE_46_IP=.46
     ETCD_INITIAL_CLUSTER_TOKEN=<one secret>`.
3. **Stage HA configs to `.46`** (`.42`/`.44` already have them): `docker-compose.patroni.yml`,
   `etcd/`, `patroni/` (the PR#196-fixed template), `haproxy/`, `pgbackrest/`.
4. **Fresh pgBackRest full backup** = the rollback floor.

## Phase C — Brownout cutover (~30–90 s write outage on `.46`)
1. `etcd` up on all 3 (`--profile etcd`), wait 3-member quorum.
2. **Adopt `.46`** (IRREVERSIBLE): stop standalone `postgres` (project `rawdrive-db`), `--profile
   patroni up -d patroni` (project `rawdrive-patroni`, adopts the external volume), wait
   `:8008/primary` = 200.
3. **Adopt `.44`**: stop standalone `postgres-replica` (needs BOTH `-f docker-compose.prod-app.yml
   -f docker-compose.postgres-replica.override.yml`), `--profile patroni up -d patroni`, wait
   `:8008/replica` = 200 (rebuilds from leader via pgbackrest → basebackup).
4. **HAProxy** up on `.42`/`.44`, verify each routes `:5432`→writable leader (`pg_is_in_recovery=f`).
5. **Repoint pgbouncer** on `.42`/`.44`: `databases.ini` host → `127.0.0.1:5432`, restart pgbouncer.

## Phase D — Post-cutover
- Update committed `deploy/pgbouncer/databases.ini` → `127.0.0.1` (else a redeploy reverts it).
- `patronictl list` shows 1 Leader + 1 Sync Standby; etcd 3/3; app + edge `200`; WAL still
  archiving; a daily pgbackrest backup runs (container now `deploy-patroni-1`).
- Optional: `patronictl switchover` failover drill.

## ROLLBACK (during the window)
- pgbouncer: restore `databases.ini.pre-patroni.bak` + restart.
- DB: `--profile patroni down` on `.46`; `docker compose -f docker-compose.prod-db.yml up -d
  postgres` (project `rawdrive-db`) — the data volume is untouched, standalone primary returns.
- Worst case (data): restore the Phase-B pgBackRest/dump from B2.

## Trade-off
`synchronous_mode: true` (`synchronous_mode_strict: false`) = RPO 0 but each commit waits for the
`.44` sync standby (cross-VPS round-trip). If write latency is unacceptable, set
`synchronous_mode: false` in `patroni.yml.template` (async; tiny RPO window on a double-fault).
