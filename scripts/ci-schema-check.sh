#!/usr/bin/env bash
# §5.4 schema drift CI gate: dump the current schema from a migrated
# postgres via pg_dump, strip non-deterministic header lines, and diff
# against docs/db/schema.sql. Exit non-zero if the committed schema.sql
# is out of date with the migration set on disk.
#
# This script is the CI counterpart to scripts/refresh-schema.sh. They
# MUST produce byte-identical output, which is why both scripts share
# the same filter chain (see "Filter parity" below).
#
# Environment (libpq conventions so pg_dump picks them up automatically)
#
#   PGHOST     — required — defaults to localhost on GH Actions
#   PGPORT     — required — defaults to 5432
#   PGUSER     — required — no default, we enforce presence
#   PGPASSWORD — required — no default, we enforce presence
#   PGDATABASE — required — no default, we enforce presence
#
# Invoked from the schema-drift job in
# .github/workflows/production-gates.yml. Not intended for local use —
# the local refresh path is scripts/refresh-schema.sh which uses
# docker exec against the dev compose stack. Running this against a
# local dev DB will work but will also complain loudly if schema.sql
# is out of date; use refresh-schema.sh to regenerate, not this one.
#
# Filter parity (must match scripts/refresh-schema.sh exactly)
#
#   - `\restrict <token>`   — per-session random token from pg_dump 16+
#                             (locks restore to dumping session)
#   - `\unrestrict <token>` — closing pair of the same
#   - `-- Dumped from database version N.M (...)` — patch version drift
#   - `-- Dumped by pg_dump version N.M (...)`     — client version drift
#
# Version-line stripping lets the gate ignore harmless postgres 16.x
# patch-level differences between the local dev pgvector image and
# whatever pgvector/pgvector:pg16 tag GH Actions picks at CI time.
# Without it, the gate would flap on every upstream image rebuild even
# when schema is unchanged. Every other line pg_dump emits is
# deterministic given the same migration set and same postgres major
# version (both are pg16 here).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMMITTED="${REPO_ROOT}/docs/db/schema.sql"
OBSERVED="$(mktemp)"
trap 'rm -f "$OBSERVED"' EXIT

: "${PGUSER:?PGUSER must be set (libpq convention)}"
: "${PGPASSWORD:?PGPASSWORD must be set (libpq convention)}"
: "${PGDATABASE:?PGDATABASE must be set (libpq convention)}"

echo "schema drift check: dumping live schema from ${PGHOST:-localhost}:${PGPORT:-5432}/${PGDATABASE} ..."

pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  | grep -v '^\\restrict ' \
  | grep -v '^\\unrestrict ' \
  | grep -v '^-- Dumped from database version ' \
  | grep -v '^-- Dumped by pg_dump version ' \
  > "$OBSERVED"

OBSERVED_LINES=$(wc -l < "$OBSERVED")
COMMITTED_LINES=$(wc -l < "$COMMITTED")
echo "schema drift check: observed ${OBSERVED_LINES} lines, committed ${COMMITTED_LINES} lines"

if diff -u "$COMMITTED" "$OBSERVED"; then
  echo "schema drift check: PASS — docs/db/schema.sql matches migration-applied schema."
  exit 0
fi

cat >&2 <<'MSG'

==============================================================
 SCHEMA DRIFT DETECTED
==============================================================

 docs/db/schema.sql does NOT match the schema produced by
 applying backend/internal/database/migrations/*.up.sql in order.

 This means a migration has landed without a corresponding
 docs/db/schema.sql refresh. The committed schema.sql is stale.

 To fix locally:

   1. Start the dev postgres:
      docker compose -f _cobolt-docker/docker-compose.yml up -d postgres

   2. Apply any pending migrations (the backend does this on boot,
      or run the migration-only tool directly):
      go run ./backend/cmd/schematool

      (Requires DATABASE_URL pointing at your local dev postgres.)

   3. Refresh schema.sql:
      ./scripts/refresh-schema.sh

   4. Commit the updated docs/db/schema.sql alongside the migration
      that caused the drift.

 The diff above shows the exact lines that differ. If the only
 differences are "Dumped from database version" / "Dumped by
 pg_dump version" lines, that indicates a filter-parity drift
 between refresh-schema.sh and ci-schema-check.sh — fix the
 filter chain in both scripts to match.

==============================================================
MSG
exit 1
