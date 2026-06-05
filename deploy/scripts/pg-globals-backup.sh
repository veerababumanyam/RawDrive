#!/usr/bin/env bash
# Nightly Postgres GLOBALS backup → symmetric-GPG-encrypted → Backblaze B2.
# =========================================================================
# WHY this exists alongside backup-db.sh:
#   The nightly logical dump (backup-db.sh) uses pg_dump --format=custom, which
#   by design captures ONE database's schema+data but OMITS cluster-global
#   objects: roles, role memberships, GRANTs to those roles, ALTER ROLE SETs
#   (e.g. the per-role GUCs set by migrations), and tablespaces. If you ever
#   restore that custom dump into a fresh cluster, every "role rawdrive does not
#   exist" / missing-grant error is exactly this gap. `pg_dumpall --globals-only`
#   captures precisely that global layer.
#   The pgBackRest PHYSICAL backups DO include globals (they copy the whole
#   cluster), so this script is belt-and-suspenders specifically for the LOGICAL
#   restore path (disaster-recovery-from-r2.md) — keep it in lockstep with the
#   nightly pg_dump.
#
# Runs ON .46 via cron (pair it with backup-db.sh, e.g. 0 2 * * *).
# Exits non-zero on any failure so cron mails root.
#
# Security posture mirrors backup-db.sh exactly: globals include role
# definitions (no plaintext passwords — pg_dumpall emits SCRAM verifiers, but
# those are still sensitive) and grant topology, so we symmetric-GPG-encrypt with
# BACKUP_GPG_PASSPHRASE (in /opt/rawdrive/app/.env only) before upload. Stealing
# B2 creds alone does not yield a readable globals dump.

set -euo pipefail

BACKUP_DIR=/opt/rawdrive/backups
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-b2:rawdriveadminfiles}"
RETAIN_DAYS=7  # local only — B2 lifecycle handles longer retention

: "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE not set — source /opt/rawdrive/app/.env before running}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP="$BACKUP_DIR/rawdrive_globals_${STAMP}.sql.gpg"
LOG="$BACKUP_DIR/pg-globals-backup.log"

log() {
    echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"
}

log "starting pg_dumpall --globals-only → gpg → $DUMP"
# --globals-only: roles, grants, tablespaces, ALTER ROLE settings — no per-DB
# schema/data. Piped straight into gpg so the plaintext SQL never hits disk.
docker exec deploy-postgres-1 \
    pg_dumpall \
    -U "${POSTGRES_USER:-rawdrive}" \
    --globals-only \
    | gpg --batch --yes --passphrase "$BACKUP_GPG_PASSPHRASE" \
          --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 \
          --s2k-count 65011712 \
          --output "$DUMP"

SIZE=$(stat -c %s "$DUMP")
if [ "$SIZE" -lt 256 ]; then
    log "FATAL: globals dump too small ($SIZE bytes) — refusing to upload"
    exit 1
fi
log "encrypted globals dump size: $SIZE bytes"

log "uploading to B2: $RCLONE_REMOTE/globals/"
rclone copy "$DUMP" "$RCLONE_REMOTE/globals/" --progress

log "verifying remote copy exists"
REMOTE_NAME=$(basename "$DUMP")
rclone lsf "$RCLONE_REMOTE/globals/" | grep -q "^${REMOTE_NAME}$" \
    || { log "FATAL: remote verification failed"; exit 2; }

log "cleaning local globals dumps older than $RETAIN_DAYS days"
find "$BACKUP_DIR" -name 'rawdrive_globals_*.sql.gpg' -mtime +$RETAIN_DAYS -delete

log "globals backup complete: $REMOTE_NAME"
