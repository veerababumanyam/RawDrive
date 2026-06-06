# Production HA Rebuild From Config Backup

**Status:** Current rebuild contract for the Patroni production topology after
the 2026-06-06 HA cutover.

Use this when production must be rebuilt onto fresh hosts or when validating a
full disaster recovery rehearsal. This is not a replacement for pgBackRest data
backups. It is the config/topology companion to those backups.

Sanitized config backup:
[`docs/production-config-backups/2026-06-06-ha-cutover/`](../production-config-backups/2026-06-06-ha-cutover/).

## Rebuild Inputs

Required from git:

- `deploy/docker-compose.patroni.yml`
- `deploy/docker-compose.prod-app.yml`
- `deploy/docker-compose.prod-db.yml`
- `deploy/etcd/etcd.conf.yml.template`
- `deploy/patroni/patroni.yml.template`
- `deploy/haproxy/haproxy.cfg`
- `deploy/pgbouncer/databases.ini`
- `deploy/pgbouncer/pgbouncer.ini`
- `deploy/pgbackrest/pgbackrest.conf`
- `deploy/scripts/capture-prod-config-backup.sh`
- `deploy/scripts/pgbackrest-init.sh`
- `deploy/scripts/pgbackrest-restore-verify.sh`
- `deploy/scripts/rawdrive-docker-fw.sh`
- `deploy/scripts/patroni-status.sh`

Required outside git:

- Real `/opt/rawdrive/app/.env` values for each node. Use the snapshot
  `env-key-manifest.env` files as the required key checklist, not as values.
- pgBackRest B2 key ID, application key, and cipher passphrase.
- Backblaze B2 bucket and endpoint details.
- TLS certificates/private keys for Nginx.
- PgBouncer `userlist.txt` password hashes or a freshly generated equivalent.
- Cloudflare/DNS access and origin-lock firewall source ranges.
- SSH keys and Hostinger console access.

Never commit real secrets, PgBouncer password hashes, TLS private keys, or the
pgBackRest cipher passphrase.

## Target Topology

| Node | IP | Required services |
|------|----|-------------------|
| app1 | `187.127.142.42` | app stack, etcd, HAProxy, PgBouncer |
| app2/db2 | `187.127.142.44` | app stack, etcd, Patroni standby, HAProxy, PgBouncer |
| db1 | `187.127.142.46` | etcd, Patroni leader, pgBackRest archive/check source |

Final expected HA state:

- Patroni: `.46` Leader, `.44` Sync Standby, lag 0.
- HAProxy write backend: `.46` UP, `.44` DOWN.
- HAProxy read backend: `.44` UP, `.46` DOWN.
- PgBouncer on `.42` and `.44`: `host=host.docker.internal port=5432`.
- Public DB/Patroni/etcd ports: not reachable from the internet.

## Rebuild Order

1. Provision three hosts with Docker, Compose, UFW, fail2ban, and the repository
   at `/opt/rawdrive/app`.
2. Restore or recreate `/opt/rawdrive/app/.env` on each host. Use the sanitized
   `env-key-manifest.env` files in the backup directory as the key checklist.
3. Install TLS assets and PgBouncer `userlist.txt` outside git.
4. Build `rawdrive-postgres:local`, `rawdrive-patroni:local`,
   `rawdrive-backend:local`, and `rawdrive-frontend:local` as needed.
5. Apply firewall baseline:
   ```bash
   /opt/rawdrive/app/deploy/scripts/rawdrive-docker-fw.sh apply
   ufw status numbered
   iptables -S DOCKER-USER
   ```
6. Start etcd on all three nodes and confirm quorum.
7. Restore `.46` database data from pgBackRest/B2, then start Patroni on `.46`.
   Do not start the old standalone `deploy-postgres-1` path for normal rebuilds.
8. Start Patroni on `.44` and let it rebuild as the standby from pgBackRest first,
   then basebackup fallback if needed.
9. Confirm and, if necessary, replace DCS dynamic config so `patronictl
   show-config` contains the F-077 HBA/ident rules. It must not contain
   `local rawdrive trust`.
10. Start HAProxy on `.42` and `.44`.
11. Allow each app bridge CIDR to the private host-network HAProxy listeners:
    ```bash
    bridge_subnet="$(docker network inspect rawdrive-app_default -f '{{(index .IPAM.Config 0).Subnet}}')"
    ufw allow in proto tcp from "$bridge_subnet" to any port 5432,5433 comment docker-bridge-haproxy
    ```
12. Start/recreate PgBouncer on `.42` and `.44`; it must have
    `host.docker.internal:host-gateway` and route `rawdrive` to
    `host=host.docker.internal port=5432`.
13. Start the app stack and Nginx.
14. Run the validation checklist below.
15. Run a controlled switchover to `.44`, verify writes, then switch back to
    `.46` unless the incident requires `.44` to remain leader.
16. Run `pgbackrest-init.sh`, `pgbackrest check`, a full backup if needed, and
    `pgbackrest-restore-verify.sh`.
17. Capture a fresh sanitized config backup:
    ```bash
    deploy/scripts/capture-prod-config-backup.sh docs/production-config-backups/$(date -u +%Y-%m-%d-ha-rebuild)
    ```

