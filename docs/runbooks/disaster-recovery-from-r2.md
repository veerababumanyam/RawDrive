# Disaster Recovery from B2 Backup

**When to use:** Both `.46` primary AND `.44` replica are gone. You need to restore from the nightly encrypted Backblaze B2 backup to a fresh VPS.

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

### 3. Configure rclone with Backblaze B2 credentials

```bash
ssh root@<NEW_IP> 'cat > /root/.config/rclone/rclone.conf' <<RCLONE
[b2]
type = s3
provider = Other
access_key_id = <B2_KEY_ID>
secret_access_key = <B2_APPLICATION_KEY>
endpoint = <B2_ENDPOINT>
region = <B2_REGION>
acl = private
RCLONE
ssh root@<NEW_IP> 'chmod 600 /root/.config/rclone/rclone.conf'
```

### 4. Pull the latest encrypted backup

```bash
LATEST=$(ssh root@<NEW_IP> 'rclone lsf b2:rawdriveadminfiles/daily/ --include "*.dump.gpg" | sort | tail -1')
ssh root@<NEW_IP> "rclone cat b2:rawdriveadminfiles/daily/$LATEST > /tmp/restore.dump.gpg"
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
curl -fsS https://api.rawdrive.in/health/deep
# Expected: {"status":"healthy", ...}
```

### 9. Cleanup and start new replication

If you need an HA replica again, bring up a second new VPS and run `pg_basebackup` from the restored primary.

## Write loss accounting

Whatever writes landed between the last nightly dump (`0 2 * * *` Asia/Kolkata) and the failure are permanently lost. Communicate this to affected users. Consider restoring user-visible state from application-level events (email sends, webhook receipts) if any exist.
