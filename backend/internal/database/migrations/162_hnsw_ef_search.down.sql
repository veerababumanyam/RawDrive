-- Migration 162 rollback.
-- Reverts the role-level hnsw.ef_search default set by 162, returning the
-- application role to pgvector's built-in default (40). Touches no table.
--
-- The leading `SELECT ... ::vector` forces pgvector's C library to load so the
-- custom hnsw.ef_search GUC is registered before the non-superuser RESET —
-- without it a fresh down-migration session gets "permission denied to set
-- parameter" (same constraint as the up migration).

BEGIN;

SELECT '[3,1,2]'::vector;  -- force pgvector to load so hnsw.ef_search is resettable

ALTER ROLE CURRENT_USER RESET hnsw.ef_search;

COMMIT;
