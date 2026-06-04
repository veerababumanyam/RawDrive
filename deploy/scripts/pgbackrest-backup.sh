#!/usr/bin/env bash
# pgBackRest physical-backup cron driver — runs ON .46.
# =====================================================
# WHAT: drives `pgbackrest backup` against the live primary, picking the backup
# TYPE by schedule (or by an explicit --type arg) and then verifying the result
# with `pgbackrest info`. This is the physical/PITR layer; the logical pg_dump
# (deploy/scripts/backup-db.sh) keeps running independently as the
# belt-and-suspenders secondary (see docs/runbooks/pitr-restore.md §(f)).
#
# BACKUP TYPES (pgBackRest semantics):
#   full → copies the entire cluster. Slowest/largest; the anchor every diff &
#          incr depends on. We schedule this WEEKLY (Sunday).
#   diff → differential: copies everything changed since the last FULL. Fast
#          restore (full + one diff). We schedule this on Mon–Sat.
#   incr → incremental: copies everything changed since the last backup of ANY
#          type. Smallest/fastest; restore replays full + diff + every incr
#          since. We schedule this HOURLY for a tight RPO between dailies.
# Continuous WAL archiving (archive-async, see pgbackrest.conf) is what actually
# bounds RPO to ~archive_timeout (≈60s); these scheduled backups bound how much
# WAL must be REPLAYED at restore time (i.e. restore speed), not data loss.
#
# AUTO SCHEDULE (no --type given): full on Sunday, diff on every other day. Wire
# the hourly incr explicitly via --type=incr in its own cron line.
#
# RECOMMENDED CRONTAB (root on .46, all times Asia/Kolkata per the container TZ):
#   # daily full/diff selector at 02:30 (offset from the 02:00 pg_dump so the
#   # two backup layers don't contend for I/O at the same instant):
#   30 2 * * *  /opt/rawdrive/app/deploy/scripts/pgbackrest-backup.sh           >> /opt/rawdrive/backups/pgbackrest-cron.log 2>&1
#   # hourly incremental at :15 past every hour EXCEPT 02:00 (the daily run owns it):
#   15 0-1,3-23 * * *  /opt/rawdrive/app/deploy/scripts/pgbackrest-backup.sh --type=incr >> /opt/rawdrive/backups/pgbackrest-cron.log 2>&1
# cron mails root on any non-zero exit (set MAILTO=ops@rawdrive.in at the top of
# the crontab) so a failed backup is never silent.
#
# Activation: only run after the one-time pgbackrest-init.sh has succeeded.

set -euo pipefail

CONTAINER=deploy-postgres-1
STANZA=rawdrive
BACKUP_DIR=/opt/rawdrive/backups
LOG="$BACKUP_DIR/pgbackrest-backup.log"

log() {
    mkdir -p "$BACKUP_DIR"
    echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"
}

fail() {
    log "FATAL: $*"
    exit 1
}

# --- Resolve backup type ------------------------------------------------------
TYPE=""
for arg in "$@"; do
    case "$arg" in
        --type=full|--type=diff|--type=incr) TYPE="${arg#--type=}" ;;
        --type=*) fail "invalid --type: ${arg#--type=} (allowed: full|diff|incr)" ;;
        *) fail "unknown argument: $arg" ;;
    esac
done

if [ -z "$TYPE" ]; then
    # Auto: full on Sunday (date +%u → 7), diff Mon–Sat.
    if [ "$(date +%u)" -eq 7 ]; then
        TYPE=full
    else
        TYPE=diff
    fi
    log "no --type given; auto-selected '$TYPE' for $(date -u +%A)"
fi

# --- Pre-flight ---------------------------------------------------------------
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -qx true \
    || fail "container $CONTAINER is not running"

log "starting pgBackRest $TYPE backup of stanza=$STANZA"
# --type drives full/diff/incr. On a fresh stanza with no prior full, pgBackRest
# auto-promotes a diff/incr request to a full (it logs the upgrade), so the very
# first scheduled run can't fail for "no backup exists yet".
docker exec "$CONTAINER" pgbackrest --stanza="$STANZA" --type="$TYPE" backup \
    || fail "pgbackrest $TYPE backup failed"

# --- Verify -------------------------------------------------------------------
# `info` is the cheap, authoritative post-check: it reads the repo and prints
# the backup set, so a non-zero exit here means the repo is unreadable/corrupt
# even though `backup` returned 0. We capture it into the log for the on-call.
log "verifying repository state via pgbackrest info"
INFO_OUT="$(docker exec "$CONTAINER" pgbackrest --stanza="$STANZA" info 2>&1)" \
    || fail "pgbackrest info failed after backup — repository may be unreadable"
echo "$INFO_OUT" | tee -a "$LOG"

# Sanity: the freshly-written backup type should appear in the info output.
echo "$INFO_OUT" | grep -q "$TYPE backup" \
    || log "WARN: '$TYPE backup' not found in info output (first-run full-promotion is expected, otherwise investigate)"

log "pgBackRest $TYPE backup complete and verified"
