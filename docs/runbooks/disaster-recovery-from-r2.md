# Disaster Recovery from R2 Backup

> **SUPERSEDED 2026-05-18:** RawDrive switched its managed storage and backup
> destination from Cloudflare R2 to Backblaze B2. This document remains for
> historical reference of the April 2026 bootstrap procedure.
> **Follow-up needed (not yet written):** `disaster-recovery-from-b2.md` —
> the same procedure adapted for the B2 endpoint
> (`https://s3.us-east-005.backblazeb2.com`), the new `B2_KEY_ID` /
> `B2_APPLICATION_KEY` credentials, and the production bucket name.
> Until that doc lands, treat the steps below as the operational template,
> swapping every R2 reference for the B2 equivalent. The BOOTSTRAP-KNOWN-ISSUES
> R2-creds-DEAD warning is also obsolete — R2 is no longer in the data path.

**When to use:** Both `.46` primary AND `.44` replica are gone. You need to restore from the nightly backup (now on B2) to a fresh VPS.

**RTO:** 30–60 minutes.
**RPO:** ≤24 hours (age of last nightly dump).

## Procedure

### 1. Provision a new VPS

Hostinger KVM, Ubuntu 24.04, 8 GB RAM, 2 vCPU, 96 GB disk (match `.46` spec). Note its IP.

### 2. Run Phase A baseline on the new VPS

From this repo:
```bash
# Substitute <NEW_IP> throughout
for cmd in \
  'apt-get update && apt-get -y dist-upgrade && apt-get install -y ufw fail2ban unattended-upgrades rclone curl ca-certificates gnupg lsb-release rsync jq openssl gpg' \
  'hostnamectl set-hostname rawdrive-db' \
  'timedatectl set-timezone Asia/Kolkata' \
  'install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && chmod a+r /etc/apt/keyrings/docker.gpg' \
  'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list' \
  'apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin' \
  'systemctl enable --now docker' \
  'mkdir -p /opt/rawdrive/app /opt/rawdrive/backups /root/.config/rclone'
do
  ssh root@<NEW_IP> "export DEBIAN_FRONTEND=noninteractive && $cmd"
done
```

### 3. Configure rclone with CURRENT (not dead) R2 credentials

```bash
ssh root@<NEW_IP> 'cat > /root/.config/rclone/rclone.conf' <<RCLONE
[r2]
type = s3
provider = Cloudflare
access_key_id = <CURRENT_R2_KEY>
secret_access_key = <CURRENT_R2_SECRET>
endpoint = https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
region = auto
acl = private
RCLONE
ssh root@<NEW_IP> 'chmod 600 /root/.config/rclone/rclone.conf'
```

### 4. Pull the latest encrypted backup

```bash
LATEST=$(ssh root@<NEW_IP> 'rclone lsf r2:rawdrive-backups/daily/ --include "*.dump.gpg" | sort | tail -1')
ssh root@<NEW_IP> "rclone cat r2:rawdrive-backups/daily/$LATEST > /tmp/restore.dump.gpg"
```

### 5. Decrypt with the backup passphrase

The `BACKUP_GPG_PASSPHRASE` is in your password manager (per the spec, it should have been stashed when generated during Phase B). Retrieve it.

```bash
ssh root@<NEW_IP> "BACKUP_GPG_PASSPHRASE='<PASSPHRASE>' gpg --batch --yes --passphrase \"\$BACKUP_GPG_PASSPHRASE\" --decrypt --output /tmp/restore.dump /tmp/restore.dump.gpg"
```

### 6. Start a fresh Postgres container and restore

Push `deploy/` to the new VPS and bring up postgres via Compose just like Phase B. Then:

```bash
ssh root@<NEW_IP> 'docker exec -i deploy-postgres-1 pg_restore -U rawdrive -d rawdrive --no-owner --no-privileges --clean --if-exists < /tmp/restore.dump'
```

### 7. Re-point pgbouncer on app nodes

Follow `postgres-failover.md` Step 3 with the new VPS IP.

### 8. Verify

```bash
curl -fsS https://api.rawdrive.in/health
# Expected: {"status":"ok"}
```

### 9. Cleanup and start new replication

If you need an HA replica again, bring up a second new VPS and run `pg_basebackup` from the restored primary.

## Write loss accounting

Whatever writes landed between the last nightly dump (`0 2 * * *` Asia/Kolkata) and the failure are permanently lost. Communicate this to affected users. Consider restoring user-visible state from application-level events (email sends, webhook receipts) if any exist.
