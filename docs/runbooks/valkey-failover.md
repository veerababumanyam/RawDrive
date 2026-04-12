# Valkey Primary Failover Runbook

**When to use:** Valkey primary on `.46` is confirmed dead.

**Pre-conditions:**
- `.42` valkey-replica container is healthy, connected to primary (`master_link_status:up`)
- Session state loss is acceptable — Valkey holds session tokens, rate-limit counters, and upload session state. Users may need to re-login after failover.

**RTO target:** 2 minutes.
**RPO:** AOF fsync interval (1 second worst case).

## Procedure

### 1. Promote replica on .42

```bash
ssh root@187.127.142.42 'docker exec deploy-valkey-replica-1 valkey-cli -a <VALKEY_PASSWORD> REPLICAOF NO ONE'
```

### 2. Update VALKEY_URL on both app nodes

```bash
# On .42: use local replica (now primary)
ssh root@187.127.142.42 "sed -i 's|@187.127.142.46:6379|@127.0.0.1:6379|' /opt/rawdrive/app/.env"

# On .44: point at .42
ssh root@187.127.142.44 "sed -i 's|@187.127.142.46:6379|@187.127.142.42:6379|' /opt/rawdrive/app/.env"
```

Note: pgbouncer uses environment variables at restart, but valkey is read from env at backend start. Backend must restart.

### 3. Restart backend on both nodes

```bash
ssh root@187.127.142.42 'docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml restart backend'
ssh root@187.127.142.44 'docker compose -f /opt/rawdrive/app/deploy/docker-compose.prod-app.yml restart backend'
```

### 4. Verify

```bash
curl -fsS https://api.rawdrive.in/health
# Expected: {"status":"ok"}
```

## Fail-back

Once `.46` is recoverable, bring up a fresh Valkey instance on `.46`, use `REPLICAOF 187.127.142.42 6379` to make it a replica, wait for sync, then reverse the promotion.
