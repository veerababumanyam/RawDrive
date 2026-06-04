-- Migration 160 rollback.
-- Reverts the role-level session-timeout defaults set by 160, returning the
-- application role to the Postgres default (0 = unlimited) for all three GUCs.
-- Touches no table, column, or index — a pure role-attribute reset.

BEGIN;

ALTER ROLE CURRENT_USER RESET statement_timeout;
ALTER ROLE CURRENT_USER RESET lock_timeout;
ALTER ROLE CURRENT_USER RESET idle_in_transaction_session_timeout;

COMMIT;
