# Database Extensions Verification Tests

This directory contains verification tests for RawDrive's PostgreSQL database extensions, specifically for vector similarity search capabilities.

## Overview

These tests verify that the required PostgreSQL extensions are properly installed and enabled:

| Extension | Purpose | Required |
|-----------|---------|----------|
| pgvector | Vector similarity search (embeddings) | Yes |
| pgvectorscale | Enhanced vector indexing (DiskANN) | Recommended |
| timescaledb | Time-series optimization | Optional |

## Prerequisites

1. **PostgreSQL Database**: Running with the `timescale/timescaledb-ha:pg16` Docker image
   
   **Quick Start** (standalone database for local development):
   ```bash
   docker compose -f ../../infrastructure/docker/docker-compose.db.yml up -d
   ```
   
   This image includes:
   - PostgreSQL 16.11
   - pgvector 0.8.1
   - pgvectorscale 0.9.0 (StreamingDiskANN indexes)
   - TimescaleDB 2.24.0

2. **Python Dependencies**:
   ```bash
   pip install asyncpg httpx playwright
   playwright install chromium
   ```

3. **Database Migrations**: Apply via Alembic to enable extensions
   ```bash
   cd backend
   # Set DATABASE_URL in PowerShell
   $env:DATABASE_URL = "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"
   python -m alembic upgrade head
   ```

## Running the Tests

### Direct Execution

```bash
# Full verification (database + API + browser)
python -m tests.verification.test_database_extensions

# Database extensions only (faster)
python -m tests.verification.test_database_extensions --extensions-only

# With custom database URL
python -m tests.verification.test_database_extensions --database-url "postgresql://user:pass@host:5432/db"
```

### Using pytest

```bash
# Run with pytest
pytest tests/verification/test_database_extensions.py -v

# Run with coverage
pytest tests/verification/ --cov=tests.verification
```

## Test Details

### Database Extension Checks

1. **PostgreSQL Version**: Verifies PostgreSQL 15+ (required for pgvectorscale)
2. **pgvector**: Checks if vector extension is installed and enabled
3. **pgvectorscale**: Checks if vectorscale extension is available and enabled
4. **Vector Operations**: Tests basic vector similarity queries
5. **DiskANN Availability**: Tests StreamingDiskANN index creation (if pgvectorscale enabled)

### API Health Check

- Verifies the backend API is running
- Checks the `/health` endpoint responds correctly

### Browser Test (Playwright)

- Verifies API documentation is accessible at `/docs`
- Uses headless Chromium for fast execution

## Expected Output

```
============================================================
Database Extensions Verification
============================================================

i Checking PostgreSQL version...
i   PostgreSQL: PostgreSQL 16.11 on ...
[PASS] PostgreSQL version 16.11 (>= 15 required)
i Checking pgvector extension...
[PASS] pgvector extension enabled (version 0.8.1)
i Checking pgvectorscale extension...
[PASS] pgvectorscale extension enabled (version 0.9.0)
i Checking TimescaleDB extension (optional)...
[PASS] TimescaleDB extension enabled (version 2.24.0)
i Testing vector operations...
[PASS] Vector operations work correctly (cosine similarity)
i Testing StreamingDiskANN index availability...
[PASS] StreamingDiskANN indexes available

============================================================
Verification Summary
============================================================

Core Requirements:
[PASS]   postgresql_version
[PASS]   pgvector

Optional Extensions (recommended):
[PASS]   pgvectorscale
[PASS]   diskann_available

Results: 6/6 checks passed

[PASS] Core requirements satisfied - vector search is available
[PASS] pgvectorscale enabled - StreamingDiskANN indexes available for optimal performance

============================================================
Final Result
============================================================

[PASS] All core verification checks passed!
i pgvectorscale is enabled - you have optimal vector search performance
```

## Troubleshooting

### pgvector not available

Ensure you're using the correct Docker image:

```yaml
# docker-compose.yml
services:
  postgres:
    image: timescale/timescaledb-ha:pg16
```

### pgvectorscale not enabled

Run the Alembic migrations:

```bash
cd backend
alembic upgrade head
```

The migration `0093_enable_pgvectorscale.py` will enable the extension.

### Connection refused

1. Verify PostgreSQL is running:
   ```bash
   docker compose ps
   docker compose logs postgres
   ```

2. Check the connection URL matches your setup

### Browser test fails

Install Playwright browsers:
```bash
playwright install chromium
```

Or skip browser tests:
```bash
python -m tests.verification.test_database_extensions --extensions-only
```

## Integration with CI/CD

Add this to your CI pipeline to verify extensions after deployment:

```yaml
# .github/workflows/verify.yml
- name: Verify Database Extensions
  run: |
    python -m tests.verification.test_database_extensions --extensions-only
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Related Files

- `infrastructure/docker/docker-compose.db.yml` - Standalone PostgreSQL with pgvectorscale (recommended for local dev)
- `backend/src/app/core/database.py` - Database initialization and extension verification
- `backend/migrations/versions/0093_enable_pgvectorscale.py` - pgvectorscale migration
- `infrastructure/docker/docker-compose.yml` - Full stack Docker configuration
- `infrastructure/docker/docker-compose.dev.yml` - Development Docker configuration
- `scripts/check_extensions.py` - Quick extension status checker
