# Postgres Primary Failover Runbook

**When to use:** Postgres primary on `.46` is confirmed dead (disk failure, prolonged network partition, unrecoverable crash).

**Pre-conditions:**
- `.44` postgres-replica container is healthy and streaming from primary (verify with `docker exec deploy-postgres-replica-1 psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();"` — should return `t`)
- You have SSH access to all three VPSes
- No one else is actively working on the cluster

**RTO target:** 3–5 minutes from dead primary to app accepting writes.
**RPO:** ≤5 seconds of write loss (async replication lag).

## Step-by-step procedure

### 1. Confirm primary is actually dead

```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 pg_isready -U rawdrive -d rawdrive' 2>&1
# Expected: failure (connection refused, container down, or host unreachable)
```

If `.46` is alive but stuck, first try: `ssh root@187.127.142.46 'docker restart deploy-postgres-1'` and wait 60s. Only proceed with failover if it still won't recover.

### 2. Promote the replica on .44

```bash
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 pg_ctl promote -D /var/lib/postgresql/data'
# Wait 3 seconds, then verify:
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();"'
# Expected: pg_is_in_recovery | f (false — now a primary)
```

### 3. Flip pgbouncer on BOTH app nodes

Backend connects to local pgbouncer → pgbouncer forwards to whatever `databases.ini` points at. Edit the file on both app nodes to point at the new primary.

```bash
# On .42: point at remote .44
ssh root@187.127.142.42 "sed -i 's/host=187.127.142.46/host=187.127.142.44/' /opt/rawdrive/app/deploy/pgbouncer/databases.ini"
ssh root@187.127.142.42 'docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml restart pgbouncer'

# On .44: point at LOCAL primary (the promoted replica)
ssh root@187.127.142.44 "sed -i 's/host=187.127.142.46/host=127.0.0.1/' /opt/rawdrive/app/deploy/pgbouncer/databases.ini"
ssh root@187.127.142.44 'docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml restart pgbouncer'
```

Backend is NOT restarted — pgbouncer transparently reconnects the pool.

### 4. Verify writes work

```bash
curl -fsS https://api.rawdrive.in/health
# Expected: {"status":"ok"}

# Confirm pgbouncer is now routing to .44 from .42:
ssh root@187.127.142.42 'docker run --rm --network host -e PGPASSWORD=<POSTGRES_PASSWORD> pgvector/pgvector:pg17 psql -h 127.0.0.1 -p 6432 -U rawdrive -d rawdrive -c "SELECT inet_server_addr();"'
# Expected: 187.127.142.44
```

### 5. Re-establish replication (recover from failover)

Once you have a replacement server for `.46`, run the B2 restore procedure in `disaster-recovery-from-r2.md` to bring it back as a new replica of `.44`. Or if `.46` is recoverable, use `pg_basebackup` from `.44`.

## Rollback / fail-back procedure

If `.46` comes back healthy and you want to restore it as primary:

1. Wipe `.46`'s Postgres data directory
2. `pg_basebackup -h 187.127.142.44 -U replicator -D /var/lib/postgresql/data -X stream -P -R` on `.46` (as a new replica of `.44`)
3. Start `.46` as a replica, verify streaming
4. Stop writes briefly, promote `.46` via `pg_ctl promote`
5. Flip `pgbouncer/databases.ini` on both app nodes back to `host=187.127.142.46` and reload
6. Re-bootstrap `.44` as a replica of `.46` via another `pg_basebackup`

## What this runbook does NOT cover

- Automated failover (Patroni/Stolon). Out of scope for 3-node deployment.
- Asynchronous write loss reconciliation. If your app writes critical data and the primary dies mid-commit, those writes are gone. Use the B2 restore procedure in `disaster-recovery-from-r2.md` to restore from the nightly backup if data integrity must be recovered.
- DNS changes. Neither app node's public IP changes during this procedure — Cloudflare DNS stays pointed at `.42` and `.44` throughout.
