#!/usr/bin/env bash
# ISSUE-005 (brownfield P1): refresh docs/db/schema.sql from the live
# dev database so the repository always has an authoritative
# column-level schema reference alongside the 142 numbered migrations.
#
# Requirements:
#   - Dev docker-compose stack running (docker compose up -d)
#   - Postgres container reachable as cobolt-cobolt-rawdrive-f651e4-postgres-1
#     (this is the compose project's auto-generated name — see
#     _cobolt-docker/docker-compose.yml)
#
# Usage:
#   ./scripts/refresh-schema.sh
#
# Output:
#   docs/db/schema.sql  (overwritten)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT="${REPO_ROOT}/docs/db/schema.sql"

# Container name is the compose_project_name + service + index. The
# compose_project_name has a pre-existing double "cobolt-" prefix
# documented in _cobolt-output/latest/infra/infra-manifest.json.
CONTAINER="${POSTGRES_CONTAINER:-cobolt-cobolt-rawdrive-f651e4-postgres-1}"
DB_USER="${PROJECT_USER:-rawdrive_user}"
DB_NAME="${PROJECT_DB_NAME:-rawdrive_db}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "ERROR: postgres container '$CONTAINER' is not running." >&2
  echo "Start it with: docker compose -f _cobolt-docker/docker-compose.yml up -d postgres" >&2
  exit 1
fi

echo "Dumping schema from $CONTAINER ($DB_USER@$DB_NAME)..."
docker exec "$CONTAINER" pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  -U "$DB_USER" \
  -d "$DB_NAME" > "$OUT"

LINES=$(wc -l < "$OUT")
TABLES=$(grep -c '^CREATE TABLE ' "$OUT" || true)
echo "Wrote $OUT ($LINES lines, $TABLES tables)"
echo "Commit docs/db/schema.sql along with any migration that lands on main."
