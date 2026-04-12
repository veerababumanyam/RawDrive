#!/bin/sh
# Create the replication role used by .44 standby.
# Runs after 01-create-extensions.sql via pgvector image's
# /docker-entrypoint-initdb.d/ scanner. Password from env.

set -eu

if [ -z "${POSTGRES_REPLICATION_PASSWORD:-}" ]; then
  echo "FATAL: POSTGRES_REPLICATION_PASSWORD env var required for replica init" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '${POSTGRES_REPLICATION_PASSWORD}';
  SELECT pg_create_physical_replication_slot('replica_44');
SQL
