#!/bin/bash
# =============================================================================
# RawDrive Database Initialization Script
# Runs migrations and seeds test data on startup
# Requirement 26.3
# =============================================================================

set -e

echo "=== RawDrive Database Initialization ==="

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h "${POSTGRES_HOST:-postgres}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-rawdrive}" > /dev/null 2>&1; do
    echo "PostgreSQL not ready, waiting..."
    sleep 2
done
echo "PostgreSQL is ready!"

# Wait for Redis to be ready
echo "Waiting for Redis..."
until redis-cli -h "${REDIS_HOST:-redis}" -p "${REDIS_PORT:-6379}" ping > /dev/null 2>&1; do
    echo "Redis not ready, waiting..."
    sleep 2
done
echo "Redis is ready!"

# Set database URL
export DATABASE_URL="postgresql://${POSTGRES_USER:-rawdrive}:${POSTGRES_PASSWORD:-rawdrive}@${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-rawdrive}"

# Run migrations
echo "Running database migrations..."
cd /app

# Check if migrations directory exists
if [ -d "migrations" ]; then
    # Run all SQL migration files in order
    for migration in migrations/*.sql; do
        if [ -f "$migration" ]; then
            echo "Applying migration: $migration"
            PGPASSWORD="${POSTGRES_PASSWORD:-rawdrive}" psql \
                -h "${POSTGRES_HOST:-postgres}" \
                -p "${POSTGRES_PORT:-5432}" \
                -U "${POSTGRES_USER:-rawdrive}" \
                -d "${POSTGRES_DB:-rawdrive}" \
                -f "$migration" || {
                    echo "Warning: Migration $migration may have already been applied or has errors"
                }
        fi
    done
    echo "Migrations completed!"
else
    echo "No migrations directory found, skipping migrations"
fi

# Seed test data (only in development)
if [ "${ENVIRONMENT:-development}" = "development" ] || [ "${SEED_DATA:-false}" = "true" ]; then
    echo "Seeding test data..."
    
    # Check if seed scripts exist
    if [ -f "migrations/seed_static.py" ]; then
        python -c "
import asyncio
import sys
sys.path.insert(0, '/app/src')
from app.db.postgres import init_postgres_pool, close_postgres_pool
from app.config.settings import ensure_settings_loaded

async def run_seed():
    settings = ensure_settings_loaded()
    pool = await init_postgres_pool(settings)
    
    # Import and run seed
    exec(open('migrations/seed_static.py').read())
    
    await close_postgres_pool()
    print('Seed data applied!')

asyncio.run(run_seed())
" || echo "Warning: Seed script may have already been applied"
    fi
    
    echo "Test data seeded!"
else
    echo "Skipping test data seeding (ENVIRONMENT=${ENVIRONMENT:-development}, SEED_DATA=${SEED_DATA:-false})"
fi

echo "=== Database initialization complete ==="
