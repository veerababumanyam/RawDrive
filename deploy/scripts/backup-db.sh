#!/usr/bin/env bash
# Nightly Postgres logical backup → symmetric-GPG-encrypted → Backblaze B2.
# Runs on .46 via cron 0 2 * * *.
# Exits non-zero on any failure so cron mails root.
#
# STRICTLY B2-ONLY (no local artifacts): the dump is streamed
#   pg_dump | gpg | rclone rcat
# directly to the admin B2 bucket. Nothing is ever written to the server's
# disk — there is no local dump file to leak, prune, or fill the volume. This
# is an operator directive ("all dumps/backups strictly in B2; keep servers
# clean") and is also more secure (no plaintext-adjacent artifact at rest).
#
# Security: the B2 API keys grant read access to this bucket, so an attacker
# with leaked B2 creds would otherwise walk out with a DB dump. Symmetric GPG
# with a passphrase stored ONLY in /opt/rawdrive/app/.env
# (BACKUP_GPG_PASSPHRASE) is the second lock — stealing B2 creds alone is not
# enough to read the backups. LOSS OF THE PASSPHRASE = UNRECOVERABLE BACKUPS;
# stash it in the password manager.

set -euo pipefail

# Auto-source the prod env if the backup passphrase isn't already present. The
# 02:00 cron sources .env explicitly, but ad-hoc/manual runs historically failed
# at the guard below because the operator forgot to source it (rawdrive-backup
# audit). Sourcing here makes a manual run "just work" without ever overriding
# values the caller already exported.
if [ -z "${BACKUP_GPG_PASSPHRASE:-}" ] && [ -f /opt/rawdrive/app/.env ]; then
    set -a; . /opt/rawdrive/app/.env; set +a
fi

RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-b2:rawdriveadminfiles}"
PG_CONTAINER="${PG_CONTAINER:-$(docker ps --format "{{.Names}}" | grep -xE "deploy-(patroni|postgres)-1" | head -1)}"
PG_CONTAINER="${PG_CONTAINER:-deploy-postgres-1}"

: "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE not set — source /opt/rawdrive/app/.env before running}"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
REMOTE_NAME="rawdrive_${STAMP}.dump.gpg"
REMOTE_PATH="$RCLONE_REMOTE/daily/$REMOTE_NAME"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

log "starting B2-only stream: pg_dump | gpg | rclone rcat → $REMOTE_PATH"

# Stream the encrypted custom-format dump straight to B2. set -o pipefail makes
# a failure in ANY stage (pg_dump error, gpg error, rclone upload error) fail
# the whole command, so a partial/broken stream never silently "succeeds".
docker exec "$PG_CONTAINER" \
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
    | rclone rcat "$REMOTE_PATH"

# --- Verify the remote object exists and is non-trivial -----------------------
# With no local copy we verify against B2 directly: the object must exist and be
# larger than a floor (a real encrypted dump is multiple MB; anything tiny means
# a truncated/empty stream slipped through). On a bad size we DELETE the corrupt
# remote object and fail, so a poisoned backup can't masquerade as good.
log "verifying remote object on B2"
SIZE=$(rclone size --json "$REMOTE_PATH" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
if [ -z "${SIZE:-}" ]; then
    log "FATAL: remote object not found after upload: $REMOTE_PATH"
    exit 2
fi
if [ "$SIZE" -lt 4096 ]; then
    log "FATAL: remote dump too small ($SIZE bytes) — deleting corrupt object and failing"
    rclone delete "$REMOTE_PATH" || true
    exit 1
fi

log "backup complete: $REMOTE_NAME ($SIZE bytes, B2-only)"
