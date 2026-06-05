#!/usr/bin/env bash
# Weekly pgBackRest restore-VERIFY drill — runs ON .46.
# =====================================================
# WHY: "the backup exists in B2" is NOT the same as "the backup restores to a
# working database". A repo can be present but corrupt, mis-encrypted, missing
# WAL, or pointing at the wrong stanza — and you only discover that during a
# real outage when it's far too late. This script does a full DISPOSABLE restore
# every week and asserts the restored cluster actually contains the RawDrive
# schema, turning silent backup rot into a loud weekly failure.
#
# WHAT IT VERIFIES (be honest about scope):
#   ✓ The latest backup set in B2 can be downloaded, decrypted (repo cipher),
#     and decompressed by pgBackRest.
#   ✓ A throwaway Postgres 17 cluster starts from it and finishes crash/recovery.
#   ✓ Core RawDrive tables exist (users, galleries, assets, schema_migrations)
#     and information_schema is populated (a non-trivial table count).
# WHAT IT DOES *NOT* VERIFY:
#   ✗ Row-level data correctness / referential integrity / app-level invariants.
#   ✗ PITR to an arbitrary target time (this restores the latest backup, no
#     recovery_target — see docs/runbooks/pitr-restore.md §(c) for targeted PITR).
#   ✗ pgvector index validity or extension-specific behaviour beyond table
#     presence.
#   ✗ The globals (roles/grants) — those are dumped separately by
#     pg-globals-backup.sh; a custom-format physical restore brings roles via the
#     base backup, but cross-cluster role parity is not asserted here.
# It is a RESTORABILITY smoke test, not a data-integrity audit.
#
# ISOLATION: restores into a TEMP dir and runs an EPHEMERAL postgres container on
# a NON-conflicting host port, on its own throwaway volume — it never touches the
# live primary's $PGDATA, the live container, or port 5432. Everything is torn
# down (container + temp dir) on exit, success or failure, via a trap.
#
# RECOMMENDED CRONTAB (root on .46):
#   # Weekly restore drill, Monday 04:00 IST (well clear of the 02:00/02:30 backups):
#   0 4 * * 1  /opt/rawdrive/app/deploy/scripts/pgbackrest-restore-verify.sh >> /var/log/pgbackrest-restore-verify.log 2>&1
#
# Exits non-zero on ANY failure so cron mails root.

set -euo pipefail

STANZA=rawdrive
# Pin the SAME image we run in prod so the restored cluster's binaries match the
# backup's catalog version exactly.
PG_IMAGE=rawdrive-postgres:local
VERIFY_CONTAINER="pgbackrest-verify-$$"
VERIFY_PORT=55432            # deliberately NOT 5432 — no clash with the live primary
RESTORE_DIR="$(mktemp -d /tmp/pgbackrest-verify.XXXXXX)"

# Logs to stdout only (cron captures). No local backup/log dir — backup
# artifacts are strictly in B2; the restore drill is a transient /tmp operation.
log() {
    echo "[$(date -u +%FT%TZ)] $*"
}

fail() {
    log "FATAL: $*"
    exit 1
}

cleanup() {
    local rc=$?
    log "cleanup: removing verify container + temp restore dir"
    docker rm -f "$VERIFY_CONTAINER" >/dev/null 2>&1 || true
    rm -rf "$RESTORE_DIR" || true
    if [ "$rc" -eq 0 ]; then
        log "restore-verify PASSED"
    else
        log "restore-verify FAILED (rc=$rc)"
    fi
    exit "$rc"
}
trap cleanup EXIT

# The repo cipher passphrase + B2 creds must be available to the ephemeral
# pgBackRest invocation too. We read them from the LIVE container's environment
# so this script never has to see or store the secrets itself.
read_secret() {
    docker exec deploy-postgres-1 printenv "$1" 2>/dev/null || true
}

log "restore-verify starting (stanza=$STANZA, image=$PG_IMAGE, port=$VERIFY_PORT)"

S3_KEY="$(read_secret PGBACKREST_REPO1_S3_KEY)"
S3_SECRET="$(read_secret PGBACKREST_REPO1_S3_KEY_SECRET)"
CIPHER_PASS="$(read_secret PGBACKREST_REPO1_CIPHER_PASS)"
[ -n "$S3_KEY" ] && [ -n "$S3_SECRET" ] && [ -n "$CIPHER_PASS" ] \
    || fail "could not read PGBACKREST_* secrets from deploy-postgres-1 — is the live stack up?"

