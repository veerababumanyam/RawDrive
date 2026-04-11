-- Initial database extension setup.
-- Runs on first container boot via
-- pgvector/pgvector:pg17's /docker-entrypoint-initdb.d/.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- used by backend for uuid_generate_v4 alternatives
