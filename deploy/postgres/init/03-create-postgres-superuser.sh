#!/bin/sh
# Create the `postgres` superuser role on first boot.
#
# WHY: this cluster is bootstrapped with POSTGRES_USER=rawdrive, so the stock
# image does NOT create a `postgres` role. pgBackRest (archive-push / backup /
# check) and entrypoint maintenance run as the `postgres` OS user (uid 999, owns
# $PGDATA) and connect over the local Unix socket. pg_hba.conf authenticates them
# with `local all postgres peer` — passwordless but NOT `trust` (F-077 forbids
# trust). That peer rule maps the postgres OS user to the `postgres` DB role, so
# the role must exist. pgbackrest.conf sets pg1-user=postgres to match.
#
# Runs after 01-create-extensions.sql / 02-create-replication-role.sh via the
# pgvector image's /docker-entrypoint-initdb.d/ scanner, as the bootstrap
# superuser. Idempotent.

set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'SQL'
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
      CREATE ROLE postgres SUPERUSER LOGIN;
    END IF;
  END
  $$;
SQL
