# Patroni Auto-Failover Cutover - Execution Runbook

**Status (2026-06-06): LIVE CUTOVER COMPLETE.** The production Patroni stack is
now live and validated end-to-end: `.46` leader, `.44` synchronous standby,
three-member etcd quorum, HAProxy leader routing on `.42`/`.44`, PgBouncer
pointing at local HAProxy, successful controlled switchover to `.44`, successful
switch-back to `.46`, and successful pgBackRest restore verification from B2.

This file is now a historical execution log plus a checklist for future rebuilds.
For day-2 operations use [`patroni-failover.md`](./patroni-failover.md). For a
full production rebuild use [`production-ha-rebuild.md`](./production-ha-rebuild.md).
The sanitized rebuild snapshot is stored in
[`docs/production-config-backups/2026-06-06-ha-cutover/`](../production-config-backups/2026-06-06-ha-cutover/).

## Final production fixes and learnings

The original seven pre-live bugs below remain useful history, but the live
cutover found additional production-only issues:

1. **Patroni `pg_hba` on adopt:** `pg_hba` under `bootstrap.dcs` is not applied
   when Patroni adopts an existing PGDATA. Final fix: keep HBA and ident under
   top-level `postgresql:` so Patroni writes them every start.
2. **No auth downgrade:** remove the old `local rawdrive trust` model. Final HBA
   uses `local all postgres peer`, `local all rawdrive peer map=rawdrive_ops`,
   local replication scram, and TCP scram.
3. **Cross-node superuser checks:** Patroni can check/rewind peers as
   `postgres@postgres`; both DB-capable nodes need explicit
   `host all postgres <.44/.46>/32 scram-sha-256` rules.
4. **DCS cleanup matters:** after the live fix, `patronictl show-config` still
   showed the old bootstrap-era HBA. It was replaced with the same F-077 rules
   so future DCS-driven rebuilds do not copy stale `trust`.
5. **HAProxy hairpin:** `.44` HAProxy as a bridge container cannot reliably reach
   `.44:5432` via the host public IP. Final fix: HAProxy is host-networked and
   binds only loopback plus Docker gateway addresses for `5432/5433`.
6. **PgBouncer bridge routing:** PgBouncer must connect to
   `host.docker.internal:5432`, not `127.0.0.1`, and Compose must provide
   `host.docker.internal:host-gateway`.
7. **Firewall model:** HAProxy host-network listeners are protected by UFW INPUT,
   not DOCKER-USER. Allow the app bridge CIDR to `5432,5433`; public probes must
   still time out.
8. **Restore verification:** pgBackRest restore verification must use the same
   `pg1-path` as the disposable Postgres PGDATA. `/restore` for restore plus
   `/var/lib/postgresql/data` for boot causes archive recovery failure.
9. **Template comments:** avoid `${SECRET_VAR}` syntax in comments of files that
   are rendered by `envsubst`; comments are expanded too.

Post-live verification commands:

```bash
docker exec deploy-patroni-1 patronictl -c /etc/patroni/patroni.yml list
docker exec deploy-patroni-1 patronictl -c /etc/patroni/patroni.yml show-config | sed -n '/pg_hba:/,/use_pg_rewind/p'
curl -fsS 'http://127.0.0.1:7000/;csv;norefresh' | awk -F, '$1 ~ /^pg_(primary|replica)_backend$/ && $2 ~ /^pg-/ {print $1, $2, $18, $37, $57}'
docker exec deploy-pgbouncer-1 sh -lc 'psql "$DATABASE_URL" -tAc "SELECT inet_server_addr(), pg_is_in_recovery()"'
```

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

## Remaining validation before future rebuilds
Before rebuilding production from empty hosts, rehearse with restored data on
throwaway volumes and a non-production Patroni scope. Prove: `.46` restored
leader read-write, `.44` replica rebuild + synchronous streaming, HAProxy
write/read routes, PgBouncer through local HAProxy, controlled switchover, and
switch-back.

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

Apps reach Postgres via `pgbouncer` (on `.42`/`.44`) → **host-local HAProxy
`host.docker.internal:5432`** (write, always the current leader) / `:5433`
(read, any replica). Failover is then transparent — pgbouncer never needs
editing again.

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
5. **Repoint pgbouncer** on `.42`/`.44`: allow the app bridge to HAProxy's private
   host-network listeners (derive the subnet with
   `docker network inspect rawdrive-app_default -f '{{(index .IPAM.Config 0).Subnet}}'`,
   then `ufw allow in proto tcp from "$bridge_subnet" to any port 5432,5433
   comment docker-bridge-haproxy`), set `databases.ini` to
   `host=host.docker.internal port=5432`, recreate pgbouncer so Compose installs
   the host-gateway mapping, then verify pgbouncer returns `pg_is_in_recovery=f`.

## Phase D — Post-cutover
- Update committed `deploy/pgbouncer/databases.ini` → `host.docker.internal`
  (else a redeploy reverts it).
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
