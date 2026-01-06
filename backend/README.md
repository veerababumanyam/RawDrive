# RawDrive Backend

FastAPI-based backend for RawDrive authentication, RBAC, workspace management, and platform services.

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 16+ with pgvector and pgvectorscale (use Docker)
- Redis 7+

### Database Setup

```bash
# Start PostgreSQL with required extensions (from project root)
docker compose -f ../infrastructure/docker/docker-compose.db.yml up -d

# This uses timescale/timescaledb-ha:pg16 which includes:
# - PostgreSQL 16
# - pgvector 0.8.1 (vector similarity search)
# - pgvectorscale 0.9.0 (StreamingDiskANN indexes)
# - TimescaleDB 2.24.0
```

### Run Migrations

```bash
# Set environment variable (PowerShell)
$env:DATABASE_URL = "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"

# Run migrations
python -m alembic upgrade head
```

### Verify Extensions

```bash
# Quick check
python scripts/check_extensions.py

# Full verification
python -m tests.verification.test_database_extensions --extensions-only
```

### Run Backend

```bash
# Install dependencies
pip install -r requirements.txt

# Start server
uvicorn src.app.main:app --reload --host 0.0.0.0 --port 8000
```

## Project Structure

```
backend/
├── src/
│   └── app/
│       ├── api/           # API routes
│       ├── core/          # Core config, security, database
│       ├── models/        # SQLAlchemy models
│       ├── schemas/       # Pydantic schemas
│       └── services/      # Business logic
├── migrations/            # Alembic migrations
├── tests/                 # Test suites
└── scripts/               # Utility scripts
```

## Database Extensions

RawDrive requires these PostgreSQL extensions:

| Extension | Purpose | Required |
|-----------|---------|----------|
| pgvector | Vector similarity search | Yes |
| pgvectorscale | DiskANN indexes | Recommended |
| TimescaleDB | Time-series optimization | Optional |

These are automatically enabled via Alembic migration `0093_enable_pgvectorscale.py`.

## Configuration

See `.env.example` for all configuration options. Key settings:

```bash
DATABASE_URL=postgresql+asyncpg://rawdrive:rawdrive@localhost:5432/rawdrive
REDIS_URL=redis://localhost:6379/0
```

## Documentation

- [Database Vector Search Setup](../docs/DATABASE_VECTOR_SEARCH.md)
- [API Documentation](http://localhost:8000/docs) (when running)
- [Architecture Guide](../docs/ARCHITECTURE_QUICK_REFERENCE.md)
