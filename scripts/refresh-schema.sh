#!/usr/bin/env bash
# ISSUE-005 (brownfield P1): refresh docs/db/schema.sql from the live
# dev database so the repository always has an authoritative
# column-level schema reference alongside the 142 numbered migrations.
#
# Requirements:
#   - Dev docker-compose stack running (docker compose up -d postgres)
#   - The `postgres` service in _cobolt-docker/docker-compose.yml is
#     the source of the dump. The script looks it up by service name,
#     not by container name, so no per-workstation hash bleeds in.
#
# Usage:
#   ./scripts/refresh-schema.sh
#
# Output:
#   docs/db/schema.sql  (overwritten, post-processed to strip
#                        non-deterministic pg_dump session tokens)
#
# Determinism note: pg_dump 16+ emits `\restrict <random>` and
# `\unrestrict <random>` lines that lock the restore to the dumping
# session. The tokens are random on every run, so raw pg_dump output
# produces a spurious diff every refresh even when the schema is
# unchanged. We strip those lines before writing so the committed
# schema.sql stays diff-clean until a real schema change lands.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT="${REPO_ROOT}/docs/db/schema.sql"
COMPOSE_FILE="${REPO_ROOT}/_cobolt-docker/docker-compose.yml"

DB_USER="${PROJECT_USER:-rawdrive_user}"
DB_NAME="${PROJECT_DB_NAME:-rawdrive_db}"

# Resolve the running postgres container by compose service name.
# `docker compose ps -q <service>` prints the container ID (empty if
# the service is not running). This replaces an older hardcoded
# container-name default that contained a per-workstation project
# hash — engineers other than the one who first wrote the script
# would otherwise hit a phantom "container not running" error.
#
# POSTGRES_CONTAINER can still be set explicitly to override, for
# operators running the dev DB outside of this compose file.
if [ -n "${POSTGRES_CONTAINER:-}" ]; then
  CONTAINER="$POSTGRES_CONTAINER"
else
  CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q postgres 2>/dev/null || true)"
fi

if [ -z "$CONTAINER" ]; then
  echo "ERROR: no running postgres container found." >&2
  echo "Start it with: docker compose -f $COMPOSE_FILE up -d postgres" >&2
  echo "Or set POSTGRES_CONTAINER to the exact container name / ID." >&2
  exit 1
fi

# Confirm the container is actually running (ps -q can return a
# stopped container's ID in some compose versions).
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -qx 'true'; then
  echo "ERROR: container '$CONTAINER' exists but is not running." >&2
  echo "Start it with: docker compose -f $COMPOSE_FILE up -d postgres" >&2
  exit 1
fi

echo "Dumping schema from $CONTAINER ($DB_USER@$DB_NAME)..."

# Strip lines that would otherwise produce a phantom diff. Filter
# parity with scripts/ci-schema-check.sh is REQUIRED — the §5.4 CI
# gate diffs local-produced schema.sql against CI-produced output,
# so both scripts must apply the exact same filter chain or the
# gate flaps on every CI run. Any change here needs a mirror change
# in ci-schema-check.sh (and vice versa).
#
#   - `\restrict <token>`   — pg_dump 16+ per-session random token
#   - `\unrestrict <token>` — closing pair of the same
#   - `-- Dumped from database version N.M (...)` — patch version drift
#   - `-- Dumped by pg_dump version N.M (...)`     — client version drift
#
# Everything else pg_dump emits is deterministic given the same
# migration set and major postgres version.
docker exec "$CONTAINER" pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  | grep -v '^\\restrict ' \
  | grep -v '^\\unrestrict ' \
  | grep -v '^-- Dumped from database version ' \
  | grep -v '^-- Dumped by pg_dump version ' \
  > "$OUT"

LINES=$(wc -l < "$OUT")
TABLES=$(grep -c '^CREATE TABLE ' "$OUT" || true)
echo "Wrote $OUT ($LINES lines, $TABLES tables)"
echo "Commit docs/db/schema.sql along with any migration that lands on main."
