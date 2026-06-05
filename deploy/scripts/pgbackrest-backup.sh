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
#   full → copies the entire cluster. Slowest/largest; the anchor every incr
#          depends on. We schedule this WEEKLY (Sunday) as the chain anchor.
#   incr → incremental: copies everything changed since the last backup of ANY
#          type (changed blocks only — small/fast). This is the DAILY backup
#          (operator directive: "daily incremental backups in the admin B2
#          bucket"). Restore replays full + every incr since.
#   diff → differential: changed-since-last-FULL. Not used in the default
#          schedule, but still selectable via --type=diff for an ad-hoc base.
# Continuous WAL archiving (archive-async, see pgbackrest.conf) is what actually
# bounds RPO to ~archive_timeout (≈60s); these scheduled backups bound how much
# WAL must be REPLAYED at restore time (i.e. restore speed), not data loss.
#
# STRICTLY B2-ONLY: the repository (repo1) is the admin B2 bucket
# (rawdriveadminfiles, repo1-path=/pgbackrest) — there is NO local repo. This
# driver writes NOTHING to the server disk except transient WAL spool
# (/var/spool/pgbackrest) and pgBackRest's own operational log
# (/var/log/pgbackrest, a volume); all backup artifacts live in B2.
#
# AUTO SCHEDULE (no --type given): full on Sunday, DAILY INCREMENTAL Mon–Sat.
#
# RECOMMENDED CRONTAB (root on .46, all times Asia/Kolkata per the container TZ):
#   MAILTO=ops@rawdrive.in   # so a failed backup is never silent
#   # daily backup at 02:30 (offset from the 02:00 logical pg_dump so the two
#   # layers don't contend for I/O): full on Sunday, incremental Mon–Sat.
#   30 2 * * *  /opt/rawdrive/app/deploy/scripts/pgbackrest-backup.sh
# (For an even tighter restore-replay window you MAY add hourly incrementals
#  with `--type=incr`, but continuous WAL already bounds RPO; the daily
#  incremental is the operator-requested cadence.)
#
# Activation: only run after the one-time pgbackrest-init.sh has succeeded.

set -euo pipefail

# Resolve the live Postgres container: deploy-patroni-1 after the Patroni cutover,
# else the standalone deploy-postgres-1.
CONTAINER="${PG_CONTAINER:-$(docker ps --format "{{.Names}}" | grep -xE "deploy-(patroni|postgres)-1" | head -1)}"
CONTAINER="${CONTAINER:-deploy-postgres-1}"
STANZA=rawdrive

# Logs go to stdout only (cron captures them); we keep NO local backup/log dir on
# the server — backup artifacts are strictly in B2, and pgBackRest's own detailed
# log lives in the /var/log/pgbackrest volume inside the container.
log() {
    echo "[$(date -u +%FT%TZ)] $*"
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
    # Auto: full on Sunday (date +%u → 7), DAILY INCREMENTAL Mon–Sat.
    if [ "$(date +%u)" -eq 7 ]; then
        TYPE=full
    else
        TYPE=incr
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
# MUST run as the `postgres` OS user (uid 999), NOT root. pgBackRest creates
# lock/stop files under /tmp/pgbackrest and (in async mode) status files in the
# spool — if a root-run command creates those as root, the postgres-invoked
# archive_command (uid 999) then hits "Permission denied" and WAL archiving
# silently stalls. Running every pgbackrest command as postgres keeps all of its
# runtime state postgres-owned and consistent with archive_command.
docker exec -u postgres "$CONTAINER" pgbackrest --stanza="$STANZA" --type="$TYPE" backup \
    || fail "pgbackrest $TYPE backup failed"

# --- Verify -------------------------------------------------------------------
# `info` is the cheap, authoritative post-check: it reads the repo and prints
# the backup set, so a non-zero exit here means the repo is unreadable/corrupt
# even though `backup` returned 0. We capture it into the log for the on-call.
log "verifying repository state via pgbackrest info"
INFO_OUT="$(docker exec -u postgres "$CONTAINER" pgbackrest --stanza="$STANZA" info 2>&1)" \
    || fail "pgbackrest info failed after backup — repository may be unreadable"
echo "$INFO_OUT"

# Sanity: the freshly-written backup type should appear in the info output.
echo "$INFO_OUT" | grep -q "$TYPE backup" \
    || log "WARN: '$TYPE backup' not found in info output (first-run full-promotion is expected, otherwise investigate)"

log "pgBackRest $TYPE backup complete and verified"
