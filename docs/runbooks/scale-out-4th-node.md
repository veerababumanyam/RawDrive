# Scale Out: Add a 4th Node

**When to trigger:**
- `.44` sustained RAM > 90% (postgres replica starving frontend)
- `pg_stat_replication.replay_lag` > 30s consistently
- App node p95 latency > 500ms for > 1 hour
- Daily upload count > 50k sustained

**Goal:** Move the Postgres replica off `.44` onto a new dedicated DB VPS `.48`, freeing `.44` to focus on app traffic.

**Zero downtime.** Primary never stops serving writes.

## Procedure

### 1. Provision .48

Hostinger KVM, Ubuntu 24.04, 8–16 GB RAM, 2+ vCPU, 96+ GB disk.

### 2. Run Phase A baseline on .48

Same as fresh bootstrap (see `disaster-recovery-from-r2.md` step 2 for the exact apt + docker install sequence). Also install UFW with rules:

```bash
ssh root@187.127.142.48 '
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp
  ufw allow from 187.127.142.42 to any port 5432 proto tcp
  ufw allow from 187.127.142.44 to any port 5432 proto tcp
  ufw allow from 187.127.142.46 to any port 5432 proto tcp  # for replication
  ufw --force enable
'
```

Also open `.46` UFW to allow `.48` → `.46:5432` for replication traffic:
```bash
ssh root@187.127.142.46 'ufw allow from 187.127.142.48 to any port 5432 proto tcp'
```

And update `/etc/postgresql/pg_hba.conf` on `.46` to add the new replica host:
```
host    replication     replicator      187.127.142.48/32       scram-sha-256
```
Reload postgres: `ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT pg_reload_conf();"'`

### 3. Initialize Postgres replica on .48

```bash
ssh root@187.127.142.48 'mkdir -p /var/lib/rawdrive/postgres-replica'
ssh root@187.127.142.48 'docker run --rm \
    -v /var/lib/rawdrive/postgres-replica:/var/lib/postgresql/data \
    -e PGPASSWORD=<POSTGRES_REPLICATION_PASSWORD> \
    pgvector/pgvector:pg17 \
    pg_basebackup -h 187.127.142.46 -U replicator -D /var/lib/postgresql/data -X stream -P -R'
```

### 4. Push deploy/ to .48 and start replica

```bash
tar -cf - deploy/docker-compose.prod-app.yml deploy/postgres/ | ssh root@187.127.142.48 'mkdir -p /opt/rawdrive/app/deploy && tar -xf - -C /opt/rawdrive/app'

ssh root@187.127.142.48 'cat > /opt/rawdrive/app/deploy/docker-compose.postgres-replica.override.yml <<OVR
services:
  postgres-replica:
    volumes:
      - /var/lib/rawdrive/postgres-replica:/var/lib/postgresql/data
OVR'

ssh root@187.127.142.48 "cat > /opt/rawdrive/app/.env <<ENV
POSTGRES_USER=rawdrive
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
POSTGRES_DB=rawdrive
ENV
chmod 600 /opt/rawdrive/app/.env"

ssh root@187.127.142.48 'cd /opt/rawdrive/app/deploy && ln -sf ../.env .env && docker compose -f docker-compose.prod-app.yml -f docker-compose.postgres-replica.override.yml --profile postgres-replica up -d postgres-replica'
```

### 5. Verify .48 is streaming

```bash
# On .46 primary:
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT client_addr, state, replay_lag FROM pg_stat_replication;"'
# Expected: TWO rows now — 187.127.142.44 AND 187.127.142.48, both state=streaming
```

### 6. Tear down the replica on .44

```bash
ssh root@187.127.142.44 'docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml stop postgres-replica'
ssh root@187.127.142.44 'docker rm deploy-postgres-replica-1'
ssh root@187.127.142.44 'rm -rf /var/lib/rawdrive/postgres-replica'
```

Also drop the replication slot `replica_44` on `.46`:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT pg_drop_replication_slot('"'"'replica_44'"'"');"'
```

And remove `.44` from `pg_hba.conf` replication line on `.46`.

### 7. Update failover runbook target

Edit `docs/runbooks/postgres-failover.md` to replace all references to `.44` (for postgres replica) with `.48`. The valkey replica stays on `.42` — unchanged.

### 8. Restore .44's headroom

```bash
# Verify .44 has ~2GB more RAM available than before
ssh root@187.127.142.44 'free -h'
```

`.44` now only runs: nginx, backend, frontend, worker, NATS-2, pgbouncer. No more local Postgres data directory using shared_buffers.

## Rollback

If `.48` fails during basebackup or replication, just tear down `.48` and leave `.44` as the active replica. Nothing on `.44` changed until step 6.
