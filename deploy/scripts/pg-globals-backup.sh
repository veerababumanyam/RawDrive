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

# Auto-source prod env for manual runs (see backup-db.sh rationale).
if [ -z "${BACKUP_GPG_PASSPHRASE:-}" ] && [ -f /opt/rawdrive/app/.env ]; then
    set -a; . /opt/rawdrive/app/.env; set +a
fi

RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-b2:rawdriveadminfiles}"
PG_CONTAINER="${PG_CONTAINER:-deploy-postgres-1}"

: "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE not set — source /opt/rawdrive/app/.env before running}"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
REMOTE_NAME="rawdrive_globals_${STAMP}.sql.gpg"
REMOTE_PATH="$RCLONE_REMOTE/globals/$REMOTE_NAME"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

log "starting B2-only stream: pg_dumpall --globals-only | gpg | rclone rcat → $REMOTE_PATH"
# --globals-only: roles, grants, tablespaces, ALTER ROLE settings — no per-DB
# schema/data. Streamed straight to B2 so the plaintext SQL never hits disk.
docker exec "$PG_CONTAINER" \
    pg_dumpall \
    -U "${POSTGRES_USER:-rawdrive}" \
    --globals-only \
    | gpg --batch --yes --passphrase "$BACKUP_GPG_PASSPHRASE" \
          --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 \
          --s2k-count 65011712 \
    | rclone rcat "$REMOTE_PATH"

log "verifying remote object on B2"
SIZE=$(rclone size --json "$REMOTE_PATH" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
if [ -z "${SIZE:-}" ]; then
    log "FATAL: remote globals object not found after upload: $REMOTE_PATH"
    exit 2
fi
if [ "$SIZE" -lt 256 ]; then
    log "FATAL: remote globals dump too small ($SIZE bytes) — deleting and failing"
    rclone delete "$REMOTE_PATH" || true
    exit 1
fi

log "globals backup complete: $REMOTE_NAME ($SIZE bytes, B2-only)"