# --- 1. Restore the latest backup into the throwaway dir ----------------------
# We reuse the committed pgbackrest.conf (same repo/stanza), but point pg1-path
# at the temp dir via --pg1-path so we never write into the live $PGDATA. The
# ephemeral container mounts the temp dir and the config read-only.
log "restoring latest backup into $RESTORE_DIR (this downloads + decrypts from B2)…"
docker run --rm \
    --name "${VERIFY_CONTAINER}-restore" \
    -v "$RESTORE_DIR:/restore" \
    -v "$(cd "$(dirname "$0")/../pgbackrest" && pwd)/pgbackrest.conf:/etc/pgbackrest/pgbackrest.conf:ro" \
    -e PGBACKREST_REPO1_S3_KEY="$S3_KEY" \
    -e PGBACKREST_REPO1_S3_KEY_SECRET="$S3_SECRET" \
    -e PGBACKREST_REPO1_CIPHER_PASS="$CIPHER_PASS" \
    "$PG_IMAGE" \
    pgbackrest --stanza="$STANZA" --pg1-path=/restore --delta restore \
    || fail "pgbackrest restore failed — backup is NOT restorable"

# pgBackRest writes recovery settings (restore_command + recovery_target) into
# the restored cluster. With no explicit target it recovers to the END of the
# backup's WAL, then we want it to come up read/write, so disable continued
# archive recovery for this throwaway instance.
docker run --rm -v "$RESTORE_DIR:/restore" "$PG_IMAGE" \
    sh -c 'echo "recovery_target_action = '\''promote'\''" >> /restore/postgresql.auto.conf'

# --- 2. Boot the ephemeral cluster --------------------------------------------
# Start postgres directly on the restored datadir (it is already initialised, so
# the entrypoint's initdb is skipped). No POSTGRES_PASSWORD needed: we connect
# over the local socket as the bootstrap superuser inside the container.
log "starting ephemeral postgres on the restored datadir…"
docker run -d \
    --name "$VERIFY_CONTAINER" \
    -v "$RESTORE_DIR:/var/lib/postgresql/data" \
    -p "127.0.0.1:${VERIFY_PORT}:5432" \
    "$PG_IMAGE" \
    postgres >/dev/null \
    || fail "could not start ephemeral postgres container"

# Wait for crash/archive recovery to finish and the cluster to accept queries.
log "waiting for recovery + readiness…"
READY=0
for _ in $(seq 1 60); do
    if docker exec "$VERIFY_CONTAINER" pg_isready -U "${POSTGRES_USER:-rawdrive}" -d "${POSTGRES_DB:-rawdrive}" >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 2
done
[ "$READY" -eq 1 ] || fail "restored cluster never became ready within ~120s"

PSQL() {
    docker exec "$VERIFY_CONTAINER" \
        psql -U "${POSTGRES_USER:-rawdrive}" -d "${POSTGRES_DB:-rawdrive}" -tAc "$1"
}

# --- 3. Assert the schema actually restored -----------------------------------
log "asserting restored schema…"

TABLE_COUNT="$(PSQL "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")" \
    || fail "could not query information_schema on the restored cluster"
log "restored public table count: $TABLE_COUNT"
[ "${TABLE_COUNT:-0}" -gt 10 ] \
    || fail "restored cluster has only ${TABLE_COUNT:-0} public tables — restore looks empty/wrong"

# Key RawDrive tables must all be present. schema_migrations proves the migrator
# state restored too (so a recovered cluster won't try to re-run migrations).
for tbl in users galleries assets schema_migrations; do
    EXISTS="$(PSQL "SELECT to_regclass('public.${tbl}') IS NOT NULL;")" \
        || fail "existence check query failed for table '$tbl'"
    [ "$EXISTS" = "t" ] || fail "expected table 'public.${tbl}' missing from restored cluster"
    log "  ✓ table present: $tbl"
done

log "restored cluster contains all key RawDrive tables ($TABLE_COUNT public tables total)"
# trap cleanup() runs here and tears everything down, then prints PASSED.
