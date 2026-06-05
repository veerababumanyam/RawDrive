#!/usr/bin/env bash
# One-time pgBackRest stanza bootstrap for the RawDrive primary (.46).
# ====================================================================
# WHAT: creates the `rawdrive` stanza in the B2 repository (stanza-create) and
# then verifies the whole archiving chain end-to-end (check). `stanza-create`
# writes the repo's stanza metadata + cipher header; `check` forces a WAL
# switch and confirms the segment actually lands in B2 — i.e. it proves
# archive_command works, not just that config parses.
#
# ACTIVATION ORDER (this is the load-bearing part — see
# docs/runbooks/pitr-restore.md §(a)):
#   1. Apply the archive_mode=on + archive_command lines to
#      deploy/postgres/postgresql.conf and RESTART postgres (archive_mode is
#      NOT reloadable — it needs a full restart).
#   2. Recreate the postgres container off the new rawdrive-postgres:local image
#      with the PGBACKREST_* env + spool/log volumes wired in.
#   3. >>> RUN THIS SCRIPT ONCE. <<<
#   4. Take the first full backup: deploy/scripts/pgbackrest-backup.sh --type=full
#   5. Install the crons (commented in pgbackrest-backup.sh).
# Running this BEFORE step 1 will fail `check` (no WAL is being archived yet) —
# that's intentional: it refuses to pretend archiving is healthy when it isn't.
#
# IDEMPOTENT: stanza-create is a no-op if the stanza already exists with the
# same config, so re-running this script is safe. Exits non-zero on any failure.
#
# Runs ON .46. Requires the PGBACKREST_* secrets to be present in the postgres
# container's environment (sourced from /opt/rawdrive/app/.env by compose).

set -euo pipefail

CONTAINER=deploy-postgres-1
STANZA=rawdrive

log() {
    echo "[$(date -u +%FT%TZ)] $*"
}

fail() {
    log "FATAL: $*"
    exit 1
}

log "pgBackRest stanza bootstrap starting for stanza=$STANZA in container=$CONTAINER"

# Guard: the container must be up, otherwise docker exec would error opaquely.
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -qx true \
    || fail "container $CONTAINER is not running — start the DB stack first"

# Guard: the pgbackrest binary must be present (i.e. the image was rebuilt from
# deploy/postgres/Dockerfile, not the stock pgvector image).
docker exec "$CONTAINER" sh -c 'command -v pgbackrest >/dev/null' \
    || fail "pgbackrest not found in $CONTAINER — rebuild with: docker compose -f deploy/docker-compose.prod-db.yml up -d --build postgres"

# Guard: the cipher passphrase must be wired into the container env, else the
# stanza would be created UNENCRYPTED and silently diverge from this config.
docker exec "$CONTAINER" sh -c '[ -n "${PGBACKREST_REPO1_CIPHER_PASS:-}" ]' \
    || fail "PGBACKREST_REPO1_CIPHER_PASS is empty in $CONTAINER — set it in /opt/rawdrive/app/.env and recreate the container"

log "creating stanza (idempotent)…"
docker exec -u postgres "$CONTAINER" pgbackrest --stanza="$STANZA" stanza-create \
    || fail "stanza-create failed — check repo1-s3-* settings and B2 credentials"

log "running check (forces a WAL switch and confirms it reaches B2)…"
docker exec -u postgres "$CONTAINER" pgbackrest --stanza="$STANZA" check \
    || fail "check failed — is archive_mode=on and archive_command set in postgresql.conf, and was postgres RESTARTED? See docs/runbooks/pitr-restore.md §(a)"

log "stanza $STANZA is created and archiving is verified."
log "NEXT: take the first full backup → deploy/scripts/pgbackrest-backup.sh --type=full"
