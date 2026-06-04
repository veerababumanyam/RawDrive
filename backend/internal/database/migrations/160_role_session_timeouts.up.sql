-- Migration 160: bound the application role's session timeouts.
--
-- Postgres defaults statement_timeout, lock_timeout, and
-- idle_in_transaction_session_timeout to 0 (unlimited), and nothing set them.
-- That left three classic stall sources unbounded for the app role:
--   * statement_timeout                   — a runaway query pins a pooled conn
--   * lock_timeout                        — a statement waits forever for a lock
--   * idle_in_transaction_session_timeout — an abandoned open tx holds its locks
--
-- These are set as ROLE-LEVEL defaults (ALTER ROLE), NOT app-side pgx
-- RuntimeParams and NOT a session SET, because production fronts Postgres with
-- pgbouncer in pool_mode=transaction (deploy/pgbouncer/pgbouncer.ini):
--   * a statement_timeout STARTUP parameter is rejected by pgbouncer — it sets
--     no ignore_startup_parameters — which would break every connection;
--   * a session-level SET is wiped by server_reset_query = DISCARD ALL between
--     pooled transactions.
-- A role default survives DISCARD ALL (RESET ALL resets TO the role default,
-- not past it) and is applied at every backend session start, so it holds
-- through the pooler and for direct-connect dev alike.
--
-- CURRENT_USER keeps this role-agnostic: prod connects as `rawdrive`, the
-- migrate container shares the backend image/role, and tests use their own
-- role. The values are conservative ceilings that only catch pathological
-- cases; ops can override per-role out of band, and one transaction needing
-- longer can still raise its own bound with SET LOCAL.
--
-- Numbered 160: next free slot after 159 (the worker claimed_at columns from
-- the atomic-lease PRs). Purely a role-attribute change — no table, column, or
-- index is touched; fully reversed by 160_role_session_timeouts.down.sql.

BEGIN;

ALTER ROLE CURRENT_USER SET statement_timeout = '30s';
ALTER ROLE CURRENT_USER SET lock_timeout = '10s';
ALTER ROLE CURRENT_USER SET idle_in_transaction_session_timeout = '60s';

COMMIT;
