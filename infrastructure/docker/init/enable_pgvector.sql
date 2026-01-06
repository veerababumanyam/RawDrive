-- Enable pgvector for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pgvectorscale for optimized vector indexing (DiskANN)
-- Requires pgvector to be installed first
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;
