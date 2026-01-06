# PostgreSQL Vector Search Setup

This document explains how to set up PostgreSQL with pgvector and pgvectorscale for optimal vector similarity search performance in RawDrive.

## Overview

RawDrive uses PostgreSQL with vector extensions for:

- **Semantic Search**: Natural language photo search powered by embeddings
- **Face Recognition**: Face embedding similarity for people clustering
- **Content Analysis**: Image feature vectors for duplicate detection

## Required Extensions

| Extension | Version | Purpose |
|-----------|---------|---------|
| **pgvector** | 0.8.1+ | Core vector similarity search (required) |
| **pgvectorscale** | 0.9.0+ | StreamingDiskANN indexes for scale (recommended) |
| **TimescaleDB** | 2.24.0+ | Time-series optimization (optional) |

## Quick Start

### Option 1: Standalone Database (Recommended for Local Development)

```bash
# Start PostgreSQL with all extensions
docker compose -f docker-compose.db.yml up -d

# Wait for healthy status
docker compose -f docker-compose.db.yml ps

# Run migrations to enable extensions
cd backend
$env:DATABASE_URL = "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"
python -m alembic upgrade head

# Verify setup
python -m tests.verification.test_database_extensions --extensions-only
```

### Option 2: Full Stack Docker

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

### Option 3: Development Stack

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
```

## Docker Image

RawDrive uses `timescale/timescaledb-ha:pg16` which includes:

- PostgreSQL 16.11
- pgvector 0.8.1
- pgvectorscale 0.9.0
- TimescaleDB 2.24.0

This is the **only supported image** for full vector search capabilities.

## Configuration

### Environment Variables

```bash
# .env
DATABASE_URL=postgresql+asyncpg://rawdrive:rawdrive@localhost:5432/rawdrive
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=rawdrive
POSTGRES_USER=rawdrive
POSTGRES_PASSWORD=rawdrive
```

### Connection Pool Settings

```bash
DB_POOL_MIN_SIZE=1
DB_POOL_MAX_SIZE=10
DB_POOL_MAX_LIFETIME_SEC=1800
```

## Extension Details

### pgvector

Core extension for vector data types and similarity operators:

```sql
-- Enable extension (done via migration 0024)
CREATE EXTENSION IF NOT EXISTS vector;

-- Vector operators
<-> L2 (Euclidean) distance
<=> Cosine distance
<#> Inner product distance
```

### pgvectorscale

Enhanced indexing with StreamingDiskANN:

```sql
-- Enable extension (done via migration 0093)
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;

-- Create DiskANN index for optimal performance
CREATE INDEX ON embeddings USING diskann (embedding);
```

**Benefits:**
- 10-100x faster queries at scale compared to HNSW
- Lower memory footprint
- Better for datasets with millions of vectors

## Migrations

Extensions are enabled via Alembic migrations:

1. **0024**: Enables pgvector (`CREATE EXTENSION vector`)
2. **0093**: Enables pgvectorscale (`CREATE EXTENSION vectorscale`)

Run migrations:
```bash
cd backend
python -m alembic upgrade head
```

## Verification

### Quick Check Script

```bash
python scripts/check_extensions.py
```

Output:
```
=== Available Extensions ===
  timescaledb: 2.24.0
  vector: 0.8.1
  vectorscale: 0.9.0

=== Enabled Extensions ===
  timescaledb: 2.24.0
  vector: 0.8.1
  vectorscale: 0.9.0
```

### Full Verification Test

```bash
python -m tests.verification.test_database_extensions --extensions-only
```

### Pytest Tests

```bash
python -m pytest tests/verification/test_extensions_pytest.py -v
```

## Troubleshooting

### pgvectorscale Not Available

**Cause:** Using standard PostgreSQL image instead of timescaledb-ha

**Solution:** Use the correct Docker image:
```yaml
services:
  postgres:
    image: timescale/timescaledb-ha:pg16
```

### pgvectorscale Not Enabled

**Cause:** Migrations not run or failed

**Solution:**
```bash
cd backend
$env:DATABASE_URL = "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"
python -m alembic upgrade head
```

### Connection Refused

**Cause:** PostgreSQL not running or wrong port

**Solution:**
```bash
# Check container status
docker compose -f docker-compose.db.yml ps

# Check logs
docker compose -f docker-compose.db.yml logs postgres
```

### Port Already in Use

**Cause:** Local PostgreSQL using port 5432

**Solution:**
1. Stop local PostgreSQL service
2. Or change Docker port mapping in docker-compose.db.yml

## Performance Considerations

### Index Selection

| Index Type | Use Case | Memory | Speed |
|------------|----------|--------|-------|
| **DiskANN** | Large datasets (1M+ vectors) | Low | Fastest |
| **HNSW** | Medium datasets | High | Fast |
| **IVFFlat** | Small datasets | Low | Moderate |

### Recommended Settings

For production with large vector datasets:

```sql
-- Use DiskANN for embedding columns
CREATE INDEX idx_photos_embedding ON photos 
  USING diskann (embedding);

-- Increase work_mem for vector operations
SET work_mem = '256MB';
```

## Related Documentation

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [pgvectorscale GitHub](https://github.com/timescale/pgvectorscale)
- [TimescaleDB Docker](https://hub.docker.com/r/timescale/timescaledb-ha)
- [RawDrive Verification Tests](../tests/verification/README.md)