## Validation Checklist

Patroni:

```bash
docker exec deploy-patroni-1 patronictl -c /etc/patroni/patroni.yml list
docker exec deploy-patroni-1 patronictl -c /etc/patroni/patroni.yml show-config | sed -n '/pg_hba:/,/use_pg_rewind/p'
docker exec deploy-patroni-1 sh -lc 'sed -n "1,80p" "$(printenv PGDATA)/pg_hba.conf"'
```

Expected:

- one Leader and one Sync Standby;
- timeline consistent;
- lag 0 MB after steady state;
- no `trust` in DCS or active PGDATA HBA;
- cross-node `host all postgres <.44/.46>/32 scram-sha-256` present.

HAProxy:

```bash
curl -fsS 'http://127.0.0.1:7000/;csv;norefresh' \
  | awk -F, '$1 ~ /^pg_(primary|replica)_backend$/ && $2 ~ /^pg-/ {print $1, $2, $18, $37, $57}'
```

Expected with `.46` leader:

```text
pg_primary_backend pg-46 UP L7OK
pg_primary_backend pg-44 DOWN L7STS Service Unavailable
pg_replica_backend pg-46 DOWN L7STS Service Unavailable
pg_replica_backend pg-44 UP L7OK
```

PgBouncer:

```bash
docker exec deploy-pgbouncer-1 sh -lc 'psql "$DATABASE_URL" -tAc "SELECT inet_server_addr(), pg_is_in_recovery()"'
```

Expected from both app nodes while `.46` is leader:

```text
187.127.142.46|f
```

App health:

```bash
curl -kfsS --resolve api.rawdrive.in:443:127.0.0.1 https://api.rawdrive.in/health/deep
```

Expected:

- overall `healthy`;
- DB healthy;
- migrations ready;
- storage healthy;
- valkey healthy.

Backup restore smoke:

```bash
ssh root@187.127.142.46 '/opt/rawdrive/app/deploy/scripts/pgbackrest-restore-verify.sh'
```

Expected:

- restore completes from B2;
- disposable Postgres reaches readiness;
- key RawDrive tables exist;
- script exits with `restore-verify PASSED`.

External exposure check from outside the cluster:

```bash
nc -G 2 -vz 187.127.142.46 5432
nc -G 2 -vz 187.127.142.46 8008
nc -G 2 -vz 187.127.142.44 5432
nc -G 2 -vz 187.127.142.44 5433
nc -G 2 -vz 187.127.142.42 5432
```

Expected: timeouts or refused access from non-cluster sources.

## Known Failure Modes To Avoid

- **Bootstrap-only HBA:** do not rely on `bootstrap.dcs.postgresql.pg_hba` for an
  existing PGDATA adopt. Put HBA/ident under top-level `postgresql:` and keep
  DCS dynamic config in sync.
- **DCS stale `trust`:** after emergency edits, check `patronictl show-config`;
  DCS is a rebuild source of truth and must not carry obsolete auth rules.
- **PgBouncer loopback trap:** PgBouncer is a bridge container. `127.0.0.1`
  points inside PgBouncer, not at host HAProxy.
- **HAProxy hairpin trap:** `.44` HAProxy cannot reliably reach local Postgres
  via `.44` public IP while bridge-networked. Use host networking and private
  gateway binds.
- **Firewall layer confusion:** DOCKER-USER protects Docker-published ports;
  host-network HAProxy listeners need UFW INPUT rules.
- **Restore path mismatch:** pgBackRest `--pg1-path` must match the PGDATA path
  used when the disposable Postgres boots.
- **Secret expansion in comments:** files rendered by `envsubst` must not use
  `${SECRET_VAR}` in comments.
- **Secret process args:** pass pgBackRest secrets to disposable containers with
  `--env-file`, not `docker run -e SECRET=value`.

## Config Backup Refresh

Use the committed capture script from a trusted operator workstation:

```bash
deploy/scripts/capture-prod-config-backup.sh docs/production-config-backups/$(date -u +%Y-%m-%d-ha-rebuild)
```

The script captures:

- redacted `.env` key manifests;
- host deploy files;
- active container-rendered Patroni, HAProxy, PgBouncer, and Nginx views;
- UFW and DOCKER-USER rules;
- Docker listeners and networks;
- Patroni DCS config and cluster list;
- pgBackRest info;
- PgBouncer routing, HAProxy state, and local app health.

Run these scans before committing a backup:

```bash
rg --pcre2 -n 'local   all             rawdrive                                trust|password: (?!<REDACTED>)|PGBACKREST_REPO1_S3_KEY_SECRET=[^<]|B2_APPLICATION_KEY=[^<]|JWT_SECRET=[^<]|PRIVATE KEY|\$2[aby]\$' docs/production-config-backups/
rg -n -P '(?<![A-Za-z0-9])[A-Fa-f0-9]{32,}(?![A-Za-z0-9])|AKIA[0-9A-Z]{16}|[A-Za-z0-9+/]{48,}={0,2}' docs/production-config-backups/
```

Both commands should return no secret-bearing matches. WAL names and file paths
can appear in the second scan and should be reviewed manually.
