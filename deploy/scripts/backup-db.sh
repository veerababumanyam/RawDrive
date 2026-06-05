#!/usr/bin/env bash
# Nightly Postgres backup → symmetric-GPG-encrypted → Backblaze B2 via rclone.
# Runs on .46 via cron 0 2 * * *.
# Exits non-zero on any failure so cron mails root.
#
# Security: the B2 API keys in the doc grant read access to this bucket, so
# an attacker with leaked B2 creds would otherwise walk out with a plaintext
# DB dump. Symmetric GPG with a passphrase stored ONLY in
# /opt/rawdrive/app/.env (BACKUP_GPG_PASSPHRASE) provides a second lock —
# stealing B2 creds alone is not enough to read the backups.

set -euo pipefail

BACKUP_DIR=/opt/rawdrive/backups
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-b2:rawdriveadminfiles}"
RETAIN_DAYS=7  # local only — B2 lifecycle handles longer retention

: "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE not set — source /opt/rawdrive/app/.env before running}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP="$BACKUP_DIR/rawdrive_${STAMP}.dump.gpg"
LOG="$BACKUP_DIR/backup.log"

log() {
    echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"
}

log "starting pg_dump → gpg → $DUMP"
docker exec deploy-postgres-1 \
    pg_dump \
    -U "${POSTGRES_USER:-rawdrive}" \
    -d "${POSTGRES_DB:-rawdrive}" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    | gpg --batch --yes --passphrase "$BACKUP_GPG_PASSPHRASE" \
          --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 \
          --s2k-count 65011712 \
          --output "$DUMP"

SIZE=$(stat -c %s "$DUMP")
if [ "$SIZE" -lt 1024 ]; then
    log "FATAL: dump too small ($SIZE bytes) — refusing to upload"
    exit 1
fi
log "encrypted dump size: $SIZE bytes"

log "uploading to B2: $RCLONE_REMOTE/daily/"
rclone copy "$DUMP" "$RCLONE_REMOTE/daily/" --progress

log "verifying remote copy exists"
REMOTE_NAME=$(basename "$DUMP")
rclone lsf "$RCLONE_REMOTE/daily/" | grep -q "^${REMOTE_NAME}$" \
    || { log "FATAL: remote verification failed"; exit 2; }

log "cleaning local dumps older than $RETAIN_DAYS days"
find "$BACKUP_DIR" -name 'rawdrive_*.dump.gpg' -mtime +$RETAIN_DAYS -delete

log "backup complete: $REMOTE_NAME"
