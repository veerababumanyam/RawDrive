-- RawDrive Database Initialization Script
-- This script is automatically executed by PostgreSQL on container startup

-- Create one_api database if it doesn't exist
SELECT 'CREATE DATABASE one_api'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = 'one_api'
)\gexec

-- Enable pgvector extension on main database
CREATE EXTENSION IF NOT EXISTS pgvector;

-- Log completion
\echo 'RawDrive databases initialized successfully'
